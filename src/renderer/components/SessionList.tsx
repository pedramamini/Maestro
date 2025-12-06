import React, { useState, useEffect, useRef } from 'react';
import {
  Wand2, Plus, Settings, ChevronRight, ChevronDown, Activity, X, Keyboard,
  Radio, Copy, ExternalLink, PanelLeftClose, PanelLeftOpen, Folder, Info, FileText, GitBranch, Bot, Clock,
  ScrollText, Cpu, Menu, Bookmark, Trophy, Trash2, Edit3, FolderInput
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import type { Session, Group, Theme, Shortcut, AutoRunStats } from '../types';
import { CONDUCTOR_BADGES, getBadgeForTime } from '../constants/conductorBadges';
import { getStatusColor, getContextColor, formatActiveTime } from '../utils/theme';
import { gitService } from '../services/git';
import { formatShortcutKeys } from '../utils/shortcutFormatter';

// ============================================================================
// SessionContextMenu - Right-click context menu for session items
// ============================================================================

interface SessionContextMenuProps {
  x: number;
  y: number;
  theme: Theme;
  session: Session;
  groups: Group[];
  onRename: () => void;
  onToggleBookmark: () => void;
  onMoveToGroup: (groupId: string) => void;
  onDelete: () => void;
  onDismiss: () => void;
}

function SessionContextMenu({
  x,
  y,
  theme,
  session,
  groups,
  onRename,
  onToggleBookmark,
  onMoveToGroup,
  onDelete,
  onDismiss
}: SessionContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [showMoveSubmenu, setShowMoveSubmenu] = useState(false);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onDismiss]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onDismiss();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onDismiss]);

  // Adjust menu position to stay within viewport
  const adjustedPosition = {
    left: Math.min(x, window.innerWidth - 200),
    top: Math.min(y, window.innerHeight - 250)
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-50 py-1 rounded-md shadow-xl border"
      style={{
        left: adjustedPosition.left,
        top: adjustedPosition.top,
        backgroundColor: theme.colors.bgSidebar,
        borderColor: theme.colors.border,
        minWidth: '160px'
      }}
    >
      {/* Rename */}
      <button
        onClick={() => {
          onRename();
          onDismiss();
        }}
        className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 transition-colors flex items-center gap-2"
        style={{ color: theme.colors.textMain }}
      >
        <Edit3 className="w-3.5 h-3.5" />
        Rename
      </button>

      {/* Toggle Bookmark */}
      <button
        onClick={() => {
          onToggleBookmark();
          onDismiss();
        }}
        className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 transition-colors flex items-center gap-2"
        style={{ color: theme.colors.textMain }}
      >
        <Bookmark className="w-3.5 h-3.5" fill={session.bookmarked ? 'currentColor' : 'none'} />
        {session.bookmarked ? 'Remove Bookmark' : 'Add Bookmark'}
      </button>

      {/* Divider */}
      <div className="my-1 border-t" style={{ borderColor: theme.colors.border }} />

      {/* Move to Group - with submenu */}
      <div
        className="relative"
        onMouseEnter={() => setShowMoveSubmenu(true)}
        onMouseLeave={() => setShowMoveSubmenu(false)}
      >
        <button
          className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 transition-colors flex items-center justify-between"
          style={{ color: theme.colors.textMain }}
        >
          <span className="flex items-center gap-2">
            <FolderInput className="w-3.5 h-3.5" />
            Move to Group
          </span>
          <ChevronRight className="w-3 h-3" />
        </button>

        {/* Submenu */}
        {showMoveSubmenu && (
          <div
            className="absolute left-full top-0 ml-1 py-1 rounded-md shadow-xl border"
            style={{
              backgroundColor: theme.colors.bgSidebar,
              borderColor: theme.colors.border,
              minWidth: '140px'
            }}
          >
            {/* No Group option */}
            <button
              onClick={() => {
                onMoveToGroup('');
                onDismiss();
              }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 transition-colors flex items-center gap-2 ${!session.groupId ? 'opacity-50' : ''}`}
              style={{ color: theme.colors.textMain }}
              disabled={!session.groupId}
            >
              <Folder className="w-3.5 h-3.5" />
              Ungrouped
              {!session.groupId && <span className="text-[10px] opacity-50">(current)</span>}
            </button>

            {/* Divider if there are groups */}
            {groups.length > 0 && (
              <div className="my-1 border-t" style={{ borderColor: theme.colors.border }} />
            )}

            {/* Group options */}
            {groups.map(group => (
              <button
                key={group.id}
                onClick={() => {
                  onMoveToGroup(group.id);
                  onDismiss();
                }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 transition-colors flex items-center gap-2 ${session.groupId === group.id ? 'opacity-50' : ''}`}
                style={{ color: theme.colors.textMain }}
                disabled={session.groupId === group.id}
              >
                <span>{group.emoji}</span>
                <span className="truncate">{group.name}</span>
                {session.groupId === group.id && <span className="text-[10px] opacity-50">(current)</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="my-1 border-t" style={{ borderColor: theme.colors.border }} />

      {/* Delete */}
      <button
        onClick={() => {
          onDelete();
          onDismiss();
        }}
        className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 transition-colors flex items-center gap-2"
        style={{ color: theme.colors.error }}
      >
        <Trash2 className="w-3.5 h-3.5" />
        Remove Agent
      </button>
    </div>
  );
}

// Strip leading emojis from a string for alphabetical sorting
// Matches common emoji patterns at the start of the string
const stripLeadingEmojis = (str: string): string => {
  // Match emojis at the start: emoji characters, variation selectors, ZWJ sequences, etc.
  // This regex matches most common emoji patterns including:
  // - Basic emojis (😀, 🎉, etc.)
  // - Emojis with skin tone modifiers
  // - Flag emojis
  // - ZWJ sequences (👨‍👩‍👧, etc.)
  const emojiRegex = /^(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F?|\p{Emoji_Modifier_Base}\p{Emoji_Modifier}?)+\s*/gu;
  return str.replace(emojiRegex, '').trim();
};

// Compare two session names, ignoring leading emojis for alphabetization
const compareSessionNames = (a: string, b: string): number => {
  const aStripped = stripLeadingEmojis(a);
  const bStripped = stripLeadingEmojis(b);
  return aStripped.localeCompare(bStripped);
};

interface SessionListProps {
  // State
  theme: Theme;
  sessions: Session[];
  groups: Group[];
  sortedSessions: Session[];
  activeSessionId: string;
  leftSidebarOpen: boolean;
  leftSidebarWidthState: number;
  activeFocus: string;
  selectedSidebarIndex: number;
  editingGroupId: string | null;
  editingSessionId: string | null;
  draggingSessionId: string | null;
  shortcuts: Record<string, Shortcut>;

  // Global Live Mode
  isLiveMode: boolean;
  webInterfaceUrl: string | null;
  toggleGlobalLive: () => void;

  // Bookmarks folder state (lifted from component to App.tsx for keyboard shortcut access)
  bookmarksCollapsed: boolean;
  setBookmarksCollapsed: (collapsed: boolean) => void;

  // Handlers
  setActiveFocus: (focus: string) => void;
  setActiveSessionId: (id: string) => void;
  setLeftSidebarOpen: (open: boolean) => void;
  setLeftSidebarWidthState: (width: number) => void;
  setShortcutsHelpOpen: (open: boolean) => void;
  setSettingsModalOpen: (open: boolean) => void;
  setSettingsTab: (tab: string) => void;
  setAboutModalOpen: (open: boolean) => void;
  setLogViewerOpen: (open: boolean) => void;
  setProcessMonitorOpen: (open: boolean) => void;
  toggleGroup: (groupId: string) => void;
  handleDragStart: (sessionId: string) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDropOnGroup: (groupId: string) => void;
  handleDropOnUngrouped: () => void;
  finishRenamingGroup: (groupId: string, newName: string) => void;
  finishRenamingSession: (sessId: string, newName: string) => void;
  startRenamingGroup: (groupId: string) => void;
  startRenamingSession: (sessId: string) => void;
  showConfirmation: (message: string, onConfirm: () => void) => void;
  setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
  setSessions: React.Dispatch<React.SetStateAction<Session[]>>;
  createNewGroup: () => void;
  addNewSession: () => void;

  // Rename modal handlers (for context menu rename)
  setRenameInstanceModalOpen: (open: boolean) => void;
  setRenameInstanceValue: (value: string) => void;
  setRenameInstanceSessionId: (id: string) => void;

  // Auto mode props
  activeBatchSessionIds?: string[]; // Session IDs that are running in auto mode

  // Session jump shortcut props (Opt+Cmd+NUMBER)
  showSessionJumpNumbers?: boolean;
  visibleSessions?: Session[];

  // Achievement system props
  autoRunStats?: AutoRunStats;
}

export function SessionList(props: SessionListProps) {
  const {
    theme, sessions, groups, sortedSessions, activeSessionId, leftSidebarOpen,
    leftSidebarWidthState, activeFocus, selectedSidebarIndex, editingGroupId,
    editingSessionId, draggingSessionId, shortcuts,
    isLiveMode, webInterfaceUrl, toggleGlobalLive,
    bookmarksCollapsed, setBookmarksCollapsed,
    setActiveFocus, setActiveSessionId, setLeftSidebarOpen, setLeftSidebarWidthState,
    setShortcutsHelpOpen, setSettingsModalOpen, setSettingsTab, setAboutModalOpen, setLogViewerOpen, setProcessMonitorOpen, toggleGroup,
    handleDragStart, handleDragOver, handleDropOnGroup, handleDropOnUngrouped,
    finishRenamingGroup, finishRenamingSession, startRenamingGroup,
    startRenamingSession, showConfirmation, setGroups, setSessions, createNewGroup, addNewSession,
    setRenameInstanceModalOpen, setRenameInstanceValue, setRenameInstanceSessionId,
    activeBatchSessionIds = [],
    showSessionJumpNumbers = false,
    visibleSessions = [],
    autoRunStats
  } = props;

  const [sessionFilter, setSessionFilter] = useState('');
  const [sessionFilterOpen, setSessionFilterOpen] = useState(false);
  const [ungroupedCollapsed, setUngroupedCollapsed] = useState(false);
  const [preFilterGroupStates, setPreFilterGroupStates] = useState<Map<string, boolean>>(new Map());
  const [preFilterBookmarksCollapsed, setPreFilterBookmarksCollapsed] = useState<boolean | null>(null);
  // Remember user's preferred states while in filter mode (persists across filter open/close within session)
  const [filterModeGroupStates, setFilterModeGroupStates] = useState<Map<string, boolean> | null>(null);
  const [filterModeBookmarksCollapsed, setFilterModeBookmarksCollapsed] = useState<boolean | null>(null);
  const [filterModeInitialized, setFilterModeInitialized] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [liveOverlayOpen, setLiveOverlayOpen] = useState(false);

  // Cloudflared installation status (cached after first check)
  const [cloudflaredInstalled, setCloudflaredInstalled] = useState<boolean | null>(null);
  const [cloudflaredChecked, setCloudflaredChecked] = useState(false);

  // Tunnel state
  const [tunnelStatus, setTunnelStatus] = useState<'off' | 'starting' | 'connected' | 'error'>('off');
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);
  const [tunnelError, setTunnelError] = useState<string | null>(null);
  const [activeUrlTab, setActiveUrlTab] = useState<'local' | 'remote'>('local');
  const [copyFlash, setCopyFlash] = useState<string | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; sessionId: string } | null>(null);
  const contextMenuSession = contextMenu ? sessions.find(s => s.id === contextMenu.sessionId) : null;
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const liveOverlayRef = useRef<HTMLDivElement>(null);


  // Close live overlay when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (liveOverlayRef.current && !liveOverlayRef.current.contains(e.target as Node)) {
        setLiveOverlayOpen(false);
      }
    };
    if (liveOverlayOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [liveOverlayOpen]);

  // Check for cloudflared installation when Live overlay opens
  useEffect(() => {
    if (isLiveMode && liveOverlayOpen && !cloudflaredChecked) {
      window.maestro.tunnel.isCloudflaredInstalled().then((installed: boolean) => {
        setCloudflaredInstalled(installed);
        setCloudflaredChecked(true);
      });
    }
  }, [isLiveMode, liveOverlayOpen, cloudflaredChecked]);

  // Reset tunnel state when live mode is disabled
  useEffect(() => {
    if (!isLiveMode) {
      setTunnelStatus('off');
      setTunnelUrl(null);
      setTunnelError(null);
      setActiveUrlTab('local');
    }
  }, [isLiveMode]);

  // Handle tunnel toggle (start/stop remote access)
  const handleTunnelToggle = async () => {
    if (tunnelStatus === 'connected') {
      // Turn off tunnel
      try {
        await window.maestro.tunnel.stop();
      } catch (error) {
        console.error('[handleTunnelToggle] Failed to stop tunnel:', error);
        // Continue anyway - we still want to update UI state
      }
      setTunnelStatus('off');
      setTunnelUrl(null);
      setTunnelError(null);
      setActiveUrlTab('local'); // Switch back to local tab
    } else if (tunnelStatus === 'off') {
      // Turn on tunnel
      setTunnelStatus('starting');
      setTunnelError(null);

      try {
        const result = await window.maestro.tunnel.start();
        if (result.success && result.url) {
          setTunnelStatus('connected');
          setTunnelUrl(result.url);
          setActiveUrlTab('remote'); // Auto-switch to remote tab
        } else {
          setTunnelStatus('error');
          setTunnelError(result.error || 'Failed to start tunnel');
        }
      } catch (error) {
        console.error('[handleTunnelToggle] Failed to start tunnel:', error);
        setTunnelStatus('error');
        setTunnelError(error instanceof Error ? error.message : 'Failed to start tunnel');
      }
    }
  };

  // Toggle bookmark for a session
  const toggleBookmark = (sessionId: string) => {
    setSessions(prev => prev.map(s =>
      s.id === sessionId ? { ...s, bookmarked: !s.bookmarked } : s
    ));
  };

  // Context menu handlers
  const handleContextMenu = (e: React.MouseEvent, sessionId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, sessionId });
  };

  const handleMoveToGroup = (sessionId: string, groupId: string) => {
    setSessions(prev => prev.map(s =>
      s.id === sessionId ? { ...s, groupId: groupId || undefined } : s
    ));
  };

  const handleDeleteSession = (sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;
    showConfirmation(
      `Are you sure you want to remove "${session.name}"? This action cannot be undone.`,
      () => {
        const newSessions = sessions.filter(s => s.id !== sessionId);
        setSessions(newSessions);
        // If deleting the active session, switch to another one
        if (activeSessionId === sessionId && newSessions.length > 0) {
          setActiveSessionId(newSessions[0].id);
        }
      }
    );
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [menuOpen]);

  // Close overlays/menus with Escape key
  useEffect(() => {
    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (liveOverlayOpen) {
          setLiveOverlayOpen(false);
          e.stopPropagation();
        } else if (menuOpen) {
          setMenuOpen(false);
          e.stopPropagation();
        }
      }
    };
    if (liveOverlayOpen || menuOpen) {
      document.addEventListener('keydown', handleEscKey);
      return () => document.removeEventListener('keydown', handleEscKey);
    }
  }, [liveOverlayOpen, menuOpen]);

  // Track git file change counts per session
  const [gitFileCounts, setGitFileCounts] = useState<Map<string, number>>(new Map());

  // Poll git status for all Git sessions - optimized to reduce CPU usage
  // - Only polls when app is visible (pauses when in background)
  // - Uses 30-second interval instead of 10 seconds
  // - Only polls sessions that are git repos
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;

    const pollGitStatus = async () => {
      // Skip polling if document is hidden (app in background)
      if (document.hidden) return;

      const gitSessions = sessions.filter(s => s.isGitRepo);
      if (gitSessions.length === 0) return;

      // Parallelize git status calls for better performance
      // Sequential calls with 10 sessions = 1-2s, parallel = 200-300ms
      const results = await Promise.all(
        gitSessions.map(async (session) => {
          try {
            const cwd = session.inputMode === 'terminal' ? (session.shellCwd || session.cwd) : session.cwd;
            const status = await gitService.getStatus(cwd);
            return [session.id, status.files.length] as const;
          } catch {
            return null;
          }
        })
      );

      const newCounts = new Map<string, number>();
      for (const result of results) {
        if (result) {
          newCounts.set(result[0], result[1]);
        }
      }

      setGitFileCounts(newCounts);
    };

    const startPolling = () => {
      pollGitStatus();
      intervalId = setInterval(pollGitStatus, 30000); // Poll every 30 seconds (was 10)
    };

    const stopPolling = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    // Handle visibility changes - pause polling when app is in background
    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        // Resume polling and immediately refresh when becoming visible
        startPolling();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Start polling if document is visible
    if (!document.hidden) {
      startPolling();
    }

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [sessions]);

  // Filter sessions based on search query (searches session name AND AI tab names)
  const filteredSessions = sessionFilter
    ? sessions.filter(s => {
        const query = sessionFilter.toLowerCase();
        // Match session name
        if (s.name.toLowerCase().includes(query)) return true;
        // Match any AI tab name
        if (s.aiTabs?.some(tab => tab.name?.toLowerCase().includes(query))) return true;
        return false;
      })
    : sessions;

  // When filter opens, apply filter mode preferences (or defaults on first open)
  // When filter closes, save current states as filter mode preferences and restore original states
  useEffect(() => {
    if (sessionFilterOpen) {
      // Save current (non-filter) states when filter opens
      if (preFilterGroupStates.size === 0) {
        const currentStates = new Map<string, boolean>();
        groups.forEach(g => currentStates.set(g.id, g.collapsed));
        setPreFilterGroupStates(currentStates);
      }
      if (preFilterBookmarksCollapsed === null) {
        setPreFilterBookmarksCollapsed(bookmarksCollapsed);
      }

      // Apply filter mode preferences if we have them, otherwise use defaults
      if (filterModeInitialized && filterModeGroupStates) {
        // Restore user's preferred filter mode states
        setGroups(prev => prev.map(g => ({
          ...g,
          collapsed: filterModeGroupStates.get(g.id) ?? true
        })));
        setBookmarksCollapsed(filterModeBookmarksCollapsed ?? false);
      } else {
        // First time opening filter - use defaults: collapse all groups, expand bookmarks
        setGroups(prev => prev.map(g => ({ ...g, collapsed: true })));
        setBookmarksCollapsed(false);
        setFilterModeInitialized(true);
      }
    } else {
      // Filter closing - save current states as filter mode preferences
      if (preFilterGroupStates.size > 0) {
        const currentFilterStates = new Map<string, boolean>();
        groups.forEach(g => currentFilterStates.set(g.id, g.collapsed));
        setFilterModeGroupStates(currentFilterStates);
        setFilterModeBookmarksCollapsed(bookmarksCollapsed);

        // Restore original (non-filter) states
        setGroups(prev => prev.map(g => ({
          ...g,
          collapsed: preFilterGroupStates.get(g.id) ?? g.collapsed
        })));
        setPreFilterGroupStates(new Map());
      }
      if (preFilterBookmarksCollapsed !== null) {
        setBookmarksCollapsed(preFilterBookmarksCollapsed);
        setPreFilterBookmarksCollapsed(null);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionFilterOpen]);

  // Temporarily expand groups when filtering to show matching sessions
  // Note: Only depend on sessionFilter and sessions (not filteredSessions which changes reference each render)
  useEffect(() => {
    if (sessionFilter) {
      // Find groups that contain matching sessions (search session name AND AI tab names)
      const groupsWithMatches = new Set<string>();
      const query = sessionFilter.toLowerCase();
      const matchingSessions = sessions.filter(s => {
        if (s.name.toLowerCase().includes(query)) return true;
        if (s.aiTabs?.some(tab => tab.name?.toLowerCase().includes(query))) return true;
        return false;
      });

      matchingSessions.forEach(session => {
        if (session.groupId) {
          groupsWithMatches.add(session.groupId);
        }
      });

      // Check if any matching sessions are bookmarked
      const hasMatchingBookmarks = matchingSessions.some(s => s.bookmarked);

      // Temporarily expand groups with matches
      setGroups(prev => prev.map(g => ({
        ...g,
        collapsed: groupsWithMatches.has(g.id) ? false : g.collapsed
      })));

      // Temporarily expand bookmarks if there are matching bookmarked sessions
      if (hasMatchingBookmarks) {
        setBookmarksCollapsed(false);
      }
    } else if (sessionFilterOpen) {
      // Filter cleared but filter input still open - collapse groups again, keep bookmarks expanded
      setGroups(prev => prev.map(g => ({ ...g, collapsed: true })));
      setBookmarksCollapsed(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionFilter]);

  // Get the jump number (1-9, 0=10th) for a session based on its position in visibleSessions
  const getSessionJumpNumber = (sessionId: string): string | null => {
    if (!showSessionJumpNumbers) return null;
    const index = visibleSessions.findIndex(s => s.id === sessionId);
    if (index < 0 || index >= 10) return null;
    // Show 1-9 for positions 0-8, and 0 for position 9 (10th session)
    return index === 9 ? '0' : String(index + 1);
  };

  return (
    <div
      tabIndex={0}
      className={`border-r flex flex-col shrink-0 transition-all duration-300 outline-none relative z-20 ${activeFocus === 'sidebar' ? 'ring-1 ring-inset' : ''}`}
      style={{
        width: leftSidebarOpen ? `${leftSidebarWidthState}px` : '64px',
        backgroundColor: theme.colors.bgSidebar,
        borderColor: theme.colors.border,
        ringColor: theme.colors.accent
      }}
      onClick={() => setActiveFocus('sidebar')}
      onFocus={() => setActiveFocus('sidebar')}
      onKeyDown={(e) => {
        // Open session filter with / key when sidebar has focus
        if (e.key === '/' && activeFocus === 'sidebar' && leftSidebarOpen && !sessionFilterOpen) {
          e.preventDefault();
          setSessionFilterOpen(true);
        }
      }}
    >
      {/* Resize Handle */}
      {leftSidebarOpen && (
        <div
          className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-500 transition-colors z-20"
          onMouseDown={(e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startWidth = leftSidebarWidthState;
            let currentWidth = startWidth;

            const handleMouseMove = (e: MouseEvent) => {
              const delta = e.clientX - startX;
              currentWidth = Math.max(256, Math.min(600, startWidth + delta));
              setLeftSidebarWidthState(currentWidth);
            };

            const handleMouseUp = () => {
              window.maestro.settings.set('leftSidebarWidth', currentWidth);
              document.removeEventListener('mousemove', handleMouseMove);
              document.removeEventListener('mouseup', handleMouseUp);
            };

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
          }}
        />
      )}

      {/* Branding Header */}
      <div className="p-4 border-b flex items-center justify-between h-16 shrink-0" style={{ borderColor: theme.colors.border }}>
        {leftSidebarOpen ? (
          <>
            <div className="flex items-center gap-2">
              <Wand2 className="w-5 h-5" style={{ color: theme.colors.accent }} />
              <h1 className="font-bold tracking-widest text-lg" style={{ color: theme.colors.textMain }}>MAESTRO</h1>
              {/* Badge Level Indicator */}
              {autoRunStats && autoRunStats.currentBadgeLevel > 0 && (
                <button
                  onClick={() => setAboutModalOpen(true)}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors hover:bg-white/10"
                  title={`${getBadgeForTime(autoRunStats.cumulativeTimeMs)?.name || 'Apprentice'} - Click to view achievements`}
                  style={{
                    color: autoRunStats.currentBadgeLevel >= 8 ? '#FFD700' : theme.colors.accent,
                  }}
                >
                  <Trophy className="w-3 h-3" />
                  <span>{autoRunStats.currentBadgeLevel}</span>
                </button>
              )}
              {/* Global LIVE Toggle */}
              <div className="ml-2 relative" ref={liveOverlayRef}>
                <button
                  onClick={() => {
                    if (!isLiveMode) {
                      toggleGlobalLive();
                      setLiveOverlayOpen(true);
                    } else {
                      setLiveOverlayOpen(!liveOverlayOpen);
                    }
                  }}
                  className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                    isLiveMode
                      ? 'bg-green-500/20 text-green-500 hover:bg-green-500/30'
                      : 'text-gray-500 hover:bg-white/10'
                  }`}
                  title={isLiveMode ? "Web interface active - Click to show URL" : "Click to enable web interface"}
                >
                  <Radio className={`w-3 h-3 ${isLiveMode ? 'animate-pulse' : ''}`} />
                  {isLiveMode ? 'LIVE' : 'OFFLINE'}
                </button>

                {/* LIVE Overlay with URL and QR Code - Single QR with pill selector */}
                {isLiveMode && liveOverlayOpen && webInterfaceUrl && (
                  <div
                    className="absolute top-full left-0 pt-2 z-50 outline-none"
                    style={{ width: '280px' }}
                    tabIndex={-1}
                    onKeyDown={(e) => {
                      // Arrow key navigation between Local/Remote
                      if (tunnelStatus === 'connected') {
                        if (e.key === 'ArrowLeft') {
                          setActiveUrlTab('local');
                        } else if (e.key === 'ArrowRight') {
                          setActiveUrlTab('remote');
                        }
                      }
                    }}
                  >
                    <div
                      className="rounded-lg shadow-2xl overflow-hidden"
                      style={{
                        backgroundColor: theme.colors.bgSidebar,
                        border: `1px solid ${theme.colors.border}`
                      }}
                    >
                      {/* Description Header */}
                      <div className="p-3 border-b" style={{ borderColor: theme.colors.border }}>
                        <div className="text-[11px] leading-relaxed" style={{ color: theme.colors.textDim }}>
                          Control your AI sessions from your phone or tablet.
                          {tunnelStatus === 'connected' ? (
                            <span className="text-blue-400"> Remote tunnel active — access Maestro from anywhere, even outside your network.</span>
                          ) : (
                            <span> Scan the QR code on your local network, or enable remote access to control Maestro from anywhere.</span>
                          )}
                        </div>
                      </div>

                      {/* Remote Access Toggle Section */}
                      <div className="p-3 border-b" style={{ borderColor: theme.colors.border }}>
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-[10px] uppercase font-bold" style={{ color: theme.colors.textDim }}>
                              Remote Access
                            </div>
                            {cloudflaredInstalled === false && (
                              <div className="text-[9px] text-yellow-500 mt-1">
                                Install cloudflared to enable
                              </div>
                            )}
                          </div>

                          {/* Toggle Switch */}
                          <button
                            onClick={handleTunnelToggle}
                            disabled={!cloudflaredInstalled || tunnelStatus === 'starting'}
                            className={`relative w-10 h-5 rounded-full transition-colors ${
                              tunnelStatus === 'connected'
                                ? 'bg-green-500'
                                : cloudflaredInstalled
                                  ? 'bg-gray-600 hover:bg-gray-500'
                                  : 'bg-gray-700 opacity-50 cursor-not-allowed'
                            }`}
                            title={
                              !cloudflaredInstalled
                                ? 'cloudflared not installed'
                                : tunnelStatus === 'connected'
                                  ? 'Disable remote access'
                                  : 'Enable remote access'
                            }
                          >
                            <div
                              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                                tunnelStatus === 'connected' ? 'translate-x-5' : 'translate-x-0.5'
                              }`}
                            />
                            {tunnelStatus === 'starting' && (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              </div>
                            )}
                          </button>
                        </div>

                        {/* Error Message */}
                        {tunnelStatus === 'error' && tunnelError && (
                          <div className="mt-2 text-[10px] text-red-400">
                            {tunnelError}
                          </div>
                        )}

                        {/* Install Instructions (when cloudflared not found) */}
                        {cloudflaredInstalled === false && (
                          <div className="mt-2 p-2 rounded text-[10px]" style={{ backgroundColor: theme.colors.bgActivity }}>
                            <div className="font-medium mb-1">To enable remote access:</div>
                            <div className="opacity-70 font-mono">
                              brew install cloudflared
                            </div>
                            <button
                              onClick={() => window.maestro.shell.openExternal('https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/')}
                              className="text-blue-400 hover:underline mt-1 block"
                            >
                              Other platforms →
                            </button>
                          </div>
                        )}
                      </div>

                      {/* URL and QR Code Section - Single View */}
                      <div className="p-3 border-b" style={{ borderColor: theme.colors.border }}>
                        {/* URL Display */}
                        <div className="flex items-center gap-2 mb-3">
                          <div
                            className={`flex-1 text-[11px] font-mono truncate select-all ${
                              activeUrlTab === 'local' ? 'text-green-400' : 'text-blue-400'
                            }`}
                            title={activeUrlTab === 'local' ? webInterfaceUrl : tunnelUrl || ''}
                          >
                            {(activeUrlTab === 'local' ? webInterfaceUrl : tunnelUrl || '').replace(/^https?:\/\//, '')}
                          </div>
                          <button
                            onClick={() => {
                              const url = activeUrlTab === 'local' ? webInterfaceUrl : tunnelUrl;
                              if (url) {
                                navigator.clipboard.writeText(url);
                                setCopyFlash(activeUrlTab === 'local' ? 'Local URL copied!' : 'Remote URL copied!');
                                setTimeout(() => setCopyFlash(null), 2000);
                              }
                            }}
                            className="p-1.5 rounded hover:bg-white/10 transition-colors shrink-0"
                            title="Copy URL"
                          >
                            <Copy className="w-3 h-3" style={{ color: theme.colors.textDim }} />
                          </button>
                          <button
                            onClick={() => {
                              const url = activeUrlTab === 'local' ? webInterfaceUrl : tunnelUrl;
                              if (url) window.maestro.shell.openExternal(url);
                            }}
                            className="p-1.5 rounded hover:bg-white/10 transition-colors shrink-0"
                            title="Open in Browser"
                          >
                            <ExternalLink className="w-3 h-3" style={{ color: theme.colors.textDim }} />
                          </button>
                        </div>

                        {/* QR Code with optional loading overlay */}
                        <div className="relative">
                          <div className="p-2 rounded" style={{ backgroundColor: 'white' }}>
                            <QRCodeSVG
                              value={activeUrlTab === 'local' ? webInterfaceUrl : (tunnelUrl || webInterfaceUrl)}
                              size={220}
                              bgColor="#FFFFFF"
                              fgColor="#000000"
                              style={{ width: '100%', height: 'auto' }}
                            />
                          </div>

                          {/* Loading overlay when tunnel is starting */}
                          {tunnelStatus === 'starting' && (
                            <div
                              className="absolute inset-0 flex flex-col items-center justify-center rounded"
                              style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
                            >
                              <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin mb-3" />
                              <div className="text-white text-[11px] font-medium">Starting tunnel...</div>
                            </div>
                          )}

                          {/* Copy flash notice */}
                          {copyFlash && (
                            <div
                              className="absolute inset-0 flex items-center justify-center rounded pointer-events-none animate-pulse"
                              style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
                            >
                              <div
                                className="px-4 py-2 rounded-full text-[12px] font-bold"
                                style={{
                                  backgroundColor: activeUrlTab === 'local' ? '#22c55e' : '#3b82f6',
                                  color: 'white'
                                }}
                              >
                                {copyFlash}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Local/Remote Pill Selector - Only shown when tunnel is connected */}
                        {tunnelStatus === 'connected' && (
                          <div className="mt-3 flex flex-col items-center gap-2">
                            <div
                              className="inline-flex rounded-full p-0.5"
                              style={{ backgroundColor: theme.colors.bgActivity }}
                            >
                              <button
                                onClick={() => setActiveUrlTab('local')}
                                className={`px-4 py-1 text-[10px] font-bold uppercase rounded-full transition-all ${
                                  activeUrlTab === 'local'
                                    ? 'bg-green-500 text-white shadow-sm'
                                    : 'hover:bg-white/10'
                                }`}
                                style={activeUrlTab !== 'local' ? { color: theme.colors.textDim } : {}}
                              >
                                Local
                              </button>
                              <button
                                onClick={() => setActiveUrlTab('remote')}
                                className={`px-4 py-1 text-[10px] font-bold uppercase rounded-full transition-all ${
                                  activeUrlTab === 'remote'
                                    ? 'bg-blue-500 text-white shadow-sm'
                                    : 'hover:bg-white/10'
                                }`}
                                style={activeUrlTab !== 'remote' ? { color: theme.colors.textDim } : {}}
                              >
                                Remote
                              </button>
                            </div>
                            {/* Dot indicators */}
                            <div className="flex gap-1.5">
                              <div
                                className={`w-1.5 h-1.5 rounded-full transition-colors cursor-pointer ${
                                  activeUrlTab === 'local' ? 'bg-green-500' : 'bg-gray-600'
                                }`}
                                onClick={() => setActiveUrlTab('local')}
                              />
                              <div
                                className={`w-1.5 h-1.5 rounded-full transition-colors cursor-pointer ${
                                  activeUrlTab === 'remote' ? 'bg-blue-500' : 'bg-gray-600'
                                }`}
                                onClick={() => setActiveUrlTab('remote')}
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="p-3 space-y-2">
                        {/* Open in Browser Button */}
                        <button
                          onClick={() => {
                            const url = activeUrlTab === 'local' ? webInterfaceUrl : tunnelUrl;
                            if (url) window.maestro.shell.openExternal(url);
                          }}
                          className="w-full py-1.5 rounded text-[10px] font-medium transition-colors hover:bg-white/10 border"
                          style={{
                            color: activeUrlTab === 'local' ? '#4ade80' : '#60a5fa',
                            borderColor: activeUrlTab === 'local' ? 'rgba(74, 222, 128, 0.3)' : 'rgba(96, 165, 250, 0.3)'
                          }}
                        >
                          Open in Browser
                        </button>
                        {/* Turn Off Button */}
                        <button
                          onClick={() => {
                            toggleGlobalLive();
                            setLiveOverlayOpen(false);
                          }}
                          className="w-full py-1.5 rounded text-[10px] font-medium transition-colors hover:bg-red-500/20 text-red-400 border border-red-500/30"
                        >
                          Turn Off Web Interface
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            {/* Hamburger Menu */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="p-2 rounded hover:bg-white/10 transition-colors"
                style={{ color: theme.colors.textDim }}
                title="Menu"
              >
                <Menu className="w-4 h-4" />
              </button>
              {/* Menu Overlay */}
              {menuOpen && (
                <div
                  className="absolute top-full left-0 mt-2 w-72 rounded-lg shadow-2xl z-50 overflow-hidden"
                  style={{
                    backgroundColor: theme.colors.bgSidebar,
                    border: `1px solid ${theme.colors.border}`
                  }}
                >
                  <div className="p-1">
                    <button
                      onClick={() => { setShortcutsHelpOpen(true); setMenuOpen(false); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors text-left"
                    >
                      <Keyboard className="w-5 h-5" style={{ color: theme.colors.accent }} />
                      <div className="flex-1">
                        <div className="text-sm font-medium" style={{ color: theme.colors.textMain }}>Keyboard Shortcuts</div>
                        <div className="text-xs" style={{ color: theme.colors.textDim }}>View all available shortcuts</div>
                      </div>
                      <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: theme.colors.bgActivity, color: theme.colors.textDim }}>
                        {formatShortcutKeys(shortcuts.help.keys)}
                      </span>
                    </button>
                    <button
                      onClick={() => { setSettingsModalOpen(true); setSettingsTab('general'); setMenuOpen(false); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors text-left"
                    >
                      <Settings className="w-5 h-5" style={{ color: theme.colors.accent }} />
                      <div className="flex-1">
                        <div className="text-sm font-medium" style={{ color: theme.colors.textMain }}>Settings</div>
                        <div className="text-xs" style={{ color: theme.colors.textDim }}>Configure preferences</div>
                      </div>
                      <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: theme.colors.bgActivity, color: theme.colors.textDim }}>
                        {formatShortcutKeys(shortcuts.settings.keys)}
                      </span>
                    </button>
                    <button
                      onClick={() => { setLogViewerOpen(true); setMenuOpen(false); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors text-left"
                    >
                      <ScrollText className="w-5 h-5" style={{ color: theme.colors.accent }} />
                      <div className="flex-1">
                        <div className="text-sm font-medium" style={{ color: theme.colors.textMain }}>System Logs</div>
                        <div className="text-xs" style={{ color: theme.colors.textDim }}>View application logs</div>
                      </div>
                      <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: theme.colors.bgActivity, color: theme.colors.textDim }}>
                        {formatShortcutKeys(shortcuts.systemLogs.keys)}
                      </span>
                    </button>
                    <button
                      onClick={() => { setProcessMonitorOpen(true); setMenuOpen(false); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors text-left"
                    >
                      <Cpu className="w-5 h-5" style={{ color: theme.colors.accent }} />
                      <div className="flex-1">
                        <div className="text-sm font-medium" style={{ color: theme.colors.textMain }}>Process Monitor</div>
                        <div className="text-xs" style={{ color: theme.colors.textDim }}>View running processes</div>
                      </div>
                      <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: theme.colors.bgActivity, color: theme.colors.textDim }}>
                        {formatShortcutKeys(shortcuts.processMonitor.keys)}
                      </span>
                    </button>
                    <div className="my-1 border-t" style={{ borderColor: theme.colors.border }} />
                    <button
                      onClick={() => { setAboutModalOpen(true); setMenuOpen(false); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors text-left"
                    >
                      <Info className="w-5 h-5" style={{ color: theme.colors.accent }} />
                      <div className="flex-1">
                        <div className="text-sm font-medium" style={{ color: theme.colors.textMain }}>About Maestro</div>
                        <div className="text-xs" style={{ color: theme.colors.textDim }}>Version, Credits, Stats</div>
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="w-full flex flex-col items-center gap-2 relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-2 rounded hover:bg-white/10 transition-colors"
              title="Menu"
            >
              <Wand2 className="w-6 h-6" style={{ color: theme.colors.accent }} />
            </button>
            {/* Menu Overlay for Collapsed Sidebar */}
            {menuOpen && (
              <div
                className="absolute top-full left-0 mt-2 w-72 rounded-lg shadow-2xl z-50 overflow-hidden"
                style={{
                  backgroundColor: theme.colors.bgSidebar,
                  border: `1px solid ${theme.colors.border}`
                }}
              >
                <div className="p-1">
                  <button
                    onClick={() => { setShortcutsHelpOpen(true); setMenuOpen(false); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors text-left"
                  >
                    <Keyboard className="w-5 h-5" style={{ color: theme.colors.accent }} />
                    <div className="flex-1">
                      <div className="text-sm font-medium" style={{ color: theme.colors.textMain }}>Keyboard Shortcuts</div>
                      <div className="text-xs" style={{ color: theme.colors.textDim }}>View all available shortcuts</div>
                    </div>
                    <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: theme.colors.bgActivity, color: theme.colors.textDim }}>
                      {formatShortcutKeys(shortcuts.help.keys)}
                    </span>
                  </button>
                  <button
                    onClick={() => { setSettingsModalOpen(true); setSettingsTab('general'); setMenuOpen(false); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors text-left"
                  >
                    <Settings className="w-5 h-5" style={{ color: theme.colors.accent }} />
                    <div className="flex-1">
                      <div className="text-sm font-medium" style={{ color: theme.colors.textMain }}>Settings</div>
                      <div className="text-xs" style={{ color: theme.colors.textDim }}>Configure preferences</div>
                    </div>
                    <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: theme.colors.bgActivity, color: theme.colors.textDim }}>
                      {formatShortcutKeys(shortcuts.settings.keys)}
                    </span>
                  </button>
                  <button
                    onClick={() => { setLogViewerOpen(true); setMenuOpen(false); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors text-left"
                  >
                    <ScrollText className="w-5 h-5" style={{ color: theme.colors.accent }} />
                    <div className="flex-1">
                      <div className="text-sm font-medium" style={{ color: theme.colors.textMain }}>System Logs</div>
                      <div className="text-xs" style={{ color: theme.colors.textDim }}>View application logs</div>
                    </div>
                    <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: theme.colors.bgActivity, color: theme.colors.textDim }}>
                      {formatShortcutKeys(shortcuts.systemLogs.keys)}
                    </span>
                  </button>
                  <button
                    onClick={() => { setProcessMonitorOpen(true); setMenuOpen(false); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors text-left"
                  >
                    <Cpu className="w-5 h-5" style={{ color: theme.colors.accent }} />
                    <div className="flex-1">
                      <div className="text-sm font-medium" style={{ color: theme.colors.textMain }}>Process Monitor</div>
                      <div className="text-xs" style={{ color: theme.colors.textDim }}>View running processes</div>
                    </div>
                    <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: theme.colors.bgActivity, color: theme.colors.textDim }}>
                      {formatShortcutKeys(shortcuts.processMonitor.keys)}
                    </span>
                  </button>
                  <div className="my-1 border-t" style={{ borderColor: theme.colors.border }} />
                  <button
                    onClick={() => { setAboutModalOpen(true); setMenuOpen(false); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors text-left"
                  >
                    <Info className="w-5 h-5" style={{ color: theme.colors.accent }} />
                    <div className="flex-1">
                      <div className="text-sm font-medium" style={{ color: theme.colors.textMain }}>About Maestro</div>
                      <div className="text-xs" style={{ color: theme.colors.textDim }}>Version, Credits, Stats</div>
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* SIDEBAR CONTENT: EXPANDED */}
      {leftSidebarOpen ? (
        <div className="flex-1 overflow-y-auto py-2 select-none scrollbar-thin">
          {/* Session Filter */}
          {sessionFilterOpen && (
            <div className="mx-3 mb-3">
              <input
                autoFocus
                type="text"
                placeholder="Filter agents..."
                value={sessionFilter}
                onChange={(e) => setSessionFilter(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setSessionFilterOpen(false);
                    setSessionFilter('');
                  }
                }}
                className="w-full px-3 py-2 rounded border bg-transparent outline-none text-sm"
                style={{ borderColor: theme.colors.accent, color: theme.colors.textMain }}
              />
            </div>
          )}

          {/* BOOKMARKS SECTION - only show if there are bookmarked sessions */}
          {filteredSessions.some(s => s.bookmarked) && (
            <div className="mb-1">
              <div
                className="px-3 py-1.5 flex items-center justify-between cursor-pointer hover:bg-opacity-50 group"
                onClick={() => setBookmarksCollapsed(!bookmarksCollapsed)}
              >
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider flex-1" style={{ color: theme.colors.accent }}>
                  {bookmarksCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  <Bookmark className="w-3.5 h-3.5" fill={theme.colors.accent} />
                  <span>Bookmarks</span>
                </div>
              </div>

              {!bookmarksCollapsed ? (
                <div className="flex flex-col border-l ml-4" style={{ borderColor: theme.colors.accent }}>
                  {[...filteredSessions.filter(s => s.bookmarked)].sort((a, b) => compareSessionNames(a.name, b.name)).map(session => {
                    const globalIdx = sortedSessions.findIndex(s => s.id === session.id);
                    const isKeyboardSelected = activeFocus === 'sidebar' && globalIdx === selectedSidebarIndex;
                    const group = groups.find(g => g.id === session.groupId);
                    return (
                      <div
                        key={`bookmark-${session.id}`}
                        draggable
                        onDragStart={() => handleDragStart(session.id)}
                        onClick={() => setActiveSessionId(session.id)}
                        onContextMenu={(e) => handleContextMenu(e, session.id)}
                        className={`px-4 py-2 cursor-move flex items-center justify-between group border-l-2 transition-all hover:bg-opacity-50 ${draggingSessionId === session.id ? 'opacity-50' : ''}`}
                        style={{
                          borderColor: (activeSessionId === session.id || isKeyboardSelected) ? theme.colors.accent : 'transparent',
                          backgroundColor: activeSessionId === session.id ? theme.colors.bgActivity : (isKeyboardSelected ? theme.colors.bgActivity + '40' : 'transparent')
                        }}
                      >
                        <div className="min-w-0 flex-1">
                          {editingSessionId === `bookmark-${session.id}` ? (
                            <input
                              autoFocus
                              className="bg-transparent text-sm font-medium outline-none w-full border-b border-indigo-500"
                              defaultValue={session.name}
                              onClick={e => e.stopPropagation()}
                              onBlur={e => finishRenamingSession(session.id, e.target.value)}
                              onKeyDown={e => {
                                e.stopPropagation();
                                if (e.key === 'Enter') finishRenamingSession(session.id, e.currentTarget.value);
                              }}
                            />
                          ) : (
                            <div
                              className="flex items-center gap-1.5"
                              onDoubleClick={() => startRenamingSession(`bookmark-${session.id}`)}
                            >
                              {session.bookmarked && (
                                <Bookmark className="w-3 h-3 shrink-0" style={{ color: theme.colors.accent }} fill={theme.colors.accent} />
                              )}
                              <span
                                className="text-sm font-medium truncate"
                                style={{ color: activeSessionId === session.id ? theme.colors.textMain : theme.colors.textDim }}
                              >
                                {session.name}
                              </span>
                            </div>
                          )}
                          <div className="flex items-center gap-2 text-[10px] mt-0.5 opacity-70">
                            {/* Session Jump Number Badge (Opt+Cmd+NUMBER) */}
                            {getSessionJumpNumber(session.id) && (
                              <div
                                className="w-4 h-4 rounded flex items-center justify-center text-[10px] font-bold shrink-0"
                                style={{
                                  backgroundColor: theme.colors.accent,
                                  color: theme.colors.bgMain
                                }}
                              >
                                {getSessionJumpNumber(session.id)}
                              </div>
                            )}
                            <Activity className="w-3 h-3" /> {session.toolType}
                            {group && (
                              <span className="text-[9px] px-1 py-0.5 rounded" style={{ backgroundColor: theme.colors.bgActivity, color: theme.colors.textDim }}>
                                {group.name}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-2">
                          {/* Bookmark toggle */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleBookmark(session.id);
                            }}
                            className="p-0.5 rounded hover:bg-white/10 transition-colors"
                            title="Remove bookmark"
                          >
                            <Bookmark className="w-3 h-3" style={{ color: theme.colors.accent }} fill={theme.colors.accent} />
                          </button>
                          {/* Git Dirty Indicator */}
                          {leftSidebarOpen && session.isGitRepo && gitFileCounts.has(session.id) && gitFileCounts.get(session.id)! > 0 && (
                            <div className="flex items-center gap-0.5 text-[10px]" style={{ color: theme.colors.warning }}>
                              <GitBranch className="w-2.5 h-2.5" />
                              <span>{gitFileCounts.get(session.id)}</span>
                            </div>
                          )}
                          {/* AUTO Mode Indicator */}
                          {activeBatchSessionIds.includes(session.id) && (
                            <div
                              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase animate-pulse"
                              style={{ backgroundColor: theme.colors.warning + '30', color: theme.colors.warning }}
                              title="Auto mode running"
                            >
                              <Bot className="w-2.5 h-2.5" />
                              AUTO
                            </div>
                          )}
                          {/* AI Status Indicator */}
                          <div
                            className={`w-2 h-2 rounded-full ${session.state === 'connecting' ? 'animate-pulse' : ''}`}
                            style={
                              session.toolType === 'claude' && !session.claudeSessionId
                                ? { border: `1.5px solid ${theme.colors.textDim}`, backgroundColor: 'transparent' }
                                : { backgroundColor: getStatusColor(session.state, theme) }
                            }
                            title={
                              session.toolType === 'claude' && !session.claudeSessionId ? 'No active Claude session' :
                              session.state === 'idle' ? 'Ready and waiting' :
                              session.state === 'busy' ? (session.cliActivity ? `CLI: Running playbook "${session.cliActivity.playbookName}"` : 'Agent is thinking') :
                              session.state === 'connecting' ? 'Attempting to establish connection' :
                              session.state === 'error' ? 'No connection with agent' :
                              'Waiting for input'
                            }
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Collapsed Bookmarks Palette */
                <div
                  className="ml-8 mr-3 mt-1 mb-2 flex gap-1 h-1.5 cursor-pointer"
                  onClick={() => setBookmarksCollapsed(false)}
                >
                  {[...filteredSessions.filter(s => s.bookmarked)].sort((a, b) => compareSessionNames(a.name, b.name)).map(s => (
                    <div
                      key={`bookmark-collapsed-${s.id}`}
                      className="group/indicator relative flex-1 rounded-full opacity-50 hover:opacity-100 transition-opacity"
                      style={
                        s.toolType === 'claude' && !s.claudeSessionId
                          ? { border: `1px solid ${theme.colors.textDim}`, backgroundColor: 'transparent' }
                          : { backgroundColor: getStatusColor(s.state, theme) }
                      }
                      onMouseEnter={(e) => setTooltipPosition({ x: e.clientX, y: e.clientY })}
                      onMouseLeave={() => setTooltipPosition(null)}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveSessionId(s.id);
                      }}
                    >
                      {/* Hover Tooltip for Collapsed Bookmark Indicator */}
                      <div
                        className="fixed rounded px-3 py-2 z-[100] opacity-0 group-hover/indicator:opacity-100 pointer-events-none transition-opacity shadow-xl"
                        style={{
                          minWidth: '240px',
                          left: `${leftSidebarWidthState + 8}px`,
                          top: tooltipPosition ? `${tooltipPosition.y}px` : undefined,
                          backgroundColor: theme.colors.bgSidebar,
                          border: `1px solid ${theme.colors.border}`
                        }}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-bold" style={{ color: theme.colors.textMain }}>{s.name}</span>
                          {s.toolType !== 'terminal' && (
                            <span
                              className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase"
                              style={{
                                backgroundColor: s.isGitRepo ? theme.colors.accent + '30' : theme.colors.textDim + '20',
                                color: s.isGitRepo ? theme.colors.accent : theme.colors.textDim
                              }}
                            >
                              {s.isGitRepo ? 'GIT' : 'LOCAL'}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] capitalize mb-2" style={{ color: theme.colors.textDim }}>{s.state} • {s.toolType}</div>

                        <div className="pt-2 mt-2 space-y-1.5" style={{ borderTop: `1px solid ${theme.colors.border}` }}>
                          <div className="flex items-center justify-between text-[10px]">
                            <span style={{ color: theme.colors.textDim }}>Context Window</span>
                            <span style={{ color: theme.colors.textMain }}>{s.contextUsage}%</span>
                          </div>
                          <div className="w-full h-1 rounded-full overflow-hidden" style={{ backgroundColor: theme.colors.border }}>
                            <div
                              className="h-full transition-all"
                              style={{
                                width: `${s.contextUsage}%`,
                                backgroundColor: getContextColor(s.contextUsage, theme)
                              }}
                            />
                          </div>

                          {/* Git Status */}
                          {s.isGitRepo && gitFileCounts.has(s.id) && gitFileCounts.get(s.id)! > 0 && (
                            <div className="flex items-center justify-between text-[10px] pt-1">
                              <span className="flex items-center gap-1" style={{ color: theme.colors.textDim }}>
                                <GitBranch className="w-3 h-3" />
                                Git Changes
                              </span>
                              <span style={{ color: theme.colors.warning }}>{gitFileCounts.get(s.id)} files</span>
                            </div>
                          )}

                          {/* Session Cost */}
                          {s.usageStats && s.usageStats.totalCostUsd > 0 && (
                            <div className="flex items-center justify-between text-[10px] pt-1">
                              <span style={{ color: theme.colors.textDim }}>Session Cost</span>
                              <span className="font-mono font-bold" style={{ color: theme.colors.success }}>
                                ${s.usageStats.totalCostUsd.toFixed(2)}
                              </span>
                            </div>
                          )}

                          {/* Active Time */}
                          {s.activeTimeMs > 0 && (
                            <div className="flex items-center justify-between text-[10px] pt-1">
                              <span className="flex items-center gap-1" style={{ color: theme.colors.textDim }}>
                                <Clock className="w-3 h-3" />
                                Active Time
                              </span>
                              <span className="font-mono font-bold" style={{ color: theme.colors.accent }}>
                                {formatActiveTime(s.activeTimeMs)}
                              </span>
                            </div>
                          )}

                          <div className="flex items-center gap-1.5 text-[10px] font-mono pt-1" style={{ color: theme.colors.textDim }}>
                            <Folder className="w-3 h-3 shrink-0" />
                            <span className="truncate">{s.cwd}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* GROUPS */}
          {[...groups].sort((a, b) => compareSessionNames(a.name, b.name)).map(group => {
            const groupSessions = [...filteredSessions.filter(s => s.groupId === group.id)].sort((a, b) => compareSessionNames(a.name, b.name));
            return (
              <div key={group.id} className="mb-1">
                <div
                  className="px-3 py-1.5 flex items-center justify-between cursor-pointer hover:bg-opacity-50 group"
                  onClick={() => toggleGroup(group.id)}
                  onDragOver={handleDragOver}
                  onDrop={() => handleDropOnGroup(group.id)}
                >
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider flex-1" style={{ color: theme.colors.textDim }}>
                    {group.collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    <span className="text-sm">{group.emoji}</span>
                    {editingGroupId === group.id ? (
                      <input
                        autoFocus
                        className="bg-transparent outline-none w-full border-b border-indigo-500"
                        defaultValue={group.name}
                        onClick={e => e.stopPropagation()}
                        onBlur={e => finishRenamingGroup(group.id, e.target.value)}
                        onKeyDown={e => {
                          e.stopPropagation();
                          if (e.key === 'Enter') finishRenamingGroup(group.id, e.currentTarget.value);
                        }}
                      />
                    ) : (
                      <span onDoubleClick={() => startRenamingGroup(group.id)}>{group.name}</span>
                    )}
                  </div>
                  {groupSessions.length === 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        showConfirmation(
                          `Are you sure you want to delete the group "${group.name}"?`,
                          () => {
                            setGroups(prev => prev.filter(g => g.id !== group.id));
                          }
                        );
                      }}
                      className="p-1 rounded hover:bg-red-500/20 opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ color: theme.colors.error }}
                      title="Delete empty group"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {!group.collapsed ? (
                  <div className="flex flex-col border-l ml-4" style={{ borderColor: theme.colors.border }}>
                    {groupSessions.map(session => {
                      const globalIdx = sortedSessions.findIndex(s => s.id === session.id);
                      const isKeyboardSelected = activeFocus === 'sidebar' && globalIdx === selectedSidebarIndex;
                      return (
                        <div
                          key={`group-${group.id}-${session.id}`}
                          draggable
                          onDragStart={() => handleDragStart(session.id)}
                          onDragOver={handleDragOver}
                          onDrop={() => handleDropOnGroup(group.id)}
                          onClick={() => setActiveSessionId(session.id)}
                          onContextMenu={(e) => handleContextMenu(e, session.id)}
                          className={`px-4 py-2 cursor-move flex items-center justify-between group border-l-2 transition-all hover:bg-opacity-50 ${draggingSessionId === session.id ? 'opacity-50' : ''}`}
                          style={{
                            borderColor: (activeSessionId === session.id || isKeyboardSelected) ? theme.colors.accent : 'transparent',
                            backgroundColor: activeSessionId === session.id ? theme.colors.bgActivity : (isKeyboardSelected ? theme.colors.bgActivity + '40' : 'transparent')
                          }}
                        >
                          <div className="min-w-0 flex-1">
                            {editingSessionId === `group-${group.id}-${session.id}` ? (
                              <input
                                autoFocus
                                className="bg-transparent text-sm font-medium outline-none w-full border-b border-indigo-500"
                                defaultValue={session.name}
                                onClick={e => e.stopPropagation()}
                                onBlur={e => finishRenamingSession(session.id, e.target.value)}
                                onKeyDown={e => {
                                  e.stopPropagation();
                                  if (e.key === 'Enter') finishRenamingSession(session.id, e.currentTarget.value);
                                }}
                              />
                            ) : (
                              <span
                                className="text-sm font-medium truncate"
                                style={{ color: activeSessionId === session.id ? theme.colors.textMain : theme.colors.textDim }}
                                onDoubleClick={() => startRenamingSession(`group-${group.id}-${session.id}`)}
                              >
                                {session.name}
                              </span>
                            )}
                            <div className="flex items-center gap-2 text-[10px] mt-0.5 opacity-70">
                              {/* Session Jump Number Badge (Opt+Cmd+NUMBER) */}
                              {getSessionJumpNumber(session.id) && (
                                <div
                                  className="w-4 h-4 rounded flex items-center justify-center text-[10px] font-bold shrink-0"
                                  style={{
                                    backgroundColor: theme.colors.accent,
                                    color: theme.colors.bgMain
                                  }}
                                >
                                  {getSessionJumpNumber(session.id)}
                                </div>
                              )}
                              <Activity className="w-3 h-3" /> {session.toolType}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 ml-2">
                            {/* Bookmark toggle - show outline on hover for non-bookmarked */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleBookmark(session.id);
                              }}
                              className={`p-0.5 rounded hover:bg-white/10 transition-all ${session.bookmarked ? '' : 'opacity-0 group-hover:opacity-100'}`}
                              title={session.bookmarked ? "Remove bookmark" : "Add bookmark"}
                            >
                              <Bookmark
                                className="w-3 h-3"
                                style={{ color: theme.colors.accent }}
                                fill={session.bookmarked ? theme.colors.accent : 'none'}
                              />
                            </button>
                            {/* Git Dirty Indicator (only in wide mode) */}
                            {leftSidebarOpen && session.isGitRepo && gitFileCounts.has(session.id) && gitFileCounts.get(session.id)! > 0 && (
                              <div className="flex items-center gap-0.5 text-[10px]" style={{ color: theme.colors.warning }}>
                                <GitBranch className="w-2.5 h-2.5" />
                                <span>{gitFileCounts.get(session.id)}</span>
                              </div>
                            )}
                            {/* Git vs Local Indicator */}
                            {session.toolType !== 'terminal' && (
                              <div
                                className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase"
                                style={{
                                  backgroundColor: session.isGitRepo ? theme.colors.accent + '30' : theme.colors.textDim + '20',
                                  color: session.isGitRepo ? theme.colors.accent : theme.colors.textDim
                                }}
                                title={session.isGitRepo ? 'Git repository' : 'Local directory (not a git repo)'}
                              >
                                {session.isGitRepo ? 'GIT' : 'LOCAL'}
                              </div>
                            )}
                            {/* AUTO Mode Indicator */}
                            {activeBatchSessionIds.includes(session.id) && (
                              <div
                                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase animate-pulse"
                                style={{ backgroundColor: theme.colors.warning + '30', color: theme.colors.warning }}
                                title="Auto mode running"
                              >
                                <Bot className="w-2.5 h-2.5" />
                                AUTO
                              </div>
                            )}
                            {/* AI Status Indicator */}
                            <div
                              className={`w-2 h-2 rounded-full ${session.state === 'connecting' ? 'animate-pulse' : ''}`}
                              style={
                                session.toolType === 'claude' && !session.claudeSessionId
                                  ? { border: `1.5px solid ${theme.colors.textDim}`, backgroundColor: 'transparent' }
                                  : { backgroundColor: getStatusColor(session.state, theme) }
                              }
                              title={
                                session.toolType === 'claude' && !session.claudeSessionId ? 'No active Claude session' :
                                session.state === 'idle' ? 'Ready and waiting' :
                                session.state === 'busy' ? (session.cliActivity ? `CLI: Running playbook "${session.cliActivity.playbookName}"` : 'Agent is thinking') :
                                session.state === 'connecting' ? 'Attempting to establish connection' :
                                session.state === 'error' ? 'No connection with agent' :
                                'Waiting for input'
                              }
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* Collapsed Group Palette */
                  <div
                    className="ml-8 mr-3 mt-1 mb-2 flex gap-1 h-1.5 cursor-pointer"
                    onClick={() => toggleGroup(group.id)}
                  >
                    {groupSessions.map(s => (
                      <div
                        key={`group-collapsed-${group.id}-${s.id}`}
                        className="group/indicator relative flex-1 rounded-full opacity-50 hover:opacity-100 transition-opacity"
                        style={
                          s.toolType === 'claude' && !s.claudeSessionId
                            ? { border: `1px solid ${theme.colors.textDim}`, backgroundColor: 'transparent' }
                            : { backgroundColor: getStatusColor(s.state, theme) }
                        }
                        onMouseEnter={(e) => setTooltipPosition({ x: e.clientX, y: e.clientY })}
                        onMouseLeave={() => setTooltipPosition(null)}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveSessionId(s.id);
                        }}
                      >
                        {/* Hover Tooltip for Collapsed Group Indicator */}
                        <div
                          className="fixed rounded px-3 py-2 z-[100] opacity-0 group-hover/indicator:opacity-100 pointer-events-none transition-opacity shadow-xl"
                          style={{
                            minWidth: '240px',
                            left: `${leftSidebarWidthState + 8}px`,
                            top: tooltipPosition ? `${tooltipPosition.y}px` : undefined,
                            backgroundColor: theme.colors.bgSidebar,
                            border: `1px solid ${theme.colors.border}`
                          }}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-bold" style={{ color: theme.colors.textMain }}>{s.name}</span>
                            {s.toolType !== 'terminal' && (
                              <span
                                className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase"
                                style={{
                                  backgroundColor: s.isGitRepo ? theme.colors.accent + '30' : theme.colors.textDim + '20',
                                  color: s.isGitRepo ? theme.colors.accent : theme.colors.textDim
                                }}
                              >
                                {s.isGitRepo ? 'GIT' : 'LOCAL'}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] capitalize mb-2" style={{ color: theme.colors.textDim }}>{s.state} • {s.toolType}</div>

                          <div className="pt-2 mt-2 space-y-1.5" style={{ borderTop: `1px solid ${theme.colors.border}` }}>
                            <div className="flex items-center justify-between text-[10px]">
                              <span style={{ color: theme.colors.textDim }}>Context Window</span>
                              <span style={{ color: theme.colors.textMain }}>{s.contextUsage}%</span>
                            </div>
                            <div className="w-full h-1 rounded-full overflow-hidden" style={{ backgroundColor: theme.colors.border }}>
                              <div
                                className="h-full transition-all"
                                style={{
                                  width: `${s.contextUsage}%`,
                                  backgroundColor: getContextColor(s.contextUsage, theme)
                                }}
                              />
                            </div>

                            {/* Git Status */}
                            {s.isGitRepo && gitFileCounts.has(s.id) && gitFileCounts.get(s.id)! > 0 && (
                              <div className="flex items-center justify-between text-[10px] pt-1">
                                <span className="flex items-center gap-1" style={{ color: theme.colors.textDim }}>
                                  <GitBranch className="w-3 h-3" />
                                  Git Changes
                                </span>
                                <span style={{ color: theme.colors.warning }}>{gitFileCounts.get(s.id)} files</span>
                              </div>
                            )}

                            {/* Session Cost */}
                            {s.usageStats && s.usageStats.totalCostUsd > 0 && (
                              <div className="flex items-center justify-between text-[10px] pt-1">
                                <span style={{ color: theme.colors.textDim }}>Session Cost</span>
                                <span className="font-mono font-bold" style={{ color: theme.colors.success }}>
                                  ${s.usageStats.totalCostUsd.toFixed(2)}
                                </span>
                              </div>
                            )}

                            {/* Active Time */}
                            {s.activeTimeMs > 0 && (
                              <div className="flex items-center justify-between text-[10px] pt-1">
                                <span className="flex items-center gap-1" style={{ color: theme.colors.textDim }}>
                                  <Clock className="w-3 h-3" />
                                  Active Time
                                </span>
                                <span className="font-mono font-bold" style={{ color: theme.colors.accent }}>
                                  {formatActiveTime(s.activeTimeMs)}
                                </span>
                              </div>
                            )}

                            <div className="flex items-center gap-1.5 text-[10px] font-mono pt-1" style={{ color: theme.colors.textDim }}>
                              <Folder className="w-3 h-3 shrink-0" />
                              <span className="truncate">{s.cwd}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* UNGROUPED SESSIONS (as collapsible group) - only show when sessions exist */}
          {sessions.length > 0 && (
          <div className="mb-1 mt-4">
            <div
              className="px-3 py-1.5 flex items-center justify-between cursor-pointer hover:bg-opacity-50 group"
              onClick={() => setUngroupedCollapsed(!ungroupedCollapsed)}
              onDragOver={handleDragOver}
              onDrop={handleDropOnUngrouped}
            >
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider flex-1" style={{ color: theme.colors.textDim }}>
                {ungroupedCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                <Folder className="w-3.5 h-3.5" />
                <span>Ungrouped</span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  createNewGroup();
                }}
                className="px-2 py-0.5 rounded-full text-[10px] font-medium hover:opacity-80 transition-opacity flex items-center gap-1"
                style={{
                  backgroundColor: theme.colors.accent + '20',
                  color: theme.colors.accent,
                  border: `1px solid ${theme.colors.accent}40`
                }}
                title="Create new group"
              >
                <Plus className="w-3 h-3" />
                <span>New Group</span>
              </button>
            </div>

            {!ungroupedCollapsed ? (
              <div className="flex flex-col border-l ml-4" style={{ borderColor: theme.colors.border }}>
                {[...filteredSessions.filter(s => !s.groupId)].sort((a, b) => compareSessionNames(a.name, b.name)).map((session) => {
                  const globalIdx = sortedSessions.findIndex(s => s.id === session.id);
                  const isKeyboardSelected = activeFocus === 'sidebar' && globalIdx === selectedSidebarIndex;
                  return (
                <div
                  key={`ungrouped-${session.id}`}
                  draggable
                  onDragStart={() => handleDragStart(session.id)}
                  onDragOver={handleDragOver}
                  onDrop={handleDropOnUngrouped}
                  onClick={() => setActiveSessionId(session.id)}
                  onContextMenu={(e) => handleContextMenu(e, session.id)}
                  className={`px-4 py-2 rounded cursor-move flex items-center justify-between mb-1 hover:bg-opacity-50 border-l-2 transition-all group ${draggingSessionId === session.id ? 'opacity-50' : ''}`}
                  style={{
                    borderColor: (activeSessionId === session.id || isKeyboardSelected) ? theme.colors.accent : 'transparent',
                    backgroundColor: activeSessionId === session.id ? theme.colors.bgActivity : (isKeyboardSelected ? theme.colors.bgActivity + '40' : 'transparent')
                  }}
                >
                  <div className="min-w-0 flex-1">
                    {editingSessionId === `ungrouped-${session.id}` ? (
                      <input
                        autoFocus
                        className="bg-transparent text-sm font-medium outline-none w-full border-b"
                        style={{ borderColor: theme.colors.accent }}
                        defaultValue={session.name}
                        onClick={e => e.stopPropagation()}
                        onBlur={e => finishRenamingSession(session.id, e.target.value)}
                        onKeyDown={e => {
                          e.stopPropagation();
                          if (e.key === 'Enter') finishRenamingSession(session.id, e.currentTarget.value);
                        }}
                      />
                    ) : (
                      <span
                        className="text-sm font-medium truncate"
                        style={{ color: activeSessionId === session.id ? theme.colors.textMain : theme.colors.textDim }}
                        onDoubleClick={() => startRenamingSession(`ungrouped-${session.id}`)}
                      >
                        {session.name}
                      </span>
                    )}
                    <div className="flex items-center gap-2 text-[10px] mt-0.5 opacity-70">
                      {/* Session Jump Number Badge (Opt+Cmd+NUMBER) */}
                      {getSessionJumpNumber(session.id) && (
                        <div
                          className="w-4 h-4 rounded flex items-center justify-center text-[10px] font-bold shrink-0"
                          style={{
                            backgroundColor: theme.colors.accent,
                            color: theme.colors.bgMain
                          }}
                        >
                          {getSessionJumpNumber(session.id)}
                        </div>
                      )}
                      <Activity className="w-3 h-3" /> {session.toolType}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-2">
                    {/* Bookmark toggle - show outline on hover for non-bookmarked */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleBookmark(session.id);
                      }}
                      className={`p-0.5 rounded hover:bg-white/10 transition-all ${session.bookmarked ? '' : 'opacity-0 group-hover:opacity-100'}`}
                      title={session.bookmarked ? "Remove bookmark" : "Add bookmark"}
                    >
                      <Bookmark
                        className="w-3 h-3"
                        style={{ color: theme.colors.accent }}
                        fill={session.bookmarked ? theme.colors.accent : 'none'}
                      />
                    </button>
                    {/* Git Dirty Indicator (only in wide mode) */}
                    {leftSidebarOpen && session.isGitRepo && gitFileCounts.has(session.id) && gitFileCounts.get(session.id)! > 0 && (
                      <div className="flex items-center gap-0.5 text-[10px]" style={{ color: theme.colors.warning }}>
                        <GitBranch className="w-2.5 h-2.5" />
                        <span>{gitFileCounts.get(session.id)}</span>
                      </div>
                    )}
                    {/* Git vs Local Indicator */}
                    {session.toolType !== 'terminal' && (
                      <div
                        className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase"
                        style={{
                          backgroundColor: session.isGitRepo ? theme.colors.accent + '30' : theme.colors.textDim + '20',
                          color: session.isGitRepo ? theme.colors.accent : theme.colors.textDim
                        }}
                        title={session.isGitRepo ? 'Git repository' : 'Local directory (not a git repo)'}
                      >
                        {session.isGitRepo ? 'GIT' : 'LOCAL'}
                      </div>
                    )}
                    {/* AUTO Mode Indicator */}
                    {activeBatchSessionIds.includes(session.id) && (
                      <div
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase animate-pulse"
                        style={{ backgroundColor: theme.colors.warning + '30', color: theme.colors.warning }}
                        title="Auto mode running"
                      >
                        <Bot className="w-2.5 h-2.5" />
                        AUTO
                      </div>
                    )}
                    {/* AI Status Indicator */}
                    <div
                      className={`w-2 h-2 rounded-full ${session.state === 'busy' ? 'animate-pulse' : ''}`}
                      style={
                        session.toolType === 'claude' && !session.claudeSessionId
                          ? { border: `1.5px solid ${theme.colors.textDim}`, backgroundColor: 'transparent' }
                          : { backgroundColor: getStatusColor(session.state, theme) }
                      }
                      title={session.toolType === 'claude' && !session.claudeSessionId ? 'No active Claude session' : undefined}
                    />
                  </div>
                </div>
                  );
                })}
              </div>
            ) : (
              /* Collapsed Ungrouped Palette */
              <div
                className="ml-8 mr-3 mt-1 mb-2 flex gap-1 h-1.5 cursor-pointer"
                onClick={() => setUngroupedCollapsed(false)}
              >
                {[...filteredSessions.filter(s => !s.groupId)].sort((a, b) => compareSessionNames(a.name, b.name)).map(s => (
                  <div
                    key={`ungrouped-collapsed-${s.id}`}
                    className="group/indicator relative flex-1 rounded-full opacity-50 hover:opacity-100 transition-opacity"
                    style={
                      s.toolType === 'claude' && !s.claudeSessionId
                        ? { border: `1px solid ${theme.colors.textDim}`, backgroundColor: 'transparent' }
                        : { backgroundColor: getStatusColor(s.state, theme) }
                    }
                    onMouseEnter={(e) => setTooltipPosition({ x: e.clientX, y: e.clientY })}
                    onMouseLeave={() => setTooltipPosition(null)}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveSessionId(s.id);
                    }}
                  >
                    {/* Hover Tooltip for Collapsed Ungrouped Indicator */}
                    <div
                      className="fixed rounded px-3 py-2 z-[100] opacity-0 group-hover/indicator:opacity-100 pointer-events-none transition-opacity shadow-xl"
                      style={{
                        minWidth: '240px',
                        left: `${leftSidebarWidthState + 8}px`,
                        top: tooltipPosition ? `${tooltipPosition.y}px` : undefined,
                        backgroundColor: theme.colors.bgSidebar,
                        border: `1px solid ${theme.colors.border}`
                      }}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-bold" style={{ color: theme.colors.textMain }}>{s.name}</span>
                        {s.toolType !== 'terminal' && (
                          <span
                            className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase"
                            style={{
                              backgroundColor: s.isGitRepo ? theme.colors.accent + '30' : theme.colors.textDim + '20',
                              color: s.isGitRepo ? theme.colors.accent : theme.colors.textDim
                            }}
                          >
                            {s.isGitRepo ? 'GIT' : 'LOCAL'}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] capitalize mb-2" style={{ color: theme.colors.textDim }}>{s.state} • {s.toolType}</div>

                      <div className="pt-2 mt-2 space-y-1.5" style={{ borderTop: `1px solid ${theme.colors.border}` }}>
                        <div className="flex items-center justify-between text-[10px]">
                          <span style={{ color: theme.colors.textDim }}>Context Window</span>
                          <span style={{ color: theme.colors.textMain }}>{s.contextUsage}%</span>
                        </div>
                        <div className="w-full h-1 rounded-full overflow-hidden" style={{ backgroundColor: theme.colors.border }}>
                          <div
                            className="h-full transition-all"
                            style={{
                              width: `${s.contextUsage}%`,
                              backgroundColor: getContextColor(s.contextUsage, theme)
                            }}
                          />
                        </div>

                        {/* Git Status */}
                        {s.isGitRepo && gitFileCounts.has(s.id) && gitFileCounts.get(s.id)! > 0 && (
                          <div className="flex items-center justify-between text-[10px] pt-1">
                            <span className="flex items-center gap-1" style={{ color: theme.colors.textDim }}>
                              <GitBranch className="w-3 h-3" />
                              Git Changes
                            </span>
                            <span style={{ color: theme.colors.warning }}>{gitFileCounts.get(s.id)} files</span>
                          </div>
                        )}

                        {/* Session Cost */}
                        {s.usageStats && s.usageStats.totalCostUsd > 0 && (
                          <div className="flex items-center justify-between text-[10px] pt-1">
                            <span style={{ color: theme.colors.textDim }}>Session Cost</span>
                            <span className="font-mono font-bold" style={{ color: theme.colors.success }}>
                              ${s.usageStats.totalCostUsd.toFixed(2)}
                            </span>
                          </div>
                        )}

                        {/* Active Time */}
                        {s.activeTimeMs > 0 && (
                          <div className="flex items-center justify-between text-[10px] pt-1">
                            <span className="flex items-center gap-1" style={{ color: theme.colors.textDim }}>
                              <Clock className="w-3 h-3" />
                              Active Time
                            </span>
                            <span className="font-mono font-bold" style={{ color: theme.colors.accent }}>
                              {formatActiveTime(s.activeTimeMs)}
                            </span>
                          </div>
                        )}

                        <div className="flex items-center gap-1.5 text-[10px] font-mono pt-1" style={{ color: theme.colors.textDim }}>
                          <Folder className="w-3 h-3 shrink-0" />
                          <span className="truncate">{s.cwd}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          )}
        </div>
      ) : (
        /* SIDEBAR CONTENT: SKINNY MODE */
        <div className="flex-1 flex flex-col items-center py-4 gap-2 overflow-y-auto overflow-x-visible no-scrollbar">
          {sortedSessions.map(session => (
            <div
              key={session.id}
              onClick={() => setActiveSessionId(session.id)}
              onContextMenu={(e) => handleContextMenu(e, session.id)}
              className={`group relative w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-all ${activeSessionId === session.id ? 'ring-2' : 'hover:bg-white/10'}`}
              style={{ ringColor: theme.colors.accent }}
            >
              <div
                className={`w-3 h-3 rounded-full ${session.state === 'busy' ? 'animate-pulse' : ''}`}
                style={
                  session.toolType === 'claude' && !session.claudeSessionId
                    ? { border: `1.5px solid ${theme.colors.textDim}`, backgroundColor: 'transparent' }
                    : { backgroundColor: getStatusColor(session.state, theme) }
                }
                title={session.toolType === 'claude' && !session.claudeSessionId ? 'No active Claude session' : undefined}
              />

              {/* Hover Tooltip for Skinny Mode */}
              <div
                className="fixed rounded px-3 py-2 z-[100] opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity shadow-xl"
                style={{
                  minWidth: '240px',
                  left: '80px',
                  backgroundColor: theme.colors.bgSidebar,
                  border: `1px solid ${theme.colors.border}`
                }}
              >
                {session.groupId && (
                  <div className="text-[10px] font-bold uppercase mb-1" style={{ color: theme.colors.textDim }}>
                    {groups.find(g => g.id === session.groupId)?.name}
                  </div>
                )}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold" style={{ color: theme.colors.textMain }}>{session.name}</span>
                  {session.toolType !== 'terminal' && (
                    <span
                      className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase"
                      style={{
                        backgroundColor: session.isGitRepo ? theme.colors.accent + '30' : theme.colors.textDim + '20',
                        color: session.isGitRepo ? theme.colors.accent : theme.colors.textDim
                      }}
                    >
                      {session.isGitRepo ? 'GIT' : 'LOCAL'}
                    </span>
                  )}
                </div>
                <div className="text-[10px] capitalize mb-2" style={{ color: theme.colors.textDim }}>{session.state} • {session.toolType}</div>

                <div className="pt-2 mt-2 space-y-1.5" style={{ borderTop: `1px solid ${theme.colors.border}` }}>
                  <div className="flex items-center justify-between text-[10px]">
                    <span style={{ color: theme.colors.textDim }}>Context Window</span>
                    <span style={{ color: theme.colors.textMain }}>{session.contextUsage}%</span>
                  </div>
                  <div className="w-full h-1 rounded-full overflow-hidden" style={{ backgroundColor: theme.colors.border }}>
                    <div
                      className="h-full transition-all"
                      style={{
                        width: `${session.contextUsage}%`,
                        backgroundColor: getContextColor(session.contextUsage, theme)
                      }}
                    />
                  </div>

                  {/* Git Status */}
                  {session.isGitRepo && gitFileCounts.has(session.id) && gitFileCounts.get(session.id)! > 0 && (
                    <div className="flex items-center justify-between text-[10px] pt-1">
                      <span className="flex items-center gap-1" style={{ color: theme.colors.textDim }}>
                        <GitBranch className="w-3 h-3" />
                        Git Changes
                      </span>
                      <span style={{ color: theme.colors.warning }}>{gitFileCounts.get(session.id)} files</span>
                    </div>
                  )}

                  {/* Session Cost */}
                  {session.usageStats && session.usageStats.totalCostUsd > 0 && (
                    <div className="flex items-center justify-between text-[10px] pt-1">
                      <span style={{ color: theme.colors.textDim }}>Session Cost</span>
                      <span className="font-mono font-bold" style={{ color: theme.colors.success }}>
                        ${session.usageStats.totalCostUsd.toFixed(2)}
                      </span>
                    </div>
                  )}

                  {/* Active Time */}
                  {session.activeTimeMs > 0 && (
                    <div className="flex items-center justify-between text-[10px] pt-1">
                      <span className="flex items-center gap-1" style={{ color: theme.colors.textDim }}>
                        <Clock className="w-3 h-3" />
                        Active Time
                      </span>
                      <span className="font-mono font-bold" style={{ color: theme.colors.accent }}>
                        {formatActiveTime(session.activeTimeMs)}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 text-[10px] font-mono pt-1" style={{ color: theme.colors.textDim }}>
                    <Folder className="w-3 h-3 shrink-0" />
                    <span className="truncate">{session.cwd}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* SIDEBAR BOTTOM ACTIONS */}
      <div className="p-2 border-t flex gap-2 items-center" style={{ borderColor: theme.colors.border }}>
        <button
          onClick={() => setLeftSidebarOpen(!leftSidebarOpen)}
          className="flex items-center justify-center p-2 rounded hover:bg-white/5 transition-colors w-8 h-8 shrink-0"
          title={`${leftSidebarOpen ? "Collapse" : "Expand"} Sidebar (${formatShortcutKeys(shortcuts.toggleSidebar.keys)})`}
        >
          {leftSidebarOpen ? <PanelLeftClose className="w-4 h-4 opacity-50" /> : <PanelLeftOpen className="w-4 h-4 opacity-50" />}
        </button>

        {leftSidebarOpen && (
          <button onClick={addNewSession} className="flex-1 flex items-center justify-center gap-2 py-2 rounded text-xs font-bold transition-colors" style={{ backgroundColor: theme.colors.accent, color: theme.colors.accentForeground }}>
            <Plus className="w-3 h-3" /> New Agent
          </button>
        )}
      </div>

      {/* Session Context Menu */}
      {contextMenu && contextMenuSession && (
        <SessionContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          theme={theme}
          session={contextMenuSession}
          groups={groups}
          onRename={() => {
            setRenameInstanceValue(contextMenuSession.name);
            setRenameInstanceSessionId(contextMenuSession.id);
            setRenameInstanceModalOpen(true);
          }}
          onToggleBookmark={() => toggleBookmark(contextMenuSession.id)}
          onMoveToGroup={(groupId) => handleMoveToGroup(contextMenuSession.id, groupId)}
          onDelete={() => handleDeleteSession(contextMenuSession.id)}
          onDismiss={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
