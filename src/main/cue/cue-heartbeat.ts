/**
 * Heartbeat writer and sleep/wake detection for the Cue Engine.
 *
 * Writes a heartbeat timestamp to the Cue database every 30 seconds.
 * On engine start, checks the gap since the last heartbeat; if the gap
 * exceeds 2 minutes, triggers the reconciler for missed time-based events.
 */

import type { MainLogLevel } from '../../shared/logger-types';
import { updateHeartbeat, getLastHeartbeat } from './cue-db';
import { reconcileMissedTimeEvents } from './cue-reconciler';
import type { ReconcileSessionInfo } from './cue-reconciler';
import type { CueConfig, CueEvent, CueSubscription } from './cue-types';

export const HEARTBEAT_INTERVAL_MS = 30_000; // 30 seconds
export const SLEEP_THRESHOLD_MS = 120_000; // 2 minutes
export const EVENT_PRUNE_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface CueHeartbeatDeps {
	onLog: (level: MainLogLevel, message: string, data?: unknown) => void;
	getSessions: () => Map<string, { config: CueConfig; sessionName: string }>;
	onDispatch: (sessionId: string, sub: CueSubscription, event: CueEvent) => void;
}

export interface CueHeartbeat {
	start(): void;
	stop(): void;
	/** Run sleep detection and reconciliation (also called on engine start) */
	detectSleepAndReconcile(): void;
}

export function createCueHeartbeat(deps: CueHeartbeatDeps): CueHeartbeat {
	let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

	function startHeartbeat(): void {
		stopHeartbeat();
		try {
			updateHeartbeat();
		} catch {
			// Non-fatal if DB not ready
		}
		heartbeatInterval = setInterval(() => {
			try {
				updateHeartbeat();
			} catch {
				// Non-fatal
			}
		}, HEARTBEAT_INTERVAL_MS);
	}

	function stopHeartbeat(): void {
		if (heartbeatInterval) {
			clearInterval(heartbeatInterval);
			heartbeatInterval = null;
		}
	}

	function detectSleepAndReconcile(): void {
		try {
			const lastHeartbeat = getLastHeartbeat();
			if (lastHeartbeat === null) return; // First ever start — nothing to reconcile

			const now = Date.now();
			const gapMs = now - lastHeartbeat;

			if (gapMs < SLEEP_THRESHOLD_MS) return;

			const gapMinutes = Math.round(gapMs / 60_000);
			deps.onLog('cue', `[CUE] Sleep detected (gap: ${gapMinutes}m). Reconciling missed events.`);

			// Build session info map for the reconciler
			const reconcileSessions = new Map<string, ReconcileSessionInfo>();
			const sessions = deps.getSessions();
			for (const [sessionId, state] of sessions) {
				reconcileSessions.set(sessionId, {
					config: state.config,
					sessionName: state.sessionName,
				});
			}

			reconcileMissedTimeEvents({
				sleepStartMs: lastHeartbeat,
				wakeTimeMs: now,
				sessions: reconcileSessions,
				onDispatch: (sessionId, sub, event) => {
					deps.onDispatch(sessionId, sub, event);
				},
				onLog: (level, message) => {
					deps.onLog(level as MainLogLevel, message);
				},
			});
		} catch (error) {
			deps.onLog('warn', `[CUE] Sleep detection failed: ${error}`);
		}
	}

	return {
		start: startHeartbeat,
		stop: stopHeartbeat,
		detectSleepAndReconcile,
	};
}
