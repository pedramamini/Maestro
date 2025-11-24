import React from 'react';
import { Wand2, Radio, ExternalLink, Wifi, Info, Columns } from 'lucide-react';
import { LogViewer } from './LogViewer';
import { TerminalOutput } from './TerminalOutput';
import { InputArea } from './InputArea';
import { FilePreview } from './FilePreview';
import { ErrorBoundary } from './ErrorBoundary';
import type { Session, Theme, Shortcut, FocusArea } from '../types';

interface MainPanelProps {
  // State
  logViewerOpen: boolean;
  activeSession: Session | null;
  theme: Theme;
  activeFocus: FocusArea;
  outputSearchOpen: boolean;
  outputSearchQuery: string;
  inputValue: string;
  enterToSend: boolean;
  stagedImages: string[];
  commandHistoryOpen: boolean;
  commandHistoryFilter: string;
  commandHistorySelectedIndex: number;
  previewFile: { name: string; content: string; path: string } | null;
  markdownRawMode: boolean;
  shortcuts: Record<string, Shortcut>;
  rightPanelOpen: boolean;

  // Setters
  setLogViewerOpen: (open: boolean) => void;
  setActiveFocus: (focus: FocusArea) => void;
  setOutputSearchOpen: (open: boolean) => void;
  setOutputSearchQuery: (query: string) => void;
  setInputValue: (value: string) => void;
  setEnterToSend: (value: boolean) => void;
  setStagedImages: (images: string[]) => void;
  setLightboxImage: (image: string | null) => void;
  setCommandHistoryOpen: (open: boolean) => void;
  setCommandHistoryFilter: (filter: string) => void;
  setCommandHistorySelectedIndex: (index: number) => void;
  setPreviewFile: (file: { name: string; content: string; path: string } | null) => void;
  setMarkdownRawMode: (mode: boolean) => void;
  setAboutModalOpen: (open: boolean) => void;
  setRightPanelOpen: (open: boolean) => void;

  // Refs
  inputRef: React.RefObject<HTMLTextAreaElement>;
  logsEndRef: React.RefObject<HTMLDivElement>;
  fileTreeContainerRef: React.RefObject<HTMLDivElement>;

  // Functions
  toggleTunnel: (sessionId: string) => void;
  toggleInputMode: () => void;
  processInput: () => void;
  handleInputKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  handlePaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  handleDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  getContextColor: (usage: number, theme: Theme) => string;
}

