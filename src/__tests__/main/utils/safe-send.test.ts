/**
 * @file safe-send.test.ts
 * @description Unit tests for safe IPC message sending utility.
 * Tests multi-window broadcast functionality (GitHub issue #133).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BrowserWindow, WebContents } from 'electron';

// Mock the logger
vi.mock('../../../main/utils/logger', () => ({
	logger: {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

// Mock the window registry - use factory with inline mock object
// Note: vi.mock is hoisted, so we must define the mock inline
vi.mock('../../../main/window-registry', () => ({
	windowRegistry: {
		getAll: vi.fn().mockReturnValue([]),
	},
}));

import { createSafeSend, type GetMainWindow, type SafeSendFn } from '../../../main/utils/safe-send';
import { logger } from '../../../main/utils/logger';
import { windowRegistry } from '../../../main/window-registry';

describe('utils/safe-send', () => {
	let mockWebContents: Partial<WebContents>;
	let mockWindow: Partial<BrowserWindow>;
	let getMainWindow: GetMainWindow;
	let safeSend: SafeSendFn;

	beforeEach(() => {
		vi.clearAllMocks();

		// Create mock WebContents
		mockWebContents = {
			send: vi.fn(),
			isDestroyed: vi.fn().mockReturnValue(false),
		};

		// Create mock BrowserWindow
		mockWindow = {
			isDestroyed: vi.fn().mockReturnValue(false),
			webContents: mockWebContents as WebContents,
		};

		// Default getter returns the mock window
		getMainWindow = vi.fn().mockReturnValue(mockWindow as BrowserWindow);

		// Reset window registry mock - default to empty (triggers fallback to mainWindow)
		vi.mocked(windowRegistry.getAll).mockReturnValue([]);

		// Create safeSend with the mock
		safeSend = createSafeSend(getMainWindow);
	});

	describe('createSafeSend', () => {
		it('should return a function', () => {
			expect(typeof createSafeSend(() => null)).toBe('function');
		});

		it('should create independent safeSend instances', () => {
			const window1 = { ...mockWindow } as BrowserWindow;
			const window2 = { ...mockWindow } as BrowserWindow;

			const safeSend1 = createSafeSend(() => window1);
			const safeSend2 = createSafeSend(() => window2);

			expect(safeSend1).not.toBe(safeSend2);
		});
	});

	describe('safeSend', () => {
		describe('successful sends', () => {
			it('should send message to webContents', () => {
				safeSend('test-channel', 'arg1', 'arg2');

				expect(mockWebContents.send).toHaveBeenCalledWith('test-channel', 'arg1', 'arg2');
			});

			it('should send message with no arguments', () => {
				safeSend('empty-channel');

				expect(mockWebContents.send).toHaveBeenCalledWith('empty-channel');
			});

			it('should send message with complex arguments', () => {
				const complexArg = { nested: { data: [1, 2, 3] } };
				safeSend('complex-channel', complexArg, null, undefined, 42);

				expect(mockWebContents.send).toHaveBeenCalledWith(
					'complex-channel',
					complexArg,
					null,
					undefined,
					42
				);
			});

			it('should call getMainWindow each time', () => {
				safeSend('channel1');
				safeSend('channel2');
				safeSend('channel3');

				expect(getMainWindow).toHaveBeenCalledTimes(3);
			});
		});

		describe('null window handling', () => {
			it('should not throw when window is null', () => {
				const nullWindowGetter = vi.fn().mockReturnValue(null);
				const safeSendNullWindow = createSafeSend(nullWindowGetter);

				expect(() => safeSendNullWindow('test-channel', 'data')).not.toThrow();
			});

			it('should not attempt to send when window is null', () => {
				const nullWindowGetter = vi.fn().mockReturnValue(null);
				const safeSendNullWindow = createSafeSend(nullWindowGetter);

				safeSendNullWindow('test-channel', 'data');

				expect(mockWebContents.send).not.toHaveBeenCalled();
			});
		});

		describe('destroyed window handling', () => {
			it('should not send when window is destroyed', () => {
				vi.mocked(mockWindow.isDestroyed!).mockReturnValue(true);

				safeSend('test-channel', 'data');

				expect(mockWebContents.send).not.toHaveBeenCalled();
			});

			it('should not throw when window is destroyed', () => {
				vi.mocked(mockWindow.isDestroyed!).mockReturnValue(true);

				expect(() => safeSend('test-channel', 'data')).not.toThrow();
			});
		});

		describe('destroyed webContents handling', () => {
			it('should not send when webContents is destroyed', () => {
				vi.mocked(mockWebContents.isDestroyed!).mockReturnValue(true);

				safeSend('test-channel', 'data');

				expect(mockWebContents.send).not.toHaveBeenCalled();
			});

			it('should not throw when webContents is destroyed', () => {
				vi.mocked(mockWebContents.isDestroyed!).mockReturnValue(true);

				expect(() => safeSend('test-channel', 'data')).not.toThrow();
			});
		});

		describe('missing webContents handling', () => {
			it('should not throw when webContents is null', () => {
				const windowWithoutWebContents = {
					isDestroyed: vi.fn().mockReturnValue(false),
					webContents: null,
				} as unknown as BrowserWindow;

				const safeSendNoWebContents = createSafeSend(() => windowWithoutWebContents);

				expect(() => safeSendNoWebContents('test-channel', 'data')).not.toThrow();
			});

			it('should not send when webContents is undefined', () => {
				const windowWithUndefinedWebContents = {
					isDestroyed: vi.fn().mockReturnValue(false),
					webContents: undefined,
				} as unknown as BrowserWindow;

				const safeSendNoWebContents = createSafeSend(() => windowWithUndefinedWebContents);

				safeSendNoWebContents('test-channel', 'data');

				expect(mockWebContents.send).not.toHaveBeenCalled();
			});
		});

		describe('error handling', () => {
			it('should catch and log errors from send', () => {
				const error = new Error('Send failed');
				vi.mocked(mockWebContents.send!).mockImplementation(() => {
					throw error;
				});

				expect(() => safeSend('test-channel', 'data')).not.toThrow();
				expect(logger.debug).toHaveBeenCalledWith(
					expect.stringContaining('Failed to send IPC message'),
					'IPC',
					expect.objectContaining({ error: expect.any(String) })
				);
			});

			it('should catch errors from isDestroyed check', () => {
				vi.mocked(mockWindow.isDestroyed!).mockImplementation(() => {
					throw new Error('isDestroyed failed');
				});

				expect(() => safeSend('test-channel', 'data')).not.toThrow();
			});

			it('should log the channel name in error message', () => {
				vi.mocked(mockWebContents.send!).mockImplementation(() => {
					throw new Error('Test error');
				});

				safeSend('my-specific-channel', 'data');

				expect(logger.debug).toHaveBeenCalledWith(
					expect.stringContaining('my-specific-channel'),
					'IPC',
					expect.any(Object)
				);
			});
		});

		describe('edge cases', () => {
			it('should handle rapidly changing window state', () => {
				let callCount = 0;
				const changingWindowGetter = vi.fn().mockImplementation(() => {
					callCount++;
					if (callCount % 2 === 0) {
						return null;
					}
					return mockWindow as BrowserWindow;
				});

				const safeSendChanging = createSafeSend(changingWindowGetter);

				// First call - window exists
				safeSendChanging('channel1');
				expect(mockWebContents.send).toHaveBeenCalledTimes(1);

				// Second call - window null
				safeSendChanging('channel2');
				expect(mockWebContents.send).toHaveBeenCalledTimes(1); // Still 1

				// Third call - window exists again
				safeSendChanging('channel3');
				expect(mockWebContents.send).toHaveBeenCalledTimes(2);
			});

			it('should handle special channel names', () => {
				safeSend('channel:with:colons', 'data');
				expect(mockWebContents.send).toHaveBeenCalledWith('channel:with:colons', 'data');

				safeSend('channel-with-dashes', 'data');
				expect(mockWebContents.send).toHaveBeenCalledWith('channel-with-dashes', 'data');

				safeSend('channel_with_underscores', 'data');
				expect(mockWebContents.send).toHaveBeenCalledWith('channel_with_underscores', 'data');
			});
		});

		describe('multi-window broadcast (GitHub issue #133)', () => {
			it('should broadcast to all registered windows', () => {
				const mockWebContents1: Partial<WebContents> = {
					send: vi.fn(),
					isDestroyed: vi.fn().mockReturnValue(false),
				};
				const mockWebContents2: Partial<WebContents> = {
					send: vi.fn(),
					isDestroyed: vi.fn().mockReturnValue(false),
				};

				const mockWindow1: Partial<BrowserWindow> = {
					isDestroyed: vi.fn().mockReturnValue(false),
					webContents: mockWebContents1 as WebContents,
				};
				const mockWindow2: Partial<BrowserWindow> = {
					isDestroyed: vi.fn().mockReturnValue(false),
					webContents: mockWebContents2 as WebContents,
				};

				// Set up window registry to return two windows
				vi.mocked(windowRegistry.getAll).mockReturnValue([
					['window-1', { browserWindow: mockWindow1, sessionIds: ['session-1'] }],
					['window-2', { browserWindow: mockWindow2, sessionIds: ['session-2'] }],
				]);

				safeSend('process:data', 'session-1-ai-tab1', 'test data');

				// Both windows should receive the message
				expect(mockWebContents1.send).toHaveBeenCalledWith(
					'process:data',
					'session-1-ai-tab1',
					'test data'
				);
				expect(mockWebContents2.send).toHaveBeenCalledWith(
					'process:data',
					'session-1-ai-tab1',
					'test data'
				);
			});

			it('should skip destroyed windows in multi-window broadcast', () => {
				const mockWebContents1: Partial<WebContents> = {
					send: vi.fn(),
					isDestroyed: vi.fn().mockReturnValue(false),
				};
				const mockWebContents2: Partial<WebContents> = {
					send: vi.fn(),
					isDestroyed: vi.fn().mockReturnValue(false),
				};

				const mockWindow1: Partial<BrowserWindow> = {
					isDestroyed: vi.fn().mockReturnValue(false), // Window 1 is OK
					webContents: mockWebContents1 as WebContents,
				};
				const mockWindow2: Partial<BrowserWindow> = {
					isDestroyed: vi.fn().mockReturnValue(true), // Window 2 is destroyed
					webContents: mockWebContents2 as WebContents,
				};

				vi.mocked(windowRegistry.getAll).mockReturnValue([
					['window-1', { browserWindow: mockWindow1, sessionIds: ['session-1'] }],
					['window-2', { browserWindow: mockWindow2, sessionIds: ['session-2'] }],
				]);

				safeSend('test-channel', 'data');

				// Only window 1 should receive the message
				expect(mockWebContents1.send).toHaveBeenCalledWith('test-channel', 'data');
				expect(mockWebContents2.send).not.toHaveBeenCalled();
			});

			it('should fall back to mainWindow when registry is empty', () => {
				// Registry returns empty array
				vi.mocked(windowRegistry.getAll).mockReturnValue([]);

				safeSend('test-channel', 'data');

				// Should fall back to mainWindow
				expect(mockWebContents.send).toHaveBeenCalledWith('test-channel', 'data');
			});

			it('should log when broadcasting to multiple windows', () => {
				const mockWebContents1: Partial<WebContents> = {
					send: vi.fn(),
					isDestroyed: vi.fn().mockReturnValue(false),
				};
				const mockWebContents2: Partial<WebContents> = {
					send: vi.fn(),
					isDestroyed: vi.fn().mockReturnValue(false),
				};

				const mockWindow1: Partial<BrowserWindow> = {
					isDestroyed: vi.fn().mockReturnValue(false),
					webContents: mockWebContents1 as WebContents,
				};
				const mockWindow2: Partial<BrowserWindow> = {
					isDestroyed: vi.fn().mockReturnValue(false),
					webContents: mockWebContents2 as WebContents,
				};

				vi.mocked(windowRegistry.getAll).mockReturnValue([
					['window-1', { browserWindow: mockWindow1, sessionIds: ['session-1'] }],
					['window-2', { browserWindow: mockWindow2, sessionIds: ['session-2'] }],
				]);

				safeSend('test-channel', 'data');

				// Should log when broadcasting to multiple windows
				expect(logger.debug).toHaveBeenCalledWith(
					expect.stringContaining('Broadcast IPC message to 2 windows'),
					'IPC'
				);
			});

			it('should not log when broadcasting to single window', () => {
				const mockWebContents1: Partial<WebContents> = {
					send: vi.fn(),
					isDestroyed: vi.fn().mockReturnValue(false),
				};

				const mockWindow1: Partial<BrowserWindow> = {
					isDestroyed: vi.fn().mockReturnValue(false),
					webContents: mockWebContents1 as WebContents,
				};

				vi.mocked(windowRegistry.getAll).mockReturnValue([
					['window-1', { browserWindow: mockWindow1, sessionIds: ['session-1'] }],
				]);

				safeSend('test-channel', 'data');

				// Should NOT log for single window
				expect(logger.debug).not.toHaveBeenCalledWith(
					expect.stringContaining('Broadcast IPC message'),
					'IPC'
				);
			});

			it('should handle mixed valid and invalid windows gracefully', () => {
				const mockWebContents1: Partial<WebContents> = {
					send: vi.fn(),
					isDestroyed: vi.fn().mockReturnValue(false),
				};
				const mockWebContents2: Partial<WebContents> = {
					send: vi.fn(),
					isDestroyed: vi.fn().mockReturnValue(true), // WebContents destroyed
				};
				const mockWebContents3: Partial<WebContents> = {
					send: vi.fn(),
					isDestroyed: vi.fn().mockReturnValue(false),
				};

				const mockWindow1: Partial<BrowserWindow> = {
					isDestroyed: vi.fn().mockReturnValue(false),
					webContents: mockWebContents1 as WebContents,
				};
				const mockWindow2: Partial<BrowserWindow> = {
					isDestroyed: vi.fn().mockReturnValue(false),
					webContents: mockWebContents2 as WebContents, // Has destroyed webContents
				};
				const mockWindow3: Partial<BrowserWindow> = {
					isDestroyed: vi.fn().mockReturnValue(false),
					webContents: mockWebContents3 as WebContents,
				};

				vi.mocked(windowRegistry.getAll).mockReturnValue([
					['window-1', { browserWindow: mockWindow1, sessionIds: ['session-1'] }],
					['window-2', { browserWindow: mockWindow2, sessionIds: ['session-2'] }],
					['window-3', { browserWindow: mockWindow3, sessionIds: ['session-3'] }],
				]);

				safeSend('test-channel', 'data');

				// Windows 1 and 3 should receive, window 2 should be skipped
				expect(mockWebContents1.send).toHaveBeenCalledWith('test-channel', 'data');
				expect(mockWebContents2.send).not.toHaveBeenCalled();
				expect(mockWebContents3.send).toHaveBeenCalledWith('test-channel', 'data');
			});
		});
	});
});
