import React, { useEffect, useRef } from 'react';
import { ChevronRight, ChevronDown, ChevronUp, Folder } from 'lucide-react';
import type { Session, Theme, FileChangeType } from '../types';
import { getFileIcon } from '../utils/theme';
import { useLayerStack } from '../contexts/LayerStackContext';
import { MODAL_PRIORITIES } from '../constants/modalPriorities';

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
  setSessions: React.Dispatch<React.SetStateAction<Session[]>>;
}

export function FileExplorerPanel(props: FileExplorerPanelProps) {
  const {
    session, theme, fileTreeFilter, setFileTreeFilter, fileTreeFilterOpen, setFileTreeFilterOpen,
    filteredFileTree, selectedFileIndex, setSelectedFileIndex, activeFocus, activeRightTab,
    previewFile, setActiveFocus, fileTreeContainerRef, fileTreeFilterInputRef, toggleFolder, handleFileClick, expandAllFolders,
    collapseAllFolders, updateSessionWorkingDirectory, setSessions
  } = props;

  const { registerLayer, unregisterLayer, updateLayerHandler } = useLayerStack();
  const layerIdRef = useRef<string>();

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
            className={`flex items-center gap-2 py-1 text-xs cursor-pointer hover:bg-white/5 px-2 rounded transition-colors border-l-2 select-none ${isSelected ? 'bg-white/10' : ''}`}
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
              isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />
            )}
            {isFolder ? <Folder className="w-3.5 h-3.5" style={{ color: theme.colors.accent }} /> : getFileIcon(change?.type, theme)}
            <span className={change ? 'font-medium' : ''}>{node.name}</span>
            {change && (
              <span
                className="ml-auto text-[9px] px-1 rounded uppercase"
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
    <div className="space-y-2">
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
        className="sticky top-0 z-10 flex items-center justify-between text-xs font-bold pt-4 pb-2 mb-2 -mx-4 px-4"
        style={{
          backgroundColor: theme.colors.bgSidebar,
          borderLeft: activeFocus === 'right' && activeRightTab === 'files' ? `1px solid ${theme.colors.accent}` : 'none',
          borderRight: activeFocus === 'right' && activeRightTab === 'files' ? `1px solid ${theme.colors.accent}` : 'none'
        }}
      >
        <span className="opacity-50">{session.cwd}</span>
        <div className="flex items-center gap-1">
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
    </div>
  );
}
