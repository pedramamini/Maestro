/**
 * Tests for Plugin Manifest Validation and Discovery
 *
 * Covers:
 * - validateManifest() type guard
 * - discoverPlugins() directory scanning
 * - loadPlugin() manifest reading
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';

// Mock electron
vi.mock('electron', () => ({
	ipcMain: { handle: vi.fn() },
	app: { getPath: vi.fn(() => '/mock/userData') },
}));

// Mock logger
vi.mock('../../main/utils/logger', () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}));

// Mock fs/promises
const mockReadFile = vi.fn();
const mockReaddir = vi.fn();
const mockStat = vi.fn();
const mockMkdir = vi.fn();

vi.mock('fs/promises', () => ({
	default: {
		readFile: (...args: unknown[]) => mockReadFile(...args),
		readdir: (...args: unknown[]) => mockReaddir(...args),
		stat: (...args: unknown[]) => mockStat(...args),
		mkdir: (...args: unknown[]) => mockMkdir(...args),
	},
	readFile: (...args: unknown[]) => mockReadFile(...args),
	readdir: (...args: unknown[]) => mockReaddir(...args),
	stat: (...args: unknown[]) => mockStat(...args),
	mkdir: (...args: unknown[]) => mockMkdir(...args),
}));

import { validateManifest, discoverPlugins, loadPlugin } from '../../main/plugin-loader';

/**
 * Helper to create a valid manifest object for testing.
 */
function validManifest(overrides: Record<string, unknown> = {}) {
	return {
		id: 'test-plugin',
		name: 'Test Plugin',
		version: '1.0.0',
		description: 'A test plugin',
		author: 'Test Author',
		main: 'index.js',
		permissions: ['stats:read'],
		...overrides,
	};
}

describe('validateManifest', () => {
	it('accepts a valid manifest', () => {
		expect(validateManifest(validManifest())).toBe(true);
	});

	it('accepts a valid manifest with all optional fields', () => {
		const manifest = validManifest({
			authorLink: 'https://example.com',
			minMaestroVersion: '1.0.0',
			renderer: 'renderer.js',
			ui: { rightPanelTabs: [{ id: 'tab1', label: 'Tab 1' }], settingsSection: true },
			settings: [{ key: 'enabled', type: 'boolean', label: 'Enabled', default: true }],
			tags: ['dashboard', 'monitoring'],
		});
		expect(validateManifest(manifest)).toBe(true);
	});

	it('rejects null', () => {
		expect(validateManifest(null)).toBe(false);
	});

	it('rejects non-object', () => {
		expect(validateManifest('string')).toBe(false);
	});

	it('rejects manifest missing required field: id', () => {
		const { id, ...rest } = validManifest();
		expect(validateManifest(rest)).toBe(false);
	});

	it('rejects manifest missing required field: name', () => {
		const { name, ...rest } = validManifest();
		expect(validateManifest(rest)).toBe(false);
	});

	it('rejects manifest missing required field: version', () => {
		const { version, ...rest } = validManifest();
		expect(validateManifest(rest)).toBe(false);
	});

	it('rejects manifest missing required field: description', () => {
		const { description, ...rest } = validManifest();
		expect(validateManifest(rest)).toBe(false);
	});

	it('rejects manifest missing required field: author', () => {
		const { author, ...rest } = validManifest();
		expect(validateManifest(rest)).toBe(false);
	});

	it('rejects manifest missing required field: main', () => {
		const { main, ...rest } = validManifest();
		expect(validateManifest(rest)).toBe(false);
	});

	it('rejects manifest with empty string for required field', () => {
		expect(validateManifest(validManifest({ id: '' }))).toBe(false);
		expect(validateManifest(validManifest({ name: '  ' }))).toBe(false);
	});

	it('rejects manifest with invalid slug format (uppercase)', () => {
		expect(validateManifest(validManifest({ id: 'TestPlugin' }))).toBe(false);
	});

	it('rejects manifest with invalid slug format (spaces)', () => {
		expect(validateManifest(validManifest({ id: 'test plugin' }))).toBe(false);
	});

	it('rejects manifest with invalid slug format (underscores)', () => {
		expect(validateManifest(validManifest({ id: 'test_plugin' }))).toBe(false);
	});

	it('rejects manifest with invalid slug format (leading hyphen)', () => {
		expect(validateManifest(validManifest({ id: '-test' }))).toBe(false);
	});

	it('accepts valid slug formats', () => {
		expect(validateManifest(validManifest({ id: 'my-plugin' }))).toBe(true);
		expect(validateManifest(validManifest({ id: 'plugin123' }))).toBe(true);
		expect(validateManifest(validManifest({ id: 'a' }))).toBe(true);
	});

	it('rejects manifest with missing permissions array', () => {
		const { permissions, ...rest } = validManifest();
		expect(validateManifest(rest)).toBe(false);
	});

	it('rejects manifest with permissions as non-array', () => {
		expect(validateManifest(validManifest({ permissions: 'stats:read' }))).toBe(false);
	});

	it('rejects unknown permissions', () => {
		expect(validateManifest(validManifest({ permissions: ['unknown:perm'] }))).toBe(false);
	});

	it('accepts empty permissions array', () => {
		expect(validateManifest(validManifest({ permissions: [] }))).toBe(true);
	});

	it('accepts all known permissions', () => {
		const allPerms = [
			'process:read', 'process:write', 'stats:read',
			'settings:read', 'settings:write', 'notifications',
			'network', 'storage', 'middleware',
		];
		expect(validateManifest(validManifest({ permissions: allPerms }))).toBe(true);
	});

	it('does not fail on extra unknown fields (forward compatibility)', () => {
		const manifest = validManifest({ futureField: 'some value', anotherField: 42 });
		expect(validateManifest(manifest)).toBe(true);
	});
});

