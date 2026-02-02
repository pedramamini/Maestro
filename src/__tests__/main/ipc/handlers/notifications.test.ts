/**
 * Tests for notification IPC handlers
 *
 * Note: Notification command tests are simplified due to the complexity of mocking
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
	parseNotificationCommand,
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
		it('should return error when no active notification process', async () => {
			const handler = handlers.get('notification:stopSpeak')!;
			const result = await handler({}, 999);

			expect(result.success).toBe(false);
			expect(result.error).toBe('No active notification process with that ID');
		});
	});

	describe('notification state utilities', () => {
		it('should track notification queue length', () => {
			expect(getTtsQueueLength()).toBe(0);
		});

		it('should track active notification count', () => {
			expect(getActiveTtsCount()).toBe(0);
		});

		it('should clear notification queue', () => {
			clearTtsQueue();
			expect(getTtsQueueLength()).toBe(0);
		});

		it('should reset notification state', () => {
			resetTtsState();
			expect(getTtsQueueLength()).toBe(0);
			expect(getActiveTtsCount()).toBe(0);
		});

		it('should return max queue size', () => {
			expect(getTtsMaxQueueSize()).toBe(10);
		});
	});

	describe('notification command parsing', () => {
		it('should return default command when none provided', () => {
			const result = parseNotificationCommand();
			expect(result).toBe('say');
		});

		it('should return default command for empty string', () => {
			const result = parseNotificationCommand('');
			expect(result).toBe('say');
		});

		it('should return default command for whitespace-only string', () => {
			const result = parseNotificationCommand('   ');
			expect(result).toBe('say');
		});

		it('should accept any command - user has full control', () => {
			const result = parseNotificationCommand('say');
			expect(result).toBe('say');
		});

		it('should accept custom commands with full paths', () => {
			const result = parseNotificationCommand('/usr/local/bin/my-tts');
			expect(result).toBe('/usr/local/bin/my-tts');
		});

		it('should accept commands with arguments', () => {
			const result = parseNotificationCommand('say -v Alex');
			expect(result).toBe('say -v Alex');
		});

		it('should accept command chains with pipes', () => {
			const result = parseNotificationCommand('tee ~/log.txt | say');
			expect(result).toBe('tee ~/log.txt | say');
		});

		it('should accept fabric pattern commands', () => {
			const result = parseNotificationCommand(
				'/Users/pedram/go/bin/fabric --pattern ped_summarize_conversational --model gpt-5-mini --raw 2>/dev/null | /Users/pedram/.local/bin/11s --voice NFQv27BRKPFgprCm0xgr'
			);
			expect(result).toBe(
				'/Users/pedram/go/bin/fabric --pattern ped_summarize_conversational --model gpt-5-mini --raw 2>/dev/null | /Users/pedram/.local/bin/11s --voice NFQv27BRKPFgprCm0xgr'
			);
		});

		it('should trim leading and trailing whitespace', () => {
			const result = parseNotificationCommand('  say  ');
			expect(result).toBe('say');
		});

		it('should accept espeak command', () => {
			const result = parseNotificationCommand('espeak');
			expect(result).toBe('espeak');
		});

		it('should accept festival command with flags', () => {
			const result = parseNotificationCommand('festival --tts');
			expect(result).toBe('festival --tts');
		});
	});

	describe('notification queue size limit', () => {
		it('should reject requests when queue is full', async () => {
			const handler = handlers.get('notification:speak')!;
			const maxSize = getTtsMaxQueueSize();

			// The flow is:
			// 1. First call: item added to queue, processNextNotification() shifts it out to process
			// 2. executeNotificationCommand() creates a spawn that never completes, so isNotificationProcessing stays true
			// 3. Subsequent calls: items are added to queue but not processed (isNotificationProcessing is true)
			// 4. Queue accumulates items 2 through maxSize (first one was shifted out)
			// 5. We need maxSize + 1 calls total to fill the queue to maxSize items

			// First call - this item gets shifted out of queue immediately for processing
			handler({}, 'Message 0');

			// Allow the async processNextNotification to start (shifts item from queue)
			await new Promise((resolve) => setTimeout(resolve, 10));

			// Now isNotificationProcessing is true, so subsequent items stay in queue
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

			// Clean up - reset all notification state including clearing the queue
			resetTtsState();
		});
	});
});
