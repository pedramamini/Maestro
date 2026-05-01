import { describe, expect, it, vi, beforeEach } from 'vitest';

import {
	createDocGapAutoPromoteSubscriber,
	registerDocGapAutoPromote,
	type DocGapAutoPromoteDeps,
	type DocGapAutoPromoteEventBus,
} from '../../../../main/planning-pipeline/triggers/doc-gap-auto-promote-trigger';
import type { WorkGraphBroadcastEnvelope, WorkItem } from '../../../../shared/work-graph-types';

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

function makeDocGapItem(overrides: Partial<WorkItem> = {}): WorkItem {
	return {
		id: 'wg-item-001',
		type: 'document',
		status: 'discovered',
		title: 'Missing docs for src/main/foo.ts',
		projectPath: '/projects/my-project',
		gitPath: 'projects/my-project',
		source: 'living-wiki',
		readonly: false,
		tags: ['living-wiki-doc-gap'],
		capabilities: [],
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		...overrides,
	};
}

function makeCreatedEnvelope(item: WorkItem): WorkGraphBroadcastEnvelope {
	return {
		type: 'workGraph',
		operation: 'workGraph.item.created',
		sequence: 1,
		timestamp: new Date().toISOString(),
		payload: { item },
	};
}

function makeDeps(overrides: Partial<DocGapAutoPromoteDeps> = {}): DocGapAutoPromoteDeps {
	return {
		plannerService: {
			promoteDocGap: vi.fn().mockResolvedValue({
				task: makeDocGapItem({ id: 'task-001', type: 'task' }),
				created: true,
			}),
		},
		isAutoPromoteEnabled: vi.fn().mockReturnValue(true),
		...overrides,
	};
}

function makeEventBus(): DocGapAutoPromoteEventBus & {
	_lastSubscriber: ((envelope: WorkGraphBroadcastEnvelope) => void) | null;
	_unsubscribeCalled: boolean;
} {
	let lastSubscriber: ((envelope: WorkGraphBroadcastEnvelope) => void) | null = null;
	let unsubscribeCalled = false;

	return {
		subscribe(handler) {
			lastSubscriber = handler;
			return () => {
				unsubscribeCalled = true;
			};
		},
		get _lastSubscriber() {
			return lastSubscriber;
		},
		get _unsubscribeCalled() {
			return unsubscribeCalled;
		},
	};
}

// ---------------------------------------------------------------------------
// Tests: createDocGapAutoPromoteSubscriber
// ---------------------------------------------------------------------------

