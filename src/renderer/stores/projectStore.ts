/**
 * projectStore - Zustand store for project (repo) state management
 *
 * Projects are the top-level organizational unit. Each project maps to a
 * git repository. Sessions belong to a project via session.projectId.
 */

import { create } from 'zustand';
import type { Project } from '../../shared/types';

// ============================================================================
// Store Types
// ============================================================================

export interface ProjectStoreState {
	projects: Project[];
	activeProjectId: string;
}

export interface ProjectStoreActions {
	setProjects: (projects: Project[] | ((prev: Project[]) => Project[])) => void;
	addProject: (project: Project) => void;
	removeProject: (projectId: string) => void;
	updateProject: (projectId: string, updates: Partial<Project>) => void;
	setActiveProjectId: (projectId: string) => void;
}

export type ProjectStore = ProjectStoreState & ProjectStoreActions;

// ============================================================================
// Helpers
// ============================================================================

function resolve<T>(valOrFn: T | ((prev: T) => T), prev: T): T {
	return typeof valOrFn === 'function' ? (valOrFn as (prev: T) => T)(prev) : valOrFn;
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useProjectStore = create<ProjectStore>()((set) => ({
	projects: [],
	activeProjectId: '',

	setProjects: (v) =>
		set((s) => {
			const newProjects = resolve(v, s.projects);
			if (newProjects === s.projects) return s;
			return { projects: newProjects };
		}),

	addProject: (project) => set((s) => ({ projects: [...s.projects, project] })),

	removeProject: (projectId) =>
		set((s) => {
			const filtered = s.projects.filter((p) => p.id !== projectId);
			if (filtered.length === s.projects.length) return s;
			return { projects: filtered };
		}),

	updateProject: (projectId, updates) =>
		set((s) => {
			let found = false;
			const newProjects = s.projects.map((p) => {
				if (p.id === projectId) {
					found = true;
					return { ...p, ...updates };
				}
				return p;
			});
			if (!found) return s;
			return { projects: newProjects };
		}),

	setActiveProjectId: (projectId) => set({ activeProjectId: projectId }),
}));

// ============================================================================
// Selectors
// ============================================================================

export const selectActiveProject = (state: ProjectStore): Project | undefined =>
	state.projects.find((p) => p.id === state.activeProjectId) || state.projects[0];

export const selectAllProjects = (state: ProjectStore): Project[] => state.projects;

export const selectProjectById =
	(id: string) =>
	(state: ProjectStore): Project | undefined =>
		state.projects.find((p) => p.id === id);

// ============================================================================
// Non-React Access
// ============================================================================

export function getProjectState() {
	return useProjectStore.getState();
}

export function getProjectActions() {
	const state = useProjectStore.getState();
	return {
		setProjects: state.setProjects,
		addProject: state.addProject,
		removeProject: state.removeProject,
		updateProject: state.updateProject,
		setActiveProjectId: state.setActiveProjectId,
	};
}
