import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
	cleanupStaleTaskSyncState,
	completeTask,
	failTask,
	getNextTask,
	heartbeatTask,
	lockTask,
	readTaskSyncLocks,
	rebindTaskSyncState,
	releaseTask,
	updateTaskStatusFromExecutor,
	validateProjectMemoryExecutionStart,
	validateTaskSyncProjectMemory,
	type TaskBindingRecord,
	type TaskRuntimeRecord,
} from '../../../cli/services/task-sync';

function createRepoRoot(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-task-sync-'));
}

function writeTasks(repoRoot: string, tasks: unknown[]): void {
	const tasksDir = path.join(repoRoot, 'project_memory', 'tasks');
	fs.mkdirSync(tasksDir, { recursive: true });
	fs.writeFileSync(
		path.join(tasksDir, 'tasks.json'),
		JSON.stringify(
			{
				version: '2026-04-04',
				project_id: 'maestro',
				defaults: {
					repo_root: repoRoot,
					source_branch: 'main',
					execution_mode: 'shared-serialized',
					binding_preference: 'shared-branch-serialized',
				},
				tasks,
			},
			null,
			2
		)
	);
}

function writeSeedTasks(repoRoot: string): void {
	writeTasks(repoRoot, [
		{
			id: 'PM-01',
			title: 'First task',
			status: 'pending',
			depends_on: [],
			execution_mode: 'shared-serialized',
			worktree_binding_request: {
				policy_version: '2026-04-04',
				binding_preference: 'shared-branch-serialized',
				repo_root: repoRoot,
				source_branch: 'main',
				branch_slug: 'first-task',
				shared_checkout_allowed: true,
			},
		},
		{
			id: 'PM-02',
			title: 'Second task',
			status: 'pending',
			depends_on: ['PM-01'],
			execution_mode: 'shared-serialized',
			worktree_binding_request: {
				policy_version: '2026-04-04',
				binding_preference: 'shared-branch-serialized',
				repo_root: repoRoot,
				source_branch: 'main',
				branch_slug: 'second-task',
				shared_checkout_allowed: true,
			},
		},
	]);
}

function readJson<T>(repoRoot: string, relativePath: string): T {
	return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf-8')) as T;
}

function readTasks(repoRoot: string): Array<{ id: string; status: string }> {
	return readJson<{
		tasks: Array<{ id: string; status: string }>;
	}>(repoRoot, 'project_memory/tasks/tasks.json').tasks.map((task) => ({
		id: task.id,
		status: task.status,
	}));
}

function futureDate(minutesAhead = 60): Date {
	return new Date(Date.now() + minutesAhead * 60 * 1000);
}

function futureIso(minutesAhead = 60): string {
	return futureDate(minutesAhead).toISOString();
}

const cleanupRoots: string[] = [];