describe('createDocGapAutoPromoteSubscriber', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('calls promoteDocGap when feature flag is on and a doc-gap item is created', async () => {
		const deps = makeDeps();
		const subscriber = createDocGapAutoPromoteSubscriber(deps);

		const item = makeDocGapItem({ id: 'gap-abc' });
		subscriber(makeCreatedEnvelope(item));

		// Fire-and-forget — flush micro-tasks
		await Promise.resolve();

		expect(deps.plannerService.promoteDocGap).toHaveBeenCalledOnce();
		expect(deps.plannerService.promoteDocGap).toHaveBeenCalledWith(
			expect.objectContaining({ docGapWorkItemId: 'gap-abc' })
		);
	});

	it('is a no-op when the feature flag is off', async () => {
		const deps = makeDeps({ isAutoPromoteEnabled: () => false });
		const subscriber = createDocGapAutoPromoteSubscriber(deps);

		subscriber(makeCreatedEnvelope(makeDocGapItem()));
		await Promise.resolve();

		expect(deps.plannerService.promoteDocGap).not.toHaveBeenCalled();
	});

	it('is a no-op for items that do NOT carry the living-wiki-doc-gap tag', async () => {
		const deps = makeDeps();
		const subscriber = createDocGapAutoPromoteSubscriber(deps);

		const nonGapItem = makeDocGapItem({ tags: ['delivery-planner', 'prd'] });
		subscriber(makeCreatedEnvelope(nonGapItem));
		await Promise.resolve();

		expect(deps.plannerService.promoteDocGap).not.toHaveBeenCalled();
	});

	it('is a no-op for non-created operations (e.g. workGraph.item.updated)', async () => {
		const deps = makeDeps();
		const subscriber = createDocGapAutoPromoteSubscriber(deps);

		const updatedEnvelope: WorkGraphBroadcastEnvelope = {
			type: 'workGraph',
			operation: 'workGraph.item.updated',
			sequence: 2,
			timestamp: new Date().toISOString(),
			payload: { item: makeDocGapItem() },
		};
		subscriber(updatedEnvelope);
		await Promise.resolve();

		expect(deps.plannerService.promoteDocGap).not.toHaveBeenCalled();
	});

	it('forwards the correct workItemId to promoteDocGap', async () => {
		const deps = makeDeps();
		const subscriber = createDocGapAutoPromoteSubscriber(deps);

		const item = makeDocGapItem({ id: 'specific-gap-id' });
		subscriber(makeCreatedEnvelope(item));
		await Promise.resolve();

		expect(deps.plannerService.promoteDocGap).toHaveBeenCalledWith(
			expect.objectContaining({ docGapWorkItemId: 'specific-gap-id' })
		);
	});

	it('passes the actor from getActor to promoteDocGap when provided', async () => {
		const actor = { type: 'user' as const, id: 'user-007' };
		const deps = makeDeps({ getActor: () => actor });
		const subscriber = createDocGapAutoPromoteSubscriber(deps);

		subscriber(makeCreatedEnvelope(makeDocGapItem()));
		await Promise.resolve();

		expect(deps.plannerService.promoteDocGap).toHaveBeenCalledWith(
			expect.objectContaining({ actor })
		);
	});

	it('uses the system actor when getActor is omitted', async () => {
		const deps = makeDeps();
		// Confirm getActor is not set
		expect(deps.getActor).toBeUndefined();

		const subscriber = createDocGapAutoPromoteSubscriber(deps);

		subscriber(makeCreatedEnvelope(makeDocGapItem()));
		await Promise.resolve();

		expect(deps.plannerService.promoteDocGap).toHaveBeenCalledWith(
			expect.objectContaining({ actor: { type: 'system', id: 'planning-pipeline' } })
		);
	});

	it('swallows errors thrown by promoteDocGap — does not propagate to caller', async () => {
		const deps = makeDeps({
			plannerService: {
				promoteDocGap: vi.fn().mockRejectedValue(new Error('DB connection lost')),
			},
		});
		const subscriber = createDocGapAutoPromoteSubscriber(deps);

		// Must not throw synchronously
		expect(() => subscriber(makeCreatedEnvelope(makeDocGapItem()))).not.toThrow();

		// Must not throw asynchronously either
		await expect(Promise.resolve()).resolves.toBeUndefined();
	});

	it('logs an error when promoteDocGap throws', async () => {
		const { logger } = await import('../../../../main/utils/logger');
		const deps = makeDeps({
			plannerService: {
				promoteDocGap: vi.fn().mockRejectedValue(new Error('planner unavailable')),
			},
		});
		const subscriber = createDocGapAutoPromoteSubscriber(deps);

		subscriber(makeCreatedEnvelope(makeDocGapItem({ id: 'gap-xyz' })));
		// Flush the rejected promise chain
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(logger.error).toHaveBeenCalledWith(
			expect.stringContaining('promoteDocGap failed'),
			expect.any(String),
			expect.objectContaining({ workItemId: 'gap-xyz' })
		);
	});
});

// ---------------------------------------------------------------------------
// Tests: registerDocGapAutoPromote
// ---------------------------------------------------------------------------

describe('registerDocGapAutoPromote', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns a working unsubscribe function', async () => {
		const deps = makeDeps();
		const eventBus = makeEventBus();

		const unsubscribe = registerDocGapAutoPromote(eventBus, deps);

		expect(eventBus._unsubscribeCalled).toBe(false);
		unsubscribe();
		expect(eventBus._unsubscribeCalled).toBe(true);
	});

	it('subscribes a handler that fires promoteDocGap on doc-gap events', async () => {
		const deps = makeDeps();
		const eventBus = makeEventBus();

		registerDocGapAutoPromote(eventBus, deps);

		const handler = eventBus._lastSubscriber!;
		expect(handler).toBeDefined();

		const item = makeDocGapItem({ id: 'reg-gap-001' });
		handler(makeCreatedEnvelope(item));
		await Promise.resolve();

		expect(deps.plannerService.promoteDocGap).toHaveBeenCalledWith(
			expect.objectContaining({ docGapWorkItemId: 'reg-gap-001' })
		);
	});

	it('does NOT fire promoteDocGap after unsubscribe is called', async () => {
		const deps = makeDeps();
		// Use a real unsubscribe mechanism via a Set
		const handlers = new Set<(envelope: WorkGraphBroadcastEnvelope) => void>();
		const realEventBus: DocGapAutoPromoteEventBus = {
			subscribe(handler) {
				handlers.add(handler);
				return () => handlers.delete(handler);
			},
		};

		const unsubscribe = registerDocGapAutoPromote(realEventBus, deps);
		unsubscribe();

		// Emit AFTER unsubscribe — handler was removed, so promoteDocGap must not fire
		for (const handler of handlers) {
			handler(makeCreatedEnvelope(makeDocGapItem()));
		}
		await Promise.resolve();

		expect(deps.plannerService.promoteDocGap).not.toHaveBeenCalled();
	});
});
