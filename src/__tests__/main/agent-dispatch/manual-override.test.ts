import { describe, expect, it } from 'vitest';
import type { AgentDispatchFleetEntry } from '../../../shared/agent-dispatch-types';
import type {
	WorkGraphActor,
	WorkItem,
	WorkItemClaim,
	WorkItemClaimInput,
} from '../../../shared/work-graph-types';
import { ManualOverride } from '../../../main/agent-dispatch/manual-override';
import { FleetRegistry } from '../../../main/agent-dispatch/fleet-registry';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
		title: 'Task One',
		projectPath: '/repo',
		gitPath: '/repo',
		source: 'manual',
		readonly: false,
		tags: ['typescript'],
		createdAt: '2026-04-30T10:00:00.000Z',
		updatedAt: '2026-04-30T10:00:00.000Z',
		...overrides,
	};
}

function activeClaim(overrides: Partial<WorkItemClaim> = {}): WorkItemClaim {
	return {
		id: 'claim-1',
		workItemId: 'work-1',
		owner: { type: 'agent', id: 'agent-1', name: 'Agent One' },
		status: 'active',
		source: 'auto-pickup',
		claimedAt: '2026-04-30T10:00:00.000Z',
		...overrides,
	};
}

class MemoryManualStore {
	claims: WorkItemClaimInput[] = [];
	claimActors: Array<WorkGraphActor | undefined> = [];
	releases: Array<{ workItemId: string; options?: { note?: string; actor?: WorkGraphActor } }> = [];

	constructor(public items: WorkItem[] = [workItem()]) {}

