import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcMain } from 'electron';
import { registerProjectMemoryHandlers } from '../../../../main/ipc/handlers/projectMemory';
import { emitWizardTasks } from '../../../../main/wizard-task-emitter';

const handlers = new Map<string, Function>();
const mockStatSync = vi.fn();
const mockExistsSync = vi.fn();
const mockMkdirSync = vi.fn();
const mockAccessSync = vi.fn();

vi.mock('electron', () => ({
	ipcMain: {
		handle: vi.fn((channel: string, handler: Function) => {
			handlers.set(channel, handler);
		}),
	},
}));

vi.mock('fs', () => ({
	statSync: (...args: unknown[]) => mockStatSync(...args),
	existsSync: (...args: unknown[]) => mockExistsSync(...args),
	mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
	accessSync: (...args: unknown[]) => mockAccessSync(...args),
	constants: {
		W_OK: 2,
	},
}));

vi.mock('../../../../main/utils/logger', () => ({
	logger: {
		info: vi.fn(),
		error: vi.fn(),
	},
}));

vi.mock('../../../../cli/services/task-sync', () => ({
	getNextTask: vi.fn(() => null),
	readProjectMemorySnapshot: vi.fn(() => null),
	readProjectMemoryTaskDetail: vi.fn(() => null),
	validateTaskSyncProjectMemory: vi.fn(() => ({ ok: true, issues: [] })),
	validateProjectMemoryExecutionStart: vi.fn(() => ({ ok: true })),
}));

vi.mock('../../../../main/wizard-task-emitter', () => ({
	emitWizardTasks: vi.fn(),
}));

describe('projectMemory IPC handlers', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		handlers.clear();
		mockStatSync.mockReturnValue({ isDirectory: () => true });
		mockExistsSync.mockReturnValue(true);
		registerProjectMemoryHandlers();
	});

	it('keeps dry-run emission side-effect free', async () => {
		vi.mocked(emitWizardTasks).mockReturnValue({
			success: true,
			emittedTaskIds: ['task-01'],
			tasksFilePath: '/repo/project_memory/tasks/tasks.json',
			diagnostics: {
				taskCount: 1,
				repoRoot: '/repo',
				sourceBranch: 'main',
				bindingPreference: 'shared-branch-serialized',
			},
		});

		const handler = handlers.get('wizard:emitTasks');
		const playbook = {
			name: 'Test Playbook',
			projectMemoryBindingIntent: {
				repoRoot: '/repo',
			},
			taskGraph: { nodes: [{ id: 'task-01' }] },
		} as any;

		const result = await handler?.({} as any, playbook, { dryRun: true });

		expect(mockStatSync).toHaveBeenCalledWith('/repo');
		expect(mockExistsSync).not.toHaveBeenCalled();
		expect(mockMkdirSync).not.toHaveBeenCalled();
		expect(mockAccessSync).not.toHaveBeenCalled();
		expect(result).toMatchObject({
			success: true,
			emittedTaskIds: ['task-01'],
		});
	});

	it('returns partial-success metadata from the emitter', async () => {
		vi.mocked(emitWizardTasks).mockReturnValue({
			success: true,
			partialSuccess: true,
			emittedTaskIds: ['task-01'],
			skippedTaskIds: ['task-02'],
			invalidTaskIds: ['task-03'],
			validationErrors: [
				{
					taskId: 'task-03',
					category: 'validation-failed',
					message: 'task-03 failed validation',
				},
			],
			tasksFilePath: '/repo/project_memory/tasks/tasks.json',
			diagnostics: {
				taskCount: 1,
				repoRoot: '/repo',
				sourceBranch: 'main',
				bindingPreference: 'shared-branch-serialized',
			},
		});

		const handler = handlers.get('wizard:emitTasks');
		const playbook = {
			name: 'Test Playbook',
			projectMemoryBindingIntent: {
				repoRoot: '/repo',
			},
			taskGraph: { nodes: [{ id: 'task-01' }] },
		} as any;

		const result = await handler?.({} as any, playbook, { force: false });

		expect(result).toMatchObject({
			success: true,
			partialSuccess: true,
			emittedTaskIds: ['task-01'],
			skippedTaskIds: ['task-02'],
			invalidTaskIds: ['task-03'],
		});
	});

	it('can claim the next execution context for codex', async () => {
		const { getNextTask } = await import('../../../../cli/services/task-sync');
		vi.mocked(getNextTask).mockReturnValue({
			task: { id: 'PM-01' },
		} as any);

		const handler = handlers.get('projectMemory:claimNextExecution');
		const result = await handler?.({} as any, '/repo', 'codex-main');

		expect(getNextTask).toHaveBeenCalledWith({
			repoRoot: '/repo',
			executorId: 'codex-main',
		});
		expect(result).toMatchObject({
			success: true,
			execution: {
				repoRoot: '/repo',
				taskId: 'PM-01',
				executorId: 'codex-main',
			},
		});
	});
});
