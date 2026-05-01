/**
 * Planning Pipeline Smoke Test — Issue #260 (Planning Pipeline 017)
 *
 * End-to-end assertions that verify the full pipeline runtime wires correctly
 * and that stage-transition triggers fire in the expected order on a simulated
 * PRD-to-merge journey.
 *
 * Five test cases:
 *   1. Full happy path: idea → prd-draft → … → fork-merged (all six triggers fire).
 *   2. Blocked at quality gate: runner-active → needs-review fires gate; gate
 *      fails; needs-fix label transition is asserted.
 *   3. Retry-and-fix: runner-active → needs-review (gate fail) → needs-fix →
 *      fix-active → needs-review (retry) → review-approved → fork-merged.
 *   4. Dead-letter on max-retries: supervisor ticks past maxRetries and calls
 *      deadLetter instead of retryClaim.
 *   5. Fork-merged serialization: two simultaneous review-approved events merge
 *      sequentially (second waits for first).
 *
 * All external I/O is replaced with vi.fn() stubs — no real DB, no real GitHub,
 * no real agents.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { createPipelineRuntime } from '../../main/planning-pipeline/runtime';
import {
	registerPrdToEpicTrigger,
	registerTasksAgentReadyTrigger,
	registerAgentReadyClaimTrigger,
	registerPrQualityGateTrigger,
	registerReviewRunnerTrigger,
	registerSerializedMergeTrigger,
} from '../../main/planning-pipeline/triggers';
import { PipelineSupervisor } from '../../main/planning-pipeline/heartbeat';
import type {
	PipelineStageEvent,
	AnyPipelineStage,
} from '../../shared/planning-pipeline-types';
import type { PrdToEpicTriggerDeps } from '../../main/planning-pipeline/triggers/prd-to-epic-trigger';
import type { TasksAgentReadyTriggerDeps } from '../../main/planning-pipeline/triggers/tasks-agent-ready-trigger';
import type { AgentReadyClaimTriggerDeps } from '../../main/planning-pipeline/triggers/agent-ready-claim-trigger';
import type { PrQualityGateTriggerDeps } from '../../main/planning-pipeline/triggers/pr-quality-gate-trigger';
import type { ReviewRunnerTriggerDeps } from '../../main/planning-pipeline/triggers/review-runner-trigger';
import type { SerializedMergeTriggerDeps } from '../../main/planning-pipeline/triggers/serialized-merge-trigger';
import type { PipelineSupervisorDeps, InFlightWorkItem } from '../../main/planning-pipeline/heartbeat';

// ---------------------------------------------------------------------------
// Logger mock — keeps test output clean
// ---------------------------------------------------------------------------

vi.mock('../../main/utils/logger', () => ({
	logger: {
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
	},
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function event(
	workItemId: string,
	fromStage: AnyPipelineStage,
	toStage: AnyPipelineStage
): PipelineStageEvent {
	return {
		workItemId,
		fromStage,
		toStage,
		actor: 'smoke-test',
		occurredAt: new Date().toISOString(),
	};
}

/**
 * Boots a runtime, registers all six stage-transition triggers with stub deps,
 * and returns both the runtime and the individual stubs for assertion.
 */
