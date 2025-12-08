/**
 * Tests for ThinkingStatusPill component
 *
 * Tests cover:
 * - Pure helper functions (getWriteModeTab, getSessionDisplayName, formatTokens)
 * - ElapsedTimeDisplay component (timer, formatTime)
 * - SessionRow component (click handling, display name, tokens, time)
 * - AutoRunPill component (stop button, task progress, elapsed time, stopping state)
 * - ThinkingStatusPillInner main logic (AutoRun mode, filtering, null return, primary session,
 *   multiple sessions dropdown, token display, elapsed time, interrupt button)
 * - Memoization (custom arePropsEqual comparison)
 */

import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ThinkingStatusPill } from '../../../renderer/components/ThinkingStatusPill';
import type { Session, Theme, BatchRunState, AITab } from '../../../renderer/types';

// Mock theme for tests
const mockTheme: Theme = {
  id: 'test-theme',
  name: 'Test Theme',
  mode: 'dark',
  colors: {
    bgMain: '#1e1e1e',
    bgSidebar: '#252526',
    bgActivity: '#333333',
    textMain: '#ffffff',
    textDim: '#999999',
    accent: '#007acc',
    border: '#404040',
    error: '#f44747',
    warning: '#cca700',
    success: '#4ec9b0',
    textOnAccent: '#ffffff',
    selectionBg: '#264f78',
    buttonHover: '#2d2d2d',
  },
};

// Helper to create a mock session
function createMockSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    name: 'Test Session',
    cwd: '/test/path',
    projectRoot: '/test/path',
    toolType: 'claude-code',
    state: 'idle',
    inputMode: 'ai',
    aiPid: 0,
    terminalPid: 0,
    aiLogs: [],
    shellLogs: [],
    isGitRepo: false,
    fileTree: [],
    fileExplorerExpanded: [],
    messageQueue: [],
    ...overrides,
  };
}

// Helper to create a mock AITab
function createMockAITab(overrides: Partial<AITab> = {}): AITab {
  return {
    id: 'tab-1',
    name: 'Tab 1',
    state: 'idle',
    claudeSessionId: undefined,
    logs: [],
    unreadCount: 0,
    ...overrides,
  };
}

// Helper to create a busy/thinking session
function createThinkingSession(overrides: Partial<Session> = {}): Session {
  return createMockSession({
    state: 'busy',
    busySource: 'ai',
    thinkingStartTime: Date.now() - 30000, // 30 seconds ago
    currentCycleTokens: 1500,
    claudeSessionId: 'abc12345-def6-7890-ghij-klmnopqrstuv',
    ...overrides,
  });
}

