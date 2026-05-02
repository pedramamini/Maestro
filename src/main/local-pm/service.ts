import * as path from 'path';
import type {
	AgentReadyWorkFilter,
	WorkGraphActor,
	WorkGraphListResult,
	WorkItem,
	WorkItemClaim,
	WorkItemClaimInput,
	WorkItemClaimReleaseInput,
	WorkItemClaimRenewInput,
	WorkItemCreateInput,
	WorkItemEvent,
	WorkItemEventCreateInput,
	WorkItemFilters,
	WorkItemUpdateInput,
} from '../../shared/work-graph-types';
import { WORK_GRAPH_READY_TAG } from '../../shared/work-graph-types';
import type {
	LocalPmAuditEvent,
	LocalPmClaim,
	LocalPmClaimWorkInput,
	LocalPmCreateWorkInput,
	LocalPmHeartbeatInput,
	LocalPmHeartbeatResult,
	LocalPmListReadyOptions,
	LocalPmProject,
	LocalPmProjectHealth,
	LocalPmReadyWorkResult,
	LocalPmReleaseClaimInput,
	LocalPmStatusDefinition,
	LocalPmUpdateStatusInput,
	LocalPmUpdateWorkInput,
	LocalPmWorkItem,
	LocalPmWorkStatus,
} from '../../shared/local-pm-types';
import { getWorkGraphItemStore } from '../work-graph';

export interface LocalPmWorkGraphStore {
	createItem(input: WorkItemCreateInput, actor?: WorkGraphActor): Promise<WorkItem>;
	updateItem(input: WorkItemUpdateInput): Promise<WorkItem>;
	getItem(id: string): Promise<WorkItem | undefined>;
	listItems(filters?: WorkItemFilters): Promise<WorkGraphListResult>;
	getUnblockedWorkItems(filters?: AgentReadyWorkFilter): Promise<WorkGraphListResult>;
	claimItem(input: WorkItemClaimInput, actor?: WorkGraphActor): Promise<WorkItemClaim>;
	renewClaim(input: WorkItemClaimRenewInput): Promise<WorkItemClaim>;
	releaseClaim(input: WorkItemClaimReleaseInput): Promise<WorkItemClaim | undefined>;
	releaseClaim(
		workItemId: string,
		options?: { note?: string; actor?: WorkGraphActor; revertStatusTo?: WorkItem['status'] }
	): Promise<WorkItemClaim | undefined>;
	listActiveClaims(): Promise<WorkItemClaim[]>;
	upsertTag(
		definition: import('../../shared/work-graph-types').TagDefinition
	): Promise<import('../../shared/work-graph-types').TagDefinition>;
	listTags(): Promise<import('../../shared/work-graph-types').TagDefinition[]>;
	recordEvent(input: WorkItemEventCreateInput): Promise<WorkItemEvent>;
	listEvents(workItemId: string, limit?: number): Promise<WorkItemEvent[]>;
}

export const LOCAL_PM_STATUSES: readonly LocalPmStatusDefinition[] = [
	{ id: 'discovered', name: 'Discovered', category: 'todo', sortOrder: 10, terminal: false },
	{ id: 'planned', name: 'Planned', category: 'todo', sortOrder: 20, terminal: false },
	{ id: 'ready', name: 'Ready', category: 'todo', sortOrder: 30, terminal: false },
	{ id: 'claimed', name: 'Claimed', category: 'active', sortOrder: 40, terminal: false },
	{ id: 'in_progress', name: 'In Progress', category: 'active', sortOrder: 50, terminal: false },
	{ id: 'blocked', name: 'Blocked', category: 'blocked', sortOrder: 60, terminal: false },
	{ id: 'review', name: 'Review', category: 'active', sortOrder: 70, terminal: false },
	{ id: 'done', name: 'Done', category: 'done', sortOrder: 80, terminal: true },
	{ id: 'archived', name: 'Archived', category: 'terminal', sortOrder: 90, terminal: true },
	{ id: 'canceled', name: 'Canceled', category: 'terminal', sortOrder: 100, terminal: true },
];

const LOCAL_PM_STATUS_IDS = new Set<LocalPmWorkStatus>(
	LOCAL_PM_STATUSES.map((status) => status.id)
);
const DEFAULT_CLAIM_WINDOW_MS = 5 * 60 * 1000;

export class LocalPmService {
	constructor(private readonly store: LocalPmWorkGraphStore = getWorkGraphItemStore()) {}

	listStatuses(): LocalPmStatusDefinition[] {
		return [...LOCAL_PM_STATUSES];
	}

	async listProjects(): Promise<LocalPmProject[]> {
		const result = await this.store.listItems({ statuses: [...LOCAL_PM_STATUS_IDS] });
		const paths = [...new Set(result.items.map((item) => item.projectPath))].sort();
		const projects = await Promise.all(
			paths.map(async (projectPath) => ({
				path: projectPath,
				name: path.basename(projectPath),
				health: await this.getProjectHealth(projectPath),
			}))
		);
		return projects;
	}

