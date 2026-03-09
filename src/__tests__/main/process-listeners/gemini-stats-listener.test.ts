/**
 * Tests for gemini-stats-listener.
 * Verifies that per-turn Gemini token usage is accumulated in memory,
 * debounced to disk, flushed on exit/shutdown, and pruned on startup.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupGeminiStatsListener } from '../../../main/process-listeners/gemini-stats-listener';
import type { ProcessManager } from '../../../main/process-manager';
import type { GeminiSessionStatsEvent } from '../../../main/process-manager/types';
import type Store from 'electron-store';
import type { GeminiSessionStatsData } from '../../../main/stores/types';

describe('Gemini Stats Listener', () => {
	let mockProcessManager: ProcessManager;
	let mockStore: Store<GeminiSessionStatsData>;
	let eventHandlers: Map<string, (...args: unknown[]) => void>;
	let storeData: GeminiSessionStatsData;

	const mockLogger = {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	};

	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		eventHandlers = new Map();
		storeData = { stats: {} };

		mockProcessManager = {
			on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
				eventHandlers.set(event, handler);
			}),
		} as unknown as ProcessManager;

		mockStore = {
			get: vi.fn((key: string, defaultValue?: unknown) => {
				if (key === 'stats') return storeData.stats;
				return defaultValue;
			}),
			set: vi.fn((key: string, value: unknown) => {
				if (key === 'stats') {
					storeData.stats = value as GeminiSessionStatsData['stats'];
				}
			}),
		} as unknown as Store<GeminiSessionStatsData>;
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('should register session-id, gemini-session-stats, and exit listeners', () => {
		setupGeminiStatsListener(mockProcessManager, { logger: mockLogger }, mockStore);

		expect(mockProcessManager.on).toHaveBeenCalledWith('session-id', expect.any(Function));
		expect(mockProcessManager.on).toHaveBeenCalledWith(
			'gemini-session-stats',
			expect.any(Function)
		);
		expect(mockProcessManager.on).toHaveBeenCalledWith('exit', expect.any(Function));
	});

	it('should not register listeners when store is undefined', () => {
		const result = setupGeminiStatsListener(mockProcessManager, { logger: mockLogger }, undefined);

		expect(mockProcessManager.on).not.toHaveBeenCalled();
		expect(mockLogger.warn).toHaveBeenCalled();
		expect(result).toBeUndefined();
	});

	it('should return a handle with flushAll when store is provided', () => {
		const handle = setupGeminiStatsListener(mockProcessManager, { logger: mockLogger }, mockStore);

		expect(handle).toBeDefined();
		expect(typeof handle!.flushAll).toBe('function');
	});

	// ---- Accumulation (debounced, NOT immediate) ----

	it('should NOT write to store immediately on stats event', () => {
		setupGeminiStatsListener(mockProcessManager, { logger: mockLogger }, mockStore);

		const sessionIdHandler = eventHandlers.get('session-id')!;
		const statsHandler = eventHandlers.get('gemini-session-stats')!;

		sessionIdHandler('maestro-1', 'gemini-uuid-abc');
		statsHandler('maestro-1', {
			sessionId: 'maestro-1',
			inputTokens: 100,
			outputTokens: 50,
			cacheReadTokens: 10,
			reasoningTokens: 5,
		} as GeminiSessionStatsEvent);

		// Store.set should NOT have been called (only .get for pruning on setup)
		const setCalls = (mockStore.set as ReturnType<typeof vi.fn>).mock.calls.filter(
			(c: unknown[]) => c[0] === 'stats' && Object.keys(c[1] as Record<string, unknown>).length > 0
		);
		expect(setCalls.length).toBe(0);
	});

	it('should flush accumulated stats to store after debounce interval', () => {
		setupGeminiStatsListener(mockProcessManager, { logger: mockLogger }, mockStore);

		const sessionIdHandler = eventHandlers.get('session-id')!;
		const statsHandler = eventHandlers.get('gemini-session-stats')!;

		sessionIdHandler('maestro-1', 'gemini-uuid-abc');

		statsHandler('maestro-1', {
			sessionId: 'maestro-1',
			inputTokens: 100,
			outputTokens: 50,
			cacheReadTokens: 10,
			reasoningTokens: 5,
		} as GeminiSessionStatsEvent);

		statsHandler('maestro-1', {
			sessionId: 'maestro-1',
			inputTokens: 200,
			outputTokens: 80,
			cacheReadTokens: 20,
			reasoningTokens: 10,
		} as GeminiSessionStatsEvent);

		// Advance past debounce interval (5s)
		vi.advanceTimersByTime(5_000);

		expect(storeData.stats['gemini-uuid-abc']).toMatchObject({
			inputTokens: 300,
			outputTokens: 130,
			cacheReadTokens: 30,
			reasoningTokens: 15,
		});
		expect(storeData.stats['gemini-uuid-abc'].lastUpdatedMs).toBeGreaterThan(0);
	});

	it('should accumulate multiple events into a single store write', () => {
		setupGeminiStatsListener(mockProcessManager, { logger: mockLogger }, mockStore);

		const sessionIdHandler = eventHandlers.get('session-id')!;
		const statsHandler = eventHandlers.get('gemini-session-stats')!;

		sessionIdHandler('maestro-1', 'gemini-uuid-abc');

		// Send 5 rapid stats events
		for (let i = 0; i < 5; i++) {
			statsHandler('maestro-1', {
				sessionId: 'maestro-1',
				inputTokens: 10,
				outputTokens: 5,
				cacheReadTokens: 1,
				reasoningTokens: 0,
			} as GeminiSessionStatsEvent);
		}

		// Advance past debounce
		vi.advanceTimersByTime(5_000);

		// Should be exactly 1 store.set call for the batch (not counting pruning)
		const statSetCalls = (mockStore.set as ReturnType<typeof vi.fn>).mock.calls.filter(
			(c: unknown[]) => c[0] === 'stats' && Object.keys(c[1] as Record<string, unknown>).length > 0
		);
		expect(statSetCalls.length).toBe(1);

		expect(storeData.stats['gemini-uuid-abc']).toMatchObject({
			inputTokens: 50,
			outputTokens: 25,
			cacheReadTokens: 5,
			reasoningTokens: 0,
		});
	});

	it('should accumulate stats for multiple sessions in a single flush', () => {
		setupGeminiStatsListener(mockProcessManager, { logger: mockLogger }, mockStore);

		const sessionIdHandler = eventHandlers.get('session-id')!;
		const statsHandler = eventHandlers.get('gemini-session-stats')!;

		sessionIdHandler('maestro-1', 'gemini-uuid-aaa');
		sessionIdHandler('maestro-2', 'gemini-uuid-bbb');

		statsHandler('maestro-1', {
			sessionId: 'maestro-1',
			inputTokens: 100,
			outputTokens: 50,
			cacheReadTokens: 0,
			reasoningTokens: 0,
		} as GeminiSessionStatsEvent);

		statsHandler('maestro-2', {
			sessionId: 'maestro-2',
			inputTokens: 200,
			outputTokens: 100,
			cacheReadTokens: 0,
			reasoningTokens: 0,
		} as GeminiSessionStatsEvent);

		vi.advanceTimersByTime(5_000);

		expect(storeData.stats['gemini-uuid-aaa']).toMatchObject({
			inputTokens: 100,
			outputTokens: 50,
		});
		expect(storeData.stats['gemini-uuid-bbb']).toMatchObject({
			inputTokens: 200,
			outputTokens: 100,
		});
	});

	// ---- Buffering (stats before session-id) ----

	it('should buffer stats when session-id is not yet known and flush on session-id + debounce', () => {
		setupGeminiStatsListener(mockProcessManager, { logger: mockLogger }, mockStore);

		const sessionIdHandler = eventHandlers.get('session-id')!;
		const statsHandler = eventHandlers.get('gemini-session-stats')!;

		// Stats arrive BEFORE session-id
		statsHandler('maestro-2', {
			sessionId: 'maestro-2',
			inputTokens: 150,
			outputTokens: 60,
			cacheReadTokens: 5,
			reasoningTokens: 0,
		} as GeminiSessionStatsEvent);

		// Not written yet
		vi.advanceTimersByTime(5_000);
		expect(storeData.stats['gemini-uuid-def']).toBeUndefined();

		// Session-id arrives → buffered stats moved to accumulator
		sessionIdHandler('maestro-2', 'gemini-uuid-def');

		// Advance past debounce
		vi.advanceTimersByTime(5_000);

		expect(storeData.stats['gemini-uuid-def']).toMatchObject({
			inputTokens: 150,
			outputTokens: 60,
			cacheReadTokens: 5,
			reasoningTokens: 0,
		});
	});

	it('should accumulate multiple buffered turns before session-id arrives', () => {
		setupGeminiStatsListener(mockProcessManager, { logger: mockLogger }, mockStore);

		const sessionIdHandler = eventHandlers.get('session-id')!;
		const statsHandler = eventHandlers.get('gemini-session-stats')!;

		statsHandler('maestro-3', {
			sessionId: 'maestro-3',
			inputTokens: 50,
			outputTokens: 25,
			cacheReadTokens: 0,
			reasoningTokens: 0,
		} as GeminiSessionStatsEvent);

		statsHandler('maestro-3', {
			sessionId: 'maestro-3',
			inputTokens: 75,
			outputTokens: 35,
			cacheReadTokens: 5,
			reasoningTokens: 2,
		} as GeminiSessionStatsEvent);

		sessionIdHandler('maestro-3', 'gemini-uuid-ghi');
		vi.advanceTimersByTime(5_000);

		expect(storeData.stats['gemini-uuid-ghi']).toMatchObject({
			inputTokens: 125,
			outputTokens: 60,
			cacheReadTokens: 5,
			reasoningTokens: 2,
		});
	});

	// ---- Flush on exit ----

	it('should flush accumulated stats to store on process exit', () => {
		setupGeminiStatsListener(mockProcessManager, { logger: mockLogger }, mockStore);

		const sessionIdHandler = eventHandlers.get('session-id')!;
		const statsHandler = eventHandlers.get('gemini-session-stats')!;
		const exitHandler = eventHandlers.get('exit')!;

		sessionIdHandler('maestro-4', 'gemini-uuid-jkl');
		statsHandler('maestro-4', {
			sessionId: 'maestro-4',
			inputTokens: 100,
			outputTokens: 50,
			cacheReadTokens: 0,
			reasoningTokens: 0,
		} as GeminiSessionStatsEvent);

		// Exit triggers immediate flush (no need to wait for debounce)
		exitHandler('maestro-4');

		expect(storeData.stats['gemini-uuid-jkl']).toMatchObject({
			inputTokens: 100,
			outputTokens: 50,
		});
	});

	it('should clean up mappings on exit but preserve persisted stats', () => {
		setupGeminiStatsListener(mockProcessManager, { logger: mockLogger }, mockStore);

		const sessionIdHandler = eventHandlers.get('session-id')!;
		const statsHandler = eventHandlers.get('gemini-session-stats')!;
		const exitHandler = eventHandlers.get('exit')!;

		sessionIdHandler('maestro-4', 'gemini-uuid-jkl');
		statsHandler('maestro-4', {
			sessionId: 'maestro-4',
			inputTokens: 100,
			outputTokens: 50,
			cacheReadTokens: 0,
			reasoningTokens: 0,
		} as GeminiSessionStatsEvent);

		exitHandler('maestro-4');

		// Stats persisted
		expect(storeData.stats['gemini-uuid-jkl']).toBeDefined();
		expect(storeData.stats['gemini-uuid-jkl'].inputTokens).toBe(100);
	});

	// ---- Flush via handle (shutdown) ----

	it('should flush all accumulated stats when flushAll() is called', () => {
		const handle = setupGeminiStatsListener(mockProcessManager, { logger: mockLogger }, mockStore);

		const sessionIdHandler = eventHandlers.get('session-id')!;
		const statsHandler = eventHandlers.get('gemini-session-stats')!;

		sessionIdHandler('maestro-5', 'gemini-uuid-mno');
		statsHandler('maestro-5', {
			sessionId: 'maestro-5',
			inputTokens: 500,
			outputTokens: 250,
			cacheReadTokens: 50,
			reasoningTokens: 25,
		} as GeminiSessionStatsEvent);

		// Call flushAll without waiting for timer
		handle!.flushAll();

		expect(storeData.stats['gemini-uuid-mno']).toMatchObject({
			inputTokens: 500,
			outputTokens: 250,
			cacheReadTokens: 50,
			reasoningTokens: 25,
		});
	});

	it('should be safe to call flushAll() when accumulator is empty', () => {
		const handle = setupGeminiStatsListener(mockProcessManager, { logger: mockLogger }, mockStore);

		// Should not throw
		expect(() => handle!.flushAll()).not.toThrow();
	});

	// ---- Merging with existing store data ----

	it('should merge accumulated stats with existing store entries on flush', () => {
		// Pre-populate store with existing stats
		storeData.stats['gemini-uuid-existing'] = {
			inputTokens: 1000,
			outputTokens: 500,
			cacheReadTokens: 100,
			reasoningTokens: 50,
			lastUpdatedMs: Date.now() - 60_000,
		};

		const handle = setupGeminiStatsListener(mockProcessManager, { logger: mockLogger }, mockStore);

		const sessionIdHandler = eventHandlers.get('session-id')!;
		const statsHandler = eventHandlers.get('gemini-session-stats')!;

		sessionIdHandler('maestro-6', 'gemini-uuid-existing');
		statsHandler('maestro-6', {
			sessionId: 'maestro-6',
			inputTokens: 200,
			outputTokens: 100,
			cacheReadTokens: 20,
			reasoningTokens: 10,
		} as GeminiSessionStatsEvent);

		handle!.flushAll();

		expect(storeData.stats['gemini-uuid-existing']).toMatchObject({
			inputTokens: 1200,
			outputTokens: 600,
			cacheReadTokens: 120,
			reasoningTokens: 60,
		});
	});

	// ---- Pruning ----

	it('should prune stats entries older than 90 days on startup', () => {
		const now = Date.now();
		const ninetyOneDaysAgo = now - 91 * 24 * 60 * 60 * 1_000;
		const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1_000;

		storeData.stats = {
			'old-session': {
				inputTokens: 100,
				outputTokens: 50,
				cacheReadTokens: 0,
				reasoningTokens: 0,
				lastUpdatedMs: ninetyOneDaysAgo,
			},
			'recent-session': {
				inputTokens: 200,
				outputTokens: 100,
				cacheReadTokens: 10,
				reasoningTokens: 5,
				lastUpdatedMs: thirtyDaysAgo,
			},
		};

		setupGeminiStatsListener(mockProcessManager, { logger: mockLogger }, mockStore);

		// Old entry pruned, recent entry preserved
		expect(storeData.stats['old-session']).toBeUndefined();
		expect(storeData.stats['recent-session']).toBeDefined();
		expect(mockLogger.info).toHaveBeenCalledWith(
			expect.stringContaining('Pruned 1 stale'),
			'GeminiStats'
		);
	});

	it('should not write to store if no entries need pruning', () => {
		const recentTime = Date.now() - 10 * 24 * 60 * 60 * 1_000;
		storeData.stats = {
			'session-a': {
				inputTokens: 100,
				outputTokens: 50,
				cacheReadTokens: 0,
				reasoningTokens: 0,
				lastUpdatedMs: recentTime,
			},
		};

		// Clear set calls from store setup
		(mockStore.set as ReturnType<typeof vi.fn>).mockClear();

		setupGeminiStatsListener(mockProcessManager, { logger: mockLogger }, mockStore);

		// No store.set for pruning (nothing to prune)
		expect(mockStore.set).not.toHaveBeenCalled();
	});

	it('should prune all stale entries when all are old', () => {
		const oldTime = Date.now() - 100 * 24 * 60 * 60 * 1_000;

		storeData.stats = {
			'old-1': {
				inputTokens: 10,
				outputTokens: 5,
				cacheReadTokens: 0,
				reasoningTokens: 0,
				lastUpdatedMs: oldTime,
			},
			'old-2': {
				inputTokens: 20,
				outputTokens: 10,
				cacheReadTokens: 0,
				reasoningTokens: 0,
				lastUpdatedMs: oldTime,
			},
			'old-3': {
				inputTokens: 30,
				outputTokens: 15,
				cacheReadTokens: 0,
				reasoningTokens: 0,
				lastUpdatedMs: oldTime,
			},
		};

		setupGeminiStatsListener(mockProcessManager, { logger: mockLogger }, mockStore);

		expect(Object.keys(storeData.stats)).toHaveLength(0);
		expect(mockLogger.info).toHaveBeenCalledWith(
			expect.stringContaining('Pruned 3 stale'),
			'GeminiStats'
		);
	});

	// ---- Debounce timer behavior ----

	it('should not trigger multiple flushes for rapid events within debounce window', () => {
		setupGeminiStatsListener(mockProcessManager, { logger: mockLogger }, mockStore);

		const sessionIdHandler = eventHandlers.get('session-id')!;
		const statsHandler = eventHandlers.get('gemini-session-stats')!;

		sessionIdHandler('maestro-1', 'gemini-uuid-rapid');

		// 10 rapid events within 1 second
		for (let i = 0; i < 10; i++) {
			statsHandler('maestro-1', {
				sessionId: 'maestro-1',
				inputTokens: 10,
				outputTokens: 5,
				cacheReadTokens: 0,
				reasoningTokens: 0,
			} as GeminiSessionStatsEvent);
			vi.advanceTimersByTime(100);
		}

		// Total time elapsed: 1000ms (< 5000ms debounce)
		// No flush yet — clear the mock to isolate
		const setCallsBefore = (mockStore.set as ReturnType<typeof vi.fn>).mock.calls.filter(
			(c: unknown[]) => c[0] === 'stats' && Object.keys(c[1] as Record<string, unknown>).length > 0
		).length;

		// Advance remaining time to trigger flush
		vi.advanceTimersByTime(4_000);

		const setCallsAfter = (mockStore.set as ReturnType<typeof vi.fn>).mock.calls.filter(
			(c: unknown[]) => c[0] === 'stats' && Object.keys(c[1] as Record<string, unknown>).length > 0
		).length;

		// Exactly 1 new set call for the batch
		expect(setCallsAfter - setCallsBefore).toBe(1);

		expect(storeData.stats['gemini-uuid-rapid']).toMatchObject({
			inputTokens: 100,
			outputTokens: 50,
		});
	});
});
