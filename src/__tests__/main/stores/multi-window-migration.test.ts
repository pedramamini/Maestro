/**
 * Tests for multi-window store schema and migration.
 *
 * Tests cover:
 * - MultiWindowStoreData type compatibility
 * - Migration from legacy WindowState to MultiWindowStoreData
 * - Schema version handling
 * - Edge cases in migration
 * - Session ID migration from existing sessions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Store from 'electron-store';

import type {
	WindowState,
	MultiWindowStoreData,
	MultiWindowWindowState,
	SessionsData,
} from '../../../main/stores/types';
import {
	WINDOW_STATE_DEFAULTS,
	MULTI_WINDOW_STATE_DEFAULTS,
	MULTI_WINDOW_SCHEMA_VERSION,
} from '../../../main/stores/defaults';
import { migrateFromLegacyWindowState } from '../../../main/stores/instances';

// Mock electron's app module
vi.mock('electron', () => ({
	app: {
		getPath: vi.fn().mockReturnValue('/mock/user/data'),
	},
}));

describe('MultiWindowStoreData Schema', () => {
	it('should have correct default values', () => {
		expect(MULTI_WINDOW_STATE_DEFAULTS.windows).toEqual([]);
		expect(MULTI_WINDOW_STATE_DEFAULTS.primaryWindowId).toBe('');
		expect(MULTI_WINDOW_STATE_DEFAULTS.version).toBe(MULTI_WINDOW_SCHEMA_VERSION);
	});

	it('should have schema version of 1', () => {
		expect(MULTI_WINDOW_SCHEMA_VERSION).toBe(1);
	});

	it('should allow creating a valid MultiWindowWindowState object', () => {
		const windowState: MultiWindowWindowState = {
			id: 'window-1',
			x: 100,
			y: 200,
			width: 1200,
			height: 800,
			isMaximized: false,
			isFullScreen: false,
			sessionIds: ['session-1', 'session-2'],
			activeSessionId: 'session-1',
			leftPanelCollapsed: false,
			rightPanelCollapsed: true,
		};

		expect(windowState.id).toBe('window-1');
		expect(windowState.x).toBe(100);
		expect(windowState.y).toBe(200);
		expect(windowState.width).toBe(1200);
		expect(windowState.height).toBe(800);
		expect(windowState.isMaximized).toBe(false);
		expect(windowState.isFullScreen).toBe(false);
		expect(windowState.sessionIds).toEqual(['session-1', 'session-2']);
		expect(windowState.activeSessionId).toBe('session-1');
		expect(windowState.leftPanelCollapsed).toBe(false);
		expect(windowState.rightPanelCollapsed).toBe(true);
	});

	it('should allow creating a valid MultiWindowStoreData object', () => {
		const storeData: MultiWindowStoreData = {
			windows: [
				{
					id: 'primary-window',
					x: 0,
					y: 0,
					width: 1400,
					height: 900,
					isMaximized: false,
					isFullScreen: false,
					sessionIds: ['session-1'],
					activeSessionId: 'session-1',
					leftPanelCollapsed: false,
					rightPanelCollapsed: false,
				},
			],
			primaryWindowId: 'primary-window',
			version: 1,
		};

		expect(storeData.windows).toHaveLength(1);
		expect(storeData.primaryWindowId).toBe('primary-window');
		expect(storeData.version).toBe(1);
	});
});

describe('migrateFromLegacyWindowState', () => {
	let mockLegacyStore: {
		get: ReturnType<typeof vi.fn>;
		set: ReturnType<typeof vi.fn>;
	};
	let mockMultiStore: {
		get: ReturnType<typeof vi.fn>;
		set: ReturnType<typeof vi.fn>;
	};
	let mockSessionsStore: {
		get: ReturnType<typeof vi.fn>;
		set: ReturnType<typeof vi.fn>;
	};

	beforeEach(() => {
		// Create mock stores
		mockLegacyStore = {
			get: vi.fn(),
			set: vi.fn(),
		};

		mockMultiStore = {
			get: vi.fn(),
			set: vi.fn(),
		};

		mockSessionsStore = {
			get: vi.fn(),
			set: vi.fn(),
		};

		// Reset console.log mock
		vi.spyOn(console, 'log').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('should skip migration if multi-window store already has windows', () => {
		// Multi-store already has data
		mockMultiStore.get.mockImplementation((key: string, def?: unknown) => {
			if (key === 'windows')
				return [
					{
						id: 'existing-window',
						x: 0,
						y: 0,
						width: 1200,
						height: 800,
						isMaximized: false,
						isFullScreen: false,
						sessionIds: [],
						leftPanelCollapsed: false,
						rightPanelCollapsed: false,
					},
				];
			if (key === 'version') return MULTI_WINDOW_SCHEMA_VERSION;
			return def;
		});

		const result = migrateFromLegacyWindowState(
			mockLegacyStore as unknown as Store<WindowState>,
			mockMultiStore as unknown as Store<MultiWindowStoreData>
		);

		expect(result).toBe(false);
		expect(mockMultiStore.set).not.toHaveBeenCalled();
	});

	it('should skip migration if multi-window store has current version', () => {
		mockMultiStore.get.mockImplementation((key: string, def?: unknown) => {
			if (key === 'windows') return [];
			if (key === 'version') return MULTI_WINDOW_SCHEMA_VERSION;
			return def;
		});

		const result = migrateFromLegacyWindowState(
			mockLegacyStore as unknown as Store<WindowState>,
			mockMultiStore as unknown as Store<MultiWindowStoreData>
		);

		expect(result).toBe(false);
	});

	it('should skip migration and set version if legacy store has no position data', () => {
		// Multi-store is empty
		mockMultiStore.get.mockImplementation((key: string, def?: unknown) => {
			if (key === 'windows') return [];
			if (key === 'version') return 0;
			return def;
		});

		// Legacy store has no position data (x, y are undefined)
		mockLegacyStore.get.mockImplementation((key: string, def?: unknown) => {
			if (key === 'x') return undefined;
			if (key === 'y') return undefined;
			if (key === 'width') return WINDOW_STATE_DEFAULTS.width;
			if (key === 'height') return WINDOW_STATE_DEFAULTS.height;
			return def;
		});

		const result = migrateFromLegacyWindowState(
			mockLegacyStore as unknown as Store<WindowState>,
			mockMultiStore as unknown as Store<MultiWindowStoreData>
		);

		expect(result).toBe(false);
		// Should still set version to indicate migration was checked
		expect(mockMultiStore.set).toHaveBeenCalledWith('version', MULTI_WINDOW_SCHEMA_VERSION);
	});

	it('should migrate legacy window state with position data', () => {
		// Multi-store is empty
		mockMultiStore.get.mockImplementation((key: string, def?: unknown) => {
			if (key === 'windows') return [];
			if (key === 'version') return 0;
			return def;
		});

		// Legacy store has saved position data
		mockLegacyStore.get.mockImplementation((key: string, def?: unknown) => {
			if (key === 'x') return 100;
			if (key === 'y') return 200;
			if (key === 'width') return 1600;
			if (key === 'height') return 1000;
			if (key === 'isMaximized') return true;
			if (key === 'isFullScreen') return false;
			return def;
		});

		const result = migrateFromLegacyWindowState(
			mockLegacyStore as unknown as Store<WindowState>,
			mockMultiStore as unknown as Store<MultiWindowStoreData>
		);

		expect(result).toBe(true);
		expect(mockMultiStore.set).toHaveBeenCalledWith(
			expect.objectContaining({
				windows: expect.arrayContaining([
					expect.objectContaining({
						x: 100,
						y: 200,
						width: 1600,
						height: 1000,
						isMaximized: true,
						isFullScreen: false,
						sessionIds: [],
						activeSessionId: undefined,
						leftPanelCollapsed: false,
						rightPanelCollapsed: false,
					}),
				]),
				version: MULTI_WINDOW_SCHEMA_VERSION,
			})
		);
	});

	it('should generate a primary window ID during migration', () => {
		mockMultiStore.get.mockImplementation((key: string, def?: unknown) => {
			if (key === 'windows') return [];
			if (key === 'version') return 0;
			return def;
		});

		mockLegacyStore.get.mockImplementation((key: string, def?: unknown) => {
			if (key === 'x') return 50;
			if (key === 'y') return 50;
			if (key === 'width') return 1400;
			if (key === 'height') return 900;
			if (key === 'isMaximized') return false;
			if (key === 'isFullScreen') return false;
			return def;
		});

		const result = migrateFromLegacyWindowState(
			mockLegacyStore as unknown as Store<WindowState>,
			mockMultiStore as unknown as Store<MultiWindowStoreData>
		);

		expect(result).toBe(true);

		const setCall = mockMultiStore.set.mock.calls[0][0] as MultiWindowStoreData;
		expect(setCall.primaryWindowId).toMatch(/^primary-/);
		expect(setCall.windows[0].id).toBe(setCall.primaryWindowId);
	});

	it('should use default dimensions if legacy store has undefined width/height', () => {
		mockMultiStore.get.mockImplementation((key: string, def?: unknown) => {
			if (key === 'windows') return [];
			if (key === 'version') return 0;
			return def;
		});

		mockLegacyStore.get.mockImplementation((key: string, def?: unknown) => {
			if (key === 'x') return 0;
			if (key === 'y') return 0;
			if (key === 'width') return undefined;
			if (key === 'height') return undefined;
			if (key === 'isMaximized') return false;
			if (key === 'isFullScreen') return false;
			return def;
		});

		migrateFromLegacyWindowState(
			mockLegacyStore as unknown as Store<WindowState>,
			mockMultiStore as unknown as Store<MultiWindowStoreData>
		);

		const setCall = mockMultiStore.set.mock.calls[0][0] as MultiWindowStoreData;
		expect(setCall.windows[0].width).toBe(WINDOW_STATE_DEFAULTS.width);
		expect(setCall.windows[0].height).toBe(WINDOW_STATE_DEFAULTS.height);
	});

	it('should handle full-screen state during migration', () => {
		mockMultiStore.get.mockImplementation((key: string, def?: unknown) => {
			if (key === 'windows') return [];
			if (key === 'version') return 0;
			return def;
		});

		mockLegacyStore.get.mockImplementation((key: string, def?: unknown) => {
			if (key === 'x') return 0;
			if (key === 'y') return 0;
			if (key === 'width') return 1920;
			if (key === 'height') return 1080;
			if (key === 'isMaximized') return false;
			if (key === 'isFullScreen') return true;
			return def;
		});

		migrateFromLegacyWindowState(
			mockLegacyStore as unknown as Store<WindowState>,
			mockMultiStore as unknown as Store<MultiWindowStoreData>
		);

		const setCall = mockMultiStore.set.mock.calls[0][0] as MultiWindowStoreData;
		expect(setCall.windows[0].isFullScreen).toBe(true);
		expect(setCall.windows[0].isMaximized).toBe(false);
	});

	it('should migrate legacy window state with all existing sessions', () => {
		// Multi-store is empty
		mockMultiStore.get.mockImplementation((key: string, def?: unknown) => {
			if (key === 'windows') return [];
			if (key === 'version') return 0;
			return def;
		});

		// Legacy store has saved position data
		mockLegacyStore.get.mockImplementation((key: string, def?: unknown) => {
			if (key === 'x') return 100;
			if (key === 'y') return 200;
			if (key === 'width') return 1600;
			if (key === 'height') return 1000;
			if (key === 'isMaximized') return false;
			if (key === 'isFullScreen') return false;
			return def;
		});

		// Sessions store has existing sessions
		mockSessionsStore.get.mockImplementation((key: string, def?: unknown) => {
			if (key === 'sessions') {
				return [
					{ id: 'session-1', name: 'Session 1' },
					{ id: 'session-2', name: 'Session 2' },
					{ id: 'session-3', name: 'Session 3' },
				];
			}
			return def;
		});

		const result = migrateFromLegacyWindowState(
			mockLegacyStore as unknown as Store<WindowState>,
			mockMultiStore as unknown as Store<MultiWindowStoreData>,
			mockSessionsStore as unknown as Store<SessionsData>
		);

		expect(result).toBe(true);

		const setCall = mockMultiStore.set.mock.calls[0][0] as MultiWindowStoreData;
		expect(setCall.windows[0].sessionIds).toEqual(['session-1', 'session-2', 'session-3']);
		expect(setCall.windows[0].activeSessionId).toBe('session-1');
	});

	it('should set first session as active during migration with sessions', () => {
		mockMultiStore.get.mockImplementation((key: string, def?: unknown) => {
			if (key === 'windows') return [];
			if (key === 'version') return 0;
			return def;
		});

		mockLegacyStore.get.mockImplementation((key: string, def?: unknown) => {
			if (key === 'x') return 50;
			if (key === 'y') return 50;
			if (key === 'width') return 1400;
			if (key === 'height') return 900;
			if (key === 'isMaximized') return false;
			if (key === 'isFullScreen') return false;
			return def;
		});

		mockSessionsStore.get.mockImplementation((key: string, def?: unknown) => {
			if (key === 'sessions') {
				return [
					{ id: 'first-session', name: 'First' },
					{ id: 'second-session', name: 'Second' },
				];
			}
			return def;
		});

		migrateFromLegacyWindowState(
			mockLegacyStore as unknown as Store<WindowState>,
			mockMultiStore as unknown as Store<MultiWindowStoreData>,
			mockSessionsStore as unknown as Store<SessionsData>
		);

		const setCall = mockMultiStore.set.mock.calls[0][0] as MultiWindowStoreData;
		expect(setCall.windows[0].activeSessionId).toBe('first-session');
	});

	it('should handle empty sessions store during migration', () => {
		mockMultiStore.get.mockImplementation((key: string, def?: unknown) => {
			if (key === 'windows') return [];
			if (key === 'version') return 0;
			return def;
		});

		mockLegacyStore.get.mockImplementation((key: string, def?: unknown) => {
			if (key === 'x') return 50;
			if (key === 'y') return 50;
			if (key === 'width') return 1400;
			if (key === 'height') return 900;
			if (key === 'isMaximized') return false;
			if (key === 'isFullScreen') return false;
			return def;
		});

		// Sessions store is empty
		mockSessionsStore.get.mockImplementation((key: string, def?: unknown) => {
			if (key === 'sessions') return [];
			return def;
		});

		const result = migrateFromLegacyWindowState(
			mockLegacyStore as unknown as Store<WindowState>,
			mockMultiStore as unknown as Store<MultiWindowStoreData>,
			mockSessionsStore as unknown as Store<SessionsData>
		);

		expect(result).toBe(true);

		const setCall = mockMultiStore.set.mock.calls[0][0] as MultiWindowStoreData;
		expect(setCall.windows[0].sessionIds).toEqual([]);
		expect(setCall.windows[0].activeSessionId).toBeUndefined();
	});

	it('should work without sessions store for backward compatibility', () => {
		mockMultiStore.get.mockImplementation((key: string, def?: unknown) => {
			if (key === 'windows') return [];
			if (key === 'version') return 0;
			return def;
		});

		mockLegacyStore.get.mockImplementation((key: string, def?: unknown) => {
			if (key === 'x') return 100;
			if (key === 'y') return 100;
			if (key === 'width') return 1200;
			if (key === 'height') return 800;
			if (key === 'isMaximized') return false;
			if (key === 'isFullScreen') return false;
			return def;
		});

		// Call without sessions store (backward compatibility)
		const result = migrateFromLegacyWindowState(
			mockLegacyStore as unknown as Store<WindowState>,
			mockMultiStore as unknown as Store<MultiWindowStoreData>
		);

		expect(result).toBe(true);

		const setCall = mockMultiStore.set.mock.calls[0][0] as MultiWindowStoreData;
		expect(setCall.windows[0].sessionIds).toEqual([]);
		expect(setCall.windows[0].activeSessionId).toBeUndefined();
	});

	it('should filter out invalid session IDs during migration', () => {
		mockMultiStore.get.mockImplementation((key: string, def?: unknown) => {
			if (key === 'windows') return [];
			if (key === 'version') return 0;
			return def;
		});

		mockLegacyStore.get.mockImplementation((key: string, def?: unknown) => {
			if (key === 'x') return 100;
			if (key === 'y') return 100;
			if (key === 'width') return 1200;
			if (key === 'height') return 800;
			if (key === 'isMaximized') return false;
			if (key === 'isFullScreen') return false;
			return def;
		});

		// Sessions store with some invalid entries
		mockSessionsStore.get.mockImplementation((key: string, def?: unknown) => {
			if (key === 'sessions') {
				return [
					{ id: 'valid-session-1', name: 'Valid 1' },
					{ id: undefined, name: 'Invalid' }, // undefined id
					{ id: '', name: 'Empty ID' }, // empty string id
					{ name: 'No ID' }, // missing id property
					{ id: 'valid-session-2', name: 'Valid 2' },
					{ id: null, name: 'Null ID' }, // null id
				];
			}
			return def;
		});

		const result = migrateFromLegacyWindowState(
			mockLegacyStore as unknown as Store<WindowState>,
			mockMultiStore as unknown as Store<MultiWindowStoreData>,
			mockSessionsStore as unknown as Store<SessionsData>
		);

		expect(result).toBe(true);

		const setCall = mockMultiStore.set.mock.calls[0][0] as MultiWindowStoreData;
		// Should only contain the two valid session IDs
		expect(setCall.windows[0].sessionIds).toEqual(['valid-session-1', 'valid-session-2']);
		expect(setCall.windows[0].activeSessionId).toBe('valid-session-1');
	});
});
