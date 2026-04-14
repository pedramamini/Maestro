/**
 * CuePipelineEditor — React Flow-based visual pipeline editor for Maestro Cue.
 *
 * Thin shell that wires three hooks (usePipelineState, usePipelineSelection)
 * and three components (PipelineToolbar, PipelineCanvas, PipelineContextMenu).
 * Retains canvas-specific callbacks (onNodesChange, onConnect, onDrop, keyboard
 * shortcuts, context menu handlers) that are tightly coupled to ReactFlow.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
	ReactFlowProvider,
	useReactFlow,
	useNodesInitialized,
	applyNodeChanges,
	type Node,
	type Edge,
	type NodeChange,
	type OnNodesChange,
	type OnEdgesChange,
	type Connection,
} from 'reactflow';
import type { Theme } from '../../types';
import type {
	CueGraphSession,
	TriggerNodeData,
	AgentNodeData,
	CueEventType,
	PipelineNode,
	CuePipeline,
} from '../../../shared/cue-pipeline-types';
import { getNextPipelineColor } from './pipelineColors';
import {
	convertToReactFlowNodes,
	convertToReactFlowEdges,
	computePipelineYOffsets,
} from './utils/pipelineGraph';
import { usePipelineState, DEFAULT_TRIGGER_LABELS } from '../../hooks/cue/usePipelineState';
import type { SessionInfo, ActiveRunInfo } from '../../hooks/cue/usePipelineState';
import { usePipelineSelection } from '../../hooks/cue/usePipelineSelection';
import { PipelineToolbar } from './PipelineToolbar';
import { PipelineCanvas } from './PipelineCanvas';
import { PipelineContextMenu, type ContextMenuState } from './PipelineContextMenu';
import { DEFAULT_EVENT_PROMPTS } from './cueEventConstants';

export { validatePipelines, DEFAULT_TRIGGER_LABELS } from '../../hooks/cue/usePipelineState';
export type { SessionInfo, ActiveRunInfo } from '../../hooks/cue/usePipelineState';

export interface CuePipelineEditorProps {
	sessions: SessionInfo[];
	groups?: { id: string; name: string; emoji: string }[];
	graphSessions: CueGraphSession[];
	onSwitchToSession: (id: string) => void;
	onClose: () => void;
	theme: Theme;
	activeRuns?: ActiveRunInfo[];
	/** Callback to manually trigger a pipeline by name */
	onTriggerPipeline?: (pipelineName: string) => void;
}

/** Bridges the circular dependency between usePipelineState and usePipelineSelection. */
function useSelectionRef() {
	return useRef({
		selectedNodePipelineId: null as string | null,
		selectedEdgePipelineId: null as string | null,
		setSelectedNodeId: (() => {}) as React.Dispatch<React.SetStateAction<string | null>>,
		setSelectedEdgeId: (() => {}) as React.Dispatch<React.SetStateAction<string | null>>,
	});
}

