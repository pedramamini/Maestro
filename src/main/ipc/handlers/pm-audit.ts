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
import { runLocalPmAudit, type LocalPmAuditReport } from '../../local-pm/pm-tools';
import type { SettingsStoreInterface } from '../../stores/types';
import { logger } from '../../utils/logger';

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
	data: LocalPmAuditReport;
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
			const report = await runLocalPmAudit({
				staleClaimMs: opts.staleClaimMs ?? 5 * 60 * 1000,
				projectPath: opts.projectPath,
				projectRoleSlots: opts.projectRoleSlots,
			});
			if (!report.success) {
				return report;
			}

			logger.info(
				`pmAudit:run complete — audited=${report.data.totalAudited} autoFixed=${report.data.autoFixed.length} needsAttention=${report.data.needsAttention.length} errors=${report.data.errors.length}`,
				LOG_CONTEXT
			);

			return { success: true, data: report.data } satisfies PmAuditRunResult;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			logger.error(`pmAudit:run failed: ${message}`, LOG_CONTEXT);
			return { success: false, error: message };
		}
	});

	logger.info('PM Audit IPC handlers registered', LOG_CONTEXT);
}