afterEach(() => {
	for (const root of cleanupRoots.splice(0)) {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

describe('task-sync service', () => {
	it('claims the next runnable task and writes binding/runtime/lock records', () => {
		const repoRoot = createRepoRoot();
		cleanupRoots.push(repoRoot);
		writeSeedTasks(repoRoot);

		const result = getNextTask({
			repoRoot,
			executorId: 'codex-main',
			now: new Date('2026-04-04T04:00:00.000Z'),
		});

		expect(result?.task.id).toBe('PM-01');
		expect(result?.binding.binding_mode).toBe('shared-branch-serialized');
		expect(readTasks(repoRoot)).toEqual([
			{ id: 'PM-01', status: 'in_progress' },
			{ id: 'PM-02', status: 'pending' },
		]);

		const binding = readJson<TaskBindingRecord>(repoRoot, 'project_memory/bindings/PM-01.json');
		expect(binding.worktree_path).toBe(repoRoot);

		const runtime = readJson<TaskRuntimeRecord>(repoRoot, 'project_memory/runtime/PM-01.json');
		expect(runtime.executor_state).toBe('running');

		const taskLock = readJson<{ owner: string }>(repoRoot, 'project_memory/locks/tasks/PM-01.json');
		expect(taskLock.owner).toBe('codex-main');
	});

	it('does not return dependent tasks until prerequisites complete', () => {
		const repoRoot = createRepoRoot();
		cleanupRoots.push(repoRoot);
		writeSeedTasks(repoRoot);

		const first = getNextTask({
			repoRoot,
			executorId: 'codex-main',
			now: new Date('2026-04-04T04:00:00.000Z'),
		});
		expect(first?.task.id).toBe('PM-01');

		const secondWhileBlocked = getNextTask({
			repoRoot,
			executorId: 'codex-main',
			now: new Date('2026-04-04T04:01:00.000Z'),
		});
		expect(secondWhileBlocked).toBeNull();

		completeTask(
			{
				repoRoot,
				executorId: 'codex-main',
				now: new Date('2026-04-04T04:02:00.000Z'),
			},
			'PM-01'
		);

		const second = getNextTask({
			repoRoot,
			executorId: 'codex-main',
			now: new Date('2026-04-04T04:03:00.000Z'),
		});
		expect(second?.task.id).toBe('PM-02');
	});

	it('clears finished binding metadata so shared checkout can be reused cleanly', () => {
		const repoRoot = createRepoRoot();
		cleanupRoots.push(repoRoot);
		writeSeedTasks(repoRoot);

		const first = getNextTask({
			repoRoot,
			executorId: 'codex-main',
			now: new Date('2026-04-04T04:00:00.000Z'),
		});
		expect(first?.task.id).toBe('PM-01');

		completeTask(
			{
				repoRoot,
				executorId: 'codex-main',
				now: new Date('2026-04-04T04:02:00.000Z'),
			},
			'PM-01'
		);

		expect(fs.existsSync(path.join(repoRoot, 'project_memory/bindings/PM-01.json'))).toBe(false);
		expect(fs.existsSync(path.join(repoRoot, 'project_memory/worktrees/shared-main.json'))).toBe(
			false
		);
		expect(validateTaskSyncProjectMemory(repoRoot).ok).toBe(true);

		const second = getNextTask({
			repoRoot,
			executorId: 'codex-main',
			now: new Date('2026-04-04T04:03:00.000Z'),
		});
		expect(second?.task.id).toBe('PM-02');
	});

	it('refreshes heartbeat and can release the task back to pending', () => {
		const repoRoot = createRepoRoot();
		cleanupRoots.push(repoRoot);
		writeSeedTasks(repoRoot);

		lockTask(
			{
				repoRoot,
				executorId: 'codex-main',
				now: new Date('2026-04-04T04:00:00.000Z'),
			},
			'PM-01'
		);

		const heartbeat = heartbeatTask(
			{
				repoRoot,
				executorId: 'codex-main',
				now: new Date('2026-04-04T04:05:00.000Z'),
			},
			'PM-01'
		);
		expect(heartbeat.runtime.last_heartbeat_at).toBe('2026-04-04T04:05:00.000Z');

		const released = releaseTask(
			{
				repoRoot,
				executorId: 'codex-main',
				now: new Date('2026-04-04T04:06:00.000Z'),
			},
			'PM-01'
		);
		expect(released.task.status).toBe('pending');
		expect(fs.existsSync(path.join(repoRoot, 'project_memory/locks/tasks/PM-01.json'))).toBe(false);
	});

	it('allows idempotent running updates after a task has already been claimed', () => {
		const repoRoot = createRepoRoot();
		cleanupRoots.push(repoRoot);
		writeSeedTasks(repoRoot);

		lockTask(
			{
				repoRoot,
				executorId: 'codex-main',
				now: new Date('2026-04-04T04:00:00.000Z'),
			},
			'PM-01'
		);

		const updated = updateTaskStatusFromExecutor(
			{
				repoRoot,
				executorId: 'codex-main',
				now: new Date('2026-04-04T04:05:00.000Z'),
			},
			'PM-01',
			'running',
			{
				agentType: 'codex',
			}
		);

		expect(updated.previousStatus).toBe('in_progress');
		expect(updated.newStatus).toBe('in_progress');

		const runtime = readJson<TaskRuntimeRecord>(repoRoot, 'project_memory/runtime/PM-01.json');
		expect(runtime.executor_state).toBe('running');
		expect(runtime.last_heartbeat_at).toBe('2026-04-04T04:05:00.000Z');
	});

	it('releases locks and clears binding metadata on executor-driven completion', () => {
		const repoRoot = createRepoRoot();
		cleanupRoots.push(repoRoot);
		writeSeedTasks(repoRoot);

		lockTask(
			{
				repoRoot,
				executorId: 'codex-main',
				now: new Date('2026-04-04T04:00:00.000Z'),
			},
			'PM-01'
		);

		const updated = updateTaskStatusFromExecutor(
			{
				repoRoot,
				executorId: 'codex-main',
				now: new Date('2026-04-04T04:05:00.000Z'),
			},
			'PM-01',
			'completed',
			{
				agentType: 'codex',
				resultSummary: 'done',
			}
		);

		expect(updated.newStatus).toBe('completed');
		expect(fs.existsSync(path.join(repoRoot, 'project_memory/locks/tasks/PM-01.json'))).toBe(false);
		expect(
			fs.existsSync(path.join(repoRoot, 'project_memory/locks/worktrees/shared-main.json'))
		).toBe(false);
		expect(fs.existsSync(path.join(repoRoot, 'project_memory/bindings/PM-01.json'))).toBe(false);
		expect(fs.existsSync(path.join(repoRoot, 'project_memory/worktrees/shared-main.json'))).toBe(
			false
		);
	});

	it('keeps shared checkout serialized even for the same executor', () => {
		const repoRoot = createRepoRoot();
		cleanupRoots.push(repoRoot);
		writeTasks(repoRoot, [
			{
				id: 'PM-01',
				title: 'First shared task',
				status: 'pending',
				depends_on: [],
				execution_mode: 'shared-serialized',
				worktree_binding_request: {
					policy_version: '2026-04-04',
					binding_preference: 'shared-branch-serialized',
					repo_root: repoRoot,
					source_branch: 'main',
					branch_slug: 'first-shared-task',
					shared_checkout_allowed: true,
				},
			},
			{
				id: 'PM-02',
				title: 'Second shared task',
				status: 'pending',
				depends_on: [],
				execution_mode: 'shared-serialized',
				worktree_binding_request: {
					policy_version: '2026-04-04',
					binding_preference: 'shared-branch-serialized',
					repo_root: repoRoot,
					source_branch: 'main',
					branch_slug: 'second-shared-task',
					shared_checkout_allowed: true,
				},
			},
		]);

		const first = getNextTask({
			repoRoot,
			executorId: 'codex-main',
			now: new Date('2026-04-04T04:00:00.000Z'),
		});
		expect(first?.task.id).toBe('PM-01');

		const second = getNextTask({
			repoRoot,
			executorId: 'codex-main',
			now: new Date('2026-04-04T04:01:00.000Z'),
		});
		expect(second).toBeNull();
		expect(readTasks(repoRoot)).toEqual([
			{ id: 'PM-01', status: 'in_progress' },
			{ id: 'PM-02', status: 'pending' },
		]);
	});

	it('can still claim an isolated task while shared checkout is occupied', () => {
		const repoRoot = createRepoRoot();
		cleanupRoots.push(repoRoot);
		writeTasks(repoRoot, [
			{
				id: 'PM-01',
				title: 'First shared task',
				status: 'pending',
				depends_on: [],
				execution_mode: 'shared-serialized',
				worktree_binding_request: {
					policy_version: '2026-04-04',
					binding_preference: 'shared-branch-serialized',
					repo_root: repoRoot,
					source_branch: 'main',
					branch_slug: 'first-shared-task',
					shared_checkout_allowed: true,
				},
			},
			{
				id: 'PM-02',
				title: 'Second shared task',
				status: 'pending',
				depends_on: [],
				execution_mode: 'shared-serialized',
				worktree_binding_request: {
					policy_version: '2026-04-04',
					binding_preference: 'shared-branch-serialized',
					repo_root: repoRoot,
					source_branch: 'main',
					branch_slug: 'second-shared-task',
					shared_checkout_allowed: true,
				},
			},
			{
				id: 'PM-03',
				title: 'Isolated task',
				status: 'pending',
				depends_on: [],
				execution_mode: 'isolated',
				worktree_binding_request: {
					policy_version: '2026-04-04',
					binding_preference: 'create-or-reuse-isolated',
					repo_root: repoRoot,
					source_branch: 'main',
					branch_slug: 'isolated-task',
					shared_checkout_allowed: false,
				},
			},
		]);

		const shared = getNextTask({
			repoRoot,
			executorId: 'codex-main',
			now: new Date('2026-04-04T04:00:00.000Z'),
		});
		expect(shared?.task.id).toBe('PM-01');

		const isolated = getNextTask({
			repoRoot,
			executorId: 'codex-main',
			now: new Date('2026-04-04T04:01:00.000Z'),
		});
		expect(isolated?.task.id).toBe('PM-03');
		expect(isolated?.binding.binding_mode).toBe('isolated-worktree');
		expect(isolated?.binding.worktree_path).toContain('.worktrees');
	});

	it('marks a failed task and releases lock files', () => {
		const repoRoot = createRepoRoot();
		cleanupRoots.push(repoRoot);
		writeSeedTasks(repoRoot);

		lockTask(
			{
				repoRoot,
				executorId: 'codex-main',
				now: new Date('2026-04-04T04:00:00.000Z'),
			},
			'PM-01'
		);

		const failed = failTask(
			{
				repoRoot,
				executorId: 'codex-main',
				now: new Date('2026-04-04T04:04:00.000Z'),
			},
			'PM-01'
		);

		expect(failed.task.status).toBe('failed');
		expect(failed.runtime.executor_state).toBe('failed');
		expect(fs.existsSync(path.join(repoRoot, 'project_memory/locks/tasks/PM-01.json'))).toBe(false);
		expect(
			fs.existsSync(path.join(repoRoot, 'project_memory/locks/worktrees/shared-main.json'))
		).toBe(false);
	});

	it('reports current task and worktree locks', () => {
		const repoRoot = createRepoRoot();
		cleanupRoots.push(repoRoot);
		writeSeedTasks(repoRoot);
		const claimedAt = futureDate();

		lockTask(
			{
				repoRoot,
				executorId: 'codex-main',
				now: claimedAt,
			},
			'PM-01'
		);

		const locks = readTaskSyncLocks(repoRoot);
		expect(locks.taskLocks).toHaveLength(1);
		expect(locks.taskLocks[0]).toMatchObject({
			taskId: 'PM-01',
			lock: {
				owner: 'codex-main',
			},
			isExpired: false,
		});
		expect(locks.worktreeLocks).toHaveLength(1);
		expect(locks.worktreeLocks[0]).toMatchObject({
			worktreeId: 'shared-main',
			isExpired: false,
		});
	});

	it('validates project memory state and reports orphaned records', () => {
		const repoRoot = createRepoRoot();
		cleanupRoots.push(repoRoot);
		writeSeedTasks(repoRoot);
		const claimedAt = futureDate();

		lockTask(
			{
				repoRoot,
				executorId: 'codex-main',
				now: claimedAt,
			},
			'PM-01'
		);

		let report = validateTaskSyncProjectMemory(repoRoot);
		expect(report.ok).toBe(true);
		expect(report.taskCount).toBe(2);
		expect(report.bindingCount).toBe(1);
		expect(report.runtimeCount).toBe(1);
		expect(report.taskLockCount).toBe(1);
		expect(report.worktreeLockCount).toBe(1);
		expect(report.expiredTaskLockCount).toBe(0);
		expect(report.expiredWorktreeLockCount).toBe(0);

		fs.writeFileSync(
			path.join(repoRoot, 'project_memory/locks/tasks/ORPHAN.json'),
			JSON.stringify(
				{
					owner: 'codex-main',
					acquired_at: futureIso(61),
					expires_at: futureIso(76),
				},
				null,
				2
			)
		);

		report = validateTaskSyncProjectMemory(repoRoot);
		expect(report.ok).toBe(false);
		expect(report.issues).toContain('task lock without task: ORPHAN');
	});

	it('reports expired locks and owner mismatches for running runtime records', () => {
		const repoRoot = createRepoRoot();
		cleanupRoots.push(repoRoot);
		writeSeedTasks(repoRoot);

		lockTask(
			{
				repoRoot,
				executorId: 'codex-main',
				now: new Date('2026-04-04T04:00:00.000Z'),
			},
			'PM-01'
		);

		fs.writeFileSync(
			path.join(repoRoot, 'project_memory/locks/tasks/PM-01.json'),
			JSON.stringify(
				{
					owner: 'other-executor',
					acquired_at: '2020-04-04T04:00:00.000Z',
					expires_at: '2020-04-04T04:00:01.000Z',
				},
				null,
				2
			)
		);
		fs.writeFileSync(
			path.join(repoRoot, 'project_memory/locks/worktrees/shared-main.json'),
			JSON.stringify(
				{
					owner: 'other-executor',
					acquired_at: '2020-04-04T04:00:00.000Z',
					expires_at: '2020-04-04T04:00:01.000Z',
				},
				null,
				2
			)
		);

		const locks = readTaskSyncLocks(repoRoot);
		expect(locks.taskLocks[0]?.isExpired).toBe(true);
		expect(locks.worktreeLocks[0]?.isExpired).toBe(true);

		const report = validateTaskSyncProjectMemory(repoRoot);
		expect(report.ok).toBe(false);
		expect(report.expiredTaskLockCount).toBe(1);
		expect(report.expiredWorktreeLockCount).toBe(1);
		expect(report.issues).toContain('expired task lock: PM-01');
		expect(report.issues).toContain('expired worktree lock: shared-main');
		expect(report.issues).toContain('runtime/task lock owner mismatch: PM-01');
		expect(report.issues).toContain('runtime/worktree lock owner mismatch: PM-01');
	});

	it('cleans expired locks and marks runtime, task, and worktree as stale', () => {
		const repoRoot = createRepoRoot();
		cleanupRoots.push(repoRoot);
		writeSeedTasks(repoRoot);

		lockTask(
			{
				repoRoot,
				executorId: 'codex-main',
				now: new Date('2026-04-04T04:00:00.000Z'),
			},
			'PM-01'
		);

		fs.writeFileSync(
			path.join(repoRoot, 'project_memory/locks/tasks/PM-01.json'),
			JSON.stringify(
				{
					owner: 'codex-main',
					acquired_at: '2020-04-04T04:00:00.000Z',
					expires_at: '2020-04-04T04:00:01.000Z',
				},
				null,
				2
			)
		);
		fs.writeFileSync(
			path.join(repoRoot, 'project_memory/locks/worktrees/shared-main.json'),
			JSON.stringify(
				{
					owner: 'codex-main',
					acquired_at: '2020-04-04T04:00:00.000Z',
					expires_at: '2020-04-04T04:00:01.000Z',
				},
				null,
				2
			)
		);

		const report = cleanupStaleTaskSyncState(repoRoot, new Date('2026-04-05T00:00:00.000Z'));
		expect(report).toMatchObject({
			ok: true,
			projectId: 'maestro',
			cleanedTaskLocks: ['PM-01'],
			cleanedWorktreeLocks: ['shared-main'],
			staleTasks: ['PM-01'],
			staleRuntimes: ['PM-01'],
			staleWorktrees: ['shared-main'],
		});
		expect(fs.existsSync(path.join(repoRoot, 'project_memory/locks/tasks/PM-01.json'))).toBe(false);
		expect(
			fs.existsSync(path.join(repoRoot, 'project_memory/locks/worktrees/shared-main.json'))
		).toBe(false);
		expect(readTasks(repoRoot)).toEqual([
			{ id: 'PM-01', status: 'blocked' },
			{ id: 'PM-02', status: 'pending' },
		]);

		const runtime = readJson<TaskRuntimeRecord>(repoRoot, 'project_memory/runtime/PM-01.json');
		expect(runtime.executor_state).toBe('stale');

		const worktree = readJson<{ status: string }>(
			repoRoot,
			'project_memory/worktrees/shared-main.json'
		);
		expect(worktree.status).toBe('stale');
	});

	it('rebinds a stale task by clearing stale records and returning it to pending', () => {
		const repoRoot = createRepoRoot();
		cleanupRoots.push(repoRoot);
		writeSeedTasks(repoRoot);

		lockTask(
			{
				repoRoot,
				executorId: 'codex-main',
				now: new Date('2026-04-04T04:00:00.000Z'),
			},
			'PM-01'
		);

		fs.writeFileSync(
			path.join(repoRoot, 'project_memory/locks/tasks/PM-01.json'),
			JSON.stringify(
				{
					owner: 'codex-main',
					acquired_at: '2020-04-04T04:00:00.000Z',
					expires_at: '2020-04-04T04:00:01.000Z',
				},
				null,
				2
			)
		);
		fs.writeFileSync(
			path.join(repoRoot, 'project_memory/locks/worktrees/shared-main.json'),
			JSON.stringify(
				{
					owner: 'codex-main',
					acquired_at: '2020-04-04T04:00:00.000Z',
					expires_at: '2020-04-04T04:00:01.000Z',
				},
				null,
				2
			)
		);

		cleanupStaleTaskSyncState(repoRoot, new Date('2026-04-05T00:00:00.000Z'));

		const report = rebindTaskSyncState(repoRoot, 'PM-01', new Date('2026-04-05T00:10:00.000Z'));
		expect(report).toMatchObject({
			ok: true,
			projectId: 'maestro',
			taskId: 'PM-01',
			taskStatus: 'pending',
			clearedBinding: true,
			clearedRuntime: true,
			clearedTaskLock: false,
			clearedWorktreeLock: false,
			clearedWorktreeRecord: true,
		});
		expect(fs.existsSync(path.join(repoRoot, 'project_memory/bindings/PM-01.json'))).toBe(false);
		expect(fs.existsSync(path.join(repoRoot, 'project_memory/runtime/PM-01.json'))).toBe(false);
		expect(fs.existsSync(path.join(repoRoot, 'project_memory/worktrees/shared-main.json'))).toBe(
			false
		);
		expect(readTasks(repoRoot)).toEqual([
			{ id: 'PM-01', status: 'pending' },
			{ id: 'PM-02', status: 'pending' },
		]);

		const next = getNextTask({
			repoRoot,
			executorId: 'codex-main',
			now: new Date('2026-04-05T00:11:00.000Z'),
		});
		expect(next?.task.id).toBe('PM-01');
	});

	it('refuses to rebind a task with a live lock', () => {
		const repoRoot = createRepoRoot();
		cleanupRoots.push(repoRoot);
		writeSeedTasks(repoRoot);

		lockTask(
			{
				repoRoot,
				executorId: 'codex-main',
				now: new Date('2026-04-04T04:00:00.000Z'),
			},
			'PM-01'
		);

		expect(() =>
			rebindTaskSyncState(repoRoot, 'PM-01', new Date('2026-04-04T04:01:00.000Z'))
		).toThrow('Task still has a live lock: PM-01');
	});

	it('validates execution start for a claimed shared task', () => {
		const repoRoot = createRepoRoot();
		cleanupRoots.push(repoRoot);
		writeSeedTasks(repoRoot);
		const claimedAt = futureDate();

		lockTask(
			{
				repoRoot,
				executorId: 'codex-main',
				now: claimedAt,
			},
			'PM-01'
		);

		const result = validateProjectMemoryExecutionStart({
			repoRoot,
			taskId: 'PM-01',
			executorId: 'codex-main',
			currentBranch: 'main',
		});

		expect(result).toMatchObject({
			ok: true,
			skipped: false,
			taskId: 'PM-01',
			executorId: 'codex-main',
			expectedBranch: 'main',
			currentBranch: 'main',
		});
	});

	it('blocks execution start when task lock owner does not match executor', () => {
		const repoRoot = createRepoRoot();
		cleanupRoots.push(repoRoot);
		writeSeedTasks(repoRoot);
		const claimedAt = futureDate();

		lockTask(
			{
				repoRoot,
				executorId: 'codex-main',
				now: claimedAt,
			},
			'PM-01'
		);

		const result = validateProjectMemoryExecutionStart({
			repoRoot,
			taskId: 'PM-01',
			executorId: 'other-executor',
			currentBranch: 'main',
		});

		expect(result.ok).toBe(false);
		expect(result.reason).toContain('Task lock owner mismatch');
	});

	it('blocks execution start when current branch does not match binding branch', () => {
		const repoRoot = createRepoRoot();
		cleanupRoots.push(repoRoot);
		writeSeedTasks(repoRoot);
		const claimedAt = futureDate();

		lockTask(
			{
				repoRoot,
				executorId: 'codex-main',
				now: claimedAt,
			},
			'PM-01'
		);

		const result = validateProjectMemoryExecutionStart({
			repoRoot,
			taskId: 'PM-01',
			executorId: 'codex-main',
			currentBranch: 'feature/mismatch',
		});

		expect(result.ok).toBe(false);
		expect(result.reason).toContain('Branch mismatch');
		expect(result.expectedBranch).toBe('main');
	});
});
