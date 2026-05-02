import { describe, expect, it, vi } from 'vitest';

import type {
	WorkGraphActor,
	WorkGraphListResult,
	WorkItem,
	WorkItemCreateInput,
	WorkItemDependency,
	WorkItemFilters,
	WorkItemUpdateInput,
} from '../../shared/work-graph-types';
import { DeliveryPlannerService, type DeliveryPlannerWorkGraphStore } from '../delivery-planner';
import { ConversationalPrdService } from './service';
import { InMemoryConversationalPrdStore } from './session-store';
import type { ConversationalPrdGateway } from './gateway';

class MemoryWorkGraphStore implements DeliveryPlannerWorkGraphStore {
	private readonly items = new Map<string, WorkItem>();
	private itemSequence = 0;
	private dependencySequence = 0;

	async createItem(input: WorkItemCreateInput): Promise<WorkItem> {
		const timestamp = new Date().toISOString();
		const item: WorkItem = {
			...input,
			id: `item-${++this.itemSequence}`,
			status: input.status ?? 'discovered',
			readonly: input.readonly ?? false,
			tags: input.tags ?? [],
			version: 0,
			createdAt: timestamp,
			updatedAt: timestamp,
			dependencies: input.dependencies?.map((dependency) => ({
				...dependency,
				id: `dependency-${++this.dependencySequence}`,
				createdAt: timestamp,
			})),
		};
		this.items.set(item.id, item);
		return item;
	}

	async updateItem(input: WorkItemUpdateInput): Promise<WorkItem> {
		const existing = this.items.get(input.id);
		if (!existing) throw new Error(`Unknown item ${input.id}`);
		const updated: WorkItem = {
			...existing,
			...input.patch,
			updatedAt: new Date().toISOString(),
		};
		this.items.set(updated.id, updated);
		return updated;
	}

	async getItem(id: string): Promise<WorkItem | undefined> {
		return this.items.get(id);
	}

	async listItems(filters: WorkItemFilters = {}): Promise<WorkGraphListResult> {
		let items = [...this.items.values()];
		if (filters.source) {
			const sources = Array.isArray(filters.source) ? filters.source : [filters.source];
			items = items.filter((item) => sources.includes(item.source));
		}
		if (filters.projectPath) {
			items = items.filter((item) => item.projectPath === filters.projectPath);
		}
		if (filters.gitPath) {
			items = items.filter((item) => item.gitPath === filters.gitPath);
		}
		return { items, total: items.length };
	}

	async addDependency(
		dependency: Omit<WorkItemDependency, 'id' | 'createdAt'>
	): Promise<WorkItemDependency> {
		const created: WorkItemDependency = {
			...dependency,
			id: `dependency-${++this.dependencySequence}`,
			createdAt: new Date().toISOString(),
		};
		return created;
	}
}

const actor: WorkGraphActor = {
	type: 'user',
	id: 'planner',
	name: 'Planner',
};

describe('ConversationalPrdService', () => {
	it('finalizes a ready conversation into a Delivery Planner PRD Work Graph item', async () => {
		const workGraph = new MemoryWorkGraphStore();
		const publish = vi.fn();
		const plannerService = new DeliveryPlannerService({
			workGraph,
			events: { publish },
		});
		const gateway: ConversationalPrdGateway = {
			respond: vi.fn().mockResolvedValue({
				messageToUser: 'Ready to finalize.',
				status: 'ready-to-finalize',
				prdDraftDelta: {
					title: 'Local Maestro Board',
					problem: 'GitHub Projects rate limits block reliable dispatch.',
					users: 'Maestro users running autonomous dev crews.',
					successCriteria: 'Agents can claim local board work without GitHub Projects.',
				},
			}),
		};
		const service = new ConversationalPrdService(
			new InMemoryConversationalPrdStore(),
			gateway,
			plannerService
		);

		const started = await service.createSession({
			projectPath: '/project',
			gitPath: '/project',
			greeting: 'What are we planning?',
			actor,
		});
		const turn = await service.sendMessage({
			conversationId: started.conversationId,
			message: 'Plan the local Maestro Board.',
		});
		expect(turn.suggestCommit).toBe(true);

		const finalized = await service.finalizeSession({
			conversationId: started.conversationId,
			actor,
		});

		const prd = await workGraph.getItem(finalized.prdWorkItemId);
		expect(prd).toMatchObject({
			type: 'document',
			status: 'planned',
			title: 'Local Maestro Board',
			projectPath: '/project',
			gitPath: '/project',
			source: 'delivery-planner',
			metadata: {
				kind: 'prd',
				origin: 'conversational-prd',
				conversationId: started.conversationId,
				mirrorSlug: 'local-maestro-board',
			},
		});
		expect(prd?.tags).toEqual(
			expect.arrayContaining(['delivery-planner', 'prd', 'conversational-prd'])
		);
		expect(prd?.description).toContain('## Problem');
		expect(prd?.description).toContain('GitHub Projects rate limits block reliable dispatch.');
		expect(finalized.session).toMatchObject({
			conversationId: started.conversationId,
			status: 'finalized',
			finalized: true,
			prdWorkItemId: finalized.prdWorkItemId,
		});
		expect(publish).toHaveBeenCalledWith('workGraph.item.created', { item: prd });
	});
});
