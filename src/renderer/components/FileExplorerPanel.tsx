import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, ChevronDown, ChevronUp, Folder, RefreshCw, Check } from 'lucide-react';
import type { Session, Theme, FileChangeType } from '../types';
import type { FileTreeChanges } from '../utils/fileExplorer';
import { getFileIcon } from '../utils/theme';
import { useLayerStack } from '../contexts/LayerStackContext';
import { MODAL_PRIORITIES } from '../constants/modalPriorities';

// Auto-refresh interval options in seconds
const AUTO_REFRESH_OPTIONS = [
  { label: 'Every 5 seconds', value: 5 },
  { label: 'Every 20 seconds', value: 20 },
  { label: 'Every 60 seconds', value: 60 },
  { label: 'Every 3 minutes', value: 180 },
];

interface FileNode {
  name: string;
  type: 'file' | 'folder';
  children?: FileNode[];
}

interface FileExplorerPanelProps {
  session: Session;
  theme: Theme;
  fileTreeFilter: string;
  setFileTreeFilter: (filter: string) => void;
  fileTreeFilterOpen: boolean;
  setFileTreeFilterOpen: (open: boolean) => void;
  filteredFileTree: FileNode[];
  selectedFileIndex: number;
  setSelectedFileIndex: (index: number) => void;
  activeFocus: string;
  activeRightTab: string;
  previewFile: {name: string; content: string; path: string} | null;
  setActiveFocus: (focus: string) => void;
  fileTreeContainerRef?: React.RefObject<HTMLDivElement>;
  fileTreeFilterInputRef?: React.RefObject<HTMLInputElement>;
  toggleFolder: (path: string, activeSessionId: string, setSessions: React.Dispatch<React.SetStateAction<Session[]>>) => void;
  handleFileClick: (node: any, path: string, activeSession: Session) => Promise<void>;
  expandAllFolders: (activeSessionId: string, activeSession: Session, setSessions: React.Dispatch<React.SetStateAction<Session[]>>) => void;
  collapseAllFolders: (activeSessionId: string, setSessions: React.Dispatch<React.SetStateAction<Session[]>>) => void;
  updateSessionWorkingDirectory: (activeSessionId: string, setSessions: React.Dispatch<React.SetStateAction<Session[]>>) => Promise<void>;
  refreshFileTree: (sessionId: string) => Promise<FileTreeChanges | undefined>;
  setSessions: React.Dispatch<React.SetStateAction<Session[]>>;
  onAutoRefreshChange?: (interval: number) => void;
}

