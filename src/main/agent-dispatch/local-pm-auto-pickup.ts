import type { LocalPmWorkItem } from '../../shared/local-pm-types';

export type DispatchLocalPmItem = LocalPmWorkItem;

export interface DispatchLocalPmProjectCoordinates {
	projectPath: string;
}

export interface DispatchLocalPmClaimResult {
	projectId: string;
}

export interface DispatchLocalPmAutoPickupService {
	listReadyWork(
		projectPath: string,
		options?: { role?: string; includePlanned?: boolean }
	): Promise<{ items: DispatchLocalPmItem[] }>;
	listWorkItems(
		projectPath: string,
		filters?: { statuses?: string[] }
	): Promise<{ items: DispatchLocalPmItem[] }>;
	claimWork(input: {
		projectPath: string;
		workItemId: string;
		agentId: string;
		role: 'runner';
		note?: string;
	}): Promise<DispatchLocalPmItem>;
	releaseClaim(input: {
		projectPath: string;
		workItemId: string;
		note?: string;
		revertStatusTo?: 'ready';
	}): Promise<unknown>;
}

/**
 * Narrow local-PM coordinator surface needed by the dispatch startup
 * auto-pickup path. This mirrors createGithubAutoPickupCoordinator while
 * keeping all state reads/writes behind the local PM service API.
 */
export interface DispatchLocalPmAutoPickupCoordinator {
	listTasksReadyUnassigned(): Promise<DispatchLocalPmItem[]>;
	listInProgressAssignedToSlot(slotAgentId: string): Promise<DispatchLocalPmItem[]>;
	claimRunnerSlot(itemId: string, slotAgentId: string): Promise<DispatchLocalPmClaimResult>;
	releaseRunnerSlot(itemId: string): Promise<void>;
}

export function createLocalPmAutoPickupCoordinator(
	coords: DispatchLocalPmProjectCoordinates,
	service: DispatchLocalPmAutoPickupService
): DispatchLocalPmAutoPickupCoordinator {
	const projectPath = normalizeProjectPath(coords.projectPath);

	return {
		listTasksReadyUnassigned: async () => {
			const result = await service.listReadyWork(projectPath, { role: 'runner' });
			return result.items.filter((item) => !isActivelyClaimed(item));
		},
		listInProgressAssignedToSlot: async (slotAgentId) => {
			const result = await service.listWorkItems(projectPath, {
				statuses: ['claimed', 'in_progress'],
			});
			return result.items.filter((item) => isAssignedToSlot(item, slotAgentId));
		},
		claimRunnerSlot: async (itemId, slotAgentId) => {
			await service.claimWork({
				projectPath,
				workItemId: itemId,
				agentId: slotAgentId,
				role: 'runner',
				note: `Auto-picked by ${slotAgentId}`,
			});
			return { projectId: projectPath };
		},
		releaseRunnerSlot: async (itemId) => {
			await service.releaseClaim({
				projectPath,
				workItemId: itemId,
				revertStatusTo: 'ready',
				note: 'Released by dispatch auto-pickup',
			});
		},
	};
}

function normalizeProjectPath(projectPath: string): string {
	const normalized = projectPath.trim();
	if (!normalized) {
		throw new Error('Local PM auto-pickup requires a projectPath');
	}
	return normalized;
}

function isActivelyClaimed(item: DispatchLocalPmItem): boolean {
	return item.claim?.status === 'active';
}

function isAssignedToSlot(item: DispatchLocalPmItem, slotAgentId: string): boolean {
	if (item.claim?.status !== 'active') return false;
	const owner = item.claim.owner;
	return owner.id === slotAgentId || owner.agentId === slotAgentId;
}
