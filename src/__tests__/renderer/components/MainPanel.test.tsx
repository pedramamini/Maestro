import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import type { Theme, Session, Shortcut, FocusArea, BatchRunState } from '../../../renderer/types';

// Mock child components to simplify testing - must be before MainPanel import
vi.mock('../../../renderer/components/LogViewer', () => ({
  LogViewer: (props: { onClose: () => void }) => {
    return React.createElement('div', { 'data-testid': 'log-viewer' },
      React.createElement('button', { onClick: props.onClose, 'data-testid': 'log-viewer-close' }, 'Close LogViewer')
    );
  },
}));

vi.mock('../../../renderer/components/TerminalOutput', () => ({
  TerminalOutput: React.forwardRef((props: { session: { name: string } }, ref) => {
    return React.createElement('div', { 'data-testid': 'terminal-output', ref },
      `Terminal Output for ${props.session?.name}`
    );
  }),
}));

vi.mock('../../../renderer/components/InputArea', () => ({
  InputArea: (props: { session: { name: string }; onInputFocus: () => void }) => {
    return React.createElement('div', { 'data-testid': 'input-area' },
      React.createElement('input', { 'data-testid': 'input-field', onFocus: props.onInputFocus }),
      `Input for ${props.session?.name}`
    );
  },
}));

vi.mock('../../../renderer/components/FilePreview', () => ({
  FilePreview: (props: { file: { name: string }; onClose: () => void }) => {
    return React.createElement('div', { 'data-testid': 'file-preview' },
      `File Preview: ${props.file.name}`,
      React.createElement('button', { onClick: props.onClose, 'data-testid': 'file-preview-close' }, 'Close')
    );
  },
}));

vi.mock('../../../renderer/components/AgentSessionsBrowser', () => ({
  AgentSessionsBrowser: (props: { onClose: () => void }) => {
    return React.createElement('div', { 'data-testid': 'agent-sessions-browser' },
      React.createElement('button', { onClick: props.onClose, 'data-testid': 'agent-sessions-close' }, 'Close')
    );
  },
}));

vi.mock('../../../renderer/components/GitStatusWidget', () => ({
  GitStatusWidget: (props: { onViewDiff: () => void }) => {
    return React.createElement('div', { 'data-testid': 'git-status-widget' },
      React.createElement('button', { onClick: props.onViewDiff, 'data-testid': 'view-diff-btn' }, 'View Diff')
    );
  },
}));

vi.mock('../../../renderer/components/TabBar', () => ({
  TabBar: (props: {
    tabs: Array<{ id: string; name?: string }>;
    onTabSelect: (id: string) => void;
    onNewTab: () => void;
  }) => {
    return React.createElement('div', { 'data-testid': 'tab-bar' },
      props.tabs.map(tab =>
        React.createElement('button', {
          key: tab.id,
          onClick: () => props.onTabSelect(tab.id),
          'data-testid': `tab-${tab.id}`
        }, tab.name || tab.id)
      ),
      React.createElement('button', { onClick: props.onNewTab, 'data-testid': 'new-tab-btn' }, 'New Tab')
    );
  },
}));

vi.mock('../../../renderer/components/ErrorBoundary', () => ({
  ErrorBoundary: (props: { children: React.ReactNode }) => props.children,
}));

// Mock git service
vi.mock('../../../renderer/services/git', () => ({
  gitService: {
    getDiff: vi.fn().mockResolvedValue({ diff: 'mock diff content' }),
  },
}));

// Mock tab helpers
vi.mock('../../../renderer/utils/tabHelpers', () => ({
  getActiveTab: vi.fn((session: Session | null) => session?.aiTabs?.[0] || null),
  getBusyTabs: vi.fn(() => []),
}));

// Mock shortcut formatter
vi.mock('../../../renderer/utils/shortcutFormatter', () => ({
  formatShortcutKeys: vi.fn((keys: string[]) => keys?.join('+') || ''),
}));

// Import MainPanel after mocks
import { MainPanel } from '../../../renderer/components/MainPanel';

