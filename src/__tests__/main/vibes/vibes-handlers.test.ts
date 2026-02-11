/**
 * Tests for src/main/ipc/handlers/vibes-handlers.ts
 * Validates IPC handler registration and correct delegation to vibes-bridge functions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Hoist mocks for vibes-bridge functions and electron
const {
	mockFindBinary,
	mockGetVersion,
	mockClearCache,
	mockIsInitialized,
	mockVibesInit,
	mockVibesBuild,
	mockVibesStats,
	mockVibesBlame,
	mockVibesLog,
	mockVibesCoverage,
	mockVibesReport,
	mockVibesSessions,
	mockVibesModels,
	mockIpcMainHandle,
} = vi.hoisted(() => ({
	mockFindBinary: vi.fn(),
	mockGetVersion: vi.fn(),
	mockClearCache: vi.fn(),
	mockIsInitialized: vi.fn(),
	mockVibesInit: vi.fn(),
	mockVibesBuild: vi.fn(),
	mockVibesStats: vi.fn(),
	mockVibesBlame: vi.fn(),
	mockVibesLog: vi.fn(),
	mockVibesCoverage: vi.fn(),
	mockVibesReport: vi.fn(),
	mockVibesSessions: vi.fn(),
	mockVibesModels: vi.fn(),
	mockIpcMainHandle: vi.fn(),
}));

// Mock electron
vi.mock('electron', () => ({
	ipcMain: {
		handle: mockIpcMainHandle,
	},
}));

// Mock vibes-bridge
vi.mock('../../../main/vibes/vibes-bridge', () => ({
	findVibesCheckBinary: mockFindBinary,
	getVibesCheckVersion: mockGetVersion,
	clearBinaryPathCache: mockClearCache,
	isVibesInitialized: mockIsInitialized,
	vibesInit: mockVibesInit,
	vibesBuild: mockVibesBuild,
	vibesStats: mockVibesStats,
	vibesBlame: mockVibesBlame,
	vibesLog: mockVibesLog,
	vibesCoverage: mockVibesCoverage,
	vibesReport: mockVibesReport,
	vibesSessions: mockVibesSessions,
	vibesModels: mockVibesModels,
}));

// Mock logger
vi.mock('../../../main/utils/logger', () => ({
	logger: {
		info: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		debug: vi.fn(),
	},
}));

import { registerVibesHandlers } from '../../../main/ipc/handlers/vibes-handlers';

describe('vibes-handlers', () => {
	let handlers: Record<string, (...args: unknown[]) => Promise<unknown>>;
	let mockSettingsStore: { get: ReturnType<typeof vi.fn> };

	beforeEach(() => {
		vi.clearAllMocks();
		handlers = {};

		// Capture registered handlers
		mockIpcMainHandle.mockImplementation((channel: string, handler: (...args: unknown[]) => Promise<unknown>) => {
			handlers[channel] = handler;
		});

		mockSettingsStore = {
			get: vi.fn().mockReturnValue(''),
		};

		registerVibesHandlers({ settingsStore: mockSettingsStore as any });
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('handler registration', () => {
		it('should register all 12 VIBES IPC handlers', () => {
			expect(mockIpcMainHandle).toHaveBeenCalledTimes(12);
		});

		it('should register handlers with correct channel names', () => {
			const expectedChannels = [
				'vibes:isInitialized',
				'vibes:init',
				'vibes:getStats',
				'vibes:getBlame',
				'vibes:getLog',
				'vibes:getCoverage',
				'vibes:getReport',
				'vibes:getSessions',
				'vibes:getModels',
				'vibes:build',
				'vibes:findBinary',
				'vibes:clearBinaryCache',
			];
			for (const channel of expectedChannels) {
				expect(handlers[channel]).toBeDefined();
			}
		});
	});

	describe('vibes:isInitialized', () => {
		it('should call isVibesInitialized with the project path', async () => {
			mockIsInitialized.mockResolvedValue(true);
			const result = await handlers['vibes:isInitialized']({}, '/project');
			expect(mockIsInitialized).toHaveBeenCalledWith('/project');
			expect(result).toBe(true);
		});

		it('should return false when project is not initialized', async () => {
			mockIsInitialized.mockResolvedValue(false);
			const result = await handlers['vibes:isInitialized']({}, '/project');
			expect(result).toBe(false);
		});

		it('should return false on error', async () => {
			mockIsInitialized.mockRejectedValue(new Error('access denied'));
			const result = await handlers['vibes:isInitialized']({}, '/project');
			expect(result).toBe(false);
		});
	});

	describe('vibes:init', () => {
		const config = {
			projectName: 'test-project',
			assuranceLevel: 'medium' as const,
			extensions: ['.ts', '.js'],
		};

		it('should call vibesInit with config and custom binary path', async () => {
			mockSettingsStore.get.mockReturnValue('/custom/vibescheck');
			mockVibesInit.mockResolvedValue({ success: true });

			const result = await handlers['vibes:init']({}, '/project', config);

			expect(mockVibesInit).toHaveBeenCalledWith('/project', config, '/custom/vibescheck');
			expect(result).toEqual({ success: true });
		});

		it('should pass undefined when binary path is empty', async () => {
			mockSettingsStore.get.mockReturnValue('');
			mockVibesInit.mockResolvedValue({ success: true });

			await handlers['vibes:init']({}, '/project', config);

			expect(mockVibesInit).toHaveBeenCalledWith('/project', config, undefined);
		});

		it('should return error result on exception', async () => {
			mockVibesInit.mockRejectedValue(new Error('binary not found'));

			const result = await handlers['vibes:init']({}, '/project', config);

			expect(result).toEqual({ success: false, error: 'Error: binary not found' });
		});
	});

	describe('vibes:getStats', () => {
		it('should call vibesStats with project path', async () => {
			mockVibesStats.mockResolvedValue({ success: true, data: '{}' });

			const result = await handlers['vibes:getStats']({}, '/project');

			expect(mockVibesStats).toHaveBeenCalledWith('/project', undefined, undefined);
			expect(result).toEqual({ success: true, data: '{}' });
		});

		it('should pass optional file argument', async () => {
			mockVibesStats.mockResolvedValue({ success: true, data: '{}' });

			await handlers['vibes:getStats']({}, '/project', 'src/index.ts');

			expect(mockVibesStats).toHaveBeenCalledWith('/project', 'src/index.ts', undefined);
		});

		it('should return error on failure', async () => {
			mockVibesStats.mockRejectedValue(new Error('stats failed'));

			const result = await handlers['vibes:getStats']({}, '/project');

			expect(result).toEqual({ success: false, error: 'Error: stats failed' });
		});
	});

	describe('vibes:getBlame', () => {
		it('should call vibesBlame with project path and file', async () => {
			mockVibesBlame.mockResolvedValue({ success: true, data: '[]' });

			const result = await handlers['vibes:getBlame']({}, '/project', 'src/index.ts');

			expect(mockVibesBlame).toHaveBeenCalledWith('/project', 'src/index.ts', undefined);
			expect(result).toEqual({ success: true, data: '[]' });
		});

		it('should return error on failure', async () => {
			mockVibesBlame.mockRejectedValue(new Error('blame failed'));

			const result = await handlers['vibes:getBlame']({}, '/project', 'src/index.ts');

			expect(result).toEqual({ success: false, error: 'Error: blame failed' });
		});
	});

	describe('vibes:getLog', () => {
		it('should call vibesLog with project path and options', async () => {
			const options = { file: 'src/index.ts', limit: 10, json: true };
			mockVibesLog.mockResolvedValue({ success: true, data: '[]' });

			const result = await handlers['vibes:getLog']({}, '/project', options);

			expect(mockVibesLog).toHaveBeenCalledWith('/project', options, undefined);
			expect(result).toEqual({ success: true, data: '[]' });
		});

		it('should work without options', async () => {
			mockVibesLog.mockResolvedValue({ success: true, data: '[]' });

			await handlers['vibes:getLog']({}, '/project');

			expect(mockVibesLog).toHaveBeenCalledWith('/project', undefined, undefined);
		});
	});

	describe('vibes:getCoverage', () => {
		it('should call vibesCoverage with json=true', async () => {
			mockVibesCoverage.mockResolvedValue({ success: true, data: '{}' });

			const result = await handlers['vibes:getCoverage']({}, '/project');

			expect(mockVibesCoverage).toHaveBeenCalledWith('/project', true, undefined);
			expect(result).toEqual({ success: true, data: '{}' });
		});
	});

	describe('vibes:getReport', () => {
		it('should call vibesReport with format', async () => {
			mockVibesReport.mockResolvedValue({ success: true, data: '# Report' });

			const result = await handlers['vibes:getReport']({}, '/project', 'markdown');

			expect(mockVibesReport).toHaveBeenCalledWith('/project', 'markdown', undefined);
			expect(result).toEqual({ success: true, data: '# Report' });
		});

		it('should work without format', async () => {
			mockVibesReport.mockResolvedValue({ success: true, data: '{}' });

			await handlers['vibes:getReport']({}, '/project');

			expect(mockVibesReport).toHaveBeenCalledWith('/project', undefined, undefined);
		});
	});

	describe('vibes:getSessions', () => {
		it('should call vibesSessions with project path', async () => {
			mockVibesSessions.mockResolvedValue({ success: true, data: '[]' });

			const result = await handlers['vibes:getSessions']({}, '/project');

			expect(mockVibesSessions).toHaveBeenCalledWith('/project', undefined);
			expect(result).toEqual({ success: true, data: '[]' });
		});
	});

	describe('vibes:getModels', () => {
		it('should call vibesModels with project path', async () => {
			mockVibesModels.mockResolvedValue({ success: true, data: '[]' });

			const result = await handlers['vibes:getModels']({}, '/project');

			expect(mockVibesModels).toHaveBeenCalledWith('/project', undefined);
			expect(result).toEqual({ success: true, data: '[]' });
		});
	});

	describe('vibes:build', () => {
		it('should call vibesBuild with project path', async () => {
			mockVibesBuild.mockResolvedValue({ success: true });

			const result = await handlers['vibes:build']({}, '/project');

			expect(mockVibesBuild).toHaveBeenCalledWith('/project', undefined);
			expect(result).toEqual({ success: true });
		});

		it('should return error on failure', async () => {
			mockVibesBuild.mockRejectedValue(new Error('build failed'));

			const result = await handlers['vibes:build']({}, '/project');

			expect(result).toEqual({ success: false, error: 'Error: build failed' });
		});
	});

	describe('vibes:findBinary', () => {
		it('should return path and version when binary is found', async () => {
			mockFindBinary.mockResolvedValue('/usr/local/bin/vibescheck');
			mockGetVersion.mockResolvedValue('vibescheck 0.3.2');

			const result = await handlers['vibes:findBinary']({}, '/custom/vibescheck');

			expect(mockFindBinary).toHaveBeenCalledWith('/custom/vibescheck');
			expect(mockGetVersion).toHaveBeenCalledWith('/usr/local/bin/vibescheck');
			expect(result).toEqual({ path: '/usr/local/bin/vibescheck', version: 'vibescheck 0.3.2' });
		});

		it('should return path with null version when --version fails', async () => {
			mockFindBinary.mockResolvedValue('/usr/local/bin/vibescheck');
			mockGetVersion.mockResolvedValue(null);

			const result = await handlers['vibes:findBinary']({});

			expect(result).toEqual({ path: '/usr/local/bin/vibescheck', version: null });
		});

		it('should return null path and version when binary not found', async () => {
			mockFindBinary.mockResolvedValue(null);

			const result = await handlers['vibes:findBinary']({});

			expect(result).toEqual({ path: null, version: null });
			expect(mockGetVersion).not.toHaveBeenCalled();
		});

		it('should return null path and version on error', async () => {
			mockFindBinary.mockRejectedValue(new Error('search failed'));

			const result = await handlers['vibes:findBinary']({});

			expect(result).toEqual({ path: null, version: null });
		});
	});

	describe('vibes:clearBinaryCache', () => {
		it('should call clearBinaryPathCache', async () => {
			await handlers['vibes:clearBinaryCache']({});
			expect(mockClearCache).toHaveBeenCalled();
		});
	});

	describe('custom binary path from settings', () => {
		it('should use custom binary path from settings store', async () => {
			mockSettingsStore.get.mockReturnValue('/opt/vibescheck');
			mockVibesStats.mockResolvedValue({ success: true, data: '{}' });

			await handlers['vibes:getStats']({}, '/project');

			expect(mockVibesStats).toHaveBeenCalledWith('/project', undefined, '/opt/vibescheck');
		});

		it('should pass undefined when settings store returns empty string', async () => {
			mockSettingsStore.get.mockReturnValue('');
			mockVibesStats.mockResolvedValue({ success: true, data: '{}' });

			await handlers['vibes:getStats']({}, '/project');

			expect(mockVibesStats).toHaveBeenCalledWith('/project', undefined, undefined);
		});
	});
});
