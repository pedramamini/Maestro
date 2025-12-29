/**
 * UsageDashboardModal
 *
 * Main modal container for the Usage Dashboard with Recharts visualizations.
 * Displays AI usage patterns across all sessions and agents with time-based filtering.
 *
 * Features:
 * - Time range selector (Day, Week, Month, Year, All Time)
 * - View mode tabs for different visualization focuses
 * - Summary stats cards
 * - Activity heatmap, agent comparison, source distribution charts
 * - Responsive grid layout (2 columns on wide screens, 1 on narrow)
 * - Theme-aware styling
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { X, BarChart3, Calendar, Download, RefreshCw, Database } from 'lucide-react';
import { SummaryCards } from './SummaryCards';
import { ActivityHeatmap } from './ActivityHeatmap';
import { AgentComparisonChart } from './AgentComparisonChart';
import { SourceDistributionChart } from './SourceDistributionChart';
import { DurationTrendsChart } from './DurationTrendsChart';
import { AutoRunStats } from './AutoRunStats';
import { EmptyState } from './EmptyState';
import { DashboardSkeleton } from './ChartSkeletons';
import { ChartErrorBoundary } from './ChartErrorBoundary';
import type { Theme } from '../../types';
import { useLayerStack } from '../../contexts/LayerStackContext';
import { MODAL_PRIORITIES } from '../../constants/modalPriorities';
import { getRendererPerfMetrics } from '../../utils/logger';
import { PERFORMANCE_THRESHOLDS } from '../../../shared/performance-metrics';

// Section IDs for keyboard navigation
const OVERVIEW_SECTIONS = ['summary-cards', 'agent-comparison', 'source-distribution', 'activity-heatmap', 'duration-trends'] as const;
const AGENTS_SECTIONS = ['agent-comparison'] as const;
const ACTIVITY_SECTIONS = ['activity-heatmap', 'duration-trends'] as const;
const AUTORUN_SECTIONS = ['autorun-stats'] as const;

type SectionId = typeof OVERVIEW_SECTIONS[number] | typeof AGENTS_SECTIONS[number] | typeof ACTIVITY_SECTIONS[number] | typeof AUTORUN_SECTIONS[number];

// Performance metrics instance for dashboard
const perfMetrics = getRendererPerfMetrics('UsageDashboard');

// Stats time range type matching the backend API
type StatsTimeRange = 'day' | 'week' | 'month' | 'year' | 'all';

// Aggregation data shape from the stats API
interface StatsAggregation {
  totalQueries: number;
  totalDuration: number;
  avgDuration: number;
  byAgent: Record<string, { count: number; duration: number }>;
  bySource: { user: number; auto: number };
  byDay: Array<{ date: string; count: number; duration: number }>;
}

// View mode options for the dashboard
type ViewMode = 'overview' | 'agents' | 'activity' | 'autorun';

interface UsageDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: Theme;
  /** Enable colorblind-friendly colors for charts */
  colorBlindMode?: boolean;
}

/**
 * Format database size in human-readable format
 * @param bytes - Size in bytes
 * @returns Formatted string (e.g., "1.5 MB")
 */
function formatDatabaseSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  } else if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  } else {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
}

// Time range options for the dropdown
const TIME_RANGE_OPTIONS: { value: StatsTimeRange; label: string }[] = [
  { value: 'day', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'year', label: 'This Year' },
  { value: 'all', label: 'All Time' },
];

// View mode tabs
const VIEW_MODE_TABS: { value: ViewMode; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'agents', label: 'Agents' },
  { value: 'activity', label: 'Activity' },
  { value: 'autorun', label: 'Auto Run' },
];

