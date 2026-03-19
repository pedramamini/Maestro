/**
 * Fan-in completion tracker for the Cue Engine.
 *
 * Tracks multi-source agent.completed subscriptions: when a subscription
 * lists multiple source_sessions, this module accumulates completions
 * and fires the downstream subscription when all sources have reported
 * (or on timeout, depending on the timeout_on_fail setting).
 */

import * as crypto from 'crypto';
import type { MainLogLevel } from '../../shared/logger-types';
import type { SessionInfo } from '../../shared/types';
import type { AgentCompletionData, CueEvent, CueSettings, CueSubscription } from './cue-types';

export const SOURCE_OUTPUT_MAX_CHARS = 5000;

/** Stored data for a single fan-in source completion */
export interface FanInSourceCompletion {
	sessionId: string;
	sessionName: string;
	output: string;
	truncated: boolean;
	chainDepth: number;
}

export interface CueFanInDeps {
	onLog: (level: MainLogLevel, message: string, data?: unknown) => void;
	getSessions: () => SessionInfo[];
	dispatchSubscription: (
		ownerSessionId: string,
		sub: CueSubscription,
		event: CueEvent,
		sourceSessionName: string,
		chainDepth?: number
	) => void;
}

export interface CueFanInTracker {
	handleCompletion(
		ownerSessionId: string,
		settings: CueSettings,
		sub: CueSubscription,
		sources: string[],
		completedSessionId: string,
		completedSessionName: string,
		completionData?: AgentCompletionData
	): void;
	clearForSession(sessionId: string): void;
	reset(): void;
}

export function createCueFanInTracker(deps: CueFanInDeps): CueFanInTracker {
	const fanInTrackers = new Map<string, Map<string, FanInSourceCompletion>>();
	const fanInTimers = new Map<string, ReturnType<typeof setTimeout>>();

	function handleFanInTimeout(
		key: string,
		ownerSessionId: string,
		settings: CueSettings,
		sub: CueSubscription,
		sources: string[]
	): void {
		fanInTimers.delete(key);
		const tracker = fanInTrackers.get(key);
		if (!tracker) return;

		const completedNames = [...tracker.values()].map((c) => c.sessionName);
		const completedIds = [...tracker.keys()];

		// Determine which sources haven't completed yet
		const allSessions = deps.getSessions();
		const timedOutSources = sources.filter((src) => {
			const session = allSessions.find((s) => s.name === src || s.id === src);
			const sessionId = session?.id ?? src;
			return !completedIds.includes(sessionId) && !completedIds.includes(src);
		});

		if (settings.timeout_on_fail === 'continue') {
			// Fire with partial data
			const completions = [...tracker.values()];
			fanInTrackers.delete(key);

			const event: CueEvent = {
				id: crypto.randomUUID(),
				type: 'agent.completed',
				timestamp: new Date().toISOString(),
				triggerName: sub.name,
				payload: {
					completedSessions: completions.map((c) => c.sessionId),
					timedOutSessions: timedOutSources,
					sourceSession: completions.map((c) => c.sessionName).join(', '),
					sourceOutput: completions.map((c) => c.output).join('\n---\n'),
					outputTruncated: completions.some((c) => c.truncated),
					partial: true,
				},
			};
			const maxChainDepth =
				completions.length > 0 ? Math.max(...completions.map((c) => c.chainDepth)) : 0;
			deps.onLog(
				'cue',
				`[CUE] Fan-in "${sub.name}" timed out (continue mode) — firing with ${completedNames.length}/${sources.length} sources`
			);
			deps.dispatchSubscription(
				ownerSessionId,
				sub,
				event,
				completedNames.join(', '),
				maxChainDepth
			);
		} else {
			// 'break' mode — log failure and clear
			fanInTrackers.delete(key);
			deps.onLog(
				'cue',
				`[CUE] Fan-in "${sub.name}" timed out (break mode) — ${completedNames.length}/${sources.length} completed, waiting for: ${timedOutSources.join(', ')}`
			);
		}
	}

	return {
		handleCompletion(
			ownerSessionId: string,
			settings: CueSettings,
			sub: CueSubscription,
			sources: string[],
			completedSessionId: string,
			completedSessionName: string,
			completionData?: AgentCompletionData
		): void {
			const key = `${ownerSessionId}:${sub.name}`;

			if (!fanInTrackers.has(key)) {
				fanInTrackers.set(key, new Map());
			}
			const tracker = fanInTrackers.get(key)!;
			const rawOutput = completionData?.stdout ?? '';
			tracker.set(completedSessionId, {
				sessionId: completedSessionId,
				sessionName: completedSessionName,
				output: rawOutput.slice(-SOURCE_OUTPUT_MAX_CHARS),
				truncated: rawOutput.length > SOURCE_OUTPUT_MAX_CHARS,
				chainDepth: completionData?.chainDepth ?? 0,
			});

			// Start timeout timer on first source completion
			if (tracker.size === 1 && !fanInTimers.has(key)) {
				const timeoutMs = (settings.timeout_minutes ?? 30) * 60 * 1000;
				const timer = setTimeout(() => {
					handleFanInTimeout(key, ownerSessionId, settings, sub, sources);
				}, timeoutMs);
				fanInTimers.set(key, timer);
			}

			const remaining = sources.length - tracker.size;
			if (remaining > 0) {
				deps.onLog('cue', `[CUE] Fan-in "${sub.name}": waiting for ${remaining} more session(s)`);
				return;
			}

			// All sources completed — clear timer and fire
			const timer = fanInTimers.get(key);
			if (timer) {
				clearTimeout(timer);
				fanInTimers.delete(key);
			}
			fanInTrackers.delete(key);

			const completions = [...tracker.values()];
			const event: CueEvent = {
				id: crypto.randomUUID(),
				type: 'agent.completed',
				timestamp: new Date().toISOString(),
				triggerName: sub.name,
				payload: {
					completedSessions: completions.map((c) => c.sessionId),
					sourceSession: completions.map((c) => c.sessionName).join(', '),
					sourceOutput: completions.map((c) => c.output).join('\n---\n'),
					outputTruncated: completions.some((c) => c.truncated),
				},
			};
			const maxChainDepth =
				completions.length > 0 ? Math.max(...completions.map((c) => c.chainDepth)) : 0;
			deps.onLog('cue', `[CUE] "${sub.name}" triggered (agent.completed, fan-in complete)`);
			deps.dispatchSubscription(
				ownerSessionId,
				sub,
				event,
				completions.map((c) => c.sessionName).join(', '),
				maxChainDepth
			);
		},

		clearForSession(sessionId: string): void {
			for (const key of [...fanInTrackers.keys()]) {
				if (key.startsWith(`${sessionId}:`)) {
					fanInTrackers.delete(key);
					const timer = fanInTimers.get(key);
					if (timer) {
						clearTimeout(timer);
						fanInTimers.delete(key);
					}
				}
			}
		},

		reset(): void {
			for (const timer of fanInTimers.values()) {
				clearTimeout(timer);
			}
			fanInTrackers.clear();
			fanInTimers.clear();
		},
	};
}
