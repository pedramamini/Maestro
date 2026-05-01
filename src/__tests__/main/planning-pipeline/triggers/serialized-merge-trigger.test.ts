import { describe, expect, it, vi, beforeEach } from 'vitest';

import {
	createSerializedMergeTrigger,
	registerSerializedMergeTrigger,
	FORK_MERGED_PREDECESSORS,
	type SerializedMergeTriggerDeps,
	type MergeRunner,
} from '../../../../main/planning-pipeline/triggers/serialized-merge-trigger';
import { PipelineTriggerRegistry } from '../../../../main/planning-pipeline/trigger-registry';
import { PIPELINE_TRANSITIONS } from '../../../../shared/planning-pipeline-types';
import type { PipelineStageEvent, PipelineStage } from '../../../../shared/planning-pipeline-types';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../../../../main/utils/logger', () => ({
	logger: {
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
	},
}));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<PipelineStageEvent> = {}): PipelineStageEvent {
	return {
		workItemId: 'work-item-001',
		fromStage: 'review-approved',
		toStage: 'fork-merged',
		actor: 'system',
		occurredAt: new Date().toISOString(),
		...overrides,
	};
}

function makeRunner(overrides: Partial<MergeRunner> = {}): MergeRunner {
	return {
		runMerge: vi.fn().mockResolvedValue({ merged: true, sha: 'abc123' }),
		...overrides,
	};
}

function makeDeps(overrides: Partial<SerializedMergeTriggerDeps> = {}): SerializedMergeTriggerDeps {
	return {
		runner: makeRunner(),
		...overrides,
	};
}

// Helper to flush all pending microtasks / promise callbacks.
function flushPromises(): Promise<void> {
	return new Promise((resolve) => setImmediate(resolve));
}

// ---------------------------------------------------------------------------
// FORK_MERGED_PREDECESSORS sanity check
// ---------------------------------------------------------------------------

describe('FORK_MERGED_PREDECESSORS', () => {
	it('contains exactly the stages that list fork-merged as a forward target', () => {
		const expected = (
			Object.entries(PIPELINE_TRANSITIONS) as [PipelineStage, string[]][]
		)
			.filter(([, targets]) => targets.includes('fork-merged'))
			.map(([from]) => from);

		expect(FORK_MERGED_PREDECESSORS).toEqual(expect.arrayContaining(expected));
		expect(FORK_MERGED_PREDECESSORS).toHaveLength(expected.length);
	});

	it('includes review-approved', () => {
		expect(FORK_MERGED_PREDECESSORS).toContain('review-approved');
	});
});

// ---------------------------------------------------------------------------
// createSerializedMergeTrigger — basic dispatch
// ---------------------------------------------------------------------------

