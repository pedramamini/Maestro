/**
 * DocumentGraphView - Main container component for the markdown document graph visualization.
 *
 * Features:
 * - React Flow canvas with custom node types (DocumentNode, ExternalLinkNode)
 * - Controls panel: layout toggle (force/hierarchical), external links toggle, zoom, fit view
 * - Minimap with theme-aware colors
 * - Background pattern (dots) with theme colors
 * - Loading and empty states
 * - Theme-aware styling throughout
 *
 * Performance optimizations:
 * - Viewport culling: only renders nodes and edges visible in the viewport
 *   (enabled via onlyRenderVisibleElements prop) to reduce DOM elements
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Node,
  Edge,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  useReactFlow,
  OnSelectionChangeFunc,
  NodeMouseHandler,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { X, LayoutGrid, Network, ExternalLink, RefreshCw, Maximize2, ChevronDown, Loader2 } from 'lucide-react';
import type { Theme } from '../../types';
import { useLayerStack } from '../../contexts/LayerStackContext';
import { MODAL_PRIORITIES } from '../../constants/modalPriorities';
import { DocumentNode } from './DocumentNode';
import { ExternalLinkNode } from './ExternalLinkNode';
import { buildGraphData, GraphNodeData } from './graphDataBuilder';
import { NodeContextMenu } from './NodeContextMenu';
import {
  applyForceLayout,
  applyHierarchicalLayout,
  createLayoutTransitionFrames,
  saveNodePositions,
  restoreNodePositions,
  hasSavedPositions,
} from './layoutAlgorithms';

/** Default maximum number of nodes to load initially (for performance with large directories) */
const DEFAULT_MAX_NODES = 50;
/** Number of additional nodes to load when clicking "Load more" */
const LOAD_MORE_INCREMENT = 25;

/**
 * Props for the DocumentGraphView component
 */
export interface DocumentGraphViewProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback to close the modal */
  onClose: () => void;
  /** Current theme */
  theme: Theme;
  /** Root directory path to scan for markdown files */
  rootPath: string;
  /** Optional callback when a document node is double-clicked */
  onDocumentOpen?: (filePath: string) => void;
  /** Optional callback when an external link node is double-clicked */
  onExternalLinkOpen?: (url: string) => void;
}

/**
 * Layout type for the graph
 */
type LayoutType = 'force' | 'hierarchical';

/**
 * Register custom node types for React Flow
 */
const nodeTypes = {
  documentNode: DocumentNode,
  externalLinkNode: ExternalLinkNode,
};

/**
 * Inner component that uses React Flow hooks (must be inside ReactFlowProvider)
 */
