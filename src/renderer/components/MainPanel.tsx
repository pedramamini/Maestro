import React, { useState } from 'react';
import { Wand2, Radio, ExternalLink, Wifi, Info, Columns, Copy, FileText } from 'lucide-react';
import { LogViewer } from './LogViewer';
import { TerminalOutput } from './TerminalOutput';
import { InputArea } from './InputArea';
import { FilePreview } from './FilePreview';
import { ErrorBoundary } from './ErrorBoundary';
import { GitStatusWidget } from './GitStatusWidget';
import { gitService } from '../services/git';
import type { Session, Theme, Shortcut, FocusArea } from '../types';

interface SlashCommand {
  command: string;
  description: string;
}

interface MainPanelProps {
  // State
  logViewerOpen: boolean;
  activeSession: Session | null;
  theme: Theme;
  activeFocus: FocusArea;
  outputSearchOpen: boolean;
  outputSearchQuery: string;
  inputValue: string;
  enterToSendAI: boolean;
  enterToSendTerminal: boolean;
  stagedImages: string[];
  commandHistoryOpen: boolean;
  commandHistoryFilter: string;
  commandHistorySelectedIndex: number;
  slashCommandOpen: boolean;
  slashCommands: SlashCommand[];
  selectedSlashCommandIndex: number;
  previewFile: { name: string; content: string; path: string } | null;
  markdownRawMode: boolean;
  shortcuts: Record<string, Shortcut>;
  rightPanelOpen: boolean;
  maxOutputLines: number;
  gitDiffPreview: string | null;
  fileTreeFilterOpen: boolean;

  // Setters
  setGitDiffPreview: (preview: string | null) => void;
  setLogViewerOpen: (open: boolean) => void;
  setActiveFocus: (focus: FocusArea) => void;
  setOutputSearchOpen: (open: boolean) => void;
  setOutputSearchQuery: (query: string) => void;
  setInputValue: (value: string) => void;
  setEnterToSendAI: (value: boolean) => void;
  setEnterToSendTerminal: (value: boolean) => void;
  setStagedImages: (images: string[]) => void;
  setLightboxImage: (image: string | null) => void;
  setCommandHistoryOpen: (open: boolean) => void;
  setCommandHistoryFilter: (filter: string) => void;
  setCommandHistorySelectedIndex: (index: number) => void;
  setSlashCommandOpen: (open: boolean) => void;
  setSelectedSlashCommandIndex: (index: number) => void;
  setPreviewFile: (file: { name: string; content: string; path: string } | null) => void;
  setMarkdownRawMode: (mode: boolean) => void;
  setAboutModalOpen: (open: boolean) => void;
  setRightPanelOpen: (open: boolean) => void;

  // Refs
  inputRef: React.RefObject<HTMLTextAreaElement>;
  logsEndRef: React.RefObject<HTMLDivElement>;
  terminalOutputRef: React.RefObject<HTMLDivElement>;
  fileTreeContainerRef: React.RefObject<HTMLDivElement>;
  fileTreeFilterInputRef: React.RefObject<HTMLInputElement>;

  // Functions
  toggleTunnel: (sessionId: string) => void;
  toggleInputMode: () => void;
  processInput: () => void;
  handleInterrupt: () => void;
  handleInputKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  handlePaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  handleDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  getContextColor: (usage: number, theme: Theme) => string;
  setActiveSessionId: (id: string) => void;
}

