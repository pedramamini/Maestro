/**
 * Heartbeat writer for the Cue Engine.
 *
 * Writes a heartbeat timestamp to the Cue database every 30 seconds. The
 * sleep-gap detection and missed-event reconciliation that used to live here
 * moved to {@link createCueRecoveryService} so that bootstrap, recovery, and
 * heartbeat-writing each have a single owner.
 */

import { updateHeartbeat } from './cue-db';

export const HEARTBEAT_INTERVAL_MS = 30_000; // 30 seconds

/** @deprecated Re-exported for backwards compat with cue-recovery-service. */
export { SLEEP_THRESHOLD_MS, EVENT_PRUNE_AGE_MS } from './cue-recovery-service';

export interface CueHeartbeat {
	start(): void;
	stop(): void;
}

export function createCueHeartbeat(): CueHeartbeat {
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

	return {
		start: startHeartbeat,
		stop: stopHeartbeat,
	};
}