export function FileExplorerPanel(props: FileExplorerPanelProps) {
  const {
    session, theme, fileTreeFilter, setFileTreeFilter, fileTreeFilterOpen, setFileTreeFilterOpen,
    filteredFileTree, selectedFileIndex, setSelectedFileIndex, activeFocus, activeRightTab,
    previewFile, setActiveFocus, fileTreeContainerRef, fileTreeFilterInputRef, toggleFolder, handleFileClick, expandAllFolders,
    collapseAllFolders, updateSessionWorkingDirectory, refreshFileTree, setSessions, onAutoRefreshChange
  } = props;

  const { registerLayer, unregisterLayer, updateLayerHandler } = useLayerStack();
  const layerIdRef = useRef<string>();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const flashTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Refresh overlay state
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [overlayPosition, setOverlayPosition] = useState<{ top: number; left: number } | null>(null);
  const refreshButtonRef = useRef<HTMLButtonElement>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isOverOverlayRef = useRef(false);
  const autoRefreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Get current auto-refresh interval from session
  const autoRefreshInterval = session.fileTreeAutoRefreshInterval || 0;

  // Handle refresh with animation and flash notification
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    // Clear any existing flash message
    if (flashTimeoutRef.current) {
      clearTimeout(flashTimeoutRef.current);
      flashTimeoutRef.current = null;
    }
    setFlashMessage(null);

    try {
      const changes = await refreshFileTree(session.id);

      // Show flash notification with change count
      if (changes) {
        const message = changes.totalChanges === 0
          ? 'No changes detected'
          : `Detected ${changes.totalChanges} change${changes.totalChanges === 1 ? '' : 's'}`;
        setFlashMessage(message);

        // Auto-hide after 2 seconds
        flashTimeoutRef.current = setTimeout(() => {
          setFlashMessage(null);
          flashTimeoutRef.current = null;
        }, 2000);
      }
    } finally {
      // Keep spinner visible for at least 500ms for visual feedback
      setTimeout(() => setIsRefreshing(false), 500);
    }
  }, [refreshFileTree, session.id]);

  // Silent refresh for auto-refresh (no flash notification)
  const silentRefresh = useCallback(async () => {
    await refreshFileTree(session.id);
  }, [refreshFileTree, session.id]);

  // Auto-refresh timer
  useEffect(() => {
    // Clear existing timer
    if (autoRefreshTimerRef.current) {
      clearInterval(autoRefreshTimerRef.current);
      autoRefreshTimerRef.current = null;
    }

    // Start new timer if interval is set
    if (autoRefreshInterval > 0) {
      autoRefreshTimerRef.current = setInterval(() => {
        silentRefresh();
      }, autoRefreshInterval * 1000);
    }

    // Cleanup on unmount or interval change
    return () => {
      if (autoRefreshTimerRef.current) {
        clearInterval(autoRefreshTimerRef.current);
        autoRefreshTimerRef.current = null;
      }
    };
  }, [autoRefreshInterval, silentRefresh]);

  // Cleanup flash timeout on unmount
  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current) {
        clearTimeout(flashTimeoutRef.current);
      }
    };
  }, []);

  // Hover handlers for refresh button overlay
  const handleRefreshMouseEnter = useCallback(() => {
    hoverTimeoutRef.current = setTimeout(() => {
      if (refreshButtonRef.current) {
        const rect = refreshButtonRef.current.getBoundingClientRect();
        setOverlayPosition({ top: rect.bottom + 4, left: rect.right });
      }
      setOverlayOpen(true);
    }, 400);
  }, []);

  const handleRefreshMouseLeave = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    // Delay closing to allow mouse to reach overlay
    hoverTimeoutRef.current = setTimeout(() => {
      if (!isOverOverlayRef.current) {
        setOverlayOpen(false);
      }
    }, 100);
  }, []);

  const handleOverlayMouseEnter = useCallback(() => {
    isOverOverlayRef.current = true;
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  }, []);

  const handleOverlayMouseLeave = useCallback(() => {
    isOverOverlayRef.current = false;
    setOverlayOpen(false);
  }, []);

  const handleIntervalSelect = useCallback((interval: number) => {
    onAutoRefreshChange?.(interval);
    setOverlayOpen(false);
  }, [onAutoRefreshChange]);

  // Register layer when filter is open
  useEffect(() => {
    if (fileTreeFilterOpen) {
      const id = registerLayer({
        type: 'overlay',
        priority: MODAL_PRIORITIES.FILE_TREE_FILTER,
        blocksLowerLayers: false,
        capturesFocus: true,
        focusTrap: 'none',
        onEscape: () => {
          setFileTreeFilterOpen(false);
          setFileTreeFilter('');
        },
        allowClickOutside: true,
        ariaLabel: 'File Tree Filter'
      });
      layerIdRef.current = id;
      return () => unregisterLayer(id);
    }
  }, [fileTreeFilterOpen, registerLayer, unregisterLayer]);

  // Update handler when dependencies change
  useEffect(() => {
    if (fileTreeFilterOpen && layerIdRef.current) {
      updateLayerHandler(layerIdRef.current, () => {
        setFileTreeFilterOpen(false);
        setFileTreeFilter('');
      });
    }
  }, [fileTreeFilterOpen, setFileTreeFilterOpen, setFileTreeFilter, updateLayerHandler]);

  const renderTree = (nodes: FileNode[], currentPath = '', depth = 0, globalIndex = { value: 0 }) => {
    const expandedSet = new Set(session.fileExplorerExpanded || []);
    return nodes.map((node, idx) => {
      const fullPath = currentPath ? `${currentPath}/${node.name}` : node.name;
      const absolutePath = `${session.fullPath}/${fullPath}`;
      const change = session.changedFiles.find(f => f.path.includes(node.name));
      const isFolder = node.type === 'folder';
      const isExpanded = expandedSet.has(fullPath);
      const isSelected = previewFile?.path === absolutePath;
      const currentIndex = globalIndex.value;
      const isKeyboardSelected = activeFocus === 'right' && activeRightTab === 'files' && currentIndex === selectedFileIndex;
      globalIndex.value++;

      return (
        <div key={idx} className={depth > 0 ? "ml-3 border-l pl-2" : ""} style={{ borderColor: theme.colors.border }}>
          <div
            data-file-index={currentIndex}
            className={`flex items-center gap-2 py-1 text-xs cursor-pointer hover:bg-white/5 px-2 rounded transition-colors border-l-2 select-none min-w-0 ${isSelected ? 'bg-white/10' : ''}`}
            style={{
              color: change ? theme.colors.textMain : theme.colors.textDim,
              borderLeftColor: isKeyboardSelected ? theme.colors.accent : 'transparent',
              backgroundColor: isKeyboardSelected ? theme.colors.bgActivity : (isSelected ? 'rgba(255,255,255,0.1)' : 'transparent')
            }}
            onClick={() => {
              if (isFolder) {
                toggleFolder(fullPath, session.id, setSessions);
              } else {
                setSelectedFileIndex(currentIndex);
                setActiveFocus('right');
              }
            }}
            onDoubleClick={() => {
              if (!isFolder) {
                handleFileClick(node, fullPath, session);
              }
            }}
          >
            {isFolder && (
              isExpanded ? <ChevronDown className="w-3 h-3 flex-shrink-0" /> : <ChevronRight className="w-3 h-3 flex-shrink-0" />
            )}
            <span className="flex-shrink-0">{isFolder ? <Folder className="w-3.5 h-3.5" style={{ color: theme.colors.accent }} /> : getFileIcon(change?.type, theme)}</span>
            <span className={`truncate min-w-0 flex-1 ${change ? 'font-medium' : ''}`} title={node.name}>{node.name}</span>
            {change && (
              <span
                className="flex-shrink-0 text-[9px] px-1 rounded uppercase"
                style={{
                  backgroundColor: change.type === 'added' ? theme.colors.success + '20' : change.type === 'deleted' ? theme.colors.error + '20' : theme.colors.warning + '20',
                  color: change.type === 'added' ? theme.colors.success : change.type === 'deleted' ? theme.colors.error : theme.colors.warning
                }}
              >
                {change.type}
              </span>
            )}
          </div>
          {isFolder && isExpanded && node.children && renderTree(node.children, fullPath, depth + 1, globalIndex)}
        </div>
      );
    });
  };

  return (
    <div className="space-y-2 relative">
      {/* Flash notification for refresh results */}
      {flashMessage && (
        <div
          className="absolute inset-x-0 top-16 z-20 flex justify-center pointer-events-none"
          style={{
            animation: 'fadeInOut 2s ease-in-out forwards',
          }}
        >
          <style>
            {`
              @keyframes fadeInOut {
                0% { opacity: 0; transform: translateY(-8px); }
                15% { opacity: 1; transform: translateY(0); }
                85% { opacity: 1; transform: translateY(0); }
                100% { opacity: 0; transform: translateY(-8px); }
              }
            `}
          </style>
          <div
            className="px-4 py-2 rounded-lg shadow-lg text-xs font-medium"
            style={{
              backgroundColor: theme.colors.bgActivity,
              color: theme.colors.textMain,
              border: `1px solid ${theme.colors.border}`,
            }}
          >
            {flashMessage}
          </div>
        </div>
      )}

      {/* File Tree Filter */}
      {fileTreeFilterOpen && (
        <div className="mb-3 pt-4">
          <input
            ref={fileTreeFilterInputRef}
            autoFocus
            type="text"
            placeholder="Filter files..."
            value={fileTreeFilter}
            onChange={(e) => setFileTreeFilter(e.target.value)}
            className="w-full px-3 py-2 rounded border bg-transparent outline-none text-sm"
            style={{ borderColor: theme.colors.accent, color: theme.colors.textMain }}
          />
        </div>
      )}

      {/* Header with CWD and controls */}
      <div
        className="sticky top-0 z-10 flex items-center justify-between gap-2 text-xs font-bold pt-4 pb-2 mb-2 min-w-0"
        style={{
          backgroundColor: theme.colors.bgSidebar
        }}
      >
        <span className="opacity-50 truncate min-w-0 flex-1" title={session.cwd}>{session.cwd}</span>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            ref={refreshButtonRef}
            onClick={handleRefresh}
            onMouseEnter={handleRefreshMouseEnter}
            onMouseLeave={handleRefreshMouseLeave}
            className="p-1 rounded hover:bg-white/10 transition-colors"
            title={autoRefreshInterval > 0 ? `Auto-refresh every ${autoRefreshInterval}s` : "Refresh file tree"}
            style={{
              color: autoRefreshInterval > 0 ? theme.colors.accent : theme.colors.textDim,
              backgroundColor: autoRefreshInterval > 0 ? `${theme.colors.accent}20` : 'transparent'
            }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => expandAllFolders(session.id, session, setSessions)}
            className="p-1 rounded hover:bg-white/10 transition-colors"
            title="Expand all folders"
            style={{ color: theme.colors.textDim }}
          >
            <div className="flex flex-col items-center -space-y-1.5">
              <ChevronUp className="w-3.5 h-3.5" />
              <ChevronDown className="w-3.5 h-3.5" />
            </div>
          </button>
          <button
            onClick={() => collapseAllFolders(session.id, setSessions)}
            className="p-1 rounded hover:bg-white/10 transition-colors"
            title="Collapse all folders"
            style={{ color: theme.colors.textDim }}
          >
            <div className="flex flex-col items-center -space-y-1.5">
              <ChevronDown className="w-3.5 h-3.5" />
              <ChevronUp className="w-3.5 h-3.5" />
            </div>
          </button>
        </div>
      </div>

      {/* File tree content */}
      {session.fileTreeError ? (
        <div className="flex flex-col items-center justify-center gap-3 py-8">
          <div className="text-xs text-center" style={{ color: theme.colors.error }}>
            {session.fileTreeError}
          </div>
          <button
            onClick={() => updateSessionWorkingDirectory(session.id, setSessions)}
            className="flex items-center gap-2 px-3 py-2 rounded border hover:bg-white/5 transition-colors text-xs"
            style={{ borderColor: theme.colors.border, color: theme.colors.textMain }}
          >
            <Folder className="w-4 h-4" />
            Select New Directory
          </button>
        </div>
      ) : (
        <>
          {(!session.fileTree || session.fileTree.length === 0) && (
            <div className="text-xs opacity-50 italic">Loading files...</div>
          )}
          {filteredFileTree && renderTree(filteredFileTree)}
          {fileTreeFilter && filteredFileTree && filteredFileTree.length === 0 && (
            <div className="text-xs opacity-50 italic text-center py-4">No files match your search</div>
          )}
        </>
      )}

      {/* Auto-refresh overlay - rendered via portal */}
      {overlayOpen && overlayPosition && createPortal(
        <div
          className="fixed z-[100] rounded-lg shadow-xl border overflow-hidden"
          style={{
            backgroundColor: theme.colors.bgSidebar,
            borderColor: theme.colors.border,
            minWidth: '180px',
            top: overlayPosition.top,
            left: overlayPosition.left,
            transform: 'translateX(-100%)'
          }}
          onMouseEnter={handleOverlayMouseEnter}
          onMouseLeave={handleOverlayMouseLeave}
        >
          {/* Header */}
          <div
            className="px-3 py-2 text-xs font-medium border-b"
            style={{
              backgroundColor: theme.colors.bgActivity,
              borderColor: theme.colors.border,
              color: theme.colors.textMain
            }}
          >
            Auto-refresh
          </div>

          {/* Options */}
          <div className="p-1">
            {AUTO_REFRESH_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => handleIntervalSelect(option.value)}
                className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-xs hover:bg-white/10 transition-colors"
                style={{
                  color: autoRefreshInterval === option.value ? theme.colors.accent : theme.colors.textMain,
                  backgroundColor: autoRefreshInterval === option.value ? `${theme.colors.accent}15` : 'transparent'
                }}
              >
                <span>{option.label}</span>
                {autoRefreshInterval === option.value && (
                  <Check className="w-3.5 h-3.5" style={{ color: theme.colors.accent }} />
                )}
              </button>
            ))}

            {/* Disable option - only shown when auto-refresh is active */}
            {autoRefreshInterval > 0 && (
              <>
                <div
                  className="my-1 border-t"
                  style={{ borderColor: theme.colors.border }}
                />
                <button
                  onClick={() => handleIntervalSelect(0)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-white/10 transition-colors"
                  style={{ color: theme.colors.textDim }}
                >
                  Disable auto-refresh
                </button>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
