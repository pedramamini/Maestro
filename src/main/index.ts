import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { ProcessManager } from './process-manager';
import { WebServer } from './web-server';
import { AgentDetector } from './agent-detector';
import { execFileNoThrow } from './utils/execFile';
import { logger } from './utils/logger';
import { detectShells } from './utils/shellDetector';
import { getThemeById } from './themes';
import Store from 'electron-store';

// Type definitions
interface MaestroSettings {
  activeThemeId: string;
  llmProvider: string;
  modelSlug: string;
  apiKey: string;
  tunnelProvider: string;
  tunnelApiKey: string;
  shortcuts: Record<string, any>;
  defaultAgent: string;
  fontSize: number;
  fontFamily: string;
  customFonts: string[];
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  defaultShell: string;
  // Web interface authentication
  webAuthEnabled: boolean;
  webAuthToken: string | null;
}

const store = new Store<MaestroSettings>({
  name: 'maestro-settings',
  defaults: {
    activeThemeId: 'dracula',
    llmProvider: 'openrouter',
    modelSlug: 'anthropic/claude-3.5-sonnet',
    apiKey: '',
    tunnelProvider: 'ngrok',
    tunnelApiKey: '',
    shortcuts: {},
    defaultAgent: 'claude-code',
    fontSize: 14,
    fontFamily: 'Roboto Mono, Menlo, "Courier New", monospace',
    customFonts: [],
    logLevel: 'info',
    defaultShell: 'zsh',
    webAuthEnabled: false,
    webAuthToken: null,
  },
});

// Sessions store
interface SessionsData {
  sessions: any[];
}

const sessionsStore = new Store<SessionsData>({
  name: 'maestro-sessions',
  defaults: {
    sessions: [],
  },
});

// Groups store
interface GroupsData {
  groups: any[];
}

const groupsStore = new Store<GroupsData>({
  name: 'maestro-groups',
  defaults: {
    groups: [],
  },
});

interface AgentConfigsData {
  configs: Record<string, Record<string, any>>; // agentId -> config key-value pairs
}

const agentConfigsStore = new Store<AgentConfigsData>({
  name: 'maestro-agent-configs',
  defaults: {
    configs: {},
  },
});

// Window state store (for remembering window size/position)
interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized: boolean;
  isFullScreen: boolean;
}

const windowStateStore = new Store<WindowState>({
  name: 'maestro-window-state',
  defaults: {
    width: 1400,
    height: 900,
    isMaximized: false,
    isFullScreen: false,
  },
});

// History entries store (per-project history for AUTO and USER entries)
interface HistoryEntry {
  id: string;
  type: 'AUTO' | 'USER';
  timestamp: number;
  summary: string;
  fullResponse?: string;
  claudeSessionId?: string;
  projectPath: string;
  sessionId?: string; // Maestro session ID for isolation
  contextUsage?: number; // Context window usage percentage at time of entry
  usageStats?: { // Token usage and cost at time of entry
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
    totalCostUsd: number;
    contextWindow: number;
  };
  success?: boolean; // For AUTO entries: whether the task completed successfully
  elapsedTimeMs?: number; // Time taken to complete this task in milliseconds
}

interface HistoryData {
  entries: HistoryEntry[];
}

const historyStore = new Store<HistoryData>({
  name: 'maestro-history',
  defaults: {
    entries: [],
  },
});

// Claude session origins store - tracks which Claude sessions were created by Maestro
// and their origin type (user-initiated vs auto/batch)
type ClaudeSessionOrigin = 'user' | 'auto';
interface ClaudeSessionOriginInfo {
  origin: ClaudeSessionOrigin;
  sessionName?: string; // User-defined session name from Maestro
}
interface ClaudeSessionOriginsData {
  // Map of projectPath -> { claudeSessionId -> origin info }
  origins: Record<string, Record<string, ClaudeSessionOrigin | ClaudeSessionOriginInfo>>;
}

const claudeSessionOriginsStore = new Store<ClaudeSessionOriginsData>({
  name: 'maestro-claude-session-origins',
  defaults: {
    origins: {},
  },
});

let mainWindow: BrowserWindow | null = null;
let processManager: ProcessManager | null = null;
let webServer: WebServer | null = null;
let agentDetector: AgentDetector | null = null;

/**
 * Create and configure the web server with all necessary callbacks.
 * Called when user enables the web interface.
 */
function createWebServer(): WebServer {
  const server = new WebServer(); // Random port with auto-generated security token

  // Set up callback for web server to fetch sessions list
  server.setGetSessionsCallback(() => {
    const sessions = sessionsStore.get('sessions', []);
    const groups = groupsStore.get('groups', []);
    return sessions.map((s: any) => {
      // Find the group for this session
      const group = s.groupId ? groups.find((g: any) => g.id === s.groupId) : null;

      // Extract last AI response for mobile preview (first 3 lines, max 500 chars)
      let lastResponse = null;
      if (s.aiLogs && s.aiLogs.length > 0) {
        // Find the last stdout/stderr entry from the AI (not user messages)
        const lastAiLog = [...s.aiLogs].reverse().find((log: any) =>
          log.source === 'stdout' || log.source === 'stderr'
        );
        if (lastAiLog && lastAiLog.text) {
          const fullText = lastAiLog.text;
          // Get first 3 lines or 500 chars, whichever is shorter
          const lines = fullText.split('\n').slice(0, 3);
          let previewText = lines.join('\n');
          if (previewText.length > 500) {
            previewText = previewText.slice(0, 497) + '...';
          } else if (fullText.length > previewText.length) {
            previewText = previewText + '...';
          }
          lastResponse = {
            text: previewText,
            timestamp: lastAiLog.timestamp,
            source: lastAiLog.source,
            fullLength: fullText.length,
          };
        }
      }

      // Map aiTabs to web-safe format (strip logs to reduce payload)
      const aiTabs = s.aiTabs?.map((tab: any) => ({
        id: tab.id,
        claudeSessionId: tab.claudeSessionId || null,
        name: tab.name || null,
        starred: tab.starred || false,
        inputValue: tab.inputValue || '',
        usageStats: tab.usageStats || null,
        createdAt: tab.createdAt,
        state: tab.state || 'idle',
        thinkingStartTime: tab.thinkingStartTime || null,
      })) || [];

      return {
        id: s.id,
        name: s.name,
        toolType: s.toolType,
        state: s.state,
        inputMode: s.inputMode,
        cwd: s.cwd,
        groupId: s.groupId || null,
        groupName: group?.name || null,
        groupEmoji: group?.emoji || null,
        usageStats: s.usageStats || null,
        lastResponse,
        claudeSessionId: s.claudeSessionId || null,
        thinkingStartTime: s.thinkingStartTime || null,
        aiTabs,
        activeTabId: s.activeTabId || (aiTabs.length > 0 ? aiTabs[0].id : undefined),
      };
    });
  });

  // Set up callback for web server to fetch single session details
  server.setGetSessionDetailCallback((sessionId: string) => {
    const sessions = sessionsStore.get('sessions', []);
    const session = sessions.find((s: any) => s.id === sessionId);
    if (!session) return null;
    return {
      id: session.id,
      name: session.name,
      toolType: session.toolType,
      state: session.state,
      inputMode: session.inputMode,
      cwd: session.cwd,
      aiLogs: session.aiLogs || [],
      shellLogs: session.shellLogs || [],
      usageStats: session.usageStats,
      claudeSessionId: session.claudeSessionId,
      isGitRepo: session.isGitRepo,
    };
  });

  // Set up callback for web server to fetch current theme
  server.setGetThemeCallback(() => {
    const themeId = store.get('activeThemeId', 'dracula');
    return getThemeById(themeId);
  });

  // Set up callback for web server to fetch custom AI commands
  server.setGetCustomCommandsCallback(() => {
    const customCommands = store.get('customAICommands', []) as Array<{
      id: string;
      command: string;
      description: string;
      prompt: string;
    }>;
    return customCommands;
  });

  // Set up callback for web server to fetch history entries
  server.setGetHistoryCallback((projectPath?: string, sessionId?: string) => {
    const allEntries = historyStore.get('entries', []);
    let filteredEntries = allEntries;

    // Filter by project path if provided
    if (projectPath) {
      filteredEntries = filteredEntries.filter(
        (entry: HistoryEntry) => entry.projectPath === projectPath
      );
    }

    // Filter by session ID if provided (excludes entries from other sessions)
    if (sessionId) {
      filteredEntries = filteredEntries.filter(
        (entry: HistoryEntry) => !entry.sessionId || entry.sessionId === sessionId
      );
    }

    return filteredEntries;
  });

  // Set up callback for web server to write commands to sessions
  // Note: Process IDs have -ai or -terminal suffix based on session's inputMode
  server.setWriteToSessionCallback((sessionId: string, data: string) => {
    if (!processManager) {
      logger.warn('processManager is null for writeToSession', 'WebServer');
      return false;
    }

    // Get the session's current inputMode to determine which process to write to
    const sessions = sessionsStore.get('sessions', []);
    const session = sessions.find((s: any) => s.id === sessionId);
    if (!session) {
      logger.warn(`Session ${sessionId} not found for writeToSession`, 'WebServer');
      return false;
    }

    // Append -ai or -terminal suffix based on inputMode
    const targetSessionId = session.inputMode === 'ai' ? `${sessionId}-ai` : `${sessionId}-terminal`;
    logger.debug(`Writing to ${targetSessionId} (inputMode=${session.inputMode})`, 'WebServer');

    const result = processManager.write(targetSessionId, data);
    logger.debug(`Write result: ${result}`, 'WebServer');
    return result;
  });

  // Set up callback for web server to execute commands through the desktop
  // This forwards AI commands to the renderer, ensuring single source of truth
  // The renderer handles all spawn logic, state management, and broadcasts
  server.setExecuteCommandCallback(async (sessionId: string, command: string) => {
    if (!mainWindow) {
      logger.warn('mainWindow is null for executeCommand', 'WebServer');
      return false;
    }

    // Look up the session to get Claude session ID for logging
    const sessions = sessionsStore.get('sessions', []);
    const session = sessions.find((s: any) => s.id === sessionId);
    const claudeSessionId = session?.claudeSessionId || 'none';

    // Forward to renderer - it will handle spawn, state, and everything else
    // This ensures web commands go through exact same code path as desktop commands
    logger.info(`[Web → Renderer] Forwarding command | Maestro: ${sessionId} | Claude: ${claudeSessionId} | Command: ${command.substring(0, 100)}`, 'WebServer');
    mainWindow.webContents.send('remote:executeCommand', sessionId, command);
    return true;
  });

  // Set up callback for web server to interrupt sessions through the desktop
  // This forwards to the renderer which handles state updates and broadcasts
  server.setInterruptSessionCallback(async (sessionId: string) => {
    if (!mainWindow) {
      logger.warn('mainWindow is null for interrupt', 'WebServer');
      return false;
    }

    // Forward to renderer - it will handle interrupt, state update, and broadcasts
    // This ensures web interrupts go through exact same code path as desktop interrupts
    logger.debug(`Forwarding interrupt to renderer for session ${sessionId}`, 'WebServer');
    mainWindow.webContents.send('remote:interrupt', sessionId);
    return true;
  });

  // Set up callback for web server to switch session mode through the desktop
  // This forwards to the renderer which handles state updates and broadcasts
  server.setSwitchModeCallback(async (sessionId: string, mode: 'ai' | 'terminal') => {
    logger.info(`[Web→Desktop] Mode switch callback invoked: session=${sessionId}, mode=${mode}`, 'WebServer');
    if (!mainWindow) {
      logger.warn('mainWindow is null for switchMode', 'WebServer');
      return false;
    }

    // Forward to renderer - it will handle mode switch and broadcasts
    // This ensures web mode switches go through exact same code path as desktop
    logger.info(`[Web→Desktop] Sending IPC remote:switchMode to renderer`, 'WebServer');
    mainWindow.webContents.send('remote:switchMode', sessionId, mode);
    return true;
  });

  // Set up callback for web server to select/switch to a session in the desktop
  // This forwards to the renderer which handles state updates and broadcasts
  server.setSelectSessionCallback(async (sessionId: string) => {
    logger.info(`[Web→Desktop] Session select callback invoked: session=${sessionId}`, 'WebServer');
    if (!mainWindow) {
      logger.warn('mainWindow is null for selectSession', 'WebServer');
      return false;
    }

    // Forward to renderer - it will handle session selection and broadcasts
    logger.info(`[Web→Desktop] Sending IPC remote:selectSession to renderer`, 'WebServer');
    mainWindow.webContents.send('remote:selectSession', sessionId);
    return true;
  });

  // Tab operation callbacks
  server.setSelectTabCallback(async (sessionId: string, tabId: string) => {
    logger.info(`[Web→Desktop] Tab select callback invoked: session=${sessionId}, tab=${tabId}`, 'WebServer');
    if (!mainWindow) {
      logger.warn('mainWindow is null for selectTab', 'WebServer');
      return false;
    }

    mainWindow.webContents.send('remote:selectTab', sessionId, tabId);
    return true;
  });

  server.setNewTabCallback(async (sessionId: string) => {
    logger.info(`[Web→Desktop] New tab callback invoked: session=${sessionId}`, 'WebServer');
    if (!mainWindow) {
      logger.warn('mainWindow is null for newTab', 'WebServer');
      return null;
    }

    // Use invoke for synchronous response with tab ID
    return new Promise((resolve) => {
      const responseChannel = `remote:newTab:response:${Date.now()}`;
      ipcMain.once(responseChannel, (_event, result) => {
        resolve(result);
      });
      mainWindow!.webContents.send('remote:newTab', sessionId, responseChannel);
      // Timeout after 5 seconds
      setTimeout(() => resolve(null), 5000);
    });
  });

  server.setCloseTabCallback(async (sessionId: string, tabId: string) => {
    logger.info(`[Web→Desktop] Close tab callback invoked: session=${sessionId}, tab=${tabId}`, 'WebServer');
    if (!mainWindow) {
      logger.warn('mainWindow is null for closeTab', 'WebServer');
      return false;
    }

    mainWindow.webContents.send('remote:closeTab', sessionId, tabId);
    return true;
  });

  return server;
}

