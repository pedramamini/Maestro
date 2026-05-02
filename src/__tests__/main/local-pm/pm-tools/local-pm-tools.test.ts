import { describe, expect, it } from 'vitest';

import type {
	TagDefinition,
	WorkGraphActor,
	WorkItem,
	WorkItemClaim,
	WorkItemEvent,
	WorkItemEventCreateInput,
	WorkItemStatus,
	WorkItemUpdateInput,
} from '../../../../shared/work-graph-types';
import {
	initializeLocalPmProject,
	runLocalPmAudit,
	setLocalPmBlocked,
	setLocalPmRole,
	setLocalPmStatus,
	type LocalPmStore,
} from '../../../../main/local-pm/pm-tools';

describe('local PM command helpers', () => {
	it('initializes local PM board metadata idempotently', async () => {
		const store = new FakeLocalPmStore();

		const first = await initializeLocalPmProject({ projectPath: '/repo' }, { store });
		const second = await initializeLocalPmProject({ projectPath: '/repo' }, { store });

		expect(first.errors).toEqual([]);
		expect(first.created).toEqual(['tag:agent-ready', 'tag:maestro-pm']);
		expect(first.existing).toContain('AI Status');
		expect(first.existing).toContain('project:/repo');
		expect(second.created).toEqual([]);
		expect(second.existing).toContain('tag:agent-ready');
		expect(second.existing).toContain('tag:maestro-pm');
	});

	it('sets status and role for the calling agent active claim', async () => {
		const store = new FakeLocalPmStore();
		const item = store.addItem({ id: 'item-1', status: 'ready' });
		store.addClaim({ id: 'claim-1', workItemId: item.id, ownerId: 'agent-1' });

		await expect(
			setLocalPmStatus({ agentSessionId: 'agent-1', status: 'In Progress' }, { store })
		).resolves.toEqual({
			success: true,
			data: { workItemId: 'item-1', field: 'AI Status', value: 'In Progress' },
		});
		await expect(
			setLocalPmRole({ agentSessionId: 'agent-1', role: 'reviewer' }, { store })
		).resolves.toEqual({
			success: true,
			data: { workItemId: 'item-1', field: 'AI Role', value: 'reviewer' },
		});

		expect(store.items.get('item-1')?.status).toBe('in_progress');
		expect(store.items.get('item-1')?.metadata?.localPm).toMatchObject({
			fields: {
				'AI Status': 'In Progress',
				'AI Role': 'reviewer',
			},
		});
		expect(store.events.map((event) => event.type)).toEqual(['status_changed', 'updated']);
	});

	it('rejects writes when the agent does not own a local claim', async () => {
		const store = new FakeLocalPmStore();
		const item = store.addItem({ id: 'item-1', status: 'ready' });
		store.addClaim({ id: 'claim-1', workItemId: item.id, ownerId: 'agent-1' });

		await expect(
			setLocalPmStatus({ agentSessionId: 'agent-2', status: 'Done' }, { store })
		).resolves.toEqual({
			success: false,
			error: 'Agent session "agent-2" has no active local PM claim',
		});
	});

	it('sets blocked status and records a local comment event', async () => {
		const store = new FakeLocalPmStore();
		const item = store.addItem({ id: 'item-1', status: 'in_progress' });
		store.addClaim({ id: 'claim-1', workItemId: item.id, ownerId: 'agent-1' });

		const result = await setLocalPmBlocked(
			{ agentSessionId: 'agent-1', reason: 'Need API key' },
			{ store, now: () => Date.parse('2026-05-02T12:00:00.000Z') }
		);

		expect(result).toEqual({
			success: true,
			data: { workItemId: 'item-1', field: 'AI Status', value: 'Blocked' },
		});
		expect(store.items.get('item-1')?.status).toBe('blocked');
		expect(store.items.get('item-1')?.metadata?.localPm).toMatchObject({
			fields: { 'AI Status': 'Blocked' },
			comments: [
				{
					body: '**Blocked** - Need API key',
					actor: 'agent-1',
					createdAt: '2026-05-02T12:00:00.000Z',
				},
			],
		});
		expect(store.events[0]).toMatchObject({
			type: 'status_changed',
			message: '**Blocked** - Need API key',
			reason: 'Need API key',
		});
	});

	it('audits local claims and releases stale claims', async () => {
		const store = new FakeLocalPmStore();
		const freshItem = store.addItem({
			id: 'fresh',
			title: 'Fresh task',
			status: 'in_progress',
			pipeline: { currentRole: 'runner', completedRoles: [] },
		});
		const staleItem = store.addItem({ id: 'stale', title: 'Stale task', status: 'in_progress' });
		store.addClaim({
			id: 'fresh-claim',
			workItemId: freshItem.id,
			ownerId: 'agent-1',
			lastHeartbeat: '2026-05-02T11:59:00.000Z',
		});
		store.addClaim({
			id: 'stale-claim',
			workItemId: staleItem.id,
			ownerId: 'agent-2',
			lastHeartbeat: '2026-05-02T11:40:00.000Z',
		});

		const result = await runLocalPmAudit(
			{
				staleClaimMs: 5 * 60 * 1000,
				projectRoleSlots: { runner: 'agent-1' },
			},
			{ store, now: () => Date.parse('2026-05-02T12:00:00.000Z') }
		);

		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.data.totalAudited).toBe(2);
		expect(result.data.autoFixed.map((finding) => finding.checkId)).toEqual(['STALE_CLAIM']);
		expect(result.data.needsAttention.map((finding) => finding.checkId)).toContain(
			'ORPHANED_SLOT_AGENT'
		);
		expect(store.claims.get('stale-claim')?.status).toBe('released');
		expect(store.items.get('stale')?.status).toBe('ready');
	});
});

