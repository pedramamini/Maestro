/**
 * Store Instances
 *
 * Manages store instance lifecycle:
 * - Store instance variables (private)
 * - Initialization function
 * - Path caching
 *
 * The actual getter functions are in getters.ts to keep this file focused
 * on initialization logic only.
 */

import { app } from 'electron';
import Store from 'electron-store';

import type {
	BootstrapSettings,
	MaestroSettings,
	SessionsData,
	GroupsData,
	AgentConfigsData,
	WindowState,
	MultiWindowStoreData,
	MultiWindowWindowState,
	ClaudeSessionOriginsData,
	AgentSessionOriginsData,
} from './types';

import {
	SETTINGS_DEFAULTS,
	SESSIONS_DEFAULTS,
	GROUPS_DEFAULTS,
	AGENT_CONFIGS_DEFAULTS,
	WINDOW_STATE_DEFAULTS,
	MULTI_WINDOW_STATE_DEFAULTS,
	MULTI_WINDOW_SCHEMA_VERSION,
	CLAUDE_SESSION_ORIGINS_DEFAULTS,
	AGENT_SESSION_ORIGINS_DEFAULTS,
} from './defaults';

import { getCustomSyncPath } from './utils';

// ============================================================================
// Store Instance Variables
// ============================================================================

let _bootstrapStore: Store<BootstrapSettings> | null = null;
let _settingsStore: Store<MaestroSettings> | null = null;
let _sessionsStore: Store<SessionsData> | null = null;
let _groupsStore: Store<GroupsData> | null = null;
let _agentConfigsStore: Store<AgentConfigsData> | null = null;
let _windowStateStore: Store<WindowState> | null = null;
let _multiWindowStateStore: Store<MultiWindowStoreData> | null = null;
let _claudeSessionOriginsStore: Store<ClaudeSessionOriginsData> | null = null;
let _agentSessionOriginsStore: Store<AgentSessionOriginsData> | null = null;

// Cached paths after initialization
let _syncPath: string | null = null;
let _productionDataPath: string | null = null;

// ============================================================================
// Initialization
// ============================================================================

export interface StoreInitOptions {
	/** The production userData path (before any dev mode modifications) */
	productionDataPath: string;
}

/**
 * Initialize all stores. Must be called once during app startup,
 * after app.setPath('userData', ...) has been configured.
 *
 * @returns Object containing syncPath and bootstrapStore for further initialization
 */
export function initializeStores(options: StoreInitOptions): {
	syncPath: string;
	bootstrapStore: Store<BootstrapSettings>;
} {
	const { productionDataPath } = options;
	_productionDataPath = productionDataPath;

	// 1. Initialize bootstrap store first (determines sync path)
	_bootstrapStore = new Store<BootstrapSettings>({
		name: 'maestro-bootstrap',
		cwd: app.getPath('userData'),
		defaults: {},
	});

	// 2. Determine sync path
	_syncPath = getCustomSyncPath(_bootstrapStore) || app.getPath('userData');

	// Log paths for debugging
	console.log(`[STARTUP] userData path: ${app.getPath('userData')}`);
	console.log(`[STARTUP] syncPath (sessions/settings): ${_syncPath}`);
	console.log(`[STARTUP] productionDataPath (agent configs): ${_productionDataPath}`);

	// 3. Initialize all other stores
	_settingsStore = new Store<MaestroSettings>({
		name: 'maestro-settings',
		cwd: _syncPath,
		defaults: SETTINGS_DEFAULTS,
	});

	_sessionsStore = new Store<SessionsData>({
		name: 'maestro-sessions',
		cwd: _syncPath,
		defaults: SESSIONS_DEFAULTS,
	});

	_groupsStore = new Store<GroupsData>({
		name: 'maestro-groups',
		cwd: _syncPath,
		defaults: GROUPS_DEFAULTS,
	});

	// Agent configs are ALWAYS stored in the production path, even in dev mode
	// This ensures agent paths, custom args, and env vars are shared between dev and prod
	_agentConfigsStore = new Store<AgentConfigsData>({
		name: 'maestro-agent-configs',
		cwd: _productionDataPath,
		defaults: AGENT_CONFIGS_DEFAULTS,
	});

	// Window state is intentionally NOT synced - it's per-device
	// This is the legacy single-window store, kept for migration
	_windowStateStore = new Store<WindowState>({
		name: 'maestro-window-state',
		defaults: WINDOW_STATE_DEFAULTS,
	});

	// Multi-window state store with migration from legacy single-window format
	_multiWindowStateStore = new Store<MultiWindowStoreData>({
		name: 'maestro-multi-window-state',
		defaults: MULTI_WINDOW_STATE_DEFAULTS,
	});

	// Perform migration from legacy single-window state if needed
	// Pass sessions store to include all existing sessions in the migrated primary window
	migrateFromLegacyWindowState(_windowStateStore, _multiWindowStateStore, _sessionsStore);

	// Claude session origins - tracks which sessions were created by Maestro
	_claudeSessionOriginsStore = new Store<ClaudeSessionOriginsData>({
		name: 'maestro-claude-session-origins',
		cwd: _syncPath,
		defaults: CLAUDE_SESSION_ORIGINS_DEFAULTS,
	});

	// Generic agent session origins - supports all agents (Codex, OpenCode, etc.)
	_agentSessionOriginsStore = new Store<AgentSessionOriginsData>({
		name: 'maestro-agent-session-origins',
		cwd: _syncPath,
		defaults: AGENT_SESSION_ORIGINS_DEFAULTS,
	});

	return {
		syncPath: _syncPath,
		bootstrapStore: _bootstrapStore,
	};
}

