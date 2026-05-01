import { describe, expect, it, vi, beforeEach } from 'vitest';

import {
	createReviewRunnerTrigger,
	registerReviewRunnerTrigger,
	NEEDS_REVIEW_PREDECESSORS,
	type ReviewRunnerTriggerDeps,
	type ReviewerLauncher,
} from '../../../../main/planning-pipeline/triggers/review-runner-trigger';
import {
	PipelineTriggerRegistry,
} from '../../../../main/planning-pipeline/trigger-registry';
import {
	PIPELINE_TRANSITIONS,
	PIPELINE_FAILURE_TRANSITIONS,
} from '../../../../shared/planning-pipeline-types';
import type { PipelineStageEvent, AnyPipelineStage } from '../../../../shared/planning-pipeline-types';

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
		workItemId: 'task-review-001',
		fromStage: 'runner-active',
		toStage: 'needs-review',
		actor: 'system',
		occurredAt: new Date().toISOString(),
		...overrides,
	};
}

function makeLauncher(overrides: Partial<ReviewerLauncher> = {}): ReviewerLauncher {
	return {
		launchReviewer: vi.fn().mockResolvedValue({
			launched: true,
			sessionId: 'session-rev-001',
		}),
		...overrides,
	};
}

function makeDeps(overrides: Partial<ReviewRunnerTriggerDeps> = {}): ReviewRunnerTriggerDeps {
	return {
		launcher: makeLauncher(),
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// NEEDS_REVIEW_PREDECESSORS sanity checks
// ---------------------------------------------------------------------------

describe('NEEDS_REVIEW_PREDECESSORS', () => {
	it('contains exactly the stages that list needs-review as a forward target (both tables)', () => {
		const expected = [
			...(Object.entries(PIPELINE_TRANSITIONS) as [AnyPipelineStage, AnyPipelineStage[]][]),
			...(Object.entries(PIPELINE_FAILURE_TRANSITIONS) as [
				AnyPipelineStage,
				AnyPipelineStage[],
			][]),
		]
			.filter(([, targets]) => targets.includes('needs-review'))
			.map(([from]) => from);

		expect(NEEDS_REVIEW_PREDECESSORS).toEqual(expect.arrayContaining(expected));
		expect(NEEDS_REVIEW_PREDECESSORS).toHaveLength(expected.length);
	});

	it('includes runner-active (happy path)', () => {
		expect(NEEDS_REVIEW_PREDECESSORS).toContain('runner-active');
	});

	it('includes fix-active (retry loop)', () => {
		expect(NEEDS_REVIEW_PREDECESSORS).toContain('fix-active');
	});
});

// ---------------------------------------------------------------------------
// createReviewRunnerTrigger — core behaviour
// ---------------------------------------------------------------------------

describe('createReviewRunnerTrigger', () => {
	it('calls launchReviewer on runner-active → needs-review', async () => {
		const deps = makeDeps();
		const handler = createReviewRunnerTrigger(deps);

		await handler(makeEvent({ fromStage: 'runner-active', toStage: 'needs-review' }));

		expect(deps.launcher.launchReviewer).toHaveBeenCalledOnce();
	});

	it('calls launchReviewer on fix-active → needs-review', async () => {
		const deps = makeDeps();
		const handler = createReviewRunnerTrigger(deps);

		await handler(makeEvent({ fromStage: 'fix-active', toStage: 'needs-review' }));

		expect(deps.launcher.launchReviewer).toHaveBeenCalledOnce();
	});

	it('does NOT call launchReviewer when toStage is not needs-review', async () => {
		const deps = makeDeps();
		const handler = createReviewRunnerTrigger(deps);

		await handler(makeEvent({ fromStage: 'runner-active', toStage: 'review-approved' }));

		expect(deps.launcher.launchReviewer).not.toHaveBeenCalled();
	});

	it('does NOT call launchReviewer for an unrelated transition', async () => {
		const deps = makeDeps();
		const handler = createReviewRunnerTrigger(deps);

		await handler(makeEvent({ fromStage: 'prd-draft', toStage: 'prd-finalized' }));

		expect(deps.launcher.launchReviewer).not.toHaveBeenCalled();
	});

	it('forwards workItemId and fromStage to the launcher', async () => {
		const deps = makeDeps();
		const handler = createReviewRunnerTrigger(deps);

		await handler(
			makeEvent({
				workItemId: 'task-check-args',
				fromStage: 'fix-active',
				toStage: 'needs-review',
			})
		);

		expect(deps.launcher.launchReviewer).toHaveBeenCalledWith(
			expect.objectContaining({
				workItemId: 'task-check-args',
				fromStage: 'fix-active',
			})
		);
	});

	it('calls onLaunchResult on successful launch', async () => {
		const onLaunchResult = vi.fn().mockResolvedValue(undefined);
		const deps = makeDeps({ onLaunchResult });
		const handler = createReviewRunnerTrigger(deps);

		await handler(makeEvent({ workItemId: 'task-callback-test' }));

		expect(onLaunchResult).toHaveBeenCalledOnce();
		expect(onLaunchResult).toHaveBeenCalledWith(
			expect.objectContaining({
				workItemId: 'task-callback-test',
				launched: true,
				sessionId: 'session-rev-001',
			})
		);
	});

	it('calls onLaunchResult with launched:false and reason when launcher throws', async () => {
		const onLaunchResult = vi.fn().mockResolvedValue(undefined);
		const deps = makeDeps({
			launcher: makeLauncher({
				launchReviewer: vi.fn().mockRejectedValue(new Error('agent pool exhausted')),
			}),
			onLaunchResult,
		});
		const handler = createReviewRunnerTrigger(deps);

		await handler(makeEvent({ workItemId: 'task-error-test' }));

		expect(onLaunchResult).toHaveBeenCalledOnce();
		expect(onLaunchResult).toHaveBeenCalledWith(
			expect.objectContaining({
				workItemId: 'task-error-test',
				launched: false,
				reason: 'agent pool exhausted',
			})
		);
	});

	it('swallows errors thrown by launchReviewer — does not re-throw', async () => {
		const deps = makeDeps({
			launcher: makeLauncher({
				launchReviewer: vi.fn().mockRejectedValue(new Error('network timeout')),
			}),
		});
		const handler = createReviewRunnerTrigger(deps);

		// Must resolve without throwing
		await expect(handler(makeEvent())).resolves.toBeUndefined();
	});

	it('logs an error when launchReviewer throws', async () => {
		const { logger } = await import('../../../../main/utils/logger');
		const deps = makeDeps({
			launcher: makeLauncher({
				launchReviewer: vi.fn().mockRejectedValue(new Error('spawn failed')),
			}),
		});
		const handler = createReviewRunnerTrigger(deps);

		await handler(makeEvent({ workItemId: 'task-log-test' }));

		expect(logger.error).toHaveBeenCalledWith(
			expect.stringContaining('launcher threw'),
			expect.any(String),
			expect.objectContaining({ workItemId: 'task-log-test' })
		);
	});
});

// ---------------------------------------------------------------------------
// registerReviewRunnerTrigger
// ---------------------------------------------------------------------------

describe('registerReviewRunnerTrigger', () => {
	let registry: PipelineTriggerRegistry;

	beforeEach(() => {
		registry = new PipelineTriggerRegistry();
	});

	it('registers exactly one handler per allowed predecessor', () => {
		registerReviewRunnerTrigger(registry, makeDeps());

		expect(registry.size).toBe(NEEDS_REVIEW_PREDECESSORS.length);

		for (const from of NEEDS_REVIEW_PREDECESSORS) {
			const handlers = registry.getHandlersFor(from, 'needs-review');
			expect(handlers).toHaveLength(1);
		}
	});

	it('registers under runner-active → needs-review', () => {
		registerReviewRunnerTrigger(registry, makeDeps());

		const handlers = registry.getHandlersFor('runner-active', 'needs-review');
		expect(handlers).toHaveLength(1);
	});

	it('registers under fix-active → needs-review', () => {
		registerReviewRunnerTrigger(registry, makeDeps());

		const handlers = registry.getHandlersFor('fix-active', 'needs-review');
		expect(handlers).toHaveLength(1);
	});

	it('the registered handler dispatches correctly via registry.dispatch', async () => {
		const deps = makeDeps();
		registerReviewRunnerTrigger(registry, deps);

		await registry.dispatch(
			makeEvent({ workItemId: 'task-dispatch-test', fromStage: 'runner-active' })
		);

		expect(deps.launcher.launchReviewer).toHaveBeenCalledOnce();
	});
});
