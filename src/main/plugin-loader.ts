/**
 * Plugin Discovery and Loader
 *
 * Discovers plugins from the userData/plugins/ directory, reads and validates
 * their manifest.json files, and returns LoadedPlugin objects.
 *
 * Plugins with invalid manifests are returned with state 'error' rather than
 * throwing, so that other plugins can still load.
 */

import fs from 'fs/promises';
import path from 'path';
import type { App } from 'electron';
import { logger } from './utils/logger';
import type { PluginManifest, LoadedPlugin } from '../shared/plugin-types';
import { KNOWN_PERMISSIONS } from '../shared/plugin-types';

const LOG_CONTEXT = '[Plugins]';

/**
 * Valid slug pattern: lowercase alphanumeric and hyphens only.
 */
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Returns the plugins directory path under userData.
 */
export function getPluginsDir(app: App): string {
	return path.join(app.getPath('userData'), 'plugins');
}

/**
 * Type guard that validates an unknown value is a valid PluginManifest.
 * Checks required fields, slug format, and permissions.
 * Logs warnings for unknown fields (forward compatibility).
 */
export function validateManifest(manifest: unknown): manifest is PluginManifest {
	if (!manifest || typeof manifest !== 'object') {
		return false;
	}

	const obj = manifest as Record<string, unknown>;

	// Required string fields
	const requiredStrings = ['id', 'name', 'version', 'description', 'author', 'main'] as const;
	for (const field of requiredStrings) {
		if (typeof obj[field] !== 'string' || (obj[field] as string).trim() === '') {
			logger.debug(`Manifest validation failed: missing or empty required field '${field}'`, LOG_CONTEXT);
			return false;
		}
	}

	// Validate id is a valid slug
	if (!SLUG_REGEX.test(obj.id as string)) {
		logger.debug(`Manifest validation failed: invalid slug format for id '${obj.id}'`, LOG_CONTEXT);
		return false;
	}

	// Validate permissions array
	if (!Array.isArray(obj.permissions)) {
		logger.debug('Manifest validation failed: permissions must be an array', LOG_CONTEXT);
		return false;
	}

	const knownSet = new Set<string>(KNOWN_PERMISSIONS);
	for (const perm of obj.permissions) {
		if (typeof perm !== 'string' || !knownSet.has(perm)) {
			logger.debug(`Manifest validation failed: unknown permission '${perm}'`, LOG_CONTEXT);
			return false;
		}
	}

	// Log warnings for unknown top-level fields (forward compatibility)
	const knownFields = new Set([
		'id', 'name', 'version', 'description', 'author', 'authorLink',
		'minMaestroVersion', 'main', 'renderer', 'permissions', 'ui',
		'settings', 'tags', 'firstParty',
	]);
	for (const key of Object.keys(obj)) {
		if (!knownFields.has(key)) {
			logger.debug(`Manifest contains unknown field '${key}' (ignored for forward compatibility)`, LOG_CONTEXT);
		}
	}

	return true;
}

/**
 * Loads a single plugin from a directory path.
 * Reads manifest.json, validates it, and returns a LoadedPlugin.
 * On validation failure, returns a LoadedPlugin with state 'error'.
 */
