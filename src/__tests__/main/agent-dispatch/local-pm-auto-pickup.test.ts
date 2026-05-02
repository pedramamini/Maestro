import { describe, expect, it, vi } from 'vitest';

import {
	createLocalPmAutoPickupCoordinator,
	type DispatchLocalPmAutoPickupService,
	type DispatchLocalPmItem,
} from '../../../main/agent-dispatch/local-pm-auto-pickup';

const projectPath = '/opt/maestro-project';

describe('createLocalPmAutoPickupCoordinator', () => {
	it('scopes ready and in-progress reads to the local project path', async () => {
		const readyItems = [createItem({ id: 'task-1', title: 'Ready task', status: 'ready' })];
		const inProgressItems = [
			createItem({
				id: 'task-2',
				title: 'Claimed task',
				status: 'claimed',
				claim: createClaim('task-2', 'agent-1'),
			}),
		];
		const service = createService({
			listReadyWork: vi.fn().mockResolvedValue({ items: readyItems }),
			listWorkItems: vi.fn().mockResolvedValue({ items: inProgressItems }),
		});
		const coordinator = createLocalPmAutoPickupCoordinator({ projectPath }, service);

		await expect(coordinator.listTasksReadyUnassigned()).resolves.toEqual(readyItems);
		await expect(coordinator.listInProgressAssignedToSlot('agent-1')).resolves.toEqual(
			inProgressItems
		);

		expect(service.listReadyWork).toHaveBeenCalledWith(projectPath, { role: 'runner' });
		expect(service.listWorkItems).toHaveBeenCalledWith(projectPath, {
			statuses: ['claimed', 'in_progress'],
		});
	});

	it('filters ready and in-progress reads defensively', async () => {
		const service = createService({
			listReadyWork: vi.fn().mockResolvedValue({
				items: [
					createItem({ id: 'task-ready' }),
					createItem({ id: 'task-claimed', claim: createClaim('task-claimed', 'agent-1') }),
				],
			}),
			listWorkItems: vi.fn().mockResolvedValue({
				items: [
					createItem({ id: 'task-agent-1', claim: createClaim('task-agent-1', 'agent-1') }),
					createItem({ id: 'task-agent-2', claim: createClaim('task-agent-2', 'agent-2') }),
				],
			}),
		});
		const coordinator = createLocalPmAutoPickupCoordinator({ projectPath }, service);

		await expect(coordinator.listTasksReadyUnassigned()).resolves.toEqual([
			expect.objectContaining({ id: 'task-ready' }),
		]);
		await expect(coordinator.listInProgressAssignedToSlot('agent-1')).resolves.toEqual([
			expect.objectContaining({ id: 'task-agent-1' }),
		]);
	});

	it('claims and releases local item ids through the local PM service', async () => {
		const service = createService({
			claimWork: vi.fn().mockResolvedValue(createItem({ id: 'task-1' })),
			releaseClaim: vi.fn().mockResolvedValue(undefined),
		});
		const coordinator = createLocalPmAutoPickupCoordinator({ projectPath }, service);

		await expect(coordinator.claimRunnerSlot('task-1', 'agent-1')).resolves.toEqual({
			projectId: projectPath,
		});
		await coordinator.releaseRunnerSlot('task-1');

		expect(service.claimWork).toHaveBeenCalledWith({
			projectPath,
			workItemId: 'task-1',
			agentId: 'agent-1',
			role: 'runner',
			note: 'Auto-picked by agent-1',
		});
		expect(service.releaseClaim).toHaveBeenCalledWith({
			projectPath,
			workItemId: 'task-1',
			revertStatusTo: 'ready',
			note: 'Released by dispatch auto-pickup',
		});
	});

	it('rejects blank project paths before touching the service', () => {
		const service = createService();

		expect(() => createLocalPmAutoPickupCoordinator({ projectPath: ' \t ' }, service)).toThrow(
			'Local PM auto-pickup requires a projectPath'
		);
		expect(service.listReadyWork).not.toHaveBeenCalled();
	});
});

function createService(
	overrides: Partial<DispatchLocalPmAutoPickupService> = {}
): DispatchLocalPmAutoPickupService {
	return {
		listReadyWork: vi.fn().mockResolvedValue({ items: [] }),
		listWorkItems: vi.fn().mockResolvedValue({ items: [] }),
		claimWork: vi.fn().mockResolvedValue(createItem({ id: 'task' })),
		releaseClaim: vi.fn().mockResolvedValue(undefined),
		...overrides,
	};
}

function createItem(overrides: Partial<DispatchLocalPmItem>): DispatchLocalPmItem {
	const now = '2026-05-02T00:00:00.000Z';
	return {
		id: 'task',
		type: 'task',
		status: 'ready',
		title: 'Task',
		projectPath,
		gitPath: projectPath,
		source: 'delivery-planner',
		readonly: false,
		tags: ['agent-ready'],
		version: 0,
		createdAt: now,
		updatedAt: now,
		...overrides,
	};
}

function createClaim(workItemId: string, agentId: string): DispatchLocalPmItem['claim'] {
	return {
		id: `claim-${workItemId}`,
		workItemId,
		owner: {
			type: 'agent',
			id: agentId,
			agentId,
		},
		status: 'active',
		source: 'auto-pickup',
		claimedAt: '2026-05-02T00:00:00.000Z',
	};
}
