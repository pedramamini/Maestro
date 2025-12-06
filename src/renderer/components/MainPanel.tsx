import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Wand2, ExternalLink, Columns, Copy, Loader2, GitBranch, ArrowUp, ArrowDown, FileEdit, List } from 'lucide-react';
import { LogViewer } from './LogViewer';
import { TerminalOutput } from './TerminalOutput';
import { InputArea } from './InputArea';
import { FilePreview } from './FilePreview';
import { ErrorBoundary } from './ErrorBoundary';
import { GitStatusWidget } from './GitStatusWidget';
import { AgentSessionsBrowser } from './AgentSessionsBrowser';
import { TabBar } from './TabBar';
import { gitService } from '../services/git';
import { getActiveTab, getBusyTabs } from '../utils/tabHelpers';
import { formatShortcutKeys } from '../utils/shortcutFormatter';
import type { Session, Theme, Shortcut, FocusArea, BatchRunState } from '../types';

interface SlashCommand {
  command: string;
  description: string;
}

interface MainPanelProps {
  // State
  logViewerOpen: boolean;
  agentSessionsOpen: boolean;
  activeClaudeSessionId: string | null;
  activeSession: Session | null;
  sessions: Session[]; // All sessions for InputArea's ThinkingStatusPill
  theme: Theme;
  fontFamily: string;
  isMobileLandscape?: boolean;
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
  // Tab completion props
  tabCompletionOpen?: boolean;
  tabCompletionSuggestions?: import('../hooks/useTabCompletion').TabCompletionSuggestion[];
  selectedTabCompletionIndex?: number;
  tabCompletionFilter?: import('../hooks/useTabCompletion').TabCompletionFilter;
  // @ mention completion props (AI mode)
  atMentionOpen?: boolean;
  atMentionFilter?: string;
  atMentionStartIndex?: number;
  atMentionSuggestions?: Array<{ value: string; type: 'file' | 'folder'; displayText: string; fullPath: string }>;
  selectedAtMentionIndex?: number;
  previewFile: { name: string; content: string; path: string } | null;
  markdownRawMode: boolean;
  shortcuts: Record<string, Shortcut>;
  rightPanelOpen: boolean;
  maxOutputLines: number;
  gitDiffPreview: string | null;
  fileTreeFilterOpen: boolean;
  logLevel?: string; // Current log level setting for LogViewer
  logViewerSelectedLevels: string[]; // Persisted filter selections for LogViewer
  setLogViewerSelectedLevels: (levels: string[]) => void;

  // Setters
  setGitDiffPreview: (preview: string | null) => void;
  setLogViewerOpen: (open: boolean) => void;
  setAgentSessionsOpen: (open: boolean) => void;
  setActiveClaudeSessionId: (id: string | null) => void;
  onResumeClaudeSession: (claudeSessionId: string, messages: import('../types').LogEntry[], sessionName?: string, starred?: boolean) => void;
  onNewClaudeSession: () => void;
  setActiveFocus: (focus: FocusArea) => void;
  setOutputSearchOpen: (open: boolean) => void;
  setOutputSearchQuery: (query: string) => void;
  setInputValue: (value: string) => void;
  setEnterToSendAI: (value: boolean) => void;
  setEnterToSendTerminal: (value: boolean) => void;
  setStagedImages: (images: string[]) => void;
  setLightboxImage: (image: string | null, contextImages?: string[]) => void;
  setCommandHistoryOpen: (open: boolean) => void;
  setCommandHistoryFilter: (filter: string) => void;
  setCommandHistorySelectedIndex: (index: number) => void;
  setSlashCommandOpen: (open: boolean) => void;
  setSelectedSlashCommandIndex: (index: number) => void;
  // Tab completion setters
  setTabCompletionOpen?: (open: boolean) => void;
  setSelectedTabCompletionIndex?: (index: number) => void;
  setTabCompletionFilter?: (filter: import('../hooks/useTabCompletion').TabCompletionFilter) => void;
  // @ mention completion setters
  setAtMentionOpen?: (open: boolean) => void;
  setAtMentionFilter?: (filter: string) => void;
  setAtMentionStartIndex?: (index: number) => void;
  setSelectedAtMentionIndex?: (index: number) => void;
  setPreviewFile: (file: { name: string; content: string; path: string } | null) => void;
  setMarkdownRawMode: (mode: boolean) => void;
  setAboutModalOpen: (open: boolean) => void;
  setRightPanelOpen: (open: boolean) => void;
  setGitLogOpen: (open: boolean) => void;