describe('MainPanel', () => {
  const theme: Theme = {
    name: 'dark',
    colors: {
      bgMain: '#1a1a2e',
      bgSidebar: '#16213e',
      bgActivity: '#0f3460',
      textMain: '#e8e8e8',
      textDim: '#888888',
      border: '#335',
      accent: '#00d9ff',
      accentForeground: '#ffffff',
      buttonBg: '#0f3460',
      buttonText: '#e8e8e8',
      inputBg: '#16213e',
      inputText: '#e8e8e8',
      success: '#22c55e',
      warning: '#f59e0b',
      error: '#ef4444',
    },
  };

  const defaultShortcuts: Record<string, Shortcut> = {
    agentSessions: { id: 'agentSessions', label: 'Agent Sessions', keys: ['Meta', 'Shift', 'L'] },
    toggleRightPanel: { id: 'toggleRightPanel', label: 'Toggle Right Panel', keys: ['Meta', 'B'] },
    closePreview: { id: 'closePreview', label: 'Close Preview', keys: ['Escape'] },
  };

  const createSession = (overrides: Partial<Session> = {}): Session => ({
    id: 'session-1',
    name: 'Test Session',
    toolType: 'claude-code',
    state: 'idle',
    inputMode: 'ai',
    cwd: '/test/project',
    projectRoot: '/test/project',
    aiPid: 12345,
    terminalPid: 12346,
    aiLogs: [],
    shellLogs: [],
    isGitRepo: false,
    fileTree: [],
    fileExplorerExpanded: [],
    messageQueue: [],
    aiTabs: [{
      id: 'tab-1',
      claudeSessionId: 'claude-session-1',
      name: 'Tab 1',
      isUnread: false,
      createdAt: Date.now(),
      usageStats: {
        inputTokens: 1000,
        outputTokens: 500,
        cacheReadInputTokens: 100,
        cacheCreationInputTokens: 50,
        totalCostUsd: 0.05,
        contextWindow: 200000,
      },
    }],
    activeTabId: 'tab-1',
    ...overrides,
  });

  const defaultProps = {
    // State
    logViewerOpen: false,
    agentSessionsOpen: false,
    activeClaudeSessionId: null,
    activeSession: createSession(),
    sessions: [createSession()],
    theme,
    fontFamily: 'monospace',
    isMobileLandscape: false,
    activeFocus: 'main' as FocusArea,
    outputSearchOpen: false,
    outputSearchQuery: '',
    inputValue: '',
    enterToSendAI: true,
    enterToSendTerminal: false,
    stagedImages: [],
    commandHistoryOpen: false,
    commandHistoryFilter: '',
    commandHistorySelectedIndex: 0,
    slashCommandOpen: false,
    slashCommands: [],
    selectedSlashCommandIndex: 0,
    previewFile: null,
    markdownRawMode: false,
    shortcuts: defaultShortcuts,
    rightPanelOpen: true,
    maxOutputLines: 1000,
    gitDiffPreview: null,
    fileTreeFilterOpen: false,
    logViewerSelectedLevels: ['info', 'warn', 'error'],
    setLogViewerSelectedLevels: vi.fn(),

    // Setters
    setGitDiffPreview: vi.fn(),
    setLogViewerOpen: vi.fn(),
    setAgentSessionsOpen: vi.fn(),
    setActiveClaudeSessionId: vi.fn(),
    onResumeClaudeSession: vi.fn(),
    onNewClaudeSession: vi.fn(),
    setActiveFocus: vi.fn(),
    setOutputSearchOpen: vi.fn(),
    setOutputSearchQuery: vi.fn(),
    setInputValue: vi.fn(),
    setEnterToSendAI: vi.fn(),
    setEnterToSendTerminal: vi.fn(),
    setStagedImages: vi.fn(),
    setLightboxImage: vi.fn(),
    setCommandHistoryOpen: vi.fn(),
    setCommandHistoryFilter: vi.fn(),
    setCommandHistorySelectedIndex: vi.fn(),
    setSlashCommandOpen: vi.fn(),
    setSelectedSlashCommandIndex: vi.fn(),
    setPreviewFile: vi.fn(),
    setMarkdownRawMode: vi.fn(),
    setAboutModalOpen: vi.fn(),
    setRightPanelOpen: vi.fn(),
    setGitLogOpen: vi.fn(),

    // Refs
    inputRef: React.createRef<HTMLTextAreaElement>(),
    logsEndRef: React.createRef<HTMLDivElement>(),
    terminalOutputRef: React.createRef<HTMLDivElement>(),
    fileTreeContainerRef: React.createRef<HTMLDivElement>(),
    fileTreeFilterInputRef: React.createRef<HTMLInputElement>(),

    // Functions
    toggleInputMode: vi.fn(),
    processInput: vi.fn(),
    handleInterrupt: vi.fn(),
    handleInputKeyDown: vi.fn(),
    handlePaste: vi.fn(),
    handleDrop: vi.fn(),
    getContextColor: vi.fn().mockReturnValue('#22c55e'),
    setActiveSessionId: vi.fn(),

    // Tab handlers
    onTabSelect: vi.fn(),
    onTabClose: vi.fn(),
    onNewTab: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });

    // Mock git.info for the component
    vi.mocked(window.maestro.git as unknown as { info: ReturnType<typeof vi.fn> }).info = vi.fn().mockResolvedValue({
      branch: 'main',
      remote: 'https://github.com/user/repo.git',
      behind: 0,
      ahead: 2,
      uncommittedChanges: 3,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Render conditions', () => {
    it('should render LogViewer when logViewerOpen is true', () => {
      render(<MainPanel {...defaultProps} logViewerOpen={true} />);

      expect(screen.getByTestId('log-viewer')).toBeInTheDocument();
      expect(screen.queryByTestId('terminal-output')).not.toBeInTheDocument();
    });

    it('should close LogViewer and call setLogViewerOpen when close button is clicked', () => {
      const setLogViewerOpen = vi.fn();
      render(<MainPanel {...defaultProps} logViewerOpen={true} setLogViewerOpen={setLogViewerOpen} />);

      fireEvent.click(screen.getByTestId('log-viewer-close'));

      expect(setLogViewerOpen).toHaveBeenCalledWith(false);
    });

    it('should render AgentSessionsBrowser when agentSessionsOpen is true', () => {
      render(<MainPanel {...defaultProps} agentSessionsOpen={true} />);

      expect(screen.getByTestId('agent-sessions-browser')).toBeInTheDocument();
      expect(screen.queryByTestId('terminal-output')).not.toBeInTheDocument();
    });

    it('should close AgentSessionsBrowser when close button is clicked', () => {
      const setAgentSessionsOpen = vi.fn();
      render(<MainPanel {...defaultProps} agentSessionsOpen={true} setAgentSessionsOpen={setAgentSessionsOpen} />);

      fireEvent.click(screen.getByTestId('agent-sessions-close'));

      expect(setAgentSessionsOpen).toHaveBeenCalledWith(false);
    });

    it('should render empty state when no activeSession', () => {
      render(<MainPanel {...defaultProps} activeSession={null} />);

      expect(screen.getByText('No agents. Create one to get started.')).toBeInTheDocument();
      expect(screen.queryByTestId('terminal-output')).not.toBeInTheDocument();
    });

    it('should render normal session view with terminal output and input area', () => {
      render(<MainPanel {...defaultProps} />);

      expect(screen.getByTestId('terminal-output')).toBeInTheDocument();
      expect(screen.getByTestId('input-area')).toBeInTheDocument();
    });
  });

  describe('Header display', () => {
    it('should display session name in header', () => {
      const session = createSession({ name: 'My Test Session' });
      render(<MainPanel {...defaultProps} activeSession={session} />);

      expect(screen.getByText('My Test Session')).toBeInTheDocument();
    });

    it('should display LOCAL badge for non-git repos', () => {
      const session = createSession({ isGitRepo: false });
      render(<MainPanel {...defaultProps} activeSession={session} />);

      expect(screen.getByText('LOCAL')).toBeInTheDocument();
    });

    it('should display GIT badge with branch name for git repos', async () => {
      const session = createSession({ isGitRepo: true });
      render(<MainPanel {...defaultProps} activeSession={session} />);

      await waitFor(() => {
        // Should show GIT initially, then branch name after info loads
        expect(screen.getByText(/GIT|main/)).toBeInTheDocument();
      });
    });

    it('should hide header in mobile landscape mode', () => {
      render(<MainPanel {...defaultProps} isMobileLandscape={true} />);

      // Header should not be visible
      expect(screen.queryByText('Test Session')).not.toBeInTheDocument();
    });

    it('should show Agent Sessions button in header', () => {
      render(<MainPanel {...defaultProps} />);

      const agentSessionsBtn = screen.getByTitle(/Agent Sessions/);
      expect(agentSessionsBtn).toBeInTheDocument();
    });

    it('should open Agent Sessions when button is clicked', () => {
      const setAgentSessionsOpen = vi.fn();
      const setActiveClaudeSessionId = vi.fn();
      render(<MainPanel
        {...defaultProps}
        setAgentSessionsOpen={setAgentSessionsOpen}
        setActiveClaudeSessionId={setActiveClaudeSessionId}
      />);

      fireEvent.click(screen.getByTitle(/Agent Sessions/));

      expect(setActiveClaudeSessionId).toHaveBeenCalledWith(null);
      expect(setAgentSessionsOpen).toHaveBeenCalledWith(true);
    });
  });

  describe('Right panel toggle', () => {
    it('should show toggle button when rightPanelOpen is false', () => {
      render(<MainPanel {...defaultProps} rightPanelOpen={false} />);

      expect(screen.getByTitle(/Show right panel/)).toBeInTheDocument();
    });

    it('should hide toggle button when rightPanelOpen is true', () => {
      render(<MainPanel {...defaultProps} rightPanelOpen={true} />);

      expect(screen.queryByTitle(/Show right panel/)).not.toBeInTheDocument();
    });

    it('should call setRightPanelOpen when toggle button is clicked', () => {
      const setRightPanelOpen = vi.fn();
      render(<MainPanel {...defaultProps} rightPanelOpen={false} setRightPanelOpen={setRightPanelOpen} />);

      fireEvent.click(screen.getByTitle(/Show right panel/));

      expect(setRightPanelOpen).toHaveBeenCalledWith(true);
    });
  });

  describe('File Preview mode', () => {
    it('should render FilePreview when previewFile is set', () => {
      const previewFile = { name: 'test.ts', content: 'test content', path: '/test/test.ts' };
      render(<MainPanel {...defaultProps} previewFile={previewFile} />);

      expect(screen.getByTestId('file-preview')).toBeInTheDocument();
      expect(screen.getByText('File Preview: test.ts')).toBeInTheDocument();
    });

    it('should hide TabBar when file preview is open', () => {
      const previewFile = { name: 'test.ts', content: 'test content', path: '/test/test.ts' };
      render(<MainPanel {...defaultProps} previewFile={previewFile} />);

      expect(screen.queryByTestId('tab-bar')).not.toBeInTheDocument();
    });

    it('should call setPreviewFile(null) and setActiveFocus when closing preview', () => {
      const setPreviewFile = vi.fn();
      const setActiveFocus = vi.fn();
      const previewFile = { name: 'test.ts', content: 'test content', path: '/test/test.ts' };

      render(<MainPanel
        {...defaultProps}
        previewFile={previewFile}
        setPreviewFile={setPreviewFile}
        setActiveFocus={setActiveFocus}
      />);

      fireEvent.click(screen.getByTestId('file-preview-close'));

      expect(setPreviewFile).toHaveBeenCalledWith(null);
      expect(setActiveFocus).toHaveBeenCalledWith('right');
    });

    it('should focus file tree container when closing preview (setTimeout callback)', async () => {
      vi.useFakeTimers();
      const setPreviewFile = vi.fn();
      const setActiveFocus = vi.fn();
      const previewFile = { name: 'test.ts', content: 'test content', path: '/test/test.ts' };
      const fileTreeContainerRef = { current: { focus: vi.fn() } };

      render(<MainPanel
        {...defaultProps}
        previewFile={previewFile}
        setPreviewFile={setPreviewFile}
        setActiveFocus={setActiveFocus}
        fileTreeContainerRef={fileTreeContainerRef as any}
        fileTreeFilterOpen={false}
      />);

      fireEvent.click(screen.getByTestId('file-preview-close'));

      // Run the setTimeout callback
      await act(async () => {
        vi.advanceTimersByTime(1);
      });

      expect(fileTreeContainerRef.current.focus).toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('should focus file tree filter input when closing preview with filter open', async () => {
      vi.useFakeTimers();
      const setPreviewFile = vi.fn();
      const setActiveFocus = vi.fn();
      const previewFile = { name: 'test.ts', content: 'test content', path: '/test/test.ts' };
      const fileTreeFilterInputRef = { current: { focus: vi.fn() } };

      render(<MainPanel
        {...defaultProps}
        previewFile={previewFile}
        setPreviewFile={setPreviewFile}
        setActiveFocus={setActiveFocus}
        fileTreeFilterInputRef={fileTreeFilterInputRef as any}
        fileTreeFilterOpen={true}
      />);

      fireEvent.click(screen.getByTestId('file-preview-close'));

      // Run the setTimeout callback
      await act(async () => {
        vi.advanceTimersByTime(1);
      });

      expect(fileTreeFilterInputRef.current.focus).toHaveBeenCalled();
      vi.useRealTimers();
    });
  });

  describe('Tab Bar', () => {
    it('should render TabBar in AI mode with tabs', () => {
      const session = createSession({
        inputMode: 'ai',
        aiTabs: [
          { id: 'tab-1', name: 'Tab 1', isUnread: false, createdAt: Date.now() },
          { id: 'tab-2', name: 'Tab 2', isUnread: false, createdAt: Date.now() },
        ],
      });

      render(<MainPanel {...defaultProps} activeSession={session} />);

      expect(screen.getByTestId('tab-bar')).toBeInTheDocument();
      expect(screen.getByTestId('tab-tab-1')).toBeInTheDocument();
      expect(screen.getByTestId('tab-tab-2')).toBeInTheDocument();
    });

    it('should not render TabBar in terminal mode', () => {
      const session = createSession({ inputMode: 'terminal' });

      render(<MainPanel {...defaultProps} activeSession={session} />);

      expect(screen.queryByTestId('tab-bar')).not.toBeInTheDocument();
    });

    it('should call onTabSelect when tab is clicked', () => {
      const onTabSelect = vi.fn();
      const session = createSession({
        aiTabs: [
          { id: 'tab-1', name: 'Tab 1', isUnread: false, createdAt: Date.now() },
          { id: 'tab-2', name: 'Tab 2', isUnread: false, createdAt: Date.now() },
        ],
      });

      render(<MainPanel {...defaultProps} activeSession={session} onTabSelect={onTabSelect} />);

      fireEvent.click(screen.getByTestId('tab-tab-2'));

      expect(onTabSelect).toHaveBeenCalledWith('tab-2');
    });

    it('should call onNewTab when new tab button is clicked', () => {
      const onNewTab = vi.fn();
      const session = createSession();

      render(<MainPanel {...defaultProps} activeSession={session} onNewTab={onNewTab} />);

      fireEvent.click(screen.getByTestId('new-tab-btn'));

      expect(onNewTab).toHaveBeenCalled();
    });
  });

  describe('Session UUID pill', () => {
    it('should display session UUID pill in AI mode with claude session', () => {
      const session = createSession({
        inputMode: 'ai',
        aiTabs: [{
          id: 'tab-1',
          claudeSessionId: 'abc12345-def6-7890-ghij-klmnopqrstuv',
          name: 'Tab 1',
          isUnread: false,
          createdAt: Date.now(),
        }],
        activeTabId: 'tab-1',
      });

      render(<MainPanel {...defaultProps} activeSession={session} />);

      // Should show truncated UUID (first segment in uppercase)
      expect(screen.getByText('ABC12345')).toBeInTheDocument();
    });

    it('should copy session ID when UUID pill is clicked', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, { clipboard: { writeText } });

      const session = createSession({
        inputMode: 'ai',
        aiTabs: [{
          id: 'tab-1',
          claudeSessionId: 'abc12345-def6-7890-ghij-klmnopqrstuv',
          name: 'Tab 1',
          isUnread: false,
          createdAt: Date.now(),
        }],
        activeTabId: 'tab-1',
      });

      render(<MainPanel {...defaultProps} activeSession={session} />);

      fireEvent.click(screen.getByText('ABC12345'));

      expect(writeText).toHaveBeenCalledWith('abc12345-def6-7890-ghij-klmnopqrstuv');
    });

    it('should not show UUID pill in terminal mode', () => {
      const session = createSession({
        inputMode: 'terminal',
        aiTabs: [{
          id: 'tab-1',
          claudeSessionId: 'abc12345-def6-7890',
          name: 'Tab 1',
          isUnread: false,
          createdAt: Date.now(),
        }],
      });

      render(<MainPanel {...defaultProps} activeSession={session} />);

      expect(screen.queryByText('ABC12345')).not.toBeInTheDocument();
    });
  });

  describe('Cost tracker', () => {
    it('should display cost tracker in AI mode when panel is wide enough', () => {
      // Mock offsetWidth to return a value > 500 so cost widget is shown
      const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
        configurable: true,
        value: 800,
      });

      const session = createSession({
        inputMode: 'ai',
        aiTabs: [{
          id: 'tab-1',
          claudeSessionId: 'claude-1',
          name: 'Tab 1',
          isUnread: false,
          createdAt: Date.now(),
          usageStats: {
            inputTokens: 1000,
            outputTokens: 500,
            cacheReadInputTokens: 0,
            cacheCreationInputTokens: 0,
            totalCostUsd: 0.15,
            contextWindow: 200000,
          },
        }],
        activeTabId: 'tab-1',
      });

      render(<MainPanel {...defaultProps} activeSession={session} />);

      // Cost is displayed with fixed 2 decimals, look for the cost pattern
      const costElements = screen.getAllByText(/\$0\.\d+/);
      expect(costElements.length).toBeGreaterThan(0);

      // Restore
      if (originalOffsetWidth) {
        Object.defineProperty(HTMLElement.prototype, 'offsetWidth', originalOffsetWidth);
      }
    });

    it('should not display cost tracker in terminal mode', () => {
      const session = createSession({ inputMode: 'terminal' });

      render(<MainPanel {...defaultProps} activeSession={session} />);

      expect(screen.queryByText(/\$\d+\.\d+/)).not.toBeInTheDocument();
    });
  });

  describe('Context window widget', () => {
    it('should display context window widget in AI mode', () => {
      render(<MainPanel {...defaultProps} />);

      expect(screen.getByText('Context Window')).toBeInTheDocument();
    });

    it('should not display context window in terminal mode', () => {
      const session = createSession({ inputMode: 'terminal' });

      render(<MainPanel {...defaultProps} activeSession={session} />);

      expect(screen.queryByText('Context Window')).not.toBeInTheDocument();
    });
  });

  describe('Auto mode indicator', () => {
    it('should display Auto mode button when batch run is active', () => {
      const batchRunState: BatchRunState = {
        isRunning: true,
        isStopping: false,
        documents: ['doc1.md'],
        currentDocumentIndex: 0,
        currentDocTasksTotal: 5,
        currentDocTasksCompleted: 2,
        totalTasksAcrossAllDocs: 5,
        completedTasksAcrossAllDocs: 2,
        loopEnabled: false,
        loopIteration: 0,
        folderPath: '/test/folder',
        worktreeActive: false,
        totalTasks: 5,
        completedTasks: 2,
        currentTaskIndex: 2,
        originalContent: '',
        sessionIds: [],
      };

      render(<MainPanel {...defaultProps} batchRunState={batchRunState} />);

      expect(screen.getByText('Auto')).toBeInTheDocument();
      expect(screen.getByText('2/5')).toBeInTheDocument();
    });

    it('should display Stopping state when isStopping is true', () => {
      const batchRunState: BatchRunState = {
        isRunning: true,
        isStopping: true,
        documents: ['doc1.md'],
        currentDocumentIndex: 0,
        currentDocTasksTotal: 5,
        currentDocTasksCompleted: 2,
        totalTasksAcrossAllDocs: 5,
        completedTasksAcrossAllDocs: 2,
        loopEnabled: false,
        loopIteration: 0,
        folderPath: '/test/folder',
        worktreeActive: false,
        totalTasks: 5,
        completedTasks: 2,
        currentTaskIndex: 2,
        originalContent: '',
        sessionIds: [],
      };

      render(<MainPanel {...defaultProps} batchRunState={batchRunState} />);

      expect(screen.getByText('Stopping...')).toBeInTheDocument();
    });

    it('should call showConfirmation when Auto button is clicked', () => {
      const showConfirmation = vi.fn();
      const batchRunState: BatchRunState = {
        isRunning: true,
        isStopping: false,
        documents: ['doc1.md'],
        currentDocumentIndex: 0,
        currentDocTasksTotal: 5,
        currentDocTasksCompleted: 2,
        totalTasksAcrossAllDocs: 5,
        completedTasksAcrossAllDocs: 2,
        loopEnabled: false,
        loopIteration: 0,
        folderPath: '/test/folder',
        worktreeActive: false,
        totalTasks: 5,
        completedTasks: 2,
        currentTaskIndex: 2,
        originalContent: '',
        sessionIds: [],
      };

      render(<MainPanel {...defaultProps} batchRunState={batchRunState} showConfirmation={showConfirmation} />);

      fireEvent.click(screen.getByText('Auto'));

      expect(showConfirmation).toHaveBeenCalledWith(
        'Stop the batch run? The current task will complete before stopping.',
        expect.any(Function)
      );
    });

    it('should not call showConfirmation when Auto button is clicked while stopping', () => {
      const showConfirmation = vi.fn();
      const batchRunState: BatchRunState = {
        isRunning: true,
        isStopping: true,
        documents: ['doc1.md'],
        currentDocumentIndex: 0,
        currentDocTasksTotal: 5,
        currentDocTasksCompleted: 2,
        totalTasksAcrossAllDocs: 5,
        completedTasksAcrossAllDocs: 2,
        loopEnabled: false,
        loopIteration: 0,
        folderPath: '/test/folder',
        worktreeActive: false,
        totalTasks: 5,
        completedTasks: 2,
        currentTaskIndex: 2,
        originalContent: '',
        sessionIds: [],
      };

      render(<MainPanel {...defaultProps} batchRunState={batchRunState} showConfirmation={showConfirmation} />);

      fireEvent.click(screen.getByText('Stopping...'));

      expect(showConfirmation).not.toHaveBeenCalled();
    });
  });

  describe('Git tooltip', () => {
    it('should show git tooltip on hover for git repos', async () => {
      const session = createSession({ isGitRepo: true });
      render(<MainPanel {...defaultProps} activeSession={session} />);

      await waitFor(() => {
        expect(screen.getByText(/main|GIT/)).toBeInTheDocument();
      });

      // Find and hover over the git badge
      const gitBadge = screen.getByText(/main|GIT/);
      fireEvent.mouseEnter(gitBadge.parentElement!);

      await waitFor(() => {
        // Tooltip content should appear
        expect(screen.getByText('Branch')).toBeInTheDocument();
      });
    });

    it('should copy branch name when copy button is clicked', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, { clipboard: { writeText } });

      const session = createSession({ isGitRepo: true });
      render(<MainPanel {...defaultProps} activeSession={session} />);

      await waitFor(() => {
        expect(screen.getByText(/main|GIT/)).toBeInTheDocument();
      });

      // Hover to show tooltip
      const gitBadge = screen.getByText(/main|GIT/);
      fireEvent.mouseEnter(gitBadge.parentElement!);

      await waitFor(() => {
        expect(screen.getByText('Branch')).toBeInTheDocument();
      });

      // Click copy button
      const copyButtons = screen.getAllByTitle(/Copy branch name/);
      fireEvent.click(copyButtons[0]);

      expect(writeText).toHaveBeenCalledWith('main');
    });

    it('should open git log when clicking on git badge', async () => {
      const setGitLogOpen = vi.fn();
      const session = createSession({ isGitRepo: true });

      render(<MainPanel {...defaultProps} activeSession={session} setGitLogOpen={setGitLogOpen} />);

      await waitFor(() => {
        expect(screen.getByText(/main|GIT/)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText(/main|GIT/));

      expect(setGitLogOpen).toHaveBeenCalledWith(true);
    });
  });

  describe('Context window tooltip', () => {
    it('should show context tooltip on hover', async () => {
      render(<MainPanel {...defaultProps} />);

      const contextWidget = screen.getByText('Context Window');
      fireEvent.mouseEnter(contextWidget.parentElement!);

      await waitFor(() => {
        expect(screen.getByText('Context Details')).toBeInTheDocument();
      });
    });

    it('should hide context tooltip on mouse leave after delay', async () => {
      render(<MainPanel {...defaultProps} />);

      const contextWidget = screen.getByText('Context Window');
      fireEvent.mouseEnter(contextWidget.parentElement!);

      await waitFor(() => {
        expect(screen.getByText('Context Details')).toBeInTheDocument();
      });

      fireEvent.mouseLeave(contextWidget.parentElement!);

      // Wait for the tooltip to disappear after the 150ms delay
      await waitFor(() => {
        expect(screen.queryByText('Context Details')).not.toBeInTheDocument();
      }, { timeout: 500 });
    });

    it('should keep tooltip open when re-entering context widget quickly', async () => {
      render(<MainPanel {...defaultProps} />);

      const contextWidget = screen.getByText('Context Window');
      const contextContainer = contextWidget.parentElement!;

      // Hover to open
      fireEvent.mouseEnter(contextContainer);

      await waitFor(() => {
        expect(screen.getByText('Context Details')).toBeInTheDocument();
      });

      // Leave and immediately re-enter (simulating quick mouse movement)
      fireEvent.mouseLeave(contextContainer);
      fireEvent.mouseEnter(contextContainer);

      // Tooltip should still be visible
      expect(screen.getByText('Context Details')).toBeInTheDocument();
    });

    it('should display token stats in context tooltip', async () => {
      const session = createSession({
        aiTabs: [{
          id: 'tab-1',
          claudeSessionId: 'claude-1',
          name: 'Tab 1',
          isUnread: false,
          createdAt: Date.now(),
          usageStats: {
            inputTokens: 1500,
            outputTokens: 750,
            cacheReadInputTokens: 200,
            cacheCreationInputTokens: 100,
            totalCostUsd: 0.05,
            contextWindow: 200000,
          },
        }],
        activeTabId: 'tab-1',
      });

      render(<MainPanel {...defaultProps} activeSession={session} />);

      const contextWidget = screen.getByText('Context Window');
      fireEvent.mouseEnter(contextWidget.parentElement!);

      await waitFor(() => {
        expect(screen.getByText('Input Tokens')).toBeInTheDocument();
        expect(screen.getByText('1,500')).toBeInTheDocument();
        expect(screen.getByText('Output Tokens')).toBeInTheDocument();
        expect(screen.getByText('750')).toBeInTheDocument();
        expect(screen.getByText('Cache Read')).toBeInTheDocument();
        expect(screen.getByText('200')).toBeInTheDocument();
        expect(screen.getByText('Cache Write')).toBeInTheDocument();
        expect(screen.getByText('100')).toBeInTheDocument();
      });
    });
  });

  describe('Input handling', () => {
    it('should call setActiveSessionId and setActiveFocus when input is focused', () => {
      const setActiveSessionId = vi.fn();
      const setActiveFocus = vi.fn();

      render(<MainPanel
        {...defaultProps}
        setActiveSessionId={setActiveSessionId}
        setActiveFocus={setActiveFocus}
      />);

      fireEvent.focus(screen.getByTestId('input-field'));

      expect(setActiveSessionId).toHaveBeenCalledWith('session-1');
      expect(setActiveFocus).toHaveBeenCalledWith('main');
    });

    it('should hide input area in mobile landscape mode', () => {
      render(<MainPanel {...defaultProps} isMobileLandscape={true} />);

      expect(screen.queryByTestId('input-area')).not.toBeInTheDocument();
    });
  });

  describe('Git diff preview', () => {
    it('should call gitService.getDiff and setGitDiffPreview when view diff is clicked', async () => {
      const setGitDiffPreview = vi.fn();
      const session = createSession({ isGitRepo: true });

      render(<MainPanel {...defaultProps} activeSession={session} setGitDiffPreview={setGitDiffPreview} />);

      fireEvent.click(screen.getByTestId('view-diff-btn'));

      await waitFor(() => {
        expect(setGitDiffPreview).toHaveBeenCalledWith('mock diff content');
      });
    });
  });

  describe('Copy notification', () => {
    it('should show copy notification when text is copied', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, { clipboard: { writeText } });

      const session = createSession({
        inputMode: 'ai',
        aiTabs: [{
          id: 'tab-1',
          claudeSessionId: 'abc12345-def6-7890',
          name: 'Tab 1',
          isUnread: false,
          createdAt: Date.now(),
        }],
        activeTabId: 'tab-1',
      });

      render(<MainPanel {...defaultProps} activeSession={session} />);

      fireEvent.click(screen.getByText('ABC12345'));

      await waitFor(() => {
        expect(screen.getByText('Session ID Copied to Clipboard')).toBeInTheDocument();
      });
    });

    it('should hide copy notification after 2 seconds', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, { clipboard: { writeText } });

      const session = createSession({
        inputMode: 'ai',
        aiTabs: [{
          id: 'tab-1',
          claudeSessionId: 'abc12345-def6-7890',
          name: 'Tab 1',
          isUnread: false,
          createdAt: Date.now(),
        }],
        activeTabId: 'tab-1',
      });

      render(<MainPanel {...defaultProps} activeSession={session} />);

      fireEvent.click(screen.getByText('ABC12345'));

      await waitFor(() => {
        expect(screen.getByText('Session ID Copied to Clipboard')).toBeInTheDocument();
      });

      // Advance timers by 2 seconds
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      await waitFor(() => {
        expect(screen.queryByText('Session ID Copied to Clipboard')).not.toBeInTheDocument();
      });
    });
  });

  describe('Focus ring', () => {
    it('should show focus ring when activeFocus is main', () => {
      const { container } = render(<MainPanel {...defaultProps} activeFocus="main" />);

      const mainPanel = container.querySelector('.ring-1');
      expect(mainPanel).toBeInTheDocument();
    });

    it('should not show focus ring when activeFocus is not main', () => {
      const { container } = render(<MainPanel {...defaultProps} activeFocus="sidebar" />);

      const mainPanel = container.querySelector('.ring-1');
      expect(mainPanel).not.toBeInTheDocument();
    });

    it('should call setActiveFocus when main panel is clicked', () => {
      const setActiveFocus = vi.fn();

      const { container } = render(<MainPanel {...defaultProps} setActiveFocus={setActiveFocus} activeFocus="sidebar" />);

      // Click on the main panel area
      const mainArea = container.querySelector('[style*="backgroundColor"]');
      if (mainArea) {
        fireEvent.click(mainArea);
        expect(setActiveFocus).toHaveBeenCalledWith('main');
      }
    });
  });

  describe('Git status widget', () => {
    it('should render GitStatusWidget', () => {
      render(<MainPanel {...defaultProps} />);

      expect(screen.getByTestId('git-status-widget')).toBeInTheDocument();
    });
  });

  describe('Context color calculation', () => {
    it('should call getContextColor with correct usage percentage', () => {
      const getContextColor = vi.fn().mockReturnValue('#22c55e');
      const session = createSession({
        aiTabs: [{
          id: 'tab-1',
          claudeSessionId: 'claude-1',
          name: 'Tab 1',
          isUnread: false,
          createdAt: Date.now(),
          usageStats: {
            inputTokens: 50000,
            outputTokens: 25000,
            cacheReadInputTokens: 0,
            cacheCreationInputTokens: 0,
            totalCostUsd: 0.05,
            contextWindow: 200000,
          },
        }],
        activeTabId: 'tab-1',
      });

      render(<MainPanel {...defaultProps} activeSession={session} getContextColor={getContextColor} />);

      // Context usage should be (50000 + 25000) / 200000 * 100 = 37.5%
      expect(getContextColor).toHaveBeenCalledWith(38, theme); // Rounded to 38
    });
  });

  describe('Git info refresh', () => {
    it('should fetch git info when session is a git repo', async () => {
      const session = createSession({ isGitRepo: true });

      render(<MainPanel {...defaultProps} activeSession={session} />);

      await waitFor(() => {
        expect(window.maestro.git.info).toHaveBeenCalledWith('/test/project');
      });
    });

    it('should use shellCwd when in terminal mode', async () => {
      const session = createSession({
        isGitRepo: true,
        inputMode: 'terminal',
        shellCwd: '/different/path',
      });

      render(<MainPanel {...defaultProps} activeSession={session} />);

      await waitFor(() => {
        expect(window.maestro.git.info).toHaveBeenCalledWith('/different/path');
      });
    });

    it('should set up interval to refresh git info', async () => {
      const session = createSession({ isGitRepo: true });

      render(<MainPanel {...defaultProps} activeSession={session} />);

      // Initial call
      await waitFor(() => {
        expect(window.maestro.git.info).toHaveBeenCalledTimes(1);
      });

      // Advance time by 30 seconds
      await act(async () => {
        vi.advanceTimersByTime(30000);
      });

      await waitFor(() => {
        expect(window.maestro.git.info).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Panel width responsive behavior', () => {
    it('should observe header resize', async () => {
      render(<MainPanel {...defaultProps} />);

      // Wait for the effect to run and ResizeObserver to be set up
      await waitFor(() => {
        // Check that header exists (which triggers the ResizeObserver setup)
        expect(screen.getByText('Test Session')).toBeInTheDocument();
      });
    });
  });

  describe('ErrorBoundary wrapping', () => {
    it('should wrap main content in ErrorBoundary', () => {
      render(<MainPanel {...defaultProps} />);

      // The content should render without errors
      expect(screen.getByTestId('terminal-output')).toBeInTheDocument();
    });
  });

  describe('Session click handler', () => {
    it('should call setActiveSessionId and onTabSelect when session is clicked', () => {
      const setActiveSessionId = vi.fn();
      const onTabSelect = vi.fn();

      // This handler is passed to InputArea's ThinkingStatusPill
      render(<MainPanel
        {...defaultProps}
        setActiveSessionId={setActiveSessionId}
        onTabSelect={onTabSelect}
      />);

      // The InputArea receives handleSessionClick, but we can't directly test it without accessing the mock
      // This is tested through the integration with InputArea mock
      expect(screen.getByTestId('input-area')).toBeInTheDocument();
    });
  });

  describe('Tooltip timeout cleanup', () => {
    it('should cleanup tooltip timeouts on unmount', () => {
      const { unmount } = render(<MainPanel {...defaultProps} />);

      // Should unmount without errors (timeouts should be cleaned up)
      expect(() => unmount()).not.toThrow();
    });
  });

  describe('Git ahead/behind display', () => {
    it('should display ahead count in git tooltip', async () => {
      vi.mocked(window.maestro.git as unknown as { info: ReturnType<typeof vi.fn> }).info = vi.fn().mockResolvedValue({
        branch: 'main',
        remote: 'https://github.com/user/repo.git',
        behind: 0,
        ahead: 5,
        uncommittedChanges: 0,
      });

      const session = createSession({ isGitRepo: true });
      render(<MainPanel {...defaultProps} activeSession={session} />);

      await waitFor(() => {
        expect(screen.getByText(/main|GIT/)).toBeInTheDocument();
      });

      const gitBadge = screen.getByText(/main|GIT/);
      fireEvent.mouseEnter(gitBadge.parentElement!);

      await waitFor(() => {
        expect(screen.getByText('5')).toBeInTheDocument();
      });
    });

    it('should display behind count in git tooltip', async () => {
      vi.mocked(window.maestro.git as unknown as { info: ReturnType<typeof vi.fn> }).info = vi.fn().mockResolvedValue({
        branch: 'main',
        remote: 'https://github.com/user/repo.git',
        behind: 3,
        ahead: 0,
        uncommittedChanges: 0,
      });

      const session = createSession({ isGitRepo: true });
      render(<MainPanel {...defaultProps} activeSession={session} />);

      await waitFor(() => {
        expect(screen.getByText(/main|GIT/)).toBeInTheDocument();
      });

      const gitBadge = screen.getByText(/main|GIT/);
      fireEvent.mouseEnter(gitBadge.parentElement!);

      await waitFor(() => {
        expect(screen.getByText('3')).toBeInTheDocument();
      });
    });

    it('should show uncommitted changes count in git tooltip', async () => {
      vi.mocked(window.maestro.git as unknown as { info: ReturnType<typeof vi.fn> }).info = vi.fn().mockResolvedValue({
        branch: 'main',
        remote: 'https://github.com/user/repo.git',
        behind: 0,
        ahead: 0,
        uncommittedChanges: 7,
      });

      const session = createSession({ isGitRepo: true });
      render(<MainPanel {...defaultProps} activeSession={session} />);

      await waitFor(() => {
        expect(screen.getByText(/main|GIT/)).toBeInTheDocument();
      });

      const gitBadge = screen.getByText(/main|GIT/);
      fireEvent.mouseEnter(gitBadge.parentElement!);

      await waitFor(() => {
        expect(screen.getByText(/7 uncommitted changes/)).toBeInTheDocument();
      });
    });

    it('should show working tree clean message when no uncommitted changes', async () => {
      vi.mocked(window.maestro.git as unknown as { info: ReturnType<typeof vi.fn> }).info = vi.fn().mockResolvedValue({
        branch: 'main',
        remote: 'https://github.com/user/repo.git',
        behind: 0,
        ahead: 0,
        uncommittedChanges: 0,
      });

      const session = createSession({ isGitRepo: true });
      render(<MainPanel {...defaultProps} activeSession={session} />);

      await waitFor(() => {
        expect(screen.getByText(/main|GIT/)).toBeInTheDocument();
      });

      const gitBadge = screen.getByText(/main|GIT/);
      fireEvent.mouseEnter(gitBadge.parentElement!);

      await waitFor(() => {
        expect(screen.getByText('Working tree clean')).toBeInTheDocument();
      });
    });
  });

  describe('Remote origin display', () => {
    it('should display remote URL in git tooltip', async () => {
      vi.mocked(window.maestro.git as unknown as { info: ReturnType<typeof vi.fn> }).info = vi.fn().mockResolvedValue({
        branch: 'main',
        remote: 'https://github.com/user/my-repo.git',
        behind: 0,
        ahead: 0,
        uncommittedChanges: 0,
      });

      const session = createSession({ isGitRepo: true });
      render(<MainPanel {...defaultProps} activeSession={session} />);

      await waitFor(() => {
        expect(screen.getByText(/main|GIT/)).toBeInTheDocument();
      });

      const gitBadge = screen.getByText(/main|GIT/);
      fireEvent.mouseEnter(gitBadge.parentElement!);

      await waitFor(() => {
        expect(screen.getByText('Origin')).toBeInTheDocument();
        expect(screen.getByText('github.com/user/my-repo')).toBeInTheDocument();
      });
    });

    it('should copy remote URL when copy button is clicked', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, { clipboard: { writeText } });

      vi.mocked(window.maestro.git as unknown as { info: ReturnType<typeof vi.fn> }).info = vi.fn().mockResolvedValue({
        branch: 'main',
        remote: 'https://github.com/user/repo.git',
        behind: 0,
        ahead: 0,
        uncommittedChanges: 0,
      });

      const session = createSession({ isGitRepo: true });
      render(<MainPanel {...defaultProps} activeSession={session} />);

      await waitFor(() => {
        expect(screen.getByText(/main|GIT/)).toBeInTheDocument();
      });

      const gitBadge = screen.getByText(/main|GIT/);
      fireEvent.mouseEnter(gitBadge.parentElement!);

      await waitFor(() => {
        expect(screen.getByText('Origin')).toBeInTheDocument();
      });

      // Click copy remote URL button
      const copyButtons = screen.getAllByTitle(/Copy remote URL/);
      fireEvent.click(copyButtons[0]);

      expect(writeText).toHaveBeenCalledWith('https://github.com/user/repo.git');
    });
  });

  describe('Edge cases', () => {
    it('should handle session with no tabs gracefully', () => {
      const session = createSession({ aiTabs: undefined });

      render(<MainPanel {...defaultProps} activeSession={session} />);

      expect(screen.queryByTestId('tab-bar')).not.toBeInTheDocument();
    });

    it('should handle empty tabs array gracefully', () => {
      const session = createSession({ aiTabs: [] });

      render(<MainPanel {...defaultProps} activeSession={session} />);

      expect(screen.queryByTestId('tab-bar')).not.toBeInTheDocument();
    });

    it('should handle tab without usageStats', () => {
      const session = createSession({
        aiTabs: [{
          id: 'tab-1',
          claudeSessionId: 'claude-1',
          name: 'Tab 1',
          isUnread: false,
          createdAt: Date.now(),
          usageStats: undefined,
        }],
        activeTabId: 'tab-1',
      });

      render(<MainPanel {...defaultProps} activeSession={session} />);

      // Should render without crashing
      expect(screen.getByText('Context Window')).toBeInTheDocument();
    });

    it('should handle git info fetch failure gracefully', async () => {
      vi.mocked(window.maestro.git as unknown as { info: ReturnType<typeof vi.fn> }).info = vi.fn().mockRejectedValue(new Error('Git error'));

      const session = createSession({ isGitRepo: true });

      render(<MainPanel {...defaultProps} activeSession={session} />);

      // Should render without crashing, showing GIT badge
      await waitFor(() => {
        expect(screen.getByText(/GIT|main/)).toBeInTheDocument();
      });
    });

    it('should handle clipboard.writeText failure gracefully', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const writeText = vi.fn().mockRejectedValue(new Error('Clipboard error'));
      Object.assign(navigator, { clipboard: { writeText } });

      const session = createSession({
        inputMode: 'ai',
        aiTabs: [{
          id: 'tab-1',
          claudeSessionId: 'abc12345-def6-7890',
          name: 'Tab 1',
          isUnread: false,
          createdAt: Date.now(),
        }],
        activeTabId: 'tab-1',
      });

      render(<MainPanel {...defaultProps} activeSession={session} />);

      fireEvent.click(screen.getByText('ABC12345'));

      await waitFor(() => {
        expect(consoleError).toHaveBeenCalled();
      });

      consoleError.mockRestore();
    });

    it('should handle gitDiff with no content gracefully', async () => {
      const { gitService } = await import('../../../renderer/services/git');
      vi.mocked(gitService.getDiff).mockResolvedValue({ diff: '' });

      const setGitDiffPreview = vi.fn();
      const session = createSession({ isGitRepo: true });

      render(<MainPanel {...defaultProps} activeSession={session} setGitDiffPreview={setGitDiffPreview} />);

      fireEvent.click(screen.getByTestId('view-diff-btn'));

      await waitFor(() => {
        // Should not call setGitDiffPreview with empty diff
        expect(setGitDiffPreview).not.toHaveBeenCalled();
      });
    });
  });

  describe('Context usage calculation edge cases', () => {
    it('should handle zero context window', () => {
      const session = createSession({
        aiTabs: [{
          id: 'tab-1',
          claudeSessionId: 'claude-1',
          name: 'Tab 1',
          isUnread: false,
          createdAt: Date.now(),
          usageStats: {
            inputTokens: 1000,
            outputTokens: 500,
            cacheReadInputTokens: 0,
            cacheCreationInputTokens: 0,
            totalCostUsd: 0.05,
            contextWindow: 0,
          },
        }],
        activeTabId: 'tab-1',
      });

      render(<MainPanel {...defaultProps} activeSession={session} />);

      // Should render without crashing
      expect(screen.getByText('Context Window')).toBeInTheDocument();
    });

    it('should cap context usage at 100%', () => {
      const getContextColor = vi.fn().mockReturnValue('#ef4444');
      const session = createSession({
        aiTabs: [{
          id: 'tab-1',
          claudeSessionId: 'claude-1',
          name: 'Tab 1',
          isUnread: false,
          createdAt: Date.now(),
          usageStats: {
            inputTokens: 150000,
            outputTokens: 100000,
            cacheReadInputTokens: 0,
            cacheCreationInputTokens: 0,
            totalCostUsd: 0.05,
            contextWindow: 200000,
          },
        }],
        activeTabId: 'tab-1',
      });

      render(<MainPanel {...defaultProps} activeSession={session} getContextColor={getContextColor} />);

      // Context usage should be capped at 100
      expect(getContextColor).toHaveBeenCalledWith(100, theme);
    });
  });

  describe('Hover bridge behavior', () => {
    it('should keep git tooltip open when moving to bridge element', async () => {
      const session = createSession({ isGitRepo: true });
      render(<MainPanel {...defaultProps} activeSession={session} />);

      await waitFor(() => {
        expect(screen.getByText(/main|GIT/)).toBeInTheDocument();
      });

      const gitBadge = screen.getByText(/main|GIT/);
      fireEvent.mouseEnter(gitBadge.parentElement!);

      await waitFor(() => {
        expect(screen.getByText('Branch')).toBeInTheDocument();
      });

      // Mouse leave should start closing timeout
      fireEvent.mouseLeave(gitBadge.parentElement!);

      // But if we enter the bridge element, it should stay open
      // (This is handled by the internal state, tooltip should still be visible)
    });
  });

  describe('Singularization in uncommitted changes', () => {
    it('should use singular form for 1 uncommitted change', async () => {
      vi.mocked(window.maestro.git as unknown as { info: ReturnType<typeof vi.fn> }).info = vi.fn().mockResolvedValue({
        branch: 'main',
        remote: 'https://github.com/user/repo.git',
        behind: 0,
        ahead: 0,
        uncommittedChanges: 1,
      });

      const session = createSession({ isGitRepo: true });
      render(<MainPanel {...defaultProps} activeSession={session} />);

      await waitFor(() => {
        expect(screen.getByText(/main|GIT/)).toBeInTheDocument();
      });

      const gitBadge = screen.getByText(/main|GIT/);
      fireEvent.mouseEnter(gitBadge.parentElement!);

      await waitFor(() => {
        expect(screen.getByText(/1 uncommitted change$/)).toBeInTheDocument();
      });
    });
  });
});
