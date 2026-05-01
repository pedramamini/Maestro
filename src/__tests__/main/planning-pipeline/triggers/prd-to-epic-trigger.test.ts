import { describe, expect, it, vi, beforeEach } from 'vitest';

import {
	createPrdToEpicTrigger,
	registerPrdToEpicTrigger,
	type PrdToEpicTriggerDeps,
} from '../../../../main/planning-pipeline/triggers/prd-to-epic-trigger';
import {
	PipelineTriggerRegistry,
	buildTriggerKey,
} from '../../../../main/planning-pipeline/trigger-registry';
import type { PipelineStageEvent } from '../../../../shared/planning-pipeline-types';
import type { WorkItem } from '../../../../shared/work-graph-types';

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
		workItemId: 'prd-item-001',
		fromStage: 'prd-finalized',
		toStage: 'epic-decomposed',
		actor: 'system',
		occurredAt: new Date().toISOString(),
		...overrides,
	};
}

function makeEpic(id = 'epic-001'): WorkItem {
	return {
		id,
		type: 'feature',
		status: 'planned',
		title: 'Generated Epic',
		projectPath: '/projects/foo',
		gitPath: 'projects/foo',
		source: 'delivery-planner',
		readonly: false,
		tags: ['delivery-planner', 'epic'],
		capabilities: [],
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		metadata: { kind: 'epic' },
	};
}

function makeDeps(overrides: Partial<PrdToEpicTriggerDeps> = {}): PrdToEpicTriggerDeps {
	return {
		plannerService: {
			convertPrdToEpic: vi.fn().mockResolvedValue(makeEpic()),
		},
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createPrdToEpicTrigger', () => {
	it('calls convertPrdToEpic with the work item ID when prd-finalized → epic-decomposed', async () => {
		const deps = makeDeps();
		const handler = createPrdToEpicTrigger(deps);

		await handler(makeEvent({ workItemId: 'prd-abc' }));

		expect(deps.plannerService.convertPrdToEpic).toHaveBeenCalledOnce();
		expect(deps.plannerService.convertPrdToEpic).toHaveBeenCalledWith(
			expect.objectContaining({ prdId: 'prd-abc' })
		);
	});

	it('does NOT call convertPrdToEpic for other fromStage values', async () => {
		const deps = makeDeps();
		const handler = createPrdToEpicTrigger(deps);

		// prd-draft → prd-finalized should be ignored
		await handler(makeEvent({ fromStage: 'prd-draft', toStage: 'prd-finalized' }));

		expect(deps.plannerService.convertPrdToEpic).not.toHaveBeenCalled();
	});

	it('does NOT call convertPrdToEpic for other toStage values', async () => {
		const deps = makeDeps();
		const handler = createPrdToEpicTrigger(deps);

		// prd-finalized → tasks-decomposed should be ignored
		await handler(makeEvent({ fromStage: 'prd-finalized', toStage: 'tasks-decomposed' }));

		expect(deps.plannerService.convertPrdToEpic).not.toHaveBeenCalled();
	});

	it('passes the actor from getActor to convertPrdToEpic when provided', async () => {
		const actor = { type: 'user' as const, id: 'user-123' };
		const deps = makeDeps({ getActor: () => actor });
		const handler = createPrdToEpicTrigger(deps);

		await handler(makeEvent());

		expect(deps.plannerService.convertPrdToEpic).toHaveBeenCalledWith(
			expect.objectContaining({ actor })
		);
	});

	it('uses the system actor when getActor is omitted', async () => {
		const deps = makeDeps();
		const handler = createPrdToEpicTrigger(deps);

		await handler(makeEvent());

		expect(deps.plannerService.convertPrdToEpic).toHaveBeenCalledWith(
			expect.objectContaining({ actor: { type: 'system', id: 'planning-pipeline' } })
		);
	});

	it('swallows errors thrown by convertPrdToEpic — does not re-throw', async () => {
		const deps = makeDeps({
			plannerService: {
				convertPrdToEpic: vi.fn().mockRejectedValue(new Error('LLM timeout')),
			},
		});
		const handler = createPrdToEpicTrigger(deps);

		// Must resolve without throwing
		await expect(handler(makeEvent())).resolves.toBeUndefined();
	});

	it('logs an error when convertPrdToEpic throws', async () => {
		const { logger } = await import('../../../../main/utils/logger');
		const deps = makeDeps({
			plannerService: {
				convertPrdToEpic: vi.fn().mockRejectedValue(new Error('LLM timeout')),
			},
		});
		const handler = createPrdToEpicTrigger(deps);

		await handler(makeEvent({ workItemId: 'prd-xyz' }));

		expect(logger.error).toHaveBeenCalledWith(
			expect.stringContaining('convertPrdToEpic failed'),
			expect.any(String),
			expect.objectContaining({ workItemId: 'prd-xyz' })
		);
	});
});

describe('registerPrdToEpicTrigger', () => {
	let registry: PipelineTriggerRegistry;

	beforeEach(() => {
		registry = new PipelineTriggerRegistry();
	});

	it('registers exactly one handler under the prd-finalized → epic-decomposed key', () => {
		registerPrdToEpicTrigger(registry, makeDeps());

		expect(registry.size).toBe(1);
		const handlers = registry.getHandlersFor('prd-finalized', 'epic-decomposed');
		expect(handlers).toHaveLength(1);
	});

	it('the registered handler dispatches correctly via registry.dispatch', async () => {
		const deps = makeDeps();
		registerPrdToEpicTrigger(registry, deps);

		await registry.dispatch(makeEvent({ workItemId: 'prd-via-dispatch' }));

		expect(deps.plannerService.convertPrdToEpic).toHaveBeenCalledOnce();
		expect(deps.plannerService.convertPrdToEpic).toHaveBeenCalledWith(
			expect.objectContaining({ prdId: 'prd-via-dispatch' })
		);
	});

	it('does not register under any other trigger key', () => {
		registerPrdToEpicTrigger(registry, makeDeps());

		// Only the prd-finalized → epic-decomposed key should be populated
		const otherHandlers = registry.getHandlersFor('prd-draft', 'prd-finalized');
		expect(otherHandlers).toHaveLength(0);

		// Verify the key that WAS registered
		const registeredKey = buildTriggerKey('prd-finalized', 'epic-decomposed');
		expect(registeredKey).toBe('prd-finalized→epic-decomposed');
	});
});
