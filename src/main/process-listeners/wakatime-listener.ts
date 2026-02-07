/**
 * WakaTime heartbeat listener.
 * Sends WakaTime heartbeats on query-complete events and cleans up on process exit.
 */

import type { ProcessManager } from '../process-manager';
import type { QueryCompleteData } from '../process-manager/types';
import type { WakaTimeManager } from '../wakatime-manager';

/**
 * Sets up the WakaTime heartbeat listener on query-complete and exit events.
 * Heartbeat calls are fire-and-forget (no await needed in the listener).
 */
export function setupWakaTimeListener(
	processManager: ProcessManager,
	wakaTimeManager: WakaTimeManager
): void {
	// Send heartbeat on query-complete (same event the stats listener uses)
	processManager.on('query-complete', (_sessionId: string, queryData: QueryCompleteData) => {
		const projectPath = queryData.projectPath || queryData.sessionId;
		const projectName = queryData.tabId || queryData.sessionId;
		void wakaTimeManager.sendHeartbeat(queryData.sessionId, projectPath, projectName);
	});

	// Clean up debounce tracking when a process exits
	processManager.on('exit', (sessionId: string) => {
		wakaTimeManager.removeSession(sessionId);
	});
}