function DocumentGraphViewInner({
  isOpen,
  onClose,
  theme,
  rootPath,
  onDocumentOpen,
  onExternalLinkOpen,
}: DocumentGraphViewProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [layoutType, setLayoutType] = useState<LayoutType>('force');
  const [includeExternalLinks, setIncludeExternalLinks] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Pagination state for large directories
  const [totalDocuments, setTotalDocuments] = useState(0);
  const [loadedDocuments, setLoadedDocuments] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [maxNodes, setMaxNodes] = useState(DEFAULT_MAX_NODES);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    nodeId: string;
    nodeData: GraphNodeData;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const { registerLayer, unregisterLayer } = useLayerStack();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const { fitView, setCenter, getZoom } = useReactFlow();

  // Register with layer stack for Escape handling
  useEffect(() => {
    if (isOpen) {
      const id = registerLayer({
        type: 'modal',
        priority: MODAL_PRIORITIES.DOCUMENT_GRAPH,
        blocksLowerLayers: true,
        capturesFocus: true,
        focusTrap: 'lenient',
        onEscape: () => onCloseRef.current(),
      });
      return () => unregisterLayer(id);
    }
  }, [isOpen, registerLayer, unregisterLayer]);

  // Focus container on open
  useEffect(() => {
    if (isOpen) {
      containerRef.current?.focus();
    }
  }, [isOpen]);

  // Track animation frame for layout transitions
  const animationFrameRef = useRef<number | null>(null);
  const isAnimatingRef = useRef(false);

  /**
   * Apply layout algorithm to nodes
   */
  const applyLayout = useCallback(
    (rawNodes: Node<GraphNodeData>[], rawEdges: Edge[]): Node<GraphNodeData>[] => {
      if (rawNodes.length === 0) return [];

      if (layoutType === 'hierarchical') {
        return applyHierarchicalLayout(rawNodes, rawEdges, {
          nodeWidth: 280,
          nodeHeight: 120,
          rankDirection: 'TB',
          nodeSeparation: 60,
          rankSeparation: 120,
        });
      } else {
        return applyForceLayout(rawNodes, rawEdges, {
          nodeWidth: 280,
          nodeHeight: 120,
          nodeSeparation: 60,
          centerX: 0,
          centerY: 0,
        });
      }
    },
    [layoutType]
  );

  /**
   * Animate transition between layouts
   */
  const animateLayoutTransition = useCallback(
    (startNodes: Node<GraphNodeData>[], endNodes: Node<GraphNodeData>[], callback?: () => void) => {
      // Cancel any existing animation
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      isAnimatingRef.current = true;
      const frames = createLayoutTransitionFrames(startNodes, endNodes, 20);
      let frameIndex = 0;

      const animate = () => {
        if (frameIndex >= frames.length) {
          isAnimatingRef.current = false;
          callback?.();
          return;
        }

        // Inject theme into frame nodes
        const themedNodes = frames[frameIndex].map((node) => ({
          ...node,
          data: {
            ...node.data,
            theme,
          },
        }));

        setNodes(themedNodes as Node[]);
        frameIndex++;
        animationFrameRef.current = requestAnimationFrame(animate);
      };

      animate();
    },
    [theme, setNodes]
  );

  /**
   * Inject theme into node data for styling
   */
  const injectThemeIntoNodes = useCallback(
    (rawNodes: Node<GraphNodeData>[]): Node<GraphNodeData & { theme: Theme }>[] => {
      return rawNodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          theme,
        },
      }));
    },
    [theme]
  );

  /**
   * Load and build graph data
   */
  const loadGraphData = useCallback(async (resetPagination = true) => {
    setLoading(true);
    setError(null);

    // Reset maxNodes when doing a fresh load
    if (resetPagination) {
      setMaxNodes(DEFAULT_MAX_NODES);
    }

    try {
      const graphData = await buildGraphData({
        rootPath,
        includeExternalLinks,
        maxNodes: resetPagination ? DEFAULT_MAX_NODES : maxNodes,
      });

      // Update pagination state
      setTotalDocuments(graphData.totalDocuments);
      setLoadedDocuments(graphData.loadedDocuments);
      setHasMore(graphData.hasMore);

      // Check for saved positions first
      let layoutedNodes: Node<GraphNodeData>[];
      if (hasSavedPositions(rootPath)) {
        layoutedNodes = restoreNodePositions(rootPath, graphData.nodes);
      } else {
        // Apply layout algorithm
        layoutedNodes = applyLayout(graphData.nodes, graphData.edges);
      }

      // Inject theme
      const themedNodes = injectThemeIntoNodes(layoutedNodes);

      setNodes(themedNodes as Node[]);
      setEdges(graphData.edges);

      // Fit view after nodes are set
      setTimeout(() => {
        fitView({ padding: 0.1, duration: 300 });
      }, 50);
    } catch (err) {
      console.error('Failed to build graph data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load document graph');
    } finally {
      setLoading(false);
    }
  }, [rootPath, includeExternalLinks, maxNodes, applyLayout, injectThemeIntoNodes, setNodes, setEdges, fitView]);

  // Load data when modal opens or settings change
  useEffect(() => {
    if (isOpen) {
      loadGraphData();
    }
  }, [isOpen, loadGraphData]);

  // Re-apply theme when it changes
  useEffect(() => {
    if (!loading && nodes.length > 0) {
      const themedNodes = nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          theme,
        },
      }));
      setNodes(themedNodes);
    }
  }, [theme]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Handle selection change - track selected node for edge highlighting
   */
  const handleSelectionChange: OnSelectionChangeFunc = useCallback(({ nodes: selectedNodes }) => {
    if (selectedNodes.length > 0) {
      setSelectedNodeId(selectedNodes[0].id);
    } else {
      setSelectedNodeId(null);
    }
  }, []);

  /**
   * Handle node double-click for opening documents/links
   */
  const handleNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: Node<GraphNodeData>) => {
      if (node.data.nodeType === 'document' && onDocumentOpen) {
        onDocumentOpen(node.data.filePath);
      } else if (node.data.nodeType === 'external' && onExternalLinkOpen) {
        // Open the first URL if multiple
        const urls = node.data.urls;
        if (urls.length > 0) {
          onExternalLinkOpen(urls[0]);
        }
      }
    },
    [onDocumentOpen, onExternalLinkOpen]
  );

  /**
   * Handle node right-click for context menu
   */
  const handleNodeContextMenu: NodeMouseHandler = useCallback(
    (event: React.MouseEvent, node: Node<GraphNodeData>) => {
      // Prevent default browser context menu
      event.preventDefault();
      // Close any existing context menu first
      setContextMenu(null);
      // Open context menu at mouse position
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        nodeId: node.id,
        nodeData: node.data,
      });
    },
    []
  );

  /**
   * Handle pane click to close context menu
   */
  const handlePaneClick = useCallback(() => {
    setContextMenu(null);
  }, []);

  /**
   * Handle focus action from context menu - centers view on node
   */
  const handleFocusNode = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (node) {
        // Calculate center position of the node (assuming 280x120 size for documents)
        const nodeWidth = node.type === 'documentNode' ? 280 : 160;
        const nodeHeight = node.type === 'documentNode' ? 120 : 50;
        const centerX = node.position.x + nodeWidth / 2;
        const centerY = node.position.y + nodeHeight / 2;
        // Use current zoom level or default to 1
        const zoom = getZoom() || 1;
        setCenter(centerX, centerY, { zoom, duration: 300 });
      }
    },
    [nodes, setCenter, getZoom]
  );

  /**
   * Handle open action from context menu
   */
  const handleContextMenuOpen = useCallback(
    (filePath: string) => {
      if (onDocumentOpen) {
        onDocumentOpen(filePath);
      }
    },
    [onDocumentOpen]
  );

  /**
   * Handle open external action from context menu
   */
  const handleContextMenuOpenExternal = useCallback(
    (url: string) => {
      if (onExternalLinkOpen) {
        onExternalLinkOpen(url);
      }
    },
    [onExternalLinkOpen]
  );

  /**
   * Edge styling based on type and selection
   * Edges connected to selected node are highlighted with accent color
   */
  const styledEdges = useMemo(() => {
    return edges.map((edge) => {
      // Check if this edge is connected to the selected node
      const isConnectedToSelected =
        selectedNodeId !== null &&
        (edge.source === selectedNodeId || edge.target === selectedNodeId);

      return {
        ...edge,
        style: {
          stroke: isConnectedToSelected
            ? theme.colors.accent
            : theme.colors.textDim,
          strokeWidth: isConnectedToSelected ? 2.5 : 1.5,
          strokeDasharray: edge.type === 'external' ? '4 4' : undefined,
          transition: 'stroke 0.2s ease, stroke-width 0.2s ease',
        },
        animated: edge.type === 'external',
        // Bring connected edges to the front
        zIndex: isConnectedToSelected ? 1000 : 0,
      };
    });
  }, [edges, theme.colors, selectedNodeId]);

  /**
   * Handle layout toggle with animated transition
   */
  const handleLayoutToggle = useCallback(() => {
    const newLayoutType = layoutType === 'force' ? 'hierarchical' : 'force';
    setLayoutType(newLayoutType);

    // Re-layout with animation if we have nodes
    if (nodes.length > 0 && !isAnimatingRef.current) {
      // Strip theme from nodes for layout calculation
      const currentNodes = nodes.map((node) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { theme: _, ...data } = node.data as GraphNodeData & { theme: Theme };
        return {
          ...node,
          data: data as GraphNodeData,
        };
      });

      // Apply the new layout
      const newLayoutedNodes =
        newLayoutType === 'hierarchical'
          ? applyHierarchicalLayout(currentNodes, edges, {
              nodeWidth: 280,
              nodeHeight: 120,
              rankDirection: 'TB',
              nodeSeparation: 60,
              rankSeparation: 120,
            })
          : applyForceLayout(currentNodes, edges, {
              nodeWidth: 280,
              nodeHeight: 120,
              nodeSeparation: 60,
              centerX: 0,
              centerY: 0,
            });

      // Animate the transition
      animateLayoutTransition(currentNodes, newLayoutedNodes, () => {
        // Save positions after animation completes
        saveNodePositions(rootPath, newLayoutedNodes);
        // Fit view after animation
        fitView({ padding: 0.1, duration: 300 });
      });
    }
  }, [layoutType, nodes, edges, animateLayoutTransition, rootPath, fitView]);

  /**
   * Handle external links toggle
   */
  const handleExternalLinksToggle = useCallback(() => {
    setIncludeExternalLinks((prev) => !prev);
  }, []);

  /**
   * Handle node drag end - save positions
   */
  const handleNodeDragStop = useCallback(() => {
    // Strip theme from nodes before saving
    const nodesToSave = nodes.map((node) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { theme: _, ...data } = node.data as GraphNodeData & { theme: Theme };
      return {
        ...node,
        data: data as GraphNodeData,
      };
    });
    saveNodePositions(rootPath, nodesToSave);
  }, [nodes, rootPath]);

  // Cleanup animation frame on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  /**
   * Handle fit view button
   */
  const handleFitView = useCallback(() => {
    fitView({ padding: 0.1, duration: 300 });
  }, [fitView]);

  /**
   * Handle load more button - loads additional nodes
   */
  const handleLoadMore = useCallback(async () => {
    if (!hasMore || loadingMore) return;

    setLoadingMore(true);
    const newMaxNodes = maxNodes + LOAD_MORE_INCREMENT;
    setMaxNodes(newMaxNodes);

    try {
      const graphData = await buildGraphData({
        rootPath,
        includeExternalLinks,
        maxNodes: newMaxNodes,
      });

      // Update pagination state
      setTotalDocuments(graphData.totalDocuments);
      setLoadedDocuments(graphData.loadedDocuments);
      setHasMore(graphData.hasMore);

      // Apply layout to new nodes
      const layoutedNodes = applyLayout(graphData.nodes, graphData.edges);

      // Inject theme
      const themedNodes = injectThemeIntoNodes(layoutedNodes);

      setNodes(themedNodes as Node[]);
      setEdges(graphData.edges);

      // Save positions for the new layout
      saveNodePositions(rootPath, layoutedNodes);
    } catch (err) {
      console.error('Failed to load more documents:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, maxNodes, rootPath, includeExternalLinks, applyLayout, injectThemeIntoNodes, setNodes, setEdges]);

  if (!isOpen) return null;

  const documentCount = nodes.filter((n) => n.type === 'documentNode').length;
  const externalCount = nodes.filter((n) => n.type === 'externalLinkNode').length;

  return (
    <div
      className="fixed inset-0 modal-overlay flex items-center justify-center z-[9999] animate-in fade-in duration-100"
      onClick={onClose}
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Document Graph"
        className="rounded-xl shadow-2xl border overflow-hidden flex flex-col outline-none"
        style={{
          backgroundColor: theme.colors.bgActivity,
          borderColor: theme.colors.border,
          width: '85vw',
          maxWidth: '1600px',
          height: '85vh',
          maxHeight: '950px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-6 py-4 border-b flex items-center justify-between flex-shrink-0"
          style={{ borderColor: theme.colors.border }}
        >
          <div className="flex items-center gap-3">
            <Network className="w-5 h-5" style={{ color: theme.colors.accent }} />
            <h2 className="text-lg font-semibold" style={{ color: theme.colors.textMain }}>
              Document Graph
            </h2>
            <span
              className="text-xs px-2 py-0.5 rounded"
              style={{
                backgroundColor: `${theme.colors.accent}20`,
                color: theme.colors.textDim,
              }}
            >
              {rootPath}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Layout Toggle */}
            <button
              onClick={handleLayoutToggle}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors"
              style={{
                backgroundColor: `${theme.colors.accent}15`,
                color: theme.colors.textMain,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = `${theme.colors.accent}25`)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = `${theme.colors.accent}15`)}
              title={`Switch to ${layoutType === 'force' ? 'hierarchical' : 'force-directed'} layout`}
            >
              {layoutType === 'force' ? <LayoutGrid className="w-4 h-4" /> : <Network className="w-4 h-4" />}
              {layoutType === 'force' ? 'Hierarchical' : 'Force'}
            </button>

            {/* External Links Toggle */}
            <button
              onClick={handleExternalLinksToggle}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors"
              style={{
                backgroundColor: includeExternalLinks ? `${theme.colors.accent}25` : `${theme.colors.accent}10`,
                color: includeExternalLinks ? theme.colors.accent : theme.colors.textDim,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = `${theme.colors.accent}30`)}
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = includeExternalLinks
                  ? `${theme.colors.accent}25`
                  : `${theme.colors.accent}10`)
              }
              title={includeExternalLinks ? 'Hide external links' : 'Show external links'}
            >
              <ExternalLink className="w-4 h-4" />
              External
            </button>

            {/* Refresh Button */}
            <button
              onClick={() => loadGraphData()}
              className="p-1.5 rounded transition-colors"
              style={{ color: theme.colors.textDim }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = `${theme.colors.accent}20`)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              title="Refresh graph"
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            {/* Fit View Button */}
            <button
              onClick={handleFitView}
              className="p-1.5 rounded transition-colors"
              style={{ color: theme.colors.textDim }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = `${theme.colors.accent}20`)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              title="Fit view"
            >
              <Maximize2 className="w-4 h-4" />
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-1.5 rounded transition-colors"
              style={{ color: theme.colors.textDim }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = `${theme.colors.accent}20`)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              title="Close (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main Content - React Flow Canvas */}
        <div className="flex-1 relative" style={{ backgroundColor: theme.colors.bgMain }}>
          {loading ? (
            <div
              className="h-full flex items-center justify-center"
              style={{ color: theme.colors.textDim }}
            >
              <RefreshCw className="w-6 h-6 animate-spin mr-2" />
              Scanning documents...
            </div>
          ) : error ? (
            <div
              className="h-full flex flex-col items-center justify-center gap-4"
              style={{ color: theme.colors.textDim }}
            >
              <p>Failed to load document graph</p>
              <p className="text-sm opacity-70">{error}</p>
              <button
                onClick={() => loadGraphData()}
                className="px-4 py-2 rounded text-sm"
                style={{
                  backgroundColor: theme.colors.accent,
                  color: theme.colors.bgMain,
                }}
              >
                Retry
              </button>
            </div>
          ) : nodes.length === 0 ? (
            <div
              className="h-full flex flex-col items-center justify-center gap-2"
              style={{ color: theme.colors.textDim }}
            >
              <Network className="w-12 h-12 opacity-30" />
              <p className="text-lg">No markdown files found</p>
              <p className="text-sm opacity-70">This directory doesn't contain any .md files</p>
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={styledEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onSelectionChange={handleSelectionChange}
              onNodeDoubleClick={handleNodeDoubleClick}
              onNodeContextMenu={handleNodeContextMenu}
              onPaneClick={handlePaneClick}
              onNodeDragStop={handleNodeDragStop}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.1 }}
              minZoom={0.1}
              maxZoom={2}
              defaultEdgeOptions={{
                type: 'smoothstep',
              }}
              proOptions={{ hideAttribution: true }}
              // Performance optimization: only render nodes and edges visible in the viewport
              // This reduces DOM elements and improves performance for large graphs
              onlyRenderVisibleElements={true}
            >
              {/* Background Pattern */}
              <Background
                variant={BackgroundVariant.Dots}
                gap={20}
                size={1}
                color={theme.colors.border}
              />

              {/* Controls */}
              <Controls
                showZoom={true}
                showFitView={true}
                showInteractive={false}
                style={{
                  backgroundColor: theme.colors.bgActivity,
                  borderColor: theme.colors.border,
                  borderRadius: 8,
                }}
              />

              {/* Minimap */}
              <MiniMap
                nodeColor={(node) => {
                  if (node.type === 'documentNode') return theme.colors.accent;
                  if (node.type === 'externalLinkNode') return theme.colors.textDim;
                  return theme.colors.border;
                }}
                nodeStrokeWidth={2}
                pannable
                zoomable
                style={{
                  backgroundColor: theme.colors.bgSidebar,
                  borderColor: theme.colors.border,
                  borderRadius: 8,
                }}
              />
            </ReactFlow>
          )}

          {/* Context Menu */}
          {contextMenu && (
            <NodeContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              theme={theme}
              nodeData={contextMenu.nodeData}
              nodeId={contextMenu.nodeId}
              onOpen={handleContextMenuOpen}
              onOpenExternal={handleContextMenuOpenExternal}
              onFocus={handleFocusNode}
              onDismiss={() => setContextMenu(null)}
            />
          )}
        </div>

        {/* Footer */}
        <div
          className="px-6 py-3 border-t flex items-center justify-between text-xs flex-shrink-0"
          style={{
            borderColor: theme.colors.border,
            color: theme.colors.textDim,
          }}
        >
          <div className="flex items-center gap-3">
            <span>
              {documentCount > 0
                ? `${documentCount}${totalDocuments > loadedDocuments ? ` of ${totalDocuments}` : ''} document${documentCount !== 1 ? 's' : ''}${
                    includeExternalLinks && externalCount > 0 ? `, ${externalCount} external domain${externalCount !== 1 ? 's' : ''}` : ''
                  }`
                : 'No documents found'}
            </span>
            {/* Load More Button */}
            {hasMore && (
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors"
                style={{
                  backgroundColor: theme.colors.accent,
                  color: theme.colors.bgMain,
                  opacity: loadingMore ? 0.7 : 1,
                  cursor: loadingMore ? 'wait' : 'pointer',
                }}
                onMouseEnter={(e) => !loadingMore && (e.currentTarget.style.opacity = '0.85')}
                onMouseLeave={(e) => !loadingMore && (e.currentTarget.style.opacity = '1')}
                title={`Load ${Math.min(LOAD_MORE_INCREMENT, totalDocuments - loadedDocuments)} more documents`}
              >
                {loadingMore ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
                {loadingMore ? 'Loading...' : `Load more (${totalDocuments - loadedDocuments} remaining)`}
              </button>
            )}
          </div>
          <span style={{ opacity: 0.7 }}>Double-click to open • Right-click for menu • Drag to move • Scroll to zoom • Esc to close</span>
        </div>
      </div>
    </div>
  );
}

/**
 * DocumentGraphView component wrapped with ReactFlowProvider
 */
export function DocumentGraphView(props: DocumentGraphViewProps) {
  if (!props.isOpen) return null;

  return (
    <ReactFlowProvider>
      <DocumentGraphViewInner {...props} />
    </ReactFlowProvider>
  );
}

export default DocumentGraphView;
