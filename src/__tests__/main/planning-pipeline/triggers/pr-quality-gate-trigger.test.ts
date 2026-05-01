import { describe, expect, it, vi, beforeEach } from 'vitest';

import {
	createPrQualityGateTrigger,
	registerPrQualityGateTrigger,
	type PrQualityGateTriggerDeps,
	type QualityGateChecker,
	type QualityGateCheckResultPayload,
} from '../../../../main/planning-pipeline/triggers/pr-quality-gate-trigger';
import {
	PipelineTriggerRegistry,
	buildTriggerKey,
} from '../../../../main/planning-pipeline/trigger-registry';
import type { PipelineStageEvent } from '../../../../shared/planning-pipeline-types';

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
		workItemId: 'task-item-001',
		fromStage: 'runner-active',
		toStage: 'needs-review',
		actor: 'system',
		occurredAt: new Date().toISOString(),
		...overrides,
	};
}

function makeChecker(overrides: Partial<QualityGateChecker> = {}): QualityGateChecker {
	return {
		runChecks: vi.fn().mockResolvedValue({ passed: true, failures: [] }),
		...overrides,
	};
}

function makeDeps(overrides: Partial<PrQualityGateTriggerDeps> = {}): PrQualityGateTriggerDeps {
	return {
		checker: makeChecker(),
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// createPrQualityGateTrigger — stage guard
// ---------------------------------------------------------------------------

describe('createPrQualityGateTrigger — stage guard', () => {
	it('calls checker.runChecks on runner-active → needs-review', async () => {
		const deps = makeDeps();
		const handler = createPrQualityGateTrigger(deps);

		await handler(makeEvent({ fromStage: 'runner-active', toStage: 'needs-review' }));

		expect(deps.checker.runChecks).toHaveBeenCalledOnce();
	});

	it('does NOT call checker.runChecks on other stage pairs', async () => {
		const deps = makeDeps();
		const handler = createPrQualityGateTrigger(deps);

		// Several representative non-matching pairs
		await handler(makeEvent({ fromStage: 'tasks-decomposed', toStage: 'agent-ready' }));
		await handler(makeEvent({ fromStage: 'prd-finalized', toStage: 'epic-decomposed' }));
		await handler(makeEvent({ fromStage: 'agent-ready', toStage: 'runner-active' }));
		await handler(makeEvent({ fromStage: 'epic-decomposed', toStage: 'tasks-decomposed' }));

		expect(deps.checker.runChecks).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// createPrQualityGateTrigger — workItemId forwarding
// ---------------------------------------------------------------------------

describe('createPrQualityGateTrigger — workItemId forwarding', () => {
	it('forwards the event workItemId to checker.runChecks', async () => {
		const deps = makeDeps();
		const handler = createPrQualityGateTrigger(deps);

		await handler(makeEvent({ workItemId: 'work-item-42' }));

		expect(deps.checker.runChecks).toHaveBeenCalledWith(
			expect.objectContaining({ workItemId: 'work-item-42' })
		);
	});
});

// ---------------------------------------------------------------------------
// createPrQualityGateTrigger — onCheckResult callback
// ---------------------------------------------------------------------------

describe('createPrQualityGateTrigger — onCheckResult callback', () => {
	it('calls onCheckResult with { passed: true, failures: [] } when checker passes', async () => {
		const onCheckResult = vi.fn<(result: QualityGateCheckResultPayload) => Promise<void>>().mockResolvedValue(undefined);
		const deps = makeDeps({
			checker: makeChecker({ runChecks: vi.fn().mockResolvedValue({ passed: true, failures: [] }) }),
			onCheckResult,
		});
		const handler = createPrQualityGateTrigger(deps);

		await handler(makeEvent({ workItemId: 'task-pass' }));

		expect(onCheckResult).toHaveBeenCalledOnce();
		expect(onCheckResult).toHaveBeenCalledWith({
			workItemId: 'task-pass',
			passed: true,
			failures: [],
		});
	});

	it('calls onCheckResult with { passed: false, failures: [...] } when checker fails', async () => {
		const failures = ['tsc: found 3 errors', 'conflict markers detected in src/foo.ts'];
		const onCheckResult = vi.fn<(result: QualityGateCheckResultPayload) => Promise<void>>().mockResolvedValue(undefined);
		const deps = makeDeps({
			checker: makeChecker({ runChecks: vi.fn().mockResolvedValue({ passed: false, failures }) }),
			onCheckResult,
		});
		const handler = createPrQualityGateTrigger(deps);

		await handler(makeEvent({ workItemId: 'task-fail' }));

		expect(onCheckResult).toHaveBeenCalledOnce();
		expect(onCheckResult).toHaveBeenCalledWith({
			workItemId: 'task-fail',
			passed: false,
			failures,
		});
	});

	it('does not require onCheckResult — handler resolves without it', async () => {
		const deps = makeDeps({ onCheckResult: undefined });
		const handler = createPrQualityGateTrigger(deps);

		await expect(handler(makeEvent())).resolves.toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// createPrQualityGateTrigger — error handling
// ---------------------------------------------------------------------------

describe('createPrQualityGateTrigger — error handling', () => {
	it('swallows checker errors — does not re-throw', async () => {
		const deps = makeDeps({
			checker: makeChecker({ runChecks: vi.fn().mockRejectedValue(new Error('tsc crashed')) }),
		});
		const handler = createPrQualityGateTrigger(deps);

		await expect(handler(makeEvent())).resolves.toBeUndefined();
	});

	it('calls onCheckResult with { passed: false, failures: [<error message>] } when checker throws', async () => {
		const onCheckResult = vi.fn<(result: QualityGateCheckResultPayload) => Promise<void>>().mockResolvedValue(undefined);
		const deps = makeDeps({
			checker: makeChecker({ runChecks: vi.fn().mockRejectedValue(new Error('tsc crashed')) }),
			onCheckResult,
		});
		const handler = createPrQualityGateTrigger(deps);

		await handler(makeEvent({ workItemId: 'task-error' }));

		expect(onCheckResult).toHaveBeenCalledOnce();
		expect(onCheckResult).toHaveBeenCalledWith({
			workItemId: 'task-error',
			passed: false,
			failures: ['tsc crashed'],
		});
	});

	it('logs an error when checker throws', async () => {
		const { logger } = await import('../../../../main/utils/logger');
		const deps = makeDeps({
			checker: makeChecker({ runChecks: vi.fn().mockRejectedValue(new Error('build failed')) }),
		});
		const handler = createPrQualityGateTrigger(deps);

		await handler(makeEvent({ workItemId: 'task-log-err' }));

		expect(logger.error).toHaveBeenCalledWith(
			expect.stringContaining('checker threw'),
			expect.any(String),
			expect.objectContaining({ workItemId: 'task-log-err' })
		);
	});

	it('swallows onCheckResult callback errors — does not re-throw', async () => {
		const deps = makeDeps({
			onCheckResult: vi.fn().mockRejectedValue(new Error('callback boom')),
		});
		const handler = createPrQualityGateTrigger(deps);

		await expect(handler(makeEvent())).resolves.toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// registerPrQualityGateTrigger
// ---------------------------------------------------------------------------

describe('registerPrQualityGateTrigger', () => {
	let registry: PipelineTriggerRegistry;

	beforeEach(() => {
		registry = new PipelineTriggerRegistry();
	});

	it('registers exactly one handler under the runner-active → needs-review key', () => {
		registerPrQualityGateTrigger(registry, makeDeps());

		expect(registry.size).toBe(1);
		const handlers = registry.getHandlersFor('runner-active', 'needs-review');
		expect(handlers).toHaveLength(1);
	});

	it('the registered handler dispatches correctly via registry.dispatch', async () => {
		const onCheckResult = vi.fn<(result: QualityGateCheckResultPayload) => Promise<void>>().mockResolvedValue(undefined);
		const deps = makeDeps({ onCheckResult });
		registerPrQualityGateTrigger(registry, deps);

		await registry.dispatch(makeEvent({ workItemId: 'dispatch-test' }));

		expect(deps.checker.runChecks).toHaveBeenCalledWith(
			expect.objectContaining({ workItemId: 'dispatch-test' })
		);
		expect(onCheckResult).toHaveBeenCalledOnce();
	});

	it('does not register under any other trigger key', () => {
		registerPrQualityGateTrigger(registry, makeDeps());

		// Only the runner-active → needs-review key should be populated
		const unrelatedHandlers = registry.getHandlersFor('tasks-decomposed', 'agent-ready');
		expect(unrelatedHandlers).toHaveLength(0);

		// Verify the registered key format
		const registeredKey = buildTriggerKey('runner-active', 'needs-review');
		expect(registeredKey).toBe('runner-active→needs-review');
	});
});
