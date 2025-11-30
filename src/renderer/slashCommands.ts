export interface SlashCommand {
  command: string;
  description: string;
  terminalOnly?: boolean; // Only show this command in terminal mode
  aiOnly?: boolean; // Only show this command in AI mode
  execute: (context: SlashCommandContext) => void | Promise<void>;
}

export interface SlashCommandContext {
  activeSessionId: string;
  sessions: any[];
  setSessions: (sessions: any[] | ((prev: any[]) => any[])) => void;
  currentMode: 'ai' | 'terminal';
  groups: any[];
  // Optional properties for file tree navigation
  setRightPanelOpen?: (open: boolean) => void;
  setActiveRightTab?: (tab: string) => void;
  setActiveFocus?: (focus: 'sidebar' | 'main' | 'right') => void;
  setSelectedFileIndex?: (index: number) => void;
  fileTreeRef?: React.RefObject<HTMLDivElement>;
  // Optional properties for synopsis and new session
  sendPromptToAgent?: (prompt: string) => Promise<{ success: boolean; response?: string; claudeSessionId?: string }>;
  addHistoryEntry?: (entry: { type: 'AUTO' | 'USER'; summary: string; claudeSessionId?: string }) => void;
  startNewClaudeSession?: () => void;
  // Background synopsis - resumes old session without blocking
  spawnBackgroundSynopsis?: (sessionId: string, cwd: string, resumeClaudeSessionId: string, prompt: string) => Promise<{ success: boolean; response?: string; claudeSessionId?: string }>;
  // Toast notifications
  addToast?: (toast: { type: 'success' | 'info' | 'warning' | 'error'; title: string; message: string; group?: string; project?: string; taskDuration?: number; duration?: number; claudeSessionId?: string; sessionId?: string; tabId?: string; tabName?: string }) => void;
  // Refresh history panel after adding entries
  refreshHistoryPanel?: () => void;
  // Add log entry to active tab
  addLogToActiveTab?: (sessionId: string, logEntry: { source: 'user' | 'ai' | 'system' | 'shell'; text: string }) => void;
}

// Synopsis prompt for getting a summary of recent work
const SYNOPSIS_PROMPT = 'Synopsize our recent work in 2-3 sentences max.';

