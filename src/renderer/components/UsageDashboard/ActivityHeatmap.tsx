/**
 * ActivityHeatmap
 *
 * GitHub-style contribution grid showing AI usage activity by day.
 * Displays a calendar heatmap with color intensity based on query count or duration.
 *
 * Features:
 * - X-axis: weeks, Y-axis: days of week (Sun-Sat)
 * - Color intensity toggle between query count and duration
 * - Tooltip on hover showing date and exact count/duration
 * - Theme-aware gradient colors (bgSecondary → accent)
 * - Handles different time ranges (last N weeks based on range)
 */

import React, { useState, useMemo, useCallback } from 'react';
import { format, parseISO, startOfWeek, addDays, differenceInWeeks, subWeeks, isAfter, isBefore, isSameDay } from 'date-fns';
import type { Theme } from '../../types';
import type { StatsTimeRange, StatsAggregation } from '../../hooks/useStats';
import { COLORBLIND_HEATMAP_SCALE } from '../../constants/colorblindPalettes';

// Days of week labels (Sunday first to match GitHub's layout)
const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Month labels for header
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Metric display mode
type MetricMode = 'count' | 'duration';

interface DayData {
  date: Date;
  dateString: string;
  count: number;
  duration: number;
  intensity: number; // 0-4 scale for color intensity
}

interface WeekData {
  weekStart: Date;
  days: DayData[];
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
 * Calculate the number of weeks to display based on time range
 */
function getWeeksForRange(timeRange: StatsTimeRange): number {
  switch (timeRange) {
    case 'day':
      return 1;
    case 'week':
      return 1;
    case 'month':
      return 5; // ~1 month
    case 'year':
      return 52; // Full year
    case 'all':
      return 52; // Show last year for "all time"
    default:
      return 52;
  }
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
  // This handles both hex and rgba formats
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
    return `${accent}${Math.round(opacities[intensity] * 255).toString(16).padStart(2, '0')}`;
  }

  // Generate colors for each intensity level
  // Level 0: near background, Level 4: full accent
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

export function ActivityHeatmap({ data, timeRange, theme, colorBlindMode = false }: ActivityHeatmapProps) {
  const [metricMode, setMetricMode] = useState<MetricMode>('count');
  const [hoveredDay, setHoveredDay] = useState<DayData | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  // Convert byDay data to a lookup map for quick access
  const dayDataMap = useMemo(() => {
    const map = new Map<string, { count: number; duration: number }>();
    for (const day of data.byDay) {
      map.set(day.date, { count: day.count, duration: day.duration });
    }
    return map;
  }, [data.byDay]);

  // Generate weeks of data for the heatmap
  const weeksData = useMemo((): WeekData[] => {
    const numWeeks = getWeeksForRange(timeRange);
    const today = new Date();
    const weeks: WeekData[] = [];

    // Calculate max values for intensity scaling
    const allValues = Array.from(dayDataMap.values());
    const maxCount = Math.max(...allValues.map((d) => d.count), 1);
    const maxDuration = Math.max(...allValues.map((d) => d.duration), 1);

    // Start from numWeeks ago, aligned to week start
    const endDate = today;
    const startDate = startOfWeek(subWeeks(today, numWeeks - 1));

    // Generate week by week
    let currentWeekStart = startDate;
    while (currentWeekStart <= endDate || differenceInWeeks(endDate, currentWeekStart) >= 0) {
      const weekDays: DayData[] = [];

      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const date = addDays(currentWeekStart, dayOffset);

        // Only include days up to today
        if (isAfter(date, today)) {
          break;
        }

        const dateString = format(date, 'yyyy-MM-dd');
        const dayStats = dayDataMap.get(dateString) || { count: 0, duration: 0 };

        const value = metricMode === 'count' ? dayStats.count : dayStats.duration;
        const maxValue = metricMode === 'count' ? maxCount : maxDuration;

        weekDays.push({
          date,
          dateString,
          count: dayStats.count,
          duration: dayStats.duration,
          intensity: calculateIntensity(value, maxValue),
        });
      }

      if (weekDays.length > 0) {
        weeks.push({
          weekStart: currentWeekStart,
          days: weekDays,
        });
      }

      currentWeekStart = addDays(currentWeekStart, 7);

      // Break if we've passed today
      if (isAfter(currentWeekStart, today) && weeks.length > 0) {
        break;
      }
    }

    return weeks;
  }, [dayDataMap, metricMode, timeRange]);

