/**
 * Gemini session stats listener.
 * Accumulates per-turn token usage from live Gemini CLI sessions and persists
 * them to the gemini-session-stats electron-store.
 *
 * Gemini reports usage per-turn (NOT cumulative), so this listener sums values
 * across turns for each session. Stats are keyed by the Gemini agent session_id
 * (UUID from the init event) so they can be matched against session files later.
 */

import type Store from 'electron-store';
import type { ProcessManager } from '../process-manager';
import type { GeminiSessionStatsEvent } from '../process-manager/types';
import type { GeminiSessionStatsData } from '../stores/types';
import type { ProcessListenerDependencies } from './types';

/**
 * Sets up the gemini-session-stats listener.
 * Tracks Maestro sessionId → Gemini agent sessionId mappings via session-id events,
 * then accumulates per-turn token usage into the stats store keyed by agent sessionId.
 */
export function setupGeminiStatsListener(
	processManager: ProcessManager,
	deps: Pick<ProcessListenerDependencies, 'logger'>,
	geminiStatsStore: Store<GeminiSessionStatsData> | undefined
): void {
	const { logger } = deps;

	if (!geminiStatsStore) {
		logger.warn('Gemini session stats store not available, skipping listener setup', 'GeminiStats');
		return;
	}

	// Track Maestro sessionId → Gemini agent sessionId (UUID)
	const sessionIdMap = new Map<string, string>();
	// Buffer stats for sessions whose agent sessionId isn't known yet
	const pendingStats = new Map<string, { inputTokens: number; outputTokens: number; cacheReadTokens: number; reasoningTokens: number }>();

	// Listen for session-id events to build the mapping
	processManager.on('session-id', (maestroSessionId: string, agentSessionId: string) => {
		sessionIdMap.set(maestroSessionId, agentSessionId);

		// Flush any buffered stats for this session
		const buffered = pendingStats.get(maestroSessionId);
		if (buffered) {
			pendingStats.delete(maestroSessionId);
			persistStats(agentSessionId, buffered);
		}
	});

	// Listen for gemini-session-stats events and accumulate
	processManager.on('gemini-session-stats', (_maestroSessionId: string, stats: GeminiSessionStatsEvent) => {
		const maestroSessionId = stats.sessionId;
		const agentSessionId = sessionIdMap.get(maestroSessionId);

		const turnStats = {
			inputTokens: stats.inputTokens,
			outputTokens: stats.outputTokens,
			cacheReadTokens: stats.cacheReadTokens,
			reasoningTokens: stats.reasoningTokens,
		};

		if (agentSessionId) {
			persistStats(agentSessionId, turnStats);
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
	});

	// Clean up mappings when a process exits
	processManager.on('exit', (maestroSessionId: string) => {
		sessionIdMap.delete(maestroSessionId);
		pendingStats.delete(maestroSessionId);
	});

	function persistStats(
		agentSessionId: string,
		turnStats: { inputTokens: number; outputTokens: number; cacheReadTokens: number; reasoningTokens: number }
	): void {
		const allStats = geminiStatsStore!.get('stats', {});
		const existing = allStats[agentSessionId];

		if (existing) {
			existing.inputTokens += turnStats.inputTokens;
			existing.outputTokens += turnStats.outputTokens;
			existing.cacheReadTokens += turnStats.cacheReadTokens;
			existing.reasoningTokens += turnStats.reasoningTokens;
			existing.lastUpdatedMs = Date.now();
		} else {
			allStats[agentSessionId] = {
				inputTokens: turnStats.inputTokens,
				outputTokens: turnStats.outputTokens,
				cacheReadTokens: turnStats.cacheReadTokens,
				reasoningTokens: turnStats.reasoningTokens,
				lastUpdatedMs: Date.now(),
			};
		}

		geminiStatsStore!.set('stats', allStats);
	}
}
