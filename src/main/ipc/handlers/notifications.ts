/**
 * Notification IPC Handlers
 *
 * Handles all notification-related IPC operations:
 * - Showing OS notifications
 * - Text-to-speech (TTS) functionality with queueing
 * - Stopping active TTS processes
 */

import { ipcMain, Notification, BrowserWindow } from 'electron';
import { spawn, type ChildProcess } from 'child_process';
import { logger } from '../../utils/logger';

// ==========================================================================
// Constants
// ==========================================================================

/** Minimum delay between TTS calls to prevent audio overlap */
const TTS_MIN_DELAY_MS = 15000;

// ==========================================================================
// Types
// ==========================================================================

/**
 * Response from showing a notification
 */
export interface NotificationShowResponse {
	success: boolean;
	error?: string;
}

/**
 * Response from TTS operations
 */
export interface TtsResponse {
	success: boolean;
	ttsId?: number;
	error?: string;
}

/**
 * Item in the TTS queue
 */
interface TtsQueueItem {
	text: string;
	command?: string;
	resolve: (result: TtsResponse) => void;
}

/**
 * Active TTS process tracking
 */
interface ActiveTtsProcess {
	process: ChildProcess;
	command: string;
}

// ==========================================================================
// Module State
// ==========================================================================

/** Track active TTS processes by ID for stopping */
const activeTtsProcesses = new Map<number, ActiveTtsProcess>();

/** Counter for generating unique TTS process IDs */
let ttsProcessIdCounter = 0;

/** Timestamp when the last TTS completed */
let lastTtsEndTime = 0;

/** Queue of pending TTS requests */
const ttsQueue: TtsQueueItem[] = [];

/** Flag indicating if TTS is currently being processed */
let isTtsProcessing = false;

// ==========================================================================
// Helper Functions
// ==========================================================================

/**
 * Execute TTS - the actual implementation
 * Returns a Promise that resolves when the TTS process completes (not just when it starts)
 */
async function executeTts(text: string, command?: string): Promise<TtsResponse> {
	console.log('[TTS Main] executeTts called, text length:', text?.length, 'command:', command);

	// Log the incoming request with full details for debugging
	logger.info('TTS speak request received', 'TTS', {
		command: command || '(default: say)',
		textLength: text?.length || 0,
		textPreview: text ? (text.length > 200 ? text.substring(0, 200) + '...' : text) : '(no text)',
	});

	try {
		const fullCommand = command || 'say'; // Default to macOS 'say' command
		console.log('[TTS Main] Using fullCommand:', fullCommand);

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

		// Return a Promise that resolves when the TTS process completes
		return new Promise((resolve) => {
			let resolved = false;
			let stderrOutput = '';

			// Write the text to stdin and close it
			if (child.stdin) {
				// Handle stdin errors (EPIPE if process terminates before write completes)
				child.stdin.on('error', (err) => {
					const errorCode = (err as NodeJS.ErrnoException).code;
					if (errorCode === 'EPIPE') {
						logger.debug('TTS stdin EPIPE - process closed before write completed', 'TTS');
					} else {
						logger.error('TTS stdin error', 'TTS', { error: String(err), code: errorCode });
					}
				});
				console.log('[TTS Main] Writing to stdin:', text);
				child.stdin.write(text, 'utf8', (err) => {
					if (err) {
						console.error('[TTS Main] stdin write error:', err);
					} else {
						console.log('[TTS Main] stdin write completed, ending stream');
					}
					child.stdin!.end();
				});
			} else {
				console.error('[TTS Main] No stdin available on child process');
			}

			child.on('error', (err) => {
				console.error('[TTS Main] Spawn error:', err);
				logger.error('TTS spawn error', 'TTS', {
					error: String(err),
					command: fullCommand,
					textPreview: text
						? text.length > 100
							? text.substring(0, 100) + '...'
							: text
						: '(no text)',
				});
				activeTtsProcesses.delete(ttsId);
				if (!resolved) {
					resolved = true;
					resolve({ success: false, ttsId, error: String(err) });
				}
			});

			// Capture stderr for debugging
			if (child.stderr) {
				child.stderr.on('data', (data) => {
					stderrOutput += data.toString();
				});
			}

			child.on('close', (code, signal) => {
				console.log('[TTS Main] Process exited with code:', code, 'signal:', signal);
				// Always log close event for debugging production issues
				logger.info('TTS process closed', 'TTS', {
					ttsId,
					exitCode: code,
					signal,
					stderr: stderrOutput || '(none)',
					command: fullCommand,
				});
				if (code !== 0 && stderrOutput) {
					console.error('[TTS Main] stderr:', stderrOutput);
					logger.error('TTS process error output', 'TTS', {
						exitCode: code,
						stderr: stderrOutput,
						command: fullCommand,
					});
				}
				activeTtsProcesses.delete(ttsId);
				// Notify renderer that TTS has completed
				BrowserWindow.getAllWindows().forEach((win) => {
					win.webContents.send('tts:completed', ttsId);
				});

				// Resolve the promise now that TTS has completed
				if (!resolved) {
					resolved = true;
					resolve({ success: code === 0, ttsId });
				}
			});

			console.log('[TTS Main] Process spawned successfully with ID:', ttsId);
			logger.info('TTS process spawned successfully', 'TTS', {
				ttsId,
				command: fullCommand,
				textLength: text?.length || 0,
			});
		});
	} catch (error) {
		console.error('[TTS Main] Error starting audio feedback:', error);
		logger.error('TTS error starting audio feedback', 'TTS', {
			error: String(error),
			command: command || '(default: say)',
			textPreview: text ? (text.length > 100 ? text.substring(0, 100) + '...' : text) : '(no text)',
		});
		return { success: false, error: String(error) };
	}
}

