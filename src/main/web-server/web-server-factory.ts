/**
 * Web server factory for creating and configuring the web server.
 * Extracted from main/index.ts for better modularity.
 *
 * Multi-window support (GitHub issue #133):
 * - Remote commands from web interface (executeCommand, switchMode, etc.)
 *   are broadcast to ALL windows, not just the main window
 * - Each renderer window filters commands based on its WindowContext.sessionIds
 * - This ensures commands reach the window containing the target session
 */

import { BrowserWindow, ipcMain } from 'electron';
import { WebServer } from './WebServer';
import { getThemeById } from '../themes';
import { getHistoryManager } from '../history-manager';
import { logger } from '../utils/logger';
import { windowRegistry } from '../window-registry';
import type { ProcessManager } from '../process-manager';
import type { StoredSession } from '../stores/types';
import type { Group } from '../../shared/types';

/** Store interface for settings */
interface SettingsStore {
	get<T>(key: string, defaultValue?: T): T;
}

/** Store interface for sessions */
interface SessionsStore {
	get<T>(key: string, defaultValue?: T): T;
}

/** Store interface for groups */
interface GroupsStore {
	get<T>(key: string, defaultValue?: T): T;
}

/** Dependencies required for creating the web server */
export interface WebServerFactoryDependencies {
	/** Settings store for reading web interface configuration */
	settingsStore: SettingsStore;
	/** Sessions store for reading session data */
	sessionsStore: SessionsStore;
	/** Groups store for reading group data */
	groupsStore: GroupsStore;
	/** Function to get the main window reference */
	getMainWindow: () => BrowserWindow | null;
	/** Function to get the process manager reference */
	getProcessManager: () => ProcessManager | null;
}

/**
 * Broadcasts an IPC message to all renderer windows.
 * Used for remote commands from web interface to reach the window containing the target session.
 * Falls back to mainWindow if WindowRegistry is empty (edge case during startup).
 *
 * @param channel - IPC channel name
 * @param getMainWindow - Fallback function to get main window
 * @param args - Arguments to send with the IPC message
 * @returns True if message was sent to at least one window
 */
function broadcastToAllWindows(
	channel: string,
	getMainWindow: () => BrowserWindow | null,
	...args: unknown[]
): boolean {
	const allWindows = windowRegistry.getAll();

	if (allWindows.length > 0) {
		let sentCount = 0;
		for (const [_windowId, entry] of allWindows) {
			const browserWindow = entry.browserWindow;
			if (
				browserWindow &&
				!browserWindow.isDestroyed() &&
				browserWindow.webContents &&
				!browserWindow.webContents.isDestroyed()
			) {
				browserWindow.webContents.send(channel, ...args);
				sentCount++;
			}
		}

		if (sentCount > 1) {
			logger.debug(`[Web→Desktop] Broadcast ${channel} to ${sentCount} windows`, 'WebServer');
		}

		return sentCount > 0;
	}

	// Fallback: single-window mode (pre-multi-window compatibility)
	const mainWindow = getMainWindow();
	if (
		mainWindow &&
		!mainWindow.isDestroyed() &&
		mainWindow.webContents &&
		!mainWindow.webContents.isDestroyed()
	) {
		mainWindow.webContents.send(channel, ...args);
		return true;
	}

	return false;
}

/**
 * Creates a factory function for creating web servers with the given dependencies.
 * This allows dependency injection and makes the code more testable.
 */
