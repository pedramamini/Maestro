import { describe, expect, it, vi, beforeEach } from 'vitest';

import {
	createTasksAgentReadyTrigger,
	registerTasksAgentReadyTrigger,
	type TasksAgentReadyTriggerDeps,
} from '../../../../main/planning-pipeline/triggers/tasks-agent-ready-trigger';
import {
	PipelineTriggerRegistry,
	buildTriggerKey,
} from '../../../../main/planning-pipeline/trigger-registry';
import { WORK_GRAPH_READY_TAG } from '../../../../shared/work-graph-types';
import type { PipelineStageEvent } from '../../../../shared/planning-pipeline-types';
import type { WorkItem, WorkItemDependency } from '../../../../shared/work-graph-types';

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
		workItemId: 'epic-001',
		fromStage: 'epic-decomposed',
		toStage: 'tasks-decomposed',
		actor: 'system',
		occurredAt: new Date().toISOString(),
		...overrides,
	};
}

function makeTask(id: string, overrides: Partial<WorkItem> = {}): WorkItem {
	return {
		id,
		type: 'task',
		status: 'planned',
		title: `Task ${id}`,
		projectPath: '/projects/foo',
		gitPath: 'projects/foo',
		source: 'delivery-planner',
		readonly: false,
		tags: [],
		capabilities: [],
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		...overrides,
	};
}

function makeDependency(
	fromId: string,
	toId: string,
	status: WorkItemDependency['status'] = 'active'
): WorkItemDependency {
	return {
		id: `dep-${fromId}-${toId}`,
		fromWorkItemId: fromId,
		toWorkItemId: toId,
		type: 'blocks',
		status,
		createdAt: new Date().toISOString(),
	};
}

function makeStore(
	children: WorkItem[],
	itemsById: Record<string, WorkItem> = {}
): TasksAgentReadyTriggerDeps['workGraphStore'] {
	return {
		listChildrenOf: vi.fn().mockResolvedValue(children),
		getItem: vi.fn().mockImplementation((id: string) => Promise.resolve(itemsById[id] ?? null)),
		addTags: vi.fn().mockResolvedValue(undefined),
	};
}

