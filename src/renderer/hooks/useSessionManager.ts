import { useState, useEffect, useMemo } from 'react';
import type { Session, Group } from '../types';
import { gitService } from '../services/git';

// Maximum number of log entries to persist per AI tab
const MAX_PERSISTED_LOGS_PER_TAB = 100;

// Strip leading emojis from a string for alphabetical sorting
const stripLeadingEmojis = (str: string): string => {
  const emojiRegex = /^(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F?|\p{Emoji_Modifier_Base}\p{Emoji_Modifier}?)+\s*/gu;
  return str.replace(emojiRegex, '').trim();
};

// Compare two names, ignoring leading emojis for alphabetization
const compareNamesIgnoringEmojis = (a: string, b: string): number => {
  return stripLeadingEmojis(a).localeCompare(stripLeadingEmojis(b));
};

/**
 * Prepare a session for loading by resetting runtime-only fields.
 */
const prepareSessionForLoad = (session: Session): Session => {
  return {
    ...session,
    // closedTabHistory is runtime-only and should not be persisted
    // Always reset to empty array on load
    closedTabHistory: []
  };
};

/**
 * Prepare a session for persistence by:
 * 1. Truncating logs in each AI tab to MAX_PERSISTED_LOGS_PER_TAB entries
 * 2. Excluding closedTabHistory (runtime-only, not persisted)
 */
const prepareSessionForPersistence = (session: Session): Session => {
  // If no aiTabs, return as-is (shouldn't happen after migration)
  if (!session.aiTabs || session.aiTabs.length === 0) {
    return session;
  }

  // Truncate logs in each tab and reset runtime-only tab state
  const truncatedTabs = session.aiTabs.map(tab => ({
    ...tab,
    logs: tab.logs.length > MAX_PERSISTED_LOGS_PER_TAB
      ? tab.logs.slice(-MAX_PERSISTED_LOGS_PER_TAB)
      : tab.logs,
    // Reset runtime-only tab state - processes don't survive app restart
    state: 'idle' as const,
    thinkingStartTime: undefined,
  }));

  return {
    ...session,
    aiTabs: truncatedTabs,
    // Reset runtime-only session state - processes don't survive app restart
    state: 'idle',
    busySource: undefined,
    thinkingStartTime: undefined,
    currentCycleTokens: undefined,
    // Explicitly exclude closedTabHistory - it's runtime-only
    closedTabHistory: []
  };
};

export interface UseSessionManagerReturn {
  // State
  sessions: Session[];
  groups: Group[];
  activeSessionId: string;
  activeSession: Session | null;
  sortedSessions: Session[];
  draggingSessionId: string | null;

  // Session operations
  setSessions: React.Dispatch<React.SetStateAction<Session[]>>;
  setActiveSessionId: (id: string) => void;
  createNewSession: (agentId: string, workingDir: string, name: string) => void;
  deleteSession: (id: string, showConfirmation: (message: string, onConfirm: () => void) => void) => void;
  toggleInputMode: () => void;
  toggleLive: (sessId: string) => void;
  updateScratchPad: (content: string) => void;
  updateScratchPadState: (state: {
    mode: 'edit' | 'preview';
    cursorPosition: number;
    editScrollPos: number;
    previewScrollPos: number;
  }) => void;
  startRenamingSession: (sessId: string) => void;
  finishRenamingSession: (sessId: string, newName: string) => void;

  // Group operations
  setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
  toggleGroup: (groupId: string) => void;
  startRenamingGroup: (groupId: string) => void;
  finishRenamingGroup: (groupId: string, newName: string) => void;
  createNewGroup: (name: string, emoji: string, moveSessionToNewGroup?: boolean, activeSessionId?: string) => void;

  // Drag and drop
  handleDragStart: (sessionId: string) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDropOnGroup: (groupId: string) => void;
  handleDropOnUngrouped: () => void;
  setDraggingSessionId: (id: string | null) => void;
}

