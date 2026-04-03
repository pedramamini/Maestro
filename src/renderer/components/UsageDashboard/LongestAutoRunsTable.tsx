/**
 * LongestAutoRunsTable
 *
 * Displays the top 25 longest Auto Run sessions in a sortable table.
 * Shown at the bottom of the Auto Run tab in the Usage Dashboard.
 *
 * Columns:
 * - Duration (sorted longest → shortest)
 * - Date (start time)
 * - Agent (agent type display name)
 * - Document (file name from documentPath)
 * - Tasks (completed / total)
 * - Project (last path segment)
 */

import { memo, useState, useEffect, useMemo, useCallback } from 'react';
import { Trophy } from 'lucide-react';
import type { Theme } from '../../types';
import type { StatsTimeRange } from '../../hooks/stats/useStats';
import { captureException } from '../../utils/sentry';
import { getAgentDisplayName } from '../../../shared/agentMetadata';

/**
 * Auto Run session data shape from the API
 */
interface AutoRunSession {
	id: string;
	sessionId: string;
	agentType: string;
	documentPath?: string;
	startTime: number;
	duration: number;
	tasksTotal?: number;
	tasksCompleted?: number;
	projectPath?: string;
	playbookName?: string;
	promptProfile?: 'full' | 'compact-code' | 'compact-doc';
	agentStrategy?: 'single' | 'plan-execute-verify';
	worktreeMode?: 'disabled' | 'managed' | 'existing-open' | 'existing-closed' | 'create-new';
}

interface LongestAutoRunsTableProps {
	/** Current time range for filtering */
	timeRange: StatsTimeRange;
	/** Current theme for styling */
	theme: Theme;
}

const MAX_ROWS = 25;
const ALL_FILTER_VALUE = '__all__';

/**
 * Format duration in milliseconds to human-readable string
 */
function formatDuration(ms: number): string {
	if (ms === 0) return '0s';

	const totalSeconds = Math.floor(ms / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;

	if (hours > 0) {
		return `${hours}h ${minutes}m`;
	}
	if (minutes > 0) {
		return `${minutes}m ${seconds}s`;
	}
	return `${seconds}s`;
}

/**
 * Format agent type to display name
 */
function formatAgentName(agentType: string): string {
	return getAgentDisplayName(agentType);
}

/**
 * Extract file name from a document path
 */
function extractFileName(path?: string): string {
	if (!path) return '—';
	const segments = path.replace(/\\/g, '/').split('/');
	return segments[segments.length - 1] || '—';
}

/**
 * Extract last path segment from project path
 */
function extractProjectName(path?: string): string {
	if (!path) return '—';
	const segments = path.replace(/\\/g, '/').split('/').filter(Boolean);
	return segments[segments.length - 1] || '—';
}

function formatPromptProfile(promptProfile?: AutoRunSession['promptProfile']): string {
	switch (promptProfile) {
		case 'compact-code':
			return 'Code';
		case 'compact-doc':
			return 'Doc';
		case 'full':
			return 'Full';
		default:
			return '—';
	}
}

function formatAgentStrategy(agentStrategy?: AutoRunSession['agentStrategy']): string {
	switch (agentStrategy) {
		case 'plan-execute-verify':
			return 'PEV';
		case 'single':
			return 'Single';
		default:
			return '—';
	}
}

function formatWorktreeMode(worktreeMode?: AutoRunSession['worktreeMode']): string {
	switch (worktreeMode) {
		case 'existing-open':
			return 'Open';
		case 'existing-closed':
			return 'Closed';
		case 'create-new':
			return 'New';
		case 'managed':
			return 'Managed';
		case 'disabled':
			return 'Off';
		default:
			return '—';
	}
}

function buildFilterOptions(values: string[]): Array<{ value: string; label: string }> {
	return [...new Set(values)]
		.filter(Boolean)
		.sort((a, b) => a.localeCompare(b))
		.map((value) => ({ value, label: value }));
}

/**
 * Format date for table display
 */
function formatDate(timestamp: number): string {
	return new Date(timestamp).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	});
}

/**
 * Format time for table display
 */
function formatTime(timestamp: number): string {
	return new Date(timestamp).toLocaleTimeString('en-US', {
		hour: 'numeric',
		minute: '2-digit',
	});
}