  // Refs
  inputRef: React.RefObject<HTMLTextAreaElement>;
  logsEndRef: React.RefObject<HTMLDivElement>;
  terminalOutputRef: React.RefObject<HTMLDivElement>;
  fileTreeContainerRef: React.RefObject<HTMLDivElement>;
  fileTreeFilterInputRef: React.RefObject<HTMLInputElement>;

  // Functions
  toggleInputMode: () => void;
  processInput: () => void;
  handleInterrupt: () => void;
  handleInputKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  handlePaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  handleDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  getContextColor: (usage: number, theme: Theme) => string;
  setActiveSessionId: (id: string) => void;
  onDeleteLog?: (logId: string) => void;
  onRemoveQueuedItem?: (itemId: string) => void;
  onOpenQueueBrowser?: () => void;

  // Auto mode props
  batchRunState?: BatchRunState;
  onStopBatchRun?: () => void;
  showConfirmation?: (message: string, onConfirm: () => void) => void;

  // TTS settings
  audioFeedbackCommand?: string;

  // Tab management for AI sessions
  onTabSelect?: (tabId: string) => void;
  onTabClose?: (tabId: string) => void;
  onNewTab?: () => void;
  onTabRename?: (tabId: string, newName: string) => void;
  onRequestTabRename?: (tabId: string) => void;
  onTabReorder?: (fromIndex: number, toIndex: number) => void;
  onCloseOtherTabs?: (tabId: string) => void;
  onTabStar?: (tabId: string, starred: boolean) => void;
  onUpdateTabByClaudeSessionId?: (claudeSessionId: string, updates: { name?: string | null; starred?: boolean }) => void;
  onToggleTabReadOnlyMode?: () => void;
  onToggleTabSaveToHistory?: () => void;
  showUnreadOnly?: boolean;
  onToggleUnreadFilter?: () => void;
  onOpenTabSearch?: () => void;
  // Scroll position persistence
  onScrollPositionChange?: (scrollTop: number) => void;
  // Input blur handler for persisting AI input state
  onInputBlur?: () => void;
  // Prompt composer modal
  onOpenPromptComposer?: () => void;
}

