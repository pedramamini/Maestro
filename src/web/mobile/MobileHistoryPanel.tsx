/**
 * MobileHistoryPanel component for Maestro mobile web interface
 *
 * A full-screen view displaying history entries from the desktop app.
 * This view shows all AUTO, USER, and LOOP entries in a list format, with the ability
 * to tap on an entry to see full details.
 *
 * Features:
 * - List view of all history entries
 * - Filter by AUTO/USER/LOOP type
 * - Tap to view full details
 * - Read-only (no resume functionality on mobile)
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useThemeColors } from '../components/ThemeProvider';
import { triggerHaptic, HAPTIC_PATTERNS } from './constants';
import { buildApiUrl } from '../utils/config';
import { webLogger } from '../utils/logger';

// History entry type matching the desktop type
export type HistoryEntryType = 'AUTO' | 'USER' | 'LOOP';

export interface HistoryEntry {
  id: string;
  type: HistoryEntryType;
  timestamp: number;
  summary: string;
  fullResponse?: string;
  claudeSessionId?: string;
  projectPath: string;
  sessionId?: string;
  contextUsage?: number;
  usageStats?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
    totalCostUsd: number;
    contextWindow: number;
  };
  success?: boolean;
  elapsedTimeMs?: number;
}

/**
 * Format timestamp for display
 */
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else {
    return (
      date.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
      ' ' +
      date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );
  }
}

/**
 * Format elapsed time in human-readable format
 */
function formatElapsedTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

/**
 * History entry card component
 */
interface HistoryCardProps {
  entry: HistoryEntry;
  onSelect: (entry: HistoryEntry) => void;
}

function HistoryCard({ entry, onSelect }: HistoryCardProps) {
  const colors = useThemeColors();

  // Get pill color based on type
  const getPillColor = () => {
    if (entry.type === 'AUTO') {
      return { bg: colors.warning + '20', text: colors.warning, border: colors.warning + '40' };
    } else if (entry.type === 'LOOP') {
      return { bg: colors.success + '20', text: colors.success, border: colors.success + '40' };
    }
    return { bg: colors.accent + '20', text: colors.accent, border: colors.accent + '40' };
  };

  const pillColors = getPillColor();

  const handleClick = useCallback(() => {
    triggerHaptic(HAPTIC_PATTERNS.tap);
    onSelect(entry);
  }, [entry, onSelect]);

  return (
    <button
      onClick={handleClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '14px 16px',
        borderRadius: '12px',
        border: `1px solid ${colors.border}`,
        backgroundColor: colors.bgSidebar,
        color: colors.textMain,
        width: '100%',
        textAlign: 'left',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        touchAction: 'manipulation',
        WebkitTapHighlightColor: 'transparent',
        outline: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
      aria-label={`${entry.type} entry from ${formatTime(entry.timestamp)}`}
    >
      {/* Top row: Type pill, success indicator (for AUTO), and timestamp */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          width: '100%',
        }}
      >
        {/* Success/Failure Indicator for AUTO entries */}
        {entry.type === 'AUTO' && entry.success !== undefined && (
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              backgroundColor: entry.success ? colors.success + '20' : colors.error + '20',
              border: `1px solid ${entry.success ? colors.success + '40' : colors.error + '40'}`,
              flexShrink: 0,
            }}
            title={entry.success ? 'Task completed successfully' : 'Task failed'}
          >
            {entry.success ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={colors.success} strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={colors.error} strokeWidth="3">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            )}
          </span>
        )}

        {/* Type pill */}
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '3px 8px',
            borderRadius: '12px',
            backgroundColor: pillColors.bg,
            color: pillColors.text,
            border: `1px solid ${pillColors.border}`,
            fontSize: '10px',
            fontWeight: 600,
            textTransform: 'uppercase',
            flexShrink: 0,
          }}
        >
          {entry.type === 'AUTO' ? (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 8V4H8" />
              <rect x="8" y="8" width="8" height="12" rx="1" />
              <path d="M12 8v12" />
            </svg>
          ) : entry.type === 'LOOP' ? (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          )}
          {entry.type}
        </span>

        {/* Claude session ID octet (if available) */}
        {entry.claudeSessionId && (
          <span
            style={{
              fontSize: '10px',
              color: colors.accent,
              fontFamily: 'monospace',
              backgroundColor: colors.accent + '20',
              padding: '2px 6px',
              borderRadius: '4px',
              flexShrink: 0,
            }}
          >
            {entry.claudeSessionId.split('-')[0].toUpperCase()}
          </span>
        )}

        <div style={{ flex: 1 }} />

        {/* Timestamp */}
        <span
          style={{
            fontSize: '11px',
            color: colors.textDim,
            flexShrink: 0,
          }}
        >
          {formatTime(entry.timestamp)}
        </span>
      </div>

      {/* Summary - 3 lines max */}
      <p
        style={{
          fontSize: '13px',
          lineHeight: 1.5,
          color: colors.textMain,
          margin: 0,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical' as const,
        }}
      >
        {entry.summary || 'No summary available'}
      </p>

      {/* Bottom row: Elapsed time and cost (if available) */}
      {(entry.elapsedTimeMs !== undefined || entry.usageStats?.totalCostUsd) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            fontSize: '11px',
            color: colors.textDim,
          }}
        >
          {entry.elapsedTimeMs !== undefined && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              {formatElapsedTime(entry.elapsedTimeMs)}
            </span>
          )}
          {entry.usageStats?.totalCostUsd !== undefined && entry.usageStats.totalCostUsd > 0 && (
            <span
              style={{
                color: '#22c55e',
                fontFamily: 'monospace',
              }}
            >
              ${entry.usageStats.totalCostUsd.toFixed(2)}
            </span>
          )}
        </div>
      )}
    </button>
  );
}