describe('ThinkingStatusPill', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    // Suppress console.log for debug logging in component
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    consoleSpy.mockRestore();
  });

  describe('render conditions', () => {
    it('renders null when no sessions are provided', () => {
      const { container } = render(
        <ThinkingStatusPill
          sessions={[]}
          theme={mockTheme}
        />
      );
      expect(container.firstChild).toBeNull();
    });

    it('renders null when no sessions are thinking', () => {
      const idleSession = createMockSession({ state: 'idle' });
      const { container } = render(
        <ThinkingStatusPill
          sessions={[idleSession]}
          theme={mockTheme}
        />
      );
      expect(container.firstChild).toBeNull();
    });

    it('renders null when session is busy but not from AI source', () => {
      const busyNonAI = createMockSession({
        state: 'busy',
        busySource: 'terminal', // Not AI
      });
      const { container } = render(
        <ThinkingStatusPill
          sessions={[busyNonAI]}
          theme={mockTheme}
        />
      );
      expect(container.firstChild).toBeNull();
    });

    it('renders thinking pill when session is busy with AI source', () => {
      const thinkingSession = createThinkingSession();
      render(
        <ThinkingStatusPill
          sessions={[thinkingSession]}
          theme={mockTheme}
        />
      );
      // Should show the session name
      expect(screen.getByText('Test Session')).toBeInTheDocument();
    });
  });

  describe('formatTokens helper (via UI)', () => {
    it('displays tokens under 1000 as-is', () => {
      const session = createThinkingSession({ currentCycleTokens: 500 });
      render(
        <ThinkingStatusPill
          sessions={[session]}
          theme={mockTheme}
        />
      );
      expect(screen.getByText('500')).toBeInTheDocument();
    });

    it('displays tokens at exactly 1000 in k notation', () => {
      const session = createThinkingSession({ currentCycleTokens: 1000 });
      render(
        <ThinkingStatusPill
          sessions={[session]}
          theme={mockTheme}
        />
      );
      expect(screen.getByText('1.0k')).toBeInTheDocument();
    });

    it('displays tokens over 1000 in k notation with decimal', () => {
      const session = createThinkingSession({ currentCycleTokens: 2500 });
      render(
        <ThinkingStatusPill
          sessions={[session]}
          theme={mockTheme}
        />
      );
      expect(screen.getByText('2.5k')).toBeInTheDocument();
    });

    it('displays large tokens correctly', () => {
      const session = createThinkingSession({ currentCycleTokens: 15700 });
      render(
        <ThinkingStatusPill
          sessions={[session]}
          theme={mockTheme}
        />
      );
      expect(screen.getByText('15.7k')).toBeInTheDocument();
    });

    it('shows "Thinking..." when tokens are 0', () => {
      const session = createThinkingSession({ currentCycleTokens: 0 });
      render(
        <ThinkingStatusPill
          sessions={[session]}
          theme={mockTheme}
        />
      );
      expect(screen.getByText('Thinking...')).toBeInTheDocument();
    });
  });

  describe('ElapsedTimeDisplay component', () => {
    it('displays seconds and minutes', () => {
      const startTime = Date.now() - 75000; // 1m 15s ago
      const session = createThinkingSession({ thinkingStartTime: startTime });
      render(
        <ThinkingStatusPill
          sessions={[session]}
          theme={mockTheme}
        />
      );
      // Should show 1m 15s format
      expect(screen.getByText('1m 15s')).toBeInTheDocument();
    });

    it('displays hours when appropriate', () => {
      const startTime = Date.now() - 3725000; // 1h 2m 5s ago
      const session = createThinkingSession({ thinkingStartTime: startTime });
      render(
        <ThinkingStatusPill
          sessions={[session]}
          theme={mockTheme}
        />
      );
      expect(screen.getByText('1h 2m 5s')).toBeInTheDocument();
    });

    it('displays days when appropriate', () => {
      const startTime = Date.now() - 90061000; // 1d 1h 1m 1s ago
      const session = createThinkingSession({ thinkingStartTime: startTime });
      render(
        <ThinkingStatusPill
          sessions={[session]}
          theme={mockTheme}
        />
      );
      expect(screen.getByText('1d 1h 1m 1s')).toBeInTheDocument();
    });

    it('updates time every second', () => {
      const startTime = Date.now();
      const session = createThinkingSession({ thinkingStartTime: startTime });
      render(
        <ThinkingStatusPill
          sessions={[session]}
          theme={mockTheme}
        />
      );

      // Initially shows 0m 0s
      expect(screen.getByText('0m 0s')).toBeInTheDocument();

      // Advance 3 seconds
      act(() => {
        vi.advanceTimersByTime(3000);
      });

      expect(screen.getByText('0m 3s')).toBeInTheDocument();
    });

    it('cleans up interval on unmount', () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
      const session = createThinkingSession();

      const { unmount } = render(
        <ThinkingStatusPill
          sessions={[session]}
          theme={mockTheme}
        />
      );

      unmount();

      // clearInterval should have been called
      expect(clearIntervalSpy).toHaveBeenCalled();
      clearIntervalSpy.mockRestore();
    });
  });

  describe('getSessionDisplayName (via UI)', () => {
    it('uses namedSessions lookup when available', () => {
      const session = createThinkingSession({
        claudeSessionId: 'abc12345-def6',
      });
      render(
        <ThinkingStatusPill
          sessions={[session]}
          theme={mockTheme}
          namedSessions={{ 'abc12345-def6': 'Custom Name' }}
        />
      );
      // Click target should show custom name
      expect(screen.getByText('Custom Name')).toBeInTheDocument();
    });

    it('falls back to tab name when no namedSession', () => {
      const tab = createMockAITab({
        state: 'busy',
        name: 'My Tab Name',
        claudeSessionId: 'def67890-ghi',
      });
      const session = createThinkingSession({
        aiTabs: [tab],
        claudeSessionId: undefined,
      });
      render(
        <ThinkingStatusPill
          sessions={[session]}
          theme={mockTheme}
        />
      );
      // Should show tab name since no namedSession match
      expect(screen.getByText('My Tab Name')).toBeInTheDocument();
    });

    it('falls back to UUID octet when no tab name', () => {
      const tab = createMockAITab({
        state: 'busy',
        name: '', // Empty name
        claudeSessionId: 'xyz98765-abc',
      });
      const session = createThinkingSession({
        aiTabs: [tab],
        claudeSessionId: undefined,
      });
      render(
        <ThinkingStatusPill
          sessions={[session]}
          theme={mockTheme}
        />
      );
      // Should show first 8 chars of claudeSessionId, uppercased
      expect(screen.getByText('XYZ98765')).toBeInTheDocument();
    });

    it('uses session claudeSessionId when tab has none', () => {
      const session = createThinkingSession({
        claudeSessionId: 'sess1234-5678',
        aiTabs: undefined,
      });
      render(
        <ThinkingStatusPill
          sessions={[session]}
          theme={mockTheme}
        />
      );
      expect(screen.getByText('SESS1234')).toBeInTheDocument();
    });
  });

  describe('primary session display', () => {
    it('shows session name', () => {
      const session = createThinkingSession({ name: 'Primary Session' });
      render(
        <ThinkingStatusPill
          sessions={[session]}
          theme={mockTheme}
        />
      );
      expect(screen.getByText('Primary Session')).toBeInTheDocument();
    });

    it('shows pulsing indicator dot', () => {
      const session = createThinkingSession();
      render(
        <ThinkingStatusPill
          sessions={[session]}
          theme={mockTheme}
        />
      );
      // Should have animate-pulse class on indicator
      const indicator = document.querySelector('.animate-pulse');
      expect(indicator).toBeInTheDocument();
    });

    it('shows Tokens label', () => {
      const session = createThinkingSession({ currentCycleTokens: 100 });
      render(
        <ThinkingStatusPill
          sessions={[session]}
          theme={mockTheme}
        />
      );
      expect(screen.getByText('Tokens:')).toBeInTheDocument();
    });

    it('shows Elapsed label with time', () => {
      const session = createThinkingSession();
      render(
        <ThinkingStatusPill
          sessions={[session]}
          theme={mockTheme}
        />
      );
      expect(screen.getByText('Elapsed:')).toBeInTheDocument();
    });

    it('creates correct tooltip with all info', () => {
      const session = createThinkingSession({
        name: 'Test Name',
        claudeSessionId: 'abc12345',
      });
      render(
        <ThinkingStatusPill
          sessions={[session]}
          theme={mockTheme}
        />
      );
      const nameElement = screen.getByText('Test Name');
      expect(nameElement).toHaveAttribute('title', expect.stringContaining('Test Name'));
      expect(nameElement).toHaveAttribute('title', expect.stringContaining('Claude: abc12345'));
    });
  });

  describe('Claude session ID click handler', () => {
    it('calls onSessionClick when Claude ID is clicked', () => {
      const onSessionClick = vi.fn();
      const session = createThinkingSession({
        id: 'session-123',
        claudeSessionId: 'claude-456',
      });
      render(
        <ThinkingStatusPill
          sessions={[session]}
          theme={mockTheme}
          onSessionClick={onSessionClick}
        />
      );

      const claudeIdButton = screen.getByText('CLAUDE-4');
      fireEvent.click(claudeIdButton);

      expect(onSessionClick).toHaveBeenCalledWith('session-123', undefined);
    });

    it('passes tabId when write-mode tab is available', () => {
      const onSessionClick = vi.fn();
      const tab = createMockAITab({
        id: 'tab-999',
        state: 'busy',
        name: '', // Empty name so it falls back to claudeSessionId
        claudeSessionId: 'tab-claude-id',
      });
      const session = createThinkingSession({
        id: 'session-abc',
        aiTabs: [tab],
        claudeSessionId: undefined, // No session-level claudeSessionId
      });
      render(
        <ThinkingStatusPill
          sessions={[session]}
          theme={mockTheme}
          onSessionClick={onSessionClick}
        />
      );

      // With empty tab name and claudeSessionId, it shows UUID octet uppercased
      const claudeIdButton = screen.getByText('TAB-CLAU');
      fireEvent.click(claudeIdButton);

      expect(onSessionClick).toHaveBeenCalledWith('session-abc', 'tab-999');
    });
  });

  describe('interrupt button', () => {
    it('renders stop button when onInterrupt is provided', () => {
      const session = createThinkingSession();
      render(
        <ThinkingStatusPill
          sessions={[session]}
          theme={mockTheme}
          onInterrupt={() => {}}
        />
      );
      expect(screen.getByText('Stop')).toBeInTheDocument();
    });

    it('does not render stop button when onInterrupt is not provided', () => {
      const session = createThinkingSession();
      render(
        <ThinkingStatusPill
          sessions={[session]}
          theme={mockTheme}
        />
      );
      expect(screen.queryByText('Stop')).not.toBeInTheDocument();
    });

    it('calls onInterrupt when stop button is clicked', () => {
      const onInterrupt = vi.fn();
      const session = createThinkingSession();
      render(
        <ThinkingStatusPill
          sessions={[session]}
          theme={mockTheme}
          onInterrupt={onInterrupt}
        />
      );

      fireEvent.click(screen.getByText('Stop'));
      expect(onInterrupt).toHaveBeenCalledTimes(1);
    });

    it('has correct title attribute', () => {
      const session = createThinkingSession();
      render(
        <ThinkingStatusPill
          sessions={[session]}
          theme={mockTheme}
          onInterrupt={() => {}}
        />
      );
      expect(screen.getByTitle('Interrupt Claude (Ctrl+C)')).toBeInTheDocument();
    });
  });

  describe('multiple thinking sessions', () => {
    it('shows +N indicator when multiple sessions are thinking', () => {
      const sessions = [
        createThinkingSession({ id: 'sess-1', name: 'Session 1' }),
        createThinkingSession({ id: 'sess-2', name: 'Session 2' }),
        createThinkingSession({ id: 'sess-3', name: 'Session 3' }),
      ];
      render(
        <ThinkingStatusPill
          sessions={sessions}
          theme={mockTheme}
        />
      );
      // Should show +2 (excluding the primary session)
      expect(screen.getByText('+2')).toBeInTheDocument();
    });

    it('has correct tooltip on +N indicator', () => {
      const sessions = [
        createThinkingSession({ id: 'sess-1' }),
        createThinkingSession({ id: 'sess-2' }),
      ];
      render(
        <ThinkingStatusPill
          sessions={sessions}
          theme={mockTheme}
        />
      );
      expect(screen.getByTitle('+1 more thinking')).toBeInTheDocument();
    });

    it('expands dropdown on mouse enter', () => {
      const sessions = [
        createThinkingSession({ id: 'sess-1', name: 'Primary' }),
        createThinkingSession({ id: 'sess-2', name: 'Secondary' }),
      ];
      render(
        <ThinkingStatusPill
          sessions={sessions}
          theme={mockTheme}
        />
      );

      const indicator = screen.getByText('+1').parentElement!;
      fireEvent.mouseEnter(indicator);

      // State update is synchronous
      expect(screen.getByText('All Thinking Sessions')).toBeInTheDocument();
    });

    it('closes dropdown on mouse leave', () => {
      const sessions = [
        createThinkingSession({ id: 'sess-1', name: 'Primary' }),
        createThinkingSession({ id: 'sess-2', name: 'Secondary' }),
      ];
      render(
        <ThinkingStatusPill
          sessions={sessions}
          theme={mockTheme}
        />
      );

      const indicator = screen.getByText('+1').parentElement!;
      fireEvent.mouseEnter(indicator);

      expect(screen.getByText('All Thinking Sessions')).toBeInTheDocument();

      fireEvent.mouseLeave(indicator);

      expect(screen.queryByText('All Thinking Sessions')).not.toBeInTheDocument();
    });

    it('shows all thinking sessions in dropdown', () => {
      const sessions = [
        createThinkingSession({ id: 'sess-1', name: 'Session Alpha' }),
        createThinkingSession({ id: 'sess-2', name: 'Session Beta' }),
        createThinkingSession({ id: 'sess-3', name: 'Session Gamma' }),
      ];
      render(
        <ThinkingStatusPill
          sessions={sessions}
          theme={mockTheme}
        />
      );

      const indicator = screen.getByText('+2').parentElement!;
      fireEvent.mouseEnter(indicator);

      expect(screen.getByText('All Thinking Sessions')).toBeInTheDocument();
      // Session Alpha appears twice - once in primary pill, once in dropdown
      expect(screen.getAllByText('Session Alpha').length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText('Session Beta')).toBeInTheDocument();
      expect(screen.getByText('Session Gamma')).toBeInTheDocument();
    });
  });

  describe('SessionRow component (via dropdown)', () => {
    it('calls onSessionClick with session ID and tab ID when clicked', () => {
      const onSessionClick = vi.fn();
      const tab = createMockAITab({ id: 'tab-xyz', state: 'busy' });
      const sessions = [
        createThinkingSession({ id: 'sess-1', name: 'Session 1', aiTabs: [tab] }),
        createThinkingSession({ id: 'sess-2', name: 'Session 2' }),
      ];
      render(
        <ThinkingStatusPill
          sessions={sessions}
          theme={mockTheme}
          onSessionClick={onSessionClick}
        />
      );

      const indicator = screen.getByText('+1').parentElement!;
      fireEvent.mouseEnter(indicator);

      // Click on the first session row in dropdown
      const rows = screen.getAllByRole('button');
      const sessionRow = rows.find(row => row.textContent?.includes('Session 1'));
      expect(sessionRow).toBeDefined();
      fireEvent.click(sessionRow!);

      expect(onSessionClick).toHaveBeenCalledWith('sess-1', 'tab-xyz');
    });

    it('shows tokens when available in session row', () => {
      const sessions = [
        createThinkingSession({ id: 'sess-1', name: 'Primary' }),
        createThinkingSession({ id: 'sess-2', name: 'Secondary', currentCycleTokens: 5000 }),
      ];
      render(
        <ThinkingStatusPill
          sessions={sessions}
          theme={mockTheme}
        />
      );

      const indicator = screen.getByText('+1').parentElement!;
      fireEvent.mouseEnter(indicator);

      // 5000 tokens = 5.0k
      expect(screen.getByText('5.0k')).toBeInTheDocument();
    });

    it('shows elapsed time in session row', () => {
      const sessions = [
        createThinkingSession({ id: 'sess-1', name: 'Primary' }),
        createThinkingSession({
          id: 'sess-2',
          name: 'Secondary',
          thinkingStartTime: Date.now() - 120000, // 2 minutes
        }),
      ];
      render(
        <ThinkingStatusPill
          sessions={sessions}
          theme={mockTheme}
        />
      );

      const indicator = screen.getByText('+1').parentElement!;
      fireEvent.mouseEnter(indicator);

      expect(screen.getByText('2m 0s')).toBeInTheDocument();
    });
  });

  describe('AutoRun mode', () => {
    it('shows AutoRunPill when autoRunState.isRunning is true', () => {
      const sessions = [createMockSession()];
      const autoRunState: BatchRunState = {
        isRunning: true,
        isPaused: false,
        isStopping: false,
        currentTaskIndex: 0,
        totalTasks: 5,
        completedTasks: 2,
        startTime: Date.now() - 60000,
        tasks: [],
        batchName: 'Test Batch',
      };
      render(
        <ThinkingStatusPill
          sessions={sessions}
          theme={mockTheme}
          autoRunState={autoRunState}
        />
      );
      expect(screen.getByText('AutoRun')).toBeInTheDocument();
    });

    it('shows task progress in AutoRunPill', () => {
      const autoRunState: BatchRunState = {
        isRunning: true,
        isPaused: false,
        isStopping: false,
        currentTaskIndex: 2,
        totalTasks: 10,
        completedTasks: 3,
        startTime: Date.now(),
        tasks: [],
        batchName: 'Batch',
      };
      render(
        <ThinkingStatusPill
          sessions={[]}
          theme={mockTheme}
          autoRunState={autoRunState}
        />
      );
      expect(screen.getByText('Tasks:')).toBeInTheDocument();
      expect(screen.getByText('3/10')).toBeInTheDocument();
    });

    it('shows elapsed time in AutoRunPill', () => {
      const autoRunState: BatchRunState = {
        isRunning: true,
        isPaused: false,
        isStopping: false,
        currentTaskIndex: 0,
        totalTasks: 5,
        completedTasks: 0,
        startTime: Date.now() - 45000, // 45 seconds ago
        tasks: [],
        batchName: 'Batch',
      };
      render(
        <ThinkingStatusPill
          sessions={[]}
          theme={mockTheme}
          autoRunState={autoRunState}
        />
      );
      expect(screen.getByText('Elapsed:')).toBeInTheDocument();
      expect(screen.getByText('0m 45s')).toBeInTheDocument();
    });

    it('shows stop button in AutoRunPill when onStopAutoRun is provided', () => {
      const autoRunState: BatchRunState = {
        isRunning: true,
        isPaused: false,
        isStopping: false,
        currentTaskIndex: 0,
        totalTasks: 5,
        completedTasks: 0,
        startTime: Date.now(),
        tasks: [],
        batchName: 'Batch',
      };
      render(
        <ThinkingStatusPill
          sessions={[]}
          theme={mockTheme}
          autoRunState={autoRunState}
          onStopAutoRun={() => {}}
        />
      );
      expect(screen.getByText('Stop')).toBeInTheDocument();
    });

    it('calls onStopAutoRun when stop button is clicked', () => {
      const onStopAutoRun = vi.fn();
      const autoRunState: BatchRunState = {
        isRunning: true,
        isPaused: false,
        isStopping: false,
        currentTaskIndex: 0,
        totalTasks: 5,
        completedTasks: 0,
        startTime: Date.now(),
        tasks: [],
        batchName: 'Batch',
      };
      render(
        <ThinkingStatusPill
          sessions={[]}
          theme={mockTheme}
          autoRunState={autoRunState}
          onStopAutoRun={onStopAutoRun}
        />
      );
      fireEvent.click(screen.getByText('Stop'));
      expect(onStopAutoRun).toHaveBeenCalledTimes(1);
    });

    it('shows "AutoRun Stopping..." when isStopping is true', () => {
      const autoRunState: BatchRunState = {
        isRunning: true,
        isPaused: false,
        isStopping: true,
        currentTaskIndex: 0,
        totalTasks: 5,
        completedTasks: 0,
        startTime: Date.now(),
        tasks: [],
        batchName: 'Batch',
      };
      render(
        <ThinkingStatusPill
          sessions={[]}
          theme={mockTheme}
          autoRunState={autoRunState}
          onStopAutoRun={() => {}}
        />
      );
      expect(screen.getByText('AutoRun Stopping...')).toBeInTheDocument();
    });

    it('shows "Stopping" button text when isStopping', () => {
      const autoRunState: BatchRunState = {
        isRunning: true,
        isPaused: false,
        isStopping: true,
        currentTaskIndex: 0,
        totalTasks: 5,
        completedTasks: 0,
        startTime: Date.now(),
        tasks: [],
        batchName: 'Batch',
      };
      render(
        <ThinkingStatusPill
          sessions={[]}
          theme={mockTheme}
          autoRunState={autoRunState}
          onStopAutoRun={() => {}}
        />
      );
      expect(screen.getByText('Stopping')).toBeInTheDocument();
    });

    it('disables stop button when isStopping', () => {
      const autoRunState: BatchRunState = {
        isRunning: true,
        isPaused: false,
        isStopping: true,
        currentTaskIndex: 0,
        totalTasks: 5,
        completedTasks: 0,
        startTime: Date.now(),
        tasks: [],
        batchName: 'Batch',
      };
      render(
        <ThinkingStatusPill
          sessions={[]}
          theme={mockTheme}
          autoRunState={autoRunState}
          onStopAutoRun={() => {}}
        />
      );
      const stopButton = screen.getByText('Stopping').closest('button');
      expect(stopButton).toBeDisabled();
    });

    it('uses Date.now() as fallback when startTime is undefined', () => {
      const autoRunState: BatchRunState = {
        isRunning: true,
        isPaused: false,
        isStopping: false,
        currentTaskIndex: 0,
        totalTasks: 5,
        completedTasks: 0,
        startTime: undefined as unknown as number, // Simulate undefined
        tasks: [],
        batchName: 'Batch',
      };
      render(
        <ThinkingStatusPill
          sessions={[]}
          theme={mockTheme}
          autoRunState={autoRunState}
        />
      );
      // Should show 0m 0s since startTime defaults to now
      expect(screen.getByText('0m 0s')).toBeInTheDocument();
    });

    it('prioritizes AutoRun over thinking sessions', () => {
      const thinkingSession = createThinkingSession({ name: 'Thinking Session' });
      const autoRunState: BatchRunState = {
        isRunning: true,
        isPaused: false,
        isStopping: false,
        currentTaskIndex: 0,
        totalTasks: 5,
        completedTasks: 0,
        startTime: Date.now(),
        tasks: [],
        batchName: 'Batch',
      };
      render(
        <ThinkingStatusPill
          sessions={[thinkingSession]}
          theme={mockTheme}
          autoRunState={autoRunState}
        />
      );
      // Should show AutoRun, not thinking session
      expect(screen.getByText('AutoRun')).toBeInTheDocument();
      expect(screen.queryByText('Thinking Session')).not.toBeInTheDocument();
    });
  });

  describe('getWriteModeTab helper (via UI)', () => {
    it('uses tab with busy state for display', () => {
      const idleTab = createMockAITab({ id: 'idle-tab', name: 'Idle Tab', state: 'idle' });
      const busyTab = createMockAITab({
        id: 'busy-tab',
        name: 'Busy Tab',
        state: 'busy',
        claudeSessionId: 'busy-claude-id',
      });
      const session = createThinkingSession({
        aiTabs: [idleTab, busyTab],
        claudeSessionId: undefined,
      });
      render(
        <ThinkingStatusPill
          sessions={[session]}
          theme={mockTheme}
        />
      );
      // Should use the busy tab's name
      expect(screen.getByText('Busy Tab')).toBeInTheDocument();
    });

    it('uses tab thinkingStartTime over session thinkingStartTime', () => {
      const busyTab = createMockAITab({
        id: 'busy-tab',
        state: 'busy',
        thinkingStartTime: Date.now() - 90000, // 1m 30s
      });
      const session = createThinkingSession({
        aiTabs: [busyTab],
        thinkingStartTime: Date.now() - 30000, // 30s (would show 0m 30s if used)
      });
      render(
        <ThinkingStatusPill
          sessions={[session]}
          theme={mockTheme}
        />
      );
      // Should show 1m 30s from tab, not 0m 30s from session
      expect(screen.getByText('1m 30s')).toBeInTheDocument();
    });
  });

  describe('styling', () => {
    it('applies warning color to pulsing indicator in thinking mode', () => {
      const session = createThinkingSession();
      render(
        <ThinkingStatusPill
          sessions={[session]}
          theme={mockTheme}
        />
      );
      const indicator = document.querySelector('.animate-pulse');
      expect(indicator).toHaveStyle({ backgroundColor: mockTheme.colors.warning });
    });

    it('applies accent color to pulsing indicator in AutoRun mode', () => {
      const autoRunState: BatchRunState = {
        isRunning: true,
        isPaused: false,
        isStopping: false,
        currentTaskIndex: 0,
        totalTasks: 5,
        completedTasks: 0,
        startTime: Date.now(),
        tasks: [],
        batchName: 'Batch',
      };
      render(
        <ThinkingStatusPill
          sessions={[]}
          theme={mockTheme}
          autoRunState={autoRunState}
        />
      );
      const indicator = document.querySelector('.animate-pulse');
      expect(indicator).toHaveStyle({ backgroundColor: mockTheme.colors.accent });
    });

    it('applies error color to stop button', () => {
      const session = createThinkingSession();
      render(
        <ThinkingStatusPill
          sessions={[session]}
          theme={mockTheme}
          onInterrupt={() => {}}
        />
      );
      const stopButton = screen.getByText('Stop').closest('button');
      expect(stopButton).toHaveStyle({ backgroundColor: mockTheme.colors.error });
    });

    it('applies accent color to Claude ID button', () => {
      const session = createThinkingSession({ claudeSessionId: 'test-id' });
      render(
        <ThinkingStatusPill
          sessions={[session]}
          theme={mockTheme}
        />
      );
      const claudeButton = screen.getByText('TEST-ID');
      expect(claudeButton).toHaveStyle({ color: mockTheme.colors.accent });
    });
  });

  describe('memoization (arePropsEqual)', () => {
    // We can test memoization behavior by checking re-renders don't happen unnecessarily
    it('re-renders when autoRunState.isRunning changes', () => {
      const { rerender } = render(
        <ThinkingStatusPill
          sessions={[]}
          theme={mockTheme}
          autoRunState={{ isRunning: false } as BatchRunState}
        />
      );

      // Should not show AutoRun initially
      expect(screen.queryByText('AutoRun')).not.toBeInTheDocument();

      rerender(
        <ThinkingStatusPill
          sessions={[]}
          theme={mockTheme}
          autoRunState={{
            isRunning: true,
            completedTasks: 0,
            totalTasks: 5,
            startTime: Date.now(),
          } as BatchRunState}
        />
      );

      // Should show AutoRun after change
      expect(screen.getByText('AutoRun')).toBeInTheDocument();
    });

    it('re-renders when thinking session count changes', () => {
      const session1 = createThinkingSession({ id: 'sess-1', name: 'Session 1' });
      const session2 = createThinkingSession({ id: 'sess-2', name: 'Session 2' });

      const { rerender } = render(
        <ThinkingStatusPill
          sessions={[session1]}
          theme={mockTheme}
        />
      );

      expect(screen.queryByText('+1')).not.toBeInTheDocument();

      rerender(
        <ThinkingStatusPill
          sessions={[session1, session2]}
          theme={mockTheme}
        />
      );

      expect(screen.getByText('+1')).toBeInTheDocument();
    });

    it('re-renders when session property changes', () => {
      const session = createThinkingSession({ currentCycleTokens: 500 });

      const { rerender } = render(
        <ThinkingStatusPill
          sessions={[session]}
          theme={mockTheme}
        />
      );

      expect(screen.getByText('500')).toBeInTheDocument();

      rerender(
        <ThinkingStatusPill
          sessions={[{ ...session, currentCycleTokens: 1500 }]}
          theme={mockTheme}
        />
      );

      expect(screen.getByText('1.5k')).toBeInTheDocument();
    });

    it('re-renders when theme changes', () => {
      const session = createThinkingSession();
      const newTheme = {
        ...mockTheme,
        colors: { ...mockTheme.colors, accent: '#ff0000' },
      };

      const { rerender } = render(
        <ThinkingStatusPill
          sessions={[session]}
          theme={mockTheme}
        />
      );

      rerender(
        <ThinkingStatusPill
          sessions={[session]}
          theme={newTheme}
        />
      );

      // Component should have re-rendered with new theme
      const claudeButton = screen.getByText(/[A-Z0-9]{8}/);
      expect(claudeButton).toHaveStyle({ color: '#ff0000' });
    });

    it('re-renders when namedSessions changes for thinking session', () => {
      const session = createThinkingSession({
        claudeSessionId: 'abc12345',
      });

      const { rerender } = render(
        <ThinkingStatusPill
          sessions={[session]}
          theme={mockTheme}
          namedSessions={{}}
        />
      );

      expect(screen.getByText('ABC12345')).toBeInTheDocument();

      rerender(
        <ThinkingStatusPill
          sessions={[session]}
          theme={mockTheme}
          namedSessions={{ abc12345: 'Custom Name' }}
        />
      );

      expect(screen.getByText('Custom Name')).toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    it('handles session with no claudeSessionId', () => {
      const session = createThinkingSession({
        claudeSessionId: undefined,
        aiTabs: undefined,
      });
      render(
        <ThinkingStatusPill
          sessions={[session]}
          theme={mockTheme}
        />
      );
      // Should still render, just without Claude ID
      expect(screen.getByText('Test Session')).toBeInTheDocument();
    });

    it('handles session with no thinkingStartTime', () => {
      const session = createThinkingSession({
        thinkingStartTime: undefined,
      });
      render(
        <ThinkingStatusPill
          sessions={[session]}
          theme={mockTheme}
        />
      );
      // Should still render, just without elapsed time
      expect(screen.getByText('Test Session')).toBeInTheDocument();
      expect(screen.queryByText('Elapsed:')).not.toBeInTheDocument();
    });

    it('handles special characters in session names', () => {
      const session = createThinkingSession({
        name: '<script>alert("xss")</script>',
      });
      render(
        <ThinkingStatusPill
          sessions={[session]}
          theme={mockTheme}
        />
      );
      // Should display safely escaped
      expect(screen.getByText('<script>alert("xss")</script>')).toBeInTheDocument();
    });

    it('handles unicode in session names', () => {
      const session = createThinkingSession({ name: '🎼 Maestro Session' });
      render(
        <ThinkingStatusPill
          sessions={[session]}
          theme={mockTheme}
        />
      );
      expect(screen.getByText('🎼 Maestro Session')).toBeInTheDocument();
    });

    it('handles very long session names', () => {
      const session = createThinkingSession({
        name: 'This is a very long session name that might cause layout issues',
      });
      render(
        <ThinkingStatusPill
          sessions={[session]}
          theme={mockTheme}
        />
      );
      expect(screen.getByText('This is a very long session name that might cause layout issues')).toBeInTheDocument();
    });

    it('handles large token counts', () => {
      const session = createThinkingSession({ currentCycleTokens: 999999 });
      render(
        <ThinkingStatusPill
          sessions={[session]}
          theme={mockTheme}
        />
      );
      expect(screen.getByText('1000.0k')).toBeInTheDocument();
    });

    it('handles session with empty aiTabs array', () => {
      const session = createThinkingSession({ aiTabs: [] });
      render(
        <ThinkingStatusPill
          sessions={[session]}
          theme={mockTheme}
        />
      );
      // Should still render, using session's claudeSessionId
      expect(screen.getByText('Test Session')).toBeInTheDocument();
    });

    it('handles mixed busy and idle sessions', () => {
      const sessions = [
        createMockSession({ id: 'idle-1', name: 'Idle 1', state: 'idle' }),
        createThinkingSession({ id: 'busy-1', name: 'Busy 1' }),
        createMockSession({ id: 'idle-2', name: 'Idle 2', state: 'idle' }),
        createThinkingSession({ id: 'busy-2', name: 'Busy 2' }),
      ];
      render(
        <ThinkingStatusPill
          sessions={sessions}
          theme={mockTheme}
        />
      );
      // Should show primary (Busy 1) and +1 indicator (Busy 2)
      expect(screen.getByText('Busy 1')).toBeInTheDocument();
      expect(screen.getByText('+1')).toBeInTheDocument();
    });

    it('handles rapid state changes', () => {
      const session = createThinkingSession();
      const { rerender } = render(
        <ThinkingStatusPill
          sessions={[session]}
          theme={mockTheme}
        />
      );

      // Rapidly toggle through states
      for (let i = 0; i < 10; i++) {
        rerender(
          <ThinkingStatusPill
            sessions={[{ ...session, currentCycleTokens: i * 100 }]}
            theme={mockTheme}
          />
        );
      }

      // Should show final state
      expect(screen.getByText('900')).toBeInTheDocument();
    });
  });

  describe('debug logging', () => {
    it('logs state check when busy sessions exist', () => {
      const session = createThinkingSession();
      render(
        <ThinkingStatusPill
          sessions={[session]}
          theme={mockTheme}
        />
      );

      // Console.log should have been called with state check info
      expect(consoleSpy).toHaveBeenCalledWith(
        '[ThinkingStatusPill] State check:',
        expect.objectContaining({
          thinkingCount: 1,
          busySessionsCount: 1,
        })
      );
    });

    it('logs when sessions have busy tabs but session not busy', () => {
      const busyTab = createMockAITab({ state: 'busy' });
      const session = createMockSession({
        state: 'idle', // Session is idle
        aiTabs: [busyTab], // But has busy tab
      });
      render(
        <ThinkingStatusPill
          sessions={[session]}
          theme={mockTheme}
        />
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        '[ThinkingStatusPill] State check:',
        expect.objectContaining({
          sessionsWithBusyTabsCount: 1,
        })
      );
    });
  });

  describe('component display names', () => {
    it('ThinkingStatusPill has correct displayName', () => {
      expect(ThinkingStatusPill.displayName).toBe('ThinkingStatusPill');
    });
  });
});
