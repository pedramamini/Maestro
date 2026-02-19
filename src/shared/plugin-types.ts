/**
 * Plugin System Types
 *
 * Type definitions for the Maestro plugin system.
 * Plugins are discovered from userData/plugins/ and registered at startup.
 */

// ============================================================================
// Plugin Manifest Types
// ============================================================================

/**
 * Permissions a plugin can request.
 * Each permission grants access to specific Maestro capabilities.
 * 'middleware' is included in the type system but deferred to v2 implementation.
 */
export type PluginPermission =
	| 'process:read'
	| 'process:write'
	| 'stats:read'
	| 'settings:read'
	| 'settings:write'
	| 'notifications'
	| 'network'
	| 'storage'
	| 'middleware';

/**
 * All known plugin permissions for validation.
 */
export const KNOWN_PERMISSIONS: readonly PluginPermission[] = [
	'process:read',
	'process:write',
	'stats:read',
	'settings:read',
	'settings:write',
	'notifications',
	'network',
	'storage',
	'middleware',
] as const;

/**
 * Definition for a tab a plugin can register in the Right Bar.
 */
export interface PluginTabDefinition {
	id: string;
	label: string;
	icon?: string;
}

/**
 * UI surface registrations for a plugin.
 */
export interface PluginUIConfig {
	rightPanelTabs?: PluginTabDefinition[];
	settingsSection?: boolean;
	floatingPanel?: boolean;
}

/**
 * A configurable setting that a plugin exposes.
 */
export interface PluginSettingDefinition {
	key: string;
	type: 'boolean' | 'string' | 'number' | 'select';
	label: string;
	default: unknown;
	options?: { label: string; value: unknown }[];
}

/**
 * Plugin manifest describing a plugin's metadata, entry points, and capabilities.
 * Modeled after the marketplace manifest pattern from marketplace-types.ts.
 */
export interface PluginManifest {
	/** Unique slug identifier (lowercase alphanumeric + hyphens, e.g., "agent-dashboard") */
	id: string;
	/** Display name */
	name: string;
	/** Semver version string */
	version: string;
	/** Short description */
	description: string;
	/** Plugin author name */
	author: string;
	/** Optional URL to author's website/profile */
	authorLink?: string;
	/** Minimum Maestro version required for compatibility */
	minMaestroVersion?: string;
	/** Main process entry point file relative to plugin dir (e.g., "index.js") */
	main: string;
	/** Optional renderer process entry point (e.g., "renderer.js") */
	renderer?: string;
	/** Declared permissions the plugin needs */
	permissions: PluginPermission[];
	/** UI surface registrations */
	ui?: PluginUIConfig;
	/** Configurable settings schema */
	settings?: PluginSettingDefinition[];
	/** Searchable keyword tags */
	tags?: string[];
}

// ============================================================================
// Plugin State Types
// ============================================================================

/**
 * Lifecycle state of a plugin.
 * - discovered: manifest read and validated, not yet activated
 * - loaded: code loaded into memory
 * - active: running and providing functionality
 * - error: failed to load or activate
 * - disabled: manually disabled by user
 */
export type PluginState = 'discovered' | 'loaded' | 'active' | 'error' | 'disabled';

/**
 * A plugin that has been discovered and loaded (or failed to load).
 */
export interface LoadedPlugin {
	/** The plugin's manifest */
	manifest: PluginManifest;
	/** Current lifecycle state */
	state: PluginState;
	/** Absolute path to the plugin directory */
	path: string;
	/** Error message if state is 'error' */
	error?: string;
}
