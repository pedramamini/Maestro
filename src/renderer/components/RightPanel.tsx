import React from 'react';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import type { Session, Theme, RightPanelTab, Shortcut } from '../types';
import { FileExplorerPanel } from './FileExplorerPanel';
import { HistoryPanel } from './HistoryPanel';
import { Scratchpad } from './Scratchpad';

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
  setSessions: React.Dispatch<React.SetStateAction<Session[]>>;

  // Scratchpad handlers
  updateScratchPad: (content: string) => void;
  updateScratchPadState: (state: {
    mode: 'edit' | 'preview';
    cursorPosition: number;
    editScrollPos: number;
    previewScrollPos: number;
  }) => void;
}

export function RightPanel(props: RightPanelProps) {
  const {
    session, theme, shortcuts, rightPanelOpen, setRightPanelOpen, rightPanelWidth,
    setRightPanelWidthState, activeRightTab, setActiveRightTab, activeFocus, setActiveFocus,
    fileTreeFilter, setFileTreeFilter, fileTreeFilterOpen, setFileTreeFilterOpen,
    filteredFileTree, selectedFileIndex, setSelectedFileIndex, previewFile, fileTreeContainerRef,
    fileTreeFilterInputRef, toggleFolder, handleFileClick, expandAllFolders, collapseAllFolders,
    updateSessionWorkingDirectory, setSessions, updateScratchPad, updateScratchPadState
  } = props;

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

            const handleMouseMove = (e: MouseEvent) => {
              const delta = startX - e.clientX; // Reversed for right panel
              const newWidth = Math.max(384, Math.min(800, startWidth + delta));
              setRightPanelWidthState(newWidth);
            };

            const handleMouseUp = () => {
              window.maestro.settings.set('rightPanelWidth', rightPanelWidth);
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
          title={`${rightPanelOpen ? "Collapse" : "Expand"} Right Panel (${shortcuts.toggleRightPanel.keys.join('+').replace('Meta', 'Cmd')})`}
        >
          {rightPanelOpen ? <PanelRightClose className="w-4 h-4 opacity-50" /> : <PanelRightOpen className="w-4 h-4 opacity-50" />}
        </button>

        {['files', 'history', 'scratchpad'].map(tab => {
          const isHistoryTab = tab === 'history';
          const isDisabled = isHistoryTab && session.inputMode !== 'ai';

          return (
            <button
              key={tab}
              onClick={() => !isDisabled && setActiveRightTab(tab as RightPanelTab)}
              disabled={isDisabled}
              className="flex-1 text-xs font-bold border-b-2 capitalize transition-colors disabled:cursor-not-allowed"
              style={{
                borderColor: activeRightTab === tab ? theme.colors.accent : 'transparent',
                color: isDisabled ? theme.colors.textDim + '40' : (activeRightTab === tab ? theme.colors.textMain : theme.colors.textDim),
                opacity: isDisabled ? 0.3 : 1
              }}
              title={isDisabled ? 'History is only available in AI mode' : undefined}
            >
              {tab}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div
        ref={fileTreeContainerRef}
        className="flex-1 px-4 pb-4 overflow-y-auto min-w-[24rem] outline-none"
        tabIndex={-1}
        onClick={() => {
          setActiveFocus('right');
          fileTreeContainerRef.current?.focus();
        }}
        onScroll={(e) => {
          const scrollTop = e.currentTarget.scrollTop;
          setSessions(prev => prev.map(s =>
            s.id === session.id ? { ...s, fileExplorerScrollPos: scrollTop } : s
          ));
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
            setSessions={setSessions}
          />
        )}

        {activeRightTab === 'history' && (
          <HistoryPanel session={session} theme={theme} />
        )}

        {activeRightTab === 'scratchpad' && (
          <Scratchpad
            content={session.scratchPadContent}
            onChange={updateScratchPad}
            theme={theme}
            initialMode={session.scratchPadMode || 'edit'}
            initialCursorPosition={session.scratchPadCursorPosition || 0}
            initialEditScrollPos={session.scratchPadEditScrollPos || 0}
            initialPreviewScrollPos={session.scratchPadPreviewScrollPos || 0}
            onStateChange={updateScratchPadState}
          />
        )}
      </div>
    </div>
  );
}