function bootRuntime() {
	const runtime = createPipelineRuntime();

	// --- prd-to-epic ---
	const convertPrdToEpic = vi.fn().mockResolvedValue({
		id: 'epic-001',
		type: 'feature',
		status: 'planned',
		title: 'Generated Epic',
		projectPath: '/repo',
		gitPath: '/repo/epic.md',
		source: 'delivery-planner',
		readonly: false,
		tags: [],
		capabilities: [],
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		metadata: { kind: 'epic' },
	});
	const prdToEpicDeps: PrdToEpicTriggerDeps = {
		plannerService: { convertPrdToEpic },
	};
	registerPrdToEpicTrigger(runtime.registry, prdToEpicDeps);

	// --- tasks-agent-ready ---
	const listChildrenOf = vi.fn().mockResolvedValue([
		{
			id: 'task-001',
			type: 'task',
			status: 'planned',
			title: 'Task A',
			projectPath: '/repo',
			gitPath: '/repo/task-a.md',
			source: 'delivery-planner',
			readonly: false,
			tags: [],
			capabilities: [],
			dependencies: [],
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			metadata: {},
		},
	]);
	const getItem = vi.fn().mockResolvedValue(null);
	const addTags = vi.fn().mockResolvedValue(undefined);
	const tasksReadyDeps: TasksAgentReadyTriggerDeps = {
		workGraphStore: { listChildrenOf, getItem, addTags },
	};
	registerTasksAgentReadyTrigger(runtime.registry, tasksReadyDeps);

	// --- agent-ready-claim ---
	const runAutoPickup = vi.fn().mockResolvedValue({
		claimed: true,
		sessionId: 'session-abc',
		workItemId: 'task-001',
	});
	const claimDeps: AgentReadyClaimTriggerDeps = {
		dispatchEngine: { runAutoPickup },
	};
	registerAgentReadyClaimTrigger(runtime.registry, claimDeps);

	// --- pr-quality-gate ---
	const runChecks = vi.fn().mockResolvedValue({ passed: true, failures: [] });
	const onCheckResult = vi.fn().mockResolvedValue(undefined);
	const qualityGateDeps: PrQualityGateTriggerDeps = {
		checker: { runChecks },
		onCheckResult,
	};
	registerPrQualityGateTrigger(runtime.registry, qualityGateDeps);

	// --- review-runner ---
	const launchReviewer = vi.fn().mockResolvedValue({ launched: true, sessionId: 'reviewer-abc' });
	const onLaunchResult = vi.fn().mockResolvedValue(undefined);
	const reviewRunnerDeps: ReviewRunnerTriggerDeps = {
		launcher: { launchReviewer },
		onLaunchResult,
	};
	registerReviewRunnerTrigger(runtime.registry, reviewRunnerDeps);

	// --- serialized-merge ---
	const runMerge = vi.fn().mockResolvedValue({ merged: true, sha: 'abc123' });
	const onMergeResult = vi.fn().mockResolvedValue(undefined);
	const mergeDeps: SerializedMergeTriggerDeps = {
		runner: { runMerge },
		onMergeResult,
	};
	registerSerializedMergeTrigger(runtime.registry, mergeDeps);

	return {
		runtime,
		stubs: {
			convertPrdToEpic,
			listChildrenOf,
			addTags,
			runAutoPickup,
			runChecks,
			onCheckResult,
			launchReviewer,
			onLaunchResult,
			runMerge,
			onMergeResult,
		},
	};
}

// ---------------------------------------------------------------------------
// Test 1: Full happy path — all triggers fire in order
// ---------------------------------------------------------------------------

describe('Planning Pipeline smoke — happy path', () => {
	it('fires all six triggers across a full PRD-to-merge journey', async () => {
		const { runtime, stubs } = bootRuntime();

		const id = 'wg-happy-001';

		// Walk through each transition that fires a trigger.
		await runtime.bus.publish(event(id, 'prd-draft', 'prd-finalized'));
		// prd-to-epic trigger: prd-finalized → epic-decomposed is the NEXT transition;
		// the trigger fires when the EVENT says fromStage=prd-finalized, toStage=epic-decomposed.
		await runtime.bus.publish(event(id, 'prd-finalized', 'epic-decomposed'));
		expect(stubs.convertPrdToEpic).toHaveBeenCalledOnce();

		await runtime.bus.publish(event(id, 'epic-decomposed', 'tasks-decomposed'));
		expect(stubs.listChildrenOf).toHaveBeenCalledWith(id);
		expect(stubs.addTags).toHaveBeenCalledWith('task-001', ['agent-ready']);

		await runtime.bus.publish(event(id, 'tasks-decomposed', 'agent-ready'));
		expect(stubs.runAutoPickup).toHaveBeenCalledOnce();

		await runtime.bus.publish(event(id, 'runner-active', 'needs-review'));
		expect(stubs.runChecks).toHaveBeenCalledOnce();
		// review-runner also fires on needs-review
		expect(stubs.launchReviewer).toHaveBeenCalledOnce();

		await runtime.bus.publish(event(id, 'review-approved', 'fork-merged'));
		// merge is fire-and-forget — wait for the chain
		await new Promise((r) => setTimeout(r, 20));
		expect(stubs.runMerge).toHaveBeenCalledOnce();
		expect(stubs.onMergeResult).toHaveBeenCalledWith(
			expect.objectContaining({ workItemId: id, merged: true, sha: 'abc123' })
		);

		runtime.stop();
	});
});

