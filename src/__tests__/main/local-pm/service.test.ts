import { describe, expect, it } from 'vitest';
import { LocalPmService, type LocalPmWorkGraphStore } from '../../../main/local-pm/service';
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
} from '../../../shared/work-graph-types';

describe('LocalPmService', () => {
	it('lists ready work using Work Graph unblocked filters and priority ordering', async () => {
		const store = new FakeLocalPmStore([
			makeItem({ id: 'low', priority: 1, createdAt: '2026-01-02T00:00:00.000Z' }),
			makeItem({ id: 'high', priority: 5, createdAt: '2026-01-03T00:00:00.000Z' }),
		]);
		const service = new LocalPmService(store);

		const result = await service.listReadyWork('/repo', { role: 'runner', limit: 10 });

		expect(result.items.map((item) => item.id)).toEqual(['high', 'low']);
		expect(store.lastReadyFilter).toMatchObject({
			projectPath: '/repo',
			statuses: ['ready'],
			limit: 10,
			excludeClaimed: true,
			excludeExpiredClaims: true,
			requireUnblocked: true,
			capabilityTags: ['runner'],
		});
	});

	it('claims work for an agent role and returns the hydrated work item', async () => {
		const store = new FakeLocalPmStore([makeItem({ id: 'task-1' })]);
		const service = new LocalPmService(store);

		const item = await service.claimWork({
			projectPath: '/repo',
			workItemId: 'task-1',
			agentId: 'agent-1',
			agentName: 'Runner',
			role: 'runner',
		});

		expect(item.status).toBe('claimed');
		expect(item.claim?.owner).toMatchObject({
			type: 'agent',
			id: 'agent-1',
			agentId: 'agent-1',
			capabilities: ['runner'],
		});
	});

	it('renews claim heartbeat and returns the beat timestamp', async () => {
		const store = new FakeLocalPmStore([makeItem({ id: 'task-1', status: 'claimed' })]);
		await store.claimItem({
			workItemId: 'task-1',
			owner: { type: 'agent', id: 'agent-1', agentId: 'agent-1' },
			source: 'manual',
			expiresAt: '2026-01-01T00:00:00.000Z',
		});
		const service = new LocalPmService(store);

		const result = await service.heartbeat({
			projectPath: '/repo',
			workItemId: 'task-1',
			agentId: 'agent-1',
			expiresAt: '2026-01-01T00:05:00.000Z',
		});

		expect(result.claimId).toBe('claim-1');
		expect(result.expiresAt).toBe('2026-01-01T00:05:00.000Z');
		expect(new Date(result.lastHeartbeat).toString()).not.toBe('Invalid Date');
	});

	it('updates status and writes an audit event', async () => {
		const store = new FakeLocalPmStore([makeItem({ id: 'task-1', status: 'ready' })]);
		const service = new LocalPmService(store);

		const item = await service.updateWorkStatus({
			projectPath: '/repo',
			workItemId: 'task-1',
			status: 'in_progress',
			actor: { type: 'agent', id: 'agent-1' },
			reason: 'started implementation',
		});
		const events = await service.listAuditEvents('/repo', 'task-1');

		expect(item.status).toBe('in_progress');
		expect(events[0]).toMatchObject({
			type: 'status_changed',
			priorState: { status: 'ready' },
			newState: { status: 'in_progress' },
			reason: 'started implementation',
		});
	});

	it('summarizes project health from work items and active claims', async () => {
		const store = new FakeLocalPmStore([
			makeItem({ id: 'ready-1', status: 'ready' }),
			makeItem({ id: 'blocked-1', status: 'blocked' }),
			makeItem({ id: 'done-1', status: 'done' }),
		]);
		await store.claimItem({
			workItemId: 'ready-1',
			owner: { type: 'agent', id: 'agent-1', agentId: 'agent-1' },
			source: 'manual',
			expiresAt: '2000-01-01T00:00:00.000Z',
		});
		const service = new LocalPmService(store);

		const health = await service.getProjectHealth('/repo');

		expect(health).toMatchObject({
			projectPath: '/repo',
			total: 3,
			ready: 0,
			claimed: 1,
			blocked: 1,
			done: 1,
			activeClaims: 1,
			staleClaims: 1,
		});
	});
});

class FakeLocalPmStore implements LocalPmWorkGraphStore {
	readonly events: WorkItemEvent[] = [];
	lastReadyFilter?: AgentReadyWorkFilter;
	private readonly items = new Map<string, WorkItem>();
	private readonly claims = new Map<string, WorkItemClaim>();
	private claimCounter = 0;

	constructor(items: WorkItem[]) {
		for (const item of items) {
			this.items.set(item.id, item);
		}
	}

	async createItem(input: WorkItemCreateInput): Promise<WorkItem> {
		const item = makeItem({
			id: `item-${this.items.size + 1}`,
			projectPath: input.projectPath,
			gitPath: input.gitPath,
			type: input.type,
			title: input.title,
			description: input.description,
			status: input.status ?? 'discovered',
			tags: input.tags ?? [],
			priority: input.priority,
			dueAt: input.dueAt,
			metadata: input.metadata,
		});
		this.items.set(item.id, item);
		return item;
	}

	async updateItem(input: WorkItemUpdateInput): Promise<WorkItem> {
		const current = this.items.get(input.id);
		if (!current) {
			throw new Error(`Unknown item: ${input.id}`);
		}
		const updated: WorkItem = {
			...current,
			...input.patch,
			version: current.version + 1,
			updatedAt: new Date().toISOString(),
		};
		this.items.set(updated.id, updated);
		return updated;
	}

