/**
 * Tests for WindowRegistry class.
 *
 * Tests cover:
 * - Window creation and registration
 * - Window retrieval (single, all, primary)
 * - Window removal
 * - Session-to-window mapping
 * - Session movement between windows
 * - Active session management
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { BrowserWindow } from 'electron';

// Mock logger
const mockLogger = {
	error: vi.fn(),
	info: vi.fn(),
	warn: vi.fn(),
	debug: vi.fn(),
};

vi.mock('../../main/utils/logger', () => ({
	logger: mockLogger,
}));

// Mock uuid
vi.mock('uuid', () => ({
	v4: () => 'mock-uuid-' + Math.random().toString(36).substring(7),
}));

// Create mock BrowserWindow factory
function createMockBrowserWindow(): BrowserWindow {
	const handlers: Record<string, ((...args: any[]) => void)[]> = {};
	return {
		on: vi.fn((event: string, handler: (...args: any[]) => void) => {
			if (!handlers[event]) handlers[event] = [];
			handlers[event].push(handler);
		}),
		emit: (event: string, ...args: any[]) => {
			handlers[event]?.forEach((h) => h(...args));
		},
		isDestroyed: vi.fn().mockReturnValue(false),
		focus: vi.fn(),
		webContents: {
			send: vi.fn(),
		},
	} as unknown as BrowserWindow;
}

describe('WindowRegistry', () => {
	// Import fresh module for each test to get clean singleton
	let WindowRegistry: typeof import('../../main/window-registry').WindowRegistry;
	let windowRegistry: import('../../main/window-registry').WindowRegistry;

	beforeEach(async () => {
		vi.clearAllMocks();
		vi.resetModules();

		// Import fresh module
		const module = await import('../../main/window-registry');
		WindowRegistry = module.WindowRegistry;
		windowRegistry = new WindowRegistry();
	});

	afterEach(() => {
		windowRegistry.clear();
		vi.restoreAllMocks();
	});

	describe('setWindowFactory', () => {
		it('should set the window factory', () => {
			const factory = vi.fn().mockReturnValue(createMockBrowserWindow());
			windowRegistry.setWindowFactory(factory);

			expect(mockLogger.debug).toHaveBeenCalledWith('Window factory set', 'WindowRegistry');
		});
	});

	describe('create', () => {
		it('should throw error if window factory not set', () => {
			expect(() => windowRegistry.create()).toThrow(
				'Window factory not set. Call setWindowFactory() first.'
			);
		});

		it('should create and register a window', () => {
			const mockWindow = createMockBrowserWindow();
			const factory = vi.fn().mockReturnValue(mockWindow);
			windowRegistry.setWindowFactory(factory);

			const result = windowRegistry.create({ windowId: 'test-window' });

			expect(result.windowId).toBe('test-window');
			expect(result.browserWindow).toBe(mockWindow);
			expect(windowRegistry.has('test-window')).toBe(true);
		});

		it('should generate window ID if not provided', () => {
			const mockWindow = createMockBrowserWindow();
			const factory = vi.fn().mockReturnValue(mockWindow);
			windowRegistry.setWindowFactory(factory);

			const result = windowRegistry.create();

			expect(result.windowId).toMatch(/^mock-uuid-/);
			expect(result.browserWindow).toBe(mockWindow);
		});

		it('should mark first window as primary by default', () => {
			const mockWindow = createMockBrowserWindow();
			const factory = vi.fn().mockReturnValue(mockWindow);
			windowRegistry.setWindowFactory(factory);

			windowRegistry.create({ windowId: 'first-window' });

			const entry = windowRegistry.get('first-window');
			expect(entry?.isMain).toBe(true);
			expect(windowRegistry.getPrimaryId()).toBe('first-window');
		});

		it('should not mark subsequent windows as primary', () => {
			const factory = vi.fn().mockReturnValue(createMockBrowserWindow());
			windowRegistry.setWindowFactory(factory);

			windowRegistry.create({ windowId: 'first-window' });
			windowRegistry.create({ windowId: 'second-window' });

			const firstEntry = windowRegistry.get('first-window');
			const secondEntry = windowRegistry.get('second-window');

			expect(firstEntry?.isMain).toBe(true);
			expect(secondEntry?.isMain).toBe(false);
			expect(windowRegistry.getPrimaryId()).toBe('first-window');
		});

		it('should allow explicit isMain setting', () => {
			const factory = vi.fn().mockReturnValue(createMockBrowserWindow());
			windowRegistry.setWindowFactory(factory);

			windowRegistry.create({ windowId: 'primary', isMain: true });
			windowRegistry.create({ windowId: 'secondary', isMain: false });

			const primaryEntry = windowRegistry.get('primary');
			const secondaryEntry = windowRegistry.get('secondary');

			expect(primaryEntry?.isMain).toBe(true);
			expect(secondaryEntry?.isMain).toBe(false);
		});

		it('should initialize with provided sessionIds', () => {
			const factory = vi.fn().mockReturnValue(createMockBrowserWindow());
			windowRegistry.setWindowFactory(factory);

			windowRegistry.create({
				windowId: 'test-window',
				sessionIds: ['session-1', 'session-2'],
				activeSessionId: 'session-1',
			});

			const entry = windowRegistry.get('test-window');
			expect(entry?.sessionIds).toEqual(['session-1', 'session-2']);
			expect(entry?.activeSessionId).toBe('session-1');
		});

		it('should register close handler on window', () => {
			const mockWindow = createMockBrowserWindow();
			const factory = vi.fn().mockReturnValue(mockWindow);
			windowRegistry.setWindowFactory(factory);

			windowRegistry.create({ windowId: 'test-window', isMain: false });

			expect(mockWindow.on).toHaveBeenCalledWith('closed', expect.any(Function));
		});
	});

	describe('get', () => {
		it('should return undefined for non-existent window', () => {
			expect(windowRegistry.get('non-existent')).toBeUndefined();
		});

		it('should return window entry for existing window', () => {
			const mockWindow = createMockBrowserWindow();
			const factory = vi.fn().mockReturnValue(mockWindow);
			windowRegistry.setWindowFactory(factory);

			windowRegistry.create({ windowId: 'test-window' });

			const entry = windowRegistry.get('test-window');
			expect(entry).toBeDefined();
			expect(entry?.browserWindow).toBe(mockWindow);
		});
	});

	describe('getAll', () => {
		it('should return empty array when no windows', () => {
			expect(windowRegistry.getAll()).toEqual([]);
		});

		it('should return all windows as tuples', () => {
			const factory = vi.fn().mockReturnValue(createMockBrowserWindow());
			windowRegistry.setWindowFactory(factory);

			windowRegistry.create({ windowId: 'window-1' });
			windowRegistry.create({ windowId: 'window-2' });

			const all = windowRegistry.getAll();
			expect(all).toHaveLength(2);
			expect(all.map(([id]) => id)).toContain('window-1');
			expect(all.map(([id]) => id)).toContain('window-2');
		});
	});

	describe('getPrimary', () => {
		it('should return undefined when no primary window', () => {
			expect(windowRegistry.getPrimary()).toBeUndefined();
		});

		it('should return primary window entry', () => {
			const mockWindow = createMockBrowserWindow();
			const factory = vi.fn().mockReturnValue(mockWindow);
			windowRegistry.setWindowFactory(factory);

			windowRegistry.create({ windowId: 'primary-window' });

			const primary = windowRegistry.getPrimary();
			expect(primary).toBeDefined();
			expect(primary?.isMain).toBe(true);
		});
	});

	describe('remove', () => {
		it('should return false for non-existent window', () => {
			expect(windowRegistry.remove('non-existent')).toBe(false);
		});

		it('should not allow removing primary window', () => {
			const factory = vi.fn().mockReturnValue(createMockBrowserWindow());
			windowRegistry.setWindowFactory(factory);

			windowRegistry.create({ windowId: 'primary-window' });

			expect(windowRegistry.remove('primary-window')).toBe(false);
			expect(windowRegistry.has('primary-window')).toBe(true);
		});

		it('should remove non-primary window', () => {
			const factory = vi.fn().mockReturnValue(createMockBrowserWindow());
			windowRegistry.setWindowFactory(factory);

			windowRegistry.create({ windowId: 'primary-window' });
			windowRegistry.create({ windowId: 'secondary-window' });

			expect(windowRegistry.remove('secondary-window')).toBe(true);
			expect(windowRegistry.has('secondary-window')).toBe(false);
		});
	});

	describe('getWindowForSession', () => {
		it('should return undefined when session not found', () => {
			expect(windowRegistry.getWindowForSession('non-existent')).toBeUndefined();
		});

		it('should return window ID containing session', () => {
			const factory = vi.fn().mockReturnValue(createMockBrowserWindow());
			windowRegistry.setWindowFactory(factory);

			windowRegistry.create({
				windowId: 'window-1',
				sessionIds: ['session-a', 'session-b'],
			});
			windowRegistry.create({
				windowId: 'window-2',
				sessionIds: ['session-c'],
			});

			expect(windowRegistry.getWindowForSession('session-a')).toBe('window-1');
			expect(windowRegistry.getWindowForSession('session-b')).toBe('window-1');
			expect(windowRegistry.getWindowForSession('session-c')).toBe('window-2');
		});
	});

	describe('setSessionsForWindow', () => {
		it('should return false for non-existent window', () => {
			expect(windowRegistry.setSessionsForWindow('non-existent', ['session-1'])).toBe(false);
		});

		it('should update sessions for window', () => {
			const factory = vi.fn().mockReturnValue(createMockBrowserWindow());
			windowRegistry.setWindowFactory(factory);

			windowRegistry.create({ windowId: 'test-window', sessionIds: ['old-session'] });

			const result = windowRegistry.setSessionsForWindow(
				'test-window',
				['new-session-1', 'new-session-2'],
				'new-session-1'
			);

			expect(result).toBe(true);
			const entry = windowRegistry.get('test-window');
			expect(entry?.sessionIds).toEqual(['new-session-1', 'new-session-2']);
			expect(entry?.activeSessionId).toBe('new-session-1');
		});
	});

	describe('moveSession', () => {
		it('should return false when target window not found', () => {
			const factory = vi.fn().mockReturnValue(createMockBrowserWindow());
			windowRegistry.setWindowFactory(factory);

			windowRegistry.create({ windowId: 'source-window', sessionIds: ['session-1'] });

			expect(windowRegistry.moveSession('session-1', 'source-window', 'non-existent')).toBe(false);
		});

		it('should move session from source to target window', () => {
			const factory = vi.fn().mockReturnValue(createMockBrowserWindow());
			windowRegistry.setWindowFactory(factory);

			windowRegistry.create({
				windowId: 'source-window',
				sessionIds: ['session-1', 'session-2'],
				activeSessionId: 'session-1',
			});
			windowRegistry.create({ windowId: 'target-window', sessionIds: [] });

			const result = windowRegistry.moveSession('session-1', 'source-window', 'target-window');

			expect(result).toBe(true);

			const sourceEntry = windowRegistry.get('source-window');
			const targetEntry = windowRegistry.get('target-window');

			expect(sourceEntry?.sessionIds).toEqual(['session-2']);
			expect(sourceEntry?.activeSessionId).toBe('session-2'); // Updated to next available
			expect(targetEntry?.sessionIds).toEqual(['session-1']);
			expect(targetEntry?.activeSessionId).toBe('session-1'); // Set as active in target
		});

		it('should handle empty source windowId (just add to target)', () => {
			const factory = vi.fn().mockReturnValue(createMockBrowserWindow());
			windowRegistry.setWindowFactory(factory);

			windowRegistry.create({ windowId: 'target-window', sessionIds: [] });

			const result = windowRegistry.moveSession('new-session', '', 'target-window');

			expect(result).toBe(true);
			const targetEntry = windowRegistry.get('target-window');
			expect(targetEntry?.sessionIds).toEqual(['new-session']);
		});

		it('should not add duplicate session to target', () => {
			const factory = vi.fn().mockReturnValue(createMockBrowserWindow());
			windowRegistry.setWindowFactory(factory);

			windowRegistry.create({
				windowId: 'target-window',
				sessionIds: ['session-1'],
			});

			const result = windowRegistry.moveSession('session-1', '', 'target-window');

			expect(result).toBe(true);
			const targetEntry = windowRegistry.get('target-window');
			expect(targetEntry?.sessionIds).toEqual(['session-1']); // Not duplicated
		});
	});

	describe('addSessionToWindow', () => {
		it('should return false for non-existent window', () => {
			expect(windowRegistry.addSessionToWindow('non-existent', 'session-1')).toBe(false);
		});

		it('should return false if session already in another window', () => {
			const factory = vi.fn().mockReturnValue(createMockBrowserWindow());
			windowRegistry.setWindowFactory(factory);

			windowRegistry.create({
				windowId: 'window-1',
				sessionIds: ['session-1'],
			});
			windowRegistry.create({ windowId: 'window-2', sessionIds: [] });

			expect(windowRegistry.addSessionToWindow('window-2', 'session-1')).toBe(false);
		});

		it('should add session and make it active by default', () => {
			const factory = vi.fn().mockReturnValue(createMockBrowserWindow());
			windowRegistry.setWindowFactory(factory);

			windowRegistry.create({ windowId: 'test-window', sessionIds: [] });

			const result = windowRegistry.addSessionToWindow('test-window', 'session-1');

			expect(result).toBe(true);
			const entry = windowRegistry.get('test-window');
			expect(entry?.sessionIds).toContain('session-1');
			expect(entry?.activeSessionId).toBe('session-1');
		});

		it('should add session without making it active when specified', () => {
			const factory = vi.fn().mockReturnValue(createMockBrowserWindow());
			windowRegistry.setWindowFactory(factory);

			windowRegistry.create({
				windowId: 'test-window',
				sessionIds: ['session-0'],
				activeSessionId: 'session-0',
			});

			const result = windowRegistry.addSessionToWindow('test-window', 'session-1', false);

			expect(result).toBe(true);
			const entry = windowRegistry.get('test-window');
			expect(entry?.sessionIds).toContain('session-1');
			expect(entry?.activeSessionId).toBe('session-0'); // Unchanged
		});
	});

	describe('removeSessionFromWindow', () => {
		it('should return false for non-existent window', () => {
			expect(windowRegistry.removeSessionFromWindow('non-existent', 'session-1')).toBe(false);
		});

		it('should return false if session not in window', () => {
			const factory = vi.fn().mockReturnValue(createMockBrowserWindow());
			windowRegistry.setWindowFactory(factory);

			windowRegistry.create({ windowId: 'test-window', sessionIds: ['other-session'] });

			expect(windowRegistry.removeSessionFromWindow('test-window', 'session-1')).toBe(false);
		});

		it('should remove session and update active session if needed', () => {
			const factory = vi.fn().mockReturnValue(createMockBrowserWindow());
			windowRegistry.setWindowFactory(factory);

			windowRegistry.create({
				windowId: 'test-window',
				sessionIds: ['session-1', 'session-2'],
				activeSessionId: 'session-1',
			});

			const result = windowRegistry.removeSessionFromWindow('test-window', 'session-1');

			expect(result).toBe(true);
			const entry = windowRegistry.get('test-window');
			expect(entry?.sessionIds).toEqual(['session-2']);
			expect(entry?.activeSessionId).toBe('session-2');
		});
	});

	describe('setActiveSession', () => {
		it('should return false for non-existent window', () => {
			expect(windowRegistry.setActiveSession('non-existent', 'session-1')).toBe(false);
		});

		it('should return false if session not in window', () => {
			const factory = vi.fn().mockReturnValue(createMockBrowserWindow());
			windowRegistry.setWindowFactory(factory);

			windowRegistry.create({ windowId: 'test-window', sessionIds: ['other-session'] });

			expect(windowRegistry.setActiveSession('test-window', 'session-1')).toBe(false);
		});

		it('should set active session', () => {
			const factory = vi.fn().mockReturnValue(createMockBrowserWindow());
			windowRegistry.setWindowFactory(factory);

			windowRegistry.create({
				windowId: 'test-window',
				sessionIds: ['session-1', 'session-2'],
				activeSessionId: 'session-1',
			});

			const result = windowRegistry.setActiveSession('test-window', 'session-2');

			expect(result).toBe(true);
			expect(windowRegistry.getActiveSession('test-window')).toBe('session-2');
		});
	});

	describe('getActiveSession', () => {
		it('should return undefined for non-existent window', () => {
			expect(windowRegistry.getActiveSession('non-existent')).toBeUndefined();
		});

		it('should return active session ID', () => {
			const factory = vi.fn().mockReturnValue(createMockBrowserWindow());
			windowRegistry.setWindowFactory(factory);

			windowRegistry.create({
				windowId: 'test-window',
				sessionIds: ['session-1'],
				activeSessionId: 'session-1',
			});

			expect(windowRegistry.getActiveSession('test-window')).toBe('session-1');
		});
	});

	describe('getWindowCount', () => {
		it('should return 0 when no windows', () => {
			expect(windowRegistry.getWindowCount()).toBe(0);
		});

		it('should return correct count', () => {
			const factory = vi.fn().mockReturnValue(createMockBrowserWindow());
			windowRegistry.setWindowFactory(factory);

			windowRegistry.create({ windowId: 'window-1' });
			windowRegistry.create({ windowId: 'window-2' });

			expect(windowRegistry.getWindowCount()).toBe(2);
		});
	});

	describe('has', () => {
		it('should return false for non-existent window', () => {
			expect(windowRegistry.has('non-existent')).toBe(false);
		});

		it('should return true for existing window', () => {
			const factory = vi.fn().mockReturnValue(createMockBrowserWindow());
			windowRegistry.setWindowFactory(factory);

			windowRegistry.create({ windowId: 'test-window' });

			expect(windowRegistry.has('test-window')).toBe(true);
		});
	});

	describe('getWindowIdForBrowserWindow', () => {
		it('should return undefined for unknown BrowserWindow', () => {
			const unknownWindow = createMockBrowserWindow();
			expect(windowRegistry.getWindowIdForBrowserWindow(unknownWindow)).toBeUndefined();
		});

		it('should return window ID for known BrowserWindow', () => {
			const mockWindow = createMockBrowserWindow();
			const factory = vi.fn().mockReturnValue(mockWindow);
			windowRegistry.setWindowFactory(factory);

			windowRegistry.create({ windowId: 'test-window' });

			expect(windowRegistry.getWindowIdForBrowserWindow(mockWindow)).toBe('test-window');
		});
	});

	describe('window closed handling', () => {
		it('should clean up non-primary window on close', () => {
			const mockWindow = createMockBrowserWindow() as any;
			const factory = vi.fn().mockReturnValue(mockWindow);
			windowRegistry.setWindowFactory(factory);

			windowRegistry.create({ windowId: 'primary-window' });

			// Create and then close secondary window
			const secondaryWindow = createMockBrowserWindow() as any;
			factory.mockReturnValue(secondaryWindow);
			windowRegistry.create({ windowId: 'secondary-window', isMain: false });

			// Simulate window close
			secondaryWindow.emit('closed');

			expect(windowRegistry.has('secondary-window')).toBe(false);
			expect(windowRegistry.has('primary-window')).toBe(true);
		});

		it('should not remove primary window from registry on close', () => {
			const mockWindow = createMockBrowserWindow() as any;
			const factory = vi.fn().mockReturnValue(mockWindow);
			windowRegistry.setWindowFactory(factory);

			windowRegistry.create({ windowId: 'primary-window' });

			// Simulate window close (app quit scenario)
			mockWindow.emit('closed');

			// Primary window stays in registry (app handles quit separately)
			expect(windowRegistry.has('primary-window')).toBe(true);
		});
	});

	describe('clear', () => {
		it('should clear all windows and reset primary', () => {
			const factory = vi.fn().mockReturnValue(createMockBrowserWindow());
			windowRegistry.setWindowFactory(factory);

			windowRegistry.create({ windowId: 'window-1' });
			windowRegistry.create({ windowId: 'window-2' });

			windowRegistry.clear();

			expect(windowRegistry.getWindowCount()).toBe(0);
			expect(windowRegistry.getPrimaryId()).toBeNull();
		});
	});

	describe('saveWindowState', () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it('should register window state persistence event handlers on create', () => {
			const mockWindow = createMockBrowserWindow();
			const factory = vi.fn().mockReturnValue(mockWindow);
			windowRegistry.setWindowFactory(factory);
			windowRegistry.setStoresInitialized(false); // Prevent store access

			windowRegistry.create({ windowId: 'test-window' });

			// Check that persistence events are registered
			expect(mockWindow.on).toHaveBeenCalledWith('move', expect.any(Function));
			expect(mockWindow.on).toHaveBeenCalledWith('resize', expect.any(Function));
			expect(mockWindow.on).toHaveBeenCalledWith('maximize', expect.any(Function));
			expect(mockWindow.on).toHaveBeenCalledWith('unmaximize', expect.any(Function));
			expect(mockWindow.on).toHaveBeenCalledWith('enter-full-screen', expect.any(Function));
			expect(mockWindow.on).toHaveBeenCalledWith('leave-full-screen', expect.any(Function));
		});

		it('should debounce multiple rapid saves', () => {
			const mockWindow = createMockBrowserWindow();
			(mockWindow.isDestroyed as ReturnType<typeof vi.fn>).mockReturnValue(false);
			(mockWindow as any).getBounds = vi
				.fn()
				.mockReturnValue({ x: 0, y: 0, width: 800, height: 600 });
			(mockWindow as any).isMaximized = vi.fn().mockReturnValue(false);
			(mockWindow as any).isFullScreen = vi.fn().mockReturnValue(false);

			const factory = vi.fn().mockReturnValue(mockWindow);
			windowRegistry.setWindowFactory(factory);
			windowRegistry.setStoresInitialized(false); // Prevent store access

			windowRegistry.create({ windowId: 'test-window' });

			// Trigger multiple save requests rapidly
			windowRegistry.saveWindowState('test-window');
			windowRegistry.saveWindowState('test-window');
			windowRegistry.saveWindowState('test-window');

			// Before debounce timeout, getBounds should not have been called
			expect((mockWindow as any).getBounds).not.toHaveBeenCalled();

			// Fast-forward past debounce delay
			vi.advanceTimersByTime(600);

			// After debounce, getBounds should be called once (for the actual save)
			expect((mockWindow as any).getBounds).toHaveBeenCalledTimes(1);
		});

		it('should skip saving for destroyed windows', () => {
			const mockWindow = createMockBrowserWindow();
			(mockWindow.isDestroyed as ReturnType<typeof vi.fn>).mockReturnValue(true);
			(mockWindow as any).getBounds = vi.fn();

			const factory = vi.fn().mockReturnValue(mockWindow);
			windowRegistry.setWindowFactory(factory);
			windowRegistry.setStoresInitialized(false);

			windowRegistry.create({ windowId: 'test-window' });
			windowRegistry.saveWindowState('test-window');

			vi.advanceTimersByTime(600);

			// getBounds should not be called for destroyed window
			expect((mockWindow as any).getBounds).not.toHaveBeenCalled();
		});

		it('should handle save request for non-existent window', () => {
			windowRegistry.setStoresInitialized(false);

			// Should not throw
			expect(() => {
				windowRegistry.saveWindowState('non-existent-window');
				vi.advanceTimersByTime(600);
			}).not.toThrow();

			// Logger should have warned
			expect(mockLogger.warn).toHaveBeenCalledWith(
				'Cannot save state for non-existent window: non-existent-window',
				'WindowRegistry'
			);
		});

		it('should cancel pending timer when window is closed', () => {
			const mockWindow = createMockBrowserWindow() as any;
			(mockWindow.isDestroyed as ReturnType<typeof vi.fn>).mockReturnValue(false);
			mockWindow.getBounds = vi.fn().mockReturnValue({ x: 0, y: 0, width: 800, height: 600 });
			mockWindow.isMaximized = vi.fn().mockReturnValue(false);
			mockWindow.isFullScreen = vi.fn().mockReturnValue(false);

			const factory = vi.fn().mockReturnValue(mockWindow);
			windowRegistry.setWindowFactory(factory);
			windowRegistry.setStoresInitialized(false);

			// Create non-primary window (so it can be removed)
			windowRegistry.create({ windowId: 'primary-window' });
			const secondaryWindow = createMockBrowserWindow() as any;
			secondaryWindow.getBounds = vi.fn().mockReturnValue({ x: 0, y: 0, width: 800, height: 600 });
			secondaryWindow.isMaximized = vi.fn().mockReturnValue(false);
			secondaryWindow.isFullScreen = vi.fn().mockReturnValue(false);
			(secondaryWindow.isDestroyed as ReturnType<typeof vi.fn>).mockReturnValue(false);
			factory.mockReturnValue(secondaryWindow);
			windowRegistry.create({ windowId: 'secondary-window', isMain: false });

			// Trigger save for secondary window
			windowRegistry.saveWindowState('secondary-window');

			// Close the window before debounce completes
			secondaryWindow.emit('closed');

			// Fast-forward past debounce
			vi.advanceTimersByTime(600);

			// getBounds should not be called (timer was cancelled)
			expect(secondaryWindow.getBounds).not.toHaveBeenCalled();
		});

		it('should clear all timers when clear() is called', () => {
			const mockWindow = createMockBrowserWindow() as any;
			mockWindow.getBounds = vi.fn().mockReturnValue({ x: 0, y: 0, width: 800, height: 600 });
			mockWindow.isMaximized = vi.fn().mockReturnValue(false);
			mockWindow.isFullScreen = vi.fn().mockReturnValue(false);
			(mockWindow.isDestroyed as ReturnType<typeof vi.fn>).mockReturnValue(false);

			const factory = vi.fn().mockReturnValue(mockWindow);
			windowRegistry.setWindowFactory(factory);
			windowRegistry.setStoresInitialized(false);

			windowRegistry.create({ windowId: 'test-window' });
			windowRegistry.saveWindowState('test-window');

			// Clear the registry (should cancel timers)
			windowRegistry.clear();

			// Fast-forward past debounce
			vi.advanceTimersByTime(600);

			// getBounds should not be called (timer was cancelled by clear)
			expect(mockWindow.getBounds).not.toHaveBeenCalled();
		});
	});

	describe('moveSessionAsync and race condition prevention', () => {
		it('should move session asynchronously with mutex protection', async () => {
			const factory = vi.fn().mockReturnValue(createMockBrowserWindow());
			windowRegistry.setWindowFactory(factory);

			windowRegistry.create({
				windowId: 'source-window',
				sessionIds: ['session-1', 'session-2'],
				activeSessionId: 'session-1',
			});
			windowRegistry.create({ windowId: 'target-window', sessionIds: [] });

			const result = await windowRegistry.moveSessionAsync(
				'session-1',
				'source-window',
				'target-window'
			);

			expect(result).toBe(true);

			const sourceEntry = windowRegistry.get('source-window');
			const targetEntry = windowRegistry.get('target-window');

			expect(sourceEntry?.sessionIds).toEqual(['session-2']);
			expect(targetEntry?.sessionIds).toEqual(['session-1']);
		});

		it('should serialize concurrent move operations', async () => {
			const factory = vi.fn().mockReturnValue(createMockBrowserWindow());
			windowRegistry.setWindowFactory(factory);

			// Set up windows with multiple sessions
			windowRegistry.create({
				windowId: 'window-a',
				sessionIds: ['session-1', 'session-2', 'session-3'],
				activeSessionId: 'session-1',
			});
			windowRegistry.create({ windowId: 'window-b', sessionIds: [] });
			windowRegistry.create({ windowId: 'window-c', sessionIds: [], isMain: false });

			// Track the order of operations
			const operationOrder: string[] = [];

			// Simulate rapid concurrent moves
			const move1 = windowRegistry
				.moveSessionAsync('session-1', 'window-a', 'window-b')
				.then((result) => {
					operationOrder.push('move1');
					return result;
				});
			const move2 = windowRegistry
				.moveSessionAsync('session-2', 'window-a', 'window-c')
				.then((result) => {
					operationOrder.push('move2');
					return result;
				});
			const move3 = windowRegistry
				.moveSessionAsync('session-3', 'window-a', 'window-b')
				.then((result) => {
					operationOrder.push('move3');
					return result;
				});

			// Wait for all operations to complete
			const results = await Promise.all([move1, move2, move3]);

			// All operations should succeed
			expect(results).toEqual([true, true, true]);

			// Operations should complete in order (serialized)
			expect(operationOrder).toEqual(['move1', 'move2', 'move3']);

			// Verify final state is consistent
			const windowA = windowRegistry.get('window-a');
			const windowB = windowRegistry.get('window-b');
			const windowC = windowRegistry.get('window-c');

			expect(windowA?.sessionIds).toEqual([]);
			expect(windowB?.sessionIds).toEqual(['session-1', 'session-3']);
			expect(windowC?.sessionIds).toEqual(['session-2']);
		});

		it('should report operation in progress status correctly', async () => {
			const factory = vi.fn().mockReturnValue(createMockBrowserWindow());
			windowRegistry.setWindowFactory(factory);

			windowRegistry.create({
				windowId: 'source-window',
				sessionIds: ['session-1'],
			});
			windowRegistry.create({ windowId: 'target-window', sessionIds: [] });

			// Initially no operation in progress
			expect(windowRegistry.isSessionOperationInProgress()).toBe(false);
			expect(windowRegistry.getSessionOperationQueueLength()).toBe(0);

			// Start a move but don't await it yet
			let moveCompleted = false;
			const movePromise = windowRegistry
				.moveSessionAsync('session-1', 'source-window', 'target-window')
				.then((result) => {
					moveCompleted = true;
					return result;
				});

			// Queue another operation
			const queuedMove = windowRegistry.moveSessionAsync(
				'session-1', // Same session - will be a no-op since already in target
				'target-window',
				'source-window'
			);

			// Let the first operation complete
			await movePromise;
			expect(moveCompleted).toBe(true);

			// Wait for queued operation
			await queuedMove;

			// All operations complete
			expect(windowRegistry.isSessionOperationInProgress()).toBe(false);
		});

		it('should handle failed moves within mutex protection', async () => {
			const factory = vi.fn().mockReturnValue(createMockBrowserWindow());
			windowRegistry.setWindowFactory(factory);

			windowRegistry.create({
				windowId: 'source-window',
				sessionIds: ['session-1'],
			});
			// Note: target-window does not exist

			// Move should fail (target doesn't exist) but not leave mutex locked
			const result = await windowRegistry.moveSessionAsync(
				'session-1',
				'source-window',
				'non-existent-window'
			);

			expect(result).toBe(false);

			// Mutex should be released
			expect(windowRegistry.isSessionOperationInProgress()).toBe(false);

			// Subsequent operations should still work
			windowRegistry.create({ windowId: 'target-window', sessionIds: [] });
			const secondResult = await windowRegistry.moveSessionAsync(
				'session-1',
				'source-window',
				'target-window'
			);
			expect(secondResult).toBe(true);
		});

		it('should prevent session duplication during rapid moves', async () => {
			const factory = vi.fn().mockReturnValue(createMockBrowserWindow());
			windowRegistry.setWindowFactory(factory);

			windowRegistry.create({
				windowId: 'window-a',
				sessionIds: ['session-1'],
			});
			windowRegistry.create({ windowId: 'window-b', sessionIds: [] });

			// Simulate race: try to move same session to two destinations simultaneously
			// Without mutex, this could cause the session to appear in multiple windows
			const [result1, result2] = await Promise.all([
				windowRegistry.moveSessionAsync('session-1', 'window-a', 'window-b'),
				windowRegistry.moveSessionAsync('session-1', 'window-a', 'window-b'),
			]);

			// Both should succeed (second is a no-op since session is already there)
			expect(result1).toBe(true);
			expect(result2).toBe(true);

			// Session should only exist once in window-b
			const windowA = windowRegistry.get('window-a');
			const windowB = windowRegistry.get('window-b');

			expect(windowA?.sessionIds).toEqual([]);
			expect(windowB?.sessionIds).toEqual(['session-1']);
		});

		it('should handle cross-window rapid movements correctly', async () => {
			const factory = vi.fn().mockReturnValue(createMockBrowserWindow());
			windowRegistry.setWindowFactory(factory);

			windowRegistry.create({
				windowId: 'window-a',
				sessionIds: ['session-x'],
			});
			windowRegistry.create({ windowId: 'window-b', sessionIds: [] });

			// Move session back and forth rapidly
			const results = await Promise.all([
				windowRegistry.moveSessionAsync('session-x', 'window-a', 'window-b'),
				windowRegistry.moveSessionAsync('session-x', 'window-b', 'window-a'),
				windowRegistry.moveSessionAsync('session-x', 'window-a', 'window-b'),
			]);

			// All should succeed (serialized)
			expect(results).toEqual([true, true, true]);

			// Session should end up in window-b (last move destination)
			const windowA = windowRegistry.get('window-a');
			const windowB = windowRegistry.get('window-b');

			// Session should be in exactly one window
			const totalSessions = windowA!.sessionIds.length + windowB!.sessionIds.length;
			expect(totalSessions).toBe(1);
			expect(windowB?.sessionIds).toEqual(['session-x']);
		});
	});
});