describe('createSerializedMergeTrigger', () => {
	it('calls runMerge when review-approved → fork-merged', async () => {
		const deps = makeDeps();
		const handler = createSerializedMergeTrigger(deps);

		handler(makeEvent({ fromStage: 'review-approved', toStage: 'fork-merged' }));
		await flushPromises();

		expect(deps.runner.runMerge).toHaveBeenCalledOnce();
		expect(deps.runner.runMerge).toHaveBeenCalledWith(
			expect.objectContaining({ workItemId: 'work-item-001' })
		);
	});

	it('forwards workItemId to runner.runMerge', async () => {
		const deps = makeDeps();
		const handler = createSerializedMergeTrigger(deps);

		handler(makeEvent({ workItemId: 'item-xyz-999' }));
		await flushPromises();

		expect(deps.runner.runMerge).toHaveBeenCalledWith(
			expect.objectContaining({ workItemId: 'item-xyz-999' })
		);
	});

	it('does NOT call runMerge when toStage is not fork-merged', async () => {
		const deps = makeDeps();
		const handler = createSerializedMergeTrigger(deps);

		handler(makeEvent({ fromStage: 'review-approved', toStage: 'needs-review' }));
		await flushPromises();

		expect(deps.runner.runMerge).not.toHaveBeenCalled();
	});

	it('does NOT call runMerge for an unrelated transition', async () => {
		const deps = makeDeps();
		const handler = createSerializedMergeTrigger(deps);

		handler(makeEvent({ fromStage: 'prd-draft', toStage: 'prd-finalized' }));
		await flushPromises();

		expect(deps.runner.runMerge).not.toHaveBeenCalled();
	});

	// ---------------------------------------------------------------------------
	// onMergeResult callback
	// ---------------------------------------------------------------------------

	it('calls onMergeResult on successful merge', async () => {
		const onMergeResult = vi.fn().mockResolvedValue(undefined);
		const deps = makeDeps({
			runner: makeRunner({
				runMerge: vi.fn().mockResolvedValue({ merged: true, sha: 'deadbeef' }),
			}),
			onMergeResult,
		});
		const handler = createSerializedMergeTrigger(deps);

		handler(makeEvent({ workItemId: 'item-abc' }));
		await flushPromises();

		expect(onMergeResult).toHaveBeenCalledWith(
			expect.objectContaining({ workItemId: 'item-abc', merged: true, sha: 'deadbeef' })
		);
	});

	it('calls onMergeResult with merged: false when runner returns declined result', async () => {
		const onMergeResult = vi.fn().mockResolvedValue(undefined);
		const deps = makeDeps({
			runner: makeRunner({
				runMerge: vi.fn().mockResolvedValue({ merged: false, reason: 'base-drifted' }),
			}),
			onMergeResult,
		});
		const handler = createSerializedMergeTrigger(deps);

		handler(makeEvent({ workItemId: 'item-drift' }));
		await flushPromises();

		expect(onMergeResult).toHaveBeenCalledWith(
			expect.objectContaining({ workItemId: 'item-drift', merged: false, reason: 'base-drifted' })
		);
	});

	it('calls onMergeResult with merged: false when runner throws', async () => {
		const onMergeResult = vi.fn().mockResolvedValue(undefined);
		const deps = makeDeps({
			runner: makeRunner({
				runMerge: vi.fn().mockRejectedValue(new Error('gh CLI unavailable')),
			}),
			onMergeResult,
		});
		const handler = createSerializedMergeTrigger(deps);

		handler(makeEvent({ workItemId: 'item-throw' }));
		await flushPromises();

		expect(onMergeResult).toHaveBeenCalledWith(
			expect.objectContaining({
				workItemId: 'item-throw',
				merged: false,
				reason: 'gh CLI unavailable',
			})
		);
	});

	// ---------------------------------------------------------------------------
	// Serialization: concurrent events run in order, not in parallel
	// ---------------------------------------------------------------------------

	it('serializes concurrent events — runs them in order, not in parallel', async () => {
		const order: string[] = [];

		// Each runMerge call records its start, delays 10 ms, then records its end.
		const runMerge = vi.fn().mockImplementation(({ workItemId }: { workItemId: string }) => {
			order.push(`start:${workItemId}`);
			return new Promise<{ merged: boolean; sha: string }>((resolve) => {
				setTimeout(() => {
					order.push(`end:${workItemId}`);
					resolve({ merged: true, sha: `sha-${workItemId}` });
				}, 10);
			});
		});

		const deps = makeDeps({ runner: { runMerge } });
		const handler = createSerializedMergeTrigger(deps);

		// Fire three events back-to-back (synchronously).
		handler(makeEvent({ workItemId: 'A' }));
		handler(makeEvent({ workItemId: 'B' }));
		handler(makeEvent({ workItemId: 'C' }));

		// Wait for all real timers to complete (3 × 10 ms = at least 30 ms).
		await new Promise((resolve) => setTimeout(resolve, 60));

		// All six events should have occurred, interleaved only in the correct
		// start→end→start→end pattern (not start→start→start→end→end→end).
		expect(order).toEqual([
			'start:A', 'end:A',
			'start:B', 'end:B',
			'start:C', 'end:C',
		]);
	});

	// ---------------------------------------------------------------------------
	// Chain resilience: errors in one run do not break subsequent runs
	// ---------------------------------------------------------------------------

	it('errors in runner do not break the chain — subsequent events still run', async () => {
		const runMerge = vi.fn()
			.mockRejectedValueOnce(new Error('first merge exploded'))
			.mockResolvedValueOnce({ merged: true, sha: 'recovered' });

		const onMergeResult = vi.fn().mockResolvedValue(undefined);
		const deps = makeDeps({ runner: { runMerge }, onMergeResult });
		const handler = createSerializedMergeTrigger(deps);

		// First event will throw; second should still run.
		handler(makeEvent({ workItemId: 'first' }));
		handler(makeEvent({ workItemId: 'second' }));

		await flushPromises();
		await flushPromises(); // drain the second queued promise too

		expect(runMerge).toHaveBeenCalledTimes(2);
		// The first call should have produced a failed onMergeResult.
		expect(onMergeResult).toHaveBeenCalledWith(
			expect.objectContaining({ workItemId: 'first', merged: false })
		);
		// The second call should have produced a successful onMergeResult.
		expect(onMergeResult).toHaveBeenCalledWith(
			expect.objectContaining({ workItemId: 'second', merged: true, sha: 'recovered' })
		);
	});

	// ---------------------------------------------------------------------------
	// Handler return value — fire-and-forget (returns void synchronously)
	// ---------------------------------------------------------------------------

	it('returns undefined synchronously — does not block the caller', () => {
		const deps = makeDeps();
		const handler = createSerializedMergeTrigger(deps);

		const result = handler(makeEvent());

		// The registry TriggerHandler type allows void | Promise<void>.
		// For fire-and-forget the handler should return undefined (not a Promise).
		expect(result).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// registerSerializedMergeTrigger
// ---------------------------------------------------------------------------

describe('registerSerializedMergeTrigger', () => {
	let registry: PipelineTriggerRegistry;

	beforeEach(() => {
		registry = new PipelineTriggerRegistry();
	});

	it('registers exactly one handler per allowed predecessor', () => {
		registerSerializedMergeTrigger(registry, makeDeps());

		expect(registry.size).toBe(FORK_MERGED_PREDECESSORS.length);

		for (const from of FORK_MERGED_PREDECESSORS) {
			const handlers = registry.getHandlersFor(from, 'fork-merged');
			expect(handlers).toHaveLength(1);
		}
	});

	it('registers under review-approved → fork-merged', () => {
		registerSerializedMergeTrigger(registry, makeDeps());

		const handlers = registry.getHandlersFor('review-approved', 'fork-merged');
		expect(handlers).toHaveLength(1);
	});

	it('the registered handler dispatches correctly via registry.dispatch', async () => {
		const deps = makeDeps();
		registerSerializedMergeTrigger(registry, deps);

		await registry.dispatch(makeEvent({ workItemId: 'via-dispatch' }));
		await flushPromises();

		expect(deps.runner.runMerge).toHaveBeenCalledWith(
			expect.objectContaining({ workItemId: 'via-dispatch' })
		);
	});
});