export async function loadPlugin(pluginPath: string): Promise<LoadedPlugin> {
	const manifestPath = path.join(pluginPath, 'manifest.json');

	// Create a minimal error manifest for failure cases
	const errorPlugin = (error: string): LoadedPlugin => ({
		manifest: {
			id: path.basename(pluginPath),
			name: path.basename(pluginPath),
			version: '0.0.0',
			description: '',
			author: '',
			main: '',
			permissions: [],
		},
		state: 'error',
		path: pluginPath,
		error,
	});

	let raw: string;
	try {
		raw = await fs.readFile(manifestPath, 'utf-8');
	} catch (err) {
		const message = `Failed to read manifest.json: ${err instanceof Error ? err.message : String(err)}`;
		logger.warn(message, LOG_CONTEXT, { pluginPath });
		return errorPlugin(message);
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (err) {
		const message = `Invalid JSON in manifest.json: ${err instanceof Error ? err.message : String(err)}`;
		logger.warn(message, LOG_CONTEXT, { pluginPath });
		return errorPlugin(message);
	}

	if (!validateManifest(parsed)) {
		const message = 'Manifest validation failed: check required fields, id format, and permissions';
		logger.warn(message, LOG_CONTEXT, { pluginPath });
		return errorPlugin(message);
	}

	// Attempt to load README.md if present
	let readme: string | undefined;
	try {
		readme = await fs.readFile(path.join(pluginPath, 'README.md'), 'utf-8');
	} catch {
		// No README — that's fine
	}

	return {
		manifest: parsed,
		state: 'discovered',
		path: pluginPath,
		readme,
	};
}

/**
 * Copies bundled first-party plugins from src/plugins/ to userData/plugins/.
 * Only copies if the plugin doesn't already exist in userData (preserves user modifications).
 * On version mismatch, overwrites with the bundled version (first-party plugins are always updated).
 */
export async function bootstrapBundledPlugins(pluginsDir: string): Promise<void> {
	// Resolve bundled plugins directory relative to the app root
	// In dev: src/plugins/  In production: resources/plugins/ (if packaged)
	const bundledDir = path.join(__dirname, '..', 'plugins');

	let bundledEntries: string[];
	try {
		bundledEntries = await fs.readdir(bundledDir);
	} catch {
		// No bundled plugins directory — this is fine in some build configurations
		logger.debug('No bundled plugins directory found, skipping bootstrap', LOG_CONTEXT);
		return;
	}

	await fs.mkdir(pluginsDir, { recursive: true });

	// Clean up deprecated/renamed plugin directories
	const deprecatedPlugins = ['agent-dashboard'];
	for (const oldId of deprecatedPlugins) {
		const oldPath = path.join(pluginsDir, oldId);
		try {
			await fs.rm(oldPath, { recursive: true, force: true });
			logger.info(`Removed deprecated plugin directory '${oldId}'`, LOG_CONTEXT);
		} catch {
			// Doesn't exist or already removed — fine
		}
	}

	for (const entry of bundledEntries) {
		const srcPath = path.join(bundledDir, entry);
		const destPath = path.join(pluginsDir, entry);

		try {
			const stat = await fs.stat(srcPath);
			if (!stat.isDirectory()) continue;

			// Check if bundled plugin has a valid manifest
			const srcManifestPath = path.join(srcPath, 'manifest.json');
			let srcManifestRaw: string;
			try {
				srcManifestRaw = await fs.readFile(srcManifestPath, 'utf-8');
			} catch {
				continue; // Skip entries without manifest.json
			}

			const srcManifest = JSON.parse(srcManifestRaw);

			// Check if destination already exists
			let shouldCopy = false;
			try {
				const destManifestPath = path.join(destPath, 'manifest.json');
				const destManifestRaw = await fs.readFile(destManifestPath, 'utf-8');
				const destManifest = JSON.parse(destManifestRaw);
				// Overwrite if version differs (update bundled plugins)
				if (destManifest.version !== srcManifest.version) {
					shouldCopy = true;
					logger.info(`Updating bundled plugin '${entry}' from v${destManifest.version} to v${srcManifest.version}`, LOG_CONTEXT);
				}
			} catch {
				// Destination doesn't exist or has invalid manifest — copy it
				shouldCopy = true;
				logger.info(`Installing bundled plugin '${entry}' v${srcManifest.version}`, LOG_CONTEXT);
			}

			if (shouldCopy) {
				// Remove existing destination if it exists
				await fs.rm(destPath, { recursive: true, force: true });
				await fs.mkdir(destPath, { recursive: true });

				// Copy all files from source to destination
				const files = await fs.readdir(srcPath);
				for (const file of files) {
					await fs.copyFile(path.join(srcPath, file), path.join(destPath, file));
				}
			}
		} catch (err) {
			logger.warn(`Failed to bootstrap bundled plugin '${entry}': ${err instanceof Error ? err.message : String(err)}`, LOG_CONTEXT);
		}
	}
}

/**
 * Scans the plugins directory for subdirectories and loads each one.
 * Creates the plugins directory if it doesn't exist.
 * Non-directory entries are skipped.
 */
export async function discoverPlugins(pluginsDir: string): Promise<LoadedPlugin[]> {
	// Ensure plugins directory exists
	await fs.mkdir(pluginsDir, { recursive: true });

	let entries: string[];
	try {
		entries = await fs.readdir(pluginsDir);
	} catch (err) {
		logger.error(`Failed to read plugins directory: ${err instanceof Error ? err.message : String(err)}`, LOG_CONTEXT);
		return [];
	}

	const plugins: LoadedPlugin[] = [];

	for (const entry of entries) {
		const entryPath = path.join(pluginsDir, entry);

		try {
			const stat = await fs.stat(entryPath);
			if (!stat.isDirectory()) {
				continue;
			}
		} catch {
			continue;
		}

		const plugin = await loadPlugin(entryPath);
		plugins.push(plugin);
	}

	logger.info(`Discovered ${plugins.length} plugin(s) in ${pluginsDir}`, LOG_CONTEXT);
	return plugins;
}