export function createWebServerFactory(deps: WebServerFactoryDependencies) {
	const { settingsStore, sessionsStore, groupsStore, getMainWindow, getProcessManager } = deps;

	/**
	 * Create and configure the web server with all necessary callbacks.
	 * Called when user enables the web interface.
	 */
	return function createWebServer(): WebServer {
		// Use custom port if enabled, otherwise 0 for random port assignment
		const useCustomPort = settingsStore.get('webInterfaceUseCustomPort', false);
		const customPort = settingsStore.get('webInterfaceCustomPort', 8080);
		const port = useCustomPort ? customPort : 0;
		const server = new WebServer(port); // Custom or random port with auto-generated security token

		// Set up callback for web server to fetch sessions list
		server.setGetSessionsCallback(() => {
			const sessions = sessionsStore.get<StoredSession[]>('sessions', []);
			const groups = groupsStore.get<Group[]>('groups', []);
			return sessions.map((s) => {
				// Find the group for this session
				const group = s.groupId ? groups.find((g) => g.id === s.groupId) : null;

				// Extract last AI response for mobile preview (first 3 lines, max 500 chars)
				// Use active tab's logs as the source of truth
				let lastResponse = null;
				const activeTab = s.aiTabs?.find((t: any) => t.id === s.activeTabId) || s.aiTabs?.[0];
				const tabLogs = activeTab?.logs || [];
				if (tabLogs.length > 0) {
					// Find the last stdout/stderr entry from the AI (not user messages)
					// Note: 'thinking' logs are already excluded since they have a distinct source type
					const lastAiLog = [...tabLogs]
						.reverse()
						.find((log: any) => log.source === 'stdout' || log.source === 'stderr');
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
				const aiTabs =
					s.aiTabs?.map((tab: any) => ({
						id: tab.id,
						agentSessionId: tab.agentSessionId || null,
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
					agentSessionId: s.agentSessionId || null,
					thinkingStartTime: s.thinkingStartTime || null,
					aiTabs,
					activeTabId: s.activeTabId || (aiTabs.length > 0 ? aiTabs[0].id : undefined),
					bookmarked: s.bookmarked || false,
					// Worktree subagent support
					parentSessionId: s.parentSessionId || null,
					worktreeBranch: s.worktreeBranch || null,
				};
			});
		});

		// Set up callback for web server to fetch single session details
		// Optional tabId param allows fetching logs for a specific tab (avoids race conditions)
		server.setGetSessionDetailCallback((sessionId: string, tabId?: string) => {
			const sessions = sessionsStore.get<StoredSession[]>('sessions', []);
			const session = sessions.find((s) => s.id === sessionId);
			if (!session) return null;

			// Get the requested tab's logs (or active tab if no tabId provided)
			// Tabs are the source of truth for AI conversation history
			// Filter out thinking and tool logs - these should never be shown on the web interface
			let aiLogs: any[] = [];
			const targetTabId = tabId || session.activeTabId;
			if (session.aiTabs && session.aiTabs.length > 0) {
				const targetTab =
					session.aiTabs.find((t: any) => t.id === targetTabId) || session.aiTabs[0];
				const rawLogs = targetTab?.logs || [];
				// Web interface should never show thinking/tool logs regardless of desktop settings
				aiLogs = rawLogs.filter((log: any) => log.source !== 'thinking' && log.source !== 'tool');
			}

			return {
				id: session.id,
				name: session.name,
				toolType: session.toolType,
				state: session.state,
				inputMode: session.inputMode,
				cwd: session.cwd,
				aiLogs,
				shellLogs: session.shellLogs || [],
				usageStats: session.usageStats,
				agentSessionId: session.agentSessionId,
				isGitRepo: session.isGitRepo,
				activeTabId: targetTabId,
			};
		});

		// Set up callback for web server to fetch current theme
		server.setGetThemeCallback(() => {
			const themeId = settingsStore.get('activeThemeId', 'dracula');
			return getThemeById(themeId);
		});

		// Set up callback for web server to fetch custom AI commands
		server.setGetCustomCommandsCallback(() => {
			const customCommands = settingsStore.get('customAICommands', []) as Array<{
				id: string;
				command: string;
				description: string;
				prompt: string;
			}>;
			return customCommands;
		});

		// Set up callback for web server to fetch history entries
		// Uses HistoryManager for per-session storage
		server.setGetHistoryCallback((projectPath?: string, sessionId?: string) => {
			const historyManager = getHistoryManager();

			if (sessionId) {
				// Get entries for specific session
				const entries = historyManager.getEntries(sessionId);
				// Sort by timestamp descending
				entries.sort((a, b) => b.timestamp - a.timestamp);
				return entries;
			}

			if (projectPath) {
				// Get all entries for sessions in this project
				return historyManager.getEntriesByProjectPath(projectPath);
			}

			// Return all entries (for global view)
			return historyManager.getAllEntries();
		});

		// Set up callback for web server to write commands to sessions
		// Note: Process IDs have -ai or -terminal suffix based on session's inputMode
		server.setWriteToSessionCallback((sessionId: string, data: string) => {
			const processManager = getProcessManager();
			if (!processManager) {
				logger.warn('processManager is null for writeToSession', 'WebServer');
				return false;
			}

			// Get the session's current inputMode to determine which process to write to
			const sessions = sessionsStore.get<StoredSession[]>('sessions', []);
			const session = sessions.find((s) => s.id === sessionId);
			if (!session) {
				logger.warn(`Session ${sessionId} not found for writeToSession`, 'WebServer');
				return false;
			}

			// Append -ai or -terminal suffix based on inputMode
			const targetSessionId =
				session.inputMode === 'ai' ? `${sessionId}-ai` : `${sessionId}-terminal`;
			logger.debug(`Writing to ${targetSessionId} (inputMode=${session.inputMode})`, 'WebServer');

			const result = processManager.write(targetSessionId, data);
			logger.debug(`Write result: ${result}`, 'WebServer');
			return result;
		});

		// Set up callback for web server to execute commands through the desktop
		// This forwards AI commands to the renderer, ensuring single source of truth
		// The renderer handles all spawn logic, state management, and broadcasts
		// Multi-window: Broadcasts to ALL windows; renderer filters by WindowContext.sessionIds
		server.setExecuteCommandCallback(
			async (sessionId: string, command: string, inputMode?: 'ai' | 'terminal') => {
				// Look up the session to get Claude session ID for logging
				const sessions = sessionsStore.get<StoredSession[]>('sessions', []);
				const session = sessions.find((s) => s.id === sessionId);
				const agentSessionId = session?.agentSessionId || 'none';

				// Broadcast to all windows - the window containing this session will handle it
				// Other windows will ignore the command (filtered by WindowContext.sessionIds)
				logger.info(
					`[Web → Renderer] Broadcasting command | Maestro: ${sessionId} | Claude: ${agentSessionId} | Mode: ${inputMode || 'auto'} | Command: ${command.substring(0, 100)}`,
					'WebServer'
				);
				const sent = broadcastToAllWindows(
					'remote:executeCommand',
					getMainWindow,
					sessionId,
					command,
					inputMode
				);
				if (!sent) {
					logger.warn('No windows available for executeCommand', 'WebServer');
				}
				return sent;
			}
		);

		// Set up callback for web server to interrupt sessions through the desktop
		// This forwards to the renderer which handles state updates and broadcasts
		// Multi-window: Broadcasts to ALL windows; renderer filters by WindowContext.sessionIds
		server.setInterruptSessionCallback(async (sessionId: string) => {
			// Broadcast to all windows - the window containing this session will handle it
			logger.debug(`Broadcasting interrupt for session ${sessionId}`, 'WebServer');
			const sent = broadcastToAllWindows('remote:interrupt', getMainWindow, sessionId);
			if (!sent) {
				logger.warn('No windows available for interrupt', 'WebServer');
			}
			return sent;
		});

		// Set up callback for web server to switch session mode through the desktop
		// This forwards to the renderer which handles state updates and broadcasts
		// Multi-window: Broadcasts to ALL windows; renderer filters by WindowContext.sessionIds
		server.setSwitchModeCallback(async (sessionId: string, mode: 'ai' | 'terminal') => {
			logger.info(
				`[Web→Desktop] Mode switch callback invoked: session=${sessionId}, mode=${mode}`,
				'WebServer'
			);
			// Broadcast to all windows - the window containing this session will handle it
			logger.info(`[Web→Desktop] Broadcasting remote:switchMode`, 'WebServer');
			const sent = broadcastToAllWindows('remote:switchMode', getMainWindow, sessionId, mode);
			if (!sent) {
				logger.warn('No windows available for switchMode', 'WebServer');
			}
			return sent;
		});

		// Set up callback for web server to select/switch to a session in the desktop
		// This forwards to the renderer which handles state updates and broadcasts
		// If tabId is provided, also switches to that tab within the session
		// Multi-window: Broadcasts to ALL windows; renderer filters by WindowContext.sessionIds
		server.setSelectSessionCallback(async (sessionId: string, tabId?: string) => {
			logger.info(
				`[Web→Desktop] Session select callback invoked: session=${sessionId}, tab=${tabId || 'none'}`,
				'WebServer'
			);
			// Broadcast to all windows - the window containing this session will handle it
			logger.info(`[Web→Desktop] Broadcasting remote:selectSession`, 'WebServer');
			const sent = broadcastToAllWindows('remote:selectSession', getMainWindow, sessionId, tabId);
			if (!sent) {
				logger.warn('No windows available for selectSession', 'WebServer');
			}
			return sent;
		});

		// Tab operation callbacks
		// Multi-window: Broadcasts to ALL windows; renderer filters by WindowContext.sessionIds
		server.setSelectTabCallback(async (sessionId: string, tabId: string) => {
			logger.info(
				`[Web→Desktop] Tab select callback invoked: session=${sessionId}, tab=${tabId}`,
				'WebServer'
			);
			const sent = broadcastToAllWindows('remote:selectTab', getMainWindow, sessionId, tabId);
			if (!sent) {
				logger.warn('No windows available for selectTab', 'WebServer');
			}
			return sent;
		});

		// newTab requires a synchronous response, so we need to target the specific window
		// that contains the session. Broadcast wouldn't work as we'd get multiple responses.
		server.setNewTabCallback(async (sessionId: string) => {
			logger.info(`[Web→Desktop] New tab callback invoked: session=${sessionId}`, 'WebServer');

			// Find the window containing this session
			const targetWindowId = windowRegistry.getWindowForSession(sessionId);
			let targetWindow: BrowserWindow | null = null;

			if (targetWindowId) {
				const entry = windowRegistry.get(targetWindowId);
				if (entry && !entry.browserWindow.isDestroyed()) {
					targetWindow = entry.browserWindow;
				}
			}

			// Fall back to main window if session's window not found
			if (!targetWindow) {
				targetWindow = getMainWindow();
			}

			if (!targetWindow) {
				logger.warn('No window available for newTab', 'WebServer');
				return null;
			}

			// Use invoke for synchronous response with tab ID
			return new Promise((resolve) => {
				const responseChannel = `remote:newTab:response:${Date.now()}`;
				let resolved = false;

				const handleResponse = (_event: Electron.IpcMainEvent, result: any) => {
					if (resolved) return;
					resolved = true;
					clearTimeout(timeoutId);
					resolve(result);
				};

				ipcMain.once(responseChannel, handleResponse);
				targetWindow!.webContents.send('remote:newTab', sessionId, responseChannel);

				// Timeout after 5 seconds - clean up the listener to prevent memory leak
				const timeoutId = setTimeout(() => {
					if (resolved) return;
					resolved = true;
					ipcMain.removeListener(responseChannel, handleResponse);
					logger.warn(`newTab callback timed out for session ${sessionId}`, 'WebServer');
					resolve(null);
				}, 5000);
			});
		});

		server.setCloseTabCallback(async (sessionId: string, tabId: string) => {
			logger.info(
				`[Web→Desktop] Close tab callback invoked: session=${sessionId}, tab=${tabId}`,
				'WebServer'
			);
			const sent = broadcastToAllWindows('remote:closeTab', getMainWindow, sessionId, tabId);
			if (!sent) {
				logger.warn('No windows available for closeTab', 'WebServer');
			}
			return sent;
		});

		server.setRenameTabCallback(async (sessionId: string, tabId: string, newName: string) => {
			logger.info(
				`[Web→Desktop] Rename tab callback invoked: session=${sessionId}, tab=${tabId}, newName=${newName}`,
				'WebServer'
			);
			const sent = broadcastToAllWindows(
				'remote:renameTab',
				getMainWindow,
				sessionId,
				tabId,
				newName
			);
			if (!sent) {
				logger.warn('No windows available for renameTab', 'WebServer');
			}
			return sent;
		});

		return server;
	};
}