	async createWorkItem(input: LocalPmCreateWorkInput): Promise<LocalPmWorkItem> {
		const status = normalizeStatus(input.status ?? 'discovered');
		const tags = status === 'ready' ? withReadyTag(input.tags) : input.tags;
		return this.store.createItem({
			type: input.type,
			title: input.title,
			description: input.description,
			status,
			parentWorkItemId: input.parentWorkItemId,
			projectPath: input.projectPath,
			gitPath: input.gitPath ?? input.projectPath,
			source: 'manual',
			readonly: false,
			tags,
			priority: input.priority,
			dueAt: input.dueAt,
			metadata: input.metadata,
		});
	}

	async updateWorkItem(input: LocalPmUpdateWorkInput): Promise<LocalPmWorkItem> {
		const current = await this.requireProjectItem(input.projectPath, input.workItemId);
		const nextStatus = input.patch.status ? normalizeStatus(input.patch.status) : undefined;
		const updated = await this.store.updateItem({
			id: input.workItemId,
			actor: input.actor,
			patch: {
				...input.patch,
				status: nextStatus,
				completedAt: nextStatus === 'done' ? new Date().toISOString() : current.completedAt,
			},
		});

		await this.recordUpdateEvent(current, updated, input.actor, input.reason);
		return updated;
	}

	async listWorkItems(
		projectPath: string,
		filters: WorkItemFilters = {}
	): Promise<WorkGraphListResult> {
		return this.store.listItems({ ...filters, projectPath });
	}

	async listReadyWork(
		projectPath: string,
		options: LocalPmListReadyOptions = {}
	): Promise<LocalPmReadyWorkResult> {
		const statuses: LocalPmWorkStatus[] = options.includePlanned
			? ['ready', 'planned', 'discovered']
			: ['ready'];
		const result = await this.store.getUnblockedWorkItems({
			projectPath,
			statuses,
			limit: options.limit,
			excludeClaimed: true,
			excludeExpiredClaims: true,
			requireUnblocked: true,
			capabilityTags: options.agentCapabilities ?? (options.role ? [options.role] : undefined),
		});
		return { ...result, items: sortReadyWork(result.items) };
	}

	async claimWork(input: LocalPmClaimWorkInput): Promise<LocalPmWorkItem> {
		const item = await this.requireProjectItem(input.projectPath, input.workItemId);
		const owner = {
			type: 'agent' as const,
			id: input.agentId,
			name: input.agentName,
			agentId: input.agentId,
			capabilities: [input.role],
		};
		await this.store.claimItem(
			{
				workItemId: item.id,
				owner,
				source: 'manual',
				expiresAt: input.expiresAt ?? defaultExpiryIso(),
				note: input.note ?? `claimed by ${input.agentId} as ${input.role}`,
			},
			agentActor(input.agentId, input.agentName)
		);
		const claimed = await this.store.getItem(item.id);
		if (!claimed) {
			throw new Error(`Work item disappeared after claim: ${item.id}`);
		}
		return claimed;
	}

	async releaseClaim(input: LocalPmReleaseClaimInput): Promise<LocalPmClaim | undefined> {
		await this.requireProjectItem(input.projectPath, input.workItemId);
		const owner = input.agentId
			? { type: 'agent' as const, id: input.agentId, agentId: input.agentId }
			: undefined;
		if (!input.claimId && !input.agentId) {
			return this.store.releaseClaim(input.workItemId, {
				actor: systemActor(),
				note: input.note,
				revertStatusTo: input.revertStatusTo ?? 'ready',
			});
		}
		const released = await this.store.releaseClaim({
			workItemId: input.workItemId,
			claimId: input.claimId,
			owner,
			note: input.note,
		});
		if (released && input.revertStatusTo && input.revertStatusTo !== 'ready') {
			await this.store.updateItem({
				id: input.workItemId,
				patch: { status: input.revertStatusTo },
				actor: input.agentId ? agentActor(input.agentId) : systemActor(),
			});
		}
		return released;
	}

	async updateWorkStatus(input: LocalPmUpdateStatusInput): Promise<LocalPmWorkItem> {
		const current = await this.requireProjectItem(input.projectPath, input.workItemId);
		const status = normalizeStatus(input.status);
		const timestamp = new Date().toISOString();
		const updated = await this.store.updateItem({
			id: input.workItemId,
			actor: input.actor,
			patch: {
				status,
				completedAt: status === 'done' ? timestamp : undefined,
			},
		});
		await this.store.recordEvent({
			workItemId: input.workItemId,
			type: 'status_changed',
			actor: input.actor ?? systemActor(),
			timestamp,
			before: { status: current.status },
			after: { status: updated.status },
			message: input.reason,
			priorState: { status: current.status },
			newState: { status: updated.status },
			reason: input.reason,
			artifactLink: input.artifactLink,
		});
		return updated;
	}

