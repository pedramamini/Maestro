import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, Wand2, ExternalLink, FileCode, BarChart3, Loader2 } from 'lucide-react';
import type { Theme, Session, AutoRunStats } from '../types';
import { useLayerStack } from '../contexts/LayerStackContext';
import { MODAL_PRIORITIES } from '../constants/modalPriorities';
import pedramAvatar from '../assets/pedram-avatar.png';
import { AchievementCard } from './AchievementCard';

interface ClaudeGlobalStats {
  totalSessions: number;
  totalMessages: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheCreationTokens: number;
  totalCostUsd: number;
  totalSizeBytes: number;
  isComplete?: boolean;
}

interface AboutModalProps {
  theme: Theme;
  sessions: Session[];
  autoRunStats: AutoRunStats;
  onClose: () => void;
}

export function AboutModal({ theme, sessions, autoRunStats, onClose }: AboutModalProps) {
  const { registerLayer, unregisterLayer, updateLayerHandler } = useLayerStack();
  const layerIdRef = useRef<string>();
  const [globalStats, setGlobalStats] = useState<ClaudeGlobalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [isStatsComplete, setIsStatsComplete] = useState(false);
  const badgeEscapeHandlerRef = useRef<(() => boolean) | null>(null);

  // Use ref to avoid re-registering layer when onClose changes
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Load global stats from all Claude projects on mount with streaming updates
  useEffect(() => {
    // Subscribe to streaming updates
    const unsubscribe = window.maestro.claude.onGlobalStatsUpdate((stats) => {
      setGlobalStats(stats);
      setLoading(false);
      if (stats.isComplete) {
        setIsStatsComplete(true);
      }
    });

    // Trigger the stats calculation (which will send streaming updates)
    window.maestro.claude.getGlobalStats().catch((error) => {
      console.error('Failed to load global Claude stats:', error);
      setLoading(false);
      setIsStatsComplete(true);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Calculate active time from current sessions
  const totalActiveTimeMs = sessions.reduce((sum, s) => sum + (s.activeTimeMs || 0), 0);

  // Format token count with K/M suffix
  const formatTokens = (count: number): string => {
    if (count >= 1_000_000) {
      return `${(count / 1_000_000).toFixed(1)}M`;
    }
    if (count >= 1_000) {
      return `${(count / 1_000).toFixed(1)}K`;
    }
    return count.toString();
  };

  // Format duration from milliseconds
  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };
  const containerRef = useRef<HTMLDivElement>(null);

  // Custom escape handler that checks for badge overlay first
  // Uses refs to avoid dependency changes that would cause infinite loops
  const handleEscape = useCallback(() => {
    // If badge overlay is open, close it first
    if (badgeEscapeHandlerRef.current) {
      badgeEscapeHandlerRef.current();
      return;
    }
    // Otherwise close the modal
    onCloseRef.current();
  }, []); // No dependencies - uses refs

  // Register layer on mount only
  useEffect(() => {
    const id = registerLayer({
      type: 'modal',
      priority: MODAL_PRIORITIES.ABOUT,
      blocksLowerLayers: true,
      capturesFocus: true,
      focusTrap: 'strict',
      ariaLabel: 'About Maestro',
      onEscape: handleEscape,
    });
    layerIdRef.current = id;

    // Auto-focus the container for immediate keyboard control
    containerRef.current?.focus();

    return () => {
      if (layerIdRef.current) {
        unregisterLayer(layerIdRef.current);
      }
    };
  }, [registerLayer, unregisterLayer, handleEscape]);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999] animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label="About Maestro"
      tabIndex={-1}
    >
      <div className="w-[450px] max-h-[90vh] border rounded-lg shadow-2xl overflow-hidden flex flex-col" style={{ backgroundColor: theme.colors.bgSidebar, borderColor: theme.colors.border }}>
        <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: theme.colors.border }}>
          <h2 className="text-sm font-bold" style={{ color: theme.colors.textMain }}>About Maestro</h2>
          <button onClick={onClose} style={{ color: theme.colors.textDim }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Logo and Title */}
          <div className="flex items-center gap-4">
            <Wand2 className="w-12 h-12" style={{ color: theme.colors.accent }} />
            <div>
              <div className="flex items-baseline gap-2">
                <h1 className="text-2xl font-bold tracking-widest" style={{ color: theme.colors.textMain }}>MAESTRO</h1>
                <span className="text-xs font-mono" style={{ color: theme.colors.textDim }}>v{__APP_VERSION__}</span>
              </div>
              <p className="text-xs opacity-70" style={{ color: theme.colors.textDim }}>Agent Orchestration Command Center</p>
            </div>
          </div>

          {/* Author Section */}
          <div className="flex items-center gap-4 p-4 rounded border" style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.bgActivity }}>
            <img
              src={pedramAvatar}
              alt="Pedram Amini"
              className="w-16 h-16 rounded-full border-2"
              style={{ borderColor: theme.colors.accent }}
            />
            <div className="flex-1">
              <div className="text-sm font-bold" style={{ color: theme.colors.textMain }}>Pedram Amini</div>
              <div className="text-xs opacity-70 mb-2" style={{ color: theme.colors.textDim }}>Founder, Hacker, Investor, Advisor</div>
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => window.maestro.shell.openExternal('https://github.com/pedramamini')}
                  className="inline-flex items-center gap-1 text-xs hover:underline cursor-pointer text-left"
                  style={{ color: theme.colors.accent, background: 'none', border: 'none', padding: 0 }}
                >
                  <ExternalLink className="w-3 h-3" />
                  GitHub Profile
                </button>
                <button
                  onClick={() => window.maestro.shell.openExternal('https://www.linkedin.com/in/pedramamini/')}
                  className="inline-flex items-center gap-1 text-xs hover:underline cursor-pointer text-left"
                  style={{ color: theme.colors.accent, background: 'none', border: 'none', padding: 0 }}
                >
                  <ExternalLink className="w-3 h-3" />
                  LinkedIn Profile
                </button>
              </div>
            </div>
          </div>

          {/* Achievements Section */}
          <AchievementCard
            theme={theme}
            autoRunStats={autoRunStats}
            globalStats={globalStats}
            onEscapeWithBadgeOpen={(handler) => { badgeEscapeHandlerRef.current = handler; }}
          />

          {/* Global Usage Stats - show loading or stats from all Claude projects */}
          <div className="p-4 rounded border" style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.bgActivity }}>
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-4 h-4" style={{ color: theme.colors.accent }} />
              <span className="text-sm font-bold" style={{ color: theme.colors.textMain }}>Global Statistics</span>
              {!isStatsComplete && (
                <Loader2 className="w-3 h-3 animate-spin" style={{ color: theme.colors.textDim }} />
              )}
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-4 gap-2">
                <Loader2 className="w-4 h-4 animate-spin" style={{ color: theme.colors.textDim }} />
                <span className="text-xs" style={{ color: theme.colors.textDim }}>Loading stats...</span>
              </div>
            ) : globalStats ? (
              <div className="grid grid-cols-2 gap-3 text-xs">
                {/* Sessions & Messages */}
                <div className="flex justify-between">
                  <span style={{ color: theme.colors.textDim }}>Sessions</span>
                  <span className="font-mono font-bold" style={{ color: theme.colors.textMain }}>{globalStats.totalSessions}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: theme.colors.textDim }}>Messages</span>
                  <span className="font-mono font-bold" style={{ color: theme.colors.textMain }}>{globalStats.totalMessages}</span>
                </div>

                {/* Tokens */}
                <div className="flex justify-between">
                  <span style={{ color: theme.colors.textDim }}>Input Tokens</span>
                  <span className="font-mono font-bold" style={{ color: theme.colors.textMain }}>{formatTokens(globalStats.totalInputTokens)}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: theme.colors.textDim }}>Output Tokens</span>
                  <span className="font-mono font-bold" style={{ color: theme.colors.textMain }}>{formatTokens(globalStats.totalOutputTokens)}</span>
                </div>

                {/* Cache Tokens (if any) */}
                {(globalStats.totalCacheReadTokens > 0 || globalStats.totalCacheCreationTokens > 0) && (
                  <>
                    <div className="flex justify-between">
                      <span style={{ color: theme.colors.textDim }}>Cache Read</span>
                      <span className="font-mono font-bold" style={{ color: theme.colors.textMain }}>{formatTokens(globalStats.totalCacheReadTokens)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: theme.colors.textDim }}>Cache Creation</span>
                      <span className="font-mono font-bold" style={{ color: theme.colors.textMain }}>{formatTokens(globalStats.totalCacheCreationTokens)}</span>
                    </div>
                  </>
                )}

                {/* Active Time (from current Maestro sessions) */}
                {totalActiveTimeMs > 0 && (
                  <div className="flex justify-between col-span-2 pt-2 border-t" style={{ borderColor: theme.colors.border }}>
                    <span style={{ color: theme.colors.textDim }}>Active Time</span>
                    <span className="font-mono font-bold" style={{ color: theme.colors.textMain }}>{formatDuration(totalActiveTimeMs)}</span>
                  </div>
                )}

                {/* Total Cost - shows pulsing green while counting, solid green when complete */}
                <div className="flex justify-between col-span-2 pt-2 border-t" style={{ borderColor: theme.colors.border }}>
                  <span style={{ color: theme.colors.textDim }}>Total Cost</span>
                  <span
                    className={`font-mono font-bold ${!isStatsComplete ? 'animate-pulse' : ''}`}
                    style={{ color: theme.colors.success }}
                  >
                    ${globalStats.totalCostUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-xs text-center py-2" style={{ color: theme.colors.textDim }}>
                No Claude sessions found
              </div>
            )}
          </div>

          {/* Project Link */}
          <button
            onClick={() => window.maestro.shell.openExternal('https://github.com/pedramamini/Maestro')}
            className="w-full flex items-center justify-between p-3 rounded border hover:bg-white/5 transition-colors"
            style={{ borderColor: theme.colors.border }}
          >
            <div className="flex items-center gap-2">
              <FileCode className="w-4 h-4" style={{ color: theme.colors.accent }} />
              <span className="text-sm font-medium" style={{ color: theme.colors.textMain }}>View on GitHub</span>
            </div>
            <ExternalLink className="w-4 h-4" style={{ color: theme.colors.textDim }} />
          </button>

          {/* Made in Austin */}
          <div className="pt-1 text-center flex flex-col items-center gap-1">
            <span className="text-xs mb-1" style={{ color: theme.colors.textDim }}>Made in Austin, TX</span>
            {/* Texas Flag - Lone Star Flag */}
            <button
              onClick={() => window.maestro.shell.openExternal('https://www.sanjacsaloon.com')}
              className="hover:opacity-100 transition-opacity cursor-pointer"
              style={{ background: 'none', border: 'none', padding: 0 }}
            >
              <svg
                viewBox="0 0 150 100"
                className="w-12 h-8"
                style={{ opacity: 0.7 }}
              >
                {/* Blue vertical stripe */}
                <rect x="0" y="0" width="50" height="100" fill="#002868" />
                {/* White horizontal stripe */}
                <rect x="50" y="0" width="100" height="50" fill="#FFFFFF" />
                {/* Red horizontal stripe */}
                <rect x="50" y="50" width="100" height="50" fill="#BF0A30" />
                {/* White five-pointed star */}
                <polygon
                  points="25,15 29.5,30 45,30 32.5,40 37,55 25,45 13,55 17.5,40 5,30 20.5,30"
                  fill="#FFFFFF"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
