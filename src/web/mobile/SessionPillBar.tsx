/**
 * SessionPillBar component for Maestro mobile web interface
 *
 * A horizontal scrollable bar displaying session pills at the top of the mobile interface.
 * Each pill shows the session name, status dot (color-coded), and mode icon (AI/terminal).
 *
 * Features:
 * - Horizontal scroll with momentum/snap
 * - Touch-friendly tap targets
 * - Color-coded status indicators (green=idle, yellow=busy, red=error, orange=connecting)
 * - Mode indicator (AI vs Terminal)
 * - Active session highlighting
 * - Long-press to show session info popover
 * - Group name display above session pills with collapsible groups
 */

import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { useThemeColors } from '../components/ThemeProvider';
import { StatusDot, type SessionStatus } from '../components/Badge';
import type { Session, GroupInfo } from '../hooks/useSessions';
import { triggerHaptic, HAPTIC_PATTERNS } from './constants';

/** Duration in ms to trigger long-press */
const LONG_PRESS_DURATION = 500;

/**
 * Props for individual session pill
 */
interface SessionPillProps {
  session: Session;
  isActive: boolean;
  onSelect: (sessionId: string) => void;
  onLongPress: (session: Session, rect: DOMRect) => void;
}

/**
 * Individual session pill component
 */
