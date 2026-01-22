/**
 * Notification IPC Handlers
 *
 * Handles all notification-related IPC operations:
 * - Showing OS notifications
 * - Text-to-speech (TTS) functionality with queueing
 * - Stopping active TTS processes
 *
 * Security Note: TTS commands are validated against a whitelist to prevent
 * command injection attacks from the renderer process.
 */

import { ipcMain, Notification, BrowserWindow } from 'electron';
import { spawn, type ChildProcess } from 'child_process';
import { logger } from '../../utils/logger';

// ==========================================================================
// Constants
// ==========================================================================

/**
 * Minimum delay between TTS calls to prevent audio overlap.
 *
 * 15 seconds was chosen to:
 * 1. Allow sufficient time for most TTS messages to complete naturally
 * 2. Prevent rapid-fire notifications from overwhelming the user
 * 3. Give users time to process each audio message before the next one
 *
 * This value balances responsiveness with preventing audio chaos when
 * multiple notifications trigger in quick succession.
 */
const TTS_MIN_DELAY_MS = 15000;

/**
 * Maximum number of items allowed in the TTS queue.
 * Prevents memory issues if TTS requests accumulate faster than they can be processed.
 */
const TTS_MAX_QUEUE_SIZE = 10;

/**
 * Whitelist of allowed TTS commands to prevent command injection.
 *
 * These are common TTS commands across different platforms:
 * - say: macOS built-in TTS
 * - espeak: Linux TTS (common on Ubuntu/Debian)
 * - espeak-ng: Modern fork of espeak
 * - spd-say: Speech Dispatcher client (Linux)
 * - festival: Festival TTS system (Linux)
 * - flite: Lightweight TTS (Linux)
 *
 * SECURITY: Only the base command name is checked. Arguments are NOT allowed
 * to be passed through the command parameter to prevent injection attacks.
 */
const ALLOWED_TTS_COMMANDS = ['say', 'espeak', 'espeak-ng', 'spd-say', 'festival', 'flite'];

/**
 * Default TTS command (macOS)
 */
const DEFAULT_TTS_COMMAND = 'say';

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
 * Validate and sanitize TTS command to prevent command injection.
 *
 * SECURITY: This function is critical for preventing arbitrary command execution.
 * It ensures only whitelisted commands can be executed, with no arguments allowed
 * through the command parameter.
 *
 * @param command - The requested TTS command
 * @returns Object with validated command or error
 */
export function validateTtsCommand(command?: string): {
	valid: boolean;
	command: string;
	error?: string;
} {
	// Use default if no command provided
	if (!command || command.trim() === '') {
		return { valid: true, command: DEFAULT_TTS_COMMAND };
	}

	// Extract the base command (first word only, no arguments allowed)
	const trimmedCommand = command.trim();
	const baseCommand = trimmedCommand.split(/\s+/)[0];

	// Check if the base command is in the whitelist
	if (!ALLOWED_TTS_COMMANDS.includes(baseCommand)) {
		logger.warn('TTS command rejected - not in whitelist', 'TTS', {
			requestedCommand: baseCommand,
			allowedCommands: ALLOWED_TTS_COMMANDS,
		});
		return {
			valid: false,
			command: DEFAULT_TTS_COMMAND,
			error: `Invalid TTS command '${baseCommand}'. Allowed commands: ${ALLOWED_TTS_COMMANDS.join(', ')}`,
		};
	}

	// If the command has arguments, reject it for security
	if (trimmedCommand !== baseCommand) {
		logger.warn('TTS command rejected - arguments not allowed', 'TTS', {
			requestedCommand: trimmedCommand,
			baseCommand,
		});
		return {
			valid: false,
			command: DEFAULT_TTS_COMMAND,
			error: `TTS command arguments are not allowed for security reasons. Use only the command name: ${baseCommand}`,
		};
	}

	return { valid: true, command: baseCommand };
}

/**
 * Execute TTS - the actual implementation
 * Returns a Promise that resolves when the TTS process completes (not just when it starts)
 */
