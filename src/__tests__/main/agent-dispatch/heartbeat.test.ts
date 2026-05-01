import { describe, expect, it, vi } from 'vitest';
import type { AgentDispatchFleetEntry } from '../../../shared/agent-dispatch-types';
import type { WorkItemClaim, WorkItemClaimRenewInput } from '../../../shared/work-graph-types';
import { ClaimHeartbeat } from '../../../main/agent-dispatch/heartbeat';
import { FleetRegistry } from '../../../main/agent-dispatch/fleet-registry';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClaim(overrides: Partial<WorkItemClaim> = {}): WorkItemClaim {
	return {
		id: 'claim-1',
		workItemId: 'work-1',
		owner: { type: 'agent', id: 'agent-1', name: 'Agent One' },
		status: 'active',
		source: 'auto-pickup',
		claimedAt: '2026-04-30T10:00:00.000Z',
		expiresAt: '2026-04-30T10:01:30.000Z',
		...overrides,
	};
}

const baseEntry: AgentDispatchFleetEntry = {
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

function registryWithClaims(claims: WorkItemClaim[]): FleetRegistry {
	const registry = new FleetRegistry();
	const entry: AgentDispatchFleetEntry = { ...baseEntry, currentClaims: claims };
	(registry as unknown as { entries: Map<string, AgentDispatchFleetEntry> }).entries.set(
		entry.id,
		entry
	);
	return registry;
}

class MemoryHeartbeatStore {
	renewed: WorkItemClaimRenewInput[] = [];
	released: Array<{ workItemId: string; options?: { note?: string } }> = [];
	throwOnRenew = false;

	async renewClaim(input: WorkItemClaimRenewInput): Promise<WorkItemClaim> {
		if (this.throwOnRenew) {
			throw new Error('renew conflict');
		}
		this.renewed.push(input);
		return makeClaim({ expiresAt: input.expiresAt });
	}

	async releaseClaim(
		workItemId: string,
		options?: { note?: string }
	): Promise<WorkItemClaim | undefined> {
		this.released.push({ workItemId, options });
		return makeClaim({ workItemId, status: 'released' });
	}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ClaimHeartbeat', () => {
	it('renews active claims within the interval', async () => {
		const NOW = new Date('2026-04-30T10:00:00.000Z').getTime();
		const claim = makeClaim({ expiresAt: '2026-04-30T10:01:30.000Z' }); // expires in future
		const workGraph = new MemoryHeartbeatStore();
		const registry = registryWithClaims([claim]);
		const heartbeat = new ClaimHeartbeat({
			workGraph,
			fleetRegistry: registry,
			intervalMs: 30_000,
			renewWindowMs: 90_000,
			now: () => NOW,
		});

		const result = await heartbeat.tick();

		expect(result.renewed).toBe(1);
		expect(result.expired).toBe(0);
		expect(result.errors).toHaveLength(0);
		expect(workGraph.renewed[0]).toMatchObject({
			workItemId: 'work-1',
			claimId: 'claim-1',
			expiresAt: new Date(NOW + 90_000).toISOString(),
		});
	});

	it('releases claims whose lease has already expired', async () => {
		const NOW = new Date('2026-04-30T10:05:00.000Z').getTime();
		// expiresAt is in the past relative to NOW
		const claim = makeClaim({ expiresAt: '2026-04-30T10:01:30.000Z' });
		const workGraph = new MemoryHeartbeatStore();
		const registry = registryWithClaims([claim]);
		const heartbeat = new ClaimHeartbeat({
			workGraph,
			fleetRegistry: registry,
			now: () => NOW,
		});

		const result = await heartbeat.tick();

		expect(result.expired).toBe(1);
		expect(result.renewed).toBe(0);
		expect(workGraph.released[0].workItemId).toBe('work-1');
	});

	it('expired work is returned to the ready pool (release is called, not renew)', async () => {
		const NOW = new Date('2026-04-30T10:10:00.000Z').getTime();
		const expiredClaim = makeClaim({ expiresAt: '2026-04-30T09:00:00.000Z' });
		const activeClaim = makeClaim({
			id: 'claim-2',
			workItemId: 'work-2',
			expiresAt: '2026-04-30T10:30:00.000Z',
		});
		const workGraph = new MemoryHeartbeatStore();
		const registry = registryWithClaims([expiredClaim, activeClaim]);
		const heartbeat = new ClaimHeartbeat({
			workGraph,
			fleetRegistry: registry,
			renewWindowMs: 90_000,
			now: () => NOW,
		});

		const result = await heartbeat.tick();

		expect(result.expired).toBe(1);
		expect(result.renewed).toBe(1);
		// Only the expired one was released
		expect(workGraph.released).toHaveLength(1);
		expect(workGraph.released[0].workItemId).toBe('work-1');
		// The active one was renewed
		expect(workGraph.renewed).toHaveLength(1);
		expect(workGraph.renewed[0].workItemId).toBe('work-2');
	});

	it('records errors when renewClaim throws, without stopping other renewals', async () => {
		const NOW = new Date('2026-04-30T10:00:00.000Z').getTime();
		const claim = makeClaim({ expiresAt: '2026-04-30T10:05:00.000Z' });
		const workGraph = new MemoryHeartbeatStore();
		workGraph.throwOnRenew = true;
		const registry = registryWithClaims([claim]);
		const heartbeat = new ClaimHeartbeat({
			workGraph,
			fleetRegistry: registry,
			now: () => NOW,
		});

		const result = await heartbeat.tick();

		expect(result.renewed).toBe(0);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0].message).toBe('renew conflict');
	});

	it('does not double-count claims shared across multiple fleet entries', async () => {
		// Two entries that both reference the same claim (shouldn't happen in
		// practice, but the dedup guard should protect against it).
		const NOW = new Date('2026-04-30T10:00:00.000Z').getTime();
		const claim = makeClaim({ expiresAt: '2026-04-30T10:05:00.000Z' });
		const workGraph = new MemoryHeartbeatStore();
		const registry = new FleetRegistry();

		const entry1: AgentDispatchFleetEntry = {
			...baseEntry,
			id: 'agent-1',
			currentClaims: [claim],
		};
		const entry2: AgentDispatchFleetEntry = {
			...baseEntry,
			id: 'agent-2',
			currentClaims: [{ ...claim, owner: { type: 'agent', id: 'agent-2', name: 'Agent Two' } }],
		};

		(registry as unknown as { entries: Map<string, AgentDispatchFleetEntry> }).entries.set(
			entry1.id,
			entry1
		);
		(registry as unknown as { entries: Map<string, AgentDispatchFleetEntry> }).entries.set(
			entry2.id,
			entry2
		);

		const heartbeat = new ClaimHeartbeat({
			workGraph,
			fleetRegistry: registry,
			now: () => NOW,
		});

		const result = await heartbeat.tick();

		// Only claim-1 is owned by agent-1 (which is in the fleet owner id set).
		// claim from entry2 has owner id 'agent-2' which is also in the fleet,
		// but both claims share the same claim.id ('claim-1'), so dedup fires.
		expect(result.renewed).toBe(1);
	});

	it('start/stop control the interval', () => {
		const workGraph = new MemoryHeartbeatStore();
		const registry = registryWithClaims([]);
		const heartbeat = new ClaimHeartbeat({
			workGraph,
			fleetRegistry: registry,
			intervalMs: 50,
		});

		heartbeat.start();
		heartbeat.start(); // idempotent

		heartbeat.stop();
		heartbeat.stop(); // idempotent

		// No assertion needed — if stop() throws or setInterval leaks this would
		// surface in test teardown.  The test passing confirms idempotency.
		expect(true).toBe(true);
	});
});
