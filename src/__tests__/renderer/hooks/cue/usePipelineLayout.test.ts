import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePipelineLayout } from '../../../../renderer/hooks/cue/usePipelineLayout';
import type { UsePipelineLayoutParams } from '../../../../renderer/hooks/cue/usePipelineLayout';
import { graphSessionsToPipelines } from '../../../../renderer/components/CuePipelineEditor/utils/yamlToPipeline';
import { mergePipelinesWithSavedLayout } from '../../../../renderer/components/CuePipelineEditor/utils/pipelineLayout';

vi.mock('../../../../renderer/utils/sentry', () => ({
	captureException: vi.fn(),
}));

vi.mock('../../../../renderer/components/CuePipelineEditor/utils/yamlToPipeline', () => ({
	graphSessionsToPipelines: vi.fn(() => []),
}));

vi.mock('../../../../renderer/components/CuePipelineEditor/utils/pipelineLayout', () => ({
	mergePipelinesWithSavedLayout: vi.fn(
		(live: unknown[], saved: { selectedPipelineId?: string }) => ({
			pipelines: live,
			selectedPipelineId:
				saved.selectedPipelineId ?? (live as Array<{ id: string }>)[0]?.id ?? null,
		})
	),
}));

const mockGraphSessionsToPipelines = vi.mocked(graphSessionsToPipelines);
const mockMergePipelinesWithSavedLayout = vi.mocked(mergePipelinesWithSavedLayout);

function makePipeline(id: string) {
	return { id, name: `Pipeline ${id}`, nodes: [], edges: [] };
}

function makeGraphSession(sessionId: string) {
	return {
		sessionId,
		sessionName: `Session ${sessionId}`,
		toolType: 'claude-code',
		subscriptions: [],
	};
}

function makeSessionInfo(id: string) {
	return { id, name: `Session ${id}`, toolType: 'claude-code' };
}

function createDefaultParams(
	overrides: Partial<UsePipelineLayoutParams> = {}
): UsePipelineLayoutParams {
	return {
		reactFlowInstance: {
			getViewport: vi.fn(() => ({ x: 0, y: 0, zoom: 1 })),
			setViewport: vi.fn(),
		} as unknown as UsePipelineLayoutParams['reactFlowInstance'],
		graphSessions: [makeGraphSession('s1')],
		sessions: [makeSessionInfo('s1')],
		pipelineState: { pipelines: [], selectedPipelineId: null },
		setPipelineState: vi.fn(),
		savedStateRef: { current: '' },
		setIsDirty: vi.fn(),
		...overrides,
	};
}

