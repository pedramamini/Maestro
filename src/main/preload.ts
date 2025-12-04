import { contextBridge, ipcRenderer } from 'electron';

// Type definitions that match renderer types
interface ProcessConfig {
  sessionId: string;
  toolType: string;
  cwd: string;
  command: string;
  args: string[];
  prompt?: string;
  shell?: string;
  images?: string[]; // Base64 data URLs for images
}

interface AgentConfig {
  id: string;
  name: string;
  available: boolean;
  path?: string;
}

interface DirectoryEntry {
  name: string;
  isDirectory: boolean;
  path: string;
}

interface ShellInfo {
  id: string;
  name: string;
  available: boolean;
  path?: string;
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('maestro', {
  // Settings API
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: unknown) => ipcRenderer.invoke('settings:set', key, value),
    getAll: () => ipcRenderer.invoke('settings:getAll'),
  },

  // Sessions persistence API
  sessions: {
    getAll: () => ipcRenderer.invoke('sessions:getAll'),
    setAll: (sessions: any[]) => ipcRenderer.invoke('sessions:setAll', sessions),
  },

  // Groups persistence API
  groups: {
    getAll: () => ipcRenderer.invoke('groups:getAll'),
    setAll: (groups: any[]) => ipcRenderer.invoke('groups:setAll', groups),
  },

  // Process/Session API
  process: {
    spawn: (config: ProcessConfig) => ipcRenderer.invoke('process:spawn', config),
    write: (sessionId: string, data: string) => ipcRenderer.invoke('process:write', sessionId, data),
    interrupt: (sessionId: string) => ipcRenderer.invoke('process:interrupt', sessionId),
    kill: (sessionId: string) => ipcRenderer.invoke('process:kill', sessionId),
    resize: (sessionId: string, cols: number, rows: number) =>
      ipcRenderer.invoke('process:resize', sessionId, cols, rows),

    // Run a single command and capture only stdout/stderr (no PTY echo/prompts)
    runCommand: (config: { sessionId: string; command: string; cwd: string; shell?: string }) =>
      ipcRenderer.invoke('process:runCommand', config),

    // Get all active processes from ProcessManager
    getActiveProcesses: () => ipcRenderer.invoke('process:getActiveProcesses'),

    // Event listeners
    onData: (callback: (sessionId: string, data: string) => void) => {
      const handler = (_: any, sessionId: string, data: string) => callback(sessionId, data);
      ipcRenderer.on('process:data', handler);
      return () => ipcRenderer.removeListener('process:data', handler);
    },
    onExit: (callback: (sessionId: string, code: number) => void) => {
      const handler = (_: any, sessionId: string, code: number) => callback(sessionId, code);
      ipcRenderer.on('process:exit', handler);
      return () => ipcRenderer.removeListener('process:exit', handler);
    },
    onSessionId: (callback: (sessionId: string, claudeSessionId: string) => void) => {
      const handler = (_: any, sessionId: string, claudeSessionId: string) => callback(sessionId, claudeSessionId);
      ipcRenderer.on('process:session-id', handler);
      return () => ipcRenderer.removeListener('process:session-id', handler);
    },
    // Remote command execution from web interface
    // This allows web commands to go through the same code path as desktop commands
    // inputMode is optional - if provided, renderer should use it instead of session state
    onRemoteCommand: (callback: (sessionId: string, command: string, inputMode?: 'ai' | 'terminal') => void) => {
      console.log('[Preload] Registering onRemoteCommand listener');
      const handler = (_: any, sessionId: string, command: string, inputMode?: 'ai' | 'terminal') => {
        console.log('[Preload] Received remote:executeCommand IPC:', { sessionId, command: command?.substring(0, 50), inputMode });
        callback(sessionId, command, inputMode);
      };
      ipcRenderer.on('remote:executeCommand', handler);
      return () => ipcRenderer.removeListener('remote:executeCommand', handler);
    },
    // Remote mode switch from web interface - forwards to desktop's toggleInputMode logic
    onRemoteSwitchMode: (callback: (sessionId: string, mode: 'ai' | 'terminal') => void) => {
      console.log('[Preload] Registering onRemoteSwitchMode listener');
      const handler = (_: any, sessionId: string, mode: 'ai' | 'terminal') => {
        console.log('[Preload] Received remote:switchMode IPC:', { sessionId, mode });
        callback(sessionId, mode);
      };
      ipcRenderer.on('remote:switchMode', handler);
      return () => ipcRenderer.removeListener('remote:switchMode', handler);
    },
    // Remote interrupt from web interface - forwards to desktop's handleInterrupt logic
    onRemoteInterrupt: (callback: (sessionId: string) => void) => {
      const handler = (_: any, sessionId: string) => callback(sessionId);
      ipcRenderer.on('remote:interrupt', handler);
      return () => ipcRenderer.removeListener('remote:interrupt', handler);
    },
    // Remote session selection from web interface - forwards to desktop's setActiveSessionId logic
    // Optional tabId to also switch to a specific tab within the session
    onRemoteSelectSession: (callback: (sessionId: string, tabId?: string) => void) => {
      console.log('[Preload] Registering onRemoteSelectSession listener');
      const handler = (_: any, sessionId: string, tabId?: string) => {
        console.log('[Preload] Received remote:selectSession IPC:', { sessionId, tabId });
        callback(sessionId, tabId);
      };
      ipcRenderer.on('remote:selectSession', handler);
      return () => ipcRenderer.removeListener('remote:selectSession', handler);
    },
    // Remote tab selection from web interface
    onRemoteSelectTab: (callback: (sessionId: string, tabId: string) => void) => {
      const handler = (_: any, sessionId: string, tabId: string) => callback(sessionId, tabId);
      ipcRenderer.on('remote:selectTab', handler);
      return () => ipcRenderer.removeListener('remote:selectTab', handler);
    },
    // Remote new tab from web interface
    onRemoteNewTab: (callback: (sessionId: string, responseChannel: string) => void) => {
      const handler = (_: any, sessionId: string, responseChannel: string) => callback(sessionId, responseChannel);
      ipcRenderer.on('remote:newTab', handler);
      return () => ipcRenderer.removeListener('remote:newTab', handler);
    },
    // Send response for remote new tab
    sendRemoteNewTabResponse: (responseChannel: string, result: { tabId: string } | null) => {
      ipcRenderer.send(responseChannel, result);
    },
    // Remote close tab from web interface
    onRemoteCloseTab: (callback: (sessionId: string, tabId: string) => void) => {
      const handler = (_: any, sessionId: string, tabId: string) => callback(sessionId, tabId);
      ipcRenderer.on('remote:closeTab', handler);
      return () => ipcRenderer.removeListener('remote:closeTab', handler);
    },
    // Stderr listener for runCommand (separate stream)
    onStderr: (callback: (sessionId: string, data: string) => void) => {
      const handler = (_: any, sessionId: string, data: string) => callback(sessionId, data);
      ipcRenderer.on('process:stderr', handler);
      return () => ipcRenderer.removeListener('process:stderr', handler);
    },
    // Command exit listener for runCommand (separate from PTY exit)
    onCommandExit: (callback: (sessionId: string, code: number) => void) => {
      const handler = (_: any, sessionId: string, code: number) => callback(sessionId, code);
      ipcRenderer.on('process:command-exit', handler);
      return () => ipcRenderer.removeListener('process:command-exit', handler);
    },
    // Usage statistics listener for AI responses
    onUsage: (callback: (sessionId: string, usageStats: {
      inputTokens: number;
      outputTokens: number;
      cacheReadInputTokens: number;
      cacheCreationInputTokens: number;
      totalCostUsd: number;
      contextWindow: number;
    }) => void) => {
      const handler = (_: any, sessionId: string, usageStats: any) => callback(sessionId, usageStats);
      ipcRenderer.on('process:usage', handler);
      return () => ipcRenderer.removeListener('process:usage', handler);
    },
  },