class FakeLocalPmStore implements LocalPmStore {
	readonly tags = new Map<string, TagDefinition>();
	readonly items = new Map<string, WorkItem>();
	readonly claims = new Map<string, WorkItemClaim>();
	readonly events: WorkItemEventCreateInput[] = [];

	async upsertTag(definition: TagDefinition): Promise<TagDefinition> {
		this.tags.set(definition.name, definition);
		return definition;
	}

	async listTags(): Promise<TagDefinition[]> {
		return Array.from(this.tags.values());
	}

	async getItem(id: string): Promise<WorkItem | undefined> {
		return this.items.get(id);
	}

	async updateItem(input: WorkItemUpdateInput): Promise<WorkItem> {
		const item = this.items.get(input.id);
		if (!item) throw new Error(`Unknown item: ${input.id}`);
		const updated: WorkItem = {
			...item,
			...input.patch,
			version: item.version + 1,
			updatedAt: '2026-05-02T12:00:00.000Z',
		};
		this.items.set(updated.id, updated);
		return updated;
	}

	async recordEvent(input: WorkItemEventCreateInput): Promise<WorkItemEvent> {
		this.events.push(input);
		return {
			id: `event-${this.events.length}`,
			timestamp: input.timestamp ?? '2026-05-02T12:00:00.000Z',
			...input,
		};
	}

	async listActiveClaims(): Promise<WorkItemClaim[]> {
		return Array.from(this.claims.values()).filter((claim) => claim.status === 'active');
	}

	async releaseClaim(
		workItemId: string,
		options: { note?: string; actor?: WorkGraphActor; revertStatusTo?: WorkItemStatus } = {}
	): Promise<WorkItemClaim | undefined> {
		const claim = Array.from(this.claims.values()).find(
			(candidate) => candidate.workItemId === workItemId && candidate.status === 'active'
		);
		if (!claim) return undefined;
		const released: WorkItemClaim = {
			...claim,
			status: 'released',
			releasedAt: '2026-05-02T12:00:00.000Z',
			note: options.note ?? claim.note,
		};
		this.claims.set(released.id, released);
		return released;
	}

	addItem(overrides: Partial<WorkItem>): WorkItem {
		const item: WorkItem = {
			id: overrides.id ?? `item-${this.items.size + 1}`,
			type: 'task',
			status: overrides.status ?? 'ready',
			title: overrides.title ?? 'Task',
			projectPath: overrides.projectPath ?? '/repo',
			gitPath: overrides.gitPath ?? '.',
			source: 'agent-dispatch',
			readonly: false,
			tags: [],
			version: 0,
			createdAt: '2026-05-02T11:00:00.000Z',
			updatedAt: '2026-05-02T11:00:00.000Z',
			...overrides,
		};
		this.items.set(item.id, item);
		return item;
	}

	addClaim(input: {
		id: string;
		workItemId: string;
		ownerId: string;
		lastHeartbeat?: string;
	}): WorkItemClaim {
		const claim: WorkItemClaim = {
			id: input.id,
			workItemId: input.workItemId,
			owner: { type: 'agent', id: input.ownerId, agentId: input.ownerId },
			status: 'active',
			source: 'auto-pickup',
			claimedAt: '2026-05-02T11:00:00.000Z',
			lastHeartbeat: input.lastHeartbeat,
		};
		this.claims.set(claim.id, claim);
		return claim;
	}
}