function createWindow() {
  // Restore saved window state
  const savedState = windowStateStore.store;

  mainWindow = new BrowserWindow({
    x: savedState.x,
    y: savedState.y,
    width: savedState.width,
    height: savedState.height,
    minWidth: 1000,
    minHeight: 600,
    backgroundColor: '#0b0b0d',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Restore maximized/fullscreen state after window is created
  if (savedState.isFullScreen) {
    mainWindow.setFullScreen(true);
  } else if (savedState.isMaximized) {
    mainWindow.maximize();
  }

  logger.info('Browser window created', 'Window', {
    size: `${savedState.width}x${savedState.height}`,
    maximized: savedState.isMaximized,
    fullScreen: savedState.isFullScreen,
    mode: process.env.NODE_ENV || 'production'
  });

  // Save window state before closing
  const saveWindowState = () => {
    if (!mainWindow) return;

    const isMaximized = mainWindow.isMaximized();
    const isFullScreen = mainWindow.isFullScreen();
    const bounds = mainWindow.getBounds();

    // Only save bounds if not maximized/fullscreen (to restore proper size later)
    if (!isMaximized && !isFullScreen) {
      windowStateStore.set('x', bounds.x);
      windowStateStore.set('y', bounds.y);
      windowStateStore.set('width', bounds.width);
      windowStateStore.set('height', bounds.height);
    }
    windowStateStore.set('isMaximized', isMaximized);
    windowStateStore.set('isFullScreen', isFullScreen);
  };

  mainWindow.on('close', saveWindowState);

  // Load the app
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    // DevTools can be opened via Command-K menu instead of automatically on startup
    logger.info('Loading development server', 'Window');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    logger.info('Loading production build', 'Window');
    // Open DevTools in production if DEBUG env var is set
    if (process.env.DEBUG === 'true') {
      mainWindow.webContents.openDevTools();
    }
  }

  mainWindow.on('closed', () => {
    logger.info('Browser window closed', 'Window');
    mainWindow = null;
  });
}

// Set up global error handlers for uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error(
    `Uncaught Exception: ${error.message}`,
    'UncaughtException',
    {
      stack: error.stack,
      name: error.name,
    }
  );
  // Don't exit the process - let it continue running
});

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logger.error(
    `Unhandled Promise Rejection: ${reason?.message || String(reason)}`,
    'UnhandledRejection',
    {
      reason: reason,
      stack: reason?.stack,
      promise: String(promise),
    }
  );
});

app.whenReady().then(() => {
  // Load logger settings first
  const logLevel = store.get('logLevel', 'info');
  logger.setLogLevel(logLevel);
  const maxLogBuffer = store.get('maxLogBuffer', 1000);
  logger.setMaxLogBuffer(maxLogBuffer);

  logger.info('Maestro application starting', 'Startup', {
    version: app.getVersion(),
    platform: process.platform,
    logLevel
  });

  // Initialize core services
  logger.info('Initializing core services', 'Startup');
  processManager = new ProcessManager();
  // Note: webServer is created on-demand when user enables web interface (see setupWebServerCallbacks)
  agentDetector = new AgentDetector();

  logger.info('Core services initialized', 'Startup');

  // Set up IPC handlers
  logger.debug('Setting up IPC handlers', 'Startup');
  setupIpcHandlers();

  // Set up process event listeners
  logger.debug('Setting up process event listeners', 'Startup');
  setupProcessListeners();

  // Create main window
  logger.info('Creating main window', 'Startup');
  createWindow();

  // Note: Web server is not auto-started - it starts when user enables web interface
  // via live:startServer IPC call from the renderer

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  logger.info('Application shutting down', 'Shutdown');
  // Clean up all running processes
  logger.info('Killing all running processes', 'Shutdown');
  processManager?.killAll();
  logger.info('Stopping web server', 'Shutdown');
  await webServer?.stop();
  logger.info('Shutdown complete', 'Shutdown');
});

