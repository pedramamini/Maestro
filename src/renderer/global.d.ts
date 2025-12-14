/**
 * Global type declarations for the renderer process.
 * This file makes the window.maestro API available throughout the renderer.
 */

// Vite raw imports for .md files
declare module '*.md?raw' {
  const content: string;
  export default content;
}

interface ProcessConfig {
  sessionId: string;
  toolType: string;
  cwd: string;
  command: string;
  args: string[];
  prompt?: string;
  shell?: string;
  images?: string[];
}

interface AgentConfig {
  id: string;
  name: string;
  available: boolean;
  path?: string;
  command?: string;
  args?: string[];
  hidden?: boolean;
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

interface UsageStats {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  totalCostUsd: number;
  contextWindow: number;
}

type HistoryEntryType = 'AUTO' | 'USER';

interface MaestroAPI {
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
    onSlashCommands: (callback: (sessionId: string, slashCommands: string[]) => void) => () => void;
    onRemoteCommand: (callback: (sessionId: string, command: string, inputMode?: 'ai' | 'terminal') => void) => () => void;
    onRemoteSwitchMode: (callback: (sessionId: string, mode: 'ai' | 'terminal') => void) => () => void;
    onRemoteInterrupt: (callback: (sessionId: string) => void) => () => void;
    onRemoteSelectSession: (callback: (sessionId: string) => void) => () => void;
    onRemoteSelectTab: (callback: (sessionId: string, tabId: string) => void) => () => void;
    onRemoteNewTab: (callback: (sessionId: string, responseChannel: string) => void) => () => void;
    sendRemoteNewTabResponse: (responseChannel: string, result: { tabId: string } | null) => void;
    onRemoteCloseTab: (callback: (sessionId: string, tabId: string) => void) => () => void;
    onStderr: (callback: (sessionId: string, data: string) => void) => () => void;
    onCommandExit: (callback: (sessionId: string, code: number) => void) => () => void;
    onUsage: (callback: (sessionId: string, usageStats: UsageStats) => void) => () => void;
  };
  web: {
    broadcastUserInput: (sessionId: string, command: string, inputMode: 'ai' | 'terminal') => Promise<void>;
    broadcastAutoRunState: (sessionId: string, state: {
      isRunning: boolean;
      totalTasks: number;
      completedTasks: number;
      currentTaskIndex: number;
      isStopping?: boolean;
    } | null) => Promise<void>;
    broadcastTabsChange: (sessionId: string, aiTabs: Array<{
      id: string;
      claudeSessionId: string | null;
      name: string | null;
      starred: boolean;
      inputValue: string;
      usageStats?: UsageStats;
      createdAt: number;
      state: 'idle' | 'busy';
      thinkingStartTime?: number | null;
    }>, activeTabId: string) => Promise<void>;
  };
  git: {
    status: (cwd: string) => Promise<{ stdout: string; stderr: string }>;
    diff: (cwd: string, file?: string) => Promise<{ stdout: string; stderr: string }>;
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
  };
  fs: {
    readDir: (dirPath: string) => Promise<DirectoryEntry[]>;
    readFile: (filePath: string) => Promise<string>;
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
    startServer: () => Promise<{ success: boolean; url?: string; error?: string }>;
    stopServer: () => Promise<{ success: boolean; error?: string }>;
  };
  agents: {
    detect: () => Promise<AgentConfig[]>;
    refresh: (agentId?: string) => Promise<AgentConfig[]>;
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
    toast: (title: string, data?: unknown) => Promise<void>;
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
      origin?: 'user' | 'auto';
      sessionName?: string;
      starred?: boolean;
    }>>;
    getGlobalStats: () => Promise<{
      totalSessions: number;
      totalMessages: number;
      totalInputTokens: number;
      totalOutputTokens: number;
      totalCacheReadTokens: number;
      totalCacheCreationTokens: number;
      totalCostUsd: number;
      totalSizeBytes: number;
      isComplete: boolean;
    }>;
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
    getAllNamedSessions: () => Promise<Array<{
      claudeSessionId: string;
      projectPath: string;
      sessionName: string;
      starred?: boolean;
      lastActivityAt?: number;
    }>>;
    deleteMessagePair: (projectPath: string, sessionId: string, userMessageUuid: string, fallbackContent?: string) => Promise<{ success: boolean; linesRemoved?: number; error?: string }>;
    getSessionTimestamps: (projectPath: string) => Promise<{ timestamps: string[] }>;
  };
  tempfile: {
    write: (content: string, filename?: string) => Promise<{ success: boolean; path?: string; error?: string }>;
    read: (filePath: string) => Promise<{ success: boolean; content?: string; error?: string }>;
    delete: (filePath: string) => Promise<{ success: boolean; error?: string }>;
  };
  history: {
    getAll: (projectPath?: string, sessionId?: string) => Promise<Array<{
      id: string;
      type: HistoryEntryType;
      timestamp: number;
      summary: string;
      fullResponse?: string;
      claudeSessionId?: string;
      projectPath: string;
      sessionId?: string;
      sessionName?: string;
      contextUsage?: number;
      usageStats?: UsageStats;
      success?: boolean;
      elapsedTimeMs?: number;
      validated?: boolean;
    }>>;
    add: (entry: {
      id: string;
      type: HistoryEntryType;
      timestamp: number;
      summary: string;
      fullResponse?: string;
      claudeSessionId?: string;
      projectPath: string;
      sessionId?: string;
      sessionName?: string;
      contextUsage?: number;
      usageStats?: UsageStats;
      success?: boolean;
      elapsedTimeMs?: number;
      validated?: boolean;
    }) => Promise<boolean>;
    clear: (projectPath?: string) => Promise<boolean>;
    delete: (entryId: string) => Promise<boolean>;
    update: (entryId: string, updates: { validated?: boolean }) => Promise<boolean>;
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
  // Auto Run file operations
  autorun: {
    listDocs: (folderPath: string) => Promise<{
      success: boolean;
      files: string[];
      tree?: Array<{
        name: string;
        type: 'file' | 'folder';
        path: string;
        children?: Array<{
          name: string;
          type: 'file' | 'folder';
          path: string;
          children?: unknown[];  // Recursive type
        }>;
      }>;
      error?: string;
    }>;
    readDoc: (folderPath: string, filename: string) => Promise<{ success: boolean; content?: string; error?: string }>;
    writeDoc: (folderPath: string, filename: string, content: string) => Promise<{ success: boolean; error?: string }>;
    saveImage: (folderPath: string, docName: string, base64Data: string, extension: string) => Promise<{ success: boolean; relativePath?: string; error?: string }>;
    deleteImage: (folderPath: string, relativePath: string) => Promise<{ success: boolean; error?: string }>;
    listImages: (folderPath: string, docName: string) => Promise<{ success: boolean; images?: Array<{ filename: string; relativePath: string }>; error?: string }>;
    deleteFolder: (projectPath: string) => Promise<{ success: boolean; error?: string }>;
    // File watching for live updates
    watchFolder: (folderPath: string) => Promise<{ success: boolean; error?: string }>;
    unwatchFolder: (folderPath: string) => Promise<{ success: boolean; error?: string }>;
    onFileChanged: (handler: (data: { folderPath: string; filename: string; eventType: string }) => void) => () => void;
  };
  // Playbooks API (saved batch run configurations)
  playbooks: {
    list: (sessionId: string) => Promise<{ success: boolean; playbooks: Array<{
      id: string;
      name: string;
      createdAt: number;
      updatedAt: number;
      documents: Array<{ filename: string; resetOnCompletion: boolean }>;
      loopEnabled: boolean;
      prompt: string;
    }>; error?: string }>;
    create: (sessionId: string, playbook: {
      name: string;
      documents: Array<{ filename: string; resetOnCompletion: boolean }>;
      loopEnabled: boolean;
      prompt: string;
    }) => Promise<{ success: boolean; playbook?: any; error?: string }>;
    update: (sessionId: string, playbookId: string, updates: Partial<{
      name: string;
      documents: Array<{ filename: string; resetOnCompletion: boolean }>;
      loopEnabled: boolean;
      prompt: string;
    }>) => Promise<{ success: boolean; playbook?: any; error?: string }>;
    delete: (sessionId: string, playbookId: string) => Promise<{ success: boolean; error?: string }>;
    export: (sessionId: string, playbookId: string, autoRunFolderPath: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
    import: (sessionId: string, autoRunFolderPath: string) => Promise<{ success: boolean; playbook?: any; importedDocs?: string[]; error?: string }>;
  };
}

declare global {
  interface Window {
    maestro: MaestroAPI;
    maestroTest?: {
      addToast: (type: 'success' | 'info' | 'warning' | 'error', title: string, message: string) => void;
      showPromptTooLong: (usageStats: any) => void;
    };
  }
}

export {};