function SessionPill({ session, isActive, onSelect, onLongPress }: SessionPillProps) {
  const colors = useThemeColors();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressTriggeredRef = useRef(false);

  // Map session state to status for StatusDot
  const getStatus = (): SessionStatus => {
    const state = session.state as string;
    if (state === 'idle') return 'idle';
    if (state === 'busy') return 'busy';
    if (state === 'connecting') return 'connecting';
    return 'error';
  };

  // Clear long-press timer
  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  // Start long-press timer
  const startLongPressTimer = useCallback(() => {
    isLongPressTriggeredRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      isLongPressTriggeredRef.current = true;
      triggerHaptic(HAPTIC_PATTERNS.success);
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        onLongPress(session, rect);
      }
    }, LONG_PRESS_DURATION);
  }, [session, onLongPress]);

  // Handle touch/mouse start
  const handlePressStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    // Prevent context menu on long press
    e.preventDefault();
    startLongPressTimer();
  }, [startLongPressTimer]);

  // Handle touch/mouse end
  const handlePressEnd = useCallback(() => {
    clearLongPressTimer();
    // Only trigger tap if long press wasn't triggered
    if (!isLongPressTriggeredRef.current) {
      triggerHaptic(HAPTIC_PATTERNS.tap);
      onSelect(session.id);
    }
    isLongPressTriggeredRef.current = false;
  }, [clearLongPressTimer, onSelect, session.id]);

  // Handle touch/mouse move (cancel long press if moved too far)
  const handlePressMove = useCallback(() => {
    // Cancel long press on move
    clearLongPressTimer();
  }, [clearLongPressTimer]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => clearLongPressTimer();
  }, [clearLongPressTimer]);

  // Mode icon based on input mode
  const renderModeIcon = () => {
    const isAI = session.inputMode === 'ai';
    return (
      <span
        style={{
          fontSize: '10px',
          fontWeight: 600,
          color: isAI ? colors.accent : colors.textDim,
          backgroundColor: isAI ? `${colors.accent}20` : `${colors.textDim}20`,
          padding: '2px 4px',
          borderRadius: '3px',
          lineHeight: 1,
        }}
      >
        {isAI ? 'AI' : '⌘'}
      </span>
    );
  };

  return (
    <button
      ref={buttonRef}
      onTouchStart={handlePressStart}
      onTouchEnd={handlePressEnd}
      onTouchMove={handlePressMove}
      onTouchCancel={handlePressEnd}
      onMouseDown={handlePressStart}
      onMouseUp={handlePressEnd}
      onMouseLeave={handlePressEnd}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '8px 12px',
        borderRadius: '20px',
        border: isActive ? `2px solid ${colors.accent}` : `1px solid ${colors.border}`,
        backgroundColor: isActive ? `${colors.accent}15` : colors.bgSidebar,
        color: colors.textMain,
        fontSize: '13px',
        fontWeight: isActive ? 600 : 400,
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        flexShrink: 0,
        minWidth: 'fit-content',
        touchAction: 'manipulation',
        WebkitTapHighlightColor: 'transparent',
        outline: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
      aria-pressed={isActive}
      aria-label={`${session.name} session, ${getStatus()}, ${session.inputMode} mode${isActive ? ', active' : ''}. Long press for details.`}
    >
      {/* Status dot */}
      <StatusDot status={getStatus()} size="sm" />

      {/* Session name */}
      <span
        style={{
          maxWidth: '120px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {session.name}
      </span>

      {/* Mode icon */}
      {renderModeIcon()}
    </button>
  );
}

/**
 * Props for the session info popover
 */
interface SessionInfoPopoverProps {
  session: Session;
  anchorRect: DOMRect;
  onClose: () => void;
}

/**
 * Popover component displaying detailed session information
 */
function SessionInfoPopover({ session, anchorRect, onClose }: SessionInfoPopoverProps) {
  const colors = useThemeColors();
  const popoverRef = useRef<HTMLDivElement>(null);

  // Get status label based on session state
  const getStatusLabel = (): string => {
    const state = session.state as string;
    if (state === 'idle') return 'Ready';
    if (state === 'busy') return 'Thinking...';
    if (state === 'connecting') return 'Connecting...';
    return 'Error';
  };

  // Get status color based on session state
  const getStatusColor = (): string => {
    const state = session.state as string;
    if (state === 'idle') return '#22c55e'; // green
    if (state === 'busy') return '#eab308'; // yellow
    if (state === 'connecting') return '#f97316'; // orange
    return '#ef4444'; // red
  };

  // Get tool type display name
  const getToolTypeLabel = (): string => {
    const toolTypeMap: Record<string, string> = {
      'claude-code': 'Claude Code',
      'openai-codex': 'OpenAI Codex',
      'gemini-cli': 'Gemini CLI',
      'qwen3-coder': 'Qwen3 Coder',
    };
    return toolTypeMap[session.toolType] || session.toolType;
  };

  // Calculate position - show below the pill, centered
  const calculatePosition = (): React.CSSProperties => {
    const popoverWidth = 280;
    const viewportWidth = window.innerWidth;
    const padding = 12;

    // Center horizontally on the anchor
    let left = anchorRect.left + (anchorRect.width / 2) - (popoverWidth / 2);

    // Keep within viewport bounds
    if (left < padding) {
      left = padding;
    } else if (left + popoverWidth > viewportWidth - padding) {
      left = viewportWidth - popoverWidth - padding;
    }

    return {
      position: 'fixed',
      top: `${anchorRect.bottom + 8}px`,
      left: `${left}px`,
      width: `${popoverWidth}px`,
      zIndex: 1000,
    };
  };

  // Close on outside click/touch
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // Use a short delay to prevent immediate closing from the same event
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [onClose]);

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

  // Truncate path for display
  const truncatePath = (path: string, maxLength: number = 35): string => {
    if (path.length <= maxLength) return path;
    const parts = path.split('/');
    if (parts.length <= 2) return `...${path.slice(-maxLength + 3)}`;
    return `.../${parts.slice(-2).join('/')}`;
  };

  return (
    <>
      {/* Backdrop for dimming */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.3)',
          zIndex: 999,
        }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Popover card */}
      <div
        ref={popoverRef}
        role="dialog"
        aria-label={`Session info for ${session.name}`}
        style={{
          ...calculatePosition(),
          backgroundColor: colors.bgSidebar,
          borderRadius: '12px',
          border: `1px solid ${colors.border}`,
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
          overflow: 'hidden',
          animation: 'popoverFadeIn 0.15s ease-out',
        }}
      >
        {/* Header with session name and close button */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 14px',
            borderBottom: `1px solid ${colors.border}`,
            backgroundColor: `${colors.accent}10`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <StatusDot status={session.state as SessionStatus} size="md" />
            <h3
              style={{
                margin: 0,
                fontSize: '15px',
                fontWeight: 600,
                color: colors.textMain,
              }}
            >
              {session.name}
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close popover"
            style={{
              padding: '4px 8px',
              fontSize: '18px',
              color: colors.textDim,
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              borderRadius: '4px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Session details */}
        <div style={{ padding: '12px 14px' }}>
          {/* Status row */}
          <div style={{ marginBottom: '10px' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 500,
                color: colors.textDim,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              Status
            </span>
            <div
              style={{
                marginTop: '2px',
                fontSize: '14px',
                fontWeight: 500,
                color: getStatusColor(),
              }}
            >
              {getStatusLabel()}
            </div>
          </div>

          {/* Tool type row */}
          <div style={{ marginBottom: '10px' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 500,
                color: colors.textDim,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              Tool
            </span>
            <div
              style={{
                marginTop: '2px',
                fontSize: '14px',
                color: colors.textMain,
              }}
            >
              {getToolTypeLabel()}
            </div>
          </div>

          {/* Mode row */}
          <div style={{ marginBottom: '10px' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 500,
                color: colors.textDim,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              Mode
            </span>
            <div
              style={{
                marginTop: '2px',
                fontSize: '14px',
                color: colors.textMain,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  color: session.inputMode === 'ai' ? colors.accent : colors.textDim,
                  backgroundColor:
                    session.inputMode === 'ai' ? `${colors.accent}20` : `${colors.textDim}20`,
                  padding: '2px 6px',
                  borderRadius: '4px',
                }}
              >
                {session.inputMode === 'ai' ? 'AI' : 'Terminal'}
              </span>
              {session.inputMode === 'ai' ? 'AI Assistant' : 'Command Terminal'}
            </div>
          </div>

          {/* Working directory row */}
          <div>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 500,
                color: colors.textDim,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              Working Directory
            </span>
            <div
              style={{
                marginTop: '2px',
                fontSize: '13px',
                color: colors.textMain,
                fontFamily: 'monospace',
                wordBreak: 'break-all',
              }}
              title={session.cwd}
            >
              {truncatePath(session.cwd)}
            </div>
          </div>
        </div>
      </div>

      {/* Animation keyframes */}
      <style>{`
        @keyframes popoverFadeIn {
          from {
            opacity: 0;
            transform: translateY(-4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </>
  );
}

/**
 * Props for the group header component
 */
interface GroupHeaderProps {
  groupId: string;
  name: string;
  emoji: string | null;
  sessionCount: number;
  isCollapsed: boolean;
  onToggleCollapse: (groupId: string) => void;
}

/**
 * Group header component that displays group name with collapse/expand toggle
 */
function GroupHeader({
  groupId,
  name,
  emoji,
  sessionCount,
  isCollapsed,
  onToggleCollapse,
}: GroupHeaderProps) {
  const colors = useThemeColors();

  const handleClick = useCallback(() => {
    triggerHaptic(HAPTIC_PATTERNS.tap);
    onToggleCollapse(groupId);
  }, [groupId, onToggleCollapse]);

  return (
    <button
      onClick={handleClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 12px',
        backgroundColor: `${colors.accent}10`,
        border: `1px solid ${colors.border}`,
        borderRadius: '16px',
        color: colors.textMain,
        fontSize: '12px',
        fontWeight: 600,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        touchAction: 'manipulation',
        WebkitTapHighlightColor: 'transparent',
        outline: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        transition: 'all 0.15s ease',
      }}
      aria-expanded={!isCollapsed}
      aria-label={`${name} group with ${sessionCount} sessions. ${isCollapsed ? 'Tap to expand' : 'Tap to collapse'}`}
    >
      {/* Collapse/expand indicator */}
      <span
        style={{
          fontSize: '10px',
          color: colors.textDim,
          transition: 'transform 0.2s ease',
          transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
        }}
      >
        ▼
      </span>

      {/* Group emoji (if available) */}
      {emoji && (
        <span style={{ fontSize: '14px' }}>{emoji}</span>
      )}

      {/* Group name */}
      <span>{name}</span>

      {/* Session count badge */}
      <span
        style={{
          fontSize: '10px',
          color: colors.textDim,
          backgroundColor: `${colors.textDim}20`,
          padding: '2px 6px',
          borderRadius: '8px',
          minWidth: '18px',
          textAlign: 'center',
        }}
      >
        {sessionCount}
      </span>
    </button>
  );
}

/**
 * Props for the SessionPillBar component
 */
export interface SessionPillBarProps {
  /** List of sessions to display */
  sessions: Session[];
  /** ID of the currently active session */
  activeSessionId: string | null;
  /** Callback when a session is selected */
  onSelectSession: (sessionId: string) => void;
  /** Callback to open the All Sessions view */
  onOpenAllSessions?: () => void;
  /** Callback to open the History panel */
  onOpenHistory?: () => void;
  /** Callback to open the Scratchpad panel */
  onOpenScratchpad?: () => void;
  /** Optional className for additional styling */
  className?: string;
  /** Optional inline styles */
  style?: React.CSSProperties;
}

/**
 * Popover state interface
 */
interface PopoverState {
  session: Session;
  anchorRect: DOMRect;
}

/**
 * SessionPillBar component
 *
 * Renders a horizontally scrollable bar of session pills for the mobile interface.
 * Sessions are organized by groups with collapsible group headers.
 * Supports long-press on pills to show session info popover.
 *
 * @example
 * ```tsx
 * <SessionPillBar
 *   sessions={sessions}
 *   activeSessionId={activeSession?.id}
 *   onSelectSession={(id) => setActiveSessionId(id)}
 * />
 * ```
 */
export function SessionPillBar({
  sessions,
  activeSessionId,
  onSelectSession,
  onOpenAllSessions,
  onOpenHistory,
  onOpenScratchpad,
  className = '',
  style,
}: SessionPillBarProps) {
  const colors = useThemeColors();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [popoverState, setPopoverState] = useState<PopoverState | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Organize sessions by group
  const sessionsByGroup = useMemo((): Record<string, GroupInfo> => {
    const groups: Record<string, GroupInfo> = {};

    for (const session of sessions) {
      const groupKey = session.groupId || 'ungrouped';

      if (!groups[groupKey]) {
        groups[groupKey] = {
          id: session.groupId || null,
          name: session.groupName || 'Ungrouped',
          emoji: session.groupEmoji || null,
          sessions: [],
        };
      }
      groups[groupKey].sessions.push(session);
    }

    return groups;
  }, [sessions]);

  // Get sorted group keys (ungrouped last)
  const sortedGroupKeys = useMemo(() => {
    const keys = Object.keys(sessionsByGroup);
    return keys.sort((a, b) => {
      // Put 'ungrouped' at the end
      if (a === 'ungrouped') return 1;
      if (b === 'ungrouped') return -1;
      // Sort others alphabetically by group name
      return sessionsByGroup[a].name.localeCompare(sessionsByGroup[b].name);
    });
  }, [sessionsByGroup]);

  // Check if there are multiple groups (to decide whether to show group headers)
  const hasMultipleGroups = sortedGroupKeys.length > 1 ||
    (sortedGroupKeys.length === 1 && sortedGroupKeys[0] !== 'ungrouped');

  // Handle long-press on a session pill
  const handleLongPress = useCallback((session: Session, rect: DOMRect) => {
    setPopoverState({ session, anchorRect: rect });
  }, []);

  // Close the popover
  const handleClosePopover = useCallback(() => {
    setPopoverState(null);
  }, []);

  // Toggle group collapsed state
  const handleToggleCollapse = useCallback((groupId: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  // Scroll active session into view when it changes
  useEffect(() => {
    if (!activeSessionId || !scrollContainerRef.current) return;

    const container = scrollContainerRef.current;
    const activeButton = container.querySelector(`[aria-pressed="true"]`) as HTMLElement | null;

    if (activeButton) {
      // Calculate the scroll position to center the active pill
      const containerWidth = container.offsetWidth;
      const buttonLeft = activeButton.offsetLeft;
      const buttonWidth = activeButton.offsetWidth;
      const scrollTarget = buttonLeft - (containerWidth / 2) + (buttonWidth / 2);

      container.scrollTo({
        left: Math.max(0, scrollTarget),
        behavior: 'smooth',
      });
    }
  }, [activeSessionId]);

  // Don't render if no sessions
  if (sessions.length === 0) {
    return (
      <div
        style={{
          padding: '12px 16px',
          borderBottom: `1px solid ${colors.border}`,
          backgroundColor: colors.bgSidebar,
          ...style,
        }}
        className={className}
      >
        <p
          style={{
            fontSize: '13px',
            color: colors.textDim,
            textAlign: 'center',
            margin: 0,
          }}
        >
          No sessions available
        </p>
      </div>
    );
  }

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          borderBottom: `1px solid ${colors.border}`,
          backgroundColor: colors.bgSidebar,
          ...style,
        }}
        className={className}
      >
        {/* Pinned hamburger menu button - always visible */}
        {onOpenAllSessions && (
          <div
            style={{
              flexShrink: 0,
              paddingLeft: '12px',
              paddingRight: '4px',
              paddingTop: '10px',
              paddingBottom: '10px',
              display: 'flex',
              gap: '6px',
            }}
          >
            <button
              onClick={() => {
                triggerHaptic(HAPTIC_PATTERNS.tap);
                onOpenAllSessions();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '36px',
                height: '36px',
                borderRadius: '18px',
                border: `1px solid ${colors.border}`,
                backgroundColor: colors.bgMain,
                color: colors.textMain,
                cursor: 'pointer',
                flexShrink: 0,
                padding: 0,
                touchAction: 'manipulation',
                WebkitTapHighlightColor: 'transparent',
                outline: 'none',
              }}
              aria-label={`View all ${sessions.length} sessions`}
              title="All Sessions"
            >
              {/* Hamburger icon */}
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            {/* History button - pinned next to hamburger */}
            {onOpenHistory && (
              <button
                onClick={() => {
                  triggerHaptic(HAPTIC_PATTERNS.tap);
                  onOpenHistory();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '36px',
                  height: '36px',
                  borderRadius: '18px',
                  border: `1px solid ${colors.border}`,
                  backgroundColor: colors.bgMain,
                  color: colors.textMain,
                  cursor: 'pointer',
                  flexShrink: 0,
                  padding: 0,
                  touchAction: 'manipulation',
                  WebkitTapHighlightColor: 'transparent',
                  outline: 'none',
                }}
                aria-label="View history"
                title="History"
              >
                {/* Clock/history icon */}
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </button>
            )}
            {/* Scratchpad button - pinned next to history */}
            {onOpenScratchpad && (
              <button
                onClick={() => {
                  triggerHaptic(HAPTIC_PATTERNS.tap);
                  onOpenScratchpad();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '36px',
                  height: '36px',
                  borderRadius: '18px',
                  border: `1px solid ${colors.border}`,
                  backgroundColor: colors.bgMain,
                  color: colors.textMain,
                  cursor: 'pointer',
                  flexShrink: 0,
                  padding: 0,
                  touchAction: 'manipulation',
                  WebkitTapHighlightColor: 'transparent',
                  outline: 'none',
                }}
                aria-label="Open scratchpad"
                title="Scratchpad"
              >
                {/* Checklist/task icon */}
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 11l3 3L22 4" />
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
              </button>
            )}
          </div>
        )}

        {/* Scrollable container */}
        <div
          ref={scrollContainerRef}
          style={{
            display: 'flex',
            flex: 1,
            gap: '8px',
            padding: '10px 16px',
            paddingLeft: onOpenAllSessions ? '8px' : '16px',
            overflowX: 'auto',
            overflowY: 'hidden',
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            scrollSnapType: 'x proximity',
          }}
          // Hide scrollbar using inline style (for webkit browsers)
          className="hide-scrollbar"
          role="tablist"
          aria-label="Session selector organized by groups. Long press a session for details."
        >
          {sortedGroupKeys.map((groupKey) => {
            const group = sessionsByGroup[groupKey];
            const isCollapsed = collapsedGroups.has(groupKey);
            const showGroupHeader = hasMultipleGroups;

            return (
              <React.Fragment key={groupKey}>
                {/* Group header (only show if multiple groups exist) */}
                {showGroupHeader && (
                  <div
                    style={{
                      scrollSnapAlign: 'start',
                    }}
                    role="presentation"
                  >
                    <GroupHeader
                      groupId={groupKey}
                      name={group.name}
                      emoji={group.emoji}
                      sessionCount={group.sessions.length}
                      isCollapsed={isCollapsed}
                      onToggleCollapse={handleToggleCollapse}
                    />
                  </div>
                )}

                {/* Session pills (hidden when collapsed) */}
                {!isCollapsed && group.sessions.map((session) => (
                  <div
                    key={session.id}
                    style={{
                      scrollSnapAlign: 'start',
                    }}
                    role="presentation"
                  >
                    <SessionPill
                      session={session}
                      isActive={session.id === activeSessionId}
                      onSelect={onSelectSession}
                      onLongPress={handleLongPress}
                    />
                  </div>
                ))}
              </React.Fragment>
            );
          })}

        </div>

        {/* Inline style for hiding scrollbar */}
        <style>{`
          .hide-scrollbar::-webkit-scrollbar {
            display: none;
          }
        `}</style>
      </div>

      {/* Session info popover */}
      {popoverState && (
        <SessionInfoPopover
          session={popoverState.session}
          anchorRect={popoverState.anchorRect}
          onClose={handleClosePopover}
        />
      )}
    </>
  );
}

export default SessionPillBar;
