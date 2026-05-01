import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PipelineEventBus } from '../../../main/planning-pipeline/event-bus';
import { PipelineDispatcher } from '../../../main/planning-pipeline/dispatcher';
import { PipelineTriggerRegistry } from '../../../main/planning-pipeline/trigger-registry';
import type { PipelineStageEvent } from '../../../shared/planning-pipeline-types';

vi.mock('../../../main/utils/logger', () => ({
	logger: {
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
	},
}));

function makeEvent(overrides: Partial<PipelineStageEvent> = {}): PipelineStageEvent {
	return {
		workItemId: 'item-1',
		fromStage: 'prd-draft',
		toStage: 'prd-finalized',
		actor: 'system',
		occurredAt: new Date().toISOString(),
		...overrides,
	};
}

describe('PipelineDispatcher', () => {
	let bus: PipelineEventBus;
	let registry: PipelineTriggerRegistry;
	let dispatcher: PipelineDispatcher;

	beforeEach(() => {
		bus = new PipelineEventBus();
		registry = new PipelineTriggerRegistry();
		dispatcher = new PipelineDispatcher(bus, registry);
	});

	it('forwards bus events to the registry after start()', async () => {
		const calls: PipelineStageEvent[] = [];
		registry.register('prd-draft', 'prd-finalized', (e) => calls.push(e));

		dispatcher.start();
		const event = makeEvent({ fromStage: 'prd-draft', toStage: 'prd-finalized' });
		await bus.publish(event);

		expect(calls).toHaveLength(1);
		expect(calls[0]).toBe(event);
	});

	it('stop() unsubscribes from the bus — no more calls to registry', async () => {
		const calls: PipelineStageEvent[] = [];
		registry.register('prd-draft', 'prd-finalized', (e) => calls.push(e));

		dispatcher.start();
		dispatcher.stop();

		await bus.publish(makeEvent({ fromStage: 'prd-draft', toStage: 'prd-finalized' }));
		expect(calls).toHaveLength(0);
	});

	it('start() is idempotent — calling twice only registers one subscription', async () => {
		const calls: PipelineStageEvent[] = [];
		registry.register('prd-draft', 'prd-finalized', (e) => calls.push(e));

		dispatcher.start();
		dispatcher.start(); // second call should be a no-op

		await bus.publish(makeEvent({ fromStage: 'prd-draft', toStage: 'prd-finalized' }));
		// If two subscriptions were created, dispatch would run twice (2 registry calls).
		// With idempotency, we get exactly 1 call.
		expect(calls).toHaveLength(1);
	});

	it('isRunning reflects lifecycle state', () => {
		expect(dispatcher.isRunning).toBe(false);
		dispatcher.start();
		expect(dispatcher.isRunning).toBe(true);
		dispatcher.stop();
		expect(dispatcher.isRunning).toBe(false);
	});
});
