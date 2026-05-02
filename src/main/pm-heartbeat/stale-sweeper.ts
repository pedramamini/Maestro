/**
 * Stale-claim sweeper (#435, #444).
 *
 * Runs on a configurable interval (default: 30 s). Iterates the in-memory
 * ClaimTracker looking for claims whose lastHeartbeatAt is older than
 * staleMs (default: 5 min). If found, releases the matching Work Graph claim
 * and returns the item to Ready.
 *
 * This is intentionally separate from the pmAudit on-demand runner (#434):
 *   - sweeper = continuous background auto-release
 *   - audit   = on-demand multi-check health report
 */

import { getClaimTracker, type ClaimInfo } from '../agent-dispatch/claim-tracker';
import { auditLog } from '../agent-dispatch/dispatch-audit-log';
import { logger } from '../utils/logger';
import { createLocalPmService } from '../local-pm';

const LOG_CONTEXT = '[StaleSweeper]';

export interface StaleSweeperOptions {
	/** Age threshold in ms before a claimed item is considered stale. Default: 5 min. */
	staleMs?: number;
	/** How often to run the sweep. Default: 30 s. */
	intervalMs?: number;
}

/**
 * Start the stale-claim sweeper. Returns the interval handle so the caller can
 * stop it on app shutdown if needed.
 */
export function startStaleClaimSweeper(opts: StaleSweeperOptions = {}): NodeJS.Timeout {
	const staleMs = opts.staleMs ?? 5 * 60 * 1000; // 5 minutes
	const intervalMs = opts.intervalMs ?? 30 * 1000; // 30 seconds

	logger.info(
		`Stale-claim sweeper started (staleMs=${staleMs}, intervalMs=${intervalMs})`,
		LOG_CONTEXT
	);

	const handle = setInterval(() => {
		runSweep(staleMs).catch((err) => {
			logger.warn(
				`Stale-claim sweep error: ${err instanceof Error ? err.message : String(err)}`,
				LOG_CONTEXT
			);
		});
	}, intervalMs);

	// Don't block Node from exiting if the sweeper is the last thing alive.
	if (handle.unref) handle.unref();

	return handle;
}

async function runSweep(staleMs: number): Promise<void> {
	const tracker = getClaimTracker();
	const staleClaims = tracker.getStaleClaims(staleMs);

	if (staleClaims.length === 0) return;

	logger.info(`Stale-claim sweep found ${staleClaims.length} stale claim(s)`, LOG_CONTEXT);

	for (const claim of staleClaims) {
		await releaseStale(claim);
	}
}

async function releaseStale(claim: ClaimInfo): Promise<void> {
	const tracker = getClaimTracker();

	try {
		await createLocalPmService().releaseClaim({
			projectPath: claim.projectPath,
			workItemId: claim.projectItemId,
			agentId: claim.agentSessionId,
			revertStatusTo: 'ready',
			note: `Auto-released after missing heartbeat (agentSessionId=${claim.agentSessionId} role=${claim.role})`,
		});

		tracker.removeClaim(claim.agentSessionId, claim.role);

		auditLog('heartbeat_stale', {
			actor: 'stale-sweeper',
			workItemId: claim.projectItemId,
			reason: `Auto-released after agent timeout (agentSessionId=${claim.agentSessionId} role=${claim.role})`,
		});

		logger.info(
			`Stale-claim auto-released: projectItem=${claim.projectItemId} role=${claim.role}`,
			LOG_CONTEXT
		);
	} catch (err) {
		logger.warn(
			`Stale sweep: failed to release claim for projectItem=${claim.projectItemId}: ${
				err instanceof Error ? err.message : String(err)
			}`,
			LOG_CONTEXT
		);
	}
}
