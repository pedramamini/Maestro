import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProjectMemoryStatusCard } from '../../../renderer/components/ProjectMemoryStatusCard';

const theme = {
	colors: {
		bgActivity: '#111111',
		border: '#333333',
		textDim: '#999999',
		textMain: '#ffffff',
		bgMain: '#000000',
		warning: '#f59e0b',
		success: '#22c55e',
		error: '#ef4444',
	},
} as any;

describe('ProjectMemoryStatusCard', () => {
	it('renders nothing when idle and no snapshot', () => {
		const { container } = render(
			<ProjectMemoryStatusCard theme={theme} snapshot={null} loading={false} />
		);
		expect(container.firstChild).toBeNull();
	});

	it('renders snapshot counts and active task', () => {
		render(
			<ProjectMemoryStatusCard
				theme={theme}
				loading={false}
				validationReport={{
					ok: true,
					projectId: 'maestro',
					taskCount: 3,
					bindingCount: 1,
					runtimeCount: 1,
					taskLockCount: 1,
					worktreeLockCount: 1,
					expiredTaskLockCount: 0,
					expiredWorktreeLockCount: 0,
					issues: [],
				}}
				onRefresh={vi.fn()}
				onToggleDetail={vi.fn()}
				snapshot={{
					projectId: 'maestro',
					version: '2026-04-04',
					taskCount: 3,
					generatedAt: 'now',
					tasks: [
						{
							id: 'PM-01',
							title: 'Layout',
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
							title: 'Schema',
							status: 'pending',
							dependsOn: [],
							executionMode: 'shared-serialized',
							bindingMode: null,
							worktreePath: null,
							executorState: null,
							executorId: null,
						},
						{
							id: 'PM-03',
							title: 'Tests',
							status: 'completed',
							dependsOn: [],
							executionMode: 'shared-serialized',
							bindingMode: 'shared-branch-serialized',
							worktreePath: '/repo',
							executorState: 'completed',
							executorId: 'codex-main',
						},
					],
				}}
			/>
		);

		expect(screen.getByText('3 tracked tasks')).toBeInTheDocument();
		expect(screen.getByText(/Active:/)).toBeInTheDocument();
		expect(screen.getByText(/RUN 1/)).toBeInTheDocument();
		expect(screen.getByText(/DONE 1/)).toBeInTheDocument();
		expect(screen.getByText(/HEALTHY/)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /view detail/i })).toBeInTheDocument();
	});

	it('renders unhealthy validation issues and recovery guidance', () => {
		render(
			<ProjectMemoryStatusCard
				theme={theme}
				loading={false}
				validationReport={{
					ok: false,
					projectId: 'maestro',
					taskCount: 1,
					bindingCount: 1,
					runtimeCount: 1,
					taskLockCount: 1,
					worktreeLockCount: 1,
					expiredTaskLockCount: 1,
					expiredWorktreeLockCount: 1,
					issues: [
						'expired task lock: PM-01',
						'expired worktree lock: shared-main',
						'binding mismatch: PM-01 expected shared-main',
					],
				}}
				snapshot={{
					projectId: 'maestro',
					version: '2026-04-04',
					taskCount: 1,
					generatedAt: 'now',
					tasks: [],
				}}
			/>
		);

		expect(screen.getByText(/UNHEALTHY/)).toBeInTheDocument();
		expect(screen.getByText(/2 lock drift · 1 binding mismatch/i)).toBeInTheDocument();
		expect(screen.getByText(/expired task lock: PM-01/)).toBeInTheDocument();
		expect(screen.getByText(/expired worktree lock: shared-main/)).toBeInTheDocument();
		expect(screen.getByText(/AGENT\/task-sync\.sh validate/)).toBeInTheDocument();
	});

	it('renders active task detail inline when expanded', () => {
		render(
			<ProjectMemoryStatusCard
				theme={theme}
				loading={false}
				validationReport={{
					ok: true,
					projectId: 'maestro',
					taskCount: 1,
					bindingCount: 1,
					runtimeCount: 1,
					taskLockCount: 1,
					worktreeLockCount: 1,
					expiredTaskLockCount: 0,
					expiredWorktreeLockCount: 0,
					issues: [],
				}}
				detailExpanded
				activeTaskDetail={{
					task: { id: 'PM-01', title: 'Layout' },
					binding: {
						binding_mode: 'shared-branch-serialized',
						branch_name: 'main',
						worktree_path: '/repo',
					},
					runtime: { executor_state: 'running', executor_id: 'codex-main' },
					taskLock: { owner: 'codex-main' },
					worktreeLock: { owner: 'codex-main' },
					worktree: { worktree_id: 'shared-main' },
				}}
				snapshot={{
					projectId: 'maestro',
					version: '2026-04-04',
					taskCount: 1,
					generatedAt: 'now',
					tasks: [
						{
							id: 'PM-01',
							title: 'Layout',
							status: 'in_progress',
							dependsOn: [],
							executionMode: 'shared-serialized',
							bindingMode: 'shared-branch-serialized',
							worktreePath: '/repo',
							executorState: 'running',
							executorId: 'codex-main',
						},
					],
				}}
			/>
		);

		expect(screen.getByText(/Task:/)).toBeInTheDocument();
		expect(screen.getByText(/PM-01/)).toBeInTheDocument();
		expect(screen.getByText(/Worktree:/)).toBeInTheDocument();
		expect(screen.getByText(/shared-main/)).toBeInTheDocument();
		expect(screen.getByText(/\/repo/)).toBeInTheDocument();
		expect(screen.getByText(/Runtime:/)).toBeInTheDocument();
		expect(screen.getByText(/Locks:/)).toBeInTheDocument();
	});
});
