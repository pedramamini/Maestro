import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PipelineEventBus } from '../../../main/planning-pipeline/event-bus';
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

describe('PipelineEventBus', () => {
	let bus: PipelineEventBus;

	beforeEach(() => {
		bus = new PipelineEventBus();
	});

	it('delivers a published event to a single subscriber', async () => {
		const received: PipelineStageEvent[] = [];
		bus.subscribe((e) => {
			received.push(e);
		});

		const event = makeEvent();
		await bus.publish(event);

		expect(received).toHaveLength(1);
		expect(received[0]).toBe(event);
	});

	it('delivers a published event to all active subscribers', async () => {
		const calls: string[] = [];
		bus.subscribe(() => calls.push('a'));
		bus.subscribe(() => calls.push('b'));
		bus.subscribe(() => calls.push('c'));

		await bus.publish(makeEvent());

		expect(calls).toEqual(['a', 'b', 'c']);
	});

	it('does not call a handler after it has been unsubscribed', async () => {
		const calls: number[] = [];
		const unsub = bus.subscribe(() => calls.push(1));

		await bus.publish(makeEvent());
		unsub();
		await bus.publish(makeEvent());

		expect(calls).toEqual([1]);
	});

	it('isolates handler errors — remaining handlers still run', async () => {
		const calls: string[] = [];
		bus.subscribe(() => {
			throw new Error('intentional error');
		});
		bus.subscribe(() => calls.push('ran'));

		// Should not throw
		await expect(bus.publish(makeEvent())).resolves.toBeUndefined();
		expect(calls).toEqual(['ran']);
	});

	it('awaits async handlers before resolving', async () => {
		const order: number[] = [];
		bus.subscribe(async () => {
			await Promise.resolve();
			order.push(1);
		});
		bus.subscribe(() => {
			order.push(2);
		});

		await bus.publish(makeEvent());

		expect(order).toEqual([1, 2]);
	});

	it('reports correct subscriberCount', async () => {
		expect(bus.subscriberCount).toBe(0);
		const unsub1 = bus.subscribe(() => {});
		const unsub2 = bus.subscribe(() => {});
		expect(bus.subscriberCount).toBe(2);
		unsub1();
		expect(bus.subscriberCount).toBe(1);
		unsub2();
		expect(bus.subscriberCount).toBe(0);
	});
});
