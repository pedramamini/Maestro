/**
 * PM Audit IPC Handler — #434
 *
 * Exposes the `pmAudit:run` channel so the renderer (or tests) can trigger a
 * full audit sweep of all in-flight work items.
 *
 * Gated by the `agentDispatch` encore feature flag (same gate as the other
 * agent-dispatch handlers; the audit is only meaningful when dispatch is active).
 *
 * Channel:
 *   pmAudit:run  (opts?: PmAuditRunOptions)  → PmAuditRunResult
 */

import { ipcMain } from 'electron';
import { requireEncoreFeature } from '../../utils/requireEncoreFeature';
import { runAudit } from '../../pm-audit/audit-runner';
import type { AuditReport } from '../../pm-audit/audit-runner';
import type { SettingsStoreInterface } from '../../stores/types';
import { logger } from '../../utils/logger';
import { getProjectReferenceForPath } from '../../agent-dispatch/github-project-mapping';
import type { GithubProjectReference } from '../../agent-dispatch/github-project-coordinator';

const LOG_CONTEXT = '[PmAudit]';

/** Options accepted by the `pmAudit:run` IPC channel. */
export interface PmAuditRunOptions {
	/** Override the staleness threshold in milliseconds. Default: 5 minutes. */
	staleClaimMs?: number;
	/** Project path used to resolve per-project GitHub Projects v2 coordinates. */
	projectPath?: string;
	/**
	 * Per-project role slot map (role → agentId). When omitted, check
	 * ORPHANED_SLOT_AGENT is skipped for this run.
	 */
	projectRoleSlots?: Partial<Record<string, string>>;
}

export interface PmAuditRunResult {
	success: true;
	data: AuditReport;
}

export interface PmAuditHandlerDependencies {
	settingsStore: SettingsStoreInterface;
}

export function registerPmAuditHandlers(deps: PmAuditHandlerDependencies): void {
	const gate = () => requireEncoreFeature(deps.settingsStore, 'agentDispatch');

	// ── pmAudit:run ───────────────────────────────────────────────────────────
	ipcMain.handle('pmAudit:run', async (_event, opts: PmAuditRunOptions = {}) => {
		const gateError = gate();
		if (gateError) {
			logger.debug('agentDispatch flag off — rejecting pmAudit:run', LOG_CONTEXT);
			return gateError;
		}

		try {
			const project = opts.projectPath
				? getProjectReferenceForPath(deps.settingsStore, opts.projectPath)
				: getOnlyProjectReference(deps.settingsStore);

			const report = await runAudit({
				now: Date.now(),
				staleClaimMs: opts.staleClaimMs ?? 5 * 60 * 1000,
				projectRoleSlots: opts.projectRoleSlots,
				...(project && { project }),
			});

			logger.info(
				`pmAudit:run complete — audited=${report.totalAudited} autoFixed=${report.autoFixed.length} needsAttention=${report.needsAttention.length} errors=${report.errors.length}`,
				LOG_CONTEXT
			);

			return { success: true, data: report } satisfies PmAuditRunResult;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			logger.error(`pmAudit:run failed: ${message}`, LOG_CONTEXT);
			return { success: false, error: message };
		}
	});

	logger.info('PM Audit IPC handlers registered', LOG_CONTEXT);
}

function getOnlyProjectReference(
	settingsStore: SettingsStoreInterface
): GithubProjectReference | undefined {
	const map = settingsStore.get<Record<string, unknown>>('projectGithubMap', {});
	const entries = Object.entries(map);
	if (entries.length !== 1) return undefined;
	const [projectPath] = entries[0];
	return getProjectReferenceForPath(settingsStore, projectPath);
}