function makeDeps(
	children: WorkItem[],
	itemsById: Record<string, WorkItem> = {}
): TasksAgentReadyTriggerDeps {
	return {
		workGraphStore: makeStore(children, itemsById),
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createTasksAgentReadyTrigger', () => {
	it('tags all unblocked tasks with WORK_GRAPH_READY_TAG when epic-decomposed → tasks-decomposed', async () => {
		const task1 = makeTask('task-1');
		const task2 = makeTask('task-2');
		const deps = makeDeps([task1, task2]);
		const handler = createTasksAgentReadyTrigger(deps);

		await handler(makeEvent({ workItemId: 'epic-001' }));

		expect(deps.workGraphStore.addTags).toHaveBeenCalledTimes(2);
		expect(deps.workGraphStore.addTags).toHaveBeenCalledWith('task-1', [WORK_GRAPH_READY_TAG]);
		expect(deps.workGraphStore.addTags).toHaveBeenCalledWith('task-2', [WORK_GRAPH_READY_TAG]);
	});

	it('leaves blocked tasks untagged when their dependency is not done', async () => {
		const blocker = makeTask('task-blocker', { status: 'planned' });
		const blockedTask = makeTask('task-blocked', {
			dependencies: [makeDependency('task-blocked', 'task-blocker')],
		});
		const freeTask = makeTask('task-free');

		const deps = makeDeps([blockedTask, freeTask], { 'task-blocker': blocker });
		const handler = createTasksAgentReadyTrigger(deps);

		await handler(makeEvent({ workItemId: 'epic-001' }));

		// Only the free task should be tagged
		expect(deps.workGraphStore.addTags).toHaveBeenCalledOnce();
		expect(deps.workGraphStore.addTags).toHaveBeenCalledWith('task-free', [WORK_GRAPH_READY_TAG]);
		expect(deps.workGraphStore.addTags).not.toHaveBeenCalledWith('task-blocked', expect.anything());
	});

	it('tags a task whose dependency is already done (unblocked)', async () => {
		const doneDep = makeTask('task-done', { status: 'done' });
		const task = makeTask('task-1', {
			dependencies: [makeDependency('task-1', 'task-done')],
		});

		const deps = makeDeps([task], { 'task-done': doneDep });
		const handler = createTasksAgentReadyTrigger(deps);

		await handler(makeEvent({ workItemId: 'epic-001' }));

		expect(deps.workGraphStore.addTags).toHaveBeenCalledOnce();
		expect(deps.workGraphStore.addTags).toHaveBeenCalledWith('task-1', [WORK_GRAPH_READY_TAG]);
	});

	it('ignores child items that are not kind=task (e.g. nested epics, documents)', async () => {
		const epic = makeTask('nested-epic', { type: 'feature' });
		const doc = makeTask('doc-001', { type: 'document' });
		const realTask = makeTask('task-1');

		const deps = makeDeps([epic, doc, realTask]);
		const handler = createTasksAgentReadyTrigger(deps);

		await handler(makeEvent({ workItemId: 'epic-001' }));

		expect(deps.workGraphStore.addTags).toHaveBeenCalledOnce();
		expect(deps.workGraphStore.addTags).toHaveBeenCalledWith('task-1', [WORK_GRAPH_READY_TAG]);
	});

	it('does NOT fire on other stage pairs', async () => {
		const task1 = makeTask('task-1');
		const deps = makeDeps([task1]);
		const handler = createTasksAgentReadyTrigger(deps);

		// prd-finalized → epic-decomposed should be ignored
		await handler(makeEvent({ fromStage: 'prd-finalized', toStage: 'epic-decomposed' }));
		// tasks-decomposed → agent-ready should be ignored
		await handler(makeEvent({ fromStage: 'tasks-decomposed', toStage: 'agent-ready' }));

		expect(deps.workGraphStore.listChildrenOf).not.toHaveBeenCalled();
		expect(deps.workGraphStore.addTags).not.toHaveBeenCalled();
	});

	it('swallows store errors from listChildrenOf — does not re-throw', async () => {
		const store = makeStore([]);
		vi.mocked(store.listChildrenOf).mockRejectedValue(new Error('DB connection lost'));
		const handler = createTasksAgentReadyTrigger({ workGraphStore: store });

		// Must resolve without throwing
		await expect(handler(makeEvent())).resolves.toBeUndefined();
	});

	it('swallows per-task addTags errors and continues processing remaining tasks', async () => {
		const task1 = makeTask('task-1');
		const task2 = makeTask('task-2');
		const store = makeStore([task1, task2]);
		// task-1 throws, task-2 should still be tagged
		vi.mocked(store.addTags)
			.mockRejectedValueOnce(new Error('write failure'))
			.mockResolvedValueOnce(undefined);

		const handler = createTasksAgentReadyTrigger({ workGraphStore: store });
		await expect(handler(makeEvent())).resolves.toBeUndefined();

		// Both addTags calls were attempted
		expect(store.addTags).toHaveBeenCalledTimes(2);
	});

	it('is idempotent — skips tasks already tagged agent-ready', async () => {
		const alreadyTagged = makeTask('task-1', { tags: [WORK_GRAPH_READY_TAG] });
		const deps = makeDeps([alreadyTagged]);
		const handler = createTasksAgentReadyTrigger(deps);

		await handler(makeEvent());

		expect(deps.workGraphStore.addTags).not.toHaveBeenCalled();
	});
});

describe('registerTasksAgentReadyTrigger', () => {
	let registry: PipelineTriggerRegistry;

	beforeEach(() => {
		registry = new PipelineTriggerRegistry();
	});

	it('registers exactly one handler under the epic-decomposed → tasks-decomposed key', () => {
		const task1 = makeTask('task-1');
		registerTasksAgentReadyTrigger(registry, makeDeps([task1]));

		expect(registry.size).toBe(1);
		const handlers = registry.getHandlersFor('epic-decomposed', 'tasks-decomposed');
		expect(handlers).toHaveLength(1);
	});

	it('the registered handler dispatches correctly via registry.dispatch', async () => {
		const task1 = makeTask('task-1');
		const deps = makeDeps([task1]);
		registerTasksAgentReadyTrigger(registry, deps);

		await registry.dispatch(makeEvent({ workItemId: 'epic-via-dispatch' }));

		expect(deps.workGraphStore.listChildrenOf).toHaveBeenCalledWith('epic-via-dispatch');
		expect(deps.workGraphStore.addTags).toHaveBeenCalledWith('task-1', [WORK_GRAPH_READY_TAG]);
	});

	it('does not register under any other trigger key', () => {
		registerTasksAgentReadyTrigger(registry, makeDeps([]));

		// Only the epic-decomposed → tasks-decomposed key should be populated
		const otherHandlers = registry.getHandlersFor('prd-finalized', 'epic-decomposed');
		expect(otherHandlers).toHaveLength(0);

		// Verify the key that WAS registered
		const registeredKey = buildTriggerKey('epic-decomposed', 'tasks-decomposed');
		expect(registeredKey).toBe('epic-decomposed→tasks-decomposed');
	});
});
