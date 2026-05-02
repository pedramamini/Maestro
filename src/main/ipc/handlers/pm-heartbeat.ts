/**
 * pm:heartbeat IPC handler (#435, #444).
 *
 * Agents call this channel every 60 s while they hold an active claim on a
 * work item. The handler updates the in-memory ClaimTracker and renews the
 * matching Work Graph claim so restarts and stale sweeps have durable state.
 *
 * Gated by the `deliveryPlanner` encore feature flag (same gate as pm-tools).
 */

import { ipcMain } from 'electron';
import { requireEncoreFeature } from '../../utils/requireEncoreFeature';
import type { SettingsStoreInterface } from '../../stores/types';
import { getClaimTracker } from '../../agent-dispatch/claim-tracker';
import { createLocalPmService } from '../../local-pm';
import { logger } from '../../utils/logger';

const LOG_CONTEXT = '[PmHeartbeat]';

export interface PmHeartbeatHandlerDependencies {
	settingsStore: SettingsStoreInterface;
}

export function registerPmHeartbeatHandlers(deps: PmHeartbeatHandlerDependencies): void {
	ipcMain.handle('pm:heartbeat', async (_event, projectItemId: string) => {
		// Gate: encore flag must be enabled
		const gateError = requireEncoreFeature(deps.settingsStore, 'deliveryPlanner');
		if (gateError) return gateError;

		if (!projectItemId || typeof projectItemId !== 'string') {
			return { success: false, error: 'projectItemId is required' };
		}

		const now = new Date().toISOString();
		const tracker = getClaimTracker();
		const claim = tracker.getByProjectItemId(projectItemId);
		const found = tracker.renewHeartbeat(projectItemId);

		if (!found || !claim) {
			// No in-memory claim for this item — signal the agent to stop the beat loop.
			return { success: false, error: `No active claim for projectItemId: ${projectItemId}` };
		}

		await createLocalPmService().heartbeat({
			projectPath: claim.projectPath,
			workItemId: claim.projectItemId,
			agentId: claim.agentSessionId,
			role: claim.role,
			note: 'agent heartbeat',
		});

		logger.debug(`heartbeat projectItem=${projectItemId} at=${now}`, LOG_CONTEXT);
		return { success: true, data: { projectItemId, lastHeartbeat: now } };
	});
}
