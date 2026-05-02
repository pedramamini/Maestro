/**
 * pm-tools IPC handlers — agent-callable project management tools (#430).
 *
 * Exposes three channels that agents call at workflow transitions to self-update
 * their claimed work item in the Projects v2 custom fields:
 *
 *   pm:setStatus  → updates AI Status field for the agent's claimed item
 *   pm:setRole    → updates AI Role field for the agent's claimed item
 *   pm:setBlocked → sets AI Status=Blocked + posts a comment with the reason
 *
 * Each handler:
 *  1. Resolves the calling agent's currently-claimed work item via in-memory ClaimTracker.
 *  2. Enforces ownership — agents cannot update items they don't own.
 *  3. Persists the new field value to GitHub Projects v2 via the project coordinator
 *     when per-project mapping exists, with the legacy GithubClient path as fallback.
 *  4. Records an audit event in the local JSONL audit log.
 *
 * #444: work-graph SQLite removed — GitHub Projects v2 is the sole durable state.
 *
 * Gated by the `deliveryPlanner` encore feature flag (same gate as delivery-planner handlers).
 */

import { ipcMain } from 'electron';
import { requireEncoreFeature } from '../../utils/requireEncoreFeature';
import type { SettingsStoreInterface } from '../../stores/types';
import { getClaimTracker } from '../../agent-dispatch/claim-tracker';
import type { ClaimInfo } from '../../agent-dispatch/claim-tracker';
import { getGithubClient } from '../../agent-dispatch/github-client';
import {
	getGithubProjectCoordinator,
	type GithubProjectReference,
} from '../../agent-dispatch/github-project-coordinator';
import { auditLog } from '../../agent-dispatch/dispatch-audit-log';
import { sweepMergedBranches } from '../../pm-branch-hygiene/branch-cleaner';
import { DELIVERY_PLANNER_GITHUB_REPOSITORY } from '../../delivery-planner/github-safety';
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

interface ProjectGithubMapEntry {
	owner: string;
	repo: string;
	projectNumber: number;
	projectId?: string;
	projectTitle?: string;
	discoveredAt?: string;
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

			await setClaimItemFieldValue(deps.settingsStore, claim, 'AI Status', input.status);

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
				data: {
					workItemId: claim.projectItemId,
					field: 'AI Status',
					value: input.status,
				} satisfies PmToolsResult,
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

			await setClaimItemFieldValue(deps.settingsStore, claim, 'AI Role', input.role);

			auditLog('role_change', {
				actor: input.agentSessionId,
				workItemId: claim.projectItemId,
				priorState: { role: claim.role },
				newState: { 'AI Role': input.role },
			});

			logger.info(`pm:setRole projectItem=${claim.projectItemId} role=${input.role}`, LOG_CONTEXT);
			return {
				success: true,
				data: {
					workItemId: claim.projectItemId,
					field: 'AI Role',
					value: input.role,
				} satisfies PmToolsResult,
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

			// 1. Set AI Status → Blocked on GitHub Projects v2
			await setClaimItemFieldValue(deps.settingsStore, claim, 'AI Status', 'Blocked');

			// 2. Post a comment on the GitHub issue if we have the issue number
			if (claim.issueNumber) {
				await addClaimItemComment(deps.settingsStore, claim, `**Blocked** — ${input.reason}`);
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
				data: {
					workItemId: claim.projectItemId,
					field: 'AI Status',
					value: 'Blocked',
				} satisfies PmToolsResult,
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			logger.error(`pm:setBlocked failed: ${message}`, LOG_CONTEXT);
			return { success: false, error: message };
		}
	});
}

// ── GitHub project gateway helpers ─────────────────────────────────────────

function getProjectMapping(
	settingsStore: SettingsStoreInterface,
	projectPath: string | undefined
): ProjectGithubMapEntry | undefined {
	if (!projectPath) return undefined;
	const map = settingsStore.get<Record<string, ProjectGithubMapEntry>>('projectGithubMap', {});
	const mapping = map[projectPath];
	if (!mapping?.owner || !mapping.projectNumber) return undefined;
	return mapping;
}

function getProjectReference(
	settingsStore: SettingsStoreInterface,
	claim: ClaimInfo
): GithubProjectReference | undefined {
	const mapping = getProjectMapping(settingsStore, claim.projectPath);
	if (!mapping) return undefined;

	return {
		projectOwner: mapping.owner,
		projectNumber: mapping.projectNumber,
		projectPath: claim.projectPath,
	};
}

async function setClaimItemFieldValue(
	settingsStore: SettingsStoreInterface,
	claim: ClaimInfo,
	fieldName: string,
	value: string
): Promise<void> {
	const project = getProjectReference(settingsStore, claim);
	if (project) {
		await getGithubProjectCoordinator().setItemFieldValue(
			project,
			claim.projectItemId,
			fieldName,
			value
		);
		return;
	}

	await getGithubClient().setItemFieldValue(claim.projectId, claim.projectItemId, fieldName, value);
}

async function addClaimItemComment(
	settingsStore: SettingsStoreInterface,
	claim: ClaimInfo,
	body: string
): Promise<void> {
	const project = getProjectReference(settingsStore, claim);
	const mapping = getProjectMapping(settingsStore, claim.projectPath);
	if (project && mapping?.repo) {
		await getGithubProjectCoordinator().addItemComment(
			project,
			claim.issueNumber,
			`${mapping.owner}/${mapping.repo}`,
			body
		);
		return;
	}

	await getGithubClient().addItemComment(
		claim.issueNumber,
		DELIVERY_PLANNER_GITHUB_REPOSITORY,
		body
	);
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