// ============================================================================
// Internal Accessors (used by getters.ts)
// ============================================================================

/** Check if stores have been initialized */
export function isInitialized(): boolean {
	return _settingsStore !== null;
}

/** Get raw store instances (for getters.ts) */
export function getStoreInstances() {
	return {
		bootstrapStore: _bootstrapStore,
		settingsStore: _settingsStore,
		sessionsStore: _sessionsStore,
		groupsStore: _groupsStore,
		agentConfigsStore: _agentConfigsStore,
		windowStateStore: _windowStateStore,
		multiWindowStateStore: _multiWindowStateStore,
		claudeSessionOriginsStore: _claudeSessionOriginsStore,
		agentSessionOriginsStore: _agentSessionOriginsStore,
	};
}

// ============================================================================
// Migration Functions
// ============================================================================

/**
 * Migrate from legacy single-window state to multi-window state.
 *
 * This migration runs on every startup but only performs work if:
 * 1. The multi-window store is empty or uninitialized
 * 2. The legacy window state store has data
 *
 * The legacy data is preserved (not deleted) for rollback safety.
 *
 * @param legacyStore - The legacy single-window state store
 * @param multiStore - The new multi-window state store
 * @param sessionsStore - Optional sessions store to retrieve existing session IDs
 * @returns true if migration was performed, false otherwise
 */
export function migrateFromLegacyWindowState(
	legacyStore: Store<WindowState>,
	multiStore: Store<MultiWindowStoreData>,
	sessionsStore?: Store<SessionsData>
): boolean {
	// Check if multi-window store already has data
	const existingWindows = multiStore.get('windows', []);
	const existingVersion = multiStore.get('version', 0);

	// If multi-window store already has windows, no migration needed
	if (existingWindows.length > 0 || existingVersion === MULTI_WINDOW_SCHEMA_VERSION) {
		return false;
	}

	// Check if legacy store has meaningful data
	const legacyWidth = legacyStore.get('width');
	const legacyHeight = legacyStore.get('height');

	// If legacy store is just defaults with no actual saved position, skip migration
	// We detect this by checking if x/y are undefined (never saved)
	const legacyX = legacyStore.get('x');
	const legacyY = legacyStore.get('y');

	if (legacyX === undefined && legacyY === undefined) {
		// No saved position data - just set version and return
		multiStore.set('version', MULTI_WINDOW_SCHEMA_VERSION);
		console.log('[MIGRATION] No legacy window state to migrate (first run or defaults only)');
		return false;
	}

	// Generate a window ID for the migrated primary window
	const primaryWindowId = 'primary-' + Date.now().toString(36);

	// Get all existing session IDs from the sessions store
	// In the old single-window model, all sessions belonged to the single window
	let sessionIds: string[] = [];
	let activeSessionId: string | undefined;

	if (sessionsStore) {
		const sessions = sessionsStore.get('sessions', []);
		// Filter out any sessions without valid IDs (defensive coding)
		sessionIds = sessions
			.filter((s: { id?: string }) => typeof s?.id === 'string' && s.id.length > 0)
			.map((s: { id: string }) => s.id);
		// Set the first session as active (reasonable default for migration)
		if (sessionIds.length > 0) {
			activeSessionId = sessionIds[0];
		}
	}

	// Create migrated window state
	const migratedWindow: MultiWindowWindowState = {
		id: primaryWindowId,
		x: legacyX ?? 0,
		y: legacyY ?? 0,
		width: legacyWidth ?? WINDOW_STATE_DEFAULTS.width,
		height: legacyHeight ?? WINDOW_STATE_DEFAULTS.height,
		isMaximized: legacyStore.get('isMaximized', false),
		isFullScreen: legacyStore.get('isFullScreen', false),
		sessionIds,
		activeSessionId,
		leftPanelCollapsed: false,
		rightPanelCollapsed: false,
	};

	// Save migrated state
	multiStore.set({
		windows: [migratedWindow],
		primaryWindowId,
		version: MULTI_WINDOW_SCHEMA_VERSION,
	});

	console.log(
		`[MIGRATION] Migrated legacy window state to multi-window format (primary: ${primaryWindowId}, sessions: ${sessionIds.length})`
	);
	return true;
}

/** Get cached paths (for getters.ts) */
export function getCachedPaths() {
	return {
		syncPath: _syncPath,
		productionDataPath: _productionDataPath,
	};
}
