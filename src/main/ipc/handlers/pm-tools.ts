/**
 * pm-tools IPC handlers — agent-callable project management tools (#430).
 *
 * Exposes three channels that agents call at workflow transitions to self-update
 * their claimed work item in Maestro Board / Work Graph:
 *
 *   pm:setStatus  → updates AI Status field for the agent's claimed item
 *   pm:setRole    → updates AI Role field for the agent's claimed item
 *   pm:setBlocked → sets AI Status=Blocked + posts a comment with the reason
 *
 * Each handler:
 *  1. Resolves the calling agent's currently-claimed work item via in-memory ClaimTracker.
 *  2. Enforces ownership — agents cannot update items they don't own.
 *  3. Persists the new field value to GitHub Projects v2 via the project coordinator
 *  3. Persists the new PM value to Work Graph.
 *  4. Records an audit event in the local JSONL audit log.
 *
 * Gated by the `deliveryPlanner` encore feature flag (same gate as delivery-planner handlers).
 */

import { ipcMain } from 'electron';
import { requireEncoreFeature } from '../../utils/requireEncoreFeature';
import type { SettingsStoreInterface } from '../../stores/types';
import { getClaimTracker } from '../../agent-dispatch/claim-tracker';
import { auditLog } from '../../agent-dispatch/dispatch-audit-log';
import { sweepMergedBranches } from '../../pm-branch-hygiene/branch-cleaner';
import { setLocalPmBlocked, setLocalPmRole, setLocalPmStatus } from '../../local-pm/pm-tools';
import { logger } from '../../utils/logger';

const LOG_CONTEXT = '[PmTools]';

export interface PmToolsSetStatusInput {
	/** The agent's own session ID — used to look up its current claim. */
	agentSessionId: string;
	/** Target status value — must match an AI Status field option name. */
	status: string;
}

export interface PmToolsSetRoleInput {
	agentSessionId: string;
	/** Target role value — must match an AI Role field option name. */
	role: string;
}

export interface PmToolsSetBlockedInput {
	agentSessionId: string;
	/** Human-readable reason posted as a GitHub comment and recorded in the audit log. */
	reason: string;
}

export interface PmToolsResult {
	workItemId: string;
	field: string;
	value: string;
}

export interface PmToolsHandlerDependencies {
	settingsStore: SettingsStoreInterface;
}

export function registerPmToolsHandlers(deps: PmToolsHandlerDependencies): void {
	/** Returns structured error if deliveryPlanner encore flag is off. */
	const gate = () => requireEncoreFeature(deps.settingsStore, 'deliveryPlanner');

	// ── pm:setStatus ──────────────────────────────────────────────────────────
	ipcMain.handle('pm:setStatus', async (_event, input: PmToolsSetStatusInput) => {
		const gateError = gate();
		if (gateError) return gateError;

		try {
			const claim = getClaimTracker().getByAgent(input.agentSessionId);
			if (!claim) {
				return {
					success: false,
					error: `Agent session "${input.agentSessionId}" has no active claim`,
				};
			}

			const result = await setLocalPmStatus({
				agentSessionId: input.agentSessionId,
				status: input.status,
				projectPath: claim.projectPath,
				workItemId: claim.projectItemId,
			});
			if (!result.success) {
				return result;
			}

			auditLog('status_change', {
				actor: input.agentSessionId,
				workItemId: claim.projectItemId,
				priorState: { role: claim.role },
				newState: { 'AI Status': input.status },
			});

			logger.info(
				`pm:setStatus projectItem=${claim.projectItemId} status=${input.status}`,
				LOG_CONTEXT
			);

			// Merger-done branch cleanup — best-effort
			if (input.status.toLowerCase() === 'done' && claim.projectPath) {
				void tryDeleteBranch(claim.projectPath, claim.projectItemId);
			}

			return {
				success: true,
				data: result.data satisfies PmToolsResult,
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			logger.error(`pm:setStatus failed: ${message}`, LOG_CONTEXT);
			return { success: false, error: message };
		}
	});

	// ── pm:setRole ────────────────────────────────────────────────────────────
	ipcMain.handle('pm:setRole', async (_event, input: PmToolsSetRoleInput) => {
		const gateError = gate();
		if (gateError) return gateError;

		try {
			const claim = getClaimTracker().getByAgent(input.agentSessionId);
			if (!claim) {
				return {
					success: false,
					error: `Agent session "${input.agentSessionId}" has no active claim`,
				};
			}

			const result = await setLocalPmRole({
				agentSessionId: input.agentSessionId,
				role: input.role,
				projectPath: claim.projectPath,
				workItemId: claim.projectItemId,
			});
			if (!result.success) {
				return result;
			}

			auditLog('role_change', {
				actor: input.agentSessionId,
				workItemId: claim.projectItemId,
				priorState: { role: claim.role },
				newState: { 'AI Role': input.role },
			});

			logger.info(`pm:setRole projectItem=${claim.projectItemId} role=${input.role}`, LOG_CONTEXT);
			return {
				success: true,
				data: result.data satisfies PmToolsResult,
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			logger.error(`pm:setRole failed: ${message}`, LOG_CONTEXT);
			return { success: false, error: message };
		}
	});

	// ── pm:setBlocked ─────────────────────────────────────────────────────────
	ipcMain.handle('pm:setBlocked', async (_event, input: PmToolsSetBlockedInput) => {
		const gateError = gate();
		if (gateError) return gateError;

		try {
			const claim = getClaimTracker().getByAgent(input.agentSessionId);
			if (!claim) {
				return {
					success: false,
					error: `Agent session "${input.agentSessionId}" has no active claim`,
				};
			}

			const result = await setLocalPmBlocked({
				agentSessionId: input.agentSessionId,
				reason: input.reason,
				projectPath: claim.projectPath,
				workItemId: claim.projectItemId,
			});
			if (!result.success) {
				return result;
			}

			auditLog('blocked', {
				actor: input.agentSessionId,
				workItemId: claim.projectItemId,
				priorState: { 'AI Status': 'In Progress' },
				newState: { 'AI Status': 'Blocked' },
				reason: input.reason,
			});

			logger.info(
				`pm:setBlocked projectItem=${claim.projectItemId} reason="${input.reason}"`,
				LOG_CONTEXT
			);
			return {
				success: true,
				data: result.data satisfies PmToolsResult,
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			logger.error(`pm:setBlocked failed: ${message}`, LOG_CONTEXT);
			return { success: false, error: message };
		}
	});
}

// ── Branch cleanup helper ──────────────────────────────────────────────────

async function tryDeleteBranch(projectPath: string, projectItemId: string): Promise<void> {
	try {
		await sweepMergedBranches(projectPath, 'main', { graceDays: 0, dryRun: false });
		logger.info(
			`merger-done: branch sweep attempted for projectItem=${projectItemId}`,
			LOG_CONTEXT
		);
	} catch (err) {
		logger.warn(
			`merger-done: branch sweep failed for projectItem=${projectItemId}: ${
				err instanceof Error ? err.message : String(err)
			}`,
			LOG_CONTEXT
		);
	}
}
