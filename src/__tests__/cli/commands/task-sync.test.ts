import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../cli/services/task-sync', () => ({
	cleanupStaleTaskSyncState: vi.fn(),
	getNextTask: vi.fn(),
	lockTask: vi.fn(),
	heartbeatTask: vi.fn(),
	completeTask: vi.fn(),
	failTask: vi.fn(),
	releaseTask: vi.fn(),
	readTaskSyncLocks: vi.fn(),
	validateTaskSyncProjectMemory: vi.fn(),
	readProjectMemorySnapshot: vi.fn(),
	readProjectMemoryTaskDetail: vi.fn(),
	rebindTaskSyncState: vi.fn(),
}));

import {
	snapshotTaskCommand,
	showTaskCommand,
	locksTaskCommand,
	validateTaskCommand,
	cleanupStaleTaskCommand,
	rebindTaskCommand,
} from '../../../cli/commands/task-sync';
import {
	cleanupStaleTaskSyncState,
	readProjectMemorySnapshot,
	readProjectMemoryTaskDetail,
	readTaskSyncLocks,
	rebindTaskSyncState,
	validateTaskSyncProjectMemory,
} from '../../../cli/services/task-sync';

describe('task-sync command helpers', () => {
	let consoleLogSpy: ReturnType<typeof vi.spyOn>;
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
	let processExitSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.clearAllMocks();
		consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
	});

	it('prints project_memory snapshot output', () => {
		vi.mocked(readProjectMemorySnapshot).mockReturnValue({
			projectId: 'maestro',
			version: '2026-04-04',
			taskCount: 2,
			tasks: [],
			generatedAt: '2026-04-04T00:00:00.000Z',
		});

		snapshotTaskCommand({ repoRoot: '/repo', executor: 'codex-main' });

		expect(readProjectMemorySnapshot).toHaveBeenCalledWith('/repo');
		expect(JSON.parse(consoleLogSpy.mock.calls[0][0])).toMatchObject({
			projectId: 'maestro',
			taskCount: 2,
		});
	});

	it('prints project_memory task detail output', () => {
		vi.mocked(readProjectMemoryTaskDetail).mockReturnValue({
			task: { id: 'PM-01', status: 'in_progress' },
			binding: { worktree_id: 'shared-main' },
			runtime: { executor_state: 'running' },
			taskLock: null,
			worktreeLock: null,
			worktree: null,
		});

		showTaskCommand('PM-01', { repoRoot: '/repo', executor: 'codex-main' });

		expect(readProjectMemoryTaskDetail).toHaveBeenCalledWith('/repo', 'PM-01');
		expect(JSON.parse(consoleLogSpy.mock.calls[0][0])).toMatchObject({
			task: { id: 'PM-01', status: 'in_progress' },
		});
	});

	it('prints task-sync lock snapshot output', () => {
		vi.mocked(readTaskSyncLocks).mockReturnValue({
			taskLocks: [
				{ taskId: 'PM-01', lock: { owner: 'codex-main', acquired_at: 'a', expires_at: 'b' } },
			],
			worktreeLocks: [],
		});

		locksTaskCommand({ repoRoot: '/repo' });

		expect(readTaskSyncLocks).toHaveBeenCalledWith('/repo');
		expect(JSON.parse(consoleLogSpy.mock.calls[0][0])).toMatchObject({
			taskLocks: [{ taskId: 'PM-01' }],
		});
	});

	it('prints validation report output', () => {
		vi.mocked(validateTaskSyncProjectMemory).mockReturnValue({
			ok: true,
			projectId: 'maestro',
			taskCount: 2,
			bindingCount: 1,
			runtimeCount: 1,
			taskLockCount: 1,
			worktreeLockCount: 1,
			issues: [],
		});

		validateTaskCommand({ repoRoot: '/repo' });

		expect(validateTaskSyncProjectMemory).toHaveBeenCalledWith('/repo');
		expect(JSON.parse(consoleLogSpy.mock.calls[0][0])).toMatchObject({
			ok: true,
			projectId: 'maestro',
		});
	});

	it('prints stale cleanup report output', () => {
		vi.mocked(cleanupStaleTaskSyncState).mockReturnValue({
			ok: true,
			projectId: 'maestro',
			cleanedTaskLocks: ['PM-01'],
			cleanedWorktreeLocks: ['shared-main'],
			staleTasks: ['PM-01'],
			staleRuntimes: ['PM-01'],
			staleWorktrees: ['shared-main'],
		});

		cleanupStaleTaskCommand({ repoRoot: '/repo' });

		expect(cleanupStaleTaskSyncState).toHaveBeenCalledWith('/repo');
		expect(JSON.parse(consoleLogSpy.mock.calls[0][0])).toMatchObject({
			ok: true,
			cleanedTaskLocks: ['PM-01'],
		});
	});

	it('prints rebind report output', () => {
		vi.mocked(rebindTaskSyncState).mockReturnValue({
			ok: true,
			projectId: 'maestro',
			taskId: 'PM-01',
			taskStatus: 'pending',
			clearedBinding: true,
			clearedRuntime: true,
			clearedTaskLock: true,
			clearedWorktreeLock: true,
			clearedWorktreeRecord: true,
		});

		rebindTaskCommand('PM-01', { repoRoot: '/repo' });

		expect(rebindTaskSyncState).toHaveBeenCalledWith('/repo', 'PM-01');
		expect(JSON.parse(consoleLogSpy.mock.calls[0][0])).toMatchObject({
			ok: true,
			taskId: 'PM-01',
			taskStatus: 'pending',
		});
	});

	it('fails closed on service error', () => {
		vi.mocked(readProjectMemorySnapshot).mockImplementation(() => {
			throw new Error('boom');
		});

		snapshotTaskCommand({ repoRoot: '/repo' });

		expect(consoleErrorSpy).toHaveBeenCalledWith(JSON.stringify({ error: 'boom' }, null, 2));
		expect(processExitSpy).toHaveBeenCalledWith(1);
	});
});
