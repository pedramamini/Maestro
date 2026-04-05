import { RefreshCw } from 'lucide-react';
import type {
	ProjectMemorySnapshot,
	ProjectMemoryStateValidationReport,
	ProjectMemoryTaskDetail,
} from '../../shared/projectMemory';
import type { Theme } from '../types';

function summarizeValidationIssues(issues: string[]): string | null {
	if (issues.length === 0) {
		return null;
	}

	const counters = {
		lockDrift: 0,
		bindingMismatch: 0,
		runtimeDrift: 0,
		other: 0,
	};

	for (const issue of issues) {
		const normalized = issue.toLowerCase();
		if (normalized.includes('lock')) {
			counters.lockDrift += 1;
			continue;
		}
		if (normalized.includes('binding')) {
			counters.bindingMismatch += 1;
			continue;
		}
		if (normalized.includes('runtime')) {
			counters.runtimeDrift += 1;
			continue;
		}
		counters.other += 1;
	}

	const parts: string[] = [];
	if (counters.lockDrift > 0) {
		parts.push(`${counters.lockDrift} lock drift`);
	}
	if (counters.bindingMismatch > 0) {
		parts.push(`${counters.bindingMismatch} binding mismatch`);
	}
	if (counters.runtimeDrift > 0) {
		parts.push(`${counters.runtimeDrift} runtime drift`);
	}
	if (counters.other > 0) {
		parts.push(`${counters.other} other`);
	}

	return parts.length > 0 ? parts.join(' · ') : null;
}

interface ProjectMemoryStatusCardProps {
	theme: Theme;
	snapshot: ProjectMemorySnapshot | null;
	validationReport?: ProjectMemoryStateValidationReport | null;
	loading?: boolean;
	onRefresh?: () => void;
	detailExpanded?: boolean;
	detailLoading?: boolean;
	detailError?: string | null;
	activeTaskDetail?: ProjectMemoryTaskDetail | null;
	onToggleDetail?: () => void;
}

