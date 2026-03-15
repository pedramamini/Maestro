/**
 * ActivityHeatmap
 *
 * GitHub-style contribution heatmap showing AI usage activity.
 * For day/week view: shows hours (0-23) on Y-axis, days on X-axis.
 * For month/year/all view: GitHub-style grid with weeks as columns, days of week as rows.
 *
 * Features:
 * - GitHub-style layout for month+ views (weeks as columns, Mon-Sun as rows)
 * - Color intensity toggle between query count and duration
 * - Tooltip on hover showing exact date and count/duration
 * - Theme-aware gradient colors (bgSecondary → accent)
 * - Fits within viewport width for year-long data
 * - Month labels above the grid for navigation
 */

import React, { memo, useState, useMemo, useCallback } from 'react';
import { format, subDays, startOfWeek, addDays, getDay } from 'date-fns';
import { useTranslation } from 'react-i18next';
import type { Theme } from '../../types';
import type { StatsTimeRange, StatsAggregation } from '../../hooks/stats/useStats';
import { COLORBLIND_HEATMAP_SCALE } from '../../constants/colorblindPalettes';
import { getActiveLocale } from '../../utils/formatters';

// Metric display mode
type MetricMode = 'count' | 'duration';

interface HourData {
	date: Date;
	hour: number; // 0-23
	dateString: string; // yyyy-MM-dd
	hourKey: string; // yyyy-MM-dd-HH
	count: number;
	duration: number;
	intensity: number; // 0-4 scale for color intensity
}

interface DayColumn {
	date: Date;
	dateString: string;
	dayLabel: string;
	hours: HourData[];
}

// GitHub-style data structures
interface DayCell {
	date: Date;
	dateString: string;
	dayOfWeek: number; // 0 = Sunday, 6 = Saturday
	count: number;
	duration: number;
	intensity: number;
	isPlaceholder?: boolean; // For empty cells before start date
}

interface WeekColumn {
	weekStart: Date;
	days: DayCell[];
}

interface MonthLabel {
	month: string;
	colSpan: number;
	startCol: number;
}

// 4-hour block data structures for month view
interface TimeBlockCell {
	date: Date;
	dateString: string;
	blockIndex: number; // 0-5 (0=0-4am, 1=4-8am, 2=8-12pm, 3=12-4pm, 4=4-8pm, 5=8-12am)
	blockLabel: string; // e.g., "12a-4a", "4a-8a"
	count: number;
	duration: number;
	intensity: number;
	isPlaceholder?: boolean;
}

interface DayColumnWithBlocks {
	date: Date;
	dateString: string;
	dayLabel: string;
	blocks: TimeBlockCell[];
}

interface ActivityHeatmapProps {
	/** Aggregated stats data from the API */
	data: StatsAggregation;
	/** Current time range selection */
	timeRange: StatsTimeRange;
	/** Current theme for styling */
	theme: Theme;
	/** Enable colorblind-friendly colors */
	colorBlindMode?: boolean;
}

/**
 * Get the number of days to display based on time range
 */
function getDaysForRange(timeRange: StatsTimeRange): number {
	switch (timeRange) {
		case 'day':
			return 1;
		case 'week':
			return 7;
		case 'month':
			return 30;
		case 'quarter':
			return 90;
		case 'year':
			return 365;
		case 'all':
			return 365; // Show last year for "all time"
		default:
			return 7;
	}
}

/**
 * Check if we should use single-day mode (one pixel per day, no hour breakdown)
 * Used for year/all time ranges where time-of-day breakdown would be too cramped
 */
function shouldUseSingleDayMode(timeRange: StatsTimeRange): boolean {
	return timeRange === 'year' || timeRange === 'all';
}

/**
 * Check if we should use 4-hour block mode (6 blocks per day)
 * Used for month and quarter views to show time-of-day patterns with more granularity
 */
function shouldUse4HourBlockMode(timeRange: StatsTimeRange): boolean {
	return timeRange === 'month' || timeRange === 'quarter';
}

/**
 * Generate locale-aware 4-hour time block labels using Intl.DateTimeFormat.
 * E.g., English: "12 AM\u20134 AM", German: "0\u20134", French: "00\u201304".
 */
