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
	});
});