export function MainPanel(props: MainPanelProps) {
  const {
    logViewerOpen, activeSession, theme, activeFocus, outputSearchOpen, outputSearchQuery,
    inputValue, enterToSendAI, enterToSendTerminal, stagedImages, commandHistoryOpen, commandHistoryFilter,
    commandHistorySelectedIndex, slashCommandOpen, slashCommands, selectedSlashCommandIndex,
    previewFile, markdownRawMode, shortcuts, rightPanelOpen, maxOutputLines, gitDiffPreview,
    fileTreeFilterOpen, setGitDiffPreview, setLogViewerOpen, setActiveFocus, setOutputSearchOpen, setOutputSearchQuery,
    setInputValue, setEnterToSendAI, setEnterToSendTerminal, setStagedImages, setLightboxImage, setCommandHistoryOpen,
    setCommandHistoryFilter, setCommandHistorySelectedIndex, setSlashCommandOpen,
    setSelectedSlashCommandIndex, setPreviewFile, setMarkdownRawMode,
    setAboutModalOpen, setRightPanelOpen, inputRef, logsEndRef, terminalOutputRef,
    fileTreeContainerRef, fileTreeFilterInputRef, toggleTunnel, toggleInputMode, processInput, handleInterrupt,
    handleInputKeyDown, handlePaste, handleDrop, getContextColor, setActiveSessionId
  } = props;

  // Tunnel tooltip hover state
  const [tunnelTooltipOpen, setTunnelTooltipOpen] = useState(false);

  // Handler for input focus - select session in sidebar
  const handleInputFocus = () => {
    if (activeSession) {
      setActiveSessionId(activeSession.id);
      setActiveFocus('main');
    }
  };

  // Handler to view git diff
  const handleViewGitDiff = async () => {
    if (!activeSession || !activeSession.isGitRepo) return;

    const cwd = activeSession.inputMode === 'terminal' ? (activeSession.shellCwd || activeSession.cwd) : activeSession.cwd;
    const diff = await gitService.getDiff(cwd);

    if (diff.diff) {
      setGitDiffPreview(diff.diff);
    }
  };

  // Copy to clipboard handler
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

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

              <div className="relative">
                <button
                  onClick={() => toggleTunnel(activeSession.id)}
                  onMouseEnter={() => activeSession.tunnelActive && setTunnelTooltipOpen(true)}
                  onMouseLeave={() => setTunnelTooltipOpen(false)}
                  className={`flex items-center gap-2 px-2 py-1 rounded text-xs transition-colors ${activeSession.tunnelActive ? 'bg-green-500/20 text-green-500' : 'text-gray-500 hover:bg-gray-800'}`}
                >
                  <Radio className={`w-3 h-3 ${activeSession.tunnelActive ? 'animate-pulse' : ''}`} />
                  {activeSession.tunnelActive ? 'LIVE' : 'OFFLINE'}
                </button>
                {activeSession.tunnelActive && tunnelTooltipOpen && (
                  <div
                    className="absolute top-full left-0 mt-2 w-72 bg-black border border-gray-700 rounded p-3 shadow-xl z-50"
                    onMouseEnter={() => setTunnelTooltipOpen(true)}
                    onMouseLeave={() => setTunnelTooltipOpen(false)}
                  >
                    <div className="text-[10px] uppercase font-bold text-gray-500 mb-2">Public Endpoint</div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-1 text-xs text-green-400 font-mono select-all flex-1 overflow-hidden">
                        <ExternalLink className="w-3 h-3 shrink-0" />
                        <span className="truncate">{activeSession.tunnelUrl}</span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          copyToClipboard(activeSession.tunnelUrl || '');
                        }}
                        className="p-1.5 rounded hover:bg-gray-800 transition-colors shrink-0"
                        title="Copy public URL"
                      >
                        <Copy className="w-3 h-3 text-gray-400 hover:text-gray-200" />
                      </button>
                    </div>
                    <div className="text-[10px] uppercase font-bold text-gray-500 mb-2">Local Address</div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1 text-xs text-gray-300 font-mono select-all flex-1 overflow-hidden">
                        <Wifi className="w-3 h-3 shrink-0" />
                        <span className="truncate">http://192.168.1.42:{activeSession.port}</span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          copyToClipboard(`http://192.168.1.42:${activeSession.port}`);
                        }}
                        className="p-1.5 rounded hover:bg-gray-800 transition-colors shrink-0"
                        title="Copy local URL"
                      >
                        <Copy className="w-3 h-3 text-gray-400 hover:text-gray-200" />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Git Status Widget */}
              <GitStatusWidget
                cwd={activeSession.inputMode === 'terminal' ? (activeSession.shellCwd || activeSession.cwd) : activeSession.cwd}
                isGitRepo={activeSession.isGitRepo}
                theme={theme}
                onViewDiff={handleViewGitDiff}
              />
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
              <button onClick={() => setLogViewerOpen(true)} className="p-2 rounded hover:bg-white/5" title="System Logs">
                <FileText className="w-4 h-4" />
              </button>
              {!rightPanelOpen && (
                <button onClick={() => setRightPanelOpen(true)} className="p-2 rounded hover:bg-white/5" title={`Show right panel (${shortcuts.toggleRightPanel.keys.join('+').replace('Meta', 'Cmd')})`}>
                  <Columns className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Show File Preview in main area when open, otherwise show terminal output and input */}
          {previewFile ? (
            <div className="flex-1 overflow-hidden">
              <FilePreview
                file={previewFile}
                onClose={() => {
                  setPreviewFile(null);
                  setActiveFocus('right');
                  setTimeout(() => {
                    // If file tree filter is open, focus it; otherwise focus the file tree container
                    if (fileTreeFilterOpen && fileTreeFilterInputRef.current) {
                      fileTreeFilterInputRef.current.focus();
                    } else if (fileTreeContainerRef.current) {
                      fileTreeContainerRef.current.focus();
                    }
                  }, 0);
                }}
                theme={theme}
                markdownRawMode={markdownRawMode}
                setMarkdownRawMode={setMarkdownRawMode}
                shortcuts={shortcuts}
              />
            </div>
          ) : (
            <>
              {/* Logs Area */}
              <TerminalOutput
                ref={terminalOutputRef}
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
                maxOutputLines={maxOutputLines}
              />

              {/* Input Area */}
              <InputArea
                session={activeSession}
                theme={theme}
                inputValue={inputValue}
                setInputValue={setInputValue}
                enterToSend={activeSession.inputMode === 'terminal' ? enterToSendTerminal : enterToSendAI}
                setEnterToSend={activeSession.inputMode === 'terminal' ? setEnterToSendTerminal : setEnterToSendAI}
                stagedImages={stagedImages}
                setStagedImages={setStagedImages}
                setLightboxImage={setLightboxImage}
                commandHistoryOpen={commandHistoryOpen}
                setCommandHistoryOpen={setCommandHistoryOpen}
                commandHistoryFilter={commandHistoryFilter}
                setCommandHistoryFilter={setCommandHistoryFilter}
                commandHistorySelectedIndex={commandHistorySelectedIndex}
                setCommandHistorySelectedIndex={setCommandHistorySelectedIndex}
                slashCommandOpen={slashCommandOpen}
                setSlashCommandOpen={setSlashCommandOpen}
                slashCommands={slashCommands}
                selectedSlashCommandIndex={selectedSlashCommandIndex}
                setSelectedSlashCommandIndex={setSelectedSlashCommandIndex}
                inputRef={inputRef}
                handleInputKeyDown={handleInputKeyDown}
                handlePaste={handlePaste}
                handleDrop={handleDrop}
                toggleInputMode={toggleInputMode}
                processInput={processInput}
                handleInterrupt={handleInterrupt}
                onInputFocus={handleInputFocus}
              />
            </>
          )}

        </div>
      </ErrorBoundary>
    </>
  );
}
