import type { SettingsStoreInterface } from '../stores/types';
import type { GithubProjectReference } from './github-project-coordinator';

export interface ProjectGithubMapEntry {
	owner: string;
	repo: string;
	projectNumber: number;
	projectId?: string;
	projectTitle?: string;
	discoveredAt?: string;
}

export function getProjectGithubMapping(
	settingsStore: SettingsStoreInterface,
	projectPath: string | undefined
): ProjectGithubMapEntry | undefined {
	if (!projectPath) return undefined;
	const map = settingsStore.get<Record<string, ProjectGithubMapEntry>>('projectGithubMap', {});
	const mapping = map[projectPath];
	if (!mapping?.owner || !mapping.projectNumber) return undefined;
	return mapping;
}

export function getProjectReferenceForPath(
	settingsStore: SettingsStoreInterface,
	projectPath: string | undefined
): GithubProjectReference | undefined {
	const mapping = getProjectGithubMapping(settingsStore, projectPath);
	if (!mapping || !projectPath) return undefined;
	return {
		projectOwner: mapping.owner,
		projectNumber: mapping.projectNumber,
		projectPath,
	};
}

export function getProjectRepoSlug(
	settingsStore: SettingsStoreInterface,
	projectPath: string | undefined
): string | undefined {
	const mapping = getProjectGithubMapping(settingsStore, projectPath);
	if (!mapping?.repo) return undefined;
	return `${mapping.owner}/${mapping.repo}`;
}