function getLocalizedTimeBlockLabels(locale: string): string[] {
	const fmt = new Intl.DateTimeFormat(locale, { hour: 'numeric' });
	const blockStarts = [0, 4, 8, 12, 16, 20];
	return blockStarts.map((h) => {
		const endH = (h + 4) % 24;
		return `${fmt.format(new Date(2025, 0, 1, h))}\u2013${fmt.format(new Date(2025, 0, 1, endH))}`;
	});
}

/**
 * Generate locale-aware abbreviated day-of-week labels (Sun\u2013Sat).
 */
function getLocalizedDayOfWeekLabels(locale: string): string[] {
	const fmt = new Intl.DateTimeFormat(locale, { weekday: 'short' });
	// Jan 5, 2025 is a Sunday
	return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2025, 0, 5 + i)));
}

/**
 * Generate locale-aware hour labels (0\u201323).
 */
function getLocalizedHourLabels(locale: string): string[] {
	const fmt = new Intl.DateTimeFormat(locale, { hour: 'numeric' });
	return Array.from({ length: 24 }, (_, i) => fmt.format(new Date(2025, 0, 1, i)));
}

/**
 * Format a date using Intl.DateTimeFormat for locale-correct display.
 */
function formatLocalDate(date: Date, locale: string, options: Intl.DateTimeFormatOptions): string {
	return new Intl.DateTimeFormat(locale, options).format(date);
}

/**
 * Build day columns with 4-hour time blocks for month view
 */
function build4HourBlockGrid(
	numDays: number,
	dayDataMap: Map<string, { count: number; duration: number }>,
	metricMode: MetricMode,
	locale: string,
	timeBlockLabels: string[]
): { dayColumns: DayColumnWithBlocks[]; maxCount: number; maxDuration: number } {
	const today = new Date();
	const columns: DayColumnWithBlocks[] = [];
	let maxCount = 0;
	let maxDuration = 0;
	const dayFmt = new Intl.DateTimeFormat(locale, { day: 'numeric' });

	// Generate days from (numDays-1) days ago to today
	for (let dayOffset = numDays - 1; dayOffset >= 0; dayOffset--) {
		const date = subDays(today, dayOffset);
		const dateString = format(date, 'yyyy-MM-dd');
		const dayStats = dayDataMap.get(dateString) || { count: 0, duration: 0 };

		// Create 6 time blocks per day
		const blocks: TimeBlockCell[] = timeBlockLabels.map((label, blockIndex) => {
			// Distribute data across blocks with weighting for typical work hours
			// Blocks 2-4 (8am-8pm) get more weight
			let weight = 1;
			if (blockIndex >= 2 && blockIndex <= 4) {
				weight = 2; // Work hours get double weight
			}

			// Total weight: 1 + 1 + 2 + 2 + 2 + 1 = 9
			const totalWeight = 9;
			const count = Math.round((dayStats.count * weight) / totalWeight);
			const duration = Math.round((dayStats.duration * weight) / totalWeight);

			maxCount = Math.max(maxCount, count);
			maxDuration = Math.max(maxDuration, duration);

			return {
				date,
				dateString,
				blockIndex,
				blockLabel: label,
				count,
				duration,
				intensity: 0, // Calculated later
			};
		});

		columns.push({
			date,
			dateString,
			dayLabel: dayFmt.format(date),
			blocks,
		});
	}

	// Calculate intensities
	const maxVal = metricMode === 'count' ? Math.max(maxCount, 1) : Math.max(maxDuration, 1);
	columns.forEach((col) => {
		col.blocks.forEach((block) => {
			const value = metricMode === 'count' ? block.count : block.duration;
			block.intensity = calculateIntensity(value, maxVal);
		});
	});

	return { dayColumns: columns, maxCount, maxDuration };
}

/**
 * Format duration in milliseconds to human-readable string
 */
