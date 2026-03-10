import { describe, it, expect, beforeEach } from 'vitest';
import {
	useProjectStore,
	selectActiveProject,
	selectAllProjects,
	getProjectState,
	getProjectActions,
} from '../../../renderer/stores/projectStore';

function createMockProject(overrides: Partial<any> = {}) {
	return {
		id: overrides.id ?? `project-${Math.random().toString(36).slice(2, 8)}`,
		name: overrides.name ?? 'Test Project',
		repoPath: overrides.repoPath ?? '/test/repo',
		createdAt: overrides.createdAt ?? Date.now(),
		...overrides,
	};
}

describe('projectStore', () => {
	beforeEach(() => {
		useProjectStore.setState({
			projects: [],
			activeProjectId: '',
		});
	});

	describe('CRUD operations', () => {
		it('should add a project', () => {
			const project = createMockProject({ id: 'p1', name: 'Maestro' });
			useProjectStore.getState().addProject(project);
			expect(useProjectStore.getState().projects).toHaveLength(1);
			expect(useProjectStore.getState().projects[0].name).toBe('Maestro');
		});

		it('should remove a project by ID', () => {
			const p1 = createMockProject({ id: 'p1' });
			const p2 = createMockProject({ id: 'p2' });
			useProjectStore.setState({ projects: [p1, p2] });
			useProjectStore.getState().removeProject('p1');
			expect(useProjectStore.getState().projects).toHaveLength(1);
			expect(useProjectStore.getState().projects[0].id).toBe('p2');
		});

		it('should not mutate state when removing non-existent project', () => {
			const p1 = createMockProject({ id: 'p1' });
			useProjectStore.setState({ projects: [p1] });
			const before = useProjectStore.getState().projects;
			useProjectStore.getState().removeProject('nonexistent');
			expect(useProjectStore.getState().projects).toBe(before);
		});

		it('should update a project', () => {
			const p1 = createMockProject({ id: 'p1', name: 'Old' });
			useProjectStore.setState({ projects: [p1] });
			useProjectStore.getState().updateProject('p1', { name: 'New' });
			expect(useProjectStore.getState().projects[0].name).toBe('New');
		});

		it('should set all projects', () => {
			const projects = [createMockProject({ id: 'p1' }), createMockProject({ id: 'p2' })];
			useProjectStore.getState().setProjects(projects);
			expect(useProjectStore.getState().projects).toHaveLength(2);
		});

		it('should support functional updater for setProjects', () => {
			const p1 = createMockProject({ id: 'p1' });
			useProjectStore.setState({ projects: [p1] });
			useProjectStore.getState().setProjects((prev) => [...prev, createMockProject({ id: 'p2' })]);
			expect(useProjectStore.getState().projects).toHaveLength(2);
		});
	});

	describe('active project', () => {
		it('should set active project ID', () => {
			useProjectStore.getState().setActiveProjectId('p1');
			expect(useProjectStore.getState().activeProjectId).toBe('p1');
		});
	});

	describe('selectors', () => {
		it('selectActiveProject returns active project', () => {
			const p1 = createMockProject({ id: 'p1' });
			const p2 = createMockProject({ id: 'p2' });
			useProjectStore.setState({ projects: [p1, p2], activeProjectId: 'p2' });
			const result = selectActiveProject(useProjectStore.getState());
			expect(result?.id).toBe('p2');
		});

		it('selectActiveProject falls back to first project', () => {
			const p1 = createMockProject({ id: 'p1' });
			useProjectStore.setState({ projects: [p1], activeProjectId: 'nonexistent' });
			const result = selectActiveProject(useProjectStore.getState());
			expect(result?.id).toBe('p1');
		});

		it('selectActiveProject returns undefined when empty', () => {
			const result = selectActiveProject(useProjectStore.getState());
			expect(result).toBeUndefined();
		});

		it('selectAllProjects returns all projects', () => {
			const projects = [createMockProject({ id: 'p1' }), createMockProject({ id: 'p2' })];
			useProjectStore.setState({ projects });
			expect(selectAllProjects(useProjectStore.getState())).toHaveLength(2);
		});
	});

	describe('non-React access', () => {
		it('getProjectState returns current state', () => {
			const p1 = createMockProject({ id: 'p1' });
			useProjectStore.setState({ projects: [p1], activeProjectId: 'p1' });
			const state = getProjectState();
			expect(state.projects).toHaveLength(1);
			expect(state.activeProjectId).toBe('p1');
		});

		it('getProjectActions returns stable action references', () => {
			const actions = getProjectActions();
			expect(typeof actions.addProject).toBe('function');
			expect(typeof actions.removeProject).toBe('function');
			expect(typeof actions.setActiveProjectId).toBe('function');
		});
	});
});
