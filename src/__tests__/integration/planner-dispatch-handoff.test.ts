/**
 * Integration: Delivery Planner → Agent Dispatch handoff round-trip
 *
 * Issue #161 – Cross-Major 002
 *
 * Exercises the full end-to-end handoff:
 *   1. Delivery Planner creates a PRD, converts it to an epic, and decomposes
 *      the epic to tasks (using the deterministic gateway so no LLM is needed).
 *      After decomposition `refreshAgentReadyTags` tags unblocked, sufficiently-
 *      specified tasks with `agent-ready`.
 *   2. AgentDispatchEngine.runAutoPickup() finds the ready task and claims it
 *      against a real WorkGraphStorage (SQLite, temp dir).
 *   3. Completing the claim via `releaseClaim` and calling `updateStatus('done')`
 *      causes the planner dashboard to report the task as `done`.
 *
 * Failure modes covered:
 *   A. No eligible agent  → task stays unclaimed.
 *   B. Claim contention   → only one of two parallel `claimItem` calls wins;
 *                           the second throws "already has an active claim".
 *   C. Heartbeat expiry   → claim set with a past `expiresAt`, heartbeat tick
 *                           detects the expired lease and returns it to the pool.
 *
 * Design constraints:
 *   - Uses injected `now()` so heartbeat tests are synchronous, no real timers.
 *   - All I/O against a real SQLite file in a temp dir (no mocks for storage).
 *   - Runs in <5 s on CI.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkGraphDB } from '../../main/work-graph/work-graph-db';
import { WorkGraphStorage } from '../../main/work-graph/storage';
import { DeliveryPlannerService } from '../../main/delivery-planner/planner-service';
import {
	DeliveryPlannerDecomposer,
	StructuredDeliveryPlannerDecompositionGateway,
} from '../../main/delivery-planner/decomposer';
import { AgentDispatchEngine } from '../../main/agent-dispatch/dispatch-engine';
import { FleetRegistry } from '../../main/agent-dispatch/fleet-registry';
import { ClaimHeartbeat } from '../../main/agent-dispatch/heartbeat';
import type { AgentDispatchProfile } from '../../shared/agent-dispatch-types';
import { WORK_GRAPH_READY_TAG } from '../../shared/work-graph-types';
import type { WorkItemOwner } from '../../shared/work-graph-types';
import type { StoredSession } from '../../main/stores/types';

// ---------------------------------------------------------------------------
// Logger mock – keeps output clean in CI
// ---------------------------------------------------------------------------

vi.mock('../../main/utils/logger', () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROJECT_PATH = '/repo/test-project';
const GIT_PATH = '/repo/test-project';

/** Minimal dispatch profile for a general-purpose agent. */
function makeDispatchProfile(capabilityTags: string[]): AgentDispatchProfile {
	return {
		autoPickupEnabled: true,
		capabilityTags,
		maxConcurrentClaims: 3,
	};
}

/**
 * Seed the fleet registry with a synthetic idle agent that has the given
 * capabilities.  Uses the real FleetRegistry.refresh() path so all derived
 * fields (readiness, pickupEnabled, etc.) go through the canonical logic.
 */
function seedFleet(registry: FleetRegistry, sessionId: string, capabilityTags: string[]): void {
	const session: StoredSession = {
		id: sessionId,
		name: `Agent ${sessionId}`,
		toolType: 'codex',
		cwd: PROJECT_PATH,
		projectRoot: PROJECT_PATH,
		state: 'idle',
	};

	registry.refresh({
		sessions: [session],
		dispatchProfiles: { codex: makeDispatchProfile(capabilityTags) },
		dispatchSettings: {
			globalAutoPickupEnabled: true,
			projectAutoPickupEnabled: {},
			sshRemoteAutoPickupEnabled: {},
		},
	});
}

/**
 * Adapter that bridges WorkGraphStorage's claimItem (returns WorkItemClaim)
 * to the AgentDispatchEngine's expected interface (returns WorkItem).
 */
