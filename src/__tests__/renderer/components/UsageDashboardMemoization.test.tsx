/**
 * Tests for UsageDashboard component memoization
 *
 * Verifies that all Usage Dashboard chart components are wrapped with React.memo.
 * Each component should:
 * - Have $$typeof === Symbol.for('react.memo')
 * - Preserve its display name through the memo wrapper
 */

import { describe, it, expect } from 'vitest';
import { DurationTrendsChart } from '../../../renderer/components/UsageDashboard/DurationTrendsChart';
import { SessionStats } from '../../../renderer/components/UsageDashboard/SessionStats';
import { AgentEfficiencyChart } from '../../../renderer/components/UsageDashboard/AgentEfficiencyChart';
import { SourceDistributionChart } from '../../../renderer/components/UsageDashboard/SourceDistributionChart';
import { SummaryCards } from '../../../renderer/components/UsageDashboard/SummaryCards';
import { LocationDistributionChart } from '../../../renderer/components/UsageDashboard/LocationDistributionChart';
import { ActivityHeatmap } from '../../../renderer/components/UsageDashboard/ActivityHeatmap';
import { LongestAutoRunsTable } from '../../../renderer/components/UsageDashboard/LongestAutoRunsTable';
import { TasksByHourChart } from '../../../renderer/components/UsageDashboard/TasksByHourChart';
import { PeakHoursChart } from '../../../renderer/components/UsageDashboard/PeakHoursChart';
import { WeekdayComparisonChart } from '../../../renderer/components/UsageDashboard/WeekdayComparisonChart';
import { AgentUsageChart } from '../../../renderer/components/UsageDashboard/AgentUsageChart';
import { AgentComparisonChart } from '../../../renderer/components/UsageDashboard/AgentComparisonChart';
import { AutoRunStats } from '../../../renderer/components/UsageDashboard/AutoRunStats';
import { EmptyState } from '../../../renderer/components/UsageDashboard/EmptyState';
import {
	SummaryCardsSkeleton,
	AgentComparisonChartSkeleton,
	SourceDistributionChartSkeleton,
	ActivityHeatmapSkeleton,
	DurationTrendsChartSkeleton,
	AutoRunStatsSkeleton,
	DashboardSkeleton,
} from '../../../renderer/components/UsageDashboard/ChartSkeletons';

type MemoComponent = { $$typeof: symbol; type: { name: string } };

const components: Array<[string, unknown]> = [
	['DurationTrendsChart', DurationTrendsChart],
	['SessionStats', SessionStats],
	['AgentEfficiencyChart', AgentEfficiencyChart],
	['SourceDistributionChart', SourceDistributionChart],
	['SummaryCards', SummaryCards],
	['LocationDistributionChart', LocationDistributionChart],
	['ActivityHeatmap', ActivityHeatmap],
	['LongestAutoRunsTable', LongestAutoRunsTable],
	['TasksByHourChart', TasksByHourChart],
	['PeakHoursChart', PeakHoursChart],
	['WeekdayComparisonChart', WeekdayComparisonChart],
	['AgentUsageChart', AgentUsageChart],
	['AgentComparisonChart', AgentComparisonChart],
	['AutoRunStats', AutoRunStats],
	['EmptyState', EmptyState],
	['SummaryCardsSkeleton', SummaryCardsSkeleton],
	['AgentComparisonChartSkeleton', AgentComparisonChartSkeleton],
	['SourceDistributionChartSkeleton', SourceDistributionChartSkeleton],
	['ActivityHeatmapSkeleton', ActivityHeatmapSkeleton],
	['DurationTrendsChartSkeleton', DurationTrendsChartSkeleton],
	['AutoRunStatsSkeleton', AutoRunStatsSkeleton],
	['DashboardSkeleton', DashboardSkeleton],
];

describe('UsageDashboard memoization', () => {
	it.each(components)('%s is wrapped with React.memo', (_name, component) => {
		const memoType = component as unknown as MemoComponent;
		expect(memoType.$$typeof).toBe(Symbol.for('react.memo'));
	});

	it.each(components)('%s preserves display name', (name, component) => {
		const memoType = component as unknown as MemoComponent;
		expect(memoType.type.name).toMatch(new RegExp(`^${name}`));
	});
});