function CuePipelineEditorInner({
	sessions,
	groups,
	graphSessions,
	onSwitchToSession,
	theme,
	activeRuns: activeRunsProp,
	onTriggerPipeline,
}: CuePipelineEditorProps) {
	const reactFlowInstance = useReactFlow();

	// Local drawer/context-menu state
	const [triggerDrawerOpen, setTriggerDrawerOpen] = useState(false);
	const [agentDrawerOpen, setAgentDrawerOpen] = useState(false);
	const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

	// Bridge ref: usePipelineState needs selection IDs, but usePipelineSelection
	// needs pipelineState. We use a ref so state hook reads latest selection values
	// without creating a hook ordering issue. On first render both are null (correct).
	const selectionRef = useSelectionRef();

	const stateHook = usePipelineState({
		sessions,
		graphSessions,
		activeRuns: activeRunsProp,
		reactFlowInstance,
		selectedNodePipelineId: selectionRef.current.selectedNodePipelineId,
		selectedEdgePipelineId: selectionRef.current.selectedEdgePipelineId,
		setSelectedNodeId: selectionRef.current.setSelectedNodeId,
		setSelectedEdgeId: selectionRef.current.setSelectedEdgeId,
		setTriggerDrawerOpen,
		setAgentDrawerOpen,
	});

	const selectionHook = usePipelineSelection({
		pipelineState: stateHook.pipelineState,
	});

	// Update ref so state hook gets fresh values on next render
	selectionRef.current = {
		selectedNodePipelineId: selectionHook.selectedNodePipelineId,
		selectedEdgePipelineId: selectionHook.selectedEdgePipelineId,
		setSelectedNodeId: selectionHook.setSelectedNodeId,
		setSelectedEdgeId: selectionHook.setSelectedEdgeId,
	};

	const {
		pipelineState,
		setPipelineState,
		isAllPipelinesView,
		isDirty,
		setIsDirty,
		saveStatus,
		validationErrors,
		cueSettings,
		setCueSettings,
		showSettings,
		setShowSettings,
		runningPipelineIds,
		persistLayout,
		pendingSavedViewportRef,
		handleSave,
		handleDiscard,
		createPipeline,
		deletePipeline,
		renamePipeline,
		selectPipeline,
		changePipelineColor,
		onUpdateNode,
		onUpdateEdgePrompt,
		onDeleteNode,
		onUpdateEdge,
		onDeleteEdge,
	} = stateHook;

	// Stable Y-offsets for the "All Pipelines" view.
	//
	// In this view, pipelines are stacked vertically using computed offsets so
	// they don't overlap. These offsets are a VIEW-LAYER concern: they affect
	// how ReactFlow positions are derived from (and mapped back to) canonical
	// pipeline-state positions. Both convertToReactFlowNodes (display) and
	// onNodesChange (write-back) must use the SAME offsets on every frame,
	// otherwise nodes jump or vanish.
	//
	// We recompute offsets only when the pipeline structure changes (pipelines
	// added/removed, nodes added/removed) — NOT on every position change.
	// This prevents the feedback loop where dragging a node changes the
	// bounding box and shifts all pipelines below.
	const pipelineStructureKey = useMemo(
		() =>
			pipelineState.pipelines
				.map((p) => `${p.id}:${p.nodes.length}:${p.nodes.map((n) => n.id).join(',')}`)
				.join('|'),
		[pipelineState.pipelines]
	);
	const stableYOffsets = useMemo(
		() => computePipelineYOffsets(pipelineState.pipelines, pipelineState.selectedPipelineId),

		[pipelineStructureKey, pipelineState.selectedPipelineId]
	);

	const {
		selectedNodeId,
		setSelectedNodeId,
		selectedEdgeId,
		setSelectedEdgeId,
		selectedNode,
		selectedNodePipelineId,
		selectedNodeHasOutgoingEdge,
		hasIncomingAgentEdges,
		incomingAgentEdgeCount,
		incomingTriggerEdges,
		selectedEdge,
		selectedEdgePipelineId,
		selectedEdgePipelineColor,
		edgeSourceNode,
		edgeTargetNode,
		onCanvasSessionIds,
		onNodeClick,
		onEdgeClick,
		onPaneClick,
		handleConfigureNode,
	} = selectionHook;

	// The per-node "Configure" icon calls this directly via node data, bypassing
	// onNodeClick. In All Pipelines view everything is read-only, so we refuse
	// to open the edit panel. Declared here (before computedNodes) so the memo
	// embeds the stable guarded callback.
	const handleConfigureNodeGuarded = useCallback(
		(compositeId: string) => {
			if (isAllPipelinesView) return;
			handleConfigureNode(compositeId);
		},
		[isAllPipelinesView, handleConfigureNode]
	);

	// ─── ReactFlow nodes/edges ───────────────────────────────────────────────

	// Compute canonical nodes from pipeline state. This is the "source of truth"
	// for node data, but ReactFlow needs its own mutable copy for smooth dragging.
	const computedNodes = useMemo(
		() =>
			convertToReactFlowNodes(
				pipelineState.pipelines,
				pipelineState.selectedPipelineId,
				handleConfigureNodeGuarded,
				{
					onTriggerPipeline,
					isSaved: !isDirty,
					runningPipelineIds,
				},
				theme,
				stableYOffsets
			),
		[
			pipelineState.pipelines,
			pipelineState.selectedPipelineId,
			handleConfigureNodeGuarded,
			onTriggerPipeline,
			isDirty,
			runningPipelineIds,
			theme,
			stableYOffsets,
		]
	);

	// Local display nodes that ReactFlow controls directly. During drag,
	// applyNodeChanges updates this state (cheap setState, no useMemo recompute).
	// On drag end, positions sync back to pipelineState.
	const [displayNodes, setDisplayNodes] = useState<Node[]>(computedNodes);
	useEffect(() => {
		setDisplayNodes(computedNodes);
	}, [computedNodes]);

	// Alias for the rest of the component
	const nodes = displayNodes;

	const edges = useMemo(
		() =>
			convertToReactFlowEdges(
				pipelineState.pipelines,
				pipelineState.selectedPipelineId,
				runningPipelineIds,
				selectedEdgeId,
				theme
			),
		[
			pipelineState.pipelines,
			pipelineState.selectedPipelineId,
			runningPipelineIds,
			selectedEdgeId,
			theme,
		]
	);

	// ─── Fit/center view on pipeline selection change ───────────────────────
	// When switching between "All Pipelines" and a single pipeline (or between
	// two different pipelines), center the viewport on the visible nodes.
	//
	// No node-level filtering is needed: convertToReactFlowNodes already
	// renders only the selected pipeline's nodes (or all in "All Pipelines"
	// view), so fitView() without a filter centers on exactly the right set.
	//
	// The 150ms delay accounts for the React render cycle:
	//   selectedPipelineId changes → computedNodes recomputes →
	//   setDisplayNodes(computedNodes) schedules a render →
	//   ReactFlow processes the new nodes → fitView can measure them.
	// Skip the first change (mount hydration) so we don't overwrite the
	// saved viewport restored by usePipelineLayout.
	const prevSelectedIdRef = useRef(pipelineState.selectedPipelineId);
	const hasHydratedSelectionRef = useRef(false);
	useEffect(() => {
		if (prevSelectedIdRef.current === pipelineState.selectedPipelineId) return;
		prevSelectedIdRef.current = pipelineState.selectedPipelineId;

		// Skip the initial hydration — let usePipelineLayout restore the saved viewport
		if (!hasHydratedSelectionRef.current) {
			hasHydratedSelectionRef.current = true;
			return;
		}

		const timer = setTimeout(() => {
			reactFlowInstance.fitView({ padding: 0.2, duration: 300 });
		}, 150);
		return () => clearTimeout(timer);
	}, [pipelineState.selectedPipelineId, reactFlowInstance]);

	// ─── Initial viewport (saved viewport OR fit view) ──────────────────────
	// Two distinct paths with different timing requirements:
	//
	//   - Saved viewport: a pure (x, y, zoom) restore. setViewport doesn't read
	//     node geometry, so it can — and SHOULD — fire immediately on mount.
	//     Waiting for nodesInitialized would briefly show the wrong viewport
	//     before snapping to the saved one.
	//   - fitView fallback: computes bounds from rendered node dimensions. Must
	//     wait for `useNodesInitialized()` — fitting before measurement
	//     completes produced the original "canvas appears empty on first open"
	//     symptom (selection-change fitView later "fixed" it because nodes
	//     were measured by then).
	const nodesInitialized = useNodesInitialized();
	const hasInitialFitRef = useRef(false);
	useEffect(() => {
		if (hasInitialFitRef.current) return;
		const saved = pendingSavedViewportRef.current;
		if (saved) {
			// Restore immediately — setViewport doesn't depend on measurement.
			pendingSavedViewportRef.current = null;
			reactFlowInstance.setViewport(saved);
			hasInitialFitRef.current = true;
			return;
		}
		// fitView path: must wait for nodes to be measured.
		if (!nodesInitialized || computedNodes.length === 0) return;
		reactFlowInstance.fitView({ padding: 0.15, duration: 200 });
		hasInitialFitRef.current = true;
	}, [nodesInitialized, computedNodes.length, reactFlowInstance, pendingSavedViewportRef]);

	// ─── Canvas callbacks ────────────────────────────────────────────────────

	// Ref mirror so onNodesChange reads the latest stable offsets without
	// adding them as a dependency (which would recreate the callback and
	// break ReactFlow memoisation).
	const stableYOffsetsRef = useRef(stableYOffsets);
	stableYOffsetsRef.current = stableYOffsets;

	// Apply ALL node changes (including mid-drag) to the local displayNodes
	// so ReactFlow can render smooth dragging. Position commits to the
	// canonical pipelineState happen in onNodeDragStop instead, because
	// ReactFlow may fire the drag-end change without a position property.
	const onNodesChange: OnNodesChange = useCallback((changes: NodeChange[]) => {
		setDisplayNodes((nds) => applyNodeChanges(changes, nds));
	}, []);

	// Commit final positions to canonical pipelineState when drag ends.
	// ReactFlow's onNodeDragStop reliably provides the final node with its
	// position, unlike onNodesChange which may omit position on drag end.
	//
	// In All Pipelines view everything is locked in place — even if ReactFlow
	// somehow fired a drag-stop (shouldn't, since `nodesDraggable={false}`),
	// we refuse to mutate canonical state.
	const onNodeDragStop = useCallback(
		(_event: React.MouseEvent, _node: Node, draggedNodes: Node[]) => {
			if (isAllPipelinesView) return;
			if (draggedNodes.length === 0) return;

			setPipelineState((prev) => {
				const isAllPipelines = prev.selectedPipelineId === null;
				const yOffsets = stableYOffsetsRef.current;

				// Build a lookup from composite ID → final position
				const finalPositions = new Map<string, { x: number; y: number }>();
				for (const dn of draggedNodes) {
					if (dn.position) finalPositions.set(dn.id, dn.position);
				}

				const newPipelines = prev.pipelines.map((pipeline) => {
					const yOffset = isAllPipelines ? (yOffsets.get(pipeline.id) ?? 0) : 0;
					return {
						...pipeline,
						nodes: pipeline.nodes.map((pNode) => {
							const newPos = finalPositions.get(`${pipeline.id}:${pNode.id}`);
							if (!newPos) return pNode;
							return {
								...pNode,
								position: isAllPipelines ? { x: newPos.x, y: newPos.y - yOffset } : newPos,
							};
						}),
					};
				});
				return { ...prev, pipelines: newPipelines };
			});

			persistLayout();
		},
		[isAllPipelinesView, persistLayout, setPipelineState]
	);

	const onEdgesChange: OnEdgesChange = useCallback(() => {}, []);

	const onConnect = useCallback(
		(connection: Connection) => {
			if (isAllPipelinesView) return;
			if (!connection.source || !connection.target) return;

			const sourcePipelineId = connection.source.split(':')[0];
			const targetPipelineId = connection.target.split(':')[0];
			if (sourcePipelineId !== targetPipelineId) return;

			const sourceNodeId = connection.source.split(':').slice(1).join(':');
			const targetNodeId = connection.target.split(':').slice(1).join(':');

			setPipelineState((prev) => {
				const pipeline = prev.pipelines.find((p) => p.id === sourcePipelineId);
				if (!pipeline) return prev;

				const sourceNode = pipeline.nodes.find((n) => n.id === sourceNodeId);
				const targetNode = pipeline.nodes.find((n) => n.id === targetNodeId);
				if (!targetNode || targetNode.type === 'trigger') return prev;

				const newEdge = {
					id: `edge-${Date.now()}`,
					source: sourceNodeId,
					target: targetNodeId,
					mode: 'pass' as const,
				};

				// Auto-populate default prompt when connecting a GitHub trigger to an agent
				// that doesn't have a prompt yet
				let updatedNodes = pipeline.nodes;
				if (sourceNode?.type === 'trigger' && targetNode.type === 'agent') {
					const triggerData = sourceNode.data as TriggerNodeData;
					const agentData = targetNode.data as AgentNodeData;
					const defaultPrompt = DEFAULT_EVENT_PROMPTS[triggerData.eventType];
					const hasExistingPrompt = !!agentData.inputPrompt?.trim();
					const hasEdgePrompts = pipeline.edges.some(
						(e) => e.target === targetNodeId && !!e.prompt?.trim()
					);

					if (defaultPrompt && !hasExistingPrompt && !hasEdgePrompts) {
						updatedNodes = pipeline.nodes.map((n) => {
							if (n.id !== targetNodeId) return n;
							return {
								...n,
								data: { ...n.data, inputPrompt: defaultPrompt },
							};
						});
					}
				}

				return {
					...prev,
					pipelines: prev.pipelines.map((p) => {
						if (p.id !== sourcePipelineId) return p;
						return { ...p, nodes: updatedNodes, edges: [...p.edges, newEdge] };
					}),
				};
			});
		},
		[isAllPipelinesView, setPipelineState]
	);

	const isValidConnection = useCallback(
		(connection: Connection) => {
			if (isAllPipelinesView) return false;
			if (!connection.source || !connection.target) return false;
			if (connection.source === connection.target) return false;

			const sourceNode = nodes.find((n) => n.id === connection.source);
			const targetNode = nodes.find((n) => n.id === connection.target);
			if (!sourceNode || !targetNode) return false;

			if (sourceNode.type === 'trigger' && targetNode.type === 'trigger') return false;
			if (targetNode.type === 'trigger') return false;

			const exists = edges.some(
				(e) => e.source === connection.source && e.target === connection.target
			);
			if (exists) return false;

			return true;
		},
		[isAllPipelinesView, nodes, edges]
	);

	const onDragOver = useCallback((event: React.DragEvent) => {
		event.preventDefault();
		event.stopPropagation();
		event.dataTransfer.dropEffect = 'move';
	}, []);

	const onDrop = useCallback(
		(event: React.DragEvent) => {
			event.preventDefault();
			event.stopPropagation();

			// All Pipelines view is read-only — refuse to place new nodes.
			// The toolbar disables the drawer buttons in this view, but a drag
			// from an already-open drawer (possible if the view changed mid-drag)
			// must still be rejected here.
			if (isAllPipelinesView) return;

			const raw = event.dataTransfer.getData('application/cue-pipeline');
			if (!raw) return;

			let dropData: {
				type: string;
				eventType?: CueEventType;
				label?: string;
				sessionId?: string;
				sessionName?: string;
				toolType?: string;
			};
			try {
				dropData = JSON.parse(raw);
			} catch {
				return;
			}

			const position = reactFlowInstance.screenToFlowPosition({
				x: event.clientX,
				y: event.clientY,
			});

			setPipelineState((prev) => {
				let targetPipeline: CuePipeline;
				let pipelines = prev.pipelines;
				const selectedId = prev.selectedPipelineId;

				if (selectedId) {
					const found = pipelines.find((p) => p.id === selectedId);
					if (found) {
						targetPipeline = found;
					} else {
						return prev;
					}
				} else if (pipelines.length > 0) {
					targetPipeline = pipelines[0];
				} else {
					targetPipeline = {
						id: `pipeline-${Date.now()}`,
						name: 'Pipeline 1',
						color: getNextPipelineColor([]),
						nodes: [],
						edges: [],
					};
					pipelines = [targetPipeline];
				}

				let newNode: PipelineNode;

				if (dropData.type === 'trigger' && dropData.eventType) {
					const triggerData: TriggerNodeData = {
						eventType: dropData.eventType,
						label:
							dropData.label ?? DEFAULT_TRIGGER_LABELS[dropData.eventType] ?? dropData.eventType,
						config: {},
					};
					newNode = {
						id: `trigger-${Date.now()}`,
						type: 'trigger',
						position,
						data: triggerData,
					};
				} else if (dropData.type === 'agent' && dropData.sessionId) {
					const agentData: AgentNodeData = {
						sessionId: dropData.sessionId,
						sessionName: dropData.sessionName ?? 'Agent',
						toolType: dropData.toolType ?? 'unknown',
					};
					newNode = {
						id: `agent-${dropData.sessionId}-${Date.now()}`,
						type: 'agent',
						position,
						data: agentData,
					};
				} else {
					return prev;
				}

				const updatedPipelines = pipelines.map((p) => {
					if (p.id === targetPipeline.id) {
						return { ...p, nodes: [...p.nodes, newNode] };
					}
					return p;
				});

				if (!pipelines.some((p) => p.id === targetPipeline.id)) {
					targetPipeline.nodes.push(newNode);
					updatedPipelines.push(targetPipeline);
				}

				const compositeId = `${targetPipeline.id}:${newNode.id}`;
				setTimeout(() => {
					setSelectedNodeId(compositeId);
					setSelectedEdgeId(null);
				}, 50);

				return {
					pipelines: updatedPipelines,
					selectedPipelineId: prev.selectedPipelineId ?? targetPipeline.id,
				};
			});
		},
		[isAllPipelinesView, reactFlowInstance, setPipelineState, setSelectedNodeId, setSelectedEdgeId]
	);

	// ─── Keyboard shortcuts ──────────────────────────────────────────────────

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement;
			const isInput =
				target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';

			if (e.key === 'Delete' || e.key === 'Backspace') {
				if (isInput) return;
				// All Pipelines view is read-only — no deletions.
				// (Save via Cmd+S and Escape-to-deselect remain available.)
				if (isAllPipelinesView) return;
				if (selectedNode && selectedNodePipelineId) {
					e.preventDefault();
					onDeleteNode(selectedNode.id);
				} else if (selectedEdge && selectedEdgePipelineId) {
					e.preventDefault();
					onDeleteEdge(selectedEdge.id);
				}
			} else if (e.key === 'Escape') {
				if (triggerDrawerOpen) {
					setTriggerDrawerOpen(false);
				} else if (agentDrawerOpen) {
					setAgentDrawerOpen(false);
				} else if (selectedNodeId || selectedEdgeId) {
					setSelectedNodeId(null);
					setSelectedEdgeId(null);
				}
			} else if (e.key === 's' && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				handleSave();
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [
		isAllPipelinesView,
		selectedNode,
		selectedNodePipelineId,
		selectedEdge,
		selectedEdgePipelineId,
		selectedNodeId,
		selectedEdgeId,
		onDeleteNode,
		onDeleteEdge,
		triggerDrawerOpen,
		agentDrawerOpen,
		handleSave,
		setSelectedNodeId,
		setSelectedEdgeId,
	]);

	// ─── Context menu handlers ───────────────────────────────────────────────

	// In All Pipelines view, right-clicking a node does nothing — the context
	// menu's actions (Configure/Delete/Duplicate) are all editing operations.
	const onNodeContextMenu = useCallback(
		(event: React.MouseEvent, node: Node) => {
			event.preventDefault();
			if (isAllPipelinesView) return;
			const sepIdx = node.id.indexOf(':');
			if (sepIdx === -1) return;
			const pipelineId = node.id.substring(0, sepIdx);
			const nodeId = node.id.substring(sepIdx + 1);
			setContextMenu({
				x: event.clientX,
				y: event.clientY,
				nodeId,
				pipelineId,
				nodeType: node.type as 'trigger' | 'agent',
			});
		},
		[isAllPipelinesView]
	);

	// All three handlers re-check isAllPipelinesView even though onNodeContextMenu
	// also blocks open: a context menu opened in the per-pipeline view stays
	// rendered if the user switches to All Pipelines mode while it's open, and
	// without the guard the still-clickable Configure/Delete/Duplicate items
	// would mutate state that isn't editable in the All Pipelines view.
	const handleContextMenuConfigure = useCallback(() => {
		if (!contextMenu) return;
		if (isAllPipelinesView) {
			setContextMenu(null);
			return;
		}
		setSelectedNodeId(`${contextMenu.pipelineId}:${contextMenu.nodeId}`);
		setSelectedEdgeId(null);
		setContextMenu(null);
	}, [contextMenu, isAllPipelinesView, setSelectedNodeId, setSelectedEdgeId]);

	const handleContextMenuDelete = useCallback(() => {
		if (!contextMenu) return;
		if (isAllPipelinesView) {
			setContextMenu(null);
			return;
		}
		setPipelineState((prev) => ({
			...prev,
			pipelines: prev.pipelines.map((p) => {
				if (p.id !== contextMenu.pipelineId) return p;
				return {
					...p,
					nodes: p.nodes.filter((n) => n.id !== contextMenu.nodeId),
					edges: p.edges.filter(
						(e) => e.source !== contextMenu.nodeId && e.target !== contextMenu.nodeId
					),
				};
			}),
		}));
		setSelectedNodeId(null);
		setContextMenu(null);
	}, [contextMenu, isAllPipelinesView, setPipelineState, setSelectedNodeId]);

	const handleContextMenuDuplicate = useCallback(() => {
		if (!contextMenu || contextMenu.nodeType !== 'trigger') return;
		if (isAllPipelinesView) {
			setContextMenu(null);
			return;
		}
		setPipelineState((prev) => {
			const pipeline = prev.pipelines.find((p) => p.id === contextMenu.pipelineId);
			if (!pipeline) return prev;
			const original = pipeline.nodes.find((n) => n.id === contextMenu.nodeId);
			if (!original || original.type !== 'trigger') return prev;
			const newNode: PipelineNode = {
				id: `trigger-${Date.now()}`,
				type: 'trigger',
				position: { x: original.position.x + 50, y: original.position.y + 50 },
				data: { ...(original.data as TriggerNodeData) },
			};
			return {
				...prev,
				pipelines: prev.pipelines.map((p) => {
					if (p.id !== contextMenu.pipelineId) return p;
					return { ...p, nodes: [...p.nodes, newNode] };
				}),
			};
		});
		setContextMenu(null);
	}, [contextMenu, isAllPipelinesView, setPipelineState]);

	// ─── Read-only click wrappers for All Pipelines view ───────────────────
	// Clicking a node/edge normally sets selection, which opens the node or
	// edge config panel with editable fields. In All Pipelines view nothing
	// is editable, so short-circuit selection at the source. Any pre-existing
	// selection from before the view switch is additionally guarded at panel
	// render time in PipelineCanvas.
	const onNodeClickGuarded = useCallback(
		(event: React.MouseEvent, node: Node) => {
			if (isAllPipelinesView) return;
			onNodeClick(event, node);
		},
		[isAllPipelinesView, onNodeClick]
	);
	const onEdgeClickGuarded = useCallback(
		(event: React.MouseEvent, edge: Edge) => {
			if (isAllPipelinesView) return;
			onEdgeClick(event, edge);
		},
		[isAllPipelinesView, onEdgeClick]
	);

	// ─── Render ──────────────────────────────────────────────────────────────

	return (
		<div className="flex-1 flex flex-col" style={{ width: '100%', height: '100%' }}>
			<PipelineToolbar
				theme={theme}
				isAllPipelinesView={isAllPipelinesView}
				triggerDrawerOpen={triggerDrawerOpen}
				setTriggerDrawerOpen={setTriggerDrawerOpen}
				agentDrawerOpen={agentDrawerOpen}
				setAgentDrawerOpen={setAgentDrawerOpen}
				showSettings={showSettings}
				setShowSettings={setShowSettings}
				pipelines={pipelineState.pipelines}
				selectedPipelineId={pipelineState.selectedPipelineId}
				selectPipeline={selectPipeline}
				createPipeline={createPipeline}
				deletePipeline={deletePipeline}
				renamePipeline={renamePipeline}
				changePipelineColor={changePipelineColor}
				isDirty={isDirty}
				saveStatus={saveStatus}
				handleSave={handleSave}
				handleDiscard={handleDiscard}
				validationErrors={validationErrors}
			/>

			<PipelineCanvas
				theme={theme}
				nodes={nodes}
				edges={edges}
				isReadOnly={isAllPipelinesView}
				onNodesChange={onNodesChange}
				onEdgesChange={onEdgesChange}
				onConnect={onConnect}
				isValidConnection={isValidConnection}
				onNodeClick={onNodeClickGuarded}
				onEdgeClick={onEdgeClickGuarded}
				onPaneClick={onPaneClick}
				onNodeContextMenu={onNodeContextMenu}
				onNodeDragStop={onNodeDragStop}
				onDragOver={onDragOver}
				onDrop={onDrop}
				triggerDrawerOpen={triggerDrawerOpen}
				setTriggerDrawerOpen={setTriggerDrawerOpen}
				agentDrawerOpen={agentDrawerOpen}
				setAgentDrawerOpen={setAgentDrawerOpen}
				sessions={sessions}
				groups={groups}
				onCanvasSessionIds={onCanvasSessionIds}
				pipelineCount={pipelineState.pipelines.length}
				createPipeline={createPipeline}
				selectedPipelineId={pipelineState.selectedPipelineId}
				pipelines={pipelineState.pipelines}
				selectPipeline={selectPipeline}
				showSettings={showSettings}
				cueSettings={cueSettings}
				setCueSettings={setCueSettings}
				setShowSettings={setShowSettings}
				setIsDirty={setIsDirty}
				selectedNode={selectedNode}
				selectedEdge={selectedEdge}
				selectedNodeHasOutgoingEdge={selectedNodeHasOutgoingEdge}
				hasIncomingAgentEdges={hasIncomingAgentEdges}
				incomingAgentEdgeCount={incomingAgentEdgeCount}
				incomingTriggerEdges={incomingTriggerEdges}
				onUpdateNode={onUpdateNode}
				onUpdateEdgePrompt={onUpdateEdgePrompt}
				onDeleteNode={onDeleteNode}
				onSwitchToSession={onSwitchToSession}
				triggerDrawerOpenForConfig={triggerDrawerOpen}
				agentDrawerOpenForConfig={agentDrawerOpen}
				edgeSourceNode={edgeSourceNode}
				edgeTargetNode={edgeTargetNode}
				selectedEdgePipelineColor={selectedEdgePipelineColor}
				onUpdateEdge={onUpdateEdge}
				onDeleteEdge={onDeleteEdge}
				onTriggerPipeline={onTriggerPipeline}
				isDirty={isDirty}
				runningPipelineIds={runningPipelineIds}
			/>

			{contextMenu && (
				<PipelineContextMenu
					contextMenu={contextMenu}
					theme={theme}
					onConfigure={handleContextMenuConfigure}
					onDelete={handleContextMenuDelete}
					onDuplicate={handleContextMenuDuplicate}
					onDismiss={() => setContextMenu(null)}
				/>
			)}
		</div>
	);
}

export function CuePipelineEditor(props: CuePipelineEditorProps) {
	return (
		<ReactFlowProvider>
			<CuePipelineEditorInner {...props} />
		</ReactFlowProvider>
	);
}
