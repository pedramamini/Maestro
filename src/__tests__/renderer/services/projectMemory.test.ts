import { beforeEach, describe, expect, it, vi } from 'vitest';
import { projectMemoryService } from '../../../renderer/services/projectMemory';

describe('projectMemoryService', () => {
	beforeEach(() => {
		vi.stubGlobal('window', {
			maestro: {
				projectMemory: {
					getSnapshot: vi.fn(),
					getTaskDetail: vi.fn(),
					validateState: vi.fn(),
					validateExecutionStart: vi.fn(),
					claimNextExecution: vi.fn(),
				},
			},
		});
	});

	it('returns snapshot on success', async () => {
		const getSnapshot = vi.fn().mockResolvedValue({
			success: true,
			snapshot: {
				projectId: 'maestro',
				version: '2026-04-04',
				taskCount: 1,
				tasks: [],
				generatedAt: 'now',
			},
		});
		(window as any).maestro.projectMemory.getSnapshot = getSnapshot;

		const result = await projectMemoryService.getSnapshot('/repo');

		expect(getSnapshot).toHaveBeenCalledWith('/repo');
		expect(result?.projectId).toBe('maestro');
	});

	it('returns null on ipc failure', async () => {
		const getSnapshot = vi.fn().mockResolvedValue({ success: false, error: 'missing tasks' });
		(window as any).maestro.projectMemory.getSnapshot = getSnapshot;

		const result = await projectMemoryService.getSnapshot('/repo');

		expect(result).toBeNull();
	});

	it('returns detail on success', async () => {
		const getTaskDetail = vi.fn().mockResolvedValue({
			success: true,
			detail: {
				task: { id: 'PM-01' },
				binding: null,
				runtime: null,
				taskLock: null,
				worktreeLock: null,
				worktree: null,
			},
		});
		(window as any).maestro.projectMemory.getTaskDetail = getTaskDetail;

		const result = await projectMemoryService.getTaskDetail('/repo', 'PM-01');

		expect(getTaskDetail).toHaveBeenCalledWith('/repo', 'PM-01');
		expect((result?.task as { id: string }).id).toBe('PM-01');
	});

	it('returns validation report on success', async () => {
		const validateState = vi.fn().mockResolvedValue({
			success: true,
			report: {
				ok: true,
				projectId: 'maestro',
				taskCount: 1,
				bindingCount: 0,
				runtimeCount: 0,
				taskLockCount: 0,
				worktreeLockCount: 0,
				expiredTaskLockCount: 0,
				expiredWorktreeLockCount: 0,
				issues: [],
			},
		});
		(window as any).maestro.projectMemory.validateState = validateState;

		const result = await projectMemoryService.validateState('/repo');

		expect(validateState).toHaveBeenCalledWith('/repo');
		expect(result?.ok).toBe(true);
	});

	it('returns execution validation on success', async () => {
		const validateExecutionStart = vi.fn().mockResolvedValue({
			success: true,
			validation: {
				ok: true,
				skipped: false,
				taskId: 'PM-01',
				executorId: 'codex-main',
				reason: null,
				bindingMode: 'shared-branch-serialized',
				expectedBranch: 'main',
				currentBranch: 'main',
			},
		});
		(window as any).maestro.projectMemory.validateExecutionStart = validateExecutionStart;

		const result = await projectMemoryService.validateExecutionStart({
			repoRoot: '/repo',
			taskId: 'PM-01',
			executorId: 'codex-main',
		});

		expect(validateExecutionStart).toHaveBeenCalledWith('/repo', 'PM-01', 'codex-main', undefined);
		expect(result.ok).toBe(true);
		expect(result.expectedBranch).toBe('main');
	});

	it('claims the next execution context for codex', async () => {
		const claimNextExecution = vi.fn().mockResolvedValue({
			success: true,
			execution: {
				repoRoot: '/repo',
				taskId: 'PM-02',
				executorId: 'codex-main',
			},
		});
		(window as any).maestro.projectMemory.claimNextExecution = claimNextExecution;

		const result = await projectMemoryService.claimNextExecutionContext('/repo', 'codex');

		expect(claimNextExecution).toHaveBeenCalledWith('/repo', 'codex-main');
		expect(result).toEqual({
			repoRoot: '/repo',
			taskId: 'PM-02',
			executorId: 'codex-main',
		});
	});

	it('infers execution context for codex when exactly one active task matches executor', async () => {
		const getSnapshot = vi.fn().mockResolvedValue({
			success: true,
			snapshot: {
				projectId: 'maestro',
				version: '2026-04-04',
				taskCount: 2,
				generatedAt: 'now',
				tasks: [
					{
						id: 'PM-01',
						title: 'Do work',
						status: 'in_progress',
						dependsOn: [],
						executionMode: 'shared-serialized',
						bindingMode: 'shared-branch-serialized',
						worktreePath: '/repo',
						executorState: 'running',
						executorId: 'codex-main',
					},
					{
						id: 'PM-02',
						title: 'Other work',
						status: 'pending',
						dependsOn: [],
						executionMode: 'shared-serialized',
						bindingMode: null,
						worktreePath: null,
						executorState: null,
						executorId: null,
					},
				],
			},
		});
		(window as any).maestro.projectMemory.getSnapshot = getSnapshot;
		(window as any).maestro.projectMemory.validateState = vi.fn().mockResolvedValue({
			success: true,
			report: {
				ok: true,
				projectId: 'maestro',
				taskCount: 2,
				bindingCount: 1,
				runtimeCount: 1,
				taskLockCount: 1,
				worktreeLockCount: 1,
				expiredTaskLockCount: 0,
				expiredWorktreeLockCount: 0,
				issues: [],
			},
		});

		const result = await projectMemoryService.inferExecutionContext('/repo', 'codex');

		expect(result).toEqual({
			repoRoot: '/repo',
			taskId: 'PM-01',
			executorId: 'codex-main',
		});
	});

	it('does not infer execution context when multiple active tasks match executor', async () => {
		const getSnapshot = vi.fn().mockResolvedValue({
			success: true,
			snapshot: {
				projectId: 'maestro',
				version: '2026-04-04',
				taskCount: 2,
				generatedAt: 'now',
				tasks: [
					{
						id: 'PM-01',
						title: 'Do work',
						status: 'in_progress',
						dependsOn: [],
						executionMode: 'shared-serialized',
						bindingMode: 'shared-branch-serialized',
						worktreePath: '/repo',
						executorState: 'running',
						executorId: 'codex-main',
					},
					{
						id: 'PM-02',
						title: 'More work',
						status: 'in_progress',
						dependsOn: [],
						executionMode: 'shared-serialized',
						bindingMode: 'shared-branch-serialized',
						worktreePath: '/repo',
						executorState: 'running',
						executorId: 'codex-main',
					},
				],
			},
		});
		(window as any).maestro.projectMemory.getSnapshot = getSnapshot;
		(window as any).maestro.projectMemory.validateState = vi.fn().mockResolvedValue({
			success: true,
			report: {
				ok: true,
				projectId: 'maestro',
				taskCount: 2,
				bindingCount: 2,
				runtimeCount: 2,
				taskLockCount: 2,
				worktreeLockCount: 1,
				expiredTaskLockCount: 0,
				expiredWorktreeLockCount: 0,
				issues: [],
			},
		});

		const result = await projectMemoryService.inferExecutionContext('/repo', 'codex');

		expect(result).toBeNull();
	});

	it('does not infer execution context when the matched task is not actively running', async () => {
		const getSnapshot = vi.fn().mockResolvedValue({
			success: true,
			snapshot: {
				projectId: 'maestro',
				version: '2026-04-04',
				taskCount: 1,
				generatedAt: 'now',
				tasks: [
					{
						id: 'PM-01',
						title: 'Do work',
						status: 'in_progress',
						dependsOn: [],
						executionMode: 'shared-serialized',
						bindingMode: 'shared-branch-serialized',
						worktreePath: '/repo',
						executorState: 'pending',
						executorId: 'codex-main',
					},
				],
			},
		});
		(window as any).maestro.projectMemory.getSnapshot = getSnapshot;
		(window as any).maestro.projectMemory.validateState = vi.fn().mockResolvedValue({
			success: true,
			report: {
				ok: true,
				projectId: 'maestro',
				taskCount: 1,
				bindingCount: 1,
				runtimeCount: 1,
				taskLockCount: 0,
				worktreeLockCount: 0,
				expiredTaskLockCount: 0,
				expiredWorktreeLockCount: 0,
				issues: [],
			},
		});

		const result = await projectMemoryService.inferExecutionContext('/repo', 'codex');

		expect(result).toBeNull();
	});

	it('does not infer execution context when the matched task belongs to a different worktree path', async () => {
		const getSnapshot = vi.fn().mockResolvedValue({
			success: true,
			snapshot: {
				projectId: 'maestro',
				version: '2026-04-04',
				taskCount: 1,
				generatedAt: 'now',
				tasks: [
					{
						id: 'PM-01',
						title: 'Do work',
						status: 'in_progress',
						dependsOn: [],
						executionMode: 'isolated',
						bindingMode: 'isolated-worktree',
						worktreePath: '/repo/.worktrees/pm-01',
						executorState: 'running',
						executorId: 'codex-main',
					},
				],
			},
		});
		(window as any).maestro.projectMemory.getSnapshot = getSnapshot;
		(window as any).maestro.projectMemory.validateState = vi.fn().mockResolvedValue({
			success: true,
			report: {
				ok: true,
				projectId: 'maestro',
				taskCount: 1,
				bindingCount: 1,
				runtimeCount: 1,
				taskLockCount: 0,
				worktreeLockCount: 0,
				expiredTaskLockCount: 0,
				expiredWorktreeLockCount: 0,
				issues: [],
			},
		});

		const result = await projectMemoryService.inferExecutionContext('/repo', 'codex');

		expect(result).toBeNull();
	});

	it('does not infer execution context when project memory validation is unhealthy', async () => {
		const getSnapshot = vi.fn().mockResolvedValue({
			success: true,
			snapshot: {
				projectId: 'maestro',
				version: '2026-04-04',
				taskCount: 1,
				generatedAt: 'now',
				tasks: [
					{
						id: 'PM-01',
						title: 'Do work',
						status: 'in_progress',
						dependsOn: [],
						executionMode: 'shared-serialized',
						bindingMode: 'shared-branch-serialized',
						worktreePath: '/repo',
						executorState: 'running',
						executorId: 'codex-main',
					},
				],
			},
		});
		(window as any).maestro.projectMemory.getSnapshot = getSnapshot;
		(window as any).maestro.projectMemory.validateState = vi.fn().mockResolvedValue({
			success: true,
			report: {
				ok: false,
				projectId: 'maestro',
				taskCount: 1,
				bindingCount: 1,
				runtimeCount: 1,
				taskLockCount: 1,
				worktreeLockCount: 1,
				expiredTaskLockCount: 1,
				expiredWorktreeLockCount: 1,
				issues: ['expired task lock: PM-01'],
			},
		});

		const result = await projectMemoryService.inferExecutionContext('/repo', 'codex');

		expect(result).toBeNull();
	});
});
