import { describe, expect, it, vi } from 'vitest';
import { AgentDispatchEngine, FleetRegistry } from '../../../main/agent-dispatch';
import type { AgentDispatchFleetEntry } from '../../../shared/agent-dispatch-types';
import type {
	AgentReadyWorkFilter,
	WorkGraphActor,
	WorkGraphListResult,
	WorkItem,
	WorkItemClaimInput,
} from '../../../shared/work-graph-types';

const agent: AgentDispatchFleetEntry = {
	id: 'agent-1',
	agentId: 'codex',
	sessionId: 'agent-1',
	providerSessionId: 'provider-1',
	displayName: 'Agent One',
	providerType: 'codex',
	host: 'local',
	locality: 'local',
	readiness: 'idle',
	currentClaims: [],
	currentLoad: 0,
	dispatchCapabilities: ['typescript'],
	dispatchProfile: {
		autoPickupEnabled: true,
		capabilityTags: ['typescript'],
		maxConcurrentClaims: 1,
	},
	pickupEnabled: true,
	updatedAt: '2026-04-30T10:00:00.000Z',
};

function workItem(overrides: Partial<WorkItem> = {}): WorkItem {
	return {
		id: 'work-1',
		type: 'task',
		status: 'ready',
		title: 'Work item',
		projectPath: '/repo',
		gitPath: '/repo',
		source: 'manual',
		readonly: false,
		tags: ['agent-ready', 'typescript'],
		createdAt: '2026-04-30T10:00:00.000Z',
		updatedAt: '2026-04-30T10:00:00.000Z',
		...overrides,
	};
}

class MemoryDispatchWorkGraphStore {
	filters: AgentReadyWorkFilter[] = [];
	claims: WorkItemClaimInput[] = [];
	claimActors: Array<WorkGraphActor | undefined> = [];
	throwOnClaim = false;

	constructor(public items: WorkItem[]) {}

	async getUnblockedWorkItems(filters: AgentReadyWorkFilter = {}): Promise<WorkGraphListResult> {
		this.filters.push(filters);
		return { items: this.items, total: this.items.length };
	}

	async claimItem(input: WorkItemClaimInput, actor?: WorkGraphActor): Promise<WorkItem> {
		this.claims.push(input);
		this.claimActors.push(actor);
		if (this.throwOnClaim) {
			throw new Error('claim conflict');
		}
		const item = this.items.find((candidate) => candidate.id === input.workItemId) ?? workItem();
		return {
			...item,
			status: 'claimed',
			owner: input.owner,
			claim: {
				id: `claim-${input.workItemId}`,
				workItemId: input.workItemId,
				owner: input.owner,
				status: 'active',
				source: input.source,
				claimedAt: '2026-04-30T11:00:00.000Z',
			},
		};
	}
}

function registryWithAgent(entry: AgentDispatchFleetEntry = agent): FleetRegistry {
	const registry = new FleetRegistry();
	registry.refresh({
		sessions: [],
		now: new Date('2026-04-30T10:00:00.000Z'),
	});
	(registry as unknown as { entries: Map<string, AgentDispatchFleetEntry> }).entries.set(
		entry.id,
		entry
	);
	return registry;
}

describe('AgentDispatchEngine', () => {
	it('queries Work Graph ready work before claiming with auto-pickup source and executing', async () => {
		const workGraph = new MemoryDispatchWorkGraphStore([workItem()]);
		const executeClaim = vi.fn();
		const engine = new AgentDispatchEngine({
			workGraph,
			fleetRegistry: registryWithAgent(),
			executeClaim,
		});

		const result = await engine.runAutoPickup();

		expect(workGraph.filters[0]).toMatchObject({
			excludeClaimed: true,
			capabilityTags: ['typescript'],
		});
		expect(workGraph.claims[0]).toMatchObject({
			workItemId: 'work-1',
			source: 'auto-pickup',
			expectedUpdatedAt: '2026-04-30T10:00:00.000Z',
			capabilityRouting: {
				requireReadyTag: true,
				agentCapabilities: ['typescript'],
			},
		});
		expect(result.claimed).toBe(1);
		expect(executeClaim).toHaveBeenCalledTimes(1);
	});

	it('does not execute work when the Work Graph claim is lost', async () => {
		const workGraph = new MemoryDispatchWorkGraphStore([workItem()]);
		workGraph.throwOnClaim = true;
		const executeClaim = vi.fn();
		const engine = new AgentDispatchEngine({
			workGraph,
			fleetRegistry: registryWithAgent(),
			executeClaim,
		});

		const result = await engine.runAutoPickup();

		expect(result.claimed).toBe(0);
		expect(result.skipped).toBe(1);
		expect(result.errors[0].message).toBe('claim conflict');
		expect(executeClaim).not.toHaveBeenCalled();
	});

	it('allows explicit user-initiated manual assignment without agent-ready', async () => {
		const manualWork = workItem({ id: 'manual-work', tags: ['typescript'] });
		const workGraph = new MemoryDispatchWorkGraphStore([manualWork]);
		const engine = new AgentDispatchEngine({
			workGraph,
			fleetRegistry: registryWithAgent(),
		});

		await expect(
			engine.assignManually({ workItemId: manualWork.id, agent, userInitiated: false })
		).rejects.toThrow('user-initiated');

		const claimed = await engine.assignManually({
			workItemId: manualWork.id,
			agent,
			userInitiated: true,
		});

		expect(claimed.claim?.source).toBe('manual');
		expect(workGraph.claims[0]).toMatchObject({
			workItemId: 'manual-work',
			source: 'manual',
		});
	});
});