export const slashCommands: SlashCommand[] = [
  {
    command: '/synopsis',
    description: 'Synopsize the active tab and add a user entry to history',
    aiOnly: true,
    execute: async (context: SlashCommandContext) => {
      const { activeSessionId, sessions, setSessions, spawnBackgroundSynopsis, addHistoryEntry, refreshHistoryPanel, addLogToActiveTab } = context;

      const actualActiveId = activeSessionId || (sessions.length > 0 ? sessions[0].id : '');
      if (!actualActiveId) return;

      const activeSession = sessions.find((s: any) => s.id === actualActiveId);
      if (!activeSession) return;

      // Need a claudeSessionId to resume the conversation
      if (!activeSession.claudeSessionId) return;

      // Add /synopsis command to the tab's message history
      addLogToActiveTab?.(actualActiveId, {
        source: 'user',
        text: '/synopsis'
      });

      // Request synopsis from agent by resuming the existing session
      if (spawnBackgroundSynopsis && addHistoryEntry) {
        // Set session to busy while synopsizing
        setSessions(prev => prev.map(s => {
          if (s.id !== actualActiveId) return s;
          return { ...s, state: 'busy', busySource: 'ai', thinkingStartTime: Date.now(), statusMessage: 'Agent is synopsizing...' };
        }));

        const result = await spawnBackgroundSynopsis(
          actualActiveId,
          activeSession.cwd,
          activeSession.claudeSessionId,
          SYNOPSIS_PROMPT
        );

        // Clear busy state
        setSessions(prev => prev.map(s => {
          if (s.id !== actualActiveId) return s;
          return { ...s, state: 'idle', busySource: undefined, thinkingStartTime: undefined, statusMessage: undefined };
        }));

        if (result.success && result.response) {
          // Add synopsis response to tab's message history
          addLogToActiveTab?.(actualActiveId, {
            source: 'ai',
            text: result.response
          });

          addHistoryEntry({
            type: 'USER',
            summary: result.response,
            claudeSessionId: activeSession.claudeSessionId
          });
          // Refresh history panel to show the new entry
          refreshHistoryPanel?.();
        }
      }
    }
  },
  {
    command: '/clear',
    description: 'Clear output history and start new AI session',
    execute: async (context: SlashCommandContext) => {
      const { activeSessionId, sessions, setSessions, currentMode, groups, spawnBackgroundSynopsis, addHistoryEntry, startNewClaudeSession, addToast, refreshHistoryPanel } = context;

      // Use fallback to first session if activeSessionId is empty
      const actualActiveId = activeSessionId || (sessions.length > 0 ? sessions[0].id : '');
      if (!actualActiveId) return;

      const activeSession = sessions.find((s: any) => s.id === actualActiveId);
      const targetLogKey = currentMode === 'ai' ? 'aiLogs' : 'shellLogs';

      // For AI mode: clear immediately, start new session, then synopsis old session in background
      if (currentMode === 'ai' && activeSession?.claudeSessionId && spawnBackgroundSynopsis && addHistoryEntry) {
        // Save old session info before clearing
        const oldClaudeSessionId = activeSession.claudeSessionId;
        const sessionCwd = activeSession.cwd;
        const startTime = Date.now();

        // Get group name for the session
        const sessionGroup = groups.find((g: any) => g.sessionIds?.includes(actualActiveId));
        const groupName = sessionGroup?.name || 'Ungrouped';
        const projectName = activeSession.name || sessionCwd.split('/').pop() || 'Unknown';

        // Get tab info for toast navigation
        const activeTab = activeSession.aiTabs?.find((t: any) => t.id === activeSession.activeTabId);
        const tabName = activeTab?.name || (oldClaudeSessionId ? oldClaudeSessionId.substring(0, 8).toUpperCase() : undefined);
        const tabId = activeTab?.id;

        // Step 1: Clear logs, start new session, show synopsizing status
        // User can immediately start typing in the new session
        setSessions(prev => prev.map(s => {
          if (s.id !== actualActiveId) return s;
          return {
            ...s,
            [targetLogKey]: [],
            claudeSessionId: undefined, // Start fresh session
            statusMessage: 'Agent is synopsizing...'
          };
        }));

        // Step 2: Run synopsis in background on the OLD session (doesn't block user)
        spawnBackgroundSynopsis(actualActiveId, sessionCwd, oldClaudeSessionId, SYNOPSIS_PROMPT)
          .then(result => {
            const duration = Date.now() - startTime;
            if (result.success && result.response) {
              addHistoryEntry({
                type: 'USER',
                summary: result.response,
                claudeSessionId: oldClaudeSessionId
              });

              // Refresh history panel to show the new entry
              refreshHistoryPanel?.();

              // Show toast notification
              if (addToast) {
                addToast({
                  type: 'success',
                  title: 'Synopsis Complete',
                  message: result.response,
                  group: groupName,
                  project: projectName,
                  taskDuration: duration,
                  claudeSessionId: oldClaudeSessionId,
                  sessionId: actualActiveId,
                  tabId,
                  tabName,
                });
              }
            }
          })
          .finally(() => {
            // Clear status message when synopsis completes
            setSessions(prev => prev.map(s => {
              if (s.id !== actualActiveId) return s;
              return {
                ...s,
                statusMessage: undefined
              };
            }));
          });
      } else if (currentMode === 'ai') {
        // No existing session to synopsis, just clear and start fresh
        setSessions(prev => prev.map(s => {
          if (s.id !== actualActiveId) return s;
          return {
            ...s,
            [targetLogKey]: [],
            claudeSessionId: undefined
          };
        }));
      } else {
        // For terminal mode, just clear the logs
        setSessions(prev => prev.map(s => {
          if (s.id !== actualActiveId) return s;
          return {
            ...s,
            [targetLogKey]: []
          };
        }));
      }
    }
  },
  {
    command: '/jump',
    description: 'Jump to CWD in file tree',
    terminalOnly: true, // Only available in terminal mode
    execute: (context: SlashCommandContext) => {
      const { activeSessionId, sessions, setSessions, setRightPanelOpen, setActiveRightTab, setActiveFocus } = context;

      // Use fallback to first session if activeSessionId is empty
      const actualActiveId = activeSessionId || (sessions.length > 0 ? sessions[0].id : '');

      // Find active session
      const activeSession = sessions.find(s => s.id === actualActiveId);
      if (!activeSession) return;

      // Get the current working directory (use shellCwd for terminal mode, cwd otherwise)
      const targetDir = activeSession.shellCwd || activeSession.cwd;

      // Open right panel, switch to files tab, and focus on file tree
      if (setRightPanelOpen) setRightPanelOpen(true);
      if (setActiveRightTab) setActiveRightTab('files');
      if (setActiveFocus) setActiveFocus('right');

      // Calculate the relative path from session cwd to target directory
      const relativePath = targetDir.replace(activeSession.cwd, '').replace(/^\//, '');

      // Expand all parent folders in the path and set pendingJumpPath
      setSessions(prev => prev.map(s => {
        if (s.id !== actualActiveId) return s;

        // Build list of relative parent paths to expand
        const pathParts = relativePath.split('/').filter(Boolean);
        const expandPaths: string[] = [];

        let currentPath = '';
        for (const part of pathParts) {
          currentPath = currentPath ? currentPath + '/' + part : part;
          expandPaths.push(currentPath);
        }

        // Add all parent paths to expanded list
        const newExpanded = new Set([...(s.fileExplorerExpanded || []), ...expandPaths]);

        return {
          ...s,
          fileExplorerExpanded: Array.from(newExpanded),
          // Set pending jump path - will be processed by App.tsx once flatFileList updates
          pendingJumpPath: relativePath || ''
        };
      }));
    }
  }
];