  // Web interface API
  web: {
    // Broadcast user input to web clients (for keeping web interface in sync)
    broadcastUserInput: (sessionId: string, command: string, inputMode: 'ai' | 'terminal') =>
      ipcRenderer.invoke('web:broadcastUserInput', sessionId, command, inputMode),
    // Broadcast AutoRun state to web clients (for showing task progress on mobile)
    broadcastAutoRunState: (sessionId: string, state: {
      isRunning: boolean;
      totalTasks: number;
      completedTasks: number;
      currentTaskIndex: number;
      isStopping?: boolean;
    } | null) =>
      ipcRenderer.invoke('web:broadcastAutoRunState', sessionId, state),
    // Broadcast tab changes to web clients (for tab sync)
    broadcastTabsChange: (sessionId: string, aiTabs: Array<{
      id: string;
      claudeSessionId: string | null;
      name: string | null;
      starred: boolean;
      inputValue: string;
      usageStats?: any;
      createdAt: number;
      state: 'idle' | 'busy';
      thinkingStartTime?: number | null;
    }>, activeTabId: string) =>
      ipcRenderer.invoke('web:broadcastTabsChange', sessionId, aiTabs, activeTabId),
  },

  // Git API
  git: {
    status: (cwd: string) => ipcRenderer.invoke('git:status', cwd),
    diff: (cwd: string, file?: string) => ipcRenderer.invoke('git:diff', cwd, file),
    isRepo: (cwd: string) => ipcRenderer.invoke('git:isRepo', cwd),
    numstat: (cwd: string) => ipcRenderer.invoke('git:numstat', cwd),
    branch: (cwd: string) => ipcRenderer.invoke('git:branch', cwd),
    branches: (cwd: string) => ipcRenderer.invoke('git:branches', cwd),
    tags: (cwd: string) => ipcRenderer.invoke('git:tags', cwd),
    remote: (cwd: string) => ipcRenderer.invoke('git:remote', cwd),
    info: (cwd: string) => ipcRenderer.invoke('git:info', cwd),
    log: (cwd: string, options?: { limit?: number; search?: string }) =>
      ipcRenderer.invoke('git:log', cwd, options),
    show: (cwd: string, hash: string) => ipcRenderer.invoke('git:show', cwd, hash),
    showFile: (cwd: string, ref: string, filePath: string) =>
      ipcRenderer.invoke('git:showFile', cwd, ref, filePath) as Promise<{ content?: string; error?: string }>,
    // Git worktree operations for Auto Run parallelization
    worktreeInfo: (worktreePath: string) =>
      ipcRenderer.invoke('git:worktreeInfo', worktreePath) as Promise<{
        success: boolean;
        exists?: boolean;
        isWorktree?: boolean;
        currentBranch?: string;
        repoRoot?: string;
        error?: string;
      }>,
    getRepoRoot: (cwd: string) =>
      ipcRenderer.invoke('git:getRepoRoot', cwd) as Promise<{
        success: boolean;
        root?: string;
        error?: string;
      }>,
    worktreeSetup: (mainRepoCwd: string, worktreePath: string, branchName: string) =>
      ipcRenderer.invoke('git:worktreeSetup', mainRepoCwd, worktreePath, branchName) as Promise<{
        success: boolean;
        created?: boolean;
        currentBranch?: string;
        requestedBranch?: string;
        branchMismatch?: boolean;
        error?: string;
      }>,
    worktreeCheckout: (worktreePath: string, branchName: string, createIfMissing: boolean) =>
      ipcRenderer.invoke('git:worktreeCheckout', worktreePath, branchName, createIfMissing) as Promise<{
        success: boolean;
        hasUncommittedChanges: boolean;
        error?: string;
      }>,
    createPR: (worktreePath: string, baseBranch: string, title: string, body: string) =>
      ipcRenderer.invoke('git:createPR', worktreePath, baseBranch, title, body) as Promise<{
        success: boolean;
        prUrl?: string;
        error?: string;
      }>,
    getDefaultBranch: (cwd: string) =>
      ipcRenderer.invoke('git:getDefaultBranch', cwd) as Promise<{
        success: boolean;
        branch?: string;
        error?: string;
      }>,
    checkGhCli: () =>
      ipcRenderer.invoke('git:checkGhCli') as Promise<{
        installed: boolean;
        authenticated: boolean;
      }>,
  },

