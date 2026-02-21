/**
 * Tests for gemini-stats-listener.
 * Verifies that per-turn Gemini token usage is accumulated and persisted
 * to the electron-store correctly.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
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

	beforeEach(() => {
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

	const mockLogger = {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	};

	it('should register session-id, gemini-session-stats, and exit listeners', () => {
		setupGeminiStatsListener(mockProcessManager, { logger: mockLogger }, mockStore);

		expect(mockProcessManager.on).toHaveBeenCalledWith('session-id', expect.any(Function));
		expect(mockProcessManager.on).toHaveBeenCalledWith('gemini-session-stats', expect.any(Function));
		expect(mockProcessManager.on).toHaveBeenCalledWith('exit', expect.any(Function));
	});

	it('should not register listeners when store is undefined', () => {
		setupGeminiStatsListener(mockProcessManager, { logger: mockLogger }, undefined);

		expect(mockProcessManager.on).not.toHaveBeenCalled();
		expect(mockLogger.warn).toHaveBeenCalled();
	});

	it('should accumulate per-turn stats when session-id is already known', () => {
		setupGeminiStatsListener(mockProcessManager, { logger: mockLogger }, mockStore);

		const sessionIdHandler = eventHandlers.get('session-id')!;
		const statsHandler = eventHandlers.get('gemini-session-stats')!;

		// First: session-id event maps maestro-id → gemini-uuid
		sessionIdHandler('maestro-session-1', 'gemini-uuid-abc');

		// Then: two turns of usage stats
		const turn1: GeminiSessionStatsEvent = {
			sessionId: 'maestro-session-1',
			inputTokens: 100,
			outputTokens: 50,
			cacheReadTokens: 10,
			reasoningTokens: 5,
		};
		statsHandler('maestro-session-1', turn1);

		const turn2: GeminiSessionStatsEvent = {
			sessionId: 'maestro-session-1',
			inputTokens: 200,
			outputTokens: 80,
			cacheReadTokens: 20,
			reasoningTokens: 10,
		};
		statsHandler('maestro-session-1', turn2);

		// Verify accumulated stats in store
		expect(storeData.stats['gemini-uuid-abc']).toMatchObject({
			inputTokens: 300,
			outputTokens: 130,
			cacheReadTokens: 30,
			reasoningTokens: 15,
		});
		expect(storeData.stats['gemini-uuid-abc'].lastUpdatedMs).toBeGreaterThan(0);
	});

	it('should buffer stats when session-id is not yet known and flush on session-id', () => {
		setupGeminiStatsListener(mockProcessManager, { logger: mockLogger }, mockStore);

		const sessionIdHandler = eventHandlers.get('session-id')!;
		const statsHandler = eventHandlers.get('gemini-session-stats')!;

		// Stats arrive BEFORE session-id (edge case)
		const turn1: GeminiSessionStatsEvent = {
			sessionId: 'maestro-session-2',
			inputTokens: 150,
			outputTokens: 60,
			cacheReadTokens: 5,
			reasoningTokens: 0,
		};
		statsHandler('maestro-session-2', turn1);

		// Not yet written to store (no gemini UUID available)
		expect(mockStore.set).not.toHaveBeenCalled();

		// Now session-id arrives → flushes buffered stats
		sessionIdHandler('maestro-session-2', 'gemini-uuid-def');

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

		// Two turns arrive before session-id
		statsHandler('maestro-session-3', {
			sessionId: 'maestro-session-3',
			inputTokens: 50,
			outputTokens: 25,
			cacheReadTokens: 0,
			reasoningTokens: 0,
		} as GeminiSessionStatsEvent);

		statsHandler('maestro-session-3', {
			sessionId: 'maestro-session-3',
			inputTokens: 75,
			outputTokens: 35,
			cacheReadTokens: 5,
			reasoningTokens: 2,
		} as GeminiSessionStatsEvent);

		// Flush
		sessionIdHandler('maestro-session-3', 'gemini-uuid-ghi');

		expect(storeData.stats['gemini-uuid-ghi']).toMatchObject({
			inputTokens: 125,
			outputTokens: 60,
			cacheReadTokens: 5,
			reasoningTokens: 2,
		});
	});

	it('should clean up mappings on exit', () => {
		setupGeminiStatsListener(mockProcessManager, { logger: mockLogger }, mockStore);

		const sessionIdHandler = eventHandlers.get('session-id')!;
		const statsHandler = eventHandlers.get('gemini-session-stats')!;
		const exitHandler = eventHandlers.get('exit')!;

		// Set up session mapping
		sessionIdHandler('maestro-session-4', 'gemini-uuid-jkl');

		// Record some stats
		statsHandler('maestro-session-4', {
			sessionId: 'maestro-session-4',
			inputTokens: 100,
			outputTokens: 50,
			cacheReadTokens: 0,
			reasoningTokens: 0,
		} as GeminiSessionStatsEvent);

		// Exit cleans up
		exitHandler('maestro-session-4');

		// Stats already persisted are still in the store
		expect(storeData.stats['gemini-uuid-jkl']).toBeDefined();
		expect(storeData.stats['gemini-uuid-jkl'].inputTokens).toBe(100);
	});
});