function makeDispatchStore(storage: WorkGraphStorage) {
	return {
		getUnblockedWorkItems: (filters = {}) => storage.getUnblockedWorkItems(filters),
		async claimItem(
			input: Parameters<typeof storage.claimItem>[0],
			actor?: Parameters<typeof storage.claimItem>[1]
		) {
			await storage.claimItem(input, actor);
			const item = await storage.getItem(input.workItemId);
			if (!item) {
				throw new Error(`Work Graph item disappeared after claim: ${input.workItemId}`);
			}
			return item;
		},
	};
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('Delivery Planner → Agent Dispatch handoff round-trip', () => {
	let tempDir: string;
	let db: WorkGraphDB;
	let storage: WorkGraphStorage;
	let plannerService: DeliveryPlannerService;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-handoff-'));
		db = new WorkGraphDB({ userDataPath: tempDir });
		db.initialize();
		storage = new WorkGraphStorage(db);
		plannerService = new DeliveryPlannerService({
			workGraph: storage,
			decomposer: new DeliveryPlannerDecomposer(
				new StructuredDeliveryPlannerDecompositionGateway()
			),
		});
	});

	afterEach(() => {
		db.close();
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	// -------------------------------------------------------------------------
	// Happy path: planner → agent-ready → claim → complete → dashboard = done
	// -------------------------------------------------------------------------

	it('claim is created for an agent-ready task and completion flows back to dashboard', async () => {
		// ── 1. Build planner hierarchy ──────────────────────────────────────
		const prd = await plannerService.createPrd({
			title: 'Ship Handoff Round-Trip',
			description: 'Validate the planner → dispatch round-trip.',
			projectPath: PROJECT_PATH,
			gitPath: GIT_PATH,
		});

		const epic = await plannerService.convertPrdToEpic({ prdId: prd.id });
		expect(epic.metadata?.kind).toBe('epic');

		const { tasks } = await plannerService.decomposeEpicToTasks({ epicId: epic.id });
		expect(tasks.length).toBeGreaterThan(0);

		// ── 2. Verify agent-ready tag placement ──────────────────────────────
		// The deterministic decomposer emits Design → Implement → Validate.
		// Design has no upstream deps so it should be tagged agent-ready.
		const readyAfterDecompose = tasks.filter((t) => t.tags.includes(WORK_GRAPH_READY_TAG));
		expect(readyAfterDecompose.length).toBeGreaterThanOrEqual(1);

		const targetTask = readyAfterDecompose[0];
		expect(targetTask.status).toBe('planned');

		// ── 3. Confirm unblocked work surfaces via getUnblockedWorkItems ─────
		const unblockedResult = await storage.getUnblockedWorkItems({
			projectPath: PROJECT_PATH,
		});
		expect(unblockedResult.items.map((i) => i.id)).toContain(targetTask.id);

		// ── 4. Spin up dispatch engine with an eligible agent ─────────────────
		// The Design task gets 'docs' capability via deliveryPlannerCapabilityHints
		// (tags include 'task-preview'). We match that capability.
		const taskCapability = (targetTask.capabilities ?? [])[0] ?? 'docs';

		const dispatchStore = makeDispatchStore(storage);
		const fleetRegistry = new FleetRegistry();
		seedFleet(fleetRegistry, 'agent-alpha', [taskCapability]);

		const engine = new AgentDispatchEngine({
			workGraph: dispatchStore,
			fleetRegistry,
		});

		// ── 5. Run auto-pickup ────────────────────────────────────────────────
		const pickupResult = await engine.runAutoPickup('manual');
		expect(pickupResult.claimed).toBe(1);
		expect(pickupResult.errors).toHaveLength(0);

		// ── 6. Verify claim in storage ────────────────────────────────────────
		const claimedItem = await storage.getItem(targetTask.id);
		expect(claimedItem).toBeDefined();
		expect(claimedItem!.status).toBe('claimed');
		expect(claimedItem!.claim).toBeDefined();
		expect(claimedItem!.claim!.status).toBe('active');
		expect(claimedItem!.claim!.owner.id).toBe('agent-alpha');
		expect(claimedItem!.claim!.source).toBe('auto-pickup');

		// ── 7. Complete the claim ─────────────────────────────────────────────
		await storage.releaseClaim(targetTask.id, {
			note: 'Work completed',
			actor: { type: 'agent', id: 'agent-alpha', name: 'Agent Alpha' },
		});
		await plannerService.updateStatus(targetTask.id, 'done');

		// ── 8. Dashboard reflects done ────────────────────────────────────────
		const dashboard = await plannerService.listDashboard({ projectPath: PROJECT_PATH });
		const doneTask = dashboard.items.find((item) => item.id === targetTask.id);
		expect(doneTask).toBeDefined();
		expect(doneTask!.status).toBe('done');

		const doneCount = dashboard.statusCounts.find((sc) => sc.status === 'done');
		expect(doneCount).toBeDefined();
		expect(doneCount!.count).toBeGreaterThanOrEqual(1);
	}, 10_000);

	// -------------------------------------------------------------------------
	// Failure A: No eligible agent – task stays unclaimed
	// -------------------------------------------------------------------------

	it('task stays unclaimed when no eligible agent exists', async () => {
		const prd = await plannerService.createPrd({
			title: 'Unclaimed Task Test',
			description: 'No eligible agent should claim this.',
			projectPath: PROJECT_PATH,
			gitPath: GIT_PATH,
		});
		const epic = await plannerService.convertPrdToEpic({ prdId: prd.id });
		const { tasks } = await plannerService.decomposeEpicToTasks({ epicId: epic.id });
		const readyTask = tasks.find((t) => t.tags.includes(WORK_GRAPH_READY_TAG));
		expect(readyTask).toBeDefined();

		// Engine with no sessions in registry → no eligible fleet.
		const dispatchStore = makeDispatchStore(storage);
		const fleetRegistry = new FleetRegistry();
		const engine = new AgentDispatchEngine({ workGraph: dispatchStore, fleetRegistry });

		const pickupResult = await engine.runAutoPickup('manual');
		expect(pickupResult.claimed).toBe(0);
		// No eligible fleet → early exit before querying work
		expect(pickupResult.queried).toBe(0);

		// Task still planned and unclaimed
		const item = await storage.getItem(readyTask!.id);
		expect(item!.claim).toBeUndefined();
		expect(['planned', 'ready']).toContain(item!.status);
	});

	// -------------------------------------------------------------------------
	// Failure B: Claim contention – only one winner
	// -------------------------------------------------------------------------

	it('only one of two parallel claimItem calls wins; the second throws "already has an active claim"', async () => {
		// Create a standalone task directly so we control its exact state.
		const item = await storage.createItem({
			type: 'task',
			status: 'ready',
			title: 'Contested Task',
			description: 'Two agents race for this.',
			projectPath: PROJECT_PATH,
			gitPath: GIT_PATH,
			source: 'manual',
			readonly: false,
			tags: [WORK_GRAPH_READY_TAG, 'code'],
		});

		const owner1: WorkItemOwner = { type: 'agent', id: 'agent-one', name: 'Agent One' };
		const owner2: WorkItemOwner = { type: 'agent', id: 'agent-two', name: 'Agent Two' };

		// Fire both claims concurrently – SQLite serialises the transaction so
		// exactly one succeeds and the other throws.
		const [result1, result2] = await Promise.allSettled([
			storage.claimItem({ workItemId: item.id, owner: owner1, source: 'manual' }),
			storage.claimItem({ workItemId: item.id, owner: owner2, source: 'manual' }),
		]);

		const fulfilled = [result1, result2].filter((r) => r.status === 'fulfilled');
		const rejected = [result1, result2].filter((r) => r.status === 'rejected');

		expect(fulfilled).toHaveLength(1);
		expect(rejected).toHaveLength(1);
		expect((rejected[0] as PromiseRejectedResult).reason.message).toMatch(
			/already has an active claim/
		);

		// Storage confirms a single active claim
		const stored = await storage.getItem(item.id);
		expect(stored!.status).toBe('claimed');
		expect(stored!.claim!.status).toBe('active');
	});

	// -------------------------------------------------------------------------
	// Failure C: Heartbeat expiry – claim returns to ready pool
	// -------------------------------------------------------------------------

	it('heartbeat releases an expired claim and item returns to the ready pool', async () => {
		// Create a task and claim it with a past expiresAt (already expired).
		const item = await storage.createItem({
			type: 'task',
			status: 'ready',
			title: 'Expiring Task',
			description: 'This claim will expire.',
			projectPath: PROJECT_PATH,
			gitPath: GIT_PATH,
			source: 'manual',
			readonly: false,
			tags: [WORK_GRAPH_READY_TAG, 'code'],
		});

		const owner: WorkItemOwner = {
			type: 'agent',
			id: 'agent-expiring',
			name: 'Agent Expiring',
		};

		// expiresAt is 60 s in the past → already expired
		const pastExpiry = new Date(Date.now() - 60_000).toISOString();
		const claimResult = await storage.claimItem({
			workItemId: item.id,
			owner,
			source: 'manual',
			expiresAt: pastExpiry,
		});
		expect(claimResult.status).toBe('active');

		// Confirm the claim is active in storage before the tick.
		const beforeTick = await storage.getItem(item.id);
		expect(beforeTick!.claim!.status).toBe('active');
		expect(beforeTick!.claim!.expiresAt).toBe(pastExpiry);

		// Seed the fleet registry so the heartbeat considers the claim as owned.
		const fleetRegistry = new FleetRegistry();
		fleetRegistry.refresh({
			sessions: [
				{
					id: 'agent-expiring',
					name: 'Agent Expiring',
					toolType: 'codex',
					cwd: PROJECT_PATH,
					projectRoot: PROJECT_PATH,
					state: 'idle',
				} as StoredSession,
			],
			activeClaims: [claimResult],
			dispatchProfiles: { codex: makeDispatchProfile(['code']) },
			dispatchSettings: {
				globalAutoPickupEnabled: true,
				projectAutoPickupEnabled: {},
				sshRemoteAutoPickupEnabled: {},
			},
		});

		// Inject a `now()` that returns a time well after `pastExpiry` so the
		// heartbeat classifies the claim as expired on the first tick.
		const frozenNow = Date.now(); // still > pastExpiry by definition
		const heartbeat = new ClaimHeartbeat({
			workGraph: storage,
			fleetRegistry,
			intervalMs: 5_000,
			now: () => frozenNow,
		});

		const tickResult = await heartbeat.tick();
		expect(tickResult.expired).toBe(1);
		expect(tickResult.renewed).toBe(0);
		expect(tickResult.errors).toHaveLength(0);

		// Item should be back in the ready pool.
		const afterTick = await storage.getItem(item.id);
		expect(afterTick!.status).toBe('ready');
		// releaseClaim removes the active claim row from the hydrated item
		expect(afterTick!.claim).toBeUndefined();

		// Item surfaces again via unblocked work query.
		const pool = await storage.getUnblockedWorkItems({ projectPath: PROJECT_PATH });
		expect(pool.items.some((i) => i.id === item.id)).toBe(true);
	});
});
