import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useVibesSessionIndicators } from '../../../renderer/hooks/useVibesSessionIndicators';
import type { Session } from '../../../renderer/types';

// ============================================================================
// Helpers
// ============================================================================

/** Minimal Session object with the fields the hook actually reads. */
function makeSession(overrides: Partial<Session> & { id: string; cwd: string }): Session {
	return {
		name: 'Test Session',
		toolType: 'claude-code',
		state: 'idle',
		fullPath: overrides.cwd,
		projectRoot: overrides.projectRoot ?? overrides.cwd,
		aiLogs: [],
		shellLogs: [],
		workLog: [],
		contextUsage: 0,
		inputMode: 'ai',
		aiPid: 0,
		terminalPid: 0,
		port: 0,
		isLive: false,
		changedFiles: [],
		isGitRepo: false,
		fileTree: [],
		fileExplorerExpanded: [],
		fileExplorerScrollPos: 0,
		...overrides,
	} as Session;
}

// ============================================================================
// Mock setup — window.maestro.vibes
// ============================================================================

const mockVibesApi = {
	isInitialized: vi.fn().mockResolvedValue(false),
	getStats: vi.fn().mockResolvedValue({ success: false }),
	init: vi.fn(),
	getBlame: vi.fn(),
	getLog: vi.fn(),
	getCoverage: vi.fn(),
	getReport: vi.fn(),
	getSessions: vi.fn(),
	getModels: vi.fn(),
	build: vi.fn(),
	findBinary: vi.fn(),
};

beforeEach(() => {
	vi.clearAllMocks();

	// Ensure window.maestro.vibes is available
	if (!window.maestro) {
		(window as unknown as Record<string, unknown>).maestro = {} as unknown;
	}
	(window.maestro as Record<string, unknown>).vibes = mockVibesApi;
});

afterEach(() => {
	vi.restoreAllMocks();
});

// ============================================================================
// Tests
// ============================================================================

describe('useVibesSessionIndicators', () => {
	describe('when disabled', () => {
		it('should return empty indicators when enabled is false', () => {
			const sessions = [makeSession({ id: '1', cwd: '/project/a' })];
			const { result } = renderHook(() => useVibesSessionIndicators(sessions, false));

			expect(result.current.indicators.size).toBe(0);
			expect(result.current.isLoading).toBe(false);
		});

		it('should not make any IPC calls when disabled', () => {
			const sessions = [makeSession({ id: '1', cwd: '/project/a' })];
			renderHook(() => useVibesSessionIndicators(sessions, false));

			expect(mockVibesApi.isInitialized).not.toHaveBeenCalled();
			expect(mockVibesApi.getStats).not.toHaveBeenCalled();
		});
	});

	describe('when enabled', () => {
		it('should fetch indicators for each unique project path', async () => {
			mockVibesApi.isInitialized.mockResolvedValue(true);
			mockVibesApi.getStats.mockResolvedValue({
				success: true,
				data: JSON.stringify({ total_annotations: 42 }),
			});

			const sessions = [
				makeSession({ id: '1', cwd: '/project/a' }),
				makeSession({ id: '2', cwd: '/project/b' }),
			];

			const { result } = renderHook(() => useVibesSessionIndicators(sessions, true));

			await waitFor(() => {
				expect(result.current.indicators.size).toBe(2);
			});

			const indicatorA = result.current.indicators.get('/project/a');
			expect(indicatorA).toEqual({ isInitialized: true, annotationCount: 42 });

			const indicatorB = result.current.indicators.get('/project/b');
			expect(indicatorB).toEqual({ isInitialized: true, annotationCount: 42 });
		});

		it('should deduplicate sessions with the same project path', async () => {
			mockVibesApi.isInitialized.mockResolvedValue(true);
			mockVibesApi.getStats.mockResolvedValue({
				success: true,
				data: JSON.stringify({ total_annotations: 10 }),
			});

			const sessions = [
				makeSession({ id: '1', cwd: '/project/a' }),
				makeSession({ id: '2', cwd: '/project/a' }),
				makeSession({ id: '3', cwd: '/project/a' }),
			];

			renderHook(() => useVibesSessionIndicators(sessions, true));

			await waitFor(() => {
				// Should only call IPC once for /project/a, not three times
				expect(mockVibesApi.isInitialized).toHaveBeenCalledTimes(1);
			});

			expect(mockVibesApi.isInitialized).toHaveBeenCalledWith('/project/a');
		});

		it('should prefer projectRoot over cwd', async () => {
			mockVibesApi.isInitialized.mockResolvedValue(true);
			mockVibesApi.getStats.mockResolvedValue({
				success: true,
				data: JSON.stringify({ total_annotations: 5 }),
			});

			const sessions = [
				makeSession({ id: '1', cwd: '/project/a/sub', projectRoot: '/project/a' }),
			];

			renderHook(() => useVibesSessionIndicators(sessions, true));

			await waitFor(() => {
				expect(mockVibesApi.isInitialized).toHaveBeenCalledWith('/project/a');
			});
		});

		it('should handle uninitialized projects', async () => {
			mockVibesApi.isInitialized.mockResolvedValue(false);
			mockVibesApi.getStats.mockResolvedValue({ success: false });

			const sessions = [makeSession({ id: '1', cwd: '/project/a' })];

			const { result } = renderHook(() => useVibesSessionIndicators(sessions, true));

			await waitFor(() => {
				expect(result.current.indicators.size).toBe(1);
			});

			const indicator = result.current.indicators.get('/project/a');
			expect(indicator).toEqual({ isInitialized: false, annotationCount: 0 });
		});

		it('should handle IPC errors gracefully', async () => {
			mockVibesApi.isInitialized.mockRejectedValue(new Error('IPC error'));
			mockVibesApi.getStats.mockRejectedValue(new Error('IPC error'));

			const sessions = [makeSession({ id: '1', cwd: '/project/a' })];

			const { result } = renderHook(() => useVibesSessionIndicators(sessions, true));

			await waitFor(() => {
				expect(result.current.indicators.size).toBe(1);
			});

			const indicator = result.current.indicators.get('/project/a');
			expect(indicator).toEqual({ isInitialized: false, annotationCount: 0 });
		});

		it('should parse both camelCase and snake_case annotation counts', async () => {
			mockVibesApi.isInitialized.mockResolvedValue(true);
			mockVibesApi.getStats.mockResolvedValue({
				success: true,
				data: JSON.stringify({ totalAnnotations: 99 }),
			});

			const sessions = [makeSession({ id: '1', cwd: '/project/a' })];

			const { result } = renderHook(() => useVibesSessionIndicators(sessions, true));

			await waitFor(() => {
				expect(result.current.indicators.get('/project/a')?.annotationCount).toBe(99);
			});
		});
	});

	describe('with empty sessions', () => {
		it('should return empty indicators when no sessions exist', () => {
			const { result } = renderHook(() => useVibesSessionIndicators([], true));

			expect(result.current.indicators.size).toBe(0);
			expect(result.current.isLoading).toBe(false);
		});
	});
});