export function ProjectMemoryStatusCard({
	theme,
	snapshot,
	validationReport = null,
	loading = false,
	onRefresh,
	detailExpanded = false,
	detailLoading = false,
	detailError = null,
	activeTaskDetail = null,
	onToggleDetail,
}: ProjectMemoryStatusCardProps) {
	if (!snapshot && !validationReport && !loading) {
		return null;
	}

	const counts = {
		pending: snapshot?.tasks.filter((task) => task.status === 'pending').length ?? 0,
		inProgress: snapshot?.tasks.filter((task) => task.status === 'in_progress').length ?? 0,
		completed: snapshot?.tasks.filter((task) => task.status === 'completed').length ?? 0,
		failed: snapshot?.tasks.filter((task) => task.status === 'failed').length ?? 0,
	};
	const activeTask = snapshot?.tasks.find((task) => task.status === 'in_progress') ?? null;
	const healthLabel = validationReport ? (validationReport.ok ? 'HEALTHY' : 'UNHEALTHY') : null;
	const healthColor = validationReport
		? validationReport.ok
			? theme.colors.success
			: theme.colors.error
		: theme.colors.textDim;
	const visibleIssues = validationReport?.issues.slice(0, 2) ?? [];
	const validationSummary = validationReport
		? summarizeValidationIssues(validationReport.issues)
		: null;

	return (
		<div
			className="mx-2 mb-2 p-3 rounded-lg border"
			style={{
				backgroundColor: theme.colors.bgActivity,
				borderColor: theme.colors.border,
			}}
			data-testid="project-memory-status-card"
		>
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div
						className="text-[10px] font-semibold uppercase tracking-wide mb-1"
						style={{ color: theme.colors.textDim }}
					>
						Project Memory
					</div>
					<div className="text-sm font-semibold truncate" style={{ color: theme.colors.textMain }}>
						{loading ? 'Loading task snapshot…' : `${snapshot?.taskCount ?? 0} tracked tasks`}
					</div>
					{healthLabel ? (
						<div className="text-[10px] mt-2">
							<span
								className="px-2 py-0.5 rounded-full font-semibold"
								style={{
									backgroundColor: theme.colors.bgMain,
									color: healthColor,
									border: `1px solid ${theme.colors.border}`,
								}}
							>
								{healthLabel}
								{!validationReport?.ok ? ` · ${validationReport?.issues.length ?? 0} issues` : ''}
							</span>
						</div>
					) : null}
					{activeTask ? (
						<div className="text-xs mt-1" style={{ color: theme.colors.textDim }}>
							Active: <span style={{ color: theme.colors.textMain }}>{activeTask.title}</span>
							{activeTask.bindingMode ? ` · ${activeTask.bindingMode}` : ''}
						</div>
					) : snapshot ? (
						<div className="text-xs mt-1" style={{ color: theme.colors.textDim }}>
							No active project-memory task
						</div>
					) : null}
				</div>
				<div className="flex items-center gap-2">
					{activeTask && onToggleDetail && (
						<button
							onClick={onToggleDetail}
							className="px-2 py-1 rounded text-[10px] font-semibold transition-colors hover:bg-white/10"
							style={{
								color: theme.colors.textDim,
								border: `1px solid ${theme.colors.border}`,
							}}
							title={detailExpanded ? 'Hide active task detail' : 'Show active task detail'}
						>
							{detailExpanded ? 'Hide Detail' : 'View Detail'}
						</button>
					)}
					{onRefresh && (
						<button
							onClick={onRefresh}
							className="flex items-center justify-center w-7 h-7 rounded transition-colors hover:bg-white/10"
							style={{
								color: theme.colors.textDim,
								border: `1px solid ${theme.colors.border}`,
							}}
							title="Refresh project memory snapshot"
						>
							<RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
						</button>
					)}
				</div>
			</div>

			{validationReport && !validationReport.ok && (
				<div
					className="mt-3 rounded-md border p-3 text-xs space-y-1"
					style={{
						backgroundColor: theme.colors.bgMain,
						borderColor: theme.colors.border,
						color: theme.colors.textDim,
					}}
				>
					<div style={{ color: theme.colors.error }}>Project Memory state needs attention.</div>
					{validationSummary ? (
						<div style={{ color: theme.colors.textMain }}>{validationSummary}</div>
					) : null}
					{visibleIssues.map((issue) => (
						<div key={issue}>{issue}</div>
					))}
					<div>
						Use `AGENT/task-sync.sh validate` and recovery commands before relying on auto-binding.
					</div>
				</div>
			)}

			{snapshot && (
				<div className="flex flex-wrap gap-2 mt-3">
					{[
						{ label: 'PENDING', value: counts.pending, color: theme.colors.textDim },
						{ label: 'RUN', value: counts.inProgress, color: theme.colors.warning },
						{ label: 'DONE', value: counts.completed, color: theme.colors.success },
						{ label: 'FAIL', value: counts.failed, color: theme.colors.error },
					].map((item) => (
						<span
							key={item.label}
							className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
							style={{
								backgroundColor: theme.colors.bgMain,
								color: item.color,
								border: `1px solid ${theme.colors.border}`,
							}}
						>
							{item.label} {item.value}
						</span>
					))}
				</div>
			)}

			{detailExpanded && (
				<div
					className="mt-3 rounded-md border p-3 text-xs space-y-2"
					style={{
						backgroundColor: theme.colors.bgMain,
						borderColor: theme.colors.border,
						color: theme.colors.textDim,
					}}
				>
					{detailLoading ? (
						<div>Loading active task detail…</div>
					) : detailError ? (
						<div style={{ color: theme.colors.error }}>{detailError}</div>
					) : activeTaskDetail ? (
						<>
							<div>
								<span style={{ color: theme.colors.textMain }}>Task:</span>{' '}
								{String(
									(activeTaskDetail.task as { id?: string; title?: string } | null)?.id ?? 'unknown'
								)}
								{' · '}
								{String(
									(activeTaskDetail.task as { title?: string } | null)?.title ?? 'Untitled task'
								)}
							</div>
							<div>
								<span style={{ color: theme.colors.textMain }}>Binding:</span>{' '}
								{String(
									(
										activeTaskDetail.binding as {
											binding_mode?: string;
											branch_name?: string;
											worktree_path?: string;
										} | null
									)?.binding_mode ?? 'none'
								)}
								{(
									activeTaskDetail.binding as {
										branch_name?: string;
										worktree_path?: string;
									} | null
								)?.branch_name
									? ` · ${String((activeTaskDetail.binding as { branch_name?: string }).branch_name)}`
									: ''}
							</div>
							<div>
								<span style={{ color: theme.colors.textMain }}>Worktree:</span>{' '}
								{String(
									(
										activeTaskDetail.worktree as {
											worktree_id?: string;
											worktree_path?: string;
										} | null
									)?.worktree_id ??
										(activeTaskDetail.binding as { worktree_path?: string } | null)
											?.worktree_path ??
										'none'
								)}
								{(activeTaskDetail.worktree as { worktree_path?: string } | null)?.worktree_path
									? ` · ${String((activeTaskDetail.worktree as { worktree_path?: string }).worktree_path)}`
									: (activeTaskDetail.binding as { worktree_path?: string } | null)?.worktree_path
										? ` · ${String((activeTaskDetail.binding as { worktree_path?: string }).worktree_path)}`
										: ''}
							</div>
							<div>
								<span style={{ color: theme.colors.textMain }}>Runtime:</span>{' '}
								{String(
									(
										activeTaskDetail.runtime as {
											executor_state?: string;
											executor_id?: string;
										} | null
									)?.executor_state ?? 'unknown'
								)}
								{(activeTaskDetail.runtime as { executor_id?: string } | null)?.executor_id
									? ` · ${String((activeTaskDetail.runtime as { executor_id?: string }).executor_id)}`
									: ''}
							</div>
							<div>
								<span style={{ color: theme.colors.textMain }}>Locks:</span> task{' '}
								{String((activeTaskDetail.taskLock as { owner?: string } | null)?.owner ?? 'none')}
								{' · '}worktree{' '}
								{String(
									(activeTaskDetail.worktreeLock as { owner?: string } | null)?.owner ?? 'none'
								)}
							</div>
						</>
					) : (
						<div>No active task detail available.</div>
					)}
				</div>
			)}
		</div>
	);
}
