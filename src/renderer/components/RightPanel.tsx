import React, { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { PanelRightClose, PanelRightOpen, Loader2 } from 'lucide-react';
import type { Session, Theme, RightPanelTab, Shortcut, BatchRunState } from '../types';
import type { FileTreeChanges } from '../utils/fileExplorer';
import { FileExplorerPanel } from './FileExplorerPanel';
import { HistoryPanel, HistoryPanelHandle } from './HistoryPanel';
import { AutoRun, AutoRunHandle } from './AutoRun';
import { formatShortcutKeys } from '../utils/shortcutFormatter';

export interface RightPanelHandle {
  refreshHistoryPanel: () => void;
  focusAutoRun: () => void;
}

interface RightPanelProps {
  // Session & Theme
  session: Session | null;
  theme: Theme;
  shortcuts: Record<string, Shortcut>;

  // Panel state
  rightPanelOpen: boolean;
  setRightPanelOpen: (open: boolean) => void;
  rightPanelWidth: number;
  setRightPanelWidthState: (width: number) => void;

  // Tab state
  activeRightTab: RightPanelTab;
  setActiveRightTab: (tab: RightPanelTab) => void;

  // Focus management
  activeFocus: string;
  setActiveFocus: (focus: string) => void;

  // File explorer state & handlers
  fileTreeFilter: string;
  setFileTreeFilter: (filter: string) => void;
  fileTreeFilterOpen: boolean;
  setFileTreeFilterOpen: (open: boolean) => void;
  filteredFileTree: any[];
  selectedFileIndex: number;
  setSelectedFileIndex: (index: number) => void;
  previewFile: {name: string; content: string; path: string} | null;
  fileTreeContainerRef: React.RefObject<HTMLDivElement>;
  fileTreeFilterInputRef: React.RefObject<HTMLInputElement>;

  // File explorer handlers
  toggleFolder: (path: string, activeSessionId: string, setSessions: React.Dispatch<React.SetStateAction<Session[]>>) => void;
  handleFileClick: (node: any, path: string, activeSession: Session) => Promise<void>;
  expandAllFolders: (activeSessionId: string, activeSession: Session, setSessions: React.Dispatch<React.SetStateAction<Session[]>>) => void;
  collapseAllFolders: (activeSessionId: string, setSessions: React.Dispatch<React.SetStateAction<Session[]>>) => void;
  updateSessionWorkingDirectory: (activeSessionId: string, setSessions: React.Dispatch<React.SetStateAction<Session[]>>) => Promise<void>;
  refreshFileTree: (sessionId: string) => Promise<FileTreeChanges | undefined>;
  setSessions: React.Dispatch<React.SetStateAction<Session[]>>;
  onAutoRefreshChange?: (interval: number) => void;
  onShowFlash?: (message: string) => void;

  // Auto Run handlers
  autoRunDocumentList: string[];        // List of document filenames (without .md)
  autoRunDocumentTree?: Array<{ name: string; type: 'file' | 'folder'; path: string; children?: unknown[] }>;  // Tree structure for subfolders
  autoRunContent: string;               // Content of currently selected document
  autoRunIsLoadingDocuments: boolean;   // Loading state
  onAutoRunContentChange: (content: string) => void;
  onAutoRunModeChange: (mode: 'edit' | 'preview') => void;
  onAutoRunStateChange: (state: {
    mode: 'edit' | 'preview';
    cursorPosition: number;
    editScrollPos: number;
    previewScrollPos: number;
  }) => void;
  onAutoRunSelectDocument: (filename: string) => void;
  onAutoRunCreateDocument: (filename: string) => Promise<boolean>;
  onAutoRunRefresh: () => void;
  onAutoRunOpenSetup: () => void;

  // Batch processing props
  batchRunState?: BatchRunState;
  onOpenBatchRunner?: () => void;
  onStopBatchRun?: () => void;
  onJumpToClaudeSession?: (claudeSessionId: string) => void;
  onResumeSession?: (claudeSessionId: string) => void;
  onOpenSessionAsTab?: (claudeSessionId: string) => void;
}

export const RightPanel = forwardRef<RightPanelHandle, RightPanelProps>(function RightPanel(props, ref) {
  const {
    session, theme, shortcuts, rightPanelOpen, setRightPanelOpen, rightPanelWidth,
    setRightPanelWidthState, activeRightTab, setActiveRightTab, activeFocus, setActiveFocus,
    fileTreeFilter, setFileTreeFilter, fileTreeFilterOpen, setFileTreeFilterOpen,
    filteredFileTree, selectedFileIndex, setSelectedFileIndex, previewFile, fileTreeContainerRef,
    fileTreeFilterInputRef, toggleFolder, handleFileClick, expandAllFolders, collapseAllFolders,
    updateSessionWorkingDirectory, refreshFileTree, setSessions, onAutoRefreshChange, onShowFlash,
    autoRunDocumentList, autoRunDocumentTree, autoRunContent, autoRunIsLoadingDocuments,
    onAutoRunContentChange, onAutoRunModeChange, onAutoRunStateChange,
    onAutoRunSelectDocument, onAutoRunCreateDocument, onAutoRunRefresh, onAutoRunOpenSetup,
    batchRunState, onOpenBatchRunner, onStopBatchRun, onJumpToClaudeSession, onResumeSession,
    onOpenSessionAsTab
  } = props;

  const historyPanelRef = useRef<HistoryPanelHandle>(null);
  const autoRunRef = useRef<AutoRunHandle>(null);

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    refreshHistoryPanel: () => {
      historyPanelRef.current?.refreshHistory();
    },
    focusAutoRun: () => {
      autoRunRef.current?.focus();
    }
  }), []);

  // Focus the history panel when switching to history tab
  useEffect(() => {
    if (activeRightTab === 'history' && rightPanelOpen && activeFocus === 'right') {
      // Small delay to ensure the panel is rendered
      requestAnimationFrame(() => {
        historyPanelRef.current?.focus();
      });
    }
  }, [activeRightTab, rightPanelOpen, activeFocus]);

  // Focus the auto run panel when switching to autorun tab
  useEffect(() => {
    if (activeRightTab === 'autorun' && rightPanelOpen && activeFocus === 'right') {
      // Small delay to ensure the panel is rendered
      requestAnimationFrame(() => {
        autoRunRef.current?.focus();
      });
    }
  }, [activeRightTab, rightPanelOpen, activeFocus]);

  if (!session) return null;

  return (
    <div
      tabIndex={0}
      className={`border-l flex flex-col transition-all duration-300 outline-none relative ${rightPanelOpen ? '' : 'w-0 overflow-hidden opacity-0'} ${activeFocus === 'right' ? 'ring-1 ring-inset z-10' : ''}`}
      style={{
        width: rightPanelOpen ? `${rightPanelWidth}px` : '0',
        backgroundColor: theme.colors.bgSidebar,
        borderColor: theme.colors.border,
        ringColor: theme.colors.accent
      }}
      onClick={() => setActiveFocus('right')}
      onFocus={() => setActiveFocus('right')}
    >
      {/* Resize Handle */}
      {rightPanelOpen && (
        <div
          className="absolute top-0 left-0 w-1 h-full cursor-col-resize hover:bg-blue-500 transition-colors z-20"
          onMouseDown={(e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startWidth = rightPanelWidth;
            let currentWidth = startWidth;

            const handleMouseMove = (e: MouseEvent) => {
              const delta = startX - e.clientX; // Reversed for right panel
              currentWidth = Math.max(384, Math.min(800, startWidth + delta));
              setRightPanelWidthState(currentWidth);
            };

            const handleMouseUp = () => {
              window.maestro.settings.set('rightPanelWidth', currentWidth);
              document.removeEventListener('mousemove', handleMouseMove);
              document.removeEventListener('mouseup', handleMouseUp);
            };

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
          }}
        />
      )}

      {/* Tab Header */}
      <div className="flex border-b h-16" style={{ borderColor: theme.colors.border }}>
        <button
          onClick={() => setRightPanelOpen(!rightPanelOpen)}
          className="flex items-center justify-center p-2 rounded hover:bg-white/5 transition-colors w-12 shrink-0"
          title={`${rightPanelOpen ? "Collapse" : "Expand"} Right Panel (${formatShortcutKeys(shortcuts.toggleRightPanel.keys)})`}
        >
          {rightPanelOpen ? <PanelRightClose className="w-4 h-4 opacity-50" /> : <PanelRightOpen className="w-4 h-4 opacity-50" />}
        </button>

        {['files', 'history', 'autorun'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveRightTab(tab as RightPanelTab)}
            className="flex-1 text-xs font-bold border-b-2 transition-colors"
            style={{
              borderColor: activeRightTab === tab ? theme.colors.accent : 'transparent',
              color: activeRightTab === tab ? theme.colors.textMain : theme.colors.textDim
            }}
          >
            {tab === 'autorun' ? 'Auto Run' : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div
        ref={fileTreeContainerRef}
        className="flex-1 px-4 pb-4 overflow-y-auto overflow-x-hidden min-w-[24rem] outline-none scrollbar-thin"
        tabIndex={-1}
        onClick={() => {
          setActiveFocus('right');
          // Only focus the container for file explorer, not for autorun (which has its own focus management)
          if (activeRightTab === 'files') {
            fileTreeContainerRef.current?.focus();
          }
        }}
        onScroll={(e) => {
          // Only track scroll position for file explorer tab
          if (activeRightTab === 'files') {
            const scrollTop = e.currentTarget.scrollTop;
            setSessions(prev => prev.map(s =>
              s.id === session.id ? { ...s, fileExplorerScrollPos: scrollTop } : s
            ));
          }
        }}
      >
        {activeRightTab === 'files' && (
          <FileExplorerPanel
            session={session}
            theme={theme}
            fileTreeFilter={fileTreeFilter}
            setFileTreeFilter={setFileTreeFilter}
            fileTreeFilterOpen={fileTreeFilterOpen}
            setFileTreeFilterOpen={setFileTreeFilterOpen}
            filteredFileTree={filteredFileTree}
            selectedFileIndex={selectedFileIndex}
            setSelectedFileIndex={setSelectedFileIndex}
            activeFocus={activeFocus}
            activeRightTab={activeRightTab}
            previewFile={previewFile}
            setActiveFocus={setActiveFocus}
            fileTreeContainerRef={fileTreeContainerRef}
            fileTreeFilterInputRef={fileTreeFilterInputRef}
            toggleFolder={toggleFolder}
            handleFileClick={handleFileClick}
            expandAllFolders={expandAllFolders}
            collapseAllFolders={collapseAllFolders}
            updateSessionWorkingDirectory={updateSessionWorkingDirectory}
            refreshFileTree={refreshFileTree}
            setSessions={setSessions}
            onAutoRefreshChange={onAutoRefreshChange}
            onShowFlash={onShowFlash}
          />
        )}

        {activeRightTab === 'history' && (
          <HistoryPanel
            ref={historyPanelRef}
            session={session}
            theme={theme}
            onJumpToClaudeSession={onJumpToClaudeSession}
            onResumeSession={onResumeSession}
            onOpenSessionAsTab={onOpenSessionAsTab}
          />
        )}

        {activeRightTab === 'autorun' && (
          <AutoRun
            ref={autoRunRef}
            theme={theme}
            sessionId={session.id}
            folderPath={session.autoRunFolderPath || null}
            selectedFile={session.autoRunSelectedFile || null}
            documentList={autoRunDocumentList}
            documentTree={autoRunDocumentTree}
            content={autoRunContent}
            onContentChange={onAutoRunContentChange}
            mode={session.autoRunMode || 'edit'}
            onModeChange={onAutoRunModeChange}
            initialCursorPosition={session.autoRunCursorPosition || 0}
            initialEditScrollPos={session.autoRunEditScrollPos || 0}
            initialPreviewScrollPos={session.autoRunPreviewScrollPos || 0}
            onStateChange={onAutoRunStateChange}
            onOpenSetup={onAutoRunOpenSetup}
            onRefresh={onAutoRunRefresh}
            onSelectDocument={onAutoRunSelectDocument}
            onCreateDocument={onAutoRunCreateDocument}
            isLoadingDocuments={autoRunIsLoadingDocuments}
            batchRunState={batchRunState}
            onOpenBatchRunner={onOpenBatchRunner}
            onStopBatchRun={onStopBatchRun}
            sessionState={session.state}
          />
        )}
      </div>

      {/* Batch Run Progress - shown at bottom of all tabs */}
      {batchRunState && batchRunState.isRunning && (
        <div
          className="mx-4 mb-4 px-4 py-3 rounded border flex-shrink-0"
          style={{
            backgroundColor: theme.colors.bgActivity,
            borderColor: theme.colors.warning
          }}
        >
          {/* Header with status and overall progress */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: theme.colors.warning }} />
              <span className="text-xs font-bold uppercase" style={{ color: theme.colors.textMain }}>
                {batchRunState.isStopping ? 'Stopping...' : 'Auto Mode Running'}
              </span>
              {/* Loop iteration indicator */}
              {batchRunState.loopEnabled && batchRunState.loopIteration > 0 && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: theme.colors.accent + '30', color: theme.colors.accent }}
                >
                  Loop {batchRunState.loopIteration + 1}
                </span>
              )}
            </div>
          </div>

          {/* Document progress with inline progress bar - only for multi-document runs */}
          {batchRunState.documents && batchRunState.documents.length > 1 && (
            <div className="mb-2">
              {/* Document name with progress bar */}
              <div className="flex items-center gap-2">
                <span
                  className="text-xs font-medium shrink-0"
                  style={{ color: theme.colors.textMain }}
                >
                  Document {batchRunState.currentDocumentIndex + 1}/{batchRunState.documents.length}: {batchRunState.documents[batchRunState.currentDocumentIndex]}.md
                </span>
                <div
                  className="flex-1 h-1 rounded-full overflow-hidden"
                  style={{ backgroundColor: theme.colors.border }}
                >
                  <div
                    className="h-full transition-all duration-300 ease-out"
                    style={{
                      width: `${
                        batchRunState.currentDocTasksTotal > 0
                          ? (batchRunState.currentDocTasksCompleted / batchRunState.currentDocTasksTotal) * 100
                          : 0
                      }%`,
                      backgroundColor: theme.colors.accent
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Overall progress bar */}
          <div
            className="h-1.5 rounded-full overflow-hidden"
            style={{ backgroundColor: theme.colors.border }}
          >
            <div
              className="h-full transition-all duration-500 ease-out"
              style={{
                width: `${
                  batchRunState.totalTasksAcrossAllDocs > 0
                    ? (batchRunState.completedTasksAcrossAllDocs / batchRunState.totalTasksAcrossAllDocs) * 100
                    : batchRunState.totalTasks > 0
                      ? (batchRunState.completedTasks / batchRunState.totalTasks) * 100
                      : 0
                }%`,
                backgroundColor: batchRunState.isStopping ? theme.colors.error : theme.colors.warning
              }}
            />
          </div>

          {/* Overall completed count with loop info */}
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[10px]" style={{ color: theme.colors.textDim }}>
              {batchRunState.isStopping
                ? 'Waiting for current task to complete before stopping...'
                : batchRunState.totalTasksAcrossAllDocs > 0
                  ? `${batchRunState.completedTasksAcrossAllDocs} / ${batchRunState.totalTasksAcrossAllDocs} total tasks completed`
                  : `${batchRunState.completedTasks} / ${batchRunState.totalTasks} tasks completed`
              }
            </span>
            {/* Loop iteration indicator */}
            {batchRunState.loopEnabled && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded"
                style={{ backgroundColor: theme.colors.accent + '20', color: theme.colors.accent }}
              >
                Loop {batchRunState.loopIteration + 1} of {batchRunState.maxLoops ?? '∞'}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