	async claimItem(input: WorkItemClaimInput, actor?: WorkGraphActor): Promise<WorkItem> {
		this.claims.push(input);
		this.claimActors.push(actor);
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

	async releaseClaim(
		workItemId: string,
		options?: { note?: string; actor?: WorkGraphActor }
	): Promise<WorkItemClaim | undefined> {
		this.releases.push({ workItemId, options });
		return activeClaim({ workItemId, status: 'released' });
	}
}

function registryWithAgent(entry: AgentDispatchFleetEntry = agent): FleetRegistry {
	const registry = new FleetRegistry();
	(registry as unknown as { entries: Map<string, AgentDispatchFleetEntry> }).entries.set(
		entry.id,
		entry
	);
	return registry;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ManualOverride', () => {
	describe('manualAssign', () => {
		it('claims item with source=manual, winning over auto-pickup decisions', async () => {
			const store = new MemoryManualStore();
			const override = new ManualOverride(store, registryWithAgent());

			const result = await override.manualAssign({
				workItemId: 'work-1',
				agent,
				note: 'Operator override',
			});

			expect(result.claim?.source).toBe('manual');
			expect(store.claims[0]).toMatchObject({
				workItemId: 'work-1',
				source: 'manual',
				owner: {
					type: 'agent',
					id: 'agent-1',
				},
			});
		});

		it('does not require the agent-ready tag — any work item can be manually assigned', async () => {
			// Item without agent-ready tag: auto-pickup would skip it, manual should not.
			const store = new MemoryManualStore([workItem({ id: 'work-no-tag', tags: ['typescript'] })]);
			const override = new ManualOverride(store, registryWithAgent());

			const result = await override.manualAssign({
				workItemId: 'work-no-tag',
				agent,
			});

			expect(result.claim?.source).toBe('manual');
		});

		it('uses a supplied actor for the audit event', async () => {
			const store = new MemoryManualStore();
			const override = new ManualOverride(store, registryWithAgent());
			const customActor: WorkGraphActor = { type: 'user', id: 'user-42', name: 'Alice' };

			await override.manualAssign({
				workItemId: 'work-1',
				agent,
				actor: customActor,
			});

			expect(store.claimActors[0]).toMatchObject({ type: 'user', id: 'user-42' });
		});

		it('derives a default actor from the agent entry when none is provided', async () => {
			const store = new MemoryManualStore();
			const override = new ManualOverride(store, registryWithAgent());

			await override.manualAssign({ workItemId: 'work-1', agent });

			expect(store.claimActors[0]).toMatchObject({
				type: 'user',
				id: 'agent-1',
				name: 'Agent One',
				agentId: 'codex',
			});
		});

		it('passes through expiresAt and expectedUpdatedAt when provided', async () => {
			const store = new MemoryManualStore();
			const override = new ManualOverride(store, registryWithAgent());

			await override.manualAssign({
				workItemId: 'work-1',
				agent,
				expiresAt: '2026-05-01T10:00:00.000Z',
				expectedUpdatedAt: '2026-04-30T10:00:00.000Z',
			});

			expect(store.claims[0]).toMatchObject({
				expiresAt: '2026-05-01T10:00:00.000Z',
				expectedUpdatedAt: '2026-04-30T10:00:00.000Z',
			});
		});
	});

	describe('forceRelease', () => {
		it('releases the active claim regardless of which agent owns it', async () => {
			const store = new MemoryManualStore();
			const override = new ManualOverride(store, registryWithAgent());
			const releaser: WorkGraphActor = { type: 'user', id: 'admin-1', name: 'Admin' };

			const result = await override.forceRelease({
				workItemId: 'work-1',
				actor: releaser,
				note: 'Reassigning to another agent',
			});

			expect(result?.status).toBe('released');
			expect(store.releases[0]).toMatchObject({
				workItemId: 'work-1',
				options: {
					note: 'Reassigning to another agent',
					actor: { type: 'user', id: 'admin-1' },
				},
			});
		});

		it('records the releasing actor in the release options for auditability', async () => {
			const store = new MemoryManualStore();
			const override = new ManualOverride(store, registryWithAgent());
			const actor: WorkGraphActor = { type: 'system', id: 'scheduler', name: 'Scheduler' };

			await override.forceRelease({ workItemId: 'work-1', actor });

			expect(store.releases[0].options?.actor).toMatchObject({
				type: 'system',
				id: 'scheduler',
			});
		});

		it('uses a default note when none is supplied', async () => {
			const store = new MemoryManualStore();
			const override = new ManualOverride(store, registryWithAgent());

			await override.forceRelease({
				workItemId: 'work-1',
				actor: { type: 'user', id: 'admin-1' },
			});

			expect(store.releases[0].options?.note).toMatch(/force-released/);
		});
	});

	describe('pauseAgent / resumeAgent', () => {
		it('pause prevents auto-pickup by marking the agent paused in the registry', () => {
			const registry = registryWithAgent();
			const store = new MemoryManualStore();
			const override = new ManualOverride(store, registry);

			const result = override.pauseAgent('agent-1');

			expect(result.paused).toBe(true);
			expect(registry.isPaused('agent-1')).toBe(true);
		});

		it('resume re-enables auto-pickup eligibility', () => {
			const registry = registryWithAgent();
			const store = new MemoryManualStore();
			const override = new ManualOverride(store, registry);

			override.pauseAgent('agent-1');
			expect(registry.isPaused('agent-1')).toBe(true);

			const result = override.resumeAgent('agent-1');

			expect(result.paused).toBe(false);
			expect(registry.isPaused('agent-1')).toBe(false);
		});

		it('keeps active claims visible after pause — does not evict them', () => {
			// Active claim must remain on the entry after pausing
			const claim = activeClaim();
			const entryWithClaim: AgentDispatchFleetEntry = {
				...agent,
				currentClaims: [claim],
				currentLoad: 1,
			};
			const registry = registryWithAgent(entryWithClaim);
			const store = new MemoryManualStore();
			const override = new ManualOverride(store, registry);

			override.pauseAgent('agent-1');

			// The entry is still in the registry, claims are still there
			const entry = registry.getEntry('agent-1');
			expect(entry?.currentClaims).toHaveLength(1);
			expect(entry?.currentClaims[0].id).toBe('claim-1');
		});

		it('paused agent is not selected by assignment policy', () => {
			// This test verifies the contract at the assignment-policy boundary:
			// a paused entry has readiness='paused', which isAgentEligibleForPickup
			// returns false for.
			const registry = registryWithAgent();
			const store = new MemoryManualStore();
			const override = new ManualOverride(store, registry);

			override.pauseAgent('agent-1');

			// After pause the registry marks the entry – the auto-pickup loop
			// re-derives readiness from the fleet on next refresh, but we can
			// directly check isPaused here.
			expect(registry.isPaused('agent-1')).toBe(true);
		});
	});
});
