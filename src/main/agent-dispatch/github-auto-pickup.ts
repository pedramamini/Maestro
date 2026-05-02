import type { GithubProjectItem } from './github-client';
import {
	getGithubProjectCoordinator,
	type GithubProjectReference,
} from './github-project-coordinator';

export type DispatchGithubProjectItem = GithubProjectItem;

export interface DispatchGithubProjectCoordinates {
	owner: string;
	projectNumber: number;
	projectPath?: string;
}

export interface DispatchGithubClaimResult {
	projectId: string;
}

/**
 * Narrow GitHub Projects coordinator surface needed by the dispatch startup
 * auto-pickup path. The default adapter routes through GithubProjectCoordinator
 * so callers do not perform raw GitHub Project reads/writes directly.
 */
export interface DispatchGithubAutoPickupCoordinator {
	listTasksReadyUnassigned(): Promise<DispatchGithubProjectItem[]>;
	listInProgressAssignedToSlot(slotAgentId: string): Promise<DispatchGithubProjectItem[]>;
	claimRunnerSlot(itemId: string, slotAgentId: string): Promise<DispatchGithubClaimResult>;
	releaseRunnerSlot(itemId: string): Promise<void>;
}

export function createGithubAutoPickupCoordinator(
	coords: DispatchGithubProjectCoordinates
): DispatchGithubAutoPickupCoordinator {
	const project: GithubProjectReference = {
		projectOwner: coords.owner,
		projectNumber: coords.projectNumber,
		projectPath: coords.projectPath,
	};
	const coordinator = getGithubProjectCoordinator();

	return {
		listTasksReadyUnassigned: () => coordinator.getReadyItems(project),
		listInProgressAssignedToSlot: (slotAgentId) =>
			coordinator.getInFlightItems(project, slotAgentId),
		claimRunnerSlot: async (itemId, slotAgentId) => {
			const result = await coordinator.claimItem(project, itemId, slotAgentId);
			return { projectId: result.projectId };
		},
		releaseRunnerSlot: (itemId) => coordinator.releaseItem(project, itemId, 'Tasks Ready'),
	};
}
