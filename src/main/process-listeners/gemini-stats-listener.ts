/**
 * Gemini session stats listener.
 * Accumulates per-turn token usage from live Gemini CLI sessions and persists
 * them to the gemini-session-stats electron-store.
 *
 * Gemini reports usage per-turn (NOT cumulative), so this listener sums values
 * across turns for each session. Stats are keyed by the Gemini agent session_id
 * (UUID from the init event) so they can be matched against session files later.
 *
 * Performance: Stats are accumulated in memory and flushed to the store on a
 * debounced 5-second interval (instead of per-event), on process exit, and on
 * app shutdown via the returned handle's flushAll() method.
 */

import type Store from 'electron-store';
import type { ProcessManager } from '../process-manager';
import type { GeminiSessionStatsEvent } from '../process-manager/types';
import type { GeminiSessionStatsData } from '../stores/types';
import type { ProcessListenerDependencies } from './types';

/** Handle returned by setupGeminiStatsListener for shutdown coordination */
export interface GeminiStatsListenerHandle {
	/** Flush all accumulated stats to the store immediately */
	flushAll: () => void;
}

/** How long to debounce before flushing accumulated stats to disk (ms) */
const FLUSH_INTERVAL_MS = 5_000;

/** Stats entries older than this are pruned on startup (90 days) */
const PRUNE_AGE_MS = 90 * 24 * 60 * 60 * 1_000;

type TokenStats = {
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	reasoningTokens: number;
};

/**
 * Sets up the gemini-session-stats listener.
 * Tracks Maestro sessionId → Gemini agent sessionId mappings via session-id events,
 * then accumulates per-turn token usage in memory and flushes to the store on a
 * debounced interval.
 *
 * @returns A handle with flushAll() for shutdown coordination, or undefined if no store
 */
export function setupGeminiStatsListener(
	processManager: ProcessManager,
	deps: Pick<ProcessListenerDependencies, 'logger'>,
	geminiStatsStore: Store<GeminiSessionStatsData> | undefined
): GeminiStatsListenerHandle | undefined {
	const { logger } = deps;

	if (!geminiStatsStore) {
		logger.warn('Gemini session stats store not available, skipping listener setup', 'GeminiStats');
		return undefined;
	}

	// Prune stale entries on startup
	pruneStaleEntries(geminiStatsStore, logger);

	// Track Maestro sessionId → Gemini agent sessionId (UUID)
	const sessionIdMap = new Map<string, string>();
	// Buffer stats for sessions whose agent sessionId isn't known yet
	const pendingStats = new Map<string, TokenStats>();

	// In-memory accumulator keyed by agentSessionId — flushed to store on timer/exit/shutdown
	const statsAccumulator = new Map<string, TokenStats>();
	let flushTimer: ReturnType<typeof setTimeout> | null = null;

	function scheduleFlush(): void {
		if (flushTimer) return; // already scheduled
		flushTimer = setTimeout(() => {
			flushTimer = null;
			flushAllStats();
		}, FLUSH_INTERVAL_MS);
	}

	function flushAllStats(): void {
		if (flushTimer) {
			clearTimeout(flushTimer);
			flushTimer = null;
		}
		if (statsAccumulator.size === 0) return;

		const allStats = geminiStatsStore!.get('stats', {});
		const now = Date.now();

		for (const [agentSessionId, accumulated] of statsAccumulator) {
			const existing = allStats[agentSessionId];
			if (existing) {
				existing.inputTokens += accumulated.inputTokens;
				existing.outputTokens += accumulated.outputTokens;
				existing.cacheReadTokens += accumulated.cacheReadTokens;
				existing.reasoningTokens += accumulated.reasoningTokens;
				existing.lastUpdatedMs = now;
			} else {
				allStats[agentSessionId] = { ...accumulated, lastUpdatedMs: now };
			}
		}

		statsAccumulator.clear();
		geminiStatsStore!.set('stats', allStats);
	}

	function accumulateStats(agentSessionId: string, turnStats: TokenStats): void {
		const existing = statsAccumulator.get(agentSessionId);
		if (existing) {
			existing.inputTokens += turnStats.inputTokens;
			existing.outputTokens += turnStats.outputTokens;
			existing.cacheReadTokens += turnStats.cacheReadTokens;
			existing.reasoningTokens += turnStats.reasoningTokens;
		} else {
			statsAccumulator.set(agentSessionId, { ...turnStats });
		}
		scheduleFlush();
	}

	// Listen for session-id events to build the mapping
	processManager.on('session-id', (maestroSessionId: string, agentSessionId: string) => {
		sessionIdMap.set(maestroSessionId, agentSessionId);

		// Flush any buffered stats for this session
		const buffered = pendingStats.get(maestroSessionId);
		if (buffered) {
			pendingStats.delete(maestroSessionId);
			accumulateStats(agentSessionId, buffered);
		}
	});

	// Listen for gemini-session-stats events and accumulate
	processManager.on(
		'gemini-session-stats',
		(_maestroSessionId: string, stats: GeminiSessionStatsEvent) => {
			const maestroSessionId = stats.sessionId;
			const agentSessionId = sessionIdMap.get(maestroSessionId);

			const turnStats: TokenStats = {
				inputTokens: stats.inputTokens,
				outputTokens: stats.outputTokens,
				cacheReadTokens: stats.cacheReadTokens,
				reasoningTokens: stats.reasoningTokens,
			};

			if (agentSessionId) {
				accumulateStats(agentSessionId, turnStats);
			} else {
				// Buffer until session-id event fires
				const existing = pendingStats.get(maestroSessionId);
				if (existing) {
					existing.inputTokens += turnStats.inputTokens;
					existing.outputTokens += turnStats.outputTokens;
					existing.cacheReadTokens += turnStats.cacheReadTokens;
					existing.reasoningTokens += turnStats.reasoningTokens;
				} else {
					pendingStats.set(maestroSessionId, { ...turnStats });
				}
			}
		}
	);

	// Flush accumulated stats and clean up mappings when a process exits
	processManager.on('exit', (maestroSessionId: string) => {
		flushAllStats();
		sessionIdMap.delete(maestroSessionId);
		pendingStats.delete(maestroSessionId);
	});

	return { flushAll: flushAllStats };
}

/**
 * Removes stats entries older than PRUNE_AGE_MS from the store.
 * Called once on listener startup.
 */
function pruneStaleEntries(
	store: Store<GeminiSessionStatsData>,
	logger: Pick<ProcessListenerDependencies, 'logger'>['logger']
): void {
	const allStats = store.get('stats', {});
	const cutoff = Date.now() - PRUNE_AGE_MS;
	let pruned = 0;

	for (const [key, entry] of Object.entries(allStats)) {
		if (entry.lastUpdatedMs < cutoff) {
			delete allStats[key];
			pruned++;
		}
	}

	if (pruned > 0) {
		store.set('stats', allStats);
		logger.info(`Pruned ${pruned} stale Gemini stats entries (>90 days old)`, 'GeminiStats');
	}
}
