/**
 * Tests for src/main/preload/vibes.ts
 * Validates the VIBES preload API factory function creates correct IPC bridges.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist mock for ipcRenderer
const { mockInvoke } = vi.hoisted(() => ({
	mockInvoke: vi.fn(),
}));

// Mock electron
vi.mock('electron', () => ({
	ipcRenderer: {
		invoke: mockInvoke,
	},
}));

import { createVibesApi } from '../../../main/preload/vibes';
import type { VibesApi, VibesCommandResult, VibesInitConfig, VibesLogOptions } from '../../../main/preload/vibes';

describe('vibes preload API', () => {
	let api: VibesApi;

	beforeEach(() => {
		vi.clearAllMocks();
		api = createVibesApi();
	});

	describe('createVibesApi', () => {
		it('should return an object with all expected methods', () => {
			expect(api).toHaveProperty('isInitialized');
			expect(api).toHaveProperty('init');
			expect(api).toHaveProperty('getStats');
			expect(api).toHaveProperty('getBlame');
			expect(api).toHaveProperty('getLog');
			expect(api).toHaveProperty('getCoverage');
			expect(api).toHaveProperty('getReport');
			expect(api).toHaveProperty('getSessions');
			expect(api).toHaveProperty('getModels');
			expect(api).toHaveProperty('build');
			expect(api).toHaveProperty('findBinary');
		});

		it('should have exactly 11 methods', () => {
			expect(Object.keys(api)).toHaveLength(11);
		});
	});

	describe('isInitialized', () => {
		it('should invoke vibes:isInitialized with project path', async () => {
			mockInvoke.mockResolvedValue(true);

			const result = await api.isInitialized('/project');

			expect(mockInvoke).toHaveBeenCalledWith('vibes:isInitialized', '/project');
			expect(result).toBe(true);
		});
	});

	describe('init', () => {
		it('should invoke vibes:init with project path and config', async () => {
			const config: VibesInitConfig = {
				projectName: 'test',
				assuranceLevel: 'medium',
				extensions: ['.ts'],
			};
			mockInvoke.mockResolvedValue({ success: true });

			const result = await api.init('/project', config);

			expect(mockInvoke).toHaveBeenCalledWith('vibes:init', '/project', config);
			expect(result).toEqual({ success: true });
		});
	});

	describe('getStats', () => {
		it('should invoke vibes:getStats with project path', async () => {
			mockInvoke.mockResolvedValue({ success: true, data: '{}' });

			const result = await api.getStats('/project');

			expect(mockInvoke).toHaveBeenCalledWith('vibes:getStats', '/project', undefined);
			expect(result).toEqual({ success: true, data: '{}' });
		});

		it('should pass optional file argument', async () => {
			mockInvoke.mockResolvedValue({ success: true, data: '{}' });

			await api.getStats('/project', 'src/index.ts');

			expect(mockInvoke).toHaveBeenCalledWith('vibes:getStats', '/project', 'src/index.ts');
		});
	});

	describe('getBlame', () => {
		it('should invoke vibes:getBlame with project path and file', async () => {
			mockInvoke.mockResolvedValue({ success: true, data: '[]' });

			const result = await api.getBlame('/project', 'src/index.ts');

			expect(mockInvoke).toHaveBeenCalledWith('vibes:getBlame', '/project', 'src/index.ts');
			expect(result).toEqual({ success: true, data: '[]' });
		});
	});

	describe('getLog', () => {
		it('should invoke vibes:getLog with project path and options', async () => {
			const options: VibesLogOptions = { file: 'src/index.ts', limit: 10, json: true };
			mockInvoke.mockResolvedValue({ success: true, data: '[]' });

			const result = await api.getLog('/project', options);

			expect(mockInvoke).toHaveBeenCalledWith('vibes:getLog', '/project', options);
			expect(result).toEqual({ success: true, data: '[]' });
		});

		it('should work without options', async () => {
			mockInvoke.mockResolvedValue({ success: true, data: '[]' });

			await api.getLog('/project');

			expect(mockInvoke).toHaveBeenCalledWith('vibes:getLog', '/project', undefined);
		});
	});

	describe('getCoverage', () => {
		it('should invoke vibes:getCoverage with project path', async () => {
			mockInvoke.mockResolvedValue({ success: true, data: '{}' });

			const result = await api.getCoverage('/project');

			expect(mockInvoke).toHaveBeenCalledWith('vibes:getCoverage', '/project');
			expect(result).toEqual({ success: true, data: '{}' });
		});
	});

	describe('getReport', () => {
		it('should invoke vibes:getReport with project path and format', async () => {
			mockInvoke.mockResolvedValue({ success: true, data: '# Report' });

			const result = await api.getReport('/project', 'markdown');

			expect(mockInvoke).toHaveBeenCalledWith('vibes:getReport', '/project', 'markdown');
			expect(result).toEqual({ success: true, data: '# Report' });
		});

		it('should work without format', async () => {
			mockInvoke.mockResolvedValue({ success: true, data: '{}' });

			await api.getReport('/project');

			expect(mockInvoke).toHaveBeenCalledWith('vibes:getReport', '/project', undefined);
		});
	});

	describe('getSessions', () => {
		it('should invoke vibes:getSessions with project path', async () => {
			mockInvoke.mockResolvedValue({ success: true, data: '[]' });

			const result = await api.getSessions('/project');

			expect(mockInvoke).toHaveBeenCalledWith('vibes:getSessions', '/project');
			expect(result).toEqual({ success: true, data: '[]' });
		});
	});

	describe('getModels', () => {
		it('should invoke vibes:getModels with project path', async () => {
			mockInvoke.mockResolvedValue({ success: true, data: '[]' });

			const result = await api.getModels('/project');

			expect(mockInvoke).toHaveBeenCalledWith('vibes:getModels', '/project');
			expect(result).toEqual({ success: true, data: '[]' });
		});
	});

	describe('build', () => {
		it('should invoke vibes:build with project path', async () => {
			mockInvoke.mockResolvedValue({ success: true });

			const result = await api.build('/project');

			expect(mockInvoke).toHaveBeenCalledWith('vibes:build', '/project');
			expect(result).toEqual({ success: true });
		});
	});

	describe('findBinary', () => {
		it('should invoke vibes:findBinary with custom path', async () => {
			mockInvoke.mockResolvedValue('/usr/local/bin/vibescheck');

			const result = await api.findBinary('/custom/vibescheck');

			expect(mockInvoke).toHaveBeenCalledWith('vibes:findBinary', '/custom/vibescheck');
			expect(result).toBe('/usr/local/bin/vibescheck');
		});

		it('should work without custom path', async () => {
			mockInvoke.mockResolvedValue('/usr/bin/vibescheck');

			const result = await api.findBinary();

			expect(mockInvoke).toHaveBeenCalledWith('vibes:findBinary', undefined);
			expect(result).toBe('/usr/bin/vibescheck');
		});

		it('should return null when not found', async () => {
			mockInvoke.mockResolvedValue(null);

			const result = await api.findBinary();

			expect(result).toBeNull();
		});
	});
});