	async heartbeat(input: LocalPmHeartbeatInput): Promise<LocalPmHeartbeatResult> {
		await this.requireProjectItem(input.projectPath, input.workItemId);
		const now = new Date().toISOString();
		const owner = { type: 'agent' as const, id: input.agentId, agentId: input.agentId };
		const claim = await this.store.renewClaim({
			workItemId: input.workItemId,
			claimId: input.claimId,
			owner,
			expiresAt: input.expiresAt ?? defaultExpiryIso(),
			note: input.note ?? (input.role ? `heartbeat: ${input.role}` : 'heartbeat'),
		});
		return {
			workItemId: input.workItemId,
			claimId: claim.id,
			agentId: input.agentId,
			lastHeartbeat: now,
			expiresAt: claim.expiresAt,
		};
	}

	async listAuditEvents(
		projectPath: string,
		workItemId: string,
		limit = 100
	): Promise<LocalPmAuditEvent[]> {
		await this.requireProjectItem(projectPath, workItemId);
		return this.store.listEvents(workItemId, limit);
	}

	async getProjectHealth(projectPath: string): Promise<LocalPmProjectHealth> {
		const result = await this.store.listItems({ projectPath, statuses: [...LOCAL_PM_STATUS_IDS] });
		const statusCounts: Partial<Record<LocalPmWorkStatus, number>> = {};
		for (const item of result.items) {
			const status = normalizeStatus(item.status);
			statusCounts[status] = (statusCounts[status] ?? 0) + 1;
		}

		const claims = await this.claimsForProject(projectPath);
		const now = new Date().toISOString();
		return {
			projectPath,
			total: result.items.length,
			ready: statusCounts.ready ?? 0,
			claimed: statusCounts.claimed ?? 0,
			inProgress: statusCounts.in_progress ?? 0,
			blocked: statusCounts.blocked ?? 0,
			review: statusCounts.review ?? 0,
			done: statusCounts.done ?? 0,
			activeClaims: claims.length,
			staleClaims: claims.filter((claim) => claim.expiresAt && claim.expiresAt <= now).length,
			statusCounts,
			generatedAt: now,
		};
	}

	private async requireProjectItem(projectPath: string, workItemId: string): Promise<WorkItem> {
		const item = await this.store.getItem(workItemId);
		if (!item) {
			throw new Error(`Unknown local PM work item: ${workItemId}`);
		}
		if (item.projectPath !== projectPath) {
			throw new Error(`Work item ${workItemId} does not belong to project: ${projectPath}`);
		}
		return item;
	}

	private async claimsForProject(projectPath: string): Promise<WorkItemClaim[]> {
		const claims = await this.store.listActiveClaims();
		const pairs = await Promise.all(
			claims.map(async (claim) => ({
				claim,
				item: await this.store.getItem(claim.workItemId),
			}))
		);
		return pairs.filter((pair) => pair.item?.projectPath === projectPath).map((pair) => pair.claim);
	}

	private async recordUpdateEvent(
		before: WorkItem,
		after: WorkItem,
		actor?: WorkGraphActor,
		reason?: string
	): Promise<void> {
		await this.store.recordEvent({
			workItemId: after.id,
			type: before.status === after.status ? 'updated' : 'status_changed',
			actor: actor ?? systemActor(),
			before: summarizeItem(before),
			after: summarizeItem(after),
			message: reason,
			priorState: { status: before.status },
			newState: { status: after.status },
			reason,
		});
	}
}

export function createLocalPmService(store?: LocalPmWorkGraphStore): LocalPmService {
	return new LocalPmService(store);
}

function normalizeStatus(status: WorkItem['status']): LocalPmWorkStatus {
	if (status === 'backlog' || !LOCAL_PM_STATUS_IDS.has(status as LocalPmWorkStatus)) {
		throw new Error(`Unsupported local PM status: ${status}`);
	}
	return status as LocalPmWorkStatus;
}

function sortReadyWork(items: WorkItem[]): WorkItem[] {
	return [...items].sort((a, b) => {
		const priorityDelta = (b.priority ?? 0) - (a.priority ?? 0);
		if (priorityDelta !== 0) {
			return priorityDelta;
		}
		return a.createdAt.localeCompare(b.createdAt);
	});
}

function withReadyTag(tags: string[] | undefined): string[] {
	return [...new Set([...(tags ?? []), WORK_GRAPH_READY_TAG])];
}

function defaultExpiryIso(): string {
	return new Date(Date.now() + DEFAULT_CLAIM_WINDOW_MS).toISOString();
}

function agentActor(agentId: string, name?: string): WorkGraphActor {
	return { type: 'agent', id: agentId, name, agentId };
}

function systemActor(): WorkGraphActor {
	return { type: 'system', id: 'local-pm', name: 'Local PM' };
}

function summarizeItem(item: WorkItem): Partial<WorkItem> {
	return {
		id: item.id,
		status: item.status,
		title: item.title,
		priority: item.priority,
		updatedAt: item.updatedAt,
	};
}
