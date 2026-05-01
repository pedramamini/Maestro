import { describe, expect, it, vi } from 'vitest';
import { createPipelineRuntime } from '../../../main/planning-pipeline/runtime';
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

describe('createPipelineRuntime', () => {
	it('returns a runtime with bus, registry, and dispatcher', () => {
		const runtime = createPipelineRuntime();
		expect(runtime.bus).toBeDefined();
		expect(runtime.registry).toBeDefined();
		expect(runtime.dispatcher).toBeDefined();
		runtime.stop();
	});

	it('dispatcher is already started — events flow from bus to registry triggers', async () => {
		const runtime = createPipelineRuntime();
		const calls: PipelineStageEvent[] = [];

		runtime.registry.register('prd-draft', 'prd-finalized', (e) => calls.push(e));

		const event = makeEvent({ fromStage: 'prd-draft', toStage: 'prd-finalized' });
		await runtime.bus.publish(event);

		expect(calls).toHaveLength(1);
		expect(calls[0]).toBe(event);
		runtime.stop();
	});

	it('stop() halts event forwarding', async () => {
		const runtime = createPipelineRuntime();
		const calls: PipelineStageEvent[] = [];

		runtime.registry.register('prd-draft', 'prd-finalized', (e) => calls.push(e));
		runtime.stop();

		await runtime.bus.publish(makeEvent({ fromStage: 'prd-draft', toStage: 'prd-finalized' }));
		expect(calls).toHaveLength(0);
	});
});