async function executeTts(text: string, command?: string): Promise<TtsResponse> {
	// Validate and sanitize the command
	const validation = validateTtsCommand(command);
	if (!validation.valid) {
		return { success: false, error: validation.error };
	}

	const fullCommand = validation.command;
	const textLength = text?.length || 0;
	const textPreview = text
		? text.length > 200
			? text.substring(0, 200) + '...'
			: text
		: '(no text)';

	// Log the incoming request with full details for debugging
	logger.info('TTS speak request received', 'TTS', {
		command: fullCommand,
		textLength,
		textPreview,
	});

	try {
		// Log the full command being executed
		logger.debug('TTS executing command', 'TTS', {
			command: fullCommand,
			textLength,
		});

		// Spawn the TTS process WITHOUT shell mode to prevent injection
		// The text is passed via stdin, not as command arguments
		const child = spawn(fullCommand, [], {
			stdio: ['pipe', 'ignore', 'pipe'], // stdin: pipe, stdout: ignore, stderr: pipe for errors
			shell: false, // SECURITY: shell: false prevents command injection
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
				child.stdin.on('error', (err: unknown) => {
					// Type-safe error code extraction
					const errorCode =
						err && typeof err === 'object' && 'code' in err
							? (err as NodeJS.ErrnoException).code
							: undefined;

					if (errorCode === 'EPIPE') {
						logger.debug('TTS stdin EPIPE - process closed before write completed', 'TTS');
					} else {
						logger.error('TTS stdin error', 'TTS', { error: String(err), code: errorCode });
					}
				});

				logger.debug('TTS writing to stdin', 'TTS', { textLength });
				child.stdin.write(text, 'utf8', (err) => {
					if (err) {
						logger.error('TTS stdin write error', 'TTS', { error: String(err) });
					} else {
						logger.debug('TTS stdin write completed', 'TTS');
					}
					child.stdin!.end();
				});
			} else {
				logger.error('TTS no stdin available on child process', 'TTS');
			}

			child.on('error', (err) => {
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
				// Always log close event for debugging production issues
				logger.info('TTS process closed', 'TTS', {
					ttsId,
					exitCode: code,
					signal,
					stderr: stderrOutput || '(none)',
					command: fullCommand,
				});

				if (code !== 0 && stderrOutput) {
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

			logger.info('TTS process spawned successfully', 'TTS', {
				ttsId,
				command: fullCommand,
				textLength,
			});
		});
	} catch (error) {
		logger.error('TTS error starting audio feedback', 'TTS', {
			error: String(error),
			command: fullCommand,
			textPreview,
		});
		return { success: false, error: String(error) };
	}
}

/**
 * Process the next item in the TTS queue.
 *
 * Uses a flag-first approach to prevent race conditions:
 * 1. Check and set the processing flag atomically
 * 2. Then check the queue
 * This ensures only one processNextTts call can proceed at a time.
 */
async function processNextTts(): Promise<void> {
	// Check queue first - if empty, nothing to do
	if (ttsQueue.length === 0) return;

	// Set flag BEFORE processing to prevent race condition
	// where multiple calls could pass the isTtsProcessing check simultaneously
	if (isTtsProcessing) return;
	isTtsProcessing = true;

	// Double-check queue after setting flag (another call might have emptied it)
	if (ttsQueue.length === 0) {
		isTtsProcessing = false;
		return;
	}

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
			// Check queue size limit to prevent memory issues
			if (ttsQueue.length >= TTS_MAX_QUEUE_SIZE) {
				logger.warn('TTS queue is full, rejecting request', 'TTS', {
					queueLength: ttsQueue.length,
					maxSize: TTS_MAX_QUEUE_SIZE,
				});
				return {
					success: false,
					error: `TTS queue is full (max ${TTS_MAX_QUEUE_SIZE} items). Please wait for current items to complete.`,
				};
			}

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
		logger.debug('TTS stop requested', 'TTS', { ttsId });

		const ttsProcess = activeTtsProcesses.get(ttsId);
		if (!ttsProcess) {
			logger.debug('TTS no active process found', 'TTS', { ttsId });
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

			return { success: true };
		} catch (error) {
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

/**
 * Get the maximum TTS queue size (for testing)
 */
export function getTtsMaxQueueSize(): number {
	return TTS_MAX_QUEUE_SIZE;
}

/**
 * Get the list of allowed TTS commands (for testing)
 */
export function getAllowedTtsCommands(): string[] {
	return [...ALLOWED_TTS_COMMANDS];
}