export const LongestAutoRunsTable = memo(function LongestAutoRunsTable({
	timeRange,
	theme,
}: LongestAutoRunsTableProps) {
	const [sessions, setSessions] = useState<AutoRunSession[]>([]);
	const [loading, setLoading] = useState(true);
	const [playbookFilter, setPlaybookFilter] = useState(ALL_FILTER_VALUE);
	const [profileFilter, setProfileFilter] = useState(ALL_FILTER_VALUE);
	const [strategyFilter, setStrategyFilter] = useState(ALL_FILTER_VALUE);
	const [worktreeFilter, setWorktreeFilter] = useState(ALL_FILTER_VALUE);

	const fetchData = useCallback(async () => {
		setLoading(true);
		try {
			const autoRunSessions = await window.maestro.stats.getAutoRunSessions(timeRange);
			setSessions(autoRunSessions);
		} catch (err) {
			captureException(err);
		} finally {
			setLoading(false);
		}
	}, [timeRange]);

	useEffect(() => {
		fetchData();

		const unsubscribe = window.maestro.stats.onStatsUpdate(() => {
			fetchData();
		});

		return () => unsubscribe();
	}, [fetchData]);

	// Sort by duration (longest first) and take top 25
	const filterOptions = useMemo(
		() => ({
			playbooks: buildFilterOptions(
				sessions.map((session) => session.playbookName).filter(Boolean) as string[]
			),
			profiles: buildFilterOptions(
				sessions
					.map((session) => formatPromptProfile(session.promptProfile))
					.filter((v) => v !== '—')
			),
			strategies: buildFilterOptions(
				sessions
					.map((session) => formatAgentStrategy(session.agentStrategy))
					.filter((v) => v !== '—')
			),
			worktrees: buildFilterOptions(
				sessions.map((session) => formatWorktreeMode(session.worktreeMode)).filter((v) => v !== '—')
			),
		}),
		[sessions]
	);

	const filteredSessions = useMemo(() => {
		return sessions.filter((session) => {
			if (playbookFilter !== ALL_FILTER_VALUE && (session.playbookName || '') !== playbookFilter) {
				return false;
			}
			if (
				profileFilter !== ALL_FILTER_VALUE &&
				formatPromptProfile(session.promptProfile) !== profileFilter
			) {
				return false;
			}
			if (
				strategyFilter !== ALL_FILTER_VALUE &&
				formatAgentStrategy(session.agentStrategy) !== strategyFilter
			) {
				return false;
			}
			if (
				worktreeFilter !== ALL_FILTER_VALUE &&
				formatWorktreeMode(session.worktreeMode) !== worktreeFilter
			) {
				return false;
			}
			return true;
		});
	}, [sessions, playbookFilter, profileFilter, strategyFilter, worktreeFilter]);

	const topSessions = useMemo(() => {
		return [...filteredSessions].sort((a, b) => b.duration - a.duration).slice(0, MAX_ROWS);
	}, [filteredSessions]);

	if (loading) {
		return (
			<div
				className="p-4 rounded-lg"
				style={{ backgroundColor: theme.colors.bgMain }}
				data-testid="longest-autoruns-loading"
			>
				<div
					className="h-32 flex items-center justify-center"
					style={{ color: theme.colors.textDim }}
				>
					Loading longest Auto Runs...
				</div>
			</div>
		);
	}

	if (sessions.length === 0) {
		return null; // Don't show table if no data — AutoRunStats already shows empty state
	}

	return (
		<div
			className="p-4 rounded-lg"
			style={{ backgroundColor: theme.colors.bgMain }}
			data-testid="longest-autoruns-table"
			role="region"
			aria-label="Top 25 longest Auto Run sessions"
		>
			<div className="flex items-center gap-2 mb-4">
				<Trophy className="w-4 h-4" style={{ color: theme.colors.accent }} />
				<h3 className="text-sm font-medium" style={{ color: theme.colors.textMain }}>
					Top {Math.min(topSessions.length, MAX_ROWS)} Longest Auto Runs
				</h3>
				<span className="text-xs" style={{ color: theme.colors.textDim }}>
					({filteredSessions.length} filtered / {sessions.length} total)
				</span>
			</div>

			<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 mb-4">
				{[
					{
						label: 'Playbook',
						value: playbookFilter,
						onChange: setPlaybookFilter,
						options: filterOptions.playbooks,
					},
					{
						label: 'Prompt Profile',
						value: profileFilter,
						onChange: setProfileFilter,
						options: filterOptions.profiles,
					},
					{
						label: 'Strategy',
						value: strategyFilter,
						onChange: setStrategyFilter,
						options: filterOptions.strategies,
					},
					{
						label: 'Worktree',
						value: worktreeFilter,
						onChange: setWorktreeFilter,
						options: filterOptions.worktrees,
					},
				].map((filter) => (
					<label key={filter.label} className="flex flex-col gap-1">
						<span
							className="text-[10px] font-bold uppercase"
							style={{ color: theme.colors.textDim }}
						>
							{filter.label}
						</span>
						<select
							value={filter.value}
							onChange={(event) => filter.onChange(event.target.value)}
							className="rounded border px-2 py-1.5 text-sm"
							style={{
								backgroundColor: theme.colors.bgActivity,
								borderColor: theme.colors.border,
								color: theme.colors.textMain,
							}}
						>
							<option value={ALL_FILTER_VALUE}>All</option>
							{filter.options.map((option) => (
								<option key={option.value} value={option.value}>
									{option.label}
								</option>
							))}
						</select>
					</label>
				))}
			</div>

			<div className="overflow-x-auto">
				{topSessions.length === 0 ? (
					<div
						className="rounded border px-4 py-8 text-sm text-center"
						style={{
							borderColor: theme.colors.border,
							color: theme.colors.textDim,
						}}
					>
						No Auto Run sessions match the current filters.
					</div>
				) : (
					<table
						className="w-full text-sm"
						style={{ borderCollapse: 'separate', borderSpacing: 0 }}
					>
						<thead>
							<tr>
								{[
									'#',
									'Duration',
									'Date',
									'Time',
									'Agent',
									'Playbook',
									'Run Mode',
									'Document',
									'Tasks',
									'Project',
								].map((header) => (
									<th
										key={header}
										className="text-left text-xs font-medium uppercase tracking-wider px-3 py-2 border-b"
										style={{
											color: theme.colors.textDim,
											borderColor: theme.colors.border,
										}}
									>
										{header}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{topSessions.map((session, index) => {
								const tasksLabel =
									session.tasksTotal != null
										? `${session.tasksCompleted ?? 0} / ${session.tasksTotal}`
										: '—';

								return (
									<tr
										key={session.id}
										className="transition-colors"
										style={{
											backgroundColor: index % 2 === 0 ? 'transparent' : `${theme.colors.border}10`,
										}}
										onMouseEnter={(e) => {
											e.currentTarget.style.backgroundColor = `${theme.colors.accent}10`;
										}}
										onMouseLeave={(e) => {
											e.currentTarget.style.backgroundColor =
												index % 2 === 0 ? 'transparent' : `${theme.colors.border}10`;
										}}
									>
										<td
											className="px-3 py-2 font-mono text-xs"
											style={{ color: theme.colors.textDim }}
										>
											{index + 1}
										</td>
										<td
											className="px-3 py-2 font-mono font-medium whitespace-nowrap"
											style={{ color: theme.colors.textMain }}
										>
											{formatDuration(session.duration)}
										</td>
										<td
											className="px-3 py-2 whitespace-nowrap"
											style={{ color: theme.colors.textDim }}
										>
											{formatDate(session.startTime)}
										</td>
										<td
											className="px-3 py-2 whitespace-nowrap"
											style={{ color: theme.colors.textDim }}
										>
											{formatTime(session.startTime)}
										</td>
										<td
											className="px-3 py-2 whitespace-nowrap"
											style={{ color: theme.colors.textMain }}
										>
											{formatAgentName(session.agentType)}
										</td>
										<td
											className="px-3 py-2 max-w-[180px] truncate"
											style={{ color: theme.colors.textMain }}
											title={session.playbookName || undefined}
										>
											{session.playbookName || '—'}
										</td>
										<td
											className="px-3 py-2 whitespace-nowrap"
											style={{ color: theme.colors.textDim }}
										>
											{`${formatPromptProfile(session.promptProfile)} / ${formatAgentStrategy(session.agentStrategy)} / WT ${formatWorktreeMode(session.worktreeMode)}`}
										</td>
										<td
											className="px-3 py-2 max-w-[200px] truncate"
											style={{ color: theme.colors.textDim }}
											title={session.documentPath || undefined}
										>
											{extractFileName(session.documentPath)}
										</td>
										<td
											className="px-3 py-2 whitespace-nowrap font-mono text-xs"
											style={{ color: theme.colors.textDim }}
										>
											{tasksLabel}
										</td>
										<td
											className="px-3 py-2 max-w-[150px] truncate"
											style={{ color: theme.colors.textDim }}
											title={session.projectPath || undefined}
										>
											{extractProjectName(session.projectPath)}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				)}
			</div>
		</div>
	);
});

export default LongestAutoRunsTable;