export function MainPanel(props: MainPanelProps) {
  const {
    logViewerOpen, activeSession, theme, activeFocus, outputSearchOpen, outputSearchQuery,
    inputValue, enterToSend, stagedImages, commandHistoryOpen, commandHistoryFilter,
    commandHistorySelectedIndex, previewFile, markdownRawMode, shortcuts, rightPanelOpen,
    setLogViewerOpen, setActiveFocus, setOutputSearchOpen, setOutputSearchQuery,
    setInputValue, setEnterToSend, setStagedImages, setLightboxImage, setCommandHistoryOpen,
    setCommandHistoryFilter, setCommandHistorySelectedIndex, setPreviewFile, setMarkdownRawMode,
    setAboutModalOpen, setRightPanelOpen, inputRef, logsEndRef, fileTreeContainerRef,
    toggleTunnel, toggleInputMode, processInput, handleInputKeyDown, handlePaste, handleDrop,
    getContextColor
  } = props;

  // Show log viewer
  if (logViewerOpen) {
    return (
      <div className="flex-1 flex flex-col min-w-0 relative" style={{ backgroundColor: theme.colors.bgMain }}>
        <LogViewer theme={theme} onClose={() => setLogViewerOpen(false)} />
      </div>
    );
  }

  // Show empty state when no active session
  if (!activeSession) {
    return (
      <>
        <div
          className="flex-1 flex flex-col items-center justify-center min-w-0 relative opacity-30"
          style={{ backgroundColor: theme.colors.bgMain }}
        >
          <Wand2 className="w-16 h-16 mb-4" style={{ color: theme.colors.textDim }} />
          <p className="text-sm" style={{ color: theme.colors.textDim }}>No agents. Create one to get started.</p>
        </div>
        <div
          className="w-96 border-l opacity-30"
          style={{ backgroundColor: theme.colors.bgSidebar, borderColor: theme.colors.border }}
        />
      </>
    );
  }

  // Show normal session view
  return (
    <>
      <ErrorBoundary>
        <div
          className={`flex-1 flex flex-col min-w-0 relative ${activeFocus === 'main' ? 'ring-1 ring-inset z-10' : ''}`}
          style={{ backgroundColor: theme.colors.bgMain, ringColor: theme.colors.accent }}
          onClick={() => setActiveFocus('main')}
        >
          {/* Top Bar */}
          <div className="h-16 border-b flex items-center justify-between px-6 shrink-0" style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.bgSidebar }}>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                {(activeSession.inputMode === 'terminal' ? (activeSession.shellCwd || activeSession.cwd) : activeSession.cwd).split('/').pop() || '/'} /
                <span className={`text-xs px-2 py-0.5 rounded-full border ${activeSession.isGitRepo ? 'border-orange-500/30 text-orange-500 bg-orange-500/10' : 'border-blue-500/30 text-blue-500 bg-blue-500/10'}`}>
                  {activeSession.isGitRepo ? 'GIT' : 'LOCAL'}
                </span>
              </div>

              <div className="relative group">
                <button
                  onClick={() => toggleTunnel(activeSession.id)}
                  className={`flex items-center gap-2 px-2 py-1 rounded text-xs transition-colors ${activeSession.tunnelActive ? 'bg-green-500/20 text-green-500' : 'text-gray-500 hover:bg-gray-800'}`}
                >
                  <Radio className={`w-3 h-3 ${activeSession.tunnelActive ? 'animate-pulse' : ''}`} />
                  {activeSession.tunnelActive ? 'LIVE' : 'OFFLINE'}
                </button>
                {activeSession.tunnelActive && (
                  <div className="absolute top-full left-0 mt-2 w-64 bg-black border border-gray-700 rounded p-3 shadow-xl z-50 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    <div className="text-[10px] uppercase font-bold text-gray-500 mb-2">Public Endpoint</div>
                    <div className="flex items-center gap-1 text-xs text-green-400 font-mono mb-2 select-all">
                      <ExternalLink className="w-3 h-3" /> {activeSession.tunnelUrl}
                    </div>
                    <div className="text-[10px] uppercase font-bold text-gray-500 mb-2">Local Address</div>
                    <div className="flex items-center gap-1 text-xs text-gray-300 font-mono select-all">
                      <Wifi className="w-3 h-3" /> http://192.168.1.42:{activeSession.port}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-end mr-2">
                <span className="text-[10px] font-bold uppercase" style={{ color: theme.colors.textDim }}>Context Window</span>
                <div className="w-24 h-1.5 rounded-full mt-1 overflow-hidden" style={{ backgroundColor: theme.colors.border }}>
                  <div
                    className="h-full transition-all duration-500 ease-out"
                    style={{
                      width: `${activeSession.contextUsage}%`,
                      backgroundColor: getContextColor(activeSession.contextUsage, theme)
                    }}
                  />
                </div>
              </div>

              <button onClick={() => setAboutModalOpen(true)} className="p-2 rounded hover:bg-white/5" title="About Maestro">
                <Info className="w-4 h-4" />
              </button>
              {!rightPanelOpen && (
                <button onClick={() => setRightPanelOpen(true)} className="p-2 rounded hover:bg-white/5" title={`Show right panel (${shortcuts.toggleRightPanel.keys.join('+').replace('Meta', 'Cmd')})`}>
                  <Columns className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Logs Area */}
          <TerminalOutput
            session={activeSession}
            theme={theme}
            activeFocus={activeFocus}
            outputSearchOpen={outputSearchOpen}
            outputSearchQuery={outputSearchQuery}
            setOutputSearchOpen={setOutputSearchOpen}
            setOutputSearchQuery={setOutputSearchQuery}
            setActiveFocus={setActiveFocus}
            setLightboxImage={setLightboxImage}
            inputRef={inputRef}
            logsEndRef={logsEndRef}
          />

          {/* Input Area */}
          <InputArea
            session={activeSession}
            theme={theme}
            inputValue={inputValue}
            setInputValue={setInputValue}
            enterToSend={enterToSend}
            setEnterToSend={setEnterToSend}
            stagedImages={stagedImages}
            setStagedImages={setStagedImages}
            setLightboxImage={setLightboxImage}
            commandHistoryOpen={commandHistoryOpen}
            setCommandHistoryOpen={setCommandHistoryOpen}
            commandHistoryFilter={commandHistoryFilter}
            setCommandHistoryFilter={setCommandHistoryFilter}
            commandHistorySelectedIndex={commandHistorySelectedIndex}
            setCommandHistorySelectedIndex={setCommandHistorySelectedIndex}
            inputRef={inputRef}
            handleInputKeyDown={handleInputKeyDown}
            handlePaste={handlePaste}
            handleDrop={handleDrop}
            toggleInputMode={toggleInputMode}
            processInput={processInput}
          />

          {/* File Preview Overlay */}
          {previewFile && (
            <FilePreview
              file={previewFile}
              onClose={() => {
                setPreviewFile(null);
                setTimeout(() => {
                  if (fileTreeContainerRef.current) {
                    fileTreeContainerRef.current.focus();
                  }
                }, 0);
              }}
              theme={theme}
              markdownRawMode={markdownRawMode}
              setMarkdownRawMode={setMarkdownRawMode}
              shortcuts={shortcuts}
            />
          )}
        </div>
      </ErrorBoundary>
    </>
  );
}