export function UsageDashboardModal({
  isOpen,
  onClose,
  theme,
  colorBlindMode = false,
}: UsageDashboardModalProps) {
  const [timeRange, setTimeRange] = useState<StatsTimeRange>('week');
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [data, setData] = useState<StatsAggregation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const [showNewDataIndicator, setShowNewDataIndicator] = useState(false);
  const [databaseSize, setDatabaseSize] = useState<number | null>(null);
  const [focusedSection, setFocusedSection] = useState<SectionId | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Map<SectionId, HTMLDivElement>>(new Map());
  const { registerLayer, unregisterLayer } = useLayerStack();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Register with layer stack for proper Escape handling
  useEffect(() => {
    if (isOpen) {
      const id = registerLayer({
        type: 'modal',
        priority: MODAL_PRIORITIES.USAGE_DASHBOARD,
        blocksLowerLayers: true,
        capturesFocus: true,
        focusTrap: 'lenient',
        onEscape: () => onCloseRef.current(),
      });
      return () => unregisterLayer(id);
    }
  }, [isOpen, registerLayer, unregisterLayer]);

  // Fetch stats data when range changes
  const fetchStats = useCallback(async (showRefresh = false) => {
    const fetchStart = perfMetrics.start();

    if (showRefresh) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      // Fetch stats and database size in parallel
      const [stats, dbSize] = await Promise.all([
        window.maestro.stats.getAggregation(timeRange),
        window.maestro.stats.getDatabaseSize(),
      ]);
      setData(stats);
      setDatabaseSize(dbSize);

      // Log fetch performance
      const fetchDuration = perfMetrics.end(fetchStart, 'fetchStats', {
        timeRange,
        totalQueries: stats?.totalQueries,
        isRefresh: showRefresh,
      });

      // Warn if fetch is slow
      if (fetchDuration > PERFORMANCE_THRESHOLDS.DASHBOARD_LOAD) {
        console.warn(
          `[UsageDashboard] fetchStats took ${fetchDuration.toFixed(0)}ms (threshold: ${PERFORMANCE_THRESHOLDS.DASHBOARD_LOAD}ms)`,
          { timeRange, totalQueries: stats?.totalQueries }
        );
      }
    } catch (err) {
      console.error('Failed to fetch usage stats:', err);
      setError(err instanceof Error ? err.message : 'Failed to load stats');
      perfMetrics.end(fetchStart, 'fetchStats:error', { timeRange, error: String(err) });
    } finally {
      setLoading(false);
      if (showRefresh) {
        // Keep refresh spinner visible briefly for visual feedback
        setTimeout(() => setIsRefreshing(false), 300);
        // Show "new data" indicator for real-time updates
        setShowNewDataIndicator(true);
        setTimeout(() => setShowNewDataIndicator(false), 3000);
      }
    }
  }, [timeRange]);

  // Initial fetch and real-time updates subscription
  useEffect(() => {
    if (!isOpen) return;

    fetchStats();

    // Subscribe to stats updates with debounce
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = window.maestro.stats.onStatsUpdate(() => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        fetchStats(true);
      }, 1000); // 1 second debounce
    });

    return () => {
      unsubscribe();
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [isOpen, fetchStats]);

  // Focus container on open
  useEffect(() => {
    if (isOpen) {
      containerRef.current?.focus();
    }
  }, [isOpen]);

  // Track container width for responsive layout
  useEffect(() => {
    if (!isOpen || !contentRef.current) return;

    const updateWidth = () => {
      if (contentRef.current) {
        setContainerWidth(contentRef.current.offsetWidth);
      }
    };

    // Initial measurement
    updateWidth();

    // Use ResizeObserver to detect width changes
    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(contentRef.current);

    return () => resizeObserver.disconnect();
  }, [isOpen]);

  // Determine responsive breakpoints based on container width
  const layout = useMemo(() => {
    // Breakpoints: narrow < 600px, medium 600-900px, wide > 900px
    const isNarrow = containerWidth > 0 && containerWidth < 600;
    const isMedium = containerWidth >= 600 && containerWidth < 900;
    const isWide = containerWidth >= 900;

    return {
      isNarrow,
      isMedium,
      isWide,
      // Chart grid: 1 col on narrow, 2 cols on medium/wide
      chartGridCols: isNarrow ? 1 : 2,
      // Summary cards: 2 cols on narrow, 3 on medium, 5 on wide
      summaryCardsCols: isNarrow ? 2 : isMedium ? 3 : 5,
      // AutoRun stats: 2 cols on narrow, 3 on medium, 6 on wide
      autoRunStatsCols: isNarrow ? 2 : isMedium ? 3 : 6,
    };
  }, [containerWidth]);

  // Get sections for current view mode
  const currentSections = useMemo((): readonly SectionId[] => {
    switch (viewMode) {
      case 'overview':
        return OVERVIEW_SECTIONS;
      case 'agents':
        return AGENTS_SECTIONS;
      case 'activity':
        return ACTIVITY_SECTIONS;
      case 'autorun':
        return AUTORUN_SECTIONS;
      default:
        return OVERVIEW_SECTIONS;
    }
  }, [viewMode]);

  // Get section label for accessibility
  const getSectionLabel = useCallback((sectionId: SectionId): string => {
    const labels: Record<SectionId, string> = {
      'summary-cards': 'Summary Cards',
      'agent-comparison': 'Agent Comparison Chart',
      'source-distribution': 'Source Distribution Chart',
      'activity-heatmap': 'Activity Heatmap',
      'duration-trends': 'Duration Trends Chart',
      'autorun-stats': 'Auto Run Statistics',
    };
    return labels[sectionId] || sectionId;
  }, []);

  // Navigate to a section
  const navigateToSection = useCallback((sectionId: SectionId) => {
    setFocusedSection(sectionId);
    const sectionEl = sectionRefs.current.get(sectionId);
    if (sectionEl) {
      sectionEl.focus();
      sectionEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, []);

  // Handle keyboard navigation for view mode tabs
  const handleTabKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = VIEW_MODE_TABS.findIndex(tab => tab.value === viewMode);

    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      const prevIndex = currentIndex > 0 ? currentIndex - 1 : VIEW_MODE_TABS.length - 1;
      setViewMode(VIEW_MODE_TABS[prevIndex].value);
      setFocusedSection(null);
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      const nextIndex = currentIndex < VIEW_MODE_TABS.length - 1 ? currentIndex + 1 : 0;
      setViewMode(VIEW_MODE_TABS[nextIndex].value);
      setFocusedSection(null);
    } else if (event.key === 'Tab' && !event.shiftKey) {
      // Tab into content area - focus first section
      if (currentSections.length > 0 && data) {
        event.preventDefault();
        navigateToSection(currentSections[0]);
      }
    }
  }, [viewMode, currentSections, data, navigateToSection]);

  // Handle keyboard navigation for chart sections
  const handleSectionKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>, sectionId: SectionId) => {
    const sectionIndex = currentSections.indexOf(sectionId);

    if (event.key === 'ArrowUp' || (event.key === 'Tab' && event.shiftKey)) {
      event.preventDefault();
      if (sectionIndex > 0) {
        // Move to previous section
        navigateToSection(currentSections[sectionIndex - 1]);
      } else {
        // Move focus back to tabs
        setFocusedSection(null);
        tabsRef.current?.focus();
      }
    } else if (event.key === 'ArrowDown' || (event.key === 'Tab' && !event.shiftKey)) {
      event.preventDefault();
      if (sectionIndex < currentSections.length - 1) {
        // Move to next section
        navigateToSection(currentSections[sectionIndex + 1]);
      } else {
        // Stay on last section (or could cycle back to first)
        // For now, just stay on the last section
      }
    } else if (event.key === 'Home') {
      event.preventDefault();
      navigateToSection(currentSections[0]);
    } else if (event.key === 'End') {
      event.preventDefault();
      navigateToSection(currentSections[currentSections.length - 1]);
    }
  }, [currentSections, navigateToSection]);

  // Create a ref callback for section elements
  const setSectionRef = useCallback((sectionId: SectionId) => (el: HTMLDivElement | null) => {
    if (el) {
      sectionRefs.current.set(sectionId, el);
    } else {
      sectionRefs.current.delete(sectionId);
    }
  }, []);

  // Reset focused section when view mode changes
  useEffect(() => {
    setFocusedSection(null);
  }, [viewMode]);

  // Handle export to CSV
  const handleExport = async () => {
    setIsExporting(true);
    try {
      // Show save dialog to let user choose file location
      const defaultFilename = `maestro-usage-${timeRange}-${new Date().toISOString().split('T')[0]}.csv`;
      const filePath = await window.maestro.dialog.saveFile({
        defaultPath: defaultFilename,
        filters: [{ name: 'CSV Files', extensions: ['csv'] }],
        title: 'Export Usage Data',
      });

      // User cancelled the dialog
      if (!filePath) {
        return;
      }

      // Get CSV data and write to selected file
      const csv = await window.maestro.stats.exportCsv(timeRange);
      await window.maestro.fs.writeFile(filePath, csv);
    } catch (err) {
      console.error('Failed to export CSV:', err);
    } finally {
      setIsExporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 modal-overlay flex items-center justify-center z-[9999] animate-in fade-in duration-100"
      onClick={onClose}
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Usage Dashboard"
        className="rounded-xl shadow-2xl border overflow-hidden flex flex-col outline-none"
        style={{
          backgroundColor: theme.colors.bgActivity,
          borderColor: theme.colors.border,
          width: '80vw',
          maxWidth: '1400px',
          height: '85vh',
          maxHeight: '900px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-6 py-4 border-b flex items-center justify-between flex-shrink-0"
          style={{ borderColor: theme.colors.border }}
        >
          <div className="flex items-center gap-3">
            <BarChart3 className="w-5 h-5" style={{ color: theme.colors.accent }} />
            <h2 className="text-lg font-semibold" style={{ color: theme.colors.textMain }}>
              Usage Dashboard
            </h2>
            {/* New Data Indicator - appears briefly when real-time data arrives */}
            {showNewDataIndicator && (
              <div
                className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: `${theme.colors.accent}20`,
                  color: theme.colors.accent,
                  animation: 'pulse-fade 3s ease-out forwards',
                }}
                data-testid="new-data-indicator"
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{
                    backgroundColor: theme.colors.accent,
                    animation: 'pulse-dot 1s ease-in-out 3',
                  }}
                />
                Updated
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Time Range Dropdown */}
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4" style={{ color: theme.colors.textDim }} />
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value as StatsTimeRange)}
                className="px-3 py-1.5 rounded text-sm border cursor-pointer outline-none"
                style={{
                  backgroundColor: theme.colors.bgMain,
                  borderColor: theme.colors.border,
                  color: theme.colors.textMain,
                }}
              >
                {TIME_RANGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Refresh Button */}
            <button
              onClick={() => fetchStats(true)}
              className="p-1.5 rounded hover:bg-opacity-10 transition-colors"
              style={{ color: theme.colors.textDim }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = `${theme.colors.accent}20`}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              title="Refresh"
              disabled={isRefreshing}
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>

            {/* Export Button */}
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm hover:bg-opacity-10 transition-colors"
              style={{
                color: theme.colors.textMain,
                backgroundColor: `${theme.colors.accent}15`,
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = `${theme.colors.accent}25`}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = `${theme.colors.accent}15`}
              disabled={isExporting}
            >
              <Download className={`w-4 h-4 ${isExporting ? 'animate-pulse' : ''}`} />
              Export CSV
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-opacity-10 transition-colors"
              style={{ color: theme.colors.textDim }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = `${theme.colors.accent}20`}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              title="Close (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* View Mode Tabs */}
        <div
          ref={tabsRef}
          className="px-6 py-2 border-b flex items-center gap-1 flex-shrink-0 outline-none"
          style={{ borderColor: theme.colors.border }}
          role="tablist"
          aria-label="Dashboard view modes"
          tabIndex={0}
          onKeyDown={handleTabKeyDown}
          data-testid="view-mode-tabs"
        >
          {VIEW_MODE_TABS.map((tab, index) => (
            <button
              key={tab.value}
              onClick={() => setViewMode(tab.value)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors outline-none"
              style={{
                backgroundColor: viewMode === tab.value ? `${theme.colors.accent}20` : 'transparent',
                color: viewMode === tab.value ? theme.colors.accent : theme.colors.textDim,
              }}
              onMouseEnter={(e) => {
                if (viewMode !== tab.value) {
                  e.currentTarget.style.backgroundColor = `${theme.colors.accent}10`;
                }
              }}
              onMouseLeave={(e) => {
                if (viewMode !== tab.value) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
              role="tab"
              aria-selected={viewMode === tab.value}
              aria-controls={`tabpanel-${tab.value}`}
              id={`tab-${tab.value}`}
              tabIndex={-1}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Main Content */}
        <div ref={contentRef} className="flex-1 overflow-y-auto scrollbar-thin p-6">
          {loading && !data ? (
            <DashboardSkeleton
              theme={theme}
              viewMode={viewMode}
              chartGridCols={layout.chartGridCols}
              summaryCardsCols={layout.summaryCardsCols}
              autoRunStatsCols={layout.autoRunStatsCols}
            />
          ) : error ? (
            <div
              className="h-full flex flex-col items-center justify-center gap-4"
              style={{ color: theme.colors.textDim }}
            >
              <p>Failed to load usage data</p>
              <button
                onClick={() => fetchStats()}
                className="px-4 py-2 rounded text-sm"
                style={{
                  backgroundColor: theme.colors.accent,
                  color: theme.colors.bgMain,
                }}
              >
                Retry
              </button>
            </div>
          ) : !data || (data.totalQueries === 0 && data.bySource.user === 0 && data.bySource.auto === 0) ? (
            /* Empty State Component */
            <EmptyState theme={theme} />
          ) : (
            <div
              key={viewMode} // Re-mount content when view mode changes to trigger animations
              className="space-y-6 dashboard-content-enter"
              data-testid="usage-dashboard-content"
              role="tabpanel"
              id={`tabpanel-${viewMode}`}
              aria-labelledby={`tab-${viewMode}`}
            >
              {/* View-specific content based on viewMode */}
              {viewMode === 'overview' && (
                <>
                  {/* Summary Stats Cards - Horizontal row at top, responsive */}
                  <div
                    ref={setSectionRef('summary-cards')}
                    tabIndex={0}
                    role="region"
                    aria-label={getSectionLabel('summary-cards')}
                    onKeyDown={(e) => handleSectionKeyDown(e, 'summary-cards')}
                    className="outline-none rounded-lg transition-shadow dashboard-section-enter"
                    style={{
                      boxShadow: focusedSection === 'summary-cards' ? `0 0 0 2px ${theme.colors.accent}` : 'none',
                      animationDelay: '0ms',
                    }}
                    data-testid="section-summary-cards"
                  >
                    <ChartErrorBoundary theme={theme} chartName="Summary Cards">
                      <SummaryCards
                        data={data}
                        theme={theme}
                        columns={layout.summaryCardsCols}
                      />
                    </ChartErrorBoundary>
                  </div>

                  {/* Charts Grid - 2 columns on wide, 1 on narrow */}
                  <div
                    className="grid gap-6 dashboard-section-enter"
                    style={{
                      gridTemplateColumns: `repeat(${layout.chartGridCols}, minmax(0, 1fr))`,
                      animationDelay: '100ms',
                    }}
                  >
                    {/* Agent Comparison Chart */}
                    <div
                      ref={setSectionRef('agent-comparison')}
                      tabIndex={0}
                      role="region"
                      aria-label={getSectionLabel('agent-comparison')}
                      onKeyDown={(e) => handleSectionKeyDown(e, 'agent-comparison')}
                      className="outline-none rounded-lg transition-shadow"
                      style={{
                        minHeight: '300px',
                        boxShadow: focusedSection === 'agent-comparison' ? `0 0 0 2px ${theme.colors.accent}` : 'none',
                      }}
                      data-testid="section-agent-comparison"
                    >
                      <ChartErrorBoundary theme={theme} chartName="Agent Comparison">
                        <AgentComparisonChart data={data} theme={theme} colorBlindMode={colorBlindMode} />
                      </ChartErrorBoundary>
                    </div>

                    {/* Source Distribution Chart */}
                    <div
                      ref={setSectionRef('source-distribution')}
                      tabIndex={0}
                      role="region"
                      aria-label={getSectionLabel('source-distribution')}
                      onKeyDown={(e) => handleSectionKeyDown(e, 'source-distribution')}
                      className="outline-none rounded-lg transition-shadow"
                      style={{
                        minHeight: '300px',
                        boxShadow: focusedSection === 'source-distribution' ? `0 0 0 2px ${theme.colors.accent}` : 'none',
                      }}
                      data-testid="section-source-distribution"
                    >
                      <ChartErrorBoundary theme={theme} chartName="Source Distribution">
                        <SourceDistributionChart data={data} theme={theme} colorBlindMode={colorBlindMode} />
                      </ChartErrorBoundary>
                    </div>
                  </div>

                  {/* Activity Heatmap - Full width */}
                  <div
                    ref={setSectionRef('activity-heatmap')}
                    tabIndex={0}
                    role="region"
                    aria-label={getSectionLabel('activity-heatmap')}
                    onKeyDown={(e) => handleSectionKeyDown(e, 'activity-heatmap')}
                    className="outline-none rounded-lg transition-shadow dashboard-section-enter"
                    style={{
                      minHeight: '200px',
                      boxShadow: focusedSection === 'activity-heatmap' ? `0 0 0 2px ${theme.colors.accent}` : 'none',
                      animationDelay: '200ms',
                    }}
                    data-testid="section-activity-heatmap"
                  >
                    <ChartErrorBoundary theme={theme} chartName="Activity Heatmap">
                      <ActivityHeatmap
                        data={data}
                        timeRange={timeRange}
                        theme={theme}
                        colorBlindMode={colorBlindMode}
                      />
                    </ChartErrorBoundary>
                  </div>

                  {/* Duration Trends Chart - Full width */}
                  <div
                    ref={setSectionRef('duration-trends')}
                    tabIndex={0}
                    role="region"
                    aria-label={getSectionLabel('duration-trends')}
                    onKeyDown={(e) => handleSectionKeyDown(e, 'duration-trends')}
                    className="outline-none rounded-lg transition-shadow dashboard-section-enter"
                    style={{
                      minHeight: '280px',
                      boxShadow: focusedSection === 'duration-trends' ? `0 0 0 2px ${theme.colors.accent}` : 'none',
                      animationDelay: '300ms',
                    }}
                    data-testid="section-duration-trends"
                  >
                    <ChartErrorBoundary theme={theme} chartName="Duration Trends">
                      <DurationTrendsChart
                        data={data}
                        timeRange={timeRange}
                        theme={theme}
                        colorBlindMode={colorBlindMode}
                      />
                    </ChartErrorBoundary>
                  </div>
                </>
              )}

              {viewMode === 'agents' && (
                <>
                  {/* Agent-focused view */}
                  <div
                    ref={setSectionRef('agent-comparison')}
                    tabIndex={0}
                    role="region"
                    aria-label={getSectionLabel('agent-comparison')}
                    onKeyDown={(e) => handleSectionKeyDown(e, 'agent-comparison')}
                    className="outline-none rounded-lg transition-shadow dashboard-section-enter"
                    style={{
                      minHeight: '400px',
                      boxShadow: focusedSection === 'agent-comparison' ? `0 0 0 2px ${theme.colors.accent}` : 'none',
                      animationDelay: '0ms',
                    }}
                    data-testid="section-agent-comparison"
                  >
                    <ChartErrorBoundary theme={theme} chartName="Agent Comparison">
                      <AgentComparisonChart data={data} theme={theme} colorBlindMode={colorBlindMode} />
                    </ChartErrorBoundary>
                  </div>
                </>
              )}

              {viewMode === 'activity' && (
                <>
                  {/* Activity-focused view */}
                  <div
                    ref={setSectionRef('activity-heatmap')}
                    tabIndex={0}
                    role="region"
                    aria-label={getSectionLabel('activity-heatmap')}
                    onKeyDown={(e) => handleSectionKeyDown(e, 'activity-heatmap')}
                    className="outline-none rounded-lg transition-shadow dashboard-section-enter"
                    style={{
                      minHeight: '300px',
                      boxShadow: focusedSection === 'activity-heatmap' ? `0 0 0 2px ${theme.colors.accent}` : 'none',
                      animationDelay: '0ms',
                    }}
                    data-testid="section-activity-heatmap"
                  >
                    <ChartErrorBoundary theme={theme} chartName="Activity Heatmap">
                      <ActivityHeatmap
                        data={data}
                        timeRange={timeRange}
                        theme={theme}
                        colorBlindMode={colorBlindMode}
                      />
                    </ChartErrorBoundary>
                  </div>
                  <div
                    ref={setSectionRef('duration-trends')}
                    tabIndex={0}
                    role="region"
                    aria-label={getSectionLabel('duration-trends')}
                    onKeyDown={(e) => handleSectionKeyDown(e, 'duration-trends')}
                    className="outline-none rounded-lg transition-shadow dashboard-section-enter"
                    style={{
                      minHeight: '280px',
                      boxShadow: focusedSection === 'duration-trends' ? `0 0 0 2px ${theme.colors.accent}` : 'none',
                      animationDelay: '100ms',
                    }}
                    data-testid="section-duration-trends"
                  >
                    <ChartErrorBoundary theme={theme} chartName="Duration Trends">
                      <DurationTrendsChart
                        data={data}
                        timeRange={timeRange}
                        theme={theme}
                        colorBlindMode={colorBlindMode}
                      />
                    </ChartErrorBoundary>
                  </div>
                </>
              )}

              {viewMode === 'autorun' && (
                <>
                  {/* Auto Run-focused view */}
                  <div
                    ref={setSectionRef('autorun-stats')}
                    tabIndex={0}
                    role="region"
                    aria-label={getSectionLabel('autorun-stats')}
                    onKeyDown={(e) => handleSectionKeyDown(e, 'autorun-stats')}
                    className="outline-none rounded-lg transition-shadow dashboard-section-enter"
                    style={{
                      boxShadow: focusedSection === 'autorun-stats' ? `0 0 0 2px ${theme.colors.accent}` : 'none',
                      animationDelay: '0ms',
                    }}
                    data-testid="section-autorun-stats"
                  >
                    <ChartErrorBoundary theme={theme} chartName="Auto Run Stats">
                      <AutoRunStats
                        timeRange={timeRange}
                        theme={theme}
                        columns={layout.autoRunStatsCols}
                      />
                    </ChartErrorBoundary>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="px-6 py-3 border-t flex items-center justify-between text-xs flex-shrink-0"
          style={{
            borderColor: theme.colors.border,
            color: theme.colors.textDim,
          }}
        >
          <div className="flex items-center gap-4">
            <span>
              {data && data.totalQueries > 0
                ? `Showing ${TIME_RANGE_OPTIONS.find(o => o.value === timeRange)?.label.toLowerCase()} data`
                : 'No data for selected time range'}
            </span>
            {/* Database size indicator */}
            {databaseSize !== null && (
              <span
                className="flex items-center gap-1"
                style={{ opacity: 0.7 }}
                title="Stats database size"
                data-testid="database-size-indicator"
              >
                <Database className="w-3 h-3" />
                {formatDatabaseSize(databaseSize)}
              </span>
            )}
          </div>
          <span style={{ opacity: 0.7 }}>Press Esc to close</span>
        </div>
      </div>
    </div>
  );
}