	async getItem(id: string): Promise<WorkItem | undefined> {
		return this.items.get(id);
	}

	async listItems(filters: WorkItemFilters = {}): Promise<WorkGraphListResult> {
		const items = [...this.items.values()].filter((item) => {
			if (filters.projectPath && item.projectPath !== filters.projectPath) return false;
			if (filters.statuses && !filters.statuses.includes(item.status)) return false;
			return true;
		});
		return { items, total: items.length };
	}

	async getUnblockedWorkItems(filters: AgentReadyWorkFilter = {}): Promise<WorkGraphListResult> {
		this.lastReadyFilter = filters;
		const result = await this.listItems(filters);
		const items = result.items.filter((item) => !item.claim);
		return { items, total: items.length };
	}

	async claimItem(input: WorkItemClaimInput): Promise<WorkItemClaim> {
		const item = this.items.get(input.workItemId);
		if (!item) {
			throw new Error(`Unknown item: ${input.workItemId}`);
		}
		const claim: WorkItemClaim = {
			id: `claim-${++this.claimCounter}`,
			workItemId: input.workItemId,
			owner: input.owner,
			status: 'active',
			source: input.source,
			claimedAt: new Date().toISOString(),
			expiresAt: input.expiresAt,
			note: input.note,
		};
		this.claims.set(claim.id, claim);
		this.items.set(item.id, { ...item, status: 'claimed', claim });
		return claim;
	}

	async renewClaim(input: WorkItemClaimRenewInput): Promise<WorkItemClaim> {
		const claim = [...this.claims.values()].find(
			(candidate) =>
				candidate.workItemId === input.workItemId &&
				candidate.status === 'active' &&
				(!input.claimId || candidate.id === input.claimId) &&
				(!input.owner || candidate.owner.id === input.owner.id)
		);
		if (!claim) {
			throw new Error(`No active claim: ${input.workItemId}`);
		}
		const renewed: WorkItemClaim = {
			...claim,
			expiresAt: input.expiresAt,
			note: input.note ?? claim.note,
		};
		this.claims.set(renewed.id, renewed);
		const item = this.items.get(renewed.workItemId);
		if (item) {
			this.items.set(item.id, { ...item, claim: renewed });
		}
		return renewed;
	}

	async releaseClaim(input: WorkItemClaimReleaseInput): Promise<WorkItemClaim | undefined>;
	async releaseClaim(
		workItemId: string,
		options?: { note?: string; actor?: WorkGraphActor; revertStatusTo?: WorkItem['status'] }
	): Promise<WorkItemClaim | undefined>;
	async releaseClaim(
		inputOrWorkItemId: WorkItemClaimReleaseInput | string,
		options: { note?: string; actor?: WorkGraphActor; revertStatusTo?: WorkItem['status'] } = {}
	): Promise<WorkItemClaim | undefined> {
		const workItemId =
			typeof inputOrWorkItemId === 'string' ? inputOrWorkItemId : inputOrWorkItemId.workItemId;
		const claim = [...this.claims.values()].find(
			(candidate) => candidate.workItemId === workItemId && candidate.status === 'active'
		);
		if (!claim) return undefined;
		const released: WorkItemClaim = {
			...claim,
			status: 'released',
			releasedAt: new Date().toISOString(),
			note: typeof inputOrWorkItemId === 'string' ? options.note : inputOrWorkItemId.note,
		};
		this.claims.set(released.id, released);
		const item = this.items.get(workItemId);
		if (item) {
			this.items.set(workItemId, {
				...item,
				status: options.revertStatusTo ?? 'ready',
				claim: undefined,
			});
		}
		return released;
	}

	async listActiveClaims(): Promise<WorkItemClaim[]> {
		return [...this.claims.values()].filter((claim) => claim.status === 'active');
	}

	async recordEvent(input: WorkItemEventCreateInput): Promise<WorkItemEvent> {
		const event: WorkItemEvent = {
			id: `event-${this.events.length + 1}`,
			workItemId: input.workItemId,
			type: input.type,
			actor: input.actor,
			timestamp: input.timestamp ?? new Date().toISOString(),
			before: input.before,
			after: input.after,
			message: input.message,
			priorState: input.priorState,
			newState: input.newState,
			reason: input.reason,
			artifactLink: input.artifactLink,
		};
		this.events.unshift(event);
		return event;
	}

	async listEvents(workItemId: string, limit = 100): Promise<WorkItemEvent[]> {
		return this.events.filter((event) => event.workItemId === workItemId).slice(0, limit);
	}
}

function makeItem(overrides: Partial<WorkItem>): WorkItem {
	return {
		id: overrides.id ?? 'task-1',
		type: overrides.type ?? 'task',
		status: overrides.status ?? 'ready',
		title: overrides.title ?? 'Task',
		description: overrides.description,
		projectPath: overrides.projectPath ?? '/repo',
		gitPath: overrides.gitPath ?? '/repo',
		source: overrides.source ?? 'manual',
		readonly: false,
		tags: overrides.tags ?? ['agent-ready'],
		claim: overrides.claim,
		capabilities: overrides.capabilities,
		priority: overrides.priority,
		version: overrides.version ?? 0,
		createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
		updatedAt: overrides.updatedAt ?? '2026-01-01T00:00:00.000Z',
		dueAt: overrides.dueAt,
		metadata: overrides.metadata,
	};
}