  // File System API
  fs: {
    homeDir: () => ipcRenderer.invoke('fs:homeDir') as Promise<string>,
    readDir: (dirPath: string) => ipcRenderer.invoke('fs:readDir', dirPath),
    readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath),
    stat: (filePath: string) => ipcRenderer.invoke('fs:stat', filePath),
  },

  // Web Server API
  webserver: {
    getUrl: () => ipcRenderer.invoke('webserver:getUrl'),
    getConnectedClients: () => ipcRenderer.invoke('webserver:getConnectedClients'),
  },

  // Live Session API - toggle sessions as live/offline in web interface
  live: {
    toggle: (sessionId: string, claudeSessionId?: string) =>
      ipcRenderer.invoke('live:toggle', sessionId, claudeSessionId),
    getStatus: (sessionId: string) => ipcRenderer.invoke('live:getStatus', sessionId),
    getDashboardUrl: () => ipcRenderer.invoke('live:getDashboardUrl'),
    getLiveSessions: () => ipcRenderer.invoke('live:getLiveSessions'),
    broadcastActiveSession: (sessionId: string) =>
      ipcRenderer.invoke('live:broadcastActiveSession', sessionId),
    disableAll: () => ipcRenderer.invoke('live:disableAll'),
    startServer: () => ipcRenderer.invoke('live:startServer'),
    stopServer: () => ipcRenderer.invoke('live:stopServer'),
  },

  // Agent API
  agents: {
    detect: () => ipcRenderer.invoke('agents:detect'),
    refresh: (agentId?: string) => ipcRenderer.invoke('agents:refresh', agentId),
    get: (agentId: string) => ipcRenderer.invoke('agents:get', agentId),
    getConfig: (agentId: string) => ipcRenderer.invoke('agents:getConfig', agentId),
    setConfig: (agentId: string, config: Record<string, any>) =>
      ipcRenderer.invoke('agents:setConfig', agentId, config),
    getConfigValue: (agentId: string, key: string) =>
      ipcRenderer.invoke('agents:getConfigValue', agentId, key),
    setConfigValue: (agentId: string, key: string, value: any) =>
      ipcRenderer.invoke('agents:setConfigValue', agentId, key, value),
  },

  // Dialog API
  dialog: {
    selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  },

  // Font API
  fonts: {
    detect: () => ipcRenderer.invoke('fonts:detect'),
  },

  // Shells API (terminal shells, not to be confused with shell:openExternal)
  shells: {
    detect: () => ipcRenderer.invoke('shells:detect'),
  },

  // Shell API
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  },

  // Tunnel API (Cloudflare tunnel support)
  tunnel: {
    isCloudflaredInstalled: () => ipcRenderer.invoke('tunnel:isCloudflaredInstalled'),
    start: () => ipcRenderer.invoke('tunnel:start'),
    stop: () => ipcRenderer.invoke('tunnel:stop'),
    getStatus: () => ipcRenderer.invoke('tunnel:getStatus'),
  },

  // DevTools API
  devtools: {
    open: () => ipcRenderer.invoke('devtools:open'),
    close: () => ipcRenderer.invoke('devtools:close'),
    toggle: () => ipcRenderer.invoke('devtools:toggle'),
  },

  // Logger API
  logger: {
    log: (level: string, message: string, context?: string, data?: unknown) =>
      ipcRenderer.invoke('logger:log', level, message, context, data),
    getLogs: (filter?: { level?: string; context?: string; limit?: number }) =>
      ipcRenderer.invoke('logger:getLogs', filter),
    clearLogs: () => ipcRenderer.invoke('logger:clearLogs'),
    setLogLevel: (level: string) => ipcRenderer.invoke('logger:setLogLevel', level),
    getLogLevel: () => ipcRenderer.invoke('logger:getLogLevel'),
    setMaxLogBuffer: (max: number) => ipcRenderer.invoke('logger:setMaxLogBuffer', max),
    getMaxLogBuffer: () => ipcRenderer.invoke('logger:getMaxLogBuffer'),
    // Convenience method for logging toast notifications
    toast: (title: string, data?: unknown) =>
      ipcRenderer.invoke('logger:log', 'toast', title, 'Toast', data),
  },

  // Claude Code sessions API
  claude: {
    listSessions: (projectPath: string) =>
      ipcRenderer.invoke('claude:listSessions', projectPath),
    // Paginated version for better performance with many sessions
    listSessionsPaginated: (projectPath: string, options?: { cursor?: string; limit?: number }) =>
      ipcRenderer.invoke('claude:listSessionsPaginated', projectPath, options),
    // Get aggregate stats for all sessions in a project (streams progressive updates)
    getProjectStats: (projectPath: string) =>
      ipcRenderer.invoke('claude:getProjectStats', projectPath),
    onProjectStatsUpdate: (callback: (stats: {
      projectPath: string;
      totalSessions: number;
      totalMessages: number;
      totalCostUsd: number;
      totalSizeBytes: number;
      oldestTimestamp: string | null;
      processedCount: number;
      isComplete: boolean;
    }) => void) => {
      const handler = (_: any, stats: any) => callback(stats);
      ipcRenderer.on('claude:projectStatsUpdate', handler);
      return () => ipcRenderer.removeListener('claude:projectStatsUpdate', handler);
    },
    getGlobalStats: () =>
      ipcRenderer.invoke('claude:getGlobalStats'),
    onGlobalStatsUpdate: (callback: (stats: {
      totalSessions: number;
      totalMessages: number;
      totalInputTokens: number;
      totalOutputTokens: number;
      totalCacheReadTokens: number;
      totalCacheCreationTokens: number;
      totalCostUsd: number;
      totalSizeBytes: number;
      isComplete: boolean;
    }) => void) => {
      const handler = (_: any, stats: any) => callback(stats);
      ipcRenderer.on('claude:globalStatsUpdate', handler);
      return () => ipcRenderer.removeListener('claude:globalStatsUpdate', handler);
    },
    readSessionMessages: (projectPath: string, sessionId: string, options?: { offset?: number; limit?: number }) =>
      ipcRenderer.invoke('claude:readSessionMessages', projectPath, sessionId, options),
    searchSessions: (projectPath: string, query: string, searchMode: 'title' | 'user' | 'assistant' | 'all') =>
      ipcRenderer.invoke('claude:searchSessions', projectPath, query, searchMode),
    getCommands: (projectPath: string) =>
      ipcRenderer.invoke('claude:getCommands', projectPath),
    // Session origin tracking (distinguishes Maestro sessions from CLI sessions)
    registerSessionOrigin: (projectPath: string, claudeSessionId: string, origin: 'user' | 'auto', sessionName?: string) =>
      ipcRenderer.invoke('claude:registerSessionOrigin', projectPath, claudeSessionId, origin, sessionName),
    updateSessionName: (projectPath: string, claudeSessionId: string, sessionName: string) =>
      ipcRenderer.invoke('claude:updateSessionName', projectPath, claudeSessionId, sessionName),
    updateSessionStarred: (projectPath: string, claudeSessionId: string, starred: boolean) =>
      ipcRenderer.invoke('claude:updateSessionStarred', projectPath, claudeSessionId, starred),
    getSessionOrigins: (projectPath: string) =>
      ipcRenderer.invoke('claude:getSessionOrigins', projectPath),
    getAllNamedSessions: () =>
      ipcRenderer.invoke('claude:getAllNamedSessions') as Promise<Array<{
        claudeSessionId: string;
        projectPath: string;
        sessionName: string;
        starred?: boolean;
        lastActivityAt?: number;
      }>>,
    deleteMessagePair: (projectPath: string, sessionId: string, userMessageUuid: string, fallbackContent?: string) =>
      ipcRenderer.invoke('claude:deleteMessagePair', projectPath, sessionId, userMessageUuid, fallbackContent),
  },

  // Temp file API (for batch processing)
  tempfile: {
    write: (content: string, filename?: string) =>
      ipcRenderer.invoke('tempfile:write', content, filename),
    read: (filePath: string) =>
      ipcRenderer.invoke('tempfile:read', filePath),
    delete: (filePath: string) =>
      ipcRenderer.invoke('tempfile:delete', filePath),
  },

  // History API (per-project persistence)
  history: {
    getAll: (projectPath?: string, sessionId?: string) =>
      ipcRenderer.invoke('history:getAll', projectPath, sessionId),
    add: (entry: { id: string; type: 'AUTO' | 'USER'; timestamp: number; summary: string; claudeSessionId?: string; projectPath: string; sessionId?: string }) =>
      ipcRenderer.invoke('history:add', entry),
    clear: (projectPath?: string) =>
      ipcRenderer.invoke('history:clear', projectPath),
    delete: (entryId: string) =>
      ipcRenderer.invoke('history:delete', entryId),
    update: (entryId: string, updates: { validated?: boolean }) =>
      ipcRenderer.invoke('history:update', entryId, updates),
  },

  // Notification API
  notification: {
    show: (title: string, body: string) =>
      ipcRenderer.invoke('notification:show', title, body),
    speak: (text: string, command?: string) =>
      ipcRenderer.invoke('notification:speak', text, command),
    stopSpeak: (ttsId: number) =>
      ipcRenderer.invoke('notification:stopSpeak', ttsId),
    onTtsCompleted: (handler: (ttsId: number) => void) => {
      const wrappedHandler = (_event: Electron.IpcRendererEvent, ttsId: number) => handler(ttsId);
      ipcRenderer.on('tts:completed', wrappedHandler);
      return () => ipcRenderer.removeListener('tts:completed', wrappedHandler);
    },
  },

  // Attachments API (per-session image storage for scratchpad)
  attachments: {
    save: (sessionId: string, base64Data: string, filename: string) =>
      ipcRenderer.invoke('attachments:save', sessionId, base64Data, filename),
    load: (sessionId: string, filename: string) =>
      ipcRenderer.invoke('attachments:load', sessionId, filename),
    delete: (sessionId: string, filename: string) =>
      ipcRenderer.invoke('attachments:delete', sessionId, filename),
    list: (sessionId: string) =>
      ipcRenderer.invoke('attachments:list', sessionId),
    getPath: (sessionId: string) =>
      ipcRenderer.invoke('attachments:getPath', sessionId),
  },

  // Auto Run API (file-system-based document runner)
  autorun: {
    listDocs: (folderPath: string) =>
      ipcRenderer.invoke('autorun:listDocs', folderPath),
    readDoc: (folderPath: string, filename: string) =>
      ipcRenderer.invoke('autorun:readDoc', folderPath, filename),
    writeDoc: (folderPath: string, filename: string, content: string) =>
      ipcRenderer.invoke('autorun:writeDoc', folderPath, filename, content),
    saveImage: (
      folderPath: string,
      docName: string,
      base64Data: string,
      extension: string
    ) =>
      ipcRenderer.invoke(
        'autorun:saveImage',
        folderPath,
        docName,
        base64Data,
        extension
      ),
    deleteImage: (folderPath: string, relativePath: string) =>
      ipcRenderer.invoke('autorun:deleteImage', folderPath, relativePath),
    listImages: (folderPath: string, docName: string) =>
      ipcRenderer.invoke('autorun:listImages', folderPath, docName),
  },

  // Playbooks API (saved batch run configurations)
  playbooks: {
    list: (sessionId: string) =>
      ipcRenderer.invoke('playbooks:list', sessionId),
    create: (
      sessionId: string,
      playbook: {
        name: string;
        documents: Array<{ filename: string; resetOnCompletion: boolean }>;
        loopEnabled: boolean;
        prompt: string;
        worktreeSettings?: {
          branchNameTemplate: string;
          createPROnCompletion: boolean;
        };
      }
    ) => ipcRenderer.invoke('playbooks:create', sessionId, playbook),
    update: (
      sessionId: string,
      playbookId: string,
      updates: Partial<{
        name: string;
        documents: Array<{ filename: string; resetOnCompletion: boolean }>;
        loopEnabled: boolean;
        prompt: string;
        worktreeSettings?: {
          branchNameTemplate: string;
          createPROnCompletion: boolean;
        };
      }>
    ) => ipcRenderer.invoke('playbooks:update', sessionId, playbookId, updates),
    delete: (sessionId: string, playbookId: string) =>
      ipcRenderer.invoke('playbooks:delete', sessionId, playbookId),
  },
});

