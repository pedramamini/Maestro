import type { WorkItemGithubReference } from '../../shared/work-graph-types';
import {
	FORK_GITHUB_OWNER,
	FORK_GITHUB_REPO,
	FORK_GITHUB_REPOSITORY,
} from '../../shared/fork-only-github';

export const DELIVERY_PLANNER_GITHUB_OWNER: string = FORK_GITHUB_OWNER;
export const DELIVERY_PLANNER_GITHUB_REPO: string = FORK_GITHUB_REPO;
export const DELIVERY_PLANNER_GITHUB_REPOSITORY: string = FORK_GITHUB_REPOSITORY;

export class DeliveryPlannerGithubSafetyError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'DeliveryPlannerGithubSafetyError';
	}
}

export function assertDeliveryPlannerGithubRepository(repository: string): void {
	if (repository !== DELIVERY_PLANNER_GITHUB_REPOSITORY) {
		throw new DeliveryPlannerGithubSafetyError(
			`Delivery Planner GitHub sync must target ${DELIVERY_PLANNER_GITHUB_REPOSITORY}`
		);
	}
}

export function assertDeliveryPlannerGithubReference(
	reference: WorkItemGithubReference | undefined
): void {
	if (!reference) {
		return;
	}

	assertDeliveryPlannerGithubRepository(reference.repository);
	if (
		reference.owner !== DELIVERY_PLANNER_GITHUB_OWNER ||
		reference.repo !== DELIVERY_PLANNER_GITHUB_REPO
	) {
		throw new DeliveryPlannerGithubSafetyError(
			`Delivery Planner GitHub references must use ${DELIVERY_PLANNER_GITHUB_REPOSITORY}`
		);
	}
}

export function makeDeliveryPlannerGithubReference(input: {
	issueNumber?: number;
	pullRequestNumber?: number;
	url?: string;
	branch?: string;
	commitSha?: string;
}): WorkItemGithubReference {
	return {
		owner: DELIVERY_PLANNER_GITHUB_OWNER,
		repo: DELIVERY_PLANNER_GITHUB_REPO,
		repository: DELIVERY_PLANNER_GITHUB_REPOSITORY,
		...input,
	};
}