export function MainPanel(props: MainPanelProps) {
  const {
    logViewerOpen, agentSessionsOpen, activeClaudeSessionId, activeSession, sessions, theme, activeFocus, outputSearchOpen, outputSearchQuery,
    inputValue, enterToSendAI, enterToSendTerminal, stagedImages, commandHistoryOpen, commandHistoryFilter,
    commandHistorySelectedIndex, slashCommandOpen, slashCommands, selectedSlashCommandIndex,
    tabCompletionOpen, tabCompletionSuggestions, selectedTabCompletionIndex, tabCompletionFilter,
    setTabCompletionOpen, setSelectedTabCompletionIndex, setTabCompletionFilter,
    atMentionOpen, atMentionFilter, atMentionStartIndex, atMentionSuggestions, selectedAtMentionIndex,
    setAtMentionOpen, setAtMentionFilter, setAtMentionStartIndex, setSelectedAtMentionIndex,
    previewFile, markdownRawMode, shortcuts, rightPanelOpen, maxOutputLines, gitDiffPreview,
    fileTreeFilterOpen, logLevel, setGitDiffPreview, setLogViewerOpen, setAgentSessionsOpen, setActiveClaudeSessionId,
    onResumeClaudeSession, onNewClaudeSession, setActiveFocus, setOutputSearchOpen, setOutputSearchQuery,
    setInputValue, setEnterToSendAI, setEnterToSendTerminal, setStagedImages, setLightboxImage, setCommandHistoryOpen,
    setCommandHistoryFilter, setCommandHistorySelectedIndex, setSlashCommandOpen,
    setSelectedSlashCommandIndex, setPreviewFile, setMarkdownRawMode,
    setAboutModalOpen, setRightPanelOpen, setGitLogOpen, inputRef, logsEndRef, terminalOutputRef,
    fileTreeContainerRef, fileTreeFilterInputRef, toggleInputMode, processInput, handleInterrupt,
    handleInputKeyDown, handlePaste, handleDrop, getContextColor, setActiveSessionId,
    batchRunState, onStopBatchRun, showConfirmation, onRemoveQueuedItem, onOpenQueueBrowser,
    isMobileLandscape = false
  } = props;

  const isAutoModeActive = batchRunState?.isRunning || false;
  const isStopping = batchRunState?.isStopping || false;

  // Context window tooltip hover state
  const [contextTooltipOpen, setContextTooltipOpen] = useState(false);
  const contextTooltipTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Git pill tooltip hover state
  const [gitTooltipOpen, setGitTooltipOpen] = useState(false);
  const gitTooltipTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Panel width for responsive hiding of widgets
  const [panelWidth, setPanelWidth] = useState(Infinity); // Start with Infinity so widgets show by default
  const headerRef = useRef<HTMLDivElement>(null);

  // Extract tab handlers from props
  const { onTabSelect, onTabClose, onNewTab, onTabRename, onRequestTabRename, onTabReorder, onCloseOtherTabs, onTabStar, showUnreadOnly, onToggleUnreadFilter, onOpenTabSearch } = props;

  // Get the active tab for header display
  // The header should show the active tab's data (UUID, name, cost, context), not session-level data
  // Directly find the active tab without memoization to ensure it updates on every render
  const activeTab = activeSession?.aiTabs?.find(tab => tab.id === activeSession.activeTabId)
    ?? activeSession?.aiTabs?.[0]
    ?? null;

  // Compute context usage percentage from active tab's usage stats
  const activeTabContextUsage = useMemo(() => {
    if (!activeTab?.usageStats) return 0;
    const { inputTokens, outputTokens, contextWindow } = activeTab.usageStats;
    if (!contextWindow || contextWindow === 0) return 0;
    const contextTokens = inputTokens + outputTokens;
    return Math.min(Math.round((contextTokens / contextWindow) * 100), 100);
  }, [activeTab?.usageStats]);

  // Track panel width for responsive widget hiding
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    // Get initial width immediately
    setPanelWidth(header.offsetWidth);

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setPanelWidth(entry.contentRect.width);
      }
    });

    resizeObserver.observe(header);
    return () => resizeObserver.disconnect();
  }, []);

  // Responsive breakpoints for hiding widgets
  const showCostWidget = panelWidth > 500;

  // Git info state
  const [gitInfo, setGitInfo] = useState<{
    branch: string;
    remote: string;
    behind: number;
    ahead: number;
    uncommittedChanges: number;
  } | null>(null);

  // Copy notification state (centered flash notice)
  const [copyNotification, setCopyNotification] = useState<string | null>(null);

  // Fetch git info - extracted as a callback so it can be triggered manually
  const fetchGitInfo = useCallback(async () => {
    if (!activeSession?.isGitRepo) {
      setGitInfo(null);
      return;
    }
    try {
      const cwd = activeSession.inputMode === 'terminal' ? (activeSession.shellCwd || activeSession.cwd) : activeSession.cwd;
      const info = await window.maestro.git.info(cwd);
      setGitInfo(info);
    } catch (error) {
      console.error('Failed to fetch git info:', error);
      setGitInfo(null);
    }
  }, [activeSession?.isGitRepo, activeSession?.inputMode, activeSession?.shellCwd, activeSession?.cwd]);

  // Fetch git info when session changes or becomes a git repo
  useEffect(() => {
    if (!activeSession?.isGitRepo) {
      setGitInfo(null);
      return;
    }

    fetchGitInfo();
    // Refresh git info every 30 seconds (reduced from 10s for performance)
    const interval = setInterval(fetchGitInfo, 30000);
    return () => clearInterval(interval);
  }, [activeSession?.id, activeSession?.isGitRepo, fetchGitInfo]);

  // Cleanup hover timeouts on unmount
  useEffect(() => {
    return () => {
      if (gitTooltipTimeout.current) {
        clearTimeout(gitTooltipTimeout.current);
      }
      if (contextTooltipTimeout.current) {
        clearTimeout(contextTooltipTimeout.current);
      }
    };
  }, []);

  // Handler for input focus - select session in sidebar
  // Memoized to avoid recreating on every render
  const handleInputFocus = useCallback(() => {
    if (activeSession) {
      setActiveSessionId(activeSession.id);
      setActiveFocus('main');
    }
  }, [activeSession, setActiveSessionId, setActiveFocus]);

  // Memoized session click handler for InputArea's ThinkingStatusPill
  // Avoids creating new function reference on every render
  const handleSessionClick = useCallback((sessionId: string, tabId?: string) => {
    setActiveSessionId(sessionId);
    if (tabId && onTabSelect) {
      onTabSelect(tabId);
    }
  }, [setActiveSessionId, onTabSelect]);

  // Handler to view git diff
  const handleViewGitDiff = async () => {
    if (!activeSession || !activeSession.isGitRepo) return;

    const cwd = activeSession.inputMode === 'terminal' ? (activeSession.shellCwd || activeSession.cwd) : activeSession.cwd;
    const diff = await gitService.getDiff(cwd);

    if (diff.diff) {
      setGitDiffPreview(diff.diff);
    }
  };

  // Copy to clipboard handler with flash notification
  const copyToClipboard = async (text: string, message?: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // Show centered flash notification
      setCopyNotification(message || 'Copied to Clipboard');
      setTimeout(() => setCopyNotification(null), 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  // Show log viewer
  if (logViewerOpen) {
    return (
      <div className="flex-1 flex flex-col min-w-0 relative" style={{ backgroundColor: theme.colors.bgMain }}>
        <LogViewer
          theme={theme}
          onClose={() => setLogViewerOpen(false)}
          logLevel={logLevel}
          savedSelectedLevels={props.logViewerSelectedLevels}
          onSelectedLevelsChange={props.setLogViewerSelectedLevels}
        />
      </div>
    );
  }

  // Show agent sessions browser
  if (agentSessionsOpen) {
    return (
      <div className="flex-1 flex flex-col min-w-0 relative" style={{ backgroundColor: theme.colors.bgMain }}>
        <AgentSessionsBrowser
          theme={theme}
          activeSession={activeSession || undefined}
          activeClaudeSessionId={activeClaudeSessionId}
          onClose={() => setAgentSessionsOpen(false)}
          onResumeSession={onResumeClaudeSession}
          onNewSession={onNewClaudeSession}
          onUpdateTab={props.onUpdateTabByClaudeSessionId}
        />
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
          {/* Top Bar (hidden in mobile landscape for focused reading) */}
          {!isMobileLandscape && (
          <div ref={headerRef} className="h-16 border-b flex items-center justify-between px-6 shrink-0" style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.bgSidebar }}>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                {activeSession.name}
                <div
                  className="relative"
                  onMouseEnter={() => {
                    if (!activeSession.isGitRepo) return;
                    // Clear any pending close timeout
                    if (gitTooltipTimeout.current) {
                      clearTimeout(gitTooltipTimeout.current);
                      gitTooltipTimeout.current = null;
                    }
                    setGitTooltipOpen(true);
                  }}
                  onMouseLeave={() => {
                    // Delay closing to allow mouse to reach the dropdown
                    gitTooltipTimeout.current = setTimeout(() => {
                      setGitTooltipOpen(false);
                    }, 150);
                  }}
                >
                  <span
                    className={`flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border cursor-pointer ${activeSession.isGitRepo ? 'border-orange-500/30 text-orange-500 bg-orange-500/10 hover:bg-orange-500/20' : 'border-blue-500/30 text-blue-500 bg-blue-500/10'}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (activeSession.isGitRepo) {
                        fetchGitInfo(); // Refresh git info immediately on click
                        setGitLogOpen(true);
                      }
                    }}
                  >
                    {activeSession.isGitRepo ? (
                      <>
                        <GitBranch className="w-3 h-3" />
                        {gitInfo?.branch || 'GIT'}
                      </>
                    ) : 'LOCAL'}
                  </span>
                  {activeSession.isGitRepo && gitTooltipOpen && gitInfo && (
                    <>
                      {/* Invisible bridge to prevent hover gap */}
                      <div
                        className="absolute left-0 right-0 h-3 pointer-events-auto"
                        style={{ top: '100%' }}
                        onMouseEnter={() => {
                          if (gitTooltipTimeout.current) {
                            clearTimeout(gitTooltipTimeout.current);
                            gitTooltipTimeout.current = null;
                          }
                          setGitTooltipOpen(true);
                        }}
                      />
                      <div
                        className="absolute top-full left-0 pt-2 w-80 z-50 pointer-events-auto"
                        onMouseEnter={() => {
                          if (gitTooltipTimeout.current) {
                            clearTimeout(gitTooltipTimeout.current);
                            gitTooltipTimeout.current = null;
                          }
                          setGitTooltipOpen(true);
                        }}
                        onMouseLeave={() => {
                          gitTooltipTimeout.current = setTimeout(() => {
                            setGitTooltipOpen(false);
                          }, 150);
                        }}
                      >
                        <div
                          className="rounded shadow-xl"
                          style={{
                            backgroundColor: theme.colors.bgSidebar,
                            border: `1px solid ${theme.colors.border}`
                          }}
                        >
                      {/* Branch */}
                      <div className="p-3 border-b" style={{ borderColor: theme.colors.border }}>
                        <div className="text-[10px] uppercase font-bold mb-2" style={{ color: theme.colors.textDim }}>Branch</div>
                        <div className="flex items-center gap-2">
                          <GitBranch className="w-4 h-4 text-orange-500" />
                          <span className="text-sm font-mono font-medium" style={{ color: theme.colors.textMain }}>
                            {gitInfo.branch}
                          </span>
                          <div className="flex items-center gap-2 ml-auto">
                            {gitInfo.ahead > 0 && (
                              <span className="flex items-center gap-0.5 text-xs text-green-500">
                                <ArrowUp className="w-3 h-3" />
                                {gitInfo.ahead}
                              </span>
                            )}
                            {gitInfo.behind > 0 && (
                              <span className="flex items-center gap-0.5 text-xs text-red-500">
                                <ArrowDown className="w-3 h-3" />
                                {gitInfo.behind}
                              </span>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                copyToClipboard(gitInfo.branch, `"${gitInfo.branch}" copied to clipboard`);
                              }}
                              className="p-1 rounded hover:bg-white/10 transition-colors shrink-0"
                              title="Copy branch name"
                            >
                              <Copy className="w-3 h-3" style={{ color: theme.colors.textDim }} />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Remote Origin */}
                      {gitInfo.remote && (
                        <div className="p-3 border-b" style={{ borderColor: theme.colors.border }}>
                          <div className="text-[10px] uppercase font-bold mb-2" style={{ color: theme.colors.textDim }}>Origin</div>
                          <div className="flex items-center gap-2">
                            <ExternalLink className="w-3 h-3 shrink-0" style={{ color: theme.colors.textDim }} />
                            <span
                              className="text-xs font-mono truncate flex-1"
                              style={{ color: theme.colors.textMain }}
                              title={gitInfo.remote}
                            >
                              {gitInfo.remote.replace(/^https?:\/\//, '').replace(/\.git$/, '')}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                copyToClipboard(gitInfo.remote);
                              }}
                              className="p-1 rounded hover:bg-white/10 transition-colors shrink-0"
                              title="Copy remote URL"
                            >
                              <Copy className="w-3 h-3" style={{ color: theme.colors.textDim }} />
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Status Summary */}
                      <div className="p-3">
                        <div className="text-[10px] uppercase font-bold mb-2" style={{ color: theme.colors.textDim }}>Status</div>
                        <div className="flex items-center gap-4 text-xs">
                          {gitInfo.uncommittedChanges > 0 ? (
                            <span className="flex items-center gap-1.5" style={{ color: theme.colors.textMain }}>
                              <FileEdit className="w-3 h-3 text-orange-500" />
                              {gitInfo.uncommittedChanges} uncommitted {gitInfo.uncommittedChanges === 1 ? 'change' : 'changes'}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-green-500">
                              Working tree clean
                            </span>
                          )}
                        </div>
                        </div>
                      </div>
                    </div>
                    </>
                  )}
                </div>
              </div>

              {/* Git Status Widget */}
              <GitStatusWidget
                cwd={activeSession.inputMode === 'terminal' ? (activeSession.shellCwd || activeSession.cwd) : activeSession.cwd}
                isGitRepo={activeSession.isGitRepo}
                theme={theme}
                onViewDiff={handleViewGitDiff}
              />

            </div>

            {/* Center: AUTO Mode Indicator */}
            {isAutoModeActive && (
              <button
                onClick={() => {
                  if (isStopping) return;
                  showConfirmation?.(
                    'Stop the batch run? The current task will complete before stopping.',
                    () => onStopBatchRun?.()
                  );
                }}
                disabled={isStopping}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all ${isStopping ? 'cursor-not-allowed' : 'hover:opacity-90 cursor-pointer'}`}
                style={{
                  backgroundColor: theme.colors.error,
                  color: 'white'
                }}
                title={isStopping ? 'Stopping after current task...' : 'Click to stop batch run'}
              >
                {isStopping ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Wand2 className="w-5 h-5" />
                )}
                <span className="uppercase tracking-wider">
                  {isStopping ? 'Stopping...' : 'Auto'}
                </span>
                {batchRunState && (
                  <span className="text-xs opacity-80">
                    {batchRunState.completedTasks}/{batchRunState.totalTasks}
                  </span>
                )}
              </button>
            )}

            <div className="flex items-center gap-3">
              {/* Session UUID Pill - click to copy full UUID, left-most of session stats */}
              {activeSession.inputMode === 'ai' && activeTab?.claudeSessionId && (
                <button
                  className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border transition-colors hover:opacity-80"
                  style={{ backgroundColor: theme.colors.accent + '20', color: theme.colors.accent, borderColor: theme.colors.accent + '30' }}
                  title={activeTab.name ? `${activeTab.name}\nClick to copy: ${activeTab.claudeSessionId}` : `Click to copy: ${activeTab.claudeSessionId}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    copyToClipboard(activeTab.claudeSessionId!, 'Session ID Copied to Clipboard');
                  }}
                >
                  {activeTab.claudeSessionId.split('-')[0].toUpperCase()}
                </button>
              )}


              {/* Cost Tracker - styled as pill (hidden when panel is narrow) - shows active tab's cost */}
              {showCostWidget && activeSession.inputMode === 'ai' && activeTab?.claudeSessionId && (
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full border border-green-500/30 text-green-500 bg-green-500/10">
                  ${(activeTab?.usageStats?.totalCostUsd ?? 0).toFixed(2)}
                </span>
              )}

              {/* Context Window Widget with Tooltip - only show for tabs with Claude session */}
              {activeSession.inputMode === 'ai' && activeTab?.claudeSessionId && (
              <div
                className="flex flex-col items-end mr-2 relative cursor-pointer"
                onMouseEnter={() => {
                  // Clear any pending close timeout
                  if (contextTooltipTimeout.current) {
                    clearTimeout(contextTooltipTimeout.current);
                    contextTooltipTimeout.current = null;
                  }
                  setContextTooltipOpen(true);
                }}
                onMouseLeave={() => {
                  // Delay closing to allow mouse to reach the dropdown
                  contextTooltipTimeout.current = setTimeout(() => {
                    setContextTooltipOpen(false);
                  }, 150);
                }}
              >
                <span className="text-[10px] font-bold uppercase" style={{ color: theme.colors.textDim }}>Context Window</span>
                <div className="w-24 h-1.5 rounded-full mt-1 overflow-hidden" style={{ backgroundColor: theme.colors.border }}>
                  <div
                    className="h-full transition-all duration-500 ease-out"
                    style={{
                      width: `${activeTabContextUsage}%`,
                      backgroundColor: getContextColor(activeTabContextUsage, theme)
                    }}
                  />
                </div>

                {/* Context Window Tooltip */}
                {contextTooltipOpen && activeSession.inputMode === 'ai' && (
                  <>
                    {/* Invisible bridge to prevent hover gap */}
                    <div
                      className="absolute left-0 right-0 h-3 pointer-events-auto"
                      style={{ top: '100%' }}
                      onMouseEnter={() => {
                        if (contextTooltipTimeout.current) {
                          clearTimeout(contextTooltipTimeout.current);
                          contextTooltipTimeout.current = null;
                        }
                        setContextTooltipOpen(true);
                      }}
                    />
                    <div
                      className="absolute top-full right-0 pt-2 w-64 z-50 pointer-events-auto"
                      onMouseEnter={() => {
                        if (contextTooltipTimeout.current) {
                          clearTimeout(contextTooltipTimeout.current);
                          contextTooltipTimeout.current = null;
                        }
                        setContextTooltipOpen(true);
                      }}
                      onMouseLeave={() => {
                        contextTooltipTimeout.current = setTimeout(() => {
                          setContextTooltipOpen(false);
                        }, 150);
                      }}
                    >
                      <div
                        className="border rounded-lg p-3 shadow-xl"
                        style={{ backgroundColor: theme.colors.bgSidebar, borderColor: theme.colors.border }}
                      >
                      <div className="text-[10px] uppercase font-bold mb-3" style={{ color: theme.colors.textDim }}>Context Details</div>

                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-xs" style={{ color: theme.colors.textDim }}>Input Tokens</span>
                          <span className="text-xs font-mono" style={{ color: theme.colors.textMain }}>
                            {(activeTab?.usageStats?.inputTokens ?? 0).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs" style={{ color: theme.colors.textDim }}>Output Tokens</span>
                          <span className="text-xs font-mono" style={{ color: theme.colors.textMain }}>
                            {(activeTab?.usageStats?.outputTokens ?? 0).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs" style={{ color: theme.colors.textDim }}>Cache Read</span>
                          <span className="text-xs font-mono" style={{ color: theme.colors.textMain }}>
                            {(activeTab?.usageStats?.cacheReadInputTokens ?? 0).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs" style={{ color: theme.colors.textDim }}>Cache Write</span>
                          <span className="text-xs font-mono" style={{ color: theme.colors.textMain }}>
                            {(activeTab?.usageStats?.cacheCreationInputTokens ?? 0).toLocaleString()}
                          </span>
                        </div>

                        <div className="border-t pt-2 mt-2" style={{ borderColor: theme.colors.border }}>
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-bold" style={{ color: theme.colors.textDim }}>Context Tokens</span>
                            <span className="text-xs font-mono font-bold" style={{ color: theme.colors.accent }}>
                              {(
                                (activeTab?.usageStats?.inputTokens ?? 0) +
                                (activeTab?.usageStats?.outputTokens ?? 0)
                              ).toLocaleString()}
                            </span>
                          </div>
                          <div className="flex justify-between items-center mt-1">
                            <span className="text-xs font-bold" style={{ color: theme.colors.textDim }}>Context Size</span>
                            <span className="text-xs font-mono font-bold" style={{ color: theme.colors.textMain }}>
                              {(activeTab?.usageStats?.contextWindow ?? 200000).toLocaleString()}
                            </span>
                          </div>
                          <div className="flex justify-between items-center mt-1">
                            <span className="text-xs font-bold" style={{ color: theme.colors.textDim }}>Usage</span>
                            <span
                              className="text-xs font-mono font-bold"
                              style={{ color: getContextColor(activeTabContextUsage, theme) }}
                            >
                              {activeTabContextUsage}%
                            </span>
                          </div>
                        </div>
                      </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
              )}

              {/* Agent Sessions Button */}
              <button
                onClick={() => {
                  setActiveClaudeSessionId(null);
                  setAgentSessionsOpen(true);
                }}
                className="p-2 rounded hover:bg-white/5"
                title={`Agent Sessions (${shortcuts.agentSessions?.keys?.join('+').replace('Meta', 'Cmd').replace('Shift', '⇧') || 'Cmd+⇧+L'})`}
              >
                <List className="w-4 h-4" style={{ color: theme.colors.textDim }} />
              </button>

              {!rightPanelOpen && (
                <button onClick={() => setRightPanelOpen(true)} className="p-2 rounded hover:bg-white/5" title={`Show right panel (${formatShortcutKeys(shortcuts.toggleRightPanel.keys)})`}>
                  <Columns className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          )}

          {/* Tab Bar - only shown in AI mode when we have tabs (hidden during file preview) */}
          {!previewFile && activeSession.inputMode === 'ai' && activeSession.aiTabs && activeSession.aiTabs.length > 0 && onTabSelect && onTabClose && onNewTab && (
            <TabBar
              tabs={activeSession.aiTabs}
              activeTabId={activeSession.activeTabId}
              theme={theme}
              onTabSelect={onTabSelect}
              onTabClose={onTabClose}
              onNewTab={onNewTab}
              onTabRename={onTabRename}
              onRequestRename={onRequestTabRename}
              onTabReorder={onTabReorder}
              onCloseOthers={onCloseOtherTabs}
              onTabStar={onTabStar}
              showUnreadOnly={showUnreadOnly}
              onToggleUnreadFilter={onToggleUnreadFilter}
              onOpenTabSearch={onOpenTabSearch}
            />
          )}

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
                key={`${activeSession.id}-${activeSession.activeTabId}`}
                ref={terminalOutputRef}
                session={activeSession}
                theme={theme}
                fontFamily={props.fontFamily}
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
                onDeleteLog={props.onDeleteLog}
                onRemoveQueuedItem={onRemoveQueuedItem}
                onInterrupt={handleInterrupt}
                audioFeedbackCommand={props.audioFeedbackCommand}
                onScrollPositionChange={props.onScrollPositionChange}
                initialScrollTop={
                  activeSession.inputMode === 'ai'
                    ? activeTab?.scrollTop
                    : activeSession.terminalScrollTop
                }
                markdownRawMode={markdownRawMode}
                setMarkdownRawMode={setMarkdownRawMode}
              />

              {/* Input Area (hidden in mobile landscape for focused reading) */}
              {!isMobileLandscape && (
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
                tabCompletionOpen={tabCompletionOpen}
                setTabCompletionOpen={setTabCompletionOpen}
                tabCompletionSuggestions={tabCompletionSuggestions}
                selectedTabCompletionIndex={selectedTabCompletionIndex}
                setSelectedTabCompletionIndex={setSelectedTabCompletionIndex}
                tabCompletionFilter={tabCompletionFilter}
                setTabCompletionFilter={setTabCompletionFilter}
                atMentionOpen={atMentionOpen}
                setAtMentionOpen={setAtMentionOpen}
                atMentionFilter={atMentionFilter}
                setAtMentionFilter={setAtMentionFilter}
                atMentionStartIndex={atMentionStartIndex}
                setAtMentionStartIndex={setAtMentionStartIndex}
                atMentionSuggestions={atMentionSuggestions}
                selectedAtMentionIndex={selectedAtMentionIndex}
                setSelectedAtMentionIndex={setSelectedAtMentionIndex}
                inputRef={inputRef}
                handleInputKeyDown={handleInputKeyDown}
                handlePaste={handlePaste}
                handleDrop={handleDrop}
                toggleInputMode={toggleInputMode}
                processInput={processInput}
                handleInterrupt={handleInterrupt}
                onInputFocus={handleInputFocus}
                onInputBlur={props.onInputBlur}
                isAutoModeActive={isAutoModeActive}
                sessions={sessions}
                onSessionClick={handleSessionClick}
                autoRunState={batchRunState}
                onStopAutoRun={onStopBatchRun}
                onOpenQueueBrowser={onOpenQueueBrowser}
                tabReadOnlyMode={activeTab?.readOnlyMode ?? false}
                onToggleTabReadOnlyMode={props.onToggleTabReadOnlyMode}
                tabSaveToHistory={activeTab?.saveToHistory ?? false}
                onToggleTabSaveToHistory={props.onToggleTabSaveToHistory}
                onOpenPromptComposer={props.onOpenPromptComposer}
              />
              )}
            </>
          )}

        </div>
      </ErrorBoundary>

      {/* Copy Notification Toast - centered flash notice */}
      {copyNotification && (
        <div
          className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 px-6 py-4 rounded-lg shadow-2xl text-base font-bold animate-in fade-in zoom-in-95 duration-200 z-50"
          style={{
            backgroundColor: theme.colors.accent,
            color: theme.colors.accentForeground,
            textShadow: '0 1px 2px rgba(0, 0, 0, 0.3)'
          }}
        >
          {copyNotification}
        </div>
      )}
    </>
  );
}
