import { describe, expect, it, vi, beforeEach } from 'vitest';

import {
	createAgentReadyClaimTrigger,
	registerAgentReadyClaimTrigger,
	AGENT_READY_PREDECESSORS,
	type AgentReadyClaimTriggerDeps,
	type AgentReadyClaimEngine,
} from '../../../../main/planning-pipeline/triggers/agent-ready-claim-trigger';
import {
	PipelineTriggerRegistry,
	buildTriggerKey,
} from '../../../../main/planning-pipeline/trigger-registry';
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
		workItemId: 'task-item-001',
		fromStage: 'tasks-decomposed',
		toStage: 'agent-ready',
		actor: 'system',
		occurredAt: new Date().toISOString(),
		...overrides,
	};
}

function makeEngine(overrides: Partial<AgentReadyClaimEngine> = {}): AgentReadyClaimEngine {
	return {
		runAutoPickup: vi.fn().mockResolvedValue({
			trigger: 'manual',
			queried: 1,
			selected: 1,
			claimed: 1,
			skipped: 0,
			errors: [],
		}),
		...overrides,
	};
}

function makeDeps(overrides: Partial<AgentReadyClaimTriggerDeps> = {}): AgentReadyClaimTriggerDeps {
	return {
		dispatchEngine: makeEngine(),
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// AGENT_READY_PREDECESSORS sanity check
// ---------------------------------------------------------------------------

describe('AGENT_READY_PREDECESSORS', () => {
	it('contains exactly the stages that list agent-ready as a forward target', () => {
		const expected = (Object.entries(PIPELINE_TRANSITIONS) as [PipelineStage, string[]][])
			.filter(([, targets]) => targets.includes('agent-ready'))
			.map(([from]) => from);

		expect(AGENT_READY_PREDECESSORS).toEqual(expect.arrayContaining(expected));
		expect(AGENT_READY_PREDECESSORS).toHaveLength(expected.length);
	});

	it('includes tasks-decomposed', () => {
		expect(AGENT_READY_PREDECESSORS).toContain('tasks-decomposed');
	});
});

// ---------------------------------------------------------------------------
// createAgentReadyClaimTrigger
// ---------------------------------------------------------------------------

describe('createAgentReadyClaimTrigger', () => {
	it('calls runAutoPickup when tasks-decomposed → agent-ready', async () => {
		const deps = makeDeps();
		const handler = createAgentReadyClaimTrigger(deps);

		await handler(makeEvent({ fromStage: 'tasks-decomposed', toStage: 'agent-ready' }));

		expect(deps.dispatchEngine.runAutoPickup).toHaveBeenCalledOnce();
	});

	it.each(
		(Object.entries(PIPELINE_TRANSITIONS) as [PipelineStage, string[]][]).flatMap(
			([from, targets]) =>
				targets.includes('agent-ready') ? [{ from, to: 'agent-ready' as const }] : []
		)
	)(
		'calls runAutoPickup for every allowed predecessor: $from → agent-ready',
		async ({ from, to }) => {
			const deps = makeDeps();
			const handler = createAgentReadyClaimTrigger(deps);

			await handler(makeEvent({ fromStage: from, toStage: to }));

			expect(deps.dispatchEngine.runAutoPickup).toHaveBeenCalledOnce();
		}
	);

	it('does NOT call runAutoPickup when toStage is not agent-ready', async () => {
		const deps = makeDeps();
		const handler = createAgentReadyClaimTrigger(deps);

		await handler(makeEvent({ fromStage: 'tasks-decomposed', toStage: 'runner-active' }));

		expect(deps.dispatchEngine.runAutoPickup).not.toHaveBeenCalled();
	});

	it('does NOT call runAutoPickup for an unrelated transition', async () => {
		const deps = makeDeps();
		const handler = createAgentReadyClaimTrigger(deps);

		await handler(makeEvent({ fromStage: 'prd-draft', toStage: 'prd-finalized' }));

		expect(deps.dispatchEngine.runAutoPickup).not.toHaveBeenCalled();
	});

	it('swallows errors thrown by runAutoPickup — does not re-throw', async () => {
		const deps = makeDeps({
			dispatchEngine: makeEngine({
				runAutoPickup: vi.fn().mockRejectedValue(new Error('fleet unavailable')),
			}),
		});
		const handler = createAgentReadyClaimTrigger(deps);

		// Must resolve without throwing
		await expect(handler(makeEvent())).resolves.toBeUndefined();
	});

	it('logs an error when runAutoPickup throws', async () => {
		const { logger } = await import('../../../../main/utils/logger');
		const deps = makeDeps({
			dispatchEngine: makeEngine({
				runAutoPickup: vi.fn().mockRejectedValue(new Error('fleet unavailable')),
			}),
		});
		const handler = createAgentReadyClaimTrigger(deps);

		await handler(makeEvent({ workItemId: 'task-xyz' }));

		expect(logger.error).toHaveBeenCalledWith(
			expect.stringContaining('runAutoPickup failed'),
			expect.any(String),
			expect.objectContaining({ workItemId: 'task-xyz' })
		);
	});
});

// ---------------------------------------------------------------------------
// registerAgentReadyClaimTrigger
// ---------------------------------------------------------------------------

describe('registerAgentReadyClaimTrigger', () => {
	let registry: PipelineTriggerRegistry;

	beforeEach(() => {
		registry = new PipelineTriggerRegistry();
	});

	it('registers exactly one handler per allowed predecessor', () => {
		registerAgentReadyClaimTrigger(registry, makeDeps());

		expect(registry.size).toBe(AGENT_READY_PREDECESSORS.length);

		for (const from of AGENT_READY_PREDECESSORS) {
			const handlers = registry.getHandlersFor(from, 'agent-ready');
			expect(handlers).toHaveLength(1);
		}
	});

	it('registers under tasks-decomposed → agent-ready', () => {
		registerAgentReadyClaimTrigger(registry, makeDeps());

		const handlers = registry.getHandlersFor('tasks-decomposed', 'agent-ready');
		expect(handlers).toHaveLength(1);
	});

	it('does NOT register a null-origin handler (null → agent-ready is not a valid pipeline entry)', () => {
		registerAgentReadyClaimTrigger(registry, makeDeps());

		// The null-origin key should have no handlers.
		const nullKey = buildTriggerKey(null, 'agent-ready');
		const nullHandlers = registry.getHandlersFor(null as never, 'agent-ready');
		expect(nullHandlers).toHaveLength(0);
		// Satisfy unused-variable lint
		void nullKey;
	});

	it('the registered handler dispatches correctly via registry.dispatch', async () => {
		const deps = makeDeps();
		registerAgentReadyClaimTrigger(registry, deps);

		await registry.dispatch(makeEvent({ workItemId: 'task-via-dispatch' }));

		expect(deps.dispatchEngine.runAutoPickup).toHaveBeenCalledOnce();
	});
});
