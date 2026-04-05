import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockInvoke = vi.fn();

vi.mock('electron', () => ({
	ipcRenderer: {
		invoke: (...args: unknown[]) => mockInvoke(...args),
	},
}));

import { createProjectMemoryApi } from '../../../main/preload/projectMemory';

describe('Project Memory Preload API', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('invokes getSnapshot', async () => {
		const api = createProjectMemoryApi();
		mockInvoke.mockResolvedValue({ success: true, snapshot: { taskCount: 1 } });

		const result = await api.getSnapshot('/repo');

		expect(mockInvoke).toHaveBeenCalledWith('projectMemory:getSnapshot', '/repo');
		expect(result).toEqual({ success: true, snapshot: { taskCount: 1 } });
	});

	it('invokes getTaskDetail', async () => {
		const api = createProjectMemoryApi();
		mockInvoke.mockResolvedValue({ success: true, detail: { task: { id: 'PM-01' } } });

		const result = await api.getTaskDetail('/repo', 'PM-01');

		expect(mockInvoke).toHaveBeenCalledWith('projectMemory:getTaskDetail', '/repo', 'PM-01');
		expect(result).toEqual({ success: true, detail: { task: { id: 'PM-01' } } });
	});

	it('invokes validateState', async () => {
		const api = createProjectMemoryApi();
		mockInvoke.mockResolvedValue({ success: true, report: { ok: true, issues: [] } });

		const result = await api.validateState('/repo');

		expect(mockInvoke).toHaveBeenCalledWith('projectMemory:validateState', '/repo');
		expect(result).toEqual({ success: true, report: { ok: true, issues: [] } });
	});

	it('invokes validateExecutionStart', async () => {
		const api = createProjectMemoryApi();
		mockInvoke.mockResolvedValue({ success: true, validation: { ok: true } });

		const result = await api.validateExecutionStart('/repo', 'PM-01', 'codex-main', 'main');

		expect(mockInvoke).toHaveBeenCalledWith(
			'projectMemory:validateExecutionStart',
			'/repo',
			'PM-01',
			'codex-main',
			'main'
		);
		expect(result).toEqual({ success: true, validation: { ok: true } });
	});

	it('preserves partial-success emission metadata', async () => {
		const api = createProjectMemoryApi();
		mockInvoke.mockResolvedValue({
			success: true,
			emittedTaskIds: ['task-01'],
			tasksFilePath: '/repo/project_memory/tasks/tasks.json',
			partialSuccess: true,
			skippedTaskIds: ['task-02'],
			invalidTaskIds: ['task-03'],
			validationErrors: [
				{
					taskId: 'task-03',
					category: 'validation-failed',
					message: 'task-03 failed validation',
				},
			],
			diagnostics: {
				taskCount: 1,
				repoRoot: '/repo',
				sourceBranch: 'main',
				bindingPreference: 'shared-branch-serialized',
			},
		});

		const result = await api.emitWizardTasks({ name: 'Test Playbook' } as any, {
			dryRun: true,
		});

		expect(mockInvoke).toHaveBeenCalledWith(
			'wizard:emitTasks',
			{ name: 'Test Playbook' },
			{ dryRun: true }
		);
		expect(result).toMatchObject({
			success: true,
			partialSuccess: true,
			skippedTaskIds: ['task-02'],
			invalidTaskIds: ['task-03'],
		});
	});
});