describe('loadPlugin', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('loads a valid plugin as discovered', async () => {
		const manifest = validManifest();
		mockReadFile.mockResolvedValue(JSON.stringify(manifest));

		const result = await loadPlugin('/plugins/test-plugin');

		expect(result.state).toBe('discovered');
		expect(result.manifest.id).toBe('test-plugin');
		expect(result.path).toBe('/plugins/test-plugin');
		expect(result.error).toBeUndefined();
	});

	it('returns error state when manifest.json is missing', async () => {
		mockReadFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

		const result = await loadPlugin('/plugins/broken');

		expect(result.state).toBe('error');
		expect(result.error).toContain('Failed to read manifest.json');
	});

	it('returns error state for invalid JSON', async () => {
		mockReadFile.mockResolvedValue('not valid json {{{');

		const result = await loadPlugin('/plugins/bad-json');

		expect(result.state).toBe('error');
		expect(result.error).toContain('Invalid JSON');
	});

	it('returns error state for manifest that fails validation', async () => {
		mockReadFile.mockResolvedValue(JSON.stringify({ id: 'BAD ID' }));

		const result = await loadPlugin('/plugins/bad-manifest');

		expect(result.state).toBe('error');
		expect(result.error).toContain('validation failed');
	});
});

describe('discoverPlugins', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockMkdir.mockResolvedValue(undefined);
	});

	it('returns empty array for empty directory', async () => {
		mockReaddir.mockResolvedValue([]);

		const result = await discoverPlugins('/plugins');

		expect(result).toEqual([]);
	});

	it('discovers valid plugins from subdirectories', async () => {
		mockReaddir.mockResolvedValue(['plugin-a', 'plugin-b']);
		mockStat.mockResolvedValue({ isDirectory: () => true });
		mockReadFile.mockImplementation((filePath: string) => {
			if (filePath.includes('plugin-a')) {
				return Promise.resolve(JSON.stringify(validManifest({ id: 'plugin-a' })));
			}
			return Promise.resolve(JSON.stringify(validManifest({ id: 'plugin-b' })));
		});

		const result = await discoverPlugins('/plugins');

		expect(result).toHaveLength(2);
		expect(result[0].state).toBe('discovered');
		expect(result[1].state).toBe('discovered');
	});

	it('returns error state for plugins with invalid manifests', async () => {
		mockReaddir.mockResolvedValue(['good-plugin', 'bad-plugin']);
		mockStat.mockResolvedValue({ isDirectory: () => true });
		mockReadFile.mockImplementation((filePath: string) => {
			if (filePath.includes('good-plugin')) {
				return Promise.resolve(JSON.stringify(validManifest({ id: 'good-plugin' })));
			}
			return Promise.resolve('not json');
		});

		const result = await discoverPlugins('/plugins');

		expect(result).toHaveLength(2);
		const good = result.find((p) => p.manifest.id === 'good-plugin');
		const bad = result.find((p) => p.manifest.id !== 'good-plugin');
		expect(good?.state).toBe('discovered');
		expect(bad?.state).toBe('error');
	});

	it('skips non-directory entries', async () => {
		mockReaddir.mockResolvedValue(['file.txt', 'plugin-dir']);
		mockStat.mockImplementation((entryPath: string) => {
			if (entryPath.includes('file.txt')) {
				return Promise.resolve({ isDirectory: () => false });
			}
			return Promise.resolve({ isDirectory: () => true });
		});
		mockReadFile.mockResolvedValue(JSON.stringify(validManifest({ id: 'plugin-dir' })));

		const result = await discoverPlugins('/plugins');

		expect(result).toHaveLength(1);
		expect(result[0].manifest.id).toBe('plugin-dir');
	});

	it('creates the plugins directory if it does not exist', async () => {
		mockReaddir.mockResolvedValue([]);

		await discoverPlugins('/plugins');

		expect(mockMkdir).toHaveBeenCalledWith('/plugins', { recursive: true });
	});
});