// Type definitions for TypeScript
export interface MaestroAPI {
  settings: {
    get: (key: string) => Promise<unknown>;
    set: (key: string, value: unknown) => Promise<boolean>;
    getAll: () => Promise<Record<string, unknown>>;
  };
  sessions: {
    getAll: () => Promise<any[]>;
    setAll: (sessions: any[]) => Promise<boolean>;
  };
  groups: {
    getAll: () => Promise<any[]>;
    setAll: (groups: any[]) => Promise<boolean>;
  };
  process: {
    spawn: (config: ProcessConfig) => Promise<{ pid: number; success: boolean }>;
    write: (sessionId: string, data: string) => Promise<boolean>;
    interrupt: (sessionId: string) => Promise<boolean>;
    kill: (sessionId: string) => Promise<boolean>;
    resize: (sessionId: string, cols: number, rows: number) => Promise<boolean>;
    runCommand: (config: { sessionId: string; command: string; cwd: string; shell?: string }) => Promise<{ exitCode: number }>;
    getActiveProcesses: () => Promise<Array<{
      sessionId: string;
      toolType: string;
      pid: number;
      cwd: string;
      isTerminal: boolean;
      isBatchMode: boolean;
    }>>;
    onData: (callback: (sessionId: string, data: string) => void) => () => void;
    onExit: (callback: (sessionId: string, code: number) => void) => () => void;
    onSessionId: (callback: (sessionId: string, claudeSessionId: string) => void) => () => void;
    onRemoteCommand: (callback: (sessionId: string, command: string) => void) => () => void;
    onRemoteSwitchMode: (callback: (sessionId: string, mode: 'ai' | 'terminal') => void) => () => void;
    onRemoteInterrupt: (callback: (sessionId: string) => void) => () => void;
    onRemoteSelectSession: (callback: (sessionId: string) => void) => () => void;
    onStderr: (callback: (sessionId: string, data: string) => void) => () => void;
    onCommandExit: (callback: (sessionId: string, code: number) => void) => () => void;
    onUsage: (callback: (sessionId: string, usageStats: {
      inputTokens: number;
      outputTokens: number;
      cacheReadInputTokens: number;
      cacheCreationInputTokens: number;
      totalCostUsd: number;
      contextWindow: number;
    }) => void) => () => void;
  };
  git: {
    status: (cwd: string) => Promise<string>;
    diff: (cwd: string, file?: string) => Promise<string>;
    isRepo: (cwd: string) => Promise<boolean>;
    numstat: (cwd: string) => Promise<{ stdout: string; stderr: string }>;
    branch: (cwd: string) => Promise<{ stdout: string; stderr: string }>;
    remote: (cwd: string) => Promise<{ stdout: string; stderr: string }>;
    info: (cwd: string) => Promise<{
      branch: string;
      remote: string;
      behind: number;
      ahead: number;
      uncommittedChanges: number;
    }>;
    log: (cwd: string, options?: { limit?: number; search?: string }) => Promise<{
      entries: Array<{
        hash: string;
        shortHash: string;
        author: string;
        date: string;
        refs: string[];
        subject: string;
      }>;
      error: string | null;
    }>;
    show: (cwd: string, hash: string) => Promise<{ stdout: string; stderr: string }>;
    showFile: (cwd: string, ref: string, filePath: string) => Promise<{ content?: string; error?: string }>;
    // Git worktree operations for Auto Run parallelization
    worktreeInfo: (worktreePath: string) => Promise<{
      success: boolean;
      exists?: boolean;
      isWorktree?: boolean;
      currentBranch?: string;
      repoRoot?: string;
      error?: string;
    }>;
    getRepoRoot: (cwd: string) => Promise<{
      success: boolean;
      root?: string;
      error?: string;
    }>;
    worktreeSetup: (mainRepoCwd: string, worktreePath: string, branchName: string) => Promise<{
      success: boolean;
      created?: boolean;
      currentBranch?: string;
      requestedBranch?: string;
      branchMismatch?: boolean;
      error?: string;
    }>;
    worktreeCheckout: (worktreePath: string, branchName: string, createIfMissing: boolean) => Promise<{
      success: boolean;
      hasUncommittedChanges: boolean;
      error?: string;
    }>;
    createPR: (worktreePath: string, baseBranch: string, title: string, body: string) => Promise<{
      success: boolean;
      prUrl?: string;
      error?: string;
    }>;
    getDefaultBranch: (cwd: string) => Promise<{
      success: boolean;
      branch?: string;
      error?: string;
    }>;
    checkGhCli: () => Promise<{
      installed: boolean;
      authenticated: boolean;
    }>;
  };
  fs: {
    homeDir: () => Promise<string>;
    readDir: (dirPath: string) => Promise<DirectoryEntry[]>;
    readFile: (filePath: string) => Promise<string>;
    stat: (filePath: string) => Promise<{
      size: number;
      createdAt: string;
      modifiedAt: string;
      isDirectory: boolean;
      isFile: boolean;
    }>;
  };
  webserver: {
    getUrl: () => Promise<string>;
    getConnectedClients: () => Promise<number>;
  };
  live: {
    toggle: (sessionId: string, claudeSessionId?: string) => Promise<{ live: boolean; url: string | null }>;
    getStatus: (sessionId: string) => Promise<{ live: boolean; url: string | null }>;
    getDashboardUrl: () => Promise<string | null>;
    getLiveSessions: () => Promise<Array<{ sessionId: string; claudeSessionId?: string; enabledAt: number }>>;
    broadcastActiveSession: (sessionId: string) => Promise<void>;
    disableAll: () => Promise<{ success: boolean; count: number }>;
  };
  agents: {
    detect: () => Promise<AgentConfig[]>;
    get: (agentId: string) => Promise<AgentConfig | null>;
    getConfig: (agentId: string) => Promise<Record<string, any>>;
    setConfig: (agentId: string, config: Record<string, any>) => Promise<boolean>;
    getConfigValue: (agentId: string, key: string) => Promise<any>;
    setConfigValue: (agentId: string, key: string, value: any) => Promise<boolean>;
  };
  dialog: {
    selectFolder: () => Promise<string | null>;
  };
  fonts: {
    detect: () => Promise<string[]>;
  };
  shells: {
    detect: () => Promise<ShellInfo[]>;
  };
  shell: {
    openExternal: (url: string) => Promise<void>;
  };
  tunnel: {
    isCloudflaredInstalled: () => Promise<boolean>;
    start: () => Promise<{ success: boolean; url?: string; error?: string }>;
    stop: () => Promise<{ success: boolean }>;
    getStatus: () => Promise<{ isRunning: boolean; url: string | null; error: string | null }>;
  };
  devtools: {
    open: () => Promise<void>;
    close: () => Promise<void>;
    toggle: () => Promise<void>;
  };
  logger: {
    log: (level: string, message: string, context?: string, data?: unknown) => Promise<void>;
    getLogs: (filter?: { level?: string; context?: string; limit?: number }) => Promise<Array<{
      timestamp: number;
      level: string;
      message: string;
      context?: string;
      data?: unknown;
    }>>;
    clearLogs: () => Promise<void>;
    setLogLevel: (level: string) => Promise<void>;
    getLogLevel: () => Promise<string>;
    setMaxLogBuffer: (max: number) => Promise<void>;
    getMaxLogBuffer: () => Promise<number>;
  };
  claude: {
    listSessions: (projectPath: string) => Promise<Array<{
      sessionId: string;
      projectPath: string;
      timestamp: string;
      modifiedAt: string;
      firstMessage: string;
      messageCount: number;
      sizeBytes: number;
      costUsd: number;
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens: number;
      cacheCreationTokens: number;
      durationSeconds: number;
      origin?: 'user' | 'auto'; // Maestro session origin, undefined for CLI sessions
      sessionName?: string; // User-defined session name from Maestro
    }>>;
    // Paginated version for better performance with many sessions
    listSessionsPaginated: (projectPath: string, options?: { cursor?: string; limit?: number }) => Promise<{
      sessions: Array<{
        sessionId: string;
        projectPath: string;
        timestamp: string;
        modifiedAt: string;
        firstMessage: string;
        messageCount: number;
        sizeBytes: number;
        costUsd: number;
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens: number;
        cacheCreationTokens: number;
        durationSeconds: number;
        origin?: 'user' | 'auto';
        sessionName?: string;
      }>;
      hasMore: boolean;
      totalCount: number;
      nextCursor: string | null;
    }>;
    // Get aggregate stats for all sessions in a project
    getProjectStats: (projectPath: string) => Promise<{
      totalSessions: number;
      totalMessages: number;
      totalCostUsd: number;
      totalSizeBytes: number;
      oldestTimestamp: string | null;
    }>;
    onProjectStatsUpdate: (callback: (stats: {
      projectPath: string;
      totalSessions: number;
      totalMessages: number;
      totalCostUsd: number;
      totalSizeBytes: number;
      oldestTimestamp: string | null;
      processedCount: number;
      isComplete: boolean;
    }) => void) => () => void;
    onGlobalStatsUpdate: (callback: (stats: {
      totalSessions: number;
      totalMessages: number;
      totalInputTokens: number;
      totalOutputTokens: number;
      totalCacheReadTokens: number;
      totalCacheCreationTokens: number;
      totalCostUsd: number;
      totalSizeBytes: number;
      isComplete: boolean;
    }) => void) => () => void;
    readSessionMessages: (projectPath: string, sessionId: string, options?: { offset?: number; limit?: number }) => Promise<{
      messages: Array<{
        type: string;
        role?: string;
        content: string;
        timestamp: string;
        uuid: string;
        toolUse?: any;
      }>;
      total: number;
      hasMore: boolean;
    }>;
    searchSessions: (projectPath: string, query: string, searchMode: 'title' | 'user' | 'assistant' | 'all') => Promise<Array<{
      sessionId: string;
      matchType: 'title' | 'user' | 'assistant';
      matchPreview: string;
      matchCount: number;
    }>>;
    getCommands: (projectPath: string) => Promise<Array<{
      command: string;
      description: string;
    }>>;
    registerSessionOrigin: (projectPath: string, claudeSessionId: string, origin: 'user' | 'auto', sessionName?: string) => Promise<boolean>;
    updateSessionName: (projectPath: string, claudeSessionId: string, sessionName: string) => Promise<boolean>;
    updateSessionStarred: (projectPath: string, claudeSessionId: string, starred: boolean) => Promise<boolean>;
    getSessionOrigins: (projectPath: string) => Promise<Record<string, 'user' | 'auto' | { origin: 'user' | 'auto'; sessionName?: string; starred?: boolean }>>;
    deleteMessagePair: (projectPath: string, sessionId: string, userMessageUuid: string, fallbackContent?: string) => Promise<{ success: boolean; linesRemoved?: number; error?: string }>;
  };
  tempfile: {
    write: (content: string, filename?: string) => Promise<{ success: boolean; path?: string; error?: string }>;
    read: (filePath: string) => Promise<{ success: boolean; content?: string; error?: string }>;
    delete: (filePath: string) => Promise<{ success: boolean; error?: string }>;
  };
  history: {
    getAll: (projectPath?: string, sessionId?: string) => Promise<Array<{
      id: string;
      type: 'AUTO' | 'USER';
      timestamp: number;
      summary: string;
      claudeSessionId?: string;
      projectPath: string;
      sessionId?: string;
    }>>;
    add: (entry: {
      id: string;
      type: 'AUTO' | 'USER';
      timestamp: number;
      summary: string;
      claudeSessionId?: string;
      projectPath: string;
      sessionId?: string;
    }) => Promise<boolean>;
    clear: (projectPath?: string) => Promise<boolean>;
    delete: (entryId: string) => Promise<boolean>;
  };
  notification: {
    show: (title: string, body: string) => Promise<{ success: boolean; error?: string }>;
    speak: (text: string, command?: string) => Promise<{ success: boolean; ttsId?: number; error?: string }>;
    stopSpeak: (ttsId: number) => Promise<{ success: boolean; error?: string }>;
    onTtsCompleted: (handler: (ttsId: number) => void) => () => void;
  };
  attachments: {
    save: (sessionId: string, base64Data: string, filename: string) => Promise<{ success: boolean; path?: string; filename?: string; error?: string }>;
    load: (sessionId: string, filename: string) => Promise<{ success: boolean; dataUrl?: string; error?: string }>;
    delete: (sessionId: string, filename: string) => Promise<{ success: boolean; error?: string }>;
    list: (sessionId: string) => Promise<{ success: boolean; files: string[]; error?: string }>;
    getPath: (sessionId: string) => Promise<{ success: boolean; path: string }>;
  };
  autorun: {
    listDocs: (
      folderPath: string
    ) => Promise<{ success: boolean; files: string[]; error?: string }>;
    readDoc: (
      folderPath: string,
      filename: string
    ) => Promise<{ success: boolean; content?: string; error?: string }>;
    writeDoc: (
      folderPath: string,
      filename: string,
      content: string
    ) => Promise<{ success: boolean; error?: string }>;
    saveImage: (
      folderPath: string,
      docName: string,
      base64Data: string,
      extension: string
    ) => Promise<{ success: boolean; relativePath?: string; error?: string }>;
    deleteImage: (
      folderPath: string,
      relativePath: string
    ) => Promise<{ success: boolean; error?: string }>;
    listImages: (
      folderPath: string,
      docName: string
    ) => Promise<{
      success: boolean;
      images?: { filename: string; relativePath: string }[];
      error?: string;
    }>;
  };
  playbooks: {
    list: (sessionId: string) => Promise<{
      success: boolean;
      playbooks: Array<{
        id: string;
        name: string;
        createdAt: number;
        updatedAt: number;
        documents: Array<{ filename: string; resetOnCompletion: boolean }>;
        loopEnabled: boolean;
        prompt: string;
      }>;
      error?: string;
    }>;
    create: (
      sessionId: string,
      playbook: {
        name: string;
        documents: Array<{ filename: string; resetOnCompletion: boolean }>;
        loopEnabled: boolean;
        prompt: string;
      }
    ) => Promise<{
      success: boolean;
      playbook?: {
        id: string;
        name: string;
        createdAt: number;
        updatedAt: number;
        documents: Array<{ filename: string; resetOnCompletion: boolean }>;
        loopEnabled: boolean;
        prompt: string;
      };
      error?: string;
    }>;
    update: (
      sessionId: string,
      playbookId: string,
      updates: Partial<{
        name: string;
        documents: Array<{ filename: string; resetOnCompletion: boolean }>;
        loopEnabled: boolean;
        prompt: string;
      }>
    ) => Promise<{
      success: boolean;
      playbook?: {
        id: string;
        name: string;
        createdAt: number;
        updatedAt: number;
        documents: Array<{ filename: string; resetOnCompletion: boolean }>;
        loopEnabled: boolean;
        prompt: string;
      };
      error?: string;
    }>;
    delete: (sessionId: string, playbookId: string) => Promise<{
      success: boolean;
      error?: string;
    }>;
  };
}

declare global {
  interface Window {
    maestro: MaestroAPI;
  }
}
