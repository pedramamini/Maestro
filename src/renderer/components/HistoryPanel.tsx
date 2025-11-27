import React, { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef, useMemo } from 'react';
import { Bot, User, ExternalLink, Check, X } from 'lucide-react';
import type { Session, Theme, HistoryEntry, HistoryEntryType } from '../types';
import { HistoryDetailModal } from './HistoryDetailModal';

// 24-hour activity bar graph component
interface ActivityGraphProps {
  entries: HistoryEntry[];
  theme: Theme;
}

const ActivityGraph: React.FC<ActivityGraphProps> = ({ entries, theme }) => {
  // Group entries by hour for past 24 hours
  const hourlyData = useMemo(() => {
    const now = Date.now();
    const msPerHour = 60 * 60 * 1000;
    const hours24Ago = now - (24 * msPerHour);

    // Initialize 24 buckets (index 0 = 24 hours ago, index 23 = current hour)
    const buckets: { auto: number; user: number }[] = Array.from({ length: 24 }, () => ({ auto: 0, user: 0 }));

    // Filter to last 24 hours and bucket by hour
    entries.forEach(entry => {
      if (entry.timestamp >= hours24Ago && entry.timestamp <= now) {
        const hoursAgo = Math.floor((now - entry.timestamp) / msPerHour);
        const bucketIndex = 23 - hoursAgo; // Convert to 0-indexed from oldest to newest
        if (bucketIndex >= 0 && bucketIndex < 24) {
          if (entry.type === 'AUTO') {
            buckets[bucketIndex].auto++;
          } else if (entry.type === 'USER') {
            buckets[bucketIndex].user++;
          }
        }
      }
    });

    return buckets;
  }, [entries]);

  // Find max value for scaling
  const maxValue = useMemo(() => {
    return Math.max(1, ...hourlyData.map(h => h.auto + h.user));
  }, [hourlyData]);

  // Total counts for tooltip
  const totalAuto = useMemo(() => hourlyData.reduce((sum, h) => sum + h.auto, 0), [hourlyData]);
  const totalUser = useMemo(() => hourlyData.reduce((sum, h) => sum + h.user, 0), [hourlyData]);

  // Hour labels positioned at: 24 (start), 16, 8, 0 (end/now)
  const hourLabels = [
    { hour: 24, index: 0 },
    { hour: 16, index: 8 },
    { hour: 8, index: 16 },
    { hour: 0, index: 23 }
  ];

  return (
    <div
      className="flex-1 min-w-0 flex flex-col"
      title={`Last 24h: ${totalAuto} auto, ${totalUser} user`}
    >
      {/* Graph container with border */}
      <div
        className="flex items-end gap-px h-6 rounded border px-1 pt-1"
        style={{ borderColor: theme.colors.border }}
      >
        {hourlyData.map((hour, index) => {
          const total = hour.auto + hour.user;
          const heightPercent = total > 0 ? (total / maxValue) * 100 : 0;
          const autoPercent = total > 0 ? (hour.auto / total) * 100 : 0;

          return (
            <div
              key={index}
              className="flex-1 min-w-0 flex flex-col justify-end rounded-t-sm overflow-hidden"
              style={{
                height: '100%',
                opacity: total > 0 ? 1 : 0.15
              }}
            >
              <div
                className="w-full rounded-t-sm overflow-hidden transition-all"
                style={{
                  height: `${Math.max(heightPercent, total > 0 ? 15 : 8)}%`,
                  minHeight: total > 0 ? '3px' : '1px'
                }}
              >
                {/* User portion (bottom) */}
                {hour.user > 0 && (
                  <div
                    style={{
                      height: `${100 - autoPercent}%`,
                      backgroundColor: theme.colors.accent,
                      minHeight: '1px'
                    }}
                  />
                )}
                {/* Auto portion (top) */}
                {hour.auto > 0 && (
                  <div
                    style={{
                      height: `${autoPercent}%`,
                      backgroundColor: theme.colors.warning,
                      minHeight: '1px'
                    }}
                  />
                )}
                {/* Empty bar placeholder */}
                {total === 0 && (
                  <div
                    style={{
                      height: '100%',
                      backgroundColor: theme.colors.border
                    }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
      {/* Hour labels below */}
      <div className="relative h-3 mt-0.5">
        {hourLabels.map(({ hour, index }) => (
          <span
            key={hour}
            className="absolute text-[8px] font-mono"
            style={{
              color: theme.colors.textDim,
              left: index === 0 ? '0' : index === 23 ? 'auto' : `${(index / 23) * 100}%`,
              right: index === 23 ? '0' : 'auto',
              transform: index > 0 && index < 23 ? 'translateX(-50%)' : 'none'
            }}
          >
            {hour}h
          </span>
        ))}
      </div>
    </div>
  );
};

interface HistoryPanelProps {
  session: Session;
  theme: Theme;
  onJumpToClaudeSession?: (claudeSessionId: string) => void;
}

export interface HistoryPanelHandle {
  focus: () => void;
  refreshHistory: () => void;
}

export const HistoryPanel = React.memo(forwardRef<HistoryPanelHandle, HistoryPanelProps>(function HistoryPanel({ session, theme, onJumpToClaudeSession }, ref) {
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [activeFilters, setActiveFilters] = useState<Set<HistoryEntryType>>(new Set(['AUTO', 'USER']));
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [detailModalEntry, setDetailModalEntry] = useState<HistoryEntry | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [searchFilterOpen, setSearchFilterOpen] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Load history entries function - reusable for initial load and refresh
  const loadHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      // Pass sessionId to filter: only show entries from this session or legacy entries without sessionId
      const entries = await window.maestro.history.getAll(session.cwd, session.id);
      // Ensure entries is an array and has valid shape
      setHistoryEntries(Array.isArray(entries) ? entries : []);
    } catch (error) {
      console.error('Failed to load history:', error);
      setHistoryEntries([]);
    } finally {
      setIsLoading(false);
    }
  }, [session.cwd, session.id]);

  // Expose focus and refreshHistory methods to parent
  useImperativeHandle(ref, () => ({
    focus: () => {
      listRef.current?.focus();
      // Select first item if none selected
      if (selectedIndex < 0 && historyEntries.length > 0) {
        setSelectedIndex(0);
      }
    },
    refreshHistory: () => {
      loadHistory();
    }
  }), [selectedIndex, historyEntries.length, loadHistory]);

  // Load history entries on mount and when session changes
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Toggle a filter
  const toggleFilter = (type: HistoryEntryType) => {
    setActiveFilters(prev => {
      const newFilters = new Set(prev);
      if (newFilters.has(type)) {
        newFilters.delete(type);
      } else {
        newFilters.add(type);
      }
      return newFilters;
    });
  };

  // Filter entries based on active filters and search text
  const filteredEntries = historyEntries.filter(entry => {
    if (!entry || !entry.type) return false;
    if (!activeFilters.has(entry.type)) return false;

    // Apply text search filter
    if (searchFilter) {
      const searchLower = searchFilter.toLowerCase();
      const summaryMatch = entry.summary?.toLowerCase().includes(searchLower);
      const responseMatch = entry.fullResponse?.toLowerCase().includes(searchLower);
      const promptMatch = entry.prompt?.toLowerCase().includes(searchLower);
      if (!summaryMatch && !responseMatch && !promptMatch) return false;
    }

    return true;
  });

  // Reset selected index when filters change
  useEffect(() => {
    setSelectedIndex(-1);
  }, [activeFilters, searchFilter]);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0) {
      const itemEl = itemRefs.current[selectedIndex];
      if (itemEl) {
        itemEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex]);

  // Keyboard navigation handler
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Open search filter with / key
    if (e.key === '/' && !searchFilterOpen) {
      e.preventDefault();
      setSearchFilterOpen(true);
      // Focus the search input after state update
      setTimeout(() => searchInputRef.current?.focus(), 0);
      return;
    }

    if (filteredEntries.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => {
          const next = prev < filteredEntries.length - 1 ? prev + 1 : prev;
          return next;
        });
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => {
          const next = prev > 0 ? prev - 1 : 0;
          return next;
        });
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < filteredEntries.length) {
          setDetailModalEntry(filteredEntries[selectedIndex]);
        }
        break;
      case 'Escape':
        // Only handle if modal is not open (modal handles its own escape)
        if (!detailModalEntry) {
          setSelectedIndex(-1);
        }
        break;
    }
  }, [filteredEntries, selectedIndex, detailModalEntry, searchFilterOpen]);

  // Open detail modal for an entry
  const openDetailModal = useCallback((entry: HistoryEntry, index: number) => {
    setSelectedIndex(index);
    setDetailModalEntry(entry);
  }, []);

  // Close detail modal and restore focus
  const closeDetailModal = useCallback(() => {
    setDetailModalEntry(null);
    // Restore focus to the list
    listRef.current?.focus();
  }, []);

  // Format timestamp
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
        ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  };

  // Get pill color based on type
  const getPillColor = (type: HistoryEntryType) => {
    switch (type) {
      case 'AUTO':
        return { bg: theme.colors.warning + '20', text: theme.colors.warning, border: theme.colors.warning + '40' };
      case 'USER':
        return { bg: theme.colors.accent + '20', text: theme.colors.accent, border: theme.colors.accent + '40' };
      default:
        return { bg: theme.colors.bgActivity, text: theme.colors.textDim, border: theme.colors.border };
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Filter Pills + Activity Graph */}
      <div className="flex items-center gap-3 mb-4 pt-2">
        {/* Left-justified filter pills */}
        <div className="flex gap-2 flex-shrink-0">
          {(['AUTO', 'USER'] as HistoryEntryType[]).map(type => {
            const isActive = activeFilters.has(type);
            const colors = getPillColor(type);
            const Icon = type === 'AUTO' ? Bot : User;

            return (
              <button
                key={type}
                onClick={() => toggleFilter(type)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold uppercase transition-all ${
                  isActive ? 'opacity-100' : 'opacity-40'
                }`}
                style={{
                  backgroundColor: isActive ? colors.bg : 'transparent',
                  color: isActive ? colors.text : theme.colors.textDim,
                  border: `1px solid ${isActive ? colors.border : theme.colors.border}`
                }}
              >
                <Icon className="w-3 h-3" />
                {type}
              </button>
            );
          })}
        </div>

        {/* 24-hour activity bar graph */}
        <ActivityGraph entries={historyEntries} theme={theme} />
      </div>

      {/* Search Filter */}
      {searchFilterOpen && (
        <div className="mb-3">
          <input
            ref={searchInputRef}
            autoFocus
            type="text"
            placeholder="Filter history..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setSearchFilterOpen(false);
                setSearchFilter('');
                // Return focus to the list
                listRef.current?.focus();
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                // Move focus to list and select first item
                listRef.current?.focus();
                if (filteredEntries.length > 0) {
                  setSelectedIndex(0);
                }
              }
            }}
            className="w-full px-3 py-2 rounded border bg-transparent outline-none text-sm"
            style={{ borderColor: theme.colors.accent, color: theme.colors.textMain }}
          />
          {searchFilter && (
            <div className="text-[10px] mt-1 text-right" style={{ color: theme.colors.textDim }}>
              {filteredEntries.length} result{filteredEntries.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      )}

      {/* History List */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto space-y-3 outline-none scrollbar-thin"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        {isLoading ? (
          <div className="text-center py-8 text-xs opacity-50">Loading history...</div>
        ) : filteredEntries.length === 0 ? (
          <div className="text-center py-8 text-xs opacity-50">
            {historyEntries.length === 0
              ? 'No history yet. Run batch tasks or use /synopsis to add entries.'
              : searchFilter
                ? `No entries match "${searchFilter}"`
                : 'No entries match the selected filters.'}
          </div>
        ) : (
          filteredEntries.map((entry, index) => {
            const colors = getPillColor(entry.type);
            const Icon = entry.type === 'AUTO' ? Bot : User;
            const isSelected = index === selectedIndex;

            return (
              <div
                key={entry.id || `entry-${index}`}
                ref={(el) => {
                  itemRefs.current[index] = el;
                }}
                onClick={() => openDetailModal(entry, index)}
                className="p-3 rounded border transition-colors cursor-pointer hover:bg-white/5"
                style={{
                  borderColor: isSelected ? theme.colors.accent : theme.colors.border,
                  backgroundColor: isSelected ? theme.colors.accent + '10' : 'transparent',
                  outline: isSelected ? `2px solid ${theme.colors.accent}` : 'none',
                  outlineOffset: '1px'
                }}
              >
                {/* Header Row */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {/* Success/Failure Indicator for AUTO entries */}
                    {entry.type === 'AUTO' && entry.success !== undefined && (
                      <span
                        className="flex items-center justify-center w-5 h-5 rounded-full"
                        style={{
                          backgroundColor: entry.success ? theme.colors.success + '20' : theme.colors.error + '20',
                          border: `1px solid ${entry.success ? theme.colors.success + '40' : theme.colors.error + '40'}`
                        }}
                        title={entry.success ? 'Task completed successfully' : 'Task failed'}
                      >
                        {entry.success ? (
                          <Check className="w-3 h-3" style={{ color: theme.colors.success }} />
                        ) : (
                          <X className="w-3 h-3" style={{ color: theme.colors.error }} />
                        )}
                      </span>
                    )}

                    {/* Type Pill */}
                    <span
                      className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
                      style={{
                        backgroundColor: colors.bg,
                        color: colors.text,
                        border: `1px solid ${colors.border}`
                      }}
                    >
                      <Icon className="w-2.5 h-2.5" />
                      {entry.type}
                    </span>

                    {/* Session ID Octet (clickable) */}
                    {entry.claudeSessionId && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onJumpToClaudeSession?.(entry.claudeSessionId!);
                        }}
                        className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase transition-colors hover:opacity-80"
                        style={{
                          backgroundColor: theme.colors.accent + '20',
                          color: theme.colors.accent,
                          border: `1px solid ${theme.colors.accent}40`
                        }}
                        title={`Jump to session ${entry.claudeSessionId}`}
                      >
                        {entry.claudeSessionId.split('-')[0].toUpperCase()}
                        <ExternalLink className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>

                  {/* Timestamp */}
                  <span className="text-[10px]" style={{ color: theme.colors.textDim }}>
                    {formatTime(entry.timestamp)}
                  </span>
                </div>

                {/* Summary - 3 lines max */}
                <p
                  className="text-xs leading-relaxed overflow-hidden"
                  style={{
                    color: theme.colors.textMain,
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical' as const
                  }}
                >
                  {entry.summary || 'No summary available'}
                </p>
              </div>
            );
          })
        )}
      </div>

      {/* Detail Modal */}
      {detailModalEntry && (
        <HistoryDetailModal
          theme={theme}
          entry={detailModalEntry}
          onClose={closeDetailModal}
          onJumpToClaudeSession={onJumpToClaudeSession}
        />
      )}
    </div>
  );
}));