/**
 * History detail view component (full-screen)
 */
interface HistoryDetailViewProps {
  entry: HistoryEntry;
  onClose: () => void;
}

function HistoryDetailView({ entry, onClose }: HistoryDetailViewProps) {
  const colors = useThemeColors();

  // Get pill color based on type
  const getPillColor = () => {
    if (entry.type === 'AUTO') {
      return { bg: colors.warning + '20', text: colors.warning, border: colors.warning + '40' };
    } else if (entry.type === 'LOOP') {
      return { bg: colors.success + '20', text: colors.success, border: colors.success + '40' };
    }
    return { bg: colors.accent + '20', text: colors.accent, border: colors.accent + '40' };
  };

  const pillColors = getPillColor();

  // Clean up the response for display - remove ANSI codes
  const rawResponse = entry.fullResponse || entry.summary || '';
  const cleanResponse = rawResponse.replace(/\x1b\[[0-9;]*m/g, '');

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleClose = useCallback(() => {
    triggerHaptic(HAPTIC_PATTERNS.tap);
    onClose();
  }, [onClose]);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: colors.bgMain,
        zIndex: 210, // Higher than MobileHistoryPanel (200) to overlay it
        display: 'flex',
        flexDirection: 'column',
        animation: 'slideUp 0.25s ease-out',
      }}
    >
      {/* Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          paddingTop: 'max(12px, env(safe-area-inset-top))',
          borderBottom: `1px solid ${colors.border}`,
          backgroundColor: colors.bgSidebar,
          minHeight: '56px',
          flexShrink: 0,
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
          {/* Success/Failure Indicator for AUTO entries */}
          {entry.type === 'AUTO' && entry.success !== undefined && (
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                backgroundColor: entry.success ? colors.success + '20' : colors.error + '20',
                border: `1px solid ${entry.success ? colors.success + '40' : colors.error + '40'}`,
                flexShrink: 0,
              }}
            >
              {entry.success ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={colors.success} strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={colors.error} strokeWidth="3">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              )}
            </span>
          )}

          {/* Type pill */}
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 10px',
              borderRadius: '12px',
              backgroundColor: pillColors.bg,
              color: pillColors.text,
              border: `1px solid ${pillColors.border}`,
              fontSize: '11px',
              fontWeight: 600,
              textTransform: 'uppercase',
              flexShrink: 0,
            }}
          >
            {entry.type}
          </span>

          {/* Claude session ID */}
          {entry.claudeSessionId && (
            <span
              style={{
                fontSize: '11px',
                color: colors.accent,
                fontFamily: 'monospace',
                backgroundColor: colors.accent + '20',
                padding: '3px 8px',
                borderRadius: '6px',
                flexShrink: 0,
              }}
            >
              {entry.claudeSessionId.split('-')[0].toUpperCase()}
            </span>
          )}

          {/* Timestamp */}
          <span
            style={{
              fontSize: '12px',
              color: colors.textDim,
            }}
          >
            {formatTime(entry.timestamp)}
          </span>
        </div>

        <button
          onClick={handleClose}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            backgroundColor: colors.bgMain,
            border: `1px solid ${colors.border}`,
            color: colors.textMain,
            fontSize: '14px',
            fontWeight: 500,
            cursor: 'pointer',
            touchAction: 'manipulation',
            WebkitTapHighlightColor: 'transparent',
            flexShrink: 0,
          }}
          aria-label="Close detail view"
        >
          Done
        </button>
      </header>

      {/* Stats panel (if available) */}
      {(entry.usageStats || entry.contextUsage !== undefined || entry.elapsedTimeMs) && (
        <div
          style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${colors.border}`,
            backgroundColor: colors.bgSidebar,
            display: 'flex',
            flexWrap: 'wrap',
            gap: '16px',
            flexShrink: 0,
          }}
        >
          {/* Context usage */}
          {entry.contextUsage !== undefined && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '10px', color: colors.textDim, fontWeight: 600, textTransform: 'uppercase' }}>
                Context
              </span>
              <span
                style={{
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  fontWeight: 600,
                  color: entry.contextUsage >= 90 ? colors.error : entry.contextUsage >= 70 ? colors.warning : colors.success,
                }}
              >
                {entry.contextUsage}%
              </span>
            </div>
          )}

          {/* Elapsed time */}
          {entry.elapsedTimeMs !== undefined && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={colors.textDim} strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span style={{ fontSize: '12px', fontFamily: 'monospace', fontWeight: 600, color: colors.textMain }}>
                {formatElapsedTime(entry.elapsedTimeMs)}
              </span>
            </div>
          )}

          {/* Cost */}
          {entry.usageStats && entry.usageStats.totalCostUsd > 0 && (
            <span
              style={{
                fontSize: '12px',
                fontFamily: 'monospace',
                fontWeight: 600,
                color: '#22c55e',
                backgroundColor: '#22c55e20',
                padding: '2px 8px',
                borderRadius: '4px',
              }}
            >
              ${entry.usageStats.totalCostUsd.toFixed(2)}
            </span>
          )}

          {/* Tokens */}
          {entry.usageStats && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', fontFamily: 'monospace' }}>
              <span style={{ color: colors.accent }}>
                In: {entry.usageStats.inputTokens.toLocaleString()}
              </span>
              <span style={{ color: colors.success }}>
                Out: {entry.usageStats.outputTokens.toLocaleString()}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Content */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '16px',
          paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
        }}
      >
        <pre
          style={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontFamily: 'monospace',
            fontSize: '13px',
            lineHeight: 1.6,
            color: colors.textMain,
            margin: 0,
          }}
        >
          {cleanResponse}
        </pre>
      </div>

      {/* Animation keyframes */}
      <style>{`
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

/**
 * Props for MobileHistoryPanel component
 */
export interface MobileHistoryPanelProps {
  /** Callback to close the history panel */
  onClose: () => void;
  /** Current active session's project path (for filtering) */
  projectPath?: string;
  /** Current active session ID (for filtering) */
  sessionId?: string;
}

/**
 * Filter type for history entries
 */
type HistoryFilter = 'all' | 'AUTO' | 'USER' | 'LOOP';

/**
 * MobileHistoryPanel component
 *
 * Full-screen view showing history entries with filtering and detail views.
 */
export function MobileHistoryPanel({
  onClose,
  projectPath,
  sessionId,
}: MobileHistoryPanelProps) {
  const colors = useThemeColors();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [selectedEntry, setSelectedEntry] = useState<HistoryEntry | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch history entries on mount
  useEffect(() => {
    const fetchHistory = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // Build query params
        const params = new URLSearchParams();
        if (projectPath) params.set('projectPath', projectPath);
        if (sessionId) params.set('sessionId', sessionId);

        const queryString = params.toString();
        const apiUrl = buildApiUrl(`/history${queryString ? `?${queryString}` : ''}`);

        const response = await fetch(apiUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch history: ${response.statusText}`);
        }
        const data = await response.json();
        setEntries(data.entries || []);
        webLogger.debug(`Fetched ${data.entries?.length || 0} history entries`, 'MobileHistory');
      } catch (err: any) {
        webLogger.error('Failed to fetch history', 'MobileHistory', err);
        setError(err.message || 'Failed to load history');
      } finally {
        setIsLoading(false);
      }
    };

    fetchHistory();
  }, [projectPath, sessionId]);

  // Filter entries based on selected filter
  const filteredEntries = useMemo(() => {
    if (filter === 'all') return entries;
    return entries.filter((entry) => entry.type === filter);
  }, [entries, filter]);

  // Handle filter change
  const handleFilterChange = useCallback((newFilter: HistoryFilter) => {
    triggerHaptic(HAPTIC_PATTERNS.tap);
    setFilter(newFilter);
  }, []);

  // Handle entry selection
  const handleSelectEntry = useCallback((entry: HistoryEntry) => {
    setSelectedEntry(entry);
  }, []);

  // Handle closing detail view
  const handleCloseDetail = useCallback(() => {
    setSelectedEntry(null);
  }, []);

  // Handle close button
  const handleClose = useCallback(() => {
    triggerHaptic(HAPTIC_PATTERNS.tap);
    onClose();
  }, [onClose]);

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !selectedEntry) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, selectedEntry]);

  // Count entries by type
  const autoCount = entries.filter((e) => e.type === 'AUTO').length;
  const userCount = entries.filter((e) => e.type === 'USER').length;
  const loopCount = entries.filter((e) => e.type === 'LOOP').length;

  return (
    <>
      <div
        ref={containerRef}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: colors.bgMain,
          zIndex: 200, // Higher than CommandInputBar (100) to fully cover the screen including input box
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideUp 0.25s ease-out',
        }}
      >
        {/* Header */}
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            paddingTop: 'max(12px, env(safe-area-inset-top))',
            borderBottom: `1px solid ${colors.border}`,
            backgroundColor: colors.bgSidebar,
            minHeight: '56px',
            flexShrink: 0,
          }}
        >
          <h1
            style={{
              fontSize: '18px',
              fontWeight: 600,
              margin: 0,
              color: colors.textMain,
            }}
          >
            History
          </h1>
          <button
            onClick={handleClose}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              backgroundColor: colors.bgMain,
              border: `1px solid ${colors.border}`,
              color: colors.textMain,
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              touchAction: 'manipulation',
              WebkitTapHighlightColor: 'transparent',
            }}
            aria-label="Close history"
          >
            Done
          </button>
        </header>

        {/* Filter pills */}
        <div
          style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${colors.border}`,
            backgroundColor: colors.bgSidebar,
            display: 'flex',
            gap: '8px',
            flexShrink: 0,
          }}
        >
          {/* Only show LOOP filter if there are LOOP entries */}
          {(['all', 'AUTO', 'USER', 'LOOP'] as HistoryFilter[])
            .filter((ft) => ft !== 'LOOP' || loopCount > 0)
            .map((filterType) => {
            const isActive = filter === filterType;
            const count = filterType === 'all'
              ? entries.length
              : filterType === 'AUTO'
                ? autoCount
                : filterType === 'USER'
                  ? userCount
                  : loopCount;
            const displayLabel = filterType === 'all' ? 'All' : filterType;

            let bgColor = colors.bgMain;
            let textColor = colors.textDim;
            let borderColor = colors.border;

            if (isActive) {
              if (filterType === 'AUTO') {
                bgColor = colors.warning + '20';
                textColor = colors.warning;
                borderColor = colors.warning + '40';
              } else if (filterType === 'USER') {
                bgColor = colors.accent + '20';
                textColor = colors.accent;
                borderColor = colors.accent + '40';
              } else if (filterType === 'LOOP') {
                bgColor = colors.success + '20';
                textColor = colors.success;
                borderColor = colors.success + '40';
              } else {
                bgColor = colors.accent + '20';
                textColor = colors.accent;
                borderColor = colors.accent + '40';
              }
            }

            return (
              <button
                key={filterType}
                onClick={() => handleFilterChange(filterType)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  borderRadius: '20px',
                  backgroundColor: bgColor,
                  border: `1px solid ${borderColor}`,
                  color: textColor,
                  fontSize: '12px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  touchAction: 'manipulation',
                  WebkitTapHighlightColor: 'transparent',
                  opacity: isActive ? 1 : 0.6,
                  transition: 'all 0.15s ease',
                }}
                aria-pressed={isActive}
              >
                {displayLabel}
                <span
                  style={{
                    fontSize: '10px',
                    backgroundColor: isActive ? `${textColor}20` : `${colors.textDim}20`,
                    padding: '2px 6px',
                    borderRadius: '8px',
                    minWidth: '20px',
                    textAlign: 'center',
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Entry list */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: '16px',
            paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
          }}
        >
          {isLoading ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '40px 20px',
                textAlign: 'center',
              }}
            >
              <p style={{ fontSize: '14px', color: colors.textDim }}>Loading history...</p>
            </div>
          ) : error ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '40px 20px',
                textAlign: 'center',
              }}
            >
              <p style={{ fontSize: '14px', color: colors.error, marginBottom: '8px' }}>
                {error}
              </p>
              <p style={{ fontSize: '13px', color: colors.textDim }}>
                Make sure the desktop app is running
              </p>
            </div>
          ) : filteredEntries.length === 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '40px 20px',
                textAlign: 'center',
              }}
            >
              <p style={{ fontSize: '15px', color: colors.textMain, marginBottom: '8px' }}>
                No history entries
              </p>
              <p style={{ fontSize: '13px', color: colors.textDim }}>
                {filter !== 'all'
                  ? `No ${filter} entries found. Try changing the filter.`
                  : 'Run batch tasks or use /synopsis to add entries.'}
              </p>
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              {filteredEntries.map((entry) => (
                <HistoryCard key={entry.id} entry={entry} onSelect={handleSelectEntry} />
              ))}
            </div>
          )}
        </div>

        {/* Animation keyframes */}
        <style>{`
          @keyframes slideUp {
            from {
              opacity: 0;
              transform: translateY(20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}</style>
      </div>

      {/* Detail view (overlays the list) */}
      {selectedEntry && (
        <HistoryDetailView entry={selectedEntry} onClose={handleCloseDetail} />
      )}
    </>
  );
}

export default MobileHistoryPanel;
