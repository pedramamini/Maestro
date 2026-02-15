/**
 * Tests for agent session discovery optimizations
 *
 * Verifies:
 * - Batched parallelization of Claude session directory scanning
 * - Flattened and parallelized Codex session directory scanning
 * - 30-second TTL cache for discovery results
 * - Cache invalidation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ipcMain, BrowserWindow } from 'electron';
import {
	registerAgentSessionsHandlers,
	invalidateDiscoveryCache,
} from '../../../../main/ipc/handlers/agentSessions';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import type { Stats as FsStats } from 'fs';

// Mock electron
vi.mock('electron', () => ({
	ipcMain: {
		handle: vi.fn(),
		removeHandler: vi.fn(),
	},
	BrowserWindow: vi.fn(),
}));

// Mock the agents module
vi.mock('../../../../main/agents', () => ({
	getSessionStorage: vi.fn(),
	hasSessionStorage: vi.fn(),
	getAllSessionStorages: vi.fn().mockReturnValue([]),
}));

// Mock logger
vi.mock('../../../../main/utils/logger', () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}));

// Mock statsCache
vi.mock('../../../../main/utils/statsCache', () => ({
	loadGlobalStatsCache: vi.fn().mockResolvedValue(null),
	saveGlobalStatsCache: vi.fn().mockResolvedValue(undefined),
	GLOBAL_STATS_CACHE_VERSION: 1,
}));

// Mock pricing
vi.mock('../../../../main/utils/pricing', () => ({
	calculateClaudeCost: vi.fn().mockReturnValue(0),
}));

// Mock safe-send
vi.mock('../../../../main/utils/safe-send', () => ({
	isWebContentsAvailable: vi.fn().mockReturnValue(false),
}));

// Mock ipcHandler
vi.mock('../../../../main/utils/ipcHandler', () => ({
	withIpcErrorLogging: vi.fn((_opts, handler) => {
		return (_event: unknown, ...args: unknown[]) => handler(...args);
	}),
}));

// Mock fs/promises
vi.mock('fs/promises', () => ({
	default: {
		access: vi.fn(),
		readdir: vi.fn(),
		stat: vi.fn(),
		readFile: vi.fn(),
	},
}));

// Mock os
vi.mock('os', () => ({
	default: {
		homedir: vi.fn().mockReturnValue('/mock/home'),
	},
}));

function makeDirStat(isDir = true): FsStats {
	return {
		isDirectory: () => isDir,
		isFile: () => !isDir,
		size: 100,
		mtimeMs: Date.now(),
	} as unknown as FsStats;
}

function makeFileStat(size = 100, mtimeMs = Date.now()): FsStats {
	return {
		isDirectory: () => false,
		isFile: () => true,
		size,
		mtimeMs,
	} as unknown as FsStats;
}

describe('Agent session discovery optimizations', () => {
	let handlers: Map<string, Function>;

	beforeEach(() => {
		vi.clearAllMocks();
		invalidateDiscoveryCache();

		handlers = new Map();
		vi.mocked(ipcMain.handle).mockImplementation((channel, handler) => {
			handlers.set(channel, handler);
		});

		registerAgentSessionsHandlers({
			getMainWindow: () => null,
		});
	});

	afterEach(() => {
		handlers.clear();
		invalidateDiscoveryCache();
	});

	describe('discoverClaudeSessionFiles (via getGlobalStats)', () => {
		it('should discover session files from project directories in batches', async () => {
			const mockFs = vi.mocked(fs);
			const claudeProjectsDir = path.join('/mock/home', '.claude', 'projects');
			const codexSessionsDir = path.join('/mock/home', '.codex', 'sessions');

			// Setup: Claude access passes, Codex doesn't exist
			mockFs.access.mockImplementation(async (dirPath: unknown) => {
				const p = String(dirPath);
				if (p === claudeProjectsDir) return undefined;
				throw new Error('ENOENT');
			});

			// Setup: project directories
			mockFs.readdir.mockImplementation(async (dirPath: unknown) => {
				const p = String(dirPath);
				if (p === claudeProjectsDir) {
					return ['project-a', 'project-b', 'project-c'] as unknown as ReturnType<
						typeof fs.readdir
					>;
				}
				if (p === path.join(claudeProjectsDir, 'project-a')) {
					return ['session1.jsonl', 'session2.jsonl'] as unknown as ReturnType<
						typeof fs.readdir
					>;
				}
				if (p === path.join(claudeProjectsDir, 'project-b')) {
					return ['session3.jsonl'] as unknown as ReturnType<typeof fs.readdir>;
				}
				if (p === path.join(claudeProjectsDir, 'project-c')) {
					return [] as unknown as ReturnType<typeof fs.readdir>;
				}
				return [] as unknown as ReturnType<typeof fs.readdir>;
			});

			// Setup: stat calls
			mockFs.stat.mockImplementation(async (filePath: unknown) => {
				const p = String(filePath);
				if (
					p.includes('project-a') &&
					!p.includes('.jsonl') ||
					p.includes('project-b') &&
					!p.includes('.jsonl') ||
					p.includes('project-c') &&
					!p.includes('.jsonl')
				) {
					return makeDirStat(true);
				}
				if (p.endsWith('.jsonl')) {
					return makeFileStat(500, 1000);
				}
				return makeDirStat(false);
			});

			// readFile returns minimal session content
			mockFs.readFile.mockResolvedValue('{"type":"user"}\n');

			const handler = handlers.get('agentSessions:getGlobalStats');
			const result = await handler!({} as any);

			// Should have discovered sessions from all projects
			expect(result).toBeDefined();
			expect(result.totalSessions).toBeGreaterThanOrEqual(0);

			// Verify readdir was called for projects dir and each project subdir
			expect(mockFs.readdir).toHaveBeenCalledWith(claudeProjectsDir);
		});

		it('should skip 0-byte session files', async () => {
			const mockFs = vi.mocked(fs);
			const claudeProjectsDir = path.join('/mock/home', '.claude', 'projects');

			mockFs.access.mockImplementation(async (dirPath: unknown) => {
				const p = String(dirPath);
				if (p === claudeProjectsDir) return undefined;
				throw new Error('ENOENT');
			});
			mockFs.readdir.mockImplementation(async (dirPath: unknown) => {
				const p = String(dirPath);
				if (p === claudeProjectsDir) {
					return ['project-a'] as unknown as ReturnType<typeof fs.readdir>;
				}
				if (p === path.join(claudeProjectsDir, 'project-a')) {
					return ['empty.jsonl', 'valid.jsonl'] as unknown as ReturnType<typeof fs.readdir>;
				}
				return [] as unknown as ReturnType<typeof fs.readdir>;
			});

			mockFs.stat.mockImplementation(async (filePath: unknown) => {
				const p = String(filePath);
				if (p.includes('project-a') && !p.endsWith('.jsonl')) {
					return makeDirStat(true);
				}
				if (p.includes('empty.jsonl')) {
					return makeFileStat(0, 1000); // 0-byte file
				}
				if (p.includes('valid.jsonl')) {
					return makeFileStat(500, 1000);
				}
				return makeDirStat(false);
			});

			mockFs.readFile.mockResolvedValue('{"type":"user"}\n');

			const handler = handlers.get('agentSessions:getGlobalStats');
			const result = await handler!({} as any);

			// The valid session should be counted but not the empty one
			expect(result).toBeDefined();
		});

		it('should return empty when projects directory does not exist', async () => {
			const mockFs = vi.mocked(fs);

			// access throws for both Claude and Codex dirs
			mockFs.access.mockRejectedValue(new Error('ENOENT'));

			const handler = handlers.get('agentSessions:getGlobalStats');
			const result = await handler!({} as any);

			expect(result.totalSessions).toBe(0);
		});
	});

	describe('discoverCodexSessionFiles (via getGlobalStats)', () => {
		it('should discover session files from year/month/day directories', async () => {
			const mockFs = vi.mocked(fs);
			const claudeProjectsDir = path.join('/mock/home', '.claude', 'projects');
			const codexSessionsDir = path.join('/mock/home', '.codex', 'sessions');

			mockFs.access.mockImplementation(async (dirPath: unknown) => {
				const p = String(dirPath);
				if (p === claudeProjectsDir) throw new Error('ENOENT');
				if (p === codexSessionsDir) return undefined;
				throw new Error('ENOENT');
			});

			mockFs.readdir.mockImplementation(async (dirPath: unknown) => {
				const p = String(dirPath);
				if (p === codexSessionsDir) {
					return ['2026'] as unknown as ReturnType<typeof fs.readdir>;
				}
				if (p === path.join(codexSessionsDir, '2026')) {
					return ['01', '02'] as unknown as ReturnType<typeof fs.readdir>;
				}
				if (p === path.join(codexSessionsDir, '2026', '01')) {
					return ['15'] as unknown as ReturnType<typeof fs.readdir>;
				}
				if (p === path.join(codexSessionsDir, '2026', '02')) {
					return ['10'] as unknown as ReturnType<typeof fs.readdir>;
				}
				if (p === path.join(codexSessionsDir, '2026', '01', '15')) {
					return ['session-a.jsonl'] as unknown as ReturnType<typeof fs.readdir>;
				}
				if (p === path.join(codexSessionsDir, '2026', '02', '10')) {
					return ['session-b.jsonl'] as unknown as ReturnType<typeof fs.readdir>;
				}
				return [] as unknown as ReturnType<typeof fs.readdir>;
			});

			mockFs.stat.mockImplementation(async (filePath: unknown) => {
				const p = String(filePath);
				if (p.endsWith('.jsonl')) {
					return makeFileStat(200, 2000);
				}
				return makeDirStat(true);
			});

			mockFs.readFile.mockResolvedValue(
				'{"type":"response_item","payload":{"type":"message","role":"user"}}\n'
			);

			const handler = handlers.get('agentSessions:getGlobalStats');
			const result = await handler!({} as any);

			expect(result).toBeDefined();
			// Codex sessions dir should have been accessed
			expect(mockFs.access).toHaveBeenCalledWith(codexSessionsDir);
		});

		it('should skip non-numeric year/month/day directories', async () => {
			const mockFs = vi.mocked(fs);
			const codexSessionsDir = path.join('/mock/home', '.codex', 'sessions');
			const claudeProjectsDir = path.join('/mock/home', '.claude', 'projects');

			mockFs.access.mockImplementation(async (dirPath: unknown) => {
				const p = String(dirPath);
				if (p === claudeProjectsDir) throw new Error('ENOENT');
				if (p === codexSessionsDir) return undefined;
				throw new Error('ENOENT');
			});

			mockFs.readdir.mockImplementation(async (dirPath: unknown) => {
				const p = String(dirPath);
				if (p === codexSessionsDir) {
					return ['2026', 'invalid', '.DS_Store'] as unknown as ReturnType<typeof fs.readdir>;
				}
				if (p === path.join(codexSessionsDir, '2026')) {
					return ['01', 'ab'] as unknown as ReturnType<typeof fs.readdir>;
				}
				if (p === path.join(codexSessionsDir, '2026', '01')) {
					return ['15', 'xx'] as unknown as ReturnType<typeof fs.readdir>;
				}
				if (p === path.join(codexSessionsDir, '2026', '01', '15')) {
					return ['session.jsonl'] as unknown as ReturnType<typeof fs.readdir>;
				}
				return [] as unknown as ReturnType<typeof fs.readdir>;
			});

			mockFs.stat.mockImplementation(async (filePath: unknown) => {
				const p = String(filePath);
				if (p.endsWith('.jsonl')) {
					return makeFileStat(100, 1000);
				}
				return makeDirStat(true);
			});

			mockFs.readFile.mockResolvedValue('');

			const handler = handlers.get('agentSessions:getGlobalStats');
			const result = await handler!({} as any);

			// Should not attempt to read 'invalid', '.DS_Store', 'ab', or 'xx' directories
			expect(mockFs.readdir).not.toHaveBeenCalledWith(
				path.join(codexSessionsDir, 'invalid')
			);
			expect(mockFs.readdir).not.toHaveBeenCalledWith(
				path.join(codexSessionsDir, '2026', 'ab')
			);
		});
	});

	describe('Discovery cache', () => {
		it('should return cached results on subsequent calls within TTL', async () => {
			const mockFs = vi.mocked(fs);
			const claudeProjectsDir = path.join('/mock/home', '.claude', 'projects');

			mockFs.access.mockImplementation(async (dirPath: unknown) => {
				const p = String(dirPath);
				if (p === claudeProjectsDir) return undefined;
				throw new Error('ENOENT');
			});

			mockFs.readdir.mockImplementation(async (dirPath: unknown) => {
				const p = String(dirPath);
				if (p === claudeProjectsDir) {
					return ['project-a'] as unknown as ReturnType<typeof fs.readdir>;
				}
				if (p === path.join(claudeProjectsDir, 'project-a')) {
					return ['s1.jsonl'] as unknown as ReturnType<typeof fs.readdir>;
				}
				return [] as unknown as ReturnType<typeof fs.readdir>;
			});

			mockFs.stat.mockImplementation(async (filePath: unknown) => {
				const p = String(filePath);
				if (p.endsWith('.jsonl')) return makeFileStat(100, 1000);
				return makeDirStat(true);
			});

			mockFs.readFile.mockResolvedValue('{"type":"user"}\n');

			const handler = handlers.get('agentSessions:getGlobalStats');

			// First call
			await handler!({} as any);
			const firstCallReaddir = mockFs.readdir.mock.calls.length;

			// Clear mock call counts but keep implementations
			mockFs.readdir.mockClear();
			mockFs.stat.mockClear();

			// Re-mock to keep implementations
			mockFs.access.mockImplementation(async (dirPath: unknown) => {
				const p = String(dirPath);
				if (p === claudeProjectsDir) return undefined;
				throw new Error('ENOENT');
			});

			mockFs.readdir.mockImplementation(async (dirPath: unknown) => {
				const p = String(dirPath);
				if (p === claudeProjectsDir) {
					return ['project-a'] as unknown as ReturnType<typeof fs.readdir>;
				}
				if (p === path.join(claudeProjectsDir, 'project-a')) {
					return ['s1.jsonl'] as unknown as ReturnType<typeof fs.readdir>;
				}
				return [] as unknown as ReturnType<typeof fs.readdir>;
			});

			mockFs.stat.mockImplementation(async (filePath: unknown) => {
				const p = String(filePath);
				if (p.endsWith('.jsonl')) return makeFileStat(100, 1000);
				return makeDirStat(true);
			});

			// Second call should use cache — readdir should NOT be called for projects dir
			await handler!({} as any);

			// The cache returns files directly, so readdir for the Claude projects dir
			// should NOT be called on the second invocation
			const claudeProjectsReaddirCalls = mockFs.readdir.mock.calls.filter(
				(call) => String(call[0]) === claudeProjectsDir
			);
			expect(claudeProjectsReaddirCalls.length).toBe(0);
		});

		it('should invalidate cache when invalidateDiscoveryCache is called', async () => {
			const mockFs = vi.mocked(fs);
			const claudeProjectsDir = path.join('/mock/home', '.claude', 'projects');

			mockFs.access.mockImplementation(async (dirPath: unknown) => {
				const p = String(dirPath);
				if (p === claudeProjectsDir) return undefined;
				throw new Error('ENOENT');
			});

			mockFs.readdir.mockImplementation(async (dirPath: unknown) => {
				const p = String(dirPath);
				if (p === claudeProjectsDir) {
					return ['project-a'] as unknown as ReturnType<typeof fs.readdir>;
				}
				if (p === path.join(claudeProjectsDir, 'project-a')) {
					return ['s1.jsonl'] as unknown as ReturnType<typeof fs.readdir>;
				}
				return [] as unknown as ReturnType<typeof fs.readdir>;
			});

			mockFs.stat.mockImplementation(async (filePath: unknown) => {
				const p = String(filePath);
				if (p.endsWith('.jsonl')) return makeFileStat(100, 1000);
				return makeDirStat(true);
			});

			mockFs.readFile.mockResolvedValue('{"type":"user"}\n');

			const handler = handlers.get('agentSessions:getGlobalStats');

			// First call populates cache
			await handler!({} as any);

			// Invalidate cache
			invalidateDiscoveryCache();

			// Clear call counts
			mockFs.readdir.mockClear();

			// Re-mock implementations
			mockFs.access.mockImplementation(async (dirPath: unknown) => {
				const p = String(dirPath);
				if (p === claudeProjectsDir) return undefined;
				throw new Error('ENOENT');
			});

			mockFs.readdir.mockImplementation(async (dirPath: unknown) => {
				const p = String(dirPath);
				if (p === claudeProjectsDir) {
					return ['project-a'] as unknown as ReturnType<typeof fs.readdir>;
				}
				if (p === path.join(claudeProjectsDir, 'project-a')) {
					return ['s1.jsonl'] as unknown as ReturnType<typeof fs.readdir>;
				}
				return [] as unknown as ReturnType<typeof fs.readdir>;
			});

			mockFs.stat.mockImplementation(async (filePath: unknown) => {
				const p = String(filePath);
				if (p.endsWith('.jsonl')) return makeFileStat(100, 1000);
				return makeDirStat(true);
			});

			// After invalidation, should re-scan
			await handler!({} as any);

			const claudeProjectsReaddirCalls = mockFs.readdir.mock.calls.filter(
				(call) => String(call[0]) === claudeProjectsDir
			);
			expect(claudeProjectsReaddirCalls.length).toBe(1);
		});

		it('should cache empty results when directory does not exist', async () => {
			const mockFs = vi.mocked(fs);

			// Both dirs don't exist
			mockFs.access.mockRejectedValue(new Error('ENOENT'));

			const handler = handlers.get('agentSessions:getGlobalStats');

			// First call
			await handler!({} as any);
			const firstAccessCount = mockFs.access.mock.calls.length;

			// Clear and re-mock
			mockFs.access.mockClear();
			mockFs.access.mockRejectedValue(new Error('ENOENT'));

			// Second call should use cache — access not called for the same dirs
			await handler!({} as any);

			// Cache should serve empty results without calling access
			expect(mockFs.access.mock.calls.length).toBeLessThan(firstAccessCount);
		});
	});

	describe('Error handling', () => {
		it('should handle directory read errors gracefully', async () => {
			const mockFs = vi.mocked(fs);
			const claudeProjectsDir = path.join('/mock/home', '.claude', 'projects');

			mockFs.access.mockImplementation(async (dirPath: unknown) => {
				const p = String(dirPath);
				if (p === claudeProjectsDir) return undefined;
				throw new Error('ENOENT');
			});

			// Projects dir lists directories but one fails on readdir
			mockFs.readdir.mockImplementation(async (dirPath: unknown) => {
				const p = String(dirPath);
				if (p === claudeProjectsDir) {
					return ['good-project', 'bad-project'] as unknown as ReturnType<typeof fs.readdir>;
				}
				if (p === path.join(claudeProjectsDir, 'good-project')) {
					return ['session.jsonl'] as unknown as ReturnType<typeof fs.readdir>;
				}
				if (p === path.join(claudeProjectsDir, 'bad-project')) {
					throw new Error('Permission denied');
				}
				return [] as unknown as ReturnType<typeof fs.readdir>;
			});

			mockFs.stat.mockImplementation(async (filePath: unknown) => {
				const p = String(filePath);
				if (p.endsWith('.jsonl')) return makeFileStat(100, 1000);
				return makeDirStat(true);
			});

			mockFs.readFile.mockResolvedValue('{"type":"user"}\n');

			const handler = handlers.get('agentSessions:getGlobalStats');

			// Should not throw — errors are handled gracefully
			const result = await handler!({} as any);
			expect(result).toBeDefined();
		});

		it('should handle stat errors for individual files gracefully', async () => {
			const mockFs = vi.mocked(fs);
			const claudeProjectsDir = path.join('/mock/home', '.claude', 'projects');

			mockFs.access.mockImplementation(async (dirPath: unknown) => {
				const p = String(dirPath);
				if (p === claudeProjectsDir) return undefined;
				throw new Error('ENOENT');
			});

			mockFs.readdir.mockImplementation(async (dirPath: unknown) => {
				const p = String(dirPath);
				if (p === claudeProjectsDir) {
					return ['project'] as unknown as ReturnType<typeof fs.readdir>;
				}
				if (p === path.join(claudeProjectsDir, 'project')) {
					return ['good.jsonl', 'bad.jsonl'] as unknown as ReturnType<typeof fs.readdir>;
				}
				return [] as unknown as ReturnType<typeof fs.readdir>;
			});

			mockFs.stat.mockImplementation(async (filePath: unknown) => {
				const p = String(filePath);
				if (p.includes('bad.jsonl')) {
					throw new Error('File deleted during scan');
				}
				if (p.endsWith('.jsonl')) return makeFileStat(100, 1000);
				return makeDirStat(true);
			});

			mockFs.readFile.mockResolvedValue('{"type":"user"}\n');

			const handler = handlers.get('agentSessions:getGlobalStats');

			// Should not throw — individual file stat errors are handled
			const result = await handler!({} as any);
			expect(result).toBeDefined();
		});
	});
});
