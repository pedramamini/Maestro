import { useCallback, useRef } from 'react';
import type { Session, SessionState, LogEntry, UsageStats } from '../types';
import { createTab, getActiveTab } from '../utils/tabHelpers';
import { generateId } from '../utils/ids';
import type { RightPanelHandle } from '../components/RightPanel';

/**
 * History entry for the addHistoryEntry function.
 */
export interface HistoryEntryInput {
  type: 'AUTO' | 'USER';
  summary: string;
  fullResponse?: string;
  agentSessionId?: string;
  usageStats?: UsageStats;
  /** Optional override for background operations (prevents cross-agent bleed) */
  sessionId?: string;
  /** Optional override for background operations (prevents cross-agent bleed) */
  projectPath?: string;
  /** Optional override for background operations (prevents cross-agent bleed) */
  sessionName?: string;
}

/**
 * Dependencies for the useAgentSessionManagement hook.
 */
export interface UseAgentSessionManagementDeps {
  /** Current active session (null if none selected) */
  activeSession: Session | null;
  /** Session state setter */
  setSessions: React.Dispatch<React.SetStateAction<Session[]>>;
  /** Agent session ID setter */
  setActiveAgentSessionId: (id: string | null) => void;
  /** Agent sessions browser open state setter */
  setAgentSessionsOpen: (open: boolean) => void;
  /** Helper to add a log entry to the active tab */
  addLogToActiveTab: (
    sessionId: string,
    logEntry: Omit<LogEntry, 'id' | 'timestamp'> & { id?: string; timestamp?: number }
  ) => void;
  /** Ref to the right panel for refreshing history */
  rightPanelRef: React.RefObject<RightPanelHandle | null>;
  /** Default value for saveToHistory on new tabs */
  defaultSaveToHistory: boolean;
}

/**
 * Return type for useAgentSessionManagement hook.
 */
export interface UseAgentSessionManagementReturn {
  /** Add a history entry for the current session */
  addHistoryEntry: (entry: HistoryEntryInput) => Promise<void>;
  /** Ref to addHistoryEntry for use in callbacks that need latest version */
  addHistoryEntryRef: React.MutableRefObject<((entry: HistoryEntryInput) => Promise<void>) | null>;
  /** Clear Agent session and start fresh */
  startNewAgentSession: () => void;
  /** Ref to startNewAgentSession for use in callbacks that need latest version */
  startNewAgentSessionRef: React.MutableRefObject<(() => void) | null>;
  /** Jump to a specific agent session in the browser */
  handleJumpToAgentSession: (agentSessionId: string) => void;
  /** Resume a Agent session, opening as a new tab or switching to existing */
  handleResumeSession: (
    agentSessionId: string,
    providedMessages?: LogEntry[],
    sessionName?: string,
    starred?: boolean
  ) => Promise<void>;
}

/**
 * Hook for Agent-specific session operations.
 *
 * Handles:
 * - Adding history entries with session metadata
 * - Starting new Agent sessions (clearing context)
 * - Jumping to Agent sessions in the browser
 * - Resuming saved Agent sessions as tabs
 *
 * @param deps - Hook dependencies
 * @returns Session management functions and refs
 */
