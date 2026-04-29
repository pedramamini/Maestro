/**
 * Tests for AgentUsageChart component
 *
 * Focuses on session-name resolution behavior shared with the other dashboard
 * charts: session keys from `bySessionByDay` are resolved via `buildNameMap`
 * so the line legend, tooltips, and aria labels show user-assigned session
 * names (or the prettified type fallback) instead of raw UUID prefixes.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgentUsageChart } from '../../../../renderer/components/UsageDashboard/AgentUsageChart';
import type { StatsAggregation } from '../../../../renderer/hooks/stats/useStats';
import type { Session } from '../../../../renderer/types';
import { THEMES } from '../../../../shared/themes';

let _sessionIdCounter = 0;
function makeSession(overrides: Partial<Session> = {}): Session {
	_sessionIdCounter++;
	return {
		id: `s${_sessionIdCounter}`,
		name: `Session ${_sessionIdCounter}`,
		toolType: 'claude-code',
		state: 'idle',
		cwd: '/tmp',
		fullPath: '/tmp',
		projectRoot: '/tmp',
		aiLogs: [],
		shellLogs: [],
		workLog: [],
		contextUsage: 0,
		inputMode: 'ai',
		aiPid: 0,
		terminalPid: 0,
		port: 0,
		isLive: false,
		changedFiles: [],
		isGitRepo: false,
		fileTree: [],
		fileExplorerExpanded: [],
		fileExplorerScrollPos: 0,
		createdAt: 0,
		...overrides,
	} as Session;
}

const theme = THEMES['dracula'];

const baseEmptyData: StatsAggregation = {
	totalQueries: 0,
	totalDuration: 0,
	avgDuration: 0,
	byAgent: {},
	bySource: { user: 0, auto: 0 },
	byLocation: { local: 0, remote: 0 },
	byDay: [],
	byHour: [],
	totalSessions: 0,
	sessionsByAgent: {},
	sessionsByDay: [],
	avgSessionDuration: 0,
	byAgentByDay: {},
	bySessionByDay: {},
};

function dataForSessions(
	sessionDays: Record<string, Array<{ date: string; count: number; duration: number }>>
): StatsAggregation {
	return { ...baseEmptyData, bySessionByDay: sessionDays };
}

describe('AgentUsageChart', () => {
	describe('Rendering', () => {
		it('renders the title', () => {
			render(<AgentUsageChart data={baseEmptyData} timeRange="week" theme={theme} />);
			expect(screen.getByText('Agent Usage Over Time')).toBeInTheDocument();
		});

		it('renders the empty-state message when no session data is present', () => {
			render(<AgentUsageChart data={baseEmptyData} timeRange="week" theme={theme} />);
			expect(screen.getByText('No usage data available')).toBeInTheDocument();
		});
	});

	describe('Session Name Resolution', () => {
		it('uses the user-assigned session name when the stat key matches a session', () => {
			const session = makeSession({ id: 'sess-aaa', name: 'Backend API' });
			const data = dataForSessions({
				'sess-aaa': [{ date: '2024-12-20', count: 5, duration: 60_000 }],
			});

			render(<AgentUsageChart data={data} timeRange="week" theme={theme} sessions={[session]} />);

			expect(screen.getByText('Backend API')).toBeInTheDocument();
		});

		it('matches stat keys with tab-id suffixes back to the underlying session', () => {
			const session = makeSession({ id: 'sess-bbb', name: 'Frontend' });
			const data = dataForSessions({
				'sess-bbb-ai-tab1': [{ date: '2024-12-20', count: 3, duration: 30_000 }],
			});

			render(<AgentUsageChart data={data} timeRange="week" theme={theme} sessions={[session]} />);

			expect(screen.getByText('Frontend')).toBeInTheDocument();
		});

		it('disambiguates colliding session names with " (2)" suffixes', () => {
			const a = makeSession({ id: 'sess-aaa', name: 'Worker' });
			const b = makeSession({ id: 'sess-bbb', name: 'Worker' });
			const data = dataForSessions({
				'sess-aaa': [{ date: '2024-12-20', count: 5, duration: 60_000 }],
				'sess-bbb': [{ date: '2024-12-20', count: 3, duration: 30_000 }],
			});

			render(<AgentUsageChart data={data} timeRange="week" theme={theme} sessions={[a, b]} />);

			expect(screen.getByText('Worker')).toBeInTheDocument();
			expect(screen.getByText('Worker (2)')).toBeInTheDocument();
		});

		it('appends " (WT)" suffix to worktree-child session names', () => {
			const parent = makeSession({ id: 'parent', name: 'Main App' });
			const worktree = makeSession({
				id: 'wt-1',
				name: 'Feature Branch',
				parentSessionId: 'parent',
			});
			const data = dataForSessions({
				parent: [{ date: '2024-12-20', count: 5, duration: 60_000 }],
				'wt-1': [{ date: '2024-12-20', count: 3, duration: 30_000 }],
			});

			render(
				<AgentUsageChart data={data} timeRange="week" theme={theme} sessions={[parent, worktree]} />
			);

			expect(screen.getByText('Main App')).toBeInTheDocument();
			expect(screen.getByText('Feature Branch (WT)')).toBeInTheDocument();
		});

		it('falls back to a prettified key when no matching session exists', () => {
			// "claude-code" is the canonical agent id, so prettifyAgentType returns
			// "Claude Code" — used as the legend label when no session is registered
			// for this stat key.
			const data = dataForSessions({
				'claude-code': [{ date: '2024-12-20', count: 5, duration: 60_000 }],
			});

			render(<AgentUsageChart data={data} timeRange="week" theme={theme} sessions={[]} />);

			expect(screen.getByText('Claude Code')).toBeInTheDocument();
		});
	});
});