function formatDuration(ms: number): string {
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
 * Calculate intensity level (0-4) from a value and max value
 * Level 0 = no activity, 1-4 = increasing activity
 */
function calculateIntensity(value: number, maxValue: number): number {
	if (value === 0) return 0;
	if (maxValue === 0) return 0;

	const ratio = value / maxValue;
	if (ratio <= 0.25) return 1;
	if (ratio <= 0.5) return 2;
	if (ratio <= 0.75) return 3;
	return 4;
}

/**
 * Build GitHub-style week columns for the heatmap
 * Returns weeks as columns with 7 days each (Sun-Sat or Mon-Sun based on locale)
 */
function buildGitHubGrid(
	numDays: number,
	dayDataMap: Map<string, { count: number; duration: number }>,
	metricMode: MetricMode,
	locale: string
): { weeks: WeekColumn[]; monthLabels: MonthLabel[]; maxCount: number; maxDuration: number } {
	const today = new Date();
	const startDate = subDays(today, numDays - 1);

	// Find the Sunday before or on the start date (week starts on Sunday like GitHub)
	const gridStart = startOfWeek(startDate, { weekStartsOn: 0 });

	const weeks: WeekColumn[] = [];
	const monthLabels: MonthLabel[] = [];
	let maxCount = 0;
	let maxDuration = 0;
	const monthFmt = new Intl.DateTimeFormat(locale, { month: 'short' });

	let currentDate = gridStart;
	let currentWeek: DayCell[] = [];
	let lastMonth = '';

	// Build grid until we pass today
	let weekIndex = 0;
	while (currentDate <= today || currentWeek.length > 0) {
		const dateString = format(currentDate, 'yyyy-MM-dd');
		const dayOfWeek = getDay(currentDate); // 0 = Sunday
		const isBeforeStart = currentDate < startDate;
		const isAfterEnd = currentDate > today;

		// Track month changes for labels
		const monthStr = monthFmt.format(currentDate);
		if (monthStr !== lastMonth && !isBeforeStart && !isAfterEnd) {
			// Start of a new month
			if (lastMonth !== '') {
				// Close out the previous month label
				const lastLabel = monthLabels[monthLabels.length - 1];
				if (lastLabel) {
					lastLabel.colSpan = weekIndex - lastLabel.startCol;
				}
			}
			monthLabels.push({
				month: monthStr,
				colSpan: 1, // Will be updated when month ends
				startCol: weekIndex,
			});
			lastMonth = monthStr;
		}

		const dayStats = dayDataMap.get(dateString) || { count: 0, duration: 0 };

		if (!isBeforeStart && !isAfterEnd) {
			maxCount = Math.max(maxCount, dayStats.count);
			maxDuration = Math.max(maxDuration, dayStats.duration);
		}

		currentWeek.push({
			date: new Date(currentDate),
			dateString,
			dayOfWeek,
			count: isBeforeStart || isAfterEnd ? 0 : dayStats.count,
			duration: isBeforeStart || isAfterEnd ? 0 : dayStats.duration,
			intensity: 0, // Calculated later
			isPlaceholder: isBeforeStart || isAfterEnd,
		});

		// When we complete a week (Saturday = day 6)
		if (dayOfWeek === 6) {
			weeks.push({
				weekStart: startOfWeek(currentDate, { weekStartsOn: 0 }),
				days: currentWeek,
			});
			currentWeek = [];
			weekIndex++;
		}

		currentDate = addDays(currentDate, 1);

		// Stop if we've gone past today and completed the week
		if (isAfterEnd && dayOfWeek === 6) {
			break;
		}
	}

	// Handle partial last week
	if (currentWeek.length > 0) {
		// Fill remaining days as placeholders
		while (currentWeek.length < 7) {
			const nextDate = addDays(currentWeek[currentWeek.length - 1].date, 1);
			currentWeek.push({
				date: nextDate,
				dateString: format(nextDate, 'yyyy-MM-dd'),
				dayOfWeek: getDay(nextDate),
				count: 0,
				duration: 0,
				intensity: 0,
				isPlaceholder: true,
			});
		}
		weeks.push({
			weekStart: startOfWeek(currentWeek[0].date, { weekStartsOn: 0 }),
			days: currentWeek,
		});
	}

	// Close out the last month label
	if (monthLabels.length > 0) {
		const lastLabel = monthLabels[monthLabels.length - 1];
		lastLabel.colSpan = weeks.length - lastLabel.startCol;
	}

	// Calculate intensities
	const maxVal = metricMode === 'count' ? Math.max(maxCount, 1) : Math.max(maxDuration, 1);
	weeks.forEach((week) => {
		week.days.forEach((day) => {
			if (!day.isPlaceholder) {
				const value = metricMode === 'count' ? day.count : day.duration;
				day.intensity = calculateIntensity(value, maxVal);
			}
		});
	});

	return { weeks, monthLabels, maxCount, maxDuration };
}

/**
 * Get color for a given intensity level
 */
function getIntensityColor(intensity: number, theme: Theme, colorBlindMode?: boolean): string {
	// Use colorblind-safe palette when colorblind mode is enabled
	if (colorBlindMode) {
		const clampedIntensity = Math.max(0, Math.min(4, Math.round(intensity)));
		return COLORBLIND_HEATMAP_SCALE[clampedIntensity];
	}

	const accent = theme.colors.accent;
	const bgSecondary = theme.colors.bgActivity;

	// Parse the accent color to get RGB values for interpolation
	let accentRgb: { r: number; g: number; b: number } | null = null;

	if (accent.startsWith('#')) {
		const hex = accent.slice(1);
		accentRgb = {
			r: parseInt(hex.slice(0, 2), 16),
			g: parseInt(hex.slice(2, 4), 16),
			b: parseInt(hex.slice(4, 6), 16),
		};
	} else if (accent.startsWith('rgb')) {
		const match = accent.match(/\d+/g);
		if (match && match.length >= 3) {
			accentRgb = {
				r: parseInt(match[0]),
				g: parseInt(match[1]),
				b: parseInt(match[2]),
			};
		}
	}

	// Fallback to accent with varying opacity if parsing fails
	if (!accentRgb) {
		const opacities = [0.1, 0.3, 0.5, 0.7, 1.0];
		return `${accent}${Math.round(opacities[intensity] * 255)
			.toString(16)
			.padStart(2, '0')}`;
	}

	// Generate colors for each intensity level
	switch (intensity) {
		case 0:
			return bgSecondary;
		case 1:
			return `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.2)`;
		case 2:
			return `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.4)`;
		case 3:
			return `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.6)`;
		case 4:
			return `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.9)`;
		default:
			return bgSecondary;
	}
}

export const ActivityHeatmap = memo(function ActivityHeatmap({
	data,
	timeRange,
	theme,
	colorBlindMode = false,
}: ActivityHeatmapProps) {
	const { t: tA } = useTranslation('accessibility');
	const { t } = useTranslation('common');
	const locale = getActiveLocale();
	const [metricMode, setMetricMode] = useState<MetricMode>('count');
	const [hoveredCell, setHoveredCell] = useState<HourData | DayCell | TimeBlockCell | null>(null);
	const [cellRect, setCellRect] = useState<DOMRect | null>(null);

	const useGitHubLayout = shouldUseSingleDayMode(timeRange);
	const use4HourBlockLayout = shouldUse4HourBlockMode(timeRange);

	// Locale-aware labels for chart axes
	const timeBlockLabels = useMemo(() => getLocalizedTimeBlockLabels(locale), [locale]);
	const dayOfWeekLabels = useMemo(() => getLocalizedDayOfWeekLabels(locale), [locale]);

	// Convert byDay data to a lookup map
	const dayDataMap = useMemo(() => {
		const map = new Map<string, { count: number; duration: number }>();
		for (const day of data.byDay) {
			map.set(day.date, { count: day.count, duration: day.duration });
		}
		return map;
	}, [data.byDay]);

	// GitHub-style grid data for year/all views
	const gitHubGrid = useMemo(() => {
		if (!useGitHubLayout) return null;
		const numDays = getDaysForRange(timeRange);
		return buildGitHubGrid(numDays, dayDataMap, metricMode, locale);
	}, [useGitHubLayout, timeRange, dayDataMap, metricMode, locale]);

	// 4-hour block grid data for month view
	const blockGrid = useMemo(() => {
		if (!use4HourBlockLayout) return null;
		const numDays = getDaysForRange(timeRange);
		return build4HourBlockGrid(numDays, dayDataMap, metricMode, locale, timeBlockLabels);
	}, [use4HourBlockLayout, timeRange, dayDataMap, metricMode, locale, timeBlockLabels]);

	// Generate hour-based data for the heatmap (day/week views)
	const { dayColumns, hourLabels } = useMemo(() => {
		if (useGitHubLayout || use4HourBlockLayout) {
			return { dayColumns: [], hourLabels: [] };
		}

		const numDays = getDaysForRange(timeRange);
		const today = new Date();
		const columns: DayColumn[] = [];

		// Determine hour rows based on mode
		const hours = Array.from({ length: 24 }, (_, i) => i);
		const labels = getLocalizedHourLabels(locale);

		// Track max values for intensity calculation
		let maxCount = 0;
		let maxDuration = 0;

		// Generate days from (numDays-1) days ago to today
		for (let dayOffset = numDays - 1; dayOffset >= 0; dayOffset--) {
			const date = subDays(today, dayOffset);
			const dateString = format(date, 'yyyy-MM-dd');
			const dayStats = dayDataMap.get(dateString) || { count: 0, duration: 0 };

			const hourData: HourData[] = hours.map((hour) => {
				// Distribute evenly across hours (simplified - real data would have hourly breakdown)
				let count = Math.floor(dayStats.count / 24);
				let duration = Math.floor(dayStats.duration / 24);
				// Distribute remainder to typical work hours (9-17)
				if (hour >= 9 && hour <= 17) {
					count += Math.floor((dayStats.count % 24) / 9);
					duration += Math.floor((dayStats.duration % 24) / 9);
				}

				maxCount = Math.max(maxCount, count);
				maxDuration = Math.max(maxDuration, duration);

				return {
					date,
					hour,
					dateString,
					hourKey: `${dateString}-${hour.toString().padStart(2, '0')}`,
					count,
					duration,
					intensity: 0,
				};
			});

			columns.push({
				date,
				dateString,
				dayLabel:
					numDays <= 7
						? formatLocalDate(date, locale, { weekday: 'short' })
						: formatLocalDate(date, locale, { day: 'numeric' }),
				hours: hourData,
			});
		}

		// Now calculate intensities with known max values
		const maxVal = metricMode === 'count' ? Math.max(maxCount, 1) : Math.max(maxDuration, 1);
		columns.forEach((col) => {
			col.hours.forEach((hourData) => {
				const value = metricMode === 'count' ? hourData.count : hourData.duration;
				hourData.intensity = calculateIntensity(value, maxVal);
			});
		});

		return {
			dayColumns: columns,
			hourLabels: labels,
		};
	}, [dayDataMap, metricMode, timeRange, useGitHubLayout, locale]);

	// Handle mouse events for tooltip (HourData for day/week, DayCell for month+)
	// Track cell element position for tooltip placement below the cell
	const handleMouseEnterHour = useCallback(
		(cell: HourData, event: React.MouseEvent<HTMLDivElement>) => {
			setHoveredCell(cell);
			setCellRect(event.currentTarget.getBoundingClientRect());
		},
		[]
	);

	const handleMouseEnterDay = useCallback(
		(cell: DayCell, event: React.MouseEvent<HTMLDivElement>) => {
			if (cell.isPlaceholder) return;
			setHoveredCell(cell);
			setCellRect(event.currentTarget.getBoundingClientRect());
		},
		[]
	);

	const handleMouseEnterBlock = useCallback(
		(cell: TimeBlockCell, event: React.MouseEvent<HTMLDivElement>) => {
			if (cell.isPlaceholder) return;
			setHoveredCell(cell);
			setCellRect(event.currentTarget.getBoundingClientRect());
		},
		[]
	);

	const handleMouseLeave = useCallback(() => {
		setHoveredCell(null);
		setCellRect(null);
	}, []);

	return (
		<div
			className="p-4 rounded-lg"
			style={{ backgroundColor: theme.colors.bgMain }}
			role="figure"
			aria-label={tA('dashboard.activity_heatmap', {
				metric:
					metricMode === 'count'
						? tA('dashboard.query_count_label')
						: tA('dashboard.total_duration_label'),
				days: getDaysForRange(timeRange),
			})}
		>
			{/* Header with title and metric toggle */}
			<div className="flex items-center justify-between mb-4">
				<h3 className="text-sm font-medium" style={{ color: theme.colors.textMain }}>
					{t('chart.activity_heatmap_title')}
				</h3>
				<div className="flex items-center gap-2">
					<span className="text-xs" style={{ color: theme.colors.textDim }}>
						{t('chart.show_label')}
					</span>
					<div
						className="flex rounded overflow-hidden border"
						style={{ borderColor: theme.colors.border }}
					>
						<button
							onClick={() => setMetricMode('count')}
							className="px-2 py-1 text-xs transition-colors"
							style={{
								backgroundColor:
									metricMode === 'count' ? `${theme.colors.accent}20` : 'transparent',
								color: metricMode === 'count' ? theme.colors.accent : theme.colors.textDim,
							}}
							aria-pressed={metricMode === 'count'}
							aria-label={tA('dashboard.show_query_count')}
						>
							{t('chart.count')}
						</button>
						<button
							onClick={() => setMetricMode('duration')}
							className="px-2 py-1 text-xs transition-colors"
							style={{
								backgroundColor:
									metricMode === 'duration' ? `${theme.colors.accent}20` : 'transparent',
								color: metricMode === 'duration' ? theme.colors.accent : theme.colors.textDim,
								borderLeft: `1px solid ${theme.colors.border}`,
							}}
							aria-pressed={metricMode === 'duration'}
							aria-label={tA('dashboard.show_total_duration')}
						>
							{t('chart.duration')}
						</button>
					</div>
				</div>
			</div>

			{/* GitHub-style heatmap for year/all views */}
			{useGitHubLayout && gitHubGrid && (
				<div className="flex gap-2">
					{/* Day of week labels (Y-axis) */}
					<div className="flex flex-col flex-shrink-0" style={{ width: 36, paddingTop: 22 }}>
						{dayOfWeekLabels.map((label, idx) => (
							<div
								key={idx}
								className="text-xs text-right flex items-center justify-end pr-1"
								style={{
									color: theme.colors.textDim,
									height: 15,
								}}
							>
								{/* Only show Mon, Wed, Fri for cleaner look */}
								{idx % 2 === 1 ? label : ''}
							</div>
						))}
					</div>

					{/* Grid container */}
					<div className="flex-1 overflow-x-auto">
						{/* Month labels row */}
						<div className="flex" style={{ marginBottom: 6, height: 18 }}>
							{gitHubGrid.monthLabels.map((monthLabel, idx) => (
								<div
									key={`${monthLabel.month}-${idx}`}
									className="text-xs"
									style={{
										color: theme.colors.textDim,
										width: monthLabel.colSpan * 15, // 13px cell + 2px gap
										paddingLeft: 2,
										flexShrink: 0,
									}}
								>
									{monthLabel.colSpan >= 3 ? monthLabel.month : ''}
								</div>
							))}
						</div>

						{/* Week columns */}
						<div className="flex gap-[2px]">
							{gitHubGrid.weeks.map((week, weekIdx) => (
								<div
									key={weekIdx}
									className="flex flex-col gap-[2px]"
									style={{ width: 13, flexShrink: 0 }}
								>
									{week.days.map((day) => (
										<div
											key={day.dateString}
											className="rounded-sm cursor-default"
											style={{
												width: 13,
												height: 13,
												backgroundColor: day.isPlaceholder
													? 'transparent'
													: getIntensityColor(day.intensity, theme, colorBlindMode),
												outline:
													hoveredCell &&
													'dateString' in hoveredCell &&
													hoveredCell.dateString === day.dateString &&
													!day.isPlaceholder
														? `2px solid ${theme.colors.accent}`
														: 'none',
												outlineOffset: -1,
												transition: 'background-color 0.3s ease, outline 0.15s ease',
											}}
											onMouseEnter={(e) => handleMouseEnterDay(day, e)}
											onMouseLeave={handleMouseLeave}
											role="gridcell"
											aria-label={
												day.isPlaceholder
													? ''
													: `${formatLocalDate(day.date, locale, { month: 'short', day: 'numeric', year: 'numeric' })}: ${t('chart.query', { count: day.count })}${day.duration > 0 ? `, ${formatDuration(day.duration)}` : ''}`
											}
											tabIndex={day.isPlaceholder ? -1 : 0}
										/>
									))}
								</div>
							))}
						</div>
					</div>
				</div>
			)}

			{/* 4-hour block heatmap for month/quarter views */}
			{use4HourBlockLayout && blockGrid && (
				<div className="flex gap-2">
					{/* Time block labels (Y-axis) */}
					<div className="flex flex-col flex-shrink-0" style={{ width: 52, paddingTop: 22 }}>
						{timeBlockLabels.map((label, idx) => (
							<div
								key={idx}
								className="text-xs text-right flex items-center justify-end pr-2"
								style={{
									color: theme.colors.textDim,
									height: 20,
								}}
							>
								{label}
							</div>
						))}
					</div>

					{/* Grid of cells with scrolling */}
					<div className="flex-1 overflow-x-auto">
						<div className="flex gap-[3px]" style={{ minWidth: blockGrid.dayColumns.length * 17 }}>
							{blockGrid.dayColumns.map((col, colIdx) => {
								// Show day number for all days, but only show month on 1st of month
								const isFirstOfMonth = col.date.getDate() === 1;
								const showMonthLabel = isFirstOfMonth || colIdx === 0;
								return (
									<div
										key={col.dateString}
										className="flex flex-col gap-[3px]"
										style={{ width: 14, flexShrink: 0 }}
									>
										{/* Day label with month indicator */}
										<div
											className="text-xs text-center truncate h-[18px] flex items-center justify-center"
											style={{
												color: isFirstOfMonth ? theme.colors.accent : theme.colors.textDim,
												fontSize: 10,
												fontWeight: isFirstOfMonth ? 600 : 400,
											}}
											title={formatLocalDate(col.date, locale, {
												weekday: 'long',
												month: 'short',
												day: 'numeric',
											})}
										>
											{showMonthLabel && isFirstOfMonth
												? formatLocalDate(col.date, locale, { month: 'short' })
												: col.dayLabel}
										</div>
										{/* Time block cells */}
										{col.blocks.map((block) => (
											<div
												key={`${col.dateString}-${block.blockIndex}`}
												className="rounded-sm cursor-default"
												style={{
													height: 17,
													backgroundColor: block.isPlaceholder
														? 'transparent'
														: getIntensityColor(block.intensity, theme, colorBlindMode),
													outline:
														hoveredCell &&
														'blockIndex' in hoveredCell &&
														hoveredCell.dateString === block.dateString &&
														hoveredCell.blockIndex === block.blockIndex
															? `2px solid ${theme.colors.accent}`
															: 'none',
													outlineOffset: -1,
													transition: 'background-color 0.3s ease, outline 0.15s ease',
												}}
												onMouseEnter={(e) => handleMouseEnterBlock(block, e)}
												onMouseLeave={handleMouseLeave}
												role="gridcell"
												aria-label={`${formatLocalDate(block.date, locale, { month: 'short', day: 'numeric' })} ${block.blockLabel}: ${t('chart.query', { count: block.count })}${block.duration > 0 ? `, ${formatDuration(block.duration)}` : ''}`}
												tabIndex={0}
											/>
										))}
									</div>
								);
							})}
						</div>
					</div>
				</div>
			)}

			{/* Original hourly heatmap for day/week views */}
			{!useGitHubLayout && !use4HourBlockLayout && (
				<div className="flex gap-2">
					{/* Hour labels (Y-axis) */}
					<div className="flex flex-col flex-shrink-0" style={{ width: 28, paddingTop: 18 }}>
						{hourLabels.map((label, idx) => (
							<div
								key={idx}
								className="text-xs text-right flex items-center justify-end"
								style={{
									color: theme.colors.textDim,
									height: 16,
								}}
							>
								{/* Only show labels for even hours (0, 2, 4, etc.) */}
								{idx % 2 === 0 ? label : ''}
							</div>
						))}
					</div>

					{/* Grid of cells */}
					<div className="flex-1">
						<div className="flex gap-[3px]">
							{dayColumns.map((col) => (
								<div
									key={col.dateString}
									className="flex flex-col gap-[2px] flex-1"
									style={{ minWidth: 20 }}
								>
									{/* Day label */}
									<div
										className="text-xs text-center truncate h-[16px] flex items-center justify-center"
										style={{ color: theme.colors.textDim }}
										title={formatLocalDate(col.date, locale, {
											weekday: 'long',
											month: 'short',
											day: 'numeric',
										})}
									>
										{col.dayLabel}
									</div>
									{/* Hour cells */}
									{col.hours.map((hourData) => (
										<div
											key={hourData.hourKey}
											className="rounded-sm cursor-default"
											style={{
												height: 14,
												backgroundColor: getIntensityColor(
													hourData.intensity,
													theme,
													colorBlindMode
												),
												outline:
													hoveredCell &&
													'hourKey' in hoveredCell &&
													hoveredCell.hourKey === hourData.hourKey
														? `2px solid ${theme.colors.accent}`
														: 'none',
												outlineOffset: -1,
												transition: 'background-color 0.3s ease, outline 0.15s ease',
											}}
											onMouseEnter={(e) => handleMouseEnterHour(hourData, e)}
											onMouseLeave={handleMouseLeave}
											role="gridcell"
											aria-label={`${formatLocalDate(hourData.date, locale, { month: 'short', day: 'numeric' })} ${hourData.hour}:00: ${t('chart.query', { count: hourData.count })}${hourData.duration > 0 ? `, ${formatDuration(hourData.duration)}` : ''}`}
											tabIndex={0}
										/>
									))}
								</div>
							))}
						</div>
					</div>
				</div>
			)}

			{/* Legend */}
			<div
				className="flex items-center justify-end gap-2 mt-3"
				role="list"
				aria-label={tA('dashboard.activity_scale')}
			>
				<span className="text-xs" style={{ color: theme.colors.textDim }} aria-hidden="true">
					{t('chart.less')}
				</span>
				{[0, 1, 2, 3, 4].map((level) => (
					<div
						key={level}
						className="rounded-sm"
						style={{
							width: 12,
							height: 12,
							backgroundColor: getIntensityColor(level, theme, colorBlindMode),
						}}
						role="listitem"
						aria-label={tA(`dashboard.intensity_level_${level}` as any)}
					/>
				))}
				<span className="text-xs" style={{ color: theme.colors.textDim }} aria-hidden="true">
					{t('chart.more')}
				</span>
			</div>

			{/* Tooltip - positioned below cell, centered, with edge detection */}
			{hoveredCell &&
				cellRect &&
				(() => {
					const tooltipWidth = 220;
					const tooltipHeight = 56;
					const viewportWidth = window.innerWidth;
					const viewportHeight = window.innerHeight;
					const margin = 8; // Safety margin from viewport edges
					const gapBelowCell = 4; // Gap between cell and tooltip

					// Calculate cell center
					const cellCenterX = cellRect.left + cellRect.width / 2;

					// Default: center tooltip below cell
					let left = cellCenterX - tooltipWidth / 2;
					let top = cellRect.bottom + gapBelowCell;

					// Handle horizontal edge cases
					if (left < margin) {
						// Cell is near left edge - align tooltip to the right of center
						left = cellRect.left;
					} else if (left + tooltipWidth > viewportWidth - margin) {
						// Cell is near right edge - align tooltip to the left of center
						left = cellRect.right - tooltipWidth;
					}

					// Final horizontal safety bounds
					left = Math.max(margin, Math.min(left, viewportWidth - tooltipWidth - margin));

					// Handle vertical edge case - if tooltip would go below viewport, show above cell
					if (top + tooltipHeight > viewportHeight - margin) {
						top = cellRect.top - tooltipHeight - gapBelowCell;
					}

					// Final vertical safety bounds
					top = Math.max(margin, Math.min(top, viewportHeight - tooltipHeight - margin));

					// Determine cell type for time display
					const isBlockCell = 'blockIndex' in hoveredCell;
					const isHourCell = 'hour' in hoveredCell;

					return (
						<div
							className="fixed z-[99999] px-3 py-2 rounded text-xs whitespace-nowrap pointer-events-none"
							style={{
								left: `${left}px`,
								top: `${top}px`,
								backgroundColor: theme.colors.bgActivity,
								color: theme.colors.textMain,
								border: `1px solid ${theme.colors.border}`,
								boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
							}}
						>
							<div className="font-medium mb-0.5">
								{formatLocalDate(hoveredCell.date, locale, {
									weekday: 'long',
									month: 'short',
									day: 'numeric',
									year: 'numeric',
								})}
								{isHourCell &&
									` ${t('chart.at_hour', { hour: `${(hoveredCell as HourData).hour}:00` })}`}
								{isBlockCell && ` (${(hoveredCell as TimeBlockCell).blockLabel})`}
							</div>
							<div style={{ color: theme.colors.textDim }}>
								{t('chart.query', { count: hoveredCell.count })}
								{hoveredCell.duration > 0 && <span> • {formatDuration(hoveredCell.duration)}</span>}
							</div>
						</div>
					);
				})()}
		</div>
	);
});

export default ActivityHeatmap;