  // Generate month labels for the header
  const monthLabels = useMemo(() => {
    const labels: { month: string; startIndex: number; span: number }[] = [];

    if (weeksData.length === 0) return labels;

    let currentMonth = -1;
    let currentStartIndex = 0;
    let currentSpan = 0;

    weeksData.forEach((week, idx) => {
      const month = week.weekStart.getMonth();

      if (month !== currentMonth) {
        // Save previous month if exists
        if (currentMonth !== -1 && currentSpan > 0) {
          labels.push({
            month: MONTHS[currentMonth],
            startIndex: currentStartIndex,
            span: currentSpan,
          });
        }
        currentMonth = month;
        currentStartIndex = idx;
        currentSpan = 1;
      } else {
        currentSpan++;
      }
    });

    // Add last month
    if (currentMonth !== -1 && currentSpan > 0) {
      labels.push({
        month: MONTHS[currentMonth],
        startIndex: currentStartIndex,
        span: currentSpan,
      });
    }

    return labels;
  }, [weeksData]);

  // Handle mouse events for tooltip
  const handleMouseEnter = useCallback(
    (day: DayData, event: React.MouseEvent<HTMLDivElement>) => {
      setHoveredDay(day);
      const rect = event.currentTarget.getBoundingClientRect();
      setTooltipPos({
        x: rect.left + rect.width / 2,
        y: rect.top,
      });
    },
    []
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredDay(null);
    setTooltipPos(null);
  }, []);

  // Cell size and spacing
  const cellSize = 12;
  const cellGap = 3;

  // Calculate if we need compact mode for smaller time ranges
  const isCompact = timeRange === 'day' || timeRange === 'week';

  return (
    <div
      className="p-4 rounded-lg"
      style={{ backgroundColor: theme.colors.bgMain }}
      role="figure"
      aria-label={`Activity heatmap showing ${metricMode === 'count' ? 'query activity' : 'duration'} over time. Calendar grid with days of week on Y-axis and weeks on X-axis.`}
    >
      {/* Header with title and metric toggle */}
      <div className="flex items-center justify-between mb-4">
        <h3
          className="text-sm font-medium"
          style={{ color: theme.colors.textMain }}
        >
          Activity Heatmap
        </h3>
        <div className="flex items-center gap-2">
          <span
            className="text-xs"
            style={{ color: theme.colors.textDim }}
          >
            Show:
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
                  metricMode === 'count'
                    ? `${theme.colors.accent}20`
                    : 'transparent',
                color:
                  metricMode === 'count'
                    ? theme.colors.accent
                    : theme.colors.textDim,
              }}
              aria-pressed={metricMode === 'count'}
              aria-label="Show query count"
            >
              Count
            </button>
            <button
              onClick={() => setMetricMode('duration')}
              className="px-2 py-1 text-xs transition-colors"
              style={{
                backgroundColor:
                  metricMode === 'duration'
                    ? `${theme.colors.accent}20`
                    : 'transparent',
                color:
                  metricMode === 'duration'
                    ? theme.colors.accent
                    : theme.colors.textDim,
                borderLeft: `1px solid ${theme.colors.border}`,
              }}
              aria-pressed={metricMode === 'duration'}
              aria-label="Show total duration"
            >
              Duration
            </button>
          </div>
        </div>
      </div>

      {/* Heatmap container with horizontal scroll for large ranges */}
      <div className="relative">
        <div
          className={`${
            isCompact ? 'flex justify-center' : 'overflow-x-auto'
          }`}
        >
          <div className="inline-flex flex-col">
            {/* Month labels row */}
            {monthLabels.length > 1 && (
              <div
                className="flex mb-1"
                style={{ paddingLeft: 28 }} // Offset for day labels
              >
                {monthLabels.map((label, idx) => (
                  <div
                    key={`${label.month}-${idx}`}
                    className="text-xs"
                    style={{
                      color: theme.colors.textDim,
                      width: label.span * (cellSize + cellGap),
                      minWidth: label.span * (cellSize + cellGap),
                    }}
                  >
                    {label.span >= 3 ? label.month : ''}
                  </div>
                ))}
              </div>
            )}

            {/* Main grid: days (Y) x weeks (X) */}
            <div className="flex">
              {/* Day labels column */}
              <div
                className="flex flex-col justify-between pr-2"
                style={{ height: 7 * (cellSize + cellGap) - cellGap }}
              >
                {DAYS_OF_WEEK.map((day, idx) => (
                  <span
                    key={day}
                    className="text-xs leading-none flex items-center"
                    style={{
                      color: theme.colors.textDim,
                      height: cellSize,
                      // Only show Mon, Wed, Fri for compact display
                      visibility: idx % 2 === 1 ? 'visible' : 'hidden',
                    }}
                  >
                    {day}
                  </span>
                ))}
              </div>

              {/* Weeks grid */}
              <div className="flex gap-[3px]">
                {weeksData.map((week, weekIdx) => (
                  <div
                    key={week.weekStart.toISOString()}
                    className="flex flex-col gap-[3px]"
                  >
                    {/* Pad the first week if it doesn't start on Sunday */}
                    {weekIdx === 0 &&
                      week.days.length < 7 &&
                      Array.from({
                        length: 7 - week.days.length,
                      }).map((_, idx) => (
                        <div
                          key={`pad-${idx}`}
                          style={{
                            width: cellSize,
                            height: cellSize,
                            visibility: 'hidden',
                          }}
                        />
                      ))}
                    {week.days.map((day) => (
                      <div
                        key={day.dateString}
                        className="rounded-sm cursor-default"
                        style={{
                          width: cellSize,
                          height: cellSize,
                          backgroundColor: getIntensityColor(
                            day.intensity,
                            theme,
                            colorBlindMode
                          ),
                          outline:
                            hoveredDay?.dateString === day.dateString
                              ? `2px solid ${theme.colors.accent}`
                              : 'none',
                          outlineOffset: -1,
                          transition: 'background-color 0.5s cubic-bezier(0.4, 0, 0.2, 1), outline 0.15s ease',
                        }}
                        onMouseEnter={(e) => handleMouseEnter(day, e)}
                        onMouseLeave={handleMouseLeave}
                        role="gridcell"
                        aria-label={`${format(day.date, 'EEEE, MMM d')}: ${day.count} ${day.count === 1 ? 'query' : 'queries'}${day.duration > 0 ? `, ${formatDuration(day.duration)}` : ''}`}
                        tabIndex={0}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* Legend */}
            <div className="flex items-center justify-end gap-2 mt-3" role="list" aria-label="Activity intensity scale from less to more">
              <span
                className="text-xs"
                style={{ color: theme.colors.textDim }}
                aria-hidden="true"
              >
                Less
              </span>
              {[0, 1, 2, 3, 4].map((level) => (
                <div
                  key={level}
                  className="rounded-sm"
                  style={{
                    width: cellSize,
                    height: cellSize,
                    backgroundColor: getIntensityColor(level, theme, colorBlindMode),
                  }}
                  role="listitem"
                  aria-label={`Intensity level ${level}: ${level === 0 ? 'No activity' : level === 1 ? 'Low' : level === 2 ? 'Medium-low' : level === 3 ? 'Medium-high' : 'High'} activity`}
                />
              ))}
              <span
                className="text-xs"
                style={{ color: theme.colors.textDim }}
                aria-hidden="true"
              >
                More
              </span>
            </div>
          </div>
        </div>

        {/* Tooltip */}
        {hoveredDay && tooltipPos && (
          <div
            className="fixed z-50 px-2 py-1.5 rounded text-xs whitespace-nowrap pointer-events-none shadow-lg"
            style={{
              left: tooltipPos.x,
              top: tooltipPos.y - 8,
              transform: 'translate(-50%, -100%)',
              backgroundColor: theme.colors.bgActivity,
              color: theme.colors.textMain,
              border: `1px solid ${theme.colors.border}`,
            }}
          >
            <div className="font-medium mb-0.5">
              {format(hoveredDay.date, 'EEEE, MMM d, yyyy')}
            </div>
            <div style={{ color: theme.colors.textDim }}>
              {hoveredDay.count} {hoveredDay.count === 1 ? 'query' : 'queries'}
              {hoveredDay.duration > 0 && (
                <span> • {formatDuration(hoveredDay.duration)}</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ActivityHeatmap;