/**
 * Process the next item in the TTS queue
 */
async function processNextTts(): Promise<void> {
	if (isTtsProcessing || ttsQueue.length === 0) return;

	isTtsProcessing = true;
	const item = ttsQueue.shift()!;

	// Calculate delay needed to maintain minimum gap
	const now = Date.now();
	const timeSinceLastTts = now - lastTtsEndTime;
	const delayNeeded = Math.max(0, TTS_MIN_DELAY_MS - timeSinceLastTts);

	if (delayNeeded > 0) {
		logger.debug(`TTS queue waiting ${delayNeeded}ms before next speech`, 'TTS');
		await new Promise((resolve) => setTimeout(resolve, delayNeeded));
	}

	// Execute the TTS
	const result = await executeTts(item.text, item.command);
	item.resolve(result);

	// Record when this TTS ended
	lastTtsEndTime = Date.now();
	isTtsProcessing = false;

	// Process next item in queue
	processNextTts();
}

// ==========================================================================
// Handler Registration
// ==========================================================================

/**
 * Register all notification-related IPC handlers
 */
export function registerNotificationsHandlers(): void {
	// Show OS notification
	ipcMain.handle(
		'notification:show',
		async (_event, title: string, body: string): Promise<NotificationShowResponse> => {
			try {
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
		}
	);

	// Audio feedback using system TTS command - queued to prevent overlap
	ipcMain.handle(
		'notification:speak',
		async (_event, text: string, command?: string): Promise<TtsResponse> => {
			// Add to queue and return a promise that resolves when this TTS completes
			return new Promise<TtsResponse>((resolve) => {
				ttsQueue.push({ text, command, resolve });
				logger.debug(`TTS queued, queue length: ${ttsQueue.length}`, 'TTS');
				processNextTts();
			});
		}
	);

	// Stop a running TTS process
	ipcMain.handle('notification:stopSpeak', async (_event, ttsId: number): Promise<TtsResponse> => {
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
}

// ==========================================================================
// Exports for Testing
// ==========================================================================

/**
 * Get the current TTS queue length (for testing)
 */
export function getTtsQueueLength(): number {
	return ttsQueue.length;
}

/**
 * Get the count of active TTS processes (for testing)
 */
export function getActiveTtsCount(): number {
	return activeTtsProcesses.size;
}

/**
 * Clear the TTS queue (for testing)
 */
export function clearTtsQueue(): void {
	ttsQueue.length = 0;
}

/**
 * Reset TTS state (for testing)
 */
export function resetTtsState(): void {
	ttsQueue.length = 0;
	activeTtsProcesses.clear();
	ttsProcessIdCounter = 0;
	lastTtsEndTime = 0;
	isTtsProcessing = false;
}
