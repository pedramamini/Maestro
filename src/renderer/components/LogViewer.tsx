import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Trash2, Download } from 'lucide-react';
import type { Theme } from '../types';

interface SystemLogEntry {
  timestamp: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  context?: string;
  data?: unknown;
}

interface LogViewerProps {
  theme: Theme;
  onClose: () => void;
}

export function LogViewer({ theme, onClose }: LogViewerProps) {
  const [logs, setLogs] = useState<SystemLogEntry[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<SystemLogEntry[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<'debug' | 'info' | 'warn' | 'error' | 'all'>('all');
  const logsEndRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load logs on mount
  useEffect(() => {
    loadLogs();
  }, []);

  // Filter logs whenever search query or selected level changes
  useEffect(() => {
    let filtered = logs;

    // Filter by level
    if (selectedLevel !== 'all') {
      filtered = filtered.filter(log => log.level === selectedLevel);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(log =>
        log.message.toLowerCase().includes(query) ||
        log.context?.toLowerCase().includes(query) ||
        (log.data && JSON.stringify(log.data).toLowerCase().includes(query))
      );
    }

    setFilteredLogs(filtered);
  }, [logs, searchQuery, selectedLevel]);

  // Focus search input when opened
  useEffect(() => {
    if (searchOpen) {
      searchInputRef.current?.focus();
    }
  }, [searchOpen]);

  const loadLogs = async () => {
    try {
      const systemLogs = await window.maestro.logger.getLogs();
      setLogs(systemLogs);
    } catch (error) {
      console.error('Failed to load logs:', error);
    }
  };

  const handleClearLogs = async () => {
    try {
      await window.maestro.logger.clearLogs();
      setLogs([]);
      setFilteredLogs([]);
    } catch (error) {
      console.error('Failed to clear logs:', error);
    }
  };

  const handleExportLogs = () => {
    const logsText = filteredLogs.map(log => {
      const timestamp = new Date(log.timestamp).toISOString();
      const contextStr = log.context ? `[${log.context}]` : '';
      const dataStr = log.data ? `\n${JSON.stringify(log.data, null, 2)}` : '';
      return `[${timestamp}] [${log.level.toUpperCase()}] ${contextStr} ${log.message}${dataStr}`;
    }).join('\n\n');

    const blob = new Blob([logsText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `maestro-logs-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Open search with /
    if (e.key === '/' && !searchOpen && document.activeElement !== searchInputRef.current) {
      e.preventDefault();
      setSearchOpen(true);
    }
    // Close search with Escape
    else if (e.key === 'Escape' && searchOpen) {
      e.preventDefault();
      setSearchOpen(false);
      setSearchQuery('');
      containerRef.current?.focus();
    }
    // Scroll with arrow keys
    else if (e.key === 'ArrowUp' && !searchOpen) {
      e.preventDefault();
      containerRef.current?.scrollBy({ top: -100, behavior: 'smooth' });
    } else if (e.key === 'ArrowDown' && !searchOpen) {
      e.preventDefault();
      containerRef.current?.scrollBy({ top: 100, behavior: 'smooth' });
    }
    // Jump to top/bottom
    else if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowUp' && !searchOpen) {
      e.preventDefault();
      containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    } else if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowDown' && !searchOpen) {
      e.preventDefault();
      containerRef.current?.scrollTo({ top: containerRef.current.scrollHeight, behavior: 'smooth' });
    }
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'debug':
        return '#6366f1'; // Indigo
      case 'info':
        return '#3b82f6'; // Blue
      case 'warn':
        return '#f59e0b'; // Amber
      case 'error':
        return '#ef4444'; // Red
      default:
        return theme.colors.textDim;
    }
  };

  const getLevelBgColor = (level: string) => {
    switch (level) {
      case 'debug':
        return 'rgba(99, 102, 241, 0.15)';
      case 'info':
        return 'rgba(59, 130, 246, 0.15)';
      case 'warn':
        return 'rgba(245, 158, 11, 0.15)';
      case 'error':
        return 'rgba(239, 68, 68, 0.15)';
      default:
        return 'transparent';
    }
  };

  return (
    <div className="flex flex-col h-full" onKeyDown={handleKeyDown}>
      {/* Header */}
      <div
        className="px-4 py-3 border-b flex items-center justify-between sticky top-0 z-10"
        style={{ backgroundColor: theme.colors.bgMain, borderColor: theme.colors.border }}
      >
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold" style={{ color: theme.colors.textMain }}>
            Maestro System Logs
          </h2>
          <span className="text-xs opacity-50" style={{ color: theme.colors.textDim }}>
            {filteredLogs.length} {filteredLogs.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportLogs}
            className="p-2 rounded hover:bg-opacity-10 transition-all"
            style={{ color: theme.colors.textDim }}
            title="Export logs"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={handleClearLogs}
            className="p-2 rounded hover:bg-opacity-10 transition-all"
            style={{ color: theme.colors.textDim }}
            title="Clear logs"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded hover:bg-opacity-10 transition-all"
            style={{ color: theme.colors.textDim }}
            title="Close log viewer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Level Filters */}
      <div
        className="px-4 py-2 border-b flex items-center gap-2"
        style={{ backgroundColor: theme.colors.bgMain, borderColor: theme.colors.border }}
      >
        <span className="text-xs font-bold opacity-70 uppercase mr-2" style={{ color: theme.colors.textDim }}>
          Filter:
        </span>
        {(['all', 'debug', 'info', 'warn', 'error'] as const).map(level => (
          <button
            key={level}
            onClick={() => setSelectedLevel(level)}
            className="px-3 py-1 rounded text-xs font-bold transition-all"
            style={{
              backgroundColor: selectedLevel === level ? getLevelColor(level) : 'transparent',
              color: selectedLevel === level ? 'white' : theme.colors.textDim,
              border: `1px solid ${selectedLevel === level ? getLevelColor(level) : theme.colors.border}`
            }}
          >
            {level.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Search Bar */}
      {searchOpen && (
        <div
          className="px-4 py-2 border-b flex items-center gap-3"
          style={{ backgroundColor: theme.colors.bgMain, borderColor: theme.colors.border }}
        >
          <Search className="w-4 h-4" style={{ color: theme.colors.textDim }} />
          <input
            ref={searchInputRef}
            type="text"
            className="flex-1 bg-transparent outline-none text-sm"
            placeholder="Search logs..."
            style={{ color: theme.colors.textMain }}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') {
                e.preventDefault();
                setSearchOpen(false);
                setSearchQuery('');
                containerRef.current?.focus();
              }
            }}
          />
          <button
            onClick={() => {
              setSearchOpen(false);
              setSearchQuery('');
            }}
            className="text-xs font-bold opacity-50 hover:opacity-100"
            style={{ color: theme.colors.textDim }}
          >
            ESC
          </button>
        </div>
      )}

      {/* Logs Container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto p-4 space-y-2 outline-none"
        tabIndex={-1}
        style={{ backgroundColor: theme.colors.bgMain }}
      >
        {filteredLogs.length === 0 ? (
          <div className="text-center py-12 opacity-50" style={{ color: theme.colors.textDim }}>
            {logs.length === 0 ? 'No logs yet' : 'No logs match your filter'}
          </div>
        ) : (
          filteredLogs.map((log, index) => (
            <div
              key={index}
              className="rounded p-3 border"
              style={{
                backgroundColor: theme.colors.bgActivity,
                borderColor: theme.colors.border
              }}
            >
              <div className="flex items-start gap-3">
                {/* Level Pill */}
                <div
                  className="px-2 py-0.5 rounded text-xs font-bold uppercase flex-shrink-0"
                  style={{
                    backgroundColor: getLevelBgColor(log.level),
                    color: getLevelColor(log.level)
                  }}
                >
                  {log.level}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 mb-1">
                    <span className="text-xs opacity-50 font-mono flex-shrink-0" style={{ color: theme.colors.textDim }}>
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    {log.context && (
                      <span
                        className="text-xs px-1.5 py-0.5 rounded font-mono"
                        style={{ backgroundColor: theme.colors.bgMain, color: theme.colors.accent }}
                      >
                        {log.context}
                      </span>
                    )}
                  </div>
                  <div className="text-sm break-words" style={{ color: theme.colors.textMain }}>
                    {log.message}
                  </div>
                  {log.data && (
                    <pre
                      className="text-xs mt-2 p-2 rounded overflow-x-auto font-mono"
                      style={{ backgroundColor: theme.colors.bgMain, color: theme.colors.textDim }}
                    >
                      {JSON.stringify(log.data, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>

      {/* Footer hint */}
      {!searchOpen && (
        <div
          className="px-4 py-2 border-t flex items-center justify-center text-xs opacity-50"
          style={{ backgroundColor: theme.colors.bgMain, borderColor: theme.colors.border, color: theme.colors.textDim }}
        >
          Press <kbd className="px-1.5 py-0.5 rounded mx-1 font-bold" style={{ backgroundColor: theme.colors.bgActivity }}>/</kbd> to search
        </div>
      )}
    </div>
  );
}