export function useAgentSessionManagement(
  deps: UseAgentSessionManagementDeps
): UseAgentSessionManagementReturn {
  const {
    activeSession,
    setSessions,
    setActiveAgentSessionId,
    setAgentSessionsOpen,
    addLogToActiveTab,
    rightPanelRef,
    defaultSaveToHistory,
  } = deps;

  // Refs for functions that need to be accessed from other callbacks
  const addHistoryEntryRef = useRef<((entry: HistoryEntryInput) => Promise<void>) | null>(null);
  const startNewAgentSessionRef = useRef<(() => void) | null>(null);

  /**
   * Add a history entry for a session.
   * Uses provided session info or falls back to active session.
   */
  const addHistoryEntry = useCallback(async (entry: HistoryEntryInput) => {
    // Use provided values or fall back to activeSession
    const targetSessionId = entry.sessionId || activeSession?.id;
    const targetProjectPath = entry.projectPath || activeSession?.cwd;

    if (!targetSessionId || !targetProjectPath) return;

    // Get session name from entry, or from active tab if using activeSession
    let sessionName = entry.sessionName;
    if (!sessionName && activeSession && !entry.sessionId) {
      const activeTab = getActiveTab(activeSession);
      sessionName = activeTab?.name;
    }

    await window.maestro.history.add({
      id: generateId(),
      type: entry.type,
      timestamp: Date.now(),
      summary: entry.summary,
      fullResponse: entry.fullResponse,
      agentSessionId: entry.agentSessionId,
      sessionId: targetSessionId,
      sessionName: sessionName,
      projectPath: targetProjectPath,
      contextUsage: activeSession?.contextUsage,
      // Only include usageStats if explicitly provided (per-task tracking)
      // Never use cumulative session stats - they're lifetime totals
      usageStats: entry.usageStats
    });

    // Refresh history panel to show the new entry
    rightPanelRef.current?.refreshHistoryPanel();
  }, [activeSession, rightPanelRef]);

  /**
   * Start a new Agent session by clearing the current context.
   * Blocks if there are queued items.
   */
  const startNewAgentSession = useCallback(() => {
    if (!activeSession) return;

    // Block clearing when there are queued items
    if (activeSession.executionQueue.length > 0) {
      addLogToActiveTab(activeSession.id, {
        source: 'system',
        text: 'Cannot clear session while items are queued. Remove queued items first.'
      });
      return;
    }

    setSessions(prev => prev.map(s => {
      if (s.id !== activeSession.id) return s;
      // Reset active tab's state to 'idle' for write-mode tracking
      const updatedAiTabs = s.aiTabs?.length > 0
        ? s.aiTabs.map(tab =>
            tab.id === s.activeTabId ? { ...tab, state: 'idle' as const, thinkingStartTime: undefined } : tab
          )
        : s.aiTabs;
      return {
        ...s,
        agentSessionId: undefined,
        aiLogs: [],
        state: 'idle' as SessionState,
        busySource: undefined,
        thinkingStartTime: undefined,
        aiTabs: updatedAiTabs
      };
    }));
    setActiveAgentSessionId(null);
  }, [activeSession, addLogToActiveTab, setSessions, setActiveAgentSessionId]);

  /**
   * Jump to a specific agent session in the agent sessions browser.
   */
  const handleJumpToAgentSession = useCallback((agentSessionId: string) => {
    // Set the agent session ID and load its messages
    if (activeSession) {
      setActiveAgentSessionId(agentSessionId);
      // Open the agent sessions browser to show the selected session
      setAgentSessionsOpen(true);
    }
  }, [activeSession, setActiveAgentSessionId, setAgentSessionsOpen]);

  /**
   * Resume an agent session - opens as a new tab or switches to existing tab.
   * Loads messages from the session and looks up metadata (starred, name).
   */
  const handleResumeSession = useCallback(async (
    agentSessionId: string,
    providedMessages?: LogEntry[],
    sessionName?: string,
    starred?: boolean
  ) => {
    if (!activeSession?.cwd) return;

    // Check if a tab with this agentSessionId already exists
    const existingTab = activeSession.aiTabs?.find(tab => tab.agentSessionId === agentSessionId);
    if (existingTab) {
      // Switch to the existing tab instead of creating a duplicate
      setSessions(prev => prev.map(s =>
        s.id === activeSession.id
          ? { ...s, activeTabId: existingTab.id, inputMode: 'ai' }
          : s
      ));
      setActiveAgentSessionId(agentSessionId);
      return;
    }

    try {
      // Use provided messages or fetch them
      let messages: LogEntry[];
      if (providedMessages && providedMessages.length > 0) {
        messages = providedMessages;
      } else {
        // Load the session messages using the generic agentSessions API
        const agentId = activeSession.toolType || 'claude-code';
        const result = await window.maestro.agentSessions.read(
          agentId,
          activeSession.cwd,
          agentSessionId,
          { offset: 0, limit: 100 }
        );

        // Convert to log entries
        messages = result.messages.map((msg: { type: string; content: string; timestamp: string; uuid: string }) => ({
          id: msg.uuid || generateId(),
          timestamp: new Date(msg.timestamp).getTime(),
          source: msg.type === 'user' ? 'user' as const : 'stdout' as const,
          text: msg.content || ''
        }));
      }

      // Look up starred status and session name from stores if not provided
      let isStarred = starred ?? false;
      let name = sessionName ?? null;

      if (!starred && !sessionName && activeSession.toolType === 'claude-code') {
        try {
          // Look up session metadata from session origins (name and starred)
          // Note: getSessionOrigins is still Claude-specific until we add generic origin tracking
          // Use projectRoot (not cwd) for consistent session storage access
          const origins = await window.maestro.claude.getSessionOrigins(activeSession.projectRoot);
          const originData = origins[agentSessionId];
          if (originData && typeof originData === 'object') {
            if (originData.sessionName) {
              name = originData.sessionName;
            }
            if (originData.starred !== undefined) {
              isStarred = originData.starred;
            }
          }
        } catch (error) {
          console.warn('[handleResumeSession] Failed to lookup starred/named status:', error);
        }
      }

      // Update the session and switch to AI mode
      // IMPORTANT: Use functional update to get fresh session state and avoid race conditions
      setSessions(prev => prev.map(s => {
        if (s.id !== activeSession.id) return s;

        // Create tab from the CURRENT session state (not stale closure value)
        const result = createTab(s, {
          agentSessionId,
          logs: messages,
          name,
          starred: isStarred,
          saveToHistory: defaultSaveToHistory
        });
        if (!result) return s;

        return { ...result.session, inputMode: 'ai' };
      }));
      setActiveAgentSessionId(agentSessionId);
    } catch (error) {
      console.error('Failed to resume session:', error);
    }
  }, [activeSession?.cwd, activeSession?.id, activeSession?.aiTabs, activeSession?.toolType, setSessions, setActiveAgentSessionId, defaultSaveToHistory]);

  // Update refs for slash command functions (so other handlers can access latest versions)
  addHistoryEntryRef.current = addHistoryEntry;
  startNewAgentSessionRef.current = startNewAgentSession;

  return {
    addHistoryEntry,
    addHistoryEntryRef,
    startNewAgentSession,
    startNewAgentSessionRef,
    handleJumpToAgentSession,
    handleResumeSession,
  };
}