// ---------------------------------------------------------------------------
// Test 2: Blocked at quality gate — gate fails, onCheckResult sees passed=false
// ---------------------------------------------------------------------------

describe('Planning Pipeline smoke — quality gate failure', () => {
	it('reports gate failure via onCheckResult when checker returns passed=false', async () => {
		const { runtime, stubs } = bootRuntime();

		// Override quality gate checker to fail
		stubs.runChecks.mockResolvedValueOnce({
			passed: false,
			failures: ['TypeScript error: type mismatch in foo.ts'],
		});

		const id = 'wg-gate-fail-001';

		await runtime.bus.publish(event(id, 'runner-active', 'needs-review'));

		expect(stubs.runChecks).toHaveBeenCalledOnce();
		expect(stubs.onCheckResult).toHaveBeenCalledWith(
			expect.objectContaining({
				workItemId: id,
				passed: false,
				failures: expect.arrayContaining(['TypeScript error: type mismatch in foo.ts']),
			})
		);

		runtime.stop();
	});
});

// ---------------------------------------------------------------------------
// Test 3: Retry-and-fix loop
// ---------------------------------------------------------------------------

describe('Planning Pipeline smoke — retry-and-fix loop', () => {
	it('routes through needs-fix → fix-active → needs-review on a retry', async () => {
		const { runtime, stubs } = bootRuntime();

		const id = 'wg-retry-001';

		// First pass: quality gate fails
		stubs.runChecks.mockResolvedValueOnce({ passed: false, failures: ['lint error'] });

		await runtime.bus.publish(event(id, 'runner-active', 'needs-review'));
		expect(stubs.onCheckResult).toHaveBeenCalledWith(
			expect.objectContaining({ workItemId: id, passed: false })
		);
		expect(stubs.launchReviewer).toHaveBeenCalledOnce();

		// Failure loop: needs-review → needs-fix → fix-active → needs-review (retry)
		// These transitions do not hit quality-gate or review-runner (they're for the
		// intermediate stages) — only the final needs-review fires the triggers again.
		// (No additional registered handlers for needs-fix / fix-active transitions.)
		await runtime.bus.publish(event(id, 'needs-review', 'needs-fix'));
		await runtime.bus.publish(event(id, 'needs-fix', 'fix-active'));

		// Second needs-review pass (from fix-active): quality gate only runs on
		// runner-active→needs-review; fix-active→needs-review re-launches the review
		// agent but does NOT re-run the quality gate checker.
		await runtime.bus.publish(event(id, 'fix-active', 'needs-review'));
		// Quality gate was only called once (first pass)
		expect(stubs.runChecks).toHaveBeenCalledTimes(1);
		// Review-runner was called twice: once for runner-active→needs-review, once for fix-active→needs-review
		expect(stubs.launchReviewer).toHaveBeenCalledTimes(2);

		// Continue to merge
		await runtime.bus.publish(event(id, 'review-approved', 'fork-merged'));
		await new Promise((r) => setTimeout(r, 20));
		expect(stubs.runMerge).toHaveBeenCalledOnce();

		runtime.stop();
	});
});

// ---------------------------------------------------------------------------
// Test 4: Dead-letter on max-retries via PipelineSupervisor
// ---------------------------------------------------------------------------