export function useSessionManager(): UseSessionManagerReturn {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>('');
  const [draggingSessionId, setDraggingSessionId] = useState<string | null>(null);

  // Load sessions and groups from electron-store on mount
  useEffect(() => {
    const loadSessionsAndGroups = async () => {
      try {
        const savedSessions = await window.maestro.sessions.getAll();
        const savedGroups = await window.maestro.groups.getAll();

        // Handle sessions
        if (savedSessions && savedSessions.length > 0) {
          // Check Git repository status and prepare sessions for load
          const sessionsWithGitStatus = await Promise.all(
            savedSessions.map(async (session) => {
              const isGitRepo = await gitService.isRepo(session.cwd);
              return prepareSessionForLoad({ ...session, isGitRepo });
            })
          );
          setSessions(sessionsWithGitStatus);
          // Set active session to first one if we have sessions
          if (sessionsWithGitStatus.length > 0) {
            setActiveSessionId(sessionsWithGitStatus[0].id);
          }
        } else {
          setSessions([]);
        }

        // Handle groups
        if (savedGroups && savedGroups.length > 0) {
          setGroups(savedGroups);
        } else {
          setGroups([]);
        }
      } catch (e) {
        console.error('Failed to load sessions/groups:', e);
        setSessions([]);
        setGroups([]);
      }
    };
    loadSessionsAndGroups();
  }, []);

  // Persist sessions and groups to electron-store whenever they change
  // Apply log truncation and exclude runtime-only fields before saving
  useEffect(() => {
    // Prepare sessions for persistence (truncate logs, exclude closedTabHistory)
    const sessionsForPersistence = sessions.map(prepareSessionForPersistence);
    window.maestro.sessions.setAll(sessionsForPersistence);
  }, [sessions]);

  useEffect(() => {
    window.maestro.groups.setAll(groups);
  }, [groups]);

  // Compute active session
  const activeSession = sessions.find(s => s.id === activeSessionId) || sessions[0] || null;

  // Create sorted sessions array that matches visual display order
  // Note: sorting ignores leading emojis for proper alphabetization
  const sortedSessions = useMemo(() => {
    const sorted: Session[] = [];

    // First, add sessions from sorted groups (ignoring leading emojis)
    const sortedGroups = [...groups].sort((a, b) => compareNamesIgnoringEmojis(a.name, b.name));
    sortedGroups.forEach(group => {
      const groupSessions = sessions
        .filter(s => s.groupId === group.id)
        .sort((a, b) => compareNamesIgnoringEmojis(a.name, b.name));
      sorted.push(...groupSessions);
    });

    // Then, add ungrouped sessions (sorted alphabetically, ignoring leading emojis)
    const ungroupedSessions = sessions
      .filter(s => !s.groupId)
      .sort((a, b) => compareNamesIgnoringEmojis(a.name, b.name));
    sorted.push(...ungroupedSessions);

    return sorted;
  }, [sessions, groups]);

  // Session operations
  const createNewSession = async (agentId: string, workingDir: string, name: string) => {
    const newId = generateId();

    // Get agent definition to get correct command
    const agent = await window.maestro.agents.get(agentId);
    if (!agent) {
      console.error(`Agent not found: ${agentId}`);
      return;
    }

    // Spawn AI process (terminal uses runCommand which spawns fresh shells per command)
    try {
      // Spawn AI agent process (skip for Claude batch mode)
      const isClaudeBatchMode = agentId === 'claude-code';
      let aiSpawnResult = { pid: 0, success: true }; // Default for batch mode

      if (!isClaudeBatchMode) {
        aiSpawnResult = await window.maestro.process.spawn({
          sessionId: `${newId}-ai`,
          toolType: agentId,
          cwd: workingDir,
          command: agent.command,
          args: agent.args || []
        });

        if (!aiSpawnResult.success || aiSpawnResult.pid <= 0) {
          throw new Error('Failed to spawn AI agent process');
        }
      }

      // Terminal processes are spawned lazily via runCommand() - no persistent PTY needed

      // Check if the working directory is a Git repository
      const isGitRepo = await gitService.isRepo(workingDir);

      const newSession: Session = {
        id: newId,
        name,
        toolType: agentId as ToolType,
        state: 'idle',
        cwd: workingDir,
        fullPath: workingDir,
        isGitRepo,
        aiLogs: [],  // Start with clean AI Terminal (no superfluous messages)
        shellLogs: [],  // Start with clean Command Terminal (no superfluous messages)
        workLog: [],
        contextUsage: 0,
        inputMode: agentId === 'terminal' ? 'terminal' : 'ai',
        // AI process PID (terminal uses runCommand which spawns fresh shells)
        aiPid: aiSpawnResult.pid,
        terminalPid: 0,
        port: 3000 + Math.floor(Math.random() * 100),
        isLive: false,
        changedFiles: [],
        fileTree: [],
        fileExplorerExpanded: [],
        fileExplorerScrollPos: 0,
        shellCwd: workingDir,
        aiCommandHistory: [],
        shellCommandHistory: [],
        executionQueue: [],
        aiTabs: [],
        activeTabId: '',
        closedTabHistory: []
      };
      setSessions(prev => [...prev, newSession]);
      setActiveSessionId(newId);
    } catch (error) {
      console.error('Failed to create session:', error);
      // TODO: Show error to user
    }
  };

  const deleteSession = (id: string, showConfirmation: (message: string, onConfirm: () => void) => void) => {
    const session = sessions.find(s => s.id === id);
    if (!session) return;

    showConfirmation(
      `Are you sure you want to delete "${session.name}"? This action cannot be undone.`,
      () => {
        const newSessions = sessions.filter(s => s.id !== id);
        setSessions(newSessions);
        if (newSessions.length > 0) {
          setActiveSessionId(newSessions[0].id);
        } else {
          setActiveSessionId('');
        }
      }
    );
  };

  const toggleInputMode = () => {
    // Compute the actual active session ID (with fallback to first session)
    const actualActiveId = activeSessionId || (sessions.length > 0 ? sessions[0].id : '');

    // Don't toggle if no sessions exist
    if (!actualActiveId || sessions.length === 0) {
      console.warn('toggleInputMode: No sessions available');
      return;
    }

    setSessions(prev => prev.map(s => {
      if (s.id !== actualActiveId) return s;
      return { ...s, inputMode: s.inputMode === 'ai' ? 'terminal' : 'ai' };
    }));
  };

  const toggleLive = (sessId: string) => {
    // Live toggle is handled in App.tsx via IPC
    // This is just a stub for the interface
    setSessions(prev => prev.map(s => {
      if (s.id !== sessId) return s;
      return {
        ...s,
        isLive: !s.isLive,
        liveUrl: undefined
      };
    }));
  };

  // TODO: Auto Run content is now stored in files, not session state
  // This function will be removed once AutoRun component is updated to use file-based storage
  const updateScratchPad = (_content: string) => {
    // No-op: content is now stored in files via autorun:writeDoc IPC
  };

  // TODO: Auto Run state tracking to be updated once new autoRun session fields are added
  // This function will be updated to use the new autoRun* fields
  const updateScratchPadState = (_state: {
    mode: 'edit' | 'preview';
    cursorPosition: number;
    editScrollPos: number;
    previewScrollPos: number;
  }) => {
    // No-op until new autoRun* fields are added to Session interface
  };

  const startRenamingSession = (sessId: string) => {
    // This state is managed in App.tsx, so we'll just return the function
    // The actual state (editingSessionId) needs to remain in App or be extracted to another hook
  };

  const finishRenamingSession = (sessId: string, newName: string) => {
    setSessions(prev => prev.map(s => s.id === sessId ? { ...s, name: newName } : s));
  };

  // Group operations
  const toggleGroup = (groupId: string) => {
    setGroups(prev => prev.map(g => g.id === groupId ? { ...g, collapsed: !g.collapsed } : g));
  };

  const startRenamingGroup = (groupId: string) => {
    // This state is managed in App.tsx, similar to startRenamingSession
  };

  const finishRenamingGroup = (groupId: string, newName: string) => {
    setGroups(prev => prev.map(g => g.id === groupId ? { ...g, name: newName.toUpperCase() } : g));
  };

  const createNewGroup = (
    name: string,
    emoji: string,
    moveSessionToNewGroup: boolean = false,
    currentActiveSessionId?: string
  ) => {
    if (name.trim()) {
      const newGroup: Group = {
        id: `group-${Date.now()}`,
        name: name.trim().toUpperCase(),
        emoji: emoji,
        collapsed: false
      };
      setGroups([...groups, newGroup]);

      // If we should move the session to the new group
      if (moveSessionToNewGroup && currentActiveSessionId) {
        setSessions(prev => prev.map(s =>
          s.id === currentActiveSessionId ? { ...s, groupId: newGroup.id } : s
        ));
      }
    }
  };

  // Drag and drop handlers
  const handleDragStart = (sessionId: string) => {
    setDraggingSessionId(sessionId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDropOnGroup = (groupId: string) => {
    if (draggingSessionId) {
      setSessions(prev => prev.map(s =>
        s.id === draggingSessionId ? { ...s, groupId } : s
      ));
      setDraggingSessionId(null);
    }
  };

  const handleDropOnUngrouped = () => {
    if (draggingSessionId) {
      setSessions(prev => prev.map(s =>
        s.id === draggingSessionId ? { ...s, groupId: undefined } : s
      ));
      setDraggingSessionId(null);
    }
  };

  return {
    sessions,
    groups,
    activeSessionId,
    activeSession,
    sortedSessions,
    draggingSessionId,
    setSessions,
    setActiveSessionId,
    createNewSession,
    deleteSession,
    toggleInputMode,
    toggleLive,
    updateScratchPad,
    updateScratchPadState,
    startRenamingSession,
    finishRenamingSession,
    setGroups,
    toggleGroup,
    startRenamingGroup,
    finishRenamingGroup,
    createNewGroup,
    handleDragStart,
    handleDragOver,
    handleDropOnGroup,
    handleDropOnUngrouped,
    setDraggingSessionId,
  };
}