function setupIpcHandlers() {
  // Settings management
  ipcMain.handle('settings:get', async (_, key: string) => {
    const value = store.get(key);
    logger.debug(`Settings read: ${key}`, 'Settings', { key, value });
    return value;
  });

  ipcMain.handle('settings:set', async (_, key: string, value: any) => {
    store.set(key, value);
    logger.info(`Settings updated: ${key}`, 'Settings', { key, value });

    // Broadcast theme changes to connected web clients
    if (key === 'activeThemeId' && webServer && webServer.getWebClientCount() > 0) {
      const theme = getThemeById(value);
      if (theme) {
        webServer.broadcastThemeChange(theme);
        logger.info(`Broadcasted theme change to web clients: ${value}`, 'WebServer');
      }
    }

    // Broadcast custom commands changes to connected web clients
    if (key === 'customAICommands' && webServer && webServer.getWebClientCount() > 0) {
      webServer.broadcastCustomCommands(value);
      logger.info(`Broadcasted custom commands change to web clients: ${value.length} commands`, 'WebServer');
    }

    return true;
  });

  ipcMain.handle('settings:getAll', async () => {
    const settings = store.store;
    logger.debug('All settings retrieved', 'Settings', { count: Object.keys(settings).length });
    return settings;
  });

  // Sessions persistence
  ipcMain.handle('sessions:getAll', async () => {
    return sessionsStore.get('sessions', []);
  });

  ipcMain.handle('sessions:setAll', async (_, sessions: any[]) => {
    // Get previous sessions to detect changes
    const previousSessions = sessionsStore.get('sessions', []);
    const previousSessionMap = new Map(previousSessions.map((s: any) => [s.id, s]));
    const currentSessionMap = new Map(sessions.map((s: any) => [s.id, s]));

    // Detect and broadcast changes to web clients
    if (webServer && webServer.getWebClientCount() > 0) {
      // Check for state changes in existing sessions
      for (const session of sessions) {
        const prevSession = previousSessionMap.get(session.id);
        if (prevSession) {
          // Session exists - check if state changed
          if (prevSession.state !== session.state ||
              prevSession.inputMode !== session.inputMode ||
              prevSession.name !== session.name) {
            webServer.broadcastSessionStateChange(session.id, session.state, {
              name: session.name,
              toolType: session.toolType,
              inputMode: session.inputMode,
              cwd: session.cwd,
            });
          }
        } else {
          // New session added
          webServer.broadcastSessionAdded({
            id: session.id,
            name: session.name,
            toolType: session.toolType,
            state: session.state,
            inputMode: session.inputMode,
            cwd: session.cwd,
          });
        }
      }

      // Check for removed sessions
      for (const prevSession of previousSessions) {
        if (!currentSessionMap.has(prevSession.id)) {
          webServer.broadcastSessionRemoved(prevSession.id);
        }
      }
    }

    sessionsStore.set('sessions', sessions);
    return true;
  });

  // Groups persistence
  ipcMain.handle('groups:getAll', async () => {
    return groupsStore.get('groups', []);
  });

  ipcMain.handle('groups:setAll', async (_, groups: any[]) => {
    groupsStore.set('groups', groups);
    return true;
  });

  // Broadcast user input to web clients (called when desktop sends a message)
  ipcMain.handle('web:broadcastUserInput', async (_, sessionId: string, command: string, inputMode: 'ai' | 'terminal') => {
    if (webServer && webServer.getWebClientCount() > 0) {
      webServer.broadcastUserInput(sessionId, command, inputMode);
      return true;
    }
    return false;
  });

  // Broadcast AutoRun state to web clients (called when batch processing state changes)
  ipcMain.handle('web:broadcastAutoRunState', async (_, sessionId: string, state: {
    isRunning: boolean;
    totalTasks: number;
    completedTasks: number;
    currentTaskIndex: number;
    isStopping?: boolean;
  } | null) => {
    if (webServer && webServer.getWebClientCount() > 0) {
      webServer.broadcastAutoRunState(sessionId, state);
      return true;
    }
    return false;
  });

  // Broadcast tab changes to web clients
  ipcMain.handle('web:broadcastTabsChange', async (_, sessionId: string, aiTabs: any[], activeTabId: string) => {
    if (webServer && webServer.getWebClientCount() > 0) {
      webServer.broadcastTabsChange(sessionId, aiTabs, activeTabId);
      return true;
    }
    return false;
  });

  // Session/Process management
  ipcMain.handle('process:spawn', async (_, config: {
    sessionId: string;
    toolType: string;
    cwd: string;
    command: string;
    args: string[];
    prompt?: string;
    shell?: string;
    images?: string[]; // Base64 data URLs for images
  }) => {
    if (!processManager) throw new Error('Process manager not initialized');
    if (!agentDetector) throw new Error('Agent detector not initialized');

    // Get agent definition to access config options
    const agent = await agentDetector.getAgent(config.toolType);
    let finalArgs = [...config.args];

    // Build additional args from agent configuration
    if (agent && agent.configOptions) {
      const agentConfig = agentConfigsStore.get('configs', {})[config.toolType] || {};

      for (const option of agent.configOptions) {
        if (option.argBuilder) {
          // Get config value, fallback to default
          const value = agentConfig[option.key] !== undefined
            ? agentConfig[option.key]
            : option.default;

          // Build args from this config value
          const additionalArgs = option.argBuilder(value);
          finalArgs = [...finalArgs, ...additionalArgs];
        }
      }
    }

    // If no shell is specified and this is a terminal session, use the default shell from settings
    const shellToUse = config.shell || (config.toolType === 'terminal' ? store.get('defaultShell', 'zsh') : undefined);

    logger.info(`Spawning process: ${config.command}`, 'ProcessManager', {
      sessionId: config.sessionId,
      toolType: config.toolType,
      cwd: config.cwd,
      command: config.command,
      args: finalArgs,
      requiresPty: agent?.requiresPty || false,
      shell: shellToUse
    });

    const result = processManager.spawn({
      ...config,
      args: finalArgs,
      requiresPty: agent?.requiresPty,
      prompt: config.prompt,
      shell: shellToUse
    });

    logger.info(`Process spawned successfully`, 'ProcessManager', {
      sessionId: config.sessionId,
      pid: result.pid
    });
    return result;
  });

  ipcMain.handle('process:write', async (_, sessionId: string, data: string) => {
    if (!processManager) throw new Error('Process manager not initialized');
    logger.debug(`Writing to process: ${sessionId}`, 'ProcessManager', { sessionId, dataLength: data.length });
    return processManager.write(sessionId, data);
  });

  ipcMain.handle('process:interrupt', async (_, sessionId: string) => {
    if (!processManager) throw new Error('Process manager not initialized');
    logger.info(`Interrupting process: ${sessionId}`, 'ProcessManager', { sessionId });
    return processManager.interrupt(sessionId);
  });

  ipcMain.handle('process:kill', async (_, sessionId: string) => {
    if (!processManager) throw new Error('Process manager not initialized');
    logger.info(`Killing process: ${sessionId}`, 'ProcessManager', { sessionId });
    return processManager.kill(sessionId);
  });

  ipcMain.handle('process:resize', async (_, sessionId: string, cols: number, rows: number) => {
    if (!processManager) throw new Error('Process manager not initialized');
    return processManager.resize(sessionId, cols, rows);
  });

  // Get all active processes managed by the ProcessManager
  ipcMain.handle('process:getActiveProcesses', async () => {
    if (!processManager) throw new Error('Process manager not initialized');
    const processes = processManager.getAll();
    // Return serializable process info (exclude non-serializable PTY/child process objects)
    return processes.map(p => ({
      sessionId: p.sessionId,
      toolType: p.toolType,
      pid: p.pid,
      cwd: p.cwd,
      isTerminal: p.isTerminal,
      isBatchMode: p.isBatchMode || false,
    }));
  });

  // Run a single command and capture only stdout/stderr (no PTY echo/prompts)
  ipcMain.handle('process:runCommand', async (_, config: {
    sessionId: string;
    command: string;
    cwd: string;
    shell?: string;
  }) => {
    if (!processManager) throw new Error('Process manager not initialized');

    // Get the shell from settings if not provided
    // Shell name (e.g., 'zsh') will be resolved to full path in process-manager
    const shell = config.shell || store.get('defaultShell', 'zsh');

    logger.debug(`Running command: ${config.command}`, 'ProcessManager', {
      sessionId: config.sessionId,
      cwd: config.cwd,
      shell
    });

    return processManager.runCommand(
      config.sessionId,
      config.command,
      config.cwd,
      shell
    );
  });

  // Git operations
  ipcMain.handle('git:status', async (_, cwd: string) => {
    const result = await execFileNoThrow('git', ['status', '--porcelain'], cwd);
    return { stdout: result.stdout, stderr: result.stderr };
  });

  ipcMain.handle('git:diff', async (_, cwd: string, file?: string) => {
    const args = file ? ['diff', file] : ['diff'];
    const result = await execFileNoThrow('git', args, cwd);
    return { stdout: result.stdout, stderr: result.stderr };
  });

  ipcMain.handle('git:isRepo', async (_, cwd: string) => {
    if (!processManager) throw new Error('Process manager not initialized');
    try {
      const result = await execFileNoThrow('git', ['rev-parse', '--is-inside-work-tree'], cwd);
      return result.exitCode === 0;
    } catch {
      return false;
    }
  });

  ipcMain.handle('git:numstat', async (_, cwd: string) => {
    const result = await execFileNoThrow('git', ['diff', '--numstat'], cwd);
    return { stdout: result.stdout, stderr: result.stderr };
  });

  ipcMain.handle('git:branch', async (_, cwd: string) => {
    const result = await execFileNoThrow('git', ['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
    return { stdout: result.stdout.trim(), stderr: result.stderr };
  });

  ipcMain.handle('git:remote', async (_, cwd: string) => {
    const result = await execFileNoThrow('git', ['remote', 'get-url', 'origin'], cwd);
    return { stdout: result.stdout.trim(), stderr: result.stderr };
  });

  ipcMain.handle('git:info', async (_, cwd: string) => {
    // Get comprehensive git info in a single call
    const [branchResult, remoteResult, statusResult, behindAheadResult] = await Promise.all([
      execFileNoThrow('git', ['rev-parse', '--abbrev-ref', 'HEAD'], cwd),
      execFileNoThrow('git', ['remote', 'get-url', 'origin'], cwd),
      execFileNoThrow('git', ['status', '--porcelain'], cwd),
      execFileNoThrow('git', ['rev-list', '--left-right', '--count', '@{upstream}...HEAD'], cwd)
    ]);

    // Parse behind/ahead counts
    let behind = 0;
    let ahead = 0;
    if (behindAheadResult.exitCode === 0 && behindAheadResult.stdout.trim()) {
      const parts = behindAheadResult.stdout.trim().split(/\s+/);
      behind = parseInt(parts[0], 10) || 0;
      ahead = parseInt(parts[1], 10) || 0;
    }

    // Count uncommitted changes
    const uncommittedChanges = statusResult.stdout.trim()
      ? statusResult.stdout.trim().split('\n').filter(l => l.length > 0).length
      : 0;

    return {
      branch: branchResult.stdout.trim(),
      remote: remoteResult.stdout.trim(),
      behind,
      ahead,
      uncommittedChanges
    };
  });

  ipcMain.handle('git:log', async (_, cwd: string, options?: { limit?: number; search?: string }) => {
    // Get git log with formatted output for parsing
    // Format: hash|author|date|refs|subject
    const limit = options?.limit || 100;
    const args = [
      'log',
      `--max-count=${limit}`,
      '--pretty=format:%H|%an|%ad|%D|%s',
      '--date=iso-strict'
    ];

    // Add search filter if provided
    if (options?.search) {
      args.push('--all', `--grep=${options.search}`, '-i');
    }

    const result = await execFileNoThrow('git', args, cwd);

    if (result.exitCode !== 0) {
      return { entries: [], error: result.stderr };
    }

    const entries = result.stdout
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        const [hash, author, date, refs, ...subjectParts] = line.split('|');
        return {
          hash,
          shortHash: hash?.slice(0, 7),
          author,
          date,
          refs: refs ? refs.split(', ').filter(r => r.trim()) : [],
          subject: subjectParts.join('|'), // In case subject contains |
        };
      });

    return { entries, error: null };
  });

  ipcMain.handle('git:show', async (_, cwd: string, hash: string) => {
    // Get the full diff for a specific commit
    const result = await execFileNoThrow('git', ['show', '--stat', '--patch', hash], cwd);
    return { stdout: result.stdout, stderr: result.stderr };
  });

  // File system operations
  ipcMain.handle('fs:readDir', async (_, dirPath: string) => {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    // Convert Dirent objects to plain objects for IPC serialization
    return entries.map((entry: any) => ({
      name: entry.name,
      isDirectory: entry.isDirectory(),
      isFile: entry.isFile()
    }));
  });

  ipcMain.handle('fs:readFile', async (_, filePath: string) => {
    try {
      // Check if file is an image
      const ext = filePath.split('.').pop()?.toLowerCase();
      const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico'];
      const isImage = imageExtensions.includes(ext || '');

      if (isImage) {
        // Read image as buffer and convert to base64 data URL
        const buffer = await fs.readFile(filePath);
        const base64 = buffer.toString('base64');
        const mimeType = ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
        return `data:${mimeType};base64,${base64}`;
      } else {
        // Read text files as UTF-8
        const content = await fs.readFile(filePath, 'utf-8');
        return content;
      }
    } catch (error) {
      throw new Error(`Failed to read file: ${error}`);
    }
  });

  // Live session management - toggle sessions as live/offline in web interface
  ipcMain.handle('live:toggle', async (_, sessionId: string, claudeSessionId?: string) => {
    if (!webServer) {
      throw new Error('Web server not initialized');
    }

    // Ensure web server is running before allowing live toggle
    if (!webServer.isActive()) {
      logger.warn('Web server not yet started, waiting...', 'Live');
      // Wait for server to start (with timeout)
      const startTime = Date.now();
      while (!webServer.isActive() && Date.now() - startTime < 5000) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      if (!webServer.isActive()) {
        throw new Error('Web server failed to start');
      }
    }

    const isLive = webServer.isSessionLive(sessionId);

    if (isLive) {
      // Turn off live mode
      webServer.setSessionOffline(sessionId);
      logger.info(`Session ${sessionId} is now offline`, 'Live');
      return { live: false, url: null };
    } else {
      // Turn on live mode
      logger.info(`Enabling live mode for session ${sessionId} (claude: ${claudeSessionId || 'none'})`, 'Live');
      webServer.setSessionLive(sessionId, claudeSessionId);
      const url = webServer.getSessionUrl(sessionId);
      logger.info(`Session ${sessionId} is now live at ${url}`, 'Live');
      return { live: true, url };
    }
  });

  ipcMain.handle('live:getStatus', async (_, sessionId: string) => {
    if (!webServer) {
      return { live: false, url: null };
    }
    const isLive = webServer.isSessionLive(sessionId);
    return {
      live: isLive,
      url: isLive ? webServer.getSessionUrl(sessionId) : null,
    };
  });

  ipcMain.handle('live:getDashboardUrl', async () => {
    if (!webServer) {
      return null;
    }
    return webServer.getSecureUrl();
  });

  ipcMain.handle('live:getLiveSessions', async () => {
    if (!webServer) {
      return [];
    }
    return webServer.getLiveSessions();
  });

  ipcMain.handle('live:broadcastActiveSession', async (_, sessionId: string) => {
    if (webServer) {
      webServer.broadcastActiveSessionChange(sessionId);
    }
  });

  // Start web server (creates if needed, starts if not running)
  ipcMain.handle('live:startServer', async () => {
    try {
      // Create web server if it doesn't exist
      if (!webServer) {
        logger.info('Creating web server', 'WebServer');
        webServer = createWebServer();
      }

      // Start if not already running
      if (!webServer.isActive()) {
        logger.info('Starting web server', 'WebServer');
        const { port, url } = await webServer.start();
        logger.info(`Web server running at ${url} (port ${port})`, 'WebServer');
        return { success: true, url };
      }

      // Already running
      return { success: true, url: webServer.getSecureUrl() };
    } catch (error: any) {
      logger.error(`Failed to start web server: ${error.message}`, 'WebServer');
      return { success: false, error: error.message };
    }
  });

  // Stop web server and clean up
  ipcMain.handle('live:stopServer', async () => {
    if (!webServer) {
      return { success: true };
    }

    try {
      logger.info('Stopping web server', 'WebServer');
      await webServer.stop();
      webServer = null; // Allow garbage collection, will recreate on next start
      logger.info('Web server stopped and cleaned up', 'WebServer');
      return { success: true };
    } catch (error: any) {
      logger.error(`Failed to stop web server: ${error.message}`, 'WebServer');
      return { success: false, error: error.message };
    }
  });

  // Disable all live sessions and stop the server
  ipcMain.handle('live:disableAll', async () => {
    if (!webServer) {
      return { success: true, count: 0 };
    }

    // First mark all sessions as offline
    const liveSessions = webServer.getLiveSessions();
    const count = liveSessions.length;
    for (const session of liveSessions) {
      webServer.setSessionOffline(session.sessionId);
    }

    // Then stop the server
    try {
      logger.info(`Disabled ${count} live sessions, stopping server`, 'Live');
      await webServer.stop();
      webServer = null;
      return { success: true, count };
    } catch (error: any) {
      logger.error(`Failed to stop web server during disableAll: ${error.message}`, 'WebServer');
      return { success: false, count, error: error.message };
    }
  });

  // Web server management
  ipcMain.handle('webserver:getUrl', async () => {
    return webServer?.getSecureUrl();
  });

  ipcMain.handle('webserver:getConnectedClients', async () => {
    return webServer?.getWebClientCount() || 0;
  });

  // Helper to strip non-serializable functions from agent configs
  const stripAgentFunctions = (agent: any) => {
    if (!agent) return null;

    return {
      ...agent,
      configOptions: agent.configOptions?.map((opt: any) => {
        const { argBuilder, ...serializableOpt } = opt;
        return serializableOpt;
      })
    };
  };

  // Agent management
  ipcMain.handle('agents:detect', async () => {
    if (!agentDetector) throw new Error('Agent detector not initialized');
    logger.info('Detecting available agents', 'AgentDetector');
    const agents = await agentDetector.detectAgents();
    logger.info(`Detected ${agents.length} agents`, 'AgentDetector', {
      agents: agents.map(a => a.id)
    });
    // Strip argBuilder functions before sending over IPC
    return agents.map(stripAgentFunctions);
  });

  // Refresh agent detection with debug info (clears cache and returns detailed error info)
  ipcMain.handle('agents:refresh', async (_event, agentId?: string) => {
    if (!agentDetector) throw new Error('Agent detector not initialized');

    // Clear the cache to force re-detection
    agentDetector.clearCache();

    // Get environment info for debugging
    const envPath = process.env.PATH || '';
    const homeDir = process.env.HOME || '';

    // Detect all agents fresh
    const agents = await agentDetector.detectAgents();

    // If a specific agent was requested, return detailed debug info
    if (agentId) {
      const agent = agents.find(a => a.id === agentId);
      const command = process.platform === 'win32' ? 'where' : 'which';

      // Try to find the binary manually to get error info
      let debugInfo = {
        agentId,
        available: agent?.available || false,
        path: agent?.path || null,
        binaryName: agent?.binaryName || agentId,
        envPath,
        homeDir,
        platform: process.platform,
        whichCommand: command,
        error: null as string | null,
      };

      if (!agent?.available) {
        // Try running which/where to get error output
        const result = await execFileNoThrow(command, [agent?.binaryName || agentId]);
        debugInfo.error = result.exitCode !== 0
          ? `${command} ${agent?.binaryName || agentId} failed (exit code ${result.exitCode}): ${result.stderr || 'Binary not found in PATH'}`
          : null;
      }

      logger.info(`Agent refresh debug info for ${agentId}`, 'AgentDetector', debugInfo);
      return { agents: agents.map(stripAgentFunctions), debugInfo };
    }

    logger.info(`Refreshed agent detection`, 'AgentDetector', {
      agents: agents.map(a => ({ id: a.id, available: a.available, path: a.path }))
    });
    return { agents: agents.map(stripAgentFunctions), debugInfo: null };
  });

  ipcMain.handle('agents:get', async (_event, agentId: string) => {
    if (!agentDetector) throw new Error('Agent detector not initialized');
    logger.debug(`Getting agent: ${agentId}`, 'AgentDetector');
    const agent = await agentDetector.getAgent(agentId);
    // Strip argBuilder functions before sending over IPC
    return stripAgentFunctions(agent);
  });

  // Agent configuration management
  ipcMain.handle('agents:getConfig', async (_event, agentId: string) => {
    const allConfigs = agentConfigsStore.get('configs', {});
    return allConfigs[agentId] || {};
  });

  ipcMain.handle('agents:setConfig', async (_event, agentId: string, config: Record<string, any>) => {
    const allConfigs = agentConfigsStore.get('configs', {});
    allConfigs[agentId] = config;
    agentConfigsStore.set('configs', allConfigs);
    logger.info(`Updated config for agent: ${agentId}`, 'AgentConfig', config);
    return true;
  });

  ipcMain.handle('agents:getConfigValue', async (_event, agentId: string, key: string) => {
    const allConfigs = agentConfigsStore.get('configs', {});
    const agentConfig = allConfigs[agentId] || {};
    return agentConfig[key];
  });

  ipcMain.handle('agents:setConfigValue', async (_event, agentId: string, key: string, value: any) => {
    const allConfigs = agentConfigsStore.get('configs', {});
    if (!allConfigs[agentId]) {
      allConfigs[agentId] = {};
    }
    allConfigs[agentId][key] = value;
    agentConfigsStore.set('configs', allConfigs);
    logger.debug(`Updated config ${key} for agent ${agentId}`, 'AgentConfig', { value });
    return true;
  });

  // Folder selection dialog
  ipcMain.handle('dialog:selectFolder', async () => {
    if (!mainWindow) return null;

    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Working Directory',
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  // Font detection
  ipcMain.handle('fonts:detect', async () => {
    try {
      // Use fc-list on all platforms (faster than system_profiler on macOS)
      // macOS: 0.74s (was 8.77s with system_profiler) - 11.9x faster
      // Linux/Windows: 0.5-0.6s
      const result = await execFileNoThrow('fc-list', [':', 'family']);

      if (result.exitCode === 0 && result.stdout) {
        // Parse font list and deduplicate
        const fonts = result.stdout
          .split('\n')
          .filter(Boolean)
          .map((line: string) => line.trim())
          .filter(font => font.length > 0);

        // Deduplicate fonts (fc-list can return duplicates)
        return [...new Set(fonts)];
      }

      // Fallback if fc-list not available (rare on modern systems)
      return ['Monaco', 'Menlo', 'Courier New', 'Consolas', 'Roboto Mono', 'Fira Code', 'JetBrains Mono'];
    } catch (error) {
      console.error('Font detection error:', error);
      // Return common monospace fonts as fallback
      return ['Monaco', 'Menlo', 'Courier New', 'Consolas', 'Roboto Mono', 'Fira Code', 'JetBrains Mono'];
    }
  });

  // Shell detection
  ipcMain.handle('shells:detect', async () => {
    try {
      logger.info('Detecting available shells', 'ShellDetector');
      const shells = await detectShells();
      logger.info(`Detected ${shells.filter(s => s.available).length} available shells`, 'ShellDetector', {
        shells: shells.filter(s => s.available).map(s => s.id)
      });
      return shells;
    } catch (error) {
      logger.error('Shell detection error', 'ShellDetector', error);
      // Return default shell list with all marked as unavailable
      return [
        { id: 'zsh', name: 'Zsh', available: false },
        { id: 'bash', name: 'Bash', available: false },
        { id: 'sh', name: 'Bourne Shell (sh)', available: false },
        { id: 'fish', name: 'Fish', available: false },
        { id: 'tcsh', name: 'Tcsh', available: false },
      ];
    }
  });

  // Shell operations
  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    await shell.openExternal(url);
  });

  // DevTools operations
  ipcMain.handle('devtools:open', async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.openDevTools();
    }
  });

  ipcMain.handle('devtools:close', async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.closeDevTools();
    }
  });

  ipcMain.handle('devtools:toggle', async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      } else {
        mainWindow.webContents.openDevTools();
      }
    }
  });

  // Logger operations
  ipcMain.handle('logger:log', async (_event, level: string, message: string, context?: string, data?: unknown) => {
    const logLevel = level as 'debug' | 'info' | 'warn' | 'error' | 'toast';
    switch (logLevel) {
      case 'debug':
        logger.debug(message, context, data);
        break;
      case 'info':
        logger.info(message, context, data);
        break;
      case 'warn':
        logger.warn(message, context, data);
        break;
      case 'error':
        logger.error(message, context, data);
        break;
      case 'toast':
        logger.toast(message, context, data);
        break;
    }
  });

  ipcMain.handle('logger:getLogs', async (_event, filter?: { level?: string; context?: string; limit?: number }) => {
    const typedFilter = filter ? {
      level: filter.level as 'debug' | 'info' | 'warn' | 'error' | 'toast' | undefined,
      context: filter.context,
      limit: filter.limit,
    } : undefined;
    return logger.getLogs(typedFilter);
  });

  ipcMain.handle('logger:clearLogs', async () => {
    logger.clearLogs();
  });

  ipcMain.handle('logger:setLogLevel', async (_event, level: string) => {
    const logLevel = level as 'debug' | 'info' | 'warn' | 'error';
    logger.setLogLevel(logLevel);
    store.set('logLevel', logLevel);
  });

  ipcMain.handle('logger:getLogLevel', async () => {
    return logger.getLogLevel();
  });

  ipcMain.handle('logger:setMaxLogBuffer', async (_event, max: number) => {
    logger.setMaxLogBuffer(max);
    store.set('maxLogBuffer', max);
  });

  ipcMain.handle('logger:getMaxLogBuffer', async () => {
    return logger.getMaxLogBuffer();
  });

  // Claude Code sessions API
  // Sessions are stored in ~/.claude/projects/<encoded-project-path>/<session-id>.jsonl
  ipcMain.handle('claude:listSessions', async (_event, projectPath: string) => {
    try {
      const os = await import('os');
      const homeDir = os.default.homedir();
      const claudeProjectsDir = path.join(homeDir, '.claude', 'projects');

      // Encode the project path the same way Claude Code does
      const encodedPath = projectPath.replace(/\//g, '-');
      const projectDir = path.join(claudeProjectsDir, encodedPath);

      logger.info(`Claude sessions lookup - projectPath: ${projectPath}, encodedPath: ${encodedPath}, projectDir: ${projectDir}`, 'ClaudeSessions');

      // Check if the directory exists
      try {
        await fs.access(projectDir);
        logger.info(`Claude sessions directory exists: ${projectDir}`, 'ClaudeSessions');
      } catch (err) {
        logger.info(`No Claude sessions directory found for project: ${projectPath} (tried: ${projectDir}), error: ${err}`, 'ClaudeSessions');
        return [];
      }

      // List all .jsonl files in the directory
      const files = await fs.readdir(projectDir);
      const sessionFiles = files.filter(f => f.endsWith('.jsonl'));
      logger.info(`Found ${files.length} files, ${sessionFiles.length} .jsonl sessions`, 'ClaudeSessions');

      // Get metadata for each session (read just the first few lines)
      const sessions = await Promise.all(
        sessionFiles.map(async (filename) => {
          const sessionId = filename.replace('.jsonl', '');
          const filePath = path.join(projectDir, filename);

          try {
            const stats = await fs.stat(filePath);

            // Read first line to get initial message/timestamp
            const content = await fs.readFile(filePath, 'utf-8');
            const lines = content.split('\n').filter(l => l.trim());

            let firstUserMessage = '';
            let timestamp = stats.mtime.toISOString();

            // Fast regex-based extraction to avoid parsing JSON for every line
            // Count user and assistant messages using "type":"user" and "type":"assistant" patterns
            const userMessageCount = (content.match(/"type"\s*:\s*"user"/g) || []).length;
            const assistantMessageCount = (content.match(/"type"\s*:\s*"assistant"/g) || []).length;
            const messageCount = userMessageCount + assistantMessageCount;

            // Extract first user message content - parse only first few lines
            for (let i = 0; i < Math.min(lines.length, 20); i++) {
              try {
                const entry = JSON.parse(lines[i]);
                if (entry.type === 'user' && entry.message?.content) {
                  firstUserMessage = typeof entry.message.content === 'string'
                    ? entry.message.content
                    : JSON.stringify(entry.message.content);
                  timestamp = entry.timestamp || timestamp;
                  break; // Found first user message, stop parsing
                }
              } catch {
                // Skip malformed lines
              }
            }

            // Fast regex-based token extraction for cost calculation
            let totalInputTokens = 0;
            let totalOutputTokens = 0;
            let totalCacheReadTokens = 0;
            let totalCacheCreationTokens = 0;

            // Match "input_tokens":NUMBER pattern
            const inputMatches = content.matchAll(/"input_tokens"\s*:\s*(\d+)/g);
            for (const m of inputMatches) totalInputTokens += parseInt(m[1], 10);

            // Match "output_tokens":NUMBER pattern
            const outputMatches = content.matchAll(/"output_tokens"\s*:\s*(\d+)/g);
            for (const m of outputMatches) totalOutputTokens += parseInt(m[1], 10);

            // Match "cache_read_input_tokens":NUMBER pattern
            const cacheReadMatches = content.matchAll(/"cache_read_input_tokens"\s*:\s*(\d+)/g);
            for (const m of cacheReadMatches) totalCacheReadTokens += parseInt(m[1], 10);

            // Match "cache_creation_input_tokens":NUMBER pattern
            const cacheCreationMatches = content.matchAll(/"cache_creation_input_tokens"\s*:\s*(\d+)/g);
            for (const m of cacheCreationMatches) totalCacheCreationTokens += parseInt(m[1], 10);

            // Calculate cost estimate using Claude Sonnet 4 pricing:
            // Input: $3 per million tokens, Output: $15 per million tokens
            // Cache read: $0.30 per million, Cache creation: $3.75 per million
            const inputCost = (totalInputTokens / 1_000_000) * 3;
            const outputCost = (totalOutputTokens / 1_000_000) * 15;
            const cacheReadCost = (totalCacheReadTokens / 1_000_000) * 0.30;
            const cacheCreationCost = (totalCacheCreationTokens / 1_000_000) * 3.75;
            const costUsd = inputCost + outputCost + cacheReadCost + cacheCreationCost;

            // Extract last timestamp from the session to calculate duration
            let lastTimestamp = timestamp;
            for (let i = lines.length - 1; i >= Math.max(0, lines.length - 10); i--) {
              try {
                const entry = JSON.parse(lines[i]);
                if (entry.timestamp) {
                  lastTimestamp = entry.timestamp;
                  break;
                }
              } catch {
                // Skip malformed lines
              }
            }

            // Calculate duration in seconds
            const startTime = new Date(timestamp).getTime();
            const endTime = new Date(lastTimestamp).getTime();
            const durationSeconds = Math.max(0, Math.floor((endTime - startTime) / 1000));

            return {
              sessionId,
              projectPath,
              timestamp,
              modifiedAt: stats.mtime.toISOString(),
              firstMessage: firstUserMessage.slice(0, 200), // Truncate for display
              messageCount,
              sizeBytes: stats.size,
              costUsd,
              // Token details for context window info
              inputTokens: totalInputTokens,
              outputTokens: totalOutputTokens,
              cacheReadTokens: totalCacheReadTokens,
              cacheCreationTokens: totalCacheCreationTokens,
              durationSeconds,
            };
          } catch (error) {
            logger.error(`Error reading session file: ${filename}`, 'ClaudeSessions', error);
            return null;
          }
        })
      );

      // Filter out nulls and sort by modified date (most recent first)
      const validSessions = sessions
        .filter((s): s is NonNullable<typeof s> => s !== null)
        .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());

      // Get Maestro session origins to identify which sessions were created via Maestro
      const origins = claudeSessionOriginsStore.get('origins', {});
      const projectOrigins = origins[projectPath] || {};

      // Add origin info and session name to each session
      const sessionsWithOrigins = validSessions.map(session => {
        const originData = projectOrigins[session.sessionId];
        // Handle both old string format and new object format
        const origin = typeof originData === 'string' ? originData : originData?.origin;
        const sessionName = typeof originData === 'object' ? originData?.sessionName : undefined;
        return {
          ...session,
          origin: origin as ClaudeSessionOrigin | undefined,
          sessionName,
        };
      });

      logger.info(`Found ${validSessions.length} Claude sessions for project`, 'ClaudeSessions', { projectPath });
      return sessionsWithOrigins;
    } catch (error) {
      logger.error('Error listing Claude sessions', 'ClaudeSessions', error);
      return [];
    }
  });

  // Get global stats across ALL Claude projects (streams updates as it processes)
  ipcMain.handle('claude:getGlobalStats', async () => {
    // Helper to calculate cost from tokens
    const calculateCost = (input: number, output: number, cacheRead: number, cacheCreation: number) => {
      const inputCost = (input / 1_000_000) * 3;
      const outputCost = (output / 1_000_000) * 15;
      const cacheReadCost = (cacheRead / 1_000_000) * 0.30;
      const cacheCreationCost = (cacheCreation / 1_000_000) * 3.75;
      return inputCost + outputCost + cacheReadCost + cacheCreationCost;
    };

    // Helper to send update to renderer
    const sendUpdate = (stats: {
      totalSessions: number;
      totalMessages: number;
      totalInputTokens: number;
      totalOutputTokens: number;
      totalCacheReadTokens: number;
      totalCacheCreationTokens: number;
      totalCostUsd: number;
      totalSizeBytes: number;
      isComplete: boolean;
    }) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('claude:globalStatsUpdate', stats);
      }
    };

    try {
      const os = await import('os');
      const homeDir = os.default.homedir();
      const claudeProjectsDir = path.join(homeDir, '.claude', 'projects');

      // Check if the projects directory exists
      try {
        await fs.access(claudeProjectsDir);
      } catch {
        logger.info('No Claude projects directory found', 'ClaudeSessions');
        const emptyStats = {
          totalSessions: 0,
          totalMessages: 0,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          totalCacheReadTokens: 0,
          totalCacheCreationTokens: 0,
          totalCostUsd: 0,
          totalSizeBytes: 0,
          isComplete: true,
        };
        sendUpdate(emptyStats);
        return emptyStats;
      }

      // List all project directories
      const projectDirs = await fs.readdir(claudeProjectsDir);

      let totalSessions = 0;
      let totalMessages = 0;
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let totalCacheReadTokens = 0;
      let totalCacheCreationTokens = 0;
      let totalSizeBytes = 0;
      let processedProjects = 0;

      // Process each project directory
      for (const projectDir of projectDirs) {
        const projectPath = path.join(claudeProjectsDir, projectDir);

        try {
          const stat = await fs.stat(projectPath);
          if (!stat.isDirectory()) continue;

          // List all .jsonl files in this project
          const files = await fs.readdir(projectPath);
          const sessionFiles = files.filter(f => f.endsWith('.jsonl'));
          totalSessions += sessionFiles.length;

          // Process each session file
          for (const filename of sessionFiles) {
            const filePath = path.join(projectPath, filename);

            try {
              const fileStat = await fs.stat(filePath);
              totalSizeBytes += fileStat.size;

              const content = await fs.readFile(filePath, 'utf-8');

              // Count messages
              const userMessageCount = (content.match(/"type"\s*:\s*"user"/g) || []).length;
              const assistantMessageCount = (content.match(/"type"\s*:\s*"assistant"/g) || []).length;
              totalMessages += userMessageCount + assistantMessageCount;

              // Extract tokens
              const inputMatches = content.matchAll(/"input_tokens"\s*:\s*(\d+)/g);
              for (const m of inputMatches) totalInputTokens += parseInt(m[1], 10);

              const outputMatches = content.matchAll(/"output_tokens"\s*:\s*(\d+)/g);
              for (const m of outputMatches) totalOutputTokens += parseInt(m[1], 10);

              const cacheReadMatches = content.matchAll(/"cache_read_input_tokens"\s*:\s*(\d+)/g);
              for (const m of cacheReadMatches) totalCacheReadTokens += parseInt(m[1], 10);

              const cacheCreationMatches = content.matchAll(/"cache_creation_input_tokens"\s*:\s*(\d+)/g);
              for (const m of cacheCreationMatches) totalCacheCreationTokens += parseInt(m[1], 10);
            } catch (err) {
              // Skip files we can't read
            }
          }
        } catch (err) {
          // Skip directories we can't read
        }

        processedProjects++;

        // Send update after each project (stream progress)
        const currentCost = calculateCost(totalInputTokens, totalOutputTokens, totalCacheReadTokens, totalCacheCreationTokens);
        sendUpdate({
          totalSessions,
          totalMessages,
          totalInputTokens,
          totalOutputTokens,
          totalCacheReadTokens,
          totalCacheCreationTokens,
          totalCostUsd: currentCost,
          totalSizeBytes,
          isComplete: false,
        });
      }

      // Calculate final cost
      const totalCostUsd = calculateCost(totalInputTokens, totalOutputTokens, totalCacheReadTokens, totalCacheCreationTokens);

      logger.info(`Global Claude stats: ${totalSessions} sessions, ${totalMessages} messages, $${totalCostUsd.toFixed(2)}`, 'ClaudeSessions');

      const finalStats = {
        totalSessions,
        totalMessages,
        totalInputTokens,
        totalOutputTokens,
        totalCacheReadTokens,
        totalCacheCreationTokens,
        totalCostUsd,
        totalSizeBytes,
        isComplete: true,
      };

      // Send final update with isComplete flag
      sendUpdate(finalStats);

      return finalStats;
    } catch (error) {
      logger.error('Error getting global Claude stats', 'ClaudeSessions', error);
      const errorStats = {
        totalSessions: 0,
        totalMessages: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCacheReadTokens: 0,
        totalCacheCreationTokens: 0,
        totalCostUsd: 0,
        totalSizeBytes: 0,
        isComplete: true,
      };
      sendUpdate(errorStats);
      return errorStats;
    }
  });

  ipcMain.handle('claude:readSessionMessages', async (_event, projectPath: string, sessionId: string, options?: { offset?: number; limit?: number }) => {
    try {
      const os = await import('os');
      const homeDir = os.default.homedir();
      const claudeProjectsDir = path.join(homeDir, '.claude', 'projects');

      const encodedPath = projectPath.replace(/\//g, '-');
      const sessionFile = path.join(claudeProjectsDir, encodedPath, `${sessionId}.jsonl`);

      const content = await fs.readFile(sessionFile, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());

      // Parse all messages
      const messages: Array<{
        type: string;
        role?: string;
        content: string;
        timestamp: string;
        uuid: string;
        toolUse?: any;
      }> = [];

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (entry.type === 'user' || entry.type === 'assistant') {
            let content = '';
            let toolUse = undefined;

            if (entry.message?.content) {
              if (typeof entry.message.content === 'string') {
                content = entry.message.content;
              } else if (Array.isArray(entry.message.content)) {
                // Handle array content (text blocks, tool use blocks)
                const textBlocks = entry.message.content.filter((b: any) => b.type === 'text');
                const toolBlocks = entry.message.content.filter((b: any) => b.type === 'tool_use');

                content = textBlocks.map((b: any) => b.text).join('\n');
                if (toolBlocks.length > 0) {
                  toolUse = toolBlocks;
                }
              }
            }

            // Only include messages that have actual text content (skip tool-only and empty messages)
            if (content && content.trim()) {
              messages.push({
                type: entry.type,
                role: entry.message?.role,
                content,
                timestamp: entry.timestamp,
                uuid: entry.uuid,
                toolUse,
              });
            }
          }
        } catch {
          // Skip malformed lines
        }
      }

      // Apply offset and limit for lazy loading (read from end)
      const offset = options?.offset ?? 0;
      const limit = options?.limit ?? 20;

      // Return messages from the end (most recent)
      const startIndex = Math.max(0, messages.length - offset - limit);
      const endIndex = messages.length - offset;
      const slice = messages.slice(startIndex, endIndex);

      return {
        messages: slice,
        total: messages.length,
        hasMore: startIndex > 0,
      };
    } catch (error) {
      logger.error('Error reading Claude session messages', 'ClaudeSessions', { sessionId, error });
      return { messages: [], total: 0, hasMore: false };
    }
  });

  // Delete a message pair (user message and its response) from Claude session
  // Can match by UUID or by content (for messages created in current session without UUID)
  ipcMain.handle('claude:deleteMessagePair', async (
    _event,
    projectPath: string,
    sessionId: string,
    userMessageUuid: string,
    fallbackContent?: string // Optional: message content to match if UUID not found
  ) => {
    try {
      const os = await import('os');
      const homeDir = os.default.homedir();
      const claudeProjectsDir = path.join(homeDir, '.claude', 'projects');

      const encodedPath = projectPath.replace(/\//g, '-');
      const sessionFile = path.join(claudeProjectsDir, encodedPath, `${sessionId}.jsonl`);

      const content = await fs.readFile(sessionFile, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());

      // Parse all lines and find the user message
      const parsedLines: Array<{ line: string; entry: any }> = [];
      let userMessageIndex = -1;

      for (let i = 0; i < lines.length; i++) {
        try {
          const entry = JSON.parse(lines[i]);
          parsedLines.push({ line: lines[i], entry });

          // First try to match by UUID
          if (entry.uuid === userMessageUuid && entry.type === 'user') {
            userMessageIndex = parsedLines.length - 1;
          }
        } catch {
          // Keep malformed lines as-is
          parsedLines.push({ line: lines[i], entry: null });
        }
      }

      // If UUID match failed and we have fallback content, try matching by content
      if (userMessageIndex === -1 && fallbackContent) {
        // Normalize content for comparison (trim whitespace)
        const normalizedFallback = fallbackContent.trim();

        // Search from the end (most recent first) for a matching user message
        for (let i = parsedLines.length - 1; i >= 0; i--) {
          const entry = parsedLines[i].entry;
          if (entry?.type === 'user') {
            // Extract text content from message
            let messageText = '';
            if (entry.message?.content) {
              if (typeof entry.message.content === 'string') {
                messageText = entry.message.content;
              } else if (Array.isArray(entry.message.content)) {
                const textBlocks = entry.message.content.filter((b: any) => b.type === 'text');
                messageText = textBlocks.map((b: any) => b.text).join('\n');
              }
            }

            if (messageText.trim() === normalizedFallback) {
              userMessageIndex = i;
              logger.info('Found message by content match', 'ClaudeSessions', { sessionId, index: i });
              break;
            }
          }
        }
      }

      if (userMessageIndex === -1) {
        logger.warn('User message not found for deletion', 'ClaudeSessions', { sessionId, userMessageUuid, hasFallback: !!fallbackContent });
        return { success: false, error: 'User message not found' };
      }

      // Find the end of the response (next user message or end of file)
      // We need to delete from userMessageIndex to the next user message (exclusive)
      let endIndex = parsedLines.length;
      for (let i = userMessageIndex + 1; i < parsedLines.length; i++) {
        if (parsedLines[i].entry?.type === 'user') {
          endIndex = i;
          break;
        }
      }

      // Remove the message pair
      const linesToKeep = [
        ...parsedLines.slice(0, userMessageIndex),
        ...parsedLines.slice(endIndex)
      ];

      // Write back to file
      const newContent = linesToKeep.map(p => p.line).join('\n') + '\n';
      await fs.writeFile(sessionFile, newContent, 'utf-8');

      logger.info(`Deleted message pair from Claude session`, 'ClaudeSessions', {
        sessionId,
        userMessageUuid,
        linesRemoved: endIndex - userMessageIndex
      });

      return { success: true, linesRemoved: endIndex - userMessageIndex };
    } catch (error) {
      logger.error('Error deleting message from Claude session', 'ClaudeSessions', { sessionId, userMessageUuid, error });
      return { success: false, error: String(error) };
    }
  });

  // Search through Claude session content
  ipcMain.handle('claude:searchSessions', async (
    _event,
    projectPath: string,
    query: string,
    searchMode: 'title' | 'user' | 'assistant' | 'all'
  ) => {
    try {
      if (!query.trim()) {
        return [];
      }

      const os = await import('os');
      const homeDir = os.default.homedir();
      const claudeProjectsDir = path.join(homeDir, '.claude', 'projects');

      const encodedPath = projectPath.replace(/\//g, '-');
      const projectDir = path.join(claudeProjectsDir, encodedPath);

      // Check if the directory exists
      try {
        await fs.access(projectDir);
      } catch {
        return [];
      }

      const files = await fs.readdir(projectDir);
      const sessionFiles = files.filter(f => f.endsWith('.jsonl'));

      const searchLower = query.toLowerCase();
      const matchingSessions: Array<{
        sessionId: string;
        matchType: 'title' | 'user' | 'assistant';
        matchPreview: string;
        matchCount: number;
      }> = [];

      for (const filename of sessionFiles) {
        const sessionId = filename.replace('.jsonl', '');
        const filePath = path.join(projectDir, filename);

        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const lines = content.split('\n').filter(l => l.trim());

          let titleMatch = false;
          let userMatches = 0;
          let assistantMatches = 0;
          let matchPreview = '';

          for (const line of lines) {
            try {
              const entry = JSON.parse(line);

              // Extract text content
              let textContent = '';
              if (entry.message?.content) {
                if (typeof entry.message.content === 'string') {
                  textContent = entry.message.content;
                } else if (Array.isArray(entry.message.content)) {
                  textContent = entry.message.content
                    .filter((b: any) => b.type === 'text')
                    .map((b: any) => b.text)
                    .join('\n');
                }
              }

              const textLower = textContent.toLowerCase();

              // Check for title match (first user message)
              if (entry.type === 'user' && !titleMatch && textLower.includes(searchLower)) {
                titleMatch = true;
                if (!matchPreview) {
                  // Find the matching substring with context
                  const idx = textLower.indexOf(searchLower);
                  const start = Math.max(0, idx - 60);
                  const end = Math.min(textContent.length, idx + query.length + 60);
                  matchPreview = (start > 0 ? '...' : '') + textContent.slice(start, end) + (end < textContent.length ? '...' : '');
                }
              }

              // Check for user message matches
              if (entry.type === 'user' && textLower.includes(searchLower)) {
                userMatches++;
                if (!matchPreview && (searchMode === 'user' || searchMode === 'all')) {
                  const idx = textLower.indexOf(searchLower);
                  const start = Math.max(0, idx - 60);
                  const end = Math.min(textContent.length, idx + query.length + 60);
                  matchPreview = (start > 0 ? '...' : '') + textContent.slice(start, end) + (end < textContent.length ? '...' : '');
                }
              }

              // Check for assistant message matches
              if (entry.type === 'assistant' && textLower.includes(searchLower)) {
                assistantMatches++;
                if (!matchPreview && (searchMode === 'assistant' || searchMode === 'all')) {
                  const idx = textLower.indexOf(searchLower);
                  const start = Math.max(0, idx - 60);
                  const end = Math.min(textContent.length, idx + query.length + 60);
                  matchPreview = (start > 0 ? '...' : '') + textContent.slice(start, end) + (end < textContent.length ? '...' : '');
                }
              }
            } catch {
              // Skip malformed lines
            }
          }

          // Determine if this session matches based on search mode
          let matches = false;
          let matchType: 'title' | 'user' | 'assistant' = 'title';
          let matchCount = 0;

          switch (searchMode) {
            case 'title':
              matches = titleMatch;
              matchType = 'title';
              matchCount = titleMatch ? 1 : 0;
              break;
            case 'user':
              matches = userMatches > 0;
              matchType = 'user';
              matchCount = userMatches;
              break;
            case 'assistant':
              matches = assistantMatches > 0;
              matchType = 'assistant';
              matchCount = assistantMatches;
              break;
            case 'all':
              matches = titleMatch || userMatches > 0 || assistantMatches > 0;
              matchType = titleMatch ? 'title' : userMatches > 0 ? 'user' : 'assistant';
              matchCount = userMatches + assistantMatches;
              break;
          }

          if (matches) {
            matchingSessions.push({
              sessionId,
              matchType,
              matchPreview,
              matchCount,
            });
          }
        } catch {
          // Skip files that can't be read
        }
      }

      return matchingSessions;
    } catch (error) {
      logger.error('Error searching Claude sessions', 'ClaudeSessions', error);
      return [];
    }
  });

  // Get available Claude Code slash commands for a project directory
  // Commands come from: user-defined commands, project-level commands, and enabled plugins
  ipcMain.handle('claude:getCommands', async (_event, projectPath: string) => {
    try {
      const os = await import('os');
      const homeDir = os.default.homedir();
      const commands: Array<{ command: string; description: string }> = [];

      // Helper to extract description from markdown file (first line of content or "No description")
      const extractDescription = async (filePath: string): Promise<string> => {
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          // First non-empty line after any YAML frontmatter
          const lines = content.split('\n');
          let inFrontmatter = false;
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed === '---') {
              inFrontmatter = !inFrontmatter;
              continue;
            }
            if (inFrontmatter) continue;
            if (trimmed.length > 0) {
              // Remove markdown formatting and truncate
              return trimmed.replace(/^#+\s*/, '').slice(0, 100);
            }
          }
          return 'No description';
        } catch {
          return 'No description';
        }
      };

      // Helper to scan a commands directory for .md files
      const scanCommandsDir = async (dir: string, prefix: string = '') => {
        try {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isFile() && entry.name.endsWith('.md')) {
              const cmdName = entry.name.replace('.md', '');
              const cmdPath = path.join(dir, entry.name);
              const description = await extractDescription(cmdPath);
              const command = prefix ? `/${prefix}:${cmdName}` : `/${cmdName}`;
              commands.push({ command, description });
            }
          }
        } catch {
          // Directory doesn't exist or isn't readable
        }
      };

      // 1. User-defined commands in ~/.claude/commands/
      const userCommandsDir = path.join(homeDir, '.claude', 'commands');
      await scanCommandsDir(userCommandsDir);

      // 2. Project-level commands in <projectPath>/.claude/commands/
      const projectCommandsDir = path.join(projectPath, '.claude', 'commands');
      await scanCommandsDir(projectCommandsDir);

      // 3. Enabled plugins' commands
      // Read enabled plugins from settings
      const settingsPath = path.join(homeDir, '.claude', 'settings.json');
      try {
        const settingsContent = await fs.readFile(settingsPath, 'utf-8');
        const settings = JSON.parse(settingsContent);
        const enabledPlugins = settings.enabledPlugins || {};

        // Read installed plugins to get their install paths
        const installedPluginsPath = path.join(homeDir, '.claude', 'plugins', 'installed_plugins.json');
        const installedContent = await fs.readFile(installedPluginsPath, 'utf-8');
        const installedPlugins = JSON.parse(installedContent);

        for (const pluginId of Object.keys(enabledPlugins)) {
          if (!enabledPlugins[pluginId]) continue; // Skip disabled plugins

          const pluginInfo = installedPlugins.plugins?.[pluginId];
          if (!pluginInfo?.installPath) continue;

          // Plugin commands are in <installPath>/commands/
          const pluginCommandsDir = path.join(pluginInfo.installPath, 'commands');
          // Extract plugin name (first part before @)
          const pluginName = pluginId.split('@')[0];
          await scanCommandsDir(pluginCommandsDir, pluginName);
        }
      } catch {
        // Settings or installed plugins not readable
      }

      logger.info(`Found ${commands.length} Claude commands for project: ${projectPath}`, 'ClaudeCommands');
      return commands;
    } catch (error) {
      logger.error('Error getting Claude commands', 'ClaudeCommands', error);
      return [];
    }
  });

  // Temp file operations for batch processing
  ipcMain.handle('tempfile:write', async (_event, content: string, filename?: string) => {
    try {
      const os = await import('os');
      const tempDir = os.default.tmpdir();
      const finalFilename = filename || `maestro-scratchpad-${Date.now()}.md`;
      const tempPath = path.join(tempDir, finalFilename);

      await fs.writeFile(tempPath, content, 'utf-8');
      logger.info(`Wrote temp file: ${tempPath}`, 'TempFile', { size: content.length });
      return { success: true, path: tempPath };
    } catch (error) {
      logger.error('Error writing temp file', 'TempFile', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('tempfile:read', async (_event, filePath: string) => {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      logger.info(`Read temp file: ${filePath}`, 'TempFile', { size: content.length });
      return { success: true, content };
    } catch (error) {
      logger.error('Error reading temp file', 'TempFile', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('tempfile:delete', async (_event, filePath: string) => {
    try {
      await fs.unlink(filePath);
      logger.info(`Deleted temp file: ${filePath}`, 'TempFile');
      return { success: true };
    } catch (error) {
      logger.error('Error deleting temp file', 'TempFile', error);
      return { success: false, error: String(error) };
    }
  });

  // History persistence (per-project and optionally per-session)
  ipcMain.handle('history:getAll', async (_event, projectPath?: string, sessionId?: string) => {
    const allEntries = historyStore.get('entries', []);
    let filteredEntries = allEntries;

    if (projectPath) {
      // Filter by project path
      filteredEntries = filteredEntries.filter(entry => entry.projectPath === projectPath);
    }

    if (sessionId) {
      // Filter by session ID - only show entries from this session OR entries without a sessionId (legacy)
      filteredEntries = filteredEntries.filter(entry => !entry.sessionId || entry.sessionId === sessionId);
    }

    return filteredEntries;
  });

  ipcMain.handle('history:add', async (_event, entry: HistoryEntry) => {
    const entries = historyStore.get('entries', []);
    entries.unshift(entry); // Add to beginning (most recent first)
    // Keep only last 1000 entries to prevent unbounded growth
    const trimmedEntries = entries.slice(0, 1000);
    historyStore.set('entries', trimmedEntries);
    logger.info(`Added history entry: ${entry.type}`, 'History', { summary: entry.summary });
    return true;
  });

  ipcMain.handle('history:clear', async (_event, projectPath?: string) => {
    if (projectPath) {
      // Clear only entries for this project
      const entries = historyStore.get('entries', []);
      const filtered = entries.filter(entry => entry.projectPath !== projectPath);
      historyStore.set('entries', filtered);
      logger.info(`Cleared history for project: ${projectPath}`, 'History');
    } else {
      // Clear all entries
      historyStore.set('entries', []);
      logger.info('Cleared all history', 'History');
    }
    return true;
  });

  ipcMain.handle('history:delete', async (_event, entryId: string) => {
    const entries = historyStore.get('entries', []);
    const filtered = entries.filter(entry => entry.id !== entryId);
    if (filtered.length === entries.length) {
      logger.warn(`History entry not found: ${entryId}`, 'History');
      return false;
    }
    historyStore.set('entries', filtered);
    logger.info(`Deleted history entry: ${entryId}`, 'History');
    return true;
  });

  // Claude session origins tracking (distinguishes Maestro-created sessions from CLI sessions)
  ipcMain.handle('claude:registerSessionOrigin', async (_event, projectPath: string, claudeSessionId: string, origin: 'user' | 'auto', sessionName?: string) => {
    const origins = claudeSessionOriginsStore.get('origins', {});
    if (!origins[projectPath]) {
      origins[projectPath] = {};
    }
    // Store as object if sessionName provided, otherwise just origin string for backwards compat
    origins[projectPath][claudeSessionId] = sessionName
      ? { origin, sessionName }
      : origin;
    claudeSessionOriginsStore.set('origins', origins);
    logger.debug(`Registered Claude session origin: ${claudeSessionId} = ${origin}${sessionName ? ` (name: ${sessionName})` : ''}`, 'ClaudeSessionOrigins', { projectPath });
    return true;
  });

  // Update session name for an existing Claude session
  ipcMain.handle('claude:updateSessionName', async (_event, projectPath: string, claudeSessionId: string, sessionName: string) => {
    const origins = claudeSessionOriginsStore.get('origins', {});
    if (!origins[projectPath]) {
      origins[projectPath] = {};
    }
    const existing = origins[projectPath][claudeSessionId];
    // Convert string origin to object format, or update existing object
    if (typeof existing === 'string') {
      origins[projectPath][claudeSessionId] = { origin: existing, sessionName };
    } else if (existing) {
      origins[projectPath][claudeSessionId] = { ...existing, sessionName };
    } else {
      // No existing origin, default to 'user' since they're naming it
      origins[projectPath][claudeSessionId] = { origin: 'user', sessionName };
    }
    claudeSessionOriginsStore.set('origins', origins);
    logger.debug(`Updated Claude session name: ${claudeSessionId} = ${sessionName}`, 'ClaudeSessionOrigins', { projectPath });
    return true;
  });

  ipcMain.handle('claude:getSessionOrigins', async (_event, projectPath: string) => {
    const origins = claudeSessionOriginsStore.get('origins', {});
    return origins[projectPath] || {};
  });

  // Notification operations
  ipcMain.handle('notification:show', async (_event, title: string, body: string) => {
    try {
      const { Notification } = await import('electron');
      if (Notification.isSupported()) {
        const notification = new Notification({
          title,
          body,
          silent: true, // Don't play system sound - we have our own audio feedback option
        });
        notification.show();
        logger.debug('Showed OS notification', 'Notification', { title, body });
        return { success: true };
      } else {
        logger.warn('OS notifications not supported on this platform', 'Notification');
        return { success: false, error: 'Notifications not supported' };
      }
    } catch (error) {
      logger.error('Error showing notification', 'Notification', error);
      return { success: false, error: String(error) };
    }
  });

  // Track active TTS processes by ID for stopping
  const activeTtsProcesses = new Map<number, { process: ReturnType<typeof import('child_process').spawn>; command: string }>();
  let ttsProcessIdCounter = 0;

  // Audio feedback using system TTS command - pipes text via stdin
  ipcMain.handle('notification:speak', async (_event, text: string, command?: string) => {
    console.log('[TTS Main] notification:speak called, text length:', text?.length, 'command:', command);

    // Log the incoming request with full details for debugging
    logger.info('TTS speak request received', 'TTS', {
      command: command || '(default: say)',
      textLength: text?.length || 0,
      textPreview: text ? (text.length > 200 ? text.substring(0, 200) + '...' : text) : '(no text)',
    });

    try {
      const { spawn } = await import('child_process');
      const fullCommand = command || 'say'; // Default to macOS 'say' command
      console.log('[TTS Main] Using fullCommand:', fullCommand);

      console.log('[TTS Main] Spawning with shell:', fullCommand);

      // Log the full command being executed
      logger.info('TTS executing command', 'TTS', {
        command: fullCommand,
        textLength: text?.length || 0,
      });

      // Spawn the TTS process with shell mode to support pipes and command chaining
      const child = spawn(fullCommand, [], {
        stdio: ['pipe', 'ignore', 'pipe'], // stdin: pipe, stdout: ignore, stderr: pipe for errors
        shell: true,
      });

      // Generate a unique ID for this TTS process
      const ttsId = ++ttsProcessIdCounter;
      activeTtsProcesses.set(ttsId, { process: child, command: fullCommand });

      // Write the text to stdin and close it
      if (child.stdin) {
        child.stdin.write(text);
        child.stdin.end();
      }

      child.on('error', (err) => {
        console.error('[TTS Main] Spawn error:', err);
        logger.error('TTS spawn error', 'TTS', {
          error: String(err),
          command: fullCommand,
          textPreview: text ? (text.length > 100 ? text.substring(0, 100) + '...' : text) : '(no text)',
        });
        activeTtsProcesses.delete(ttsId);
      });

      // Capture stderr for debugging
      let stderrOutput = '';
      if (child.stderr) {
        child.stderr.on('data', (data) => {
          stderrOutput += data.toString();
        });
      }

      child.on('close', (code) => {
        console.log('[TTS Main] Process exited with code:', code);
        if (code !== 0 && stderrOutput) {
          console.error('[TTS Main] stderr:', stderrOutput);
          logger.error('TTS process error output', 'TTS', {
            exitCode: code,
            stderr: stderrOutput,
            command: fullCommand,
          });
        }
        activeTtsProcesses.delete(ttsId);
      });

      console.log('[TTS Main] Process spawned successfully with ID:', ttsId);
      logger.info('TTS process spawned successfully', 'TTS', {
        ttsId,
        command: fullCommand,
        textLength: text?.length || 0,
      });
      return { success: true, ttsId };
    } catch (error) {
      console.error('[TTS Main] Error starting audio feedback:', error);
      logger.error('TTS error starting audio feedback', 'TTS', {
        error: String(error),
        command: command || '(default: say)',
        textPreview: text ? (text.length > 100 ? text.substring(0, 100) + '...' : text) : '(no text)',
      });
      return { success: false, error: String(error) };
    }
  });

  // Stop a running TTS process
  ipcMain.handle('notification:stopSpeak', async (_event, ttsId: number) => {
    console.log('[TTS Main] notification:stopSpeak called for ID:', ttsId);

    const ttsProcess = activeTtsProcesses.get(ttsId);
    if (!ttsProcess) {
      console.log('[TTS Main] No active TTS process found with ID:', ttsId);
      return { success: false, error: 'No active TTS process with that ID' };
    }

    try {
      // Kill the process and all its children
      ttsProcess.process.kill('SIGTERM');
      activeTtsProcesses.delete(ttsId);

      logger.info('TTS process stopped', 'TTS', {
        ttsId,
        command: ttsProcess.command,
      });

      console.log('[TTS Main] TTS process killed successfully');
      return { success: true };
    } catch (error) {
      console.error('[TTS Main] Error stopping TTS process:', error);
      logger.error('TTS error stopping process', 'TTS', {
        ttsId,
        error: String(error),
      });
      return { success: false, error: String(error) };
    }
  });

  // Attachments API - store images per Maestro session
  // Images are stored in userData/attachments/{sessionId}/{filename}
  ipcMain.handle('attachments:save', async (_event, sessionId: string, base64Data: string, filename: string) => {
    try {
      const userDataPath = app.getPath('userData');
      const attachmentsDir = path.join(userDataPath, 'attachments', sessionId);

      // Ensure the attachments directory exists
      await fs.mkdir(attachmentsDir, { recursive: true });

      // Extract the base64 content (remove data:image/...;base64, prefix if present)
      const base64Match = base64Data.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
      let buffer: Buffer;
      let finalFilename = filename;

      if (base64Match) {
        const extension = base64Match[1];
        buffer = Buffer.from(base64Match[2], 'base64');
        // Update filename with correct extension if not already present
        if (!filename.includes('.')) {
          finalFilename = `${filename}.${extension}`;
        }
      } else {
        // Assume raw base64
        buffer = Buffer.from(base64Data, 'base64');
      }

      const filePath = path.join(attachmentsDir, finalFilename);
      await fs.writeFile(filePath, buffer);

      logger.info(`Saved attachment: ${filePath}`, 'Attachments', { sessionId, filename: finalFilename, size: buffer.length });
      return { success: true, path: filePath, filename: finalFilename };
    } catch (error) {
      logger.error('Error saving attachment', 'Attachments', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('attachments:load', async (_event, sessionId: string, filename: string) => {
    try {
      const userDataPath = app.getPath('userData');
      const filePath = path.join(userDataPath, 'attachments', sessionId, filename);

      const buffer = await fs.readFile(filePath);
      const base64 = buffer.toString('base64');

      // Determine MIME type from extension
      const ext = path.extname(filename).toLowerCase().slice(1);
      const mimeTypes: Record<string, string> = {
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'svg': 'image/svg+xml',
      };
      const mimeType = mimeTypes[ext] || 'image/png';

      logger.debug(`Loaded attachment: ${filePath}`, 'Attachments', { sessionId, filename, size: buffer.length });
      return { success: true, dataUrl: `data:${mimeType};base64,${base64}` };
    } catch (error) {
      logger.error('Error loading attachment', 'Attachments', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('attachments:delete', async (_event, sessionId: string, filename: string) => {
    try {
      const userDataPath = app.getPath('userData');
      const filePath = path.join(userDataPath, 'attachments', sessionId, filename);

      await fs.unlink(filePath);
      logger.info(`Deleted attachment: ${filePath}`, 'Attachments', { sessionId, filename });
      return { success: true };
    } catch (error) {
      logger.error('Error deleting attachment', 'Attachments', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('attachments:list', async (_event, sessionId: string) => {
    try {
      const userDataPath = app.getPath('userData');
      const attachmentsDir = path.join(userDataPath, 'attachments', sessionId);

      try {
        const files = await fs.readdir(attachmentsDir);
        const imageFiles = files.filter(f => /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(f));
        logger.debug(`Listed attachments for session: ${sessionId}`, 'Attachments', { count: imageFiles.length });
        return { success: true, files: imageFiles };
      } catch (err: any) {
        if (err.code === 'ENOENT') {
          // Directory doesn't exist yet - no attachments
          return { success: true, files: [] };
        }
        throw err;
      }
    } catch (error) {
      logger.error('Error listing attachments', 'Attachments', error);
      return { success: false, error: String(error), files: [] };
    }
  });

  ipcMain.handle('attachments:getPath', async (_event, sessionId: string) => {
    const userDataPath = app.getPath('userData');
    const attachmentsDir = path.join(userDataPath, 'attachments', sessionId);
    return { success: true, path: attachmentsDir };
  });
}

// Handle process output streaming (set up after initialization)
function setupProcessListeners() {
  if (processManager) {
    processManager.on('data', (sessionId: string, data: string) => {
      console.log('[IPC] Forwarding process:data to renderer:', { sessionId, dataLength: data.length, hasMainWindow: !!mainWindow });
      mainWindow?.webContents.send('process:data', sessionId, data);

      // Broadcast to web clients - extract base session ID (remove -ai or -terminal suffix)
      // IMPORTANT: Skip PTY terminal output (-terminal suffix) as it contains raw ANSI codes.
      // Web interface terminal commands use runCommand() which emits with plain session IDs.
      if (webServer) {
        // Don't broadcast raw PTY terminal output to web clients
        if (sessionId.endsWith('-terminal')) {
          console.log(`[WebBroadcast] SKIPPING PTY terminal output for web: session=${sessionId}`);
          return;
        }

        const baseSessionId = sessionId.replace(/-ai$|-batch-\d+$|-synopsis-\d+$/, '');
        const isAiOutput = sessionId.endsWith('-ai') || sessionId.includes('-batch-') || sessionId.includes('-synopsis-');
        const msgId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        console.log(`[WebBroadcast] Broadcasting session_output: msgId=${msgId}, session=${baseSessionId}, source=${isAiOutput ? 'ai' : 'terminal'}, dataLen=${data.length}`);
        webServer.broadcastToSessionClients(baseSessionId, {
          type: 'session_output',
          sessionId: baseSessionId,
          data,
          source: isAiOutput ? 'ai' : 'terminal',
          timestamp: Date.now(),
          msgId,
        });
      }
    });

    processManager.on('exit', (sessionId: string, code: number) => {
      mainWindow?.webContents.send('process:exit', sessionId, code);

      // Broadcast exit to web clients
      if (webServer) {
        const baseSessionId = sessionId.replace(/-ai$|-terminal$|-batch-\d+$|-synopsis-\d+$/, '');
        webServer.broadcastToSessionClients(baseSessionId, {
          type: 'session_exit',
          sessionId: baseSessionId,
          exitCode: code,
          timestamp: Date.now(),
        });
      }
    });

    processManager.on('session-id', (sessionId: string, claudeSessionId: string) => {
      mainWindow?.webContents.send('process:session-id', sessionId, claudeSessionId);
    });

    // Handle stderr separately from runCommand (for clean command execution)
    processManager.on('stderr', (sessionId: string, data: string) => {
      mainWindow?.webContents.send('process:stderr', sessionId, data);
    });

    // Handle command exit (from runCommand - separate from PTY exit)
    processManager.on('command-exit', (sessionId: string, code: number) => {
      mainWindow?.webContents.send('process:command-exit', sessionId, code);
    });

    // Handle usage statistics from AI responses
    processManager.on('usage', (sessionId: string, usageStats: {
      inputTokens: number;
      outputTokens: number;
      cacheReadInputTokens: number;
      cacheCreationInputTokens: number;
      totalCostUsd: number;
      contextWindow: number;
    }) => {
      console.log('[IPC] Forwarding process:usage to renderer:', { sessionId, usageStats });
      mainWindow?.webContents.send('process:usage', sessionId, usageStats);
    });
  }
}