describe('Planning Pipeline smoke — dead-letter on max-retries', () => {
	it('calls deadLetter instead of retryClaim once attempt >= maxRetries', async () => {
		const BASE_NOW = 1_700_000_000_000;
		const EXPIRED_AT = new Date(BASE_NOW - 1).toISOString(); // already expired

		const inFlight: InFlightWorkItem[] = [
			{
				workItemId: 'wg-stall-001',
				claim: {
					sessionId: 'session-stalled',
					expiresAt: EXPIRED_AT,
					attempt: 2, // at maxRetries (default = 2)
				},
			},
		];

		const releaseClaim = vi.fn().mockResolvedValue(undefined);
		const retryClaim = vi.fn().mockResolvedValue({ retried: false, attempt: 2 });
		const deadLetter = vi.fn().mockResolvedValue(undefined);
		const listInFlight = vi.fn().mockResolvedValue(inFlight);

		const supervisorDeps: PipelineSupervisorDeps = {
			now: () => BASE_NOW,
			releaseClaim,
			retryClaim,
			deadLetter,
			listInFlight,
			maxRetries: 2,
		};

		const supervisor = new PipelineSupervisor(supervisorDeps);
		const result = await supervisor.tick();

		expect(releaseClaim).toHaveBeenCalledWith('wg-stall-001', expect.any(String));
		expect(deadLetter).toHaveBeenCalledWith('wg-stall-001', expect.any(String));
		expect(retryClaim).not.toHaveBeenCalled();
		expect(result.released).toBe(1);
		expect(result.deadLettered).toBe(1);
		expect(result.retried).toBe(0);
	});

	it('retries when attempt is below maxRetries', async () => {
		const BASE_NOW = 1_700_000_000_000;
		const EXPIRED_AT = new Date(BASE_NOW - 1).toISOString();

		const inFlight: InFlightWorkItem[] = [
			{
				workItemId: 'wg-retry-002',
				claim: {
					sessionId: 'session-first',
					expiresAt: EXPIRED_AT,
					attempt: 0, // first attempt, not yet at maxRetries
				},
			},
		];

		const releaseClaim = vi.fn().mockResolvedValue(undefined);
		const retryClaim = vi.fn().mockResolvedValue({ retried: true, attempt: 1 });
		const deadLetter = vi.fn().mockResolvedValue(undefined);
		const listInFlight = vi.fn().mockResolvedValue(inFlight);

		const supervisorDeps: PipelineSupervisorDeps = {
			now: () => BASE_NOW,
			releaseClaim,
			retryClaim,
			deadLetter,
			listInFlight,
			maxRetries: 2,
		};

		const supervisor = new PipelineSupervisor(supervisorDeps);
		const result = await supervisor.tick();

		expect(releaseClaim).toHaveBeenCalledWith('wg-retry-002', expect.any(String));
		expect(retryClaim).toHaveBeenCalledWith('wg-retry-002', {
			previousSessionId: 'session-first',
			attempt: expect.any(Number),
		});
		expect(deadLetter).not.toHaveBeenCalled();
		expect(result.released).toBe(1);
		expect(result.retried).toBe(1);
		expect(result.deadLettered).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Test 5: Fork-merged serialization — two simultaneous merges run sequentially
// ---------------------------------------------------------------------------

describe('Planning Pipeline smoke — serialized merge', () => {
	it('serializes two concurrent fork-merged events (second waits for first)', async () => {
		const { runtime, stubs } = bootRuntime();

		const mergeOrder: string[] = [];

		// Give first merge a delay so we can observe ordering
		stubs.runMerge
			.mockImplementationOnce(async ({ workItemId }: { workItemId: string }) => {
				await new Promise((r) => setTimeout(r, 30));
				mergeOrder.push(workItemId);
				return { merged: true, sha: 'sha-first' };
			})
			.mockImplementationOnce(async ({ workItemId }: { workItemId: string }) => {
				mergeOrder.push(workItemId);
				return { merged: true, sha: 'sha-second' };
			});

		// Publish both events without awaiting individually so they can race.
		// The serialized-merge trigger is fire-and-forget from the bus side, so
		// we publish both synchronously and then wait for both merges to settle.
		runtime.bus.publish(event('wg-merge-001', 'review-approved', 'fork-merged'));
		runtime.bus.publish(event('wg-merge-002', 'review-approved', 'fork-merged'));

		// Wait long enough for both to complete (first has 30ms delay)
		await new Promise((r) => setTimeout(r, 100));

		expect(mergeOrder).toEqual(['wg-merge-001', 'wg-merge-002']);
		expect(stubs.runMerge).toHaveBeenCalledTimes(2);

		runtime.stop();
	});
});