describe('usePipelineLayout', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		(window as any).maestro = {
			cue: {
				savePipelineLayout: vi.fn().mockResolvedValue(undefined),
				loadPipelineLayout: vi.fn().mockResolvedValue(null),
			},
		};
		mockGraphSessionsToPipelines.mockReturnValue([]);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('returns a persistLayout function', () => {
		const params = createDefaultParams();
		const { result } = renderHook(() => usePipelineLayout(params));

		expect(result.current.persistLayout).toBeTypeOf('function');
	});

	it('persistLayout debounces and calls savePipelineLayout after 500ms', () => {
		const params = createDefaultParams({
			pipelineState: {
				pipelines: [makePipeline('p1') as any],
				selectedPipelineId: 'p1',
			},
		});
		const { result } = renderHook(() => usePipelineLayout(params));

		act(() => {
			result.current.persistLayout();
		});

		// Not called immediately
		expect((window as any).maestro.cue.savePipelineLayout).not.toHaveBeenCalled();

		act(() => {
			vi.advanceTimersByTime(500);
		});

		expect((window as any).maestro.cue.savePipelineLayout).toHaveBeenCalledTimes(1);
		expect((window as any).maestro.cue.savePipelineLayout).toHaveBeenCalledWith(
			expect.objectContaining({
				pipelines: [makePipeline('p1')],
				selectedPipelineId: 'p1',
			})
		);
	});

	it('cleanup clears timer on unmount', () => {
		const params = createDefaultParams();
		const { result, unmount } = renderHook(() => usePipelineLayout(params));

		act(() => {
			result.current.persistLayout();
		});

		unmount();

		act(() => {
			vi.advanceTimersByTime(500);
		});

		expect((window as any).maestro.cue.savePipelineLayout).not.toHaveBeenCalled();
	});

	it('restores layout from saved state using graphSessionsToPipelines and mergePipelinesWithSavedLayout', async () => {
		const livePipelines = [makePipeline('p1')];
		mockGraphSessionsToPipelines.mockReturnValue(livePipelines as any);

		const savedLayout = {
			pipelines: [makePipeline('p1-saved')],
			selectedPipelineId: 'p1-saved',
		};
		(window as any).maestro.cue.loadPipelineLayout.mockResolvedValue(savedLayout);

		const setPipelineState = vi.fn();
		const params = createDefaultParams({ setPipelineState });

		renderHook(() => usePipelineLayout(params));

		// Let the async loadLayout run
		await act(async () => {
			await vi.advanceTimersByTimeAsync(200);
		});

		expect(mockGraphSessionsToPipelines).toHaveBeenCalledWith(
			params.graphSessions,
			params.sessions
		);
		expect(mockMergePipelinesWithSavedLayout).toHaveBeenCalledWith(livePipelines, savedLayout);
		expect(setPipelineState).toHaveBeenCalledTimes(1);
	});

	it('restores viewport when saved layout has viewport', async () => {
		const livePipelines = [makePipeline('p1')];
		mockGraphSessionsToPipelines.mockReturnValue(livePipelines as any);

		const savedLayout = {
			pipelines: [makePipeline('p1')],
			selectedPipelineId: 'p1',
			viewport: { x: 100, y: 200, zoom: 1.5 },
		};
		(window as any).maestro.cue.loadPipelineLayout.mockResolvedValue(savedLayout);

		const setViewport = vi.fn();
		const params = createDefaultParams({
			reactFlowInstance: {
				getViewport: vi.fn(() => ({ x: 0, y: 0, zoom: 1 })),
				setViewport,
			} as unknown as UsePipelineLayoutParams['reactFlowInstance'],
		});

		renderHook(() => usePipelineLayout(params));

		await act(async () => {
			await vi.advanceTimersByTimeAsync(200);
		});

		// The viewport restore is inside a setTimeout(fn, 100)
		act(() => {
			vi.advanceTimersByTime(100);
		});

		expect(setViewport).toHaveBeenCalledWith({ x: 100, y: 200, zoom: 1.5 });
	});

	it('uses first pipeline when no saved layout exists', async () => {
		const livePipelines = [makePipeline('p1'), makePipeline('p2')];
		mockGraphSessionsToPipelines.mockReturnValue(livePipelines as any);
		(window as any).maestro.cue.loadPipelineLayout.mockResolvedValue(null);

		const setPipelineState = vi.fn();
		const params = createDefaultParams({ setPipelineState });

		renderHook(() => usePipelineLayout(params));

		await act(async () => {
			await vi.advanceTimersByTimeAsync(200);
		});

		expect(setPipelineState).toHaveBeenCalledWith({
			pipelines: livePipelines,
			selectedPipelineId: 'p1',
		});
	});

	it('only restores layout once across re-renders', async () => {
		const livePipelines = [makePipeline('p1')];
		mockGraphSessionsToPipelines.mockReturnValue(livePipelines as any);
		(window as any).maestro.cue.loadPipelineLayout.mockResolvedValue(null);

		const setPipelineState = vi.fn();
		const params = createDefaultParams({ setPipelineState });

		const { rerender } = renderHook(() => usePipelineLayout(params));

		await act(async () => {
			await vi.advanceTimersByTimeAsync(200);
		});

		expect(setPipelineState).toHaveBeenCalledTimes(1);

		// Re-render should NOT trigger another load
		setPipelineState.mockClear();
		rerender();

		await act(async () => {
			await vi.advanceTimersByTimeAsync(200);
		});

		expect(setPipelineState).not.toHaveBeenCalled();
	});

	it('does not restore layout when graphSessions is empty', async () => {
		const params = createDefaultParams({ graphSessions: [] });

		renderHook(() => usePipelineLayout(params));

		await act(async () => {
			await vi.advanceTimersByTimeAsync(200);
		});

		expect(mockGraphSessionsToPipelines).not.toHaveBeenCalled();
		expect((window as any).maestro.cue.loadPipelineLayout).not.toHaveBeenCalled();
	});

	it('does not restore layout when graphSessionsToPipelines returns empty array', async () => {
		mockGraphSessionsToPipelines.mockReturnValue([]);

		const setPipelineState = vi.fn();
		const params = createDefaultParams({ setPipelineState });

		renderHook(() => usePipelineLayout(params));

		await act(async () => {
			await vi.advanceTimersByTimeAsync(200);
		});

		expect(mockGraphSessionsToPipelines).toHaveBeenCalled();
		expect(setPipelineState).not.toHaveBeenCalled();
	});

	it('calls setIsDirty(false) after layout restore', async () => {
		const livePipelines = [makePipeline('p1')];
		mockGraphSessionsToPipelines.mockReturnValue(livePipelines as any);
		(window as any).maestro.cue.loadPipelineLayout.mockResolvedValue(null);

		const setIsDirty = vi.fn();
		const params = createDefaultParams({ setIsDirty });

		renderHook(() => usePipelineLayout(params));

		await act(async () => {
			await vi.advanceTimersByTimeAsync(200);
		});

		expect(setIsDirty).toHaveBeenCalledWith(false);
	});

	it('sets savedStateRef to JSON of merged pipelines when saved layout exists', async () => {
		const livePipelines = [makePipeline('p1')];
		mockGraphSessionsToPipelines.mockReturnValue(livePipelines as any);

		const savedLayout = {
			pipelines: [makePipeline('p1-saved')],
			selectedPipelineId: 'p1-saved',
		};
		(window as any).maestro.cue.loadPipelineLayout.mockResolvedValue(savedLayout);

		const savedStateRef = { current: '' };
		const params = createDefaultParams({ savedStateRef });

		renderHook(() => usePipelineLayout(params));

		await act(async () => {
			await vi.advanceTimersByTimeAsync(200);
		});

		// mergePipelinesWithSavedLayout returns { pipelines: livePipelines, selectedPipelineId: ... }
		// savedStateRef should be JSON of merged.pipelines
		expect(savedStateRef.current).toBe(JSON.stringify(livePipelines));
	});

	it('sets savedStateRef to JSON of live pipelines when no saved layout exists', async () => {
		const livePipelines = [makePipeline('p1')];
		mockGraphSessionsToPipelines.mockReturnValue(livePipelines as any);
		(window as any).maestro.cue.loadPipelineLayout.mockResolvedValue(null);

		const savedStateRef = { current: '' };
		const params = createDefaultParams({ savedStateRef });

		renderHook(() => usePipelineLayout(params));

		await act(async () => {
			await vi.advanceTimersByTimeAsync(200);
		});

		expect(savedStateRef.current).toBe(JSON.stringify(livePipelines));
	});

	it('persistLayout captures current viewport from reactFlowInstance', () => {
		const getViewport = vi.fn(() => ({ x: 42, y: 84, zoom: 2 }));
		const params = createDefaultParams({
			reactFlowInstance: {
				getViewport,
				setViewport: vi.fn(),
			} as unknown as UsePipelineLayoutParams['reactFlowInstance'],
			pipelineState: {
				pipelines: [makePipeline('p1') as any],
				selectedPipelineId: 'p1',
			},
		});

		const { result } = renderHook(() => usePipelineLayout(params));

		act(() => {
			result.current.persistLayout();
		});

		act(() => {
			vi.advanceTimersByTime(500);
		});

		expect(getViewport).toHaveBeenCalled();
		expect((window as any).maestro.cue.savePipelineLayout).toHaveBeenCalledWith(
			expect.objectContaining({
				viewport: { x: 42, y: 84, zoom: 2 },
			})
		);
	});
});
