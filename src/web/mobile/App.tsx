/**
 * Maestro Web Remote Control
 *
 * Lightweight interface for controlling sessions from mobile/tablet devices.
 * Focused on quick command input and session monitoring.
 */

import React, { useEffect, useCallback, useState, useMemo, useRef } from 'react';
import { useThemeColors } from '../components/ThemeProvider';
import { useWebSocket, type WebSocketState, type CustomCommand, type AutoRunState, type AITabData } from '../hooks/useWebSocket';
// Command history is no longer used in the mobile UI
import { useNotifications } from '../hooks/useNotifications';
import { useUnreadBadge } from '../hooks/useUnreadBadge';
import { useOfflineQueue } from '../hooks/useOfflineQueue';
import { useOfflineStatus, useMaestroMode, useDesktopTheme } from '../main';
import { buildApiUrl } from '../utils/config';
import { triggerHaptic, HAPTIC_PATTERNS } from './constants';
import { webLogger } from '../utils/logger';
import type { Theme } from '../../shared/theme-types';
import { SessionPillBar } from './SessionPillBar';
import { AllSessionsView } from './AllSessionsView';
import { MobileHistoryPanel } from './MobileHistoryPanel';
import { CommandInputBar, type InputMode } from './CommandInputBar';
import { DEFAULT_SLASH_COMMANDS, type SlashCommand } from './SlashCommandAutocomplete';
// CommandHistoryDrawer and RecentCommandChips removed for simpler mobile UI
import { ResponseViewer, type ResponseItem } from './ResponseViewer';
import { OfflineQueueBanner } from './OfflineQueueBanner';
import { MessageHistory, type LogEntry } from './MessageHistory';
import { AutoRunIndicator } from './AutoRunIndicator';
import { TabBar } from './TabBar';
import { TabSearchModal } from './TabSearchModal';
import type { Session, LastResponsePreview } from '../hooks/useSessions';


/**
 * Format cost in USD for display
 */
function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1.0) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

/**
 * Calculate context usage percentage from usage stats
 */
function calculateContextUsage(usageStats?: Session['usageStats'] | null): number | null {
  if (!usageStats) return null;
  const { inputTokens, outputTokens, contextWindow } = usageStats;
  if (inputTokens == null || outputTokens == null || contextWindow == null || contextWindow === 0) {
    return null;
  }
  return Math.min(Math.round(((inputTokens + outputTokens) / contextWindow) * 100), 100);
}

/**
 * Get the active tab from a session
 */
function getActiveTabFromSession(session: Session | null | undefined): AITabData | null {
  if (!session?.aiTabs || !session.activeTabId) return null;
  return session.aiTabs.find(tab => tab.id === session.activeTabId) || null;
}

/**
 * Header component for the mobile app
 * Compact single-line header showing: Maestro | Session Name | Claude ID | Status | Cost | Context
 */
interface MobileHeaderProps {
  activeSession?: Session | null;
}

function MobileHeader({ activeSession }: MobileHeaderProps) {
  const colors = useThemeColors();
  const { isSession, goToDashboard } = useMaestroMode();

  // Get active tab for per-tab data (claudeSessionId, usageStats)
  const activeTab = getActiveTabFromSession(activeSession);

  // Session status and usage - prefer tab-level data
  const sessionState = activeTab?.state || activeSession?.state || 'idle';
  const isThinking = sessionState === 'busy';
  // Use tab's usageStats if available, otherwise fall back to session-level (deprecated)
  const tabUsageStats = activeTab?.usageStats;
  const cost = tabUsageStats?.totalCostUsd ?? activeSession?.usageStats?.totalCostUsd;
  const contextUsage = calculateContextUsage(tabUsageStats ?? activeSession?.usageStats);

  // Get status dot color
  const getStatusDotColor = () => {
    if (sessionState === 'busy') return colors.warning;
    if (sessionState === 'error') return colors.error;
    if (sessionState === 'connecting') return colors.warning;
    return colors.success; // idle
  };

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        paddingTop: 'max(8px, env(safe-area-inset-top))',
        borderBottom: `1px solid ${colors.border}`,
        backgroundColor: colors.bgSidebar,
        minHeight: '44px',
        gap: '8px',
      }}
    >
      {/* Left: Maestro logo with wand icon */}
      <div
        onClick={isSession ? goToDashboard : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          cursor: isSession ? 'pointer' : 'default',
          flexShrink: 0,
        }}
        title={isSession ? 'Go to dashboard' : undefined}
      >
        {/* Wand icon */}
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke={colors.accent}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z"/>
          <path d="m14 7 3 3"/>
          <path d="M5 6v4"/>
          <path d="M19 14v4"/>
          <path d="M10 2v2"/>
          <path d="M7 8H3"/>
          <path d="M21 16h-4"/>
          <path d="M11 3H9"/>
        </svg>
        <span
          style={{
            fontSize: '16px',
            fontWeight: 600,
            color: colors.textMain,
          }}
        >
          Maestro
        </span>
      </div>

      {/* Center: Session info (name + Claude session ID + status + usage) */}
      {activeSession && (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            minWidth: 0,
            overflow: 'hidden',
          }}
        >
          {/* Session status dot */}
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: getStatusDotColor(),
              flexShrink: 0,
              animation: isThinking ? 'pulse 1.5s ease-in-out infinite' : 'none',
            }}
            title={`Session ${sessionState}`}
          />

          {/* Session name */}
          <span
            style={{
              fontSize: '13px',
              fontWeight: 500,
              color: colors.textMain,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {activeSession.name}
          </span>

          {/* Claude Session ID pill - use active tab's claudeSessionId */}
          {(activeTab?.claudeSessionId || activeSession.claudeSessionId) && (
            <span
              style={{
                fontSize: '10px',
                color: colors.textDim,
                fontFamily: 'monospace',
                backgroundColor: colors.bgMain,
                padding: '2px 4px',
                borderRadius: '3px',
                flexShrink: 0,
              }}
              title={`Claude Session: ${activeTab?.claudeSessionId || activeSession.claudeSessionId}`}
            >
              {(activeTab?.claudeSessionId || activeSession.claudeSessionId)?.slice(0, 8)}
            </span>
          )}

          {/* Cost */}
          {cost != null && cost > 0 && (
            <span
              style={{
                fontSize: '10px',
                color: colors.textDim,
                backgroundColor: `${colors.textDim}15`,
                padding: '2px 4px',
                borderRadius: '3px',
                flexShrink: 0,
              }}
              title={`Session cost: ${formatCost(cost)}`}
            >
              {formatCost(cost)}
            </span>
          )}

          {/* Context usage bar */}
          {contextUsage != null && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
                flexShrink: 0,
              }}
              title={`Context: ${contextUsage}%`}
            >
              <div
                style={{
                  width: '30px',
                  height: '4px',
                  backgroundColor: `${colors.textDim}20`,
                  borderRadius: '2px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${contextUsage}%`,
                    height: '100%',
                    backgroundColor: contextUsage >= 90 ? colors.error : contextUsage >= 70 ? colors.warning : colors.success,
                    borderRadius: '2px',
                  }}
                />
              </div>
              <span style={{ fontSize: '9px', color: colors.textDim }}>{contextUsage}%</span>
            </div>
          )}
        </div>
      )}

      {/* Pulse animation for thinking state */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </header>
  );
}

/**
 * Main mobile app component with WebSocket connection management
 */
export default function MobileApp() {
  const colors = useThemeColors();
  const isOffline = useOfflineStatus();
  const { setDesktopTheme } = useDesktopTheme();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [showTabSearch, setShowTabSearch] = useState(false);
  const [commandInput, setCommandInput] = useState('');
  const [showResponseViewer, setShowResponseViewer] = useState(false);
  const [selectedResponse, setSelectedResponse] = useState<LastResponsePreview | null>(null);
  const [responseIndex, setResponseIndex] = useState(0);

  // Message history state (logs from active session)
  const [sessionLogs, setSessionLogs] = useState<{ aiLogs: LogEntry[]; shellLogs: LogEntry[] }>({
    aiLogs: [],
    shellLogs: [],
  });
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  // Custom slash commands from desktop
  const [customCommands, setCustomCommands] = useState<CustomCommand[]>([]);

  // AutoRun state per session (batch processing on desktop)
  const [autoRunStates, setAutoRunStates] = useState<Record<string, AutoRunState | null>>({});

  // Detect if on a small screen (phone vs tablet/iPad)
  // Use 768px as breakpoint - below this is considered "small"
  const [isSmallScreen, setIsSmallScreen] = useState(
    typeof window !== 'undefined' ? window.innerHeight < 700 : false
  );

  // Track screen size changes
  useEffect(() => {
    const handleResize = () => {
      setIsSmallScreen(window.innerHeight < 700);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Notification permission hook - requests permission on first visit
  const {
    permission: notificationPermission,
    showNotification,
  } = useNotifications({
    autoRequest: true,
    requestDelay: 3000, // Wait 3 seconds before prompting
    onGranted: () => {
      webLogger.debug('Notification permission granted', 'Mobile');
      triggerHaptic(HAPTIC_PATTERNS.success);
    },
    onDenied: () => {
      webLogger.debug('Notification permission denied', 'Mobile');
    },
  });

  // Unread badge hook - tracks unread responses and updates app badge
  const {
    addUnread: addUnreadResponse,
    markAllRead: markAllResponsesRead,
    unreadCount,
  } = useUnreadBadge({
    autoClearOnVisible: true, // Clear badge when user opens the app
    onCountChange: (count) => {
      webLogger.debug(`Unread response count: ${count}`, 'Mobile');
    },
  });

  // Track previous session states for detecting busy -> idle transitions
  const previousSessionStatesRef = useRef<Map<string, string>>(new Map());

  // Ref to track activeSessionId for use in callbacks (avoids stale closure issues)
  const activeSessionIdRef = useRef<string | null>(null);

  // Reference to send function for offline queue (will be set after useWebSocket)
  const sendRef = useRef<((sessionId: string, command: string) => boolean) | null>(null);

  // Keep activeSessionIdRef in sync with state
  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  /**
   * Get the first line of a response for notification display
   * Strips markdown/code markers and truncates to reasonable length
   */
  const getFirstLineOfResponse = useCallback((text: string): string => {
    if (!text) return 'Response completed';

    // Split by newlines and find first non-empty, non-markdown line
    const lines = text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      // Skip empty lines and common markdown markers
      if (!trimmed) continue;
      if (trimmed.startsWith('```')) continue;
      if (trimmed === '---') continue;

      // Found a content line - truncate if too long
      const maxLength = 100;
      if (trimmed.length > maxLength) {
        return trimmed.substring(0, maxLength) + '...';
      }
      return trimmed;
    }

    return 'Response completed';
  }, []);

  /**
   * Show notification when AI response completes (if app is backgrounded)
   * Also increments the unread badge count
   */
  const showResponseNotification = useCallback((session: Session, response?: LastResponsePreview | null) => {
    // Only show if app is backgrounded
    if (document.visibilityState !== 'hidden') {
      return;
    }

    // Generate a unique ID for this response using session ID and timestamp
    const responseId = `${session.id}-${response?.timestamp || Date.now()}`;

    // Add to unread badge count (works even without notification permission)
    addUnreadResponse(responseId);
    webLogger.debug(`Added unread response: ${responseId}`, 'Mobile');

    // Only show notification if permission is granted
    if (notificationPermission !== 'granted') {
      return;
    }

    const title = `${session.name} - Response Ready`;
    const firstLine = response?.text
      ? getFirstLineOfResponse(response.text)
      : 'AI response completed';

    const notification = showNotification(title, {
      body: firstLine,
      tag: `maestro-response-${session.id}`, // Prevent duplicate notifications for same session
      renotify: true, // Allow notification to be re-shown if same tag
      silent: false,
      requireInteraction: false, // Auto-dismiss on mobile
    });

    if (notification) {
      webLogger.debug(`Notification shown for session: ${session.name}`, 'Mobile');

      // Handle notification click - focus the app
      notification.onclick = () => {
        window.focus();
        notification.close();
        // Set this session as active and clear badge
        setActiveSessionId(session.id);
        markAllResponsesRead();
      };
    }
  }, [notificationPermission, showNotification, getFirstLineOfResponse, addUnreadResponse, markAllResponsesRead]);

  // Memoize handlers to prevent unnecessary re-renders
  const wsHandlers = useMemo(() => ({
    onConnectionChange: (newState: WebSocketState) => {
      webLogger.debug(`Connection state: ${newState}`, 'Mobile');
    },
    onError: (err: string) => {
      webLogger.error(`WebSocket error: ${err}`, 'Mobile');
    },
    onSessionsUpdate: (newSessions: Session[]) => {
      webLogger.debug(`Sessions updated: ${newSessions.length}`, 'Mobile');

      // Update previous states map for all sessions
      newSessions.forEach(s => {
        previousSessionStatesRef.current.set(s.id, s.state);
      });

      setSessions(newSessions);
      // Auto-select first session if none selected, and sync activeTabId
      setActiveSessionId(prev => {
        if (!prev && newSessions.length > 0) {
          const firstSession = newSessions[0];
          setActiveTabId(firstSession.activeTabId || null);
          return firstSession.id;
        }
        // Sync activeTabId for current session
        if (prev) {
          const currentSession = newSessions.find(s => s.id === prev);
          if (currentSession) {
            setActiveTabId(currentSession.activeTabId || null);
          }
        }
        return prev;
      });
    },
    onSessionStateChange: (sessionId: string, state: string, additionalData?: Partial<Session>) => {
      // Check if this is a busy -> idle transition (AI response completed)
      const previousState = previousSessionStatesRef.current.get(sessionId);
      const isResponseComplete = previousState === 'busy' && state === 'idle';

      // Update the previous state
      previousSessionStatesRef.current.set(sessionId, state);

      setSessions(prev => {
        const updatedSessions = prev.map(s =>
          s.id === sessionId
            ? { ...s, state, ...additionalData }
            : s
        );

        // Show notification if response completed and app is backgrounded
        if (isResponseComplete) {
          const session = updatedSessions.find(s => s.id === sessionId);
          if (session) {
            // Get the response from additionalData or the updated session
            const response = (additionalData as any)?.lastResponse || (session as any).lastResponse;
            showResponseNotification(session, response);
          }
        }

        return updatedSessions;
      });
    },
    onSessionAdded: (session: Session) => {
      // Track state for new session
      previousSessionStatesRef.current.set(session.id, session.state);

      setSessions(prev => {
        if (prev.some(s => s.id === session.id)) return prev;
        return [...prev, session];
      });
    },
    onSessionRemoved: (sessionId: string) => {
      // Clean up state tracking
      previousSessionStatesRef.current.delete(sessionId);

      setSessions(prev => prev.filter(s => s.id !== sessionId));
      setActiveSessionId(prev => prev === sessionId ? null : prev);
    },
    onActiveSessionChanged: (sessionId: string) => {
      // Desktop app switched to a different session - sync with web
      webLogger.debug(`Desktop active session changed: ${sessionId}`, 'Mobile');
      setActiveSessionId(sessionId);
    },
    onSessionOutput: (sessionId: string, data: string, source: 'ai' | 'terminal') => {
      // Real-time output from AI or terminal - append to session logs
      const currentActiveId = activeSessionIdRef.current;
      console.log(`[MobileApp] onSessionOutput: session=${sessionId}, activeSession=${currentActiveId}, source=${source}, dataLen=${data?.length || 0}, match=${currentActiveId === sessionId}`);
      webLogger.debug(`Session output: ${sessionId} (${source}) ${data.length} chars`, 'Mobile');

      // Only update if this is the active session
      if (currentActiveId !== sessionId) {
        console.log(`[MobileApp] Skipping output - not active session`);
        return;
      }

      setSessionLogs(prev => {
        const logKey = source === 'ai' ? 'aiLogs' : 'shellLogs';
        const existingLogs = prev[logKey] || [];

        // Check if the last entry is a streaming entry we should append to
        const lastLog = existingLogs[existingLogs.length - 1];
        const isStreamingAppend = lastLog &&
          lastLog.source === 'stdout' &&
          Date.now() - lastLog.timestamp < 5000; // Within 5 seconds

        if (isStreamingAppend) {
          // Append to existing entry
          const updatedLogs = [...existingLogs];
          updatedLogs[updatedLogs.length - 1] = {
            ...lastLog,
            text: lastLog.text + data,
          };
          console.log(`[MobileApp] Appended to existing log entry, new length: ${updatedLogs[updatedLogs.length - 1].text.length}`);
          return { ...prev, [logKey]: updatedLogs };
        } else {
          // Create new entry
          const newEntry = {
            id: `stream-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now(),
            source: 'stdout' as const,
            text: data,
          };
          console.log(`[MobileApp] Created new log entry, text length: ${data.length}`);
          return { ...prev, [logKey]: [...existingLogs, newEntry] };
        }
      });
    },
    onSessionExit: (sessionId: string, exitCode: number) => {
      webLogger.debug(`Session exit: ${sessionId} code=${exitCode}`, 'Mobile');
      // Update session state to idle when process exits
      setSessions(prev => prev.map(s =>
        s.id === sessionId ? { ...s, state: 'idle' } : s
      ));
    },
    onUserInput: (sessionId: string, command: string, inputMode: 'ai' | 'terminal') => {
      // User input from desktop app - add to session logs so web interface stays in sync
      const currentActiveId = activeSessionIdRef.current;
      console.log(`[MobileApp] onUserInput: session=${sessionId}, activeSession=${currentActiveId}, mode=${inputMode}, cmdLen=${command.length}, match=${currentActiveId === sessionId}`);
      webLogger.debug(`User input from desktop: ${sessionId} (${inputMode}) ${command.substring(0, 50)}`, 'Mobile');

      // Only add if this is the active session
      if (currentActiveId !== sessionId) {
        console.log(`[MobileApp] Skipping user input - not active session`);
        return;
      }

      const userLogEntry: LogEntry = {
        id: `user-desktop-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        text: command,
        source: 'user',
      };
      setSessionLogs(prev => {
        const logKey = inputMode === 'ai' ? 'aiLogs' : 'shellLogs';
        console.log(`[MobileApp] Added user input to ${logKey}`);
        return { ...prev, [logKey]: [...prev[logKey], userLogEntry] };
      });
    },
    onThemeUpdate: (theme: Theme) => {
      // Sync theme from desktop app by updating the React context
      // This will update ThemeProvider which will re-render all themed components
      webLogger.debug(`Theme update received: ${theme.name} (${theme.mode})`, 'Mobile');
      setDesktopTheme(theme);
    },
    onCustomCommands: (commands: CustomCommand[]) => {
      // Custom slash commands from desktop app
      webLogger.debug(`Custom commands received: ${commands.length}`, 'Mobile');
      setCustomCommands(commands);
    },
    onAutoRunStateChange: (sessionId: string, state: AutoRunState | null) => {
      // AutoRun (batch processing) state from desktop app
      webLogger.debug(`AutoRun state change: ${sessionId} - ${state ? `running (${state.completedTasks}/${state.totalTasks})` : 'stopped'}`, 'Mobile');
      setAutoRunStates(prev => ({
        ...prev,
        [sessionId]: state,
      }));
    },
    onTabsChanged: (sessionId: string, aiTabs: AITabData[], newActiveTabId: string) => {
      // Tab state changed on desktop - update session
      webLogger.debug(`Tabs changed: ${sessionId} - ${aiTabs.length} tabs, active: ${newActiveTabId}`, 'Mobile');
      setSessions(prev => prev.map(s =>
        s.id === sessionId
          ? { ...s, aiTabs, activeTabId: newActiveTabId }
          : s
      ));
      // Also update activeTabId state if this is the current session
      const currentSessionId = activeSessionIdRef.current;
      if (currentSessionId === sessionId) {
        setActiveTabId(newActiveTabId);
      }
    },
  }), [showResponseNotification, setDesktopTheme]);

  const { state: connectionState, connect, send, error, reconnectAttempts } = useWebSocket({
    autoReconnect: false, // Only retry manually via the retry button
    handlers: wsHandlers,
  });

  // Connect on mount - use empty dependency array to only connect once
  // The connect function is stable via useRef pattern in useWebSocket
  useEffect(() => {
    connect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch session logs when active session or active tab changes
  useEffect(() => {
    if (!activeSessionId || isOffline) {
      setSessionLogs({ aiLogs: [], shellLogs: [] });
      return;
    }

    const fetchSessionLogs = async () => {
      setIsLoadingLogs(true);
      try {
        // Pass tabId explicitly to avoid race conditions with activeTabId sync
        const tabParam = activeTabId ? `?tabId=${activeTabId}` : '';
        const apiUrl = buildApiUrl(`/session/${activeSessionId}${tabParam}`);
        const response = await fetch(apiUrl);
        if (response.ok) {
          const data = await response.json();
          const session = data.session;
          setSessionLogs({
            aiLogs: session?.aiLogs || [],
            shellLogs: session?.shellLogs || [],
          });
          webLogger.debug('Fetched session logs:', 'Mobile', {
            aiLogs: session?.aiLogs?.length || 0,
            shellLogs: session?.shellLogs?.length || 0,
            requestedTabId: activeTabId,
            returnedTabId: session?.activeTabId,
          });
        }
      } catch (err) {
        webLogger.error('Failed to fetch session logs', 'Mobile', err);
      } finally {
        setIsLoadingLogs(false);
      }
    };

    fetchSessionLogs();
  }, [activeSessionId, activeTabId, isOffline]);

  // Update sendRef after WebSocket is initialized
  useEffect(() => {
    sendRef.current = (sessionId: string, command: string) => {
      return send({
        type: 'send_command',
        sessionId,
        command,
      });
    };
  }, [send]);

  // Determine if we're actually connected
  const isActuallyConnected = !isOffline && (connectionState === 'connected' || connectionState === 'authenticated');

  // Offline queue hook - stores commands typed while offline and sends when reconnected
  const {
    queue: offlineQueue,
    queueLength: offlineQueueLength,
    status: offlineQueueStatus,
    queueCommand,
    removeCommand: removeQueuedCommand,
    clearQueue: clearOfflineQueue,
    processQueue: processOfflineQueue,
  } = useOfflineQueue({
    isOnline: !isOffline,
    isConnected: isActuallyConnected,
    sendCommand: (sessionId, command) => {
      if (sendRef.current) {
        return sendRef.current(sessionId, command);
      }
      return false;
    },
    onCommandSent: (cmd) => {
      webLogger.debug(`Queued command sent: ${cmd.command.substring(0, 50)}`, 'Mobile');
      triggerHaptic(HAPTIC_PATTERNS.success);
    },
    onCommandFailed: (cmd, error) => {
      webLogger.error(`Queued command failed: ${cmd.command.substring(0, 50)}`, 'Mobile', error);
    },
    onProcessingStart: () => {
      webLogger.debug('Processing offline queue...', 'Mobile');
    },
    onProcessingComplete: (successCount, failCount) => {
      webLogger.debug(`Offline queue processed. Success: ${successCount}, Failed: ${failCount}`, 'Mobile');
      if (successCount > 0) {
        triggerHaptic(HAPTIC_PATTERNS.success);
      }
    },
  });

  // Retry connection handler
  const handleRetry = useCallback(() => {
    connect();
  }, [connect]);

  // Auto-reconnect every 30 seconds when disconnected
  useEffect(() => {
    // Only auto-reconnect if disconnected and not offline
    if (connectionState !== 'disconnected' || isOffline) return;

    const intervalId = setInterval(() => {
      webLogger.info('Auto-reconnecting after 30 seconds...', 'MobileApp');
      connect();
    }, 30000); // 30 seconds

    return () => clearInterval(intervalId);
  }, [connectionState, isOffline, connect]);

  // Handle session selection - also notifies desktop to switch
  const handleSelectSession = useCallback((sessionId: string) => {
    // Find the session to get its activeTabId
    const session = sessions.find(s => s.id === sessionId);
    setActiveSessionId(sessionId);
    setActiveTabId(session?.activeTabId || null);
    triggerHaptic(HAPTIC_PATTERNS.tap);
    // Notify desktop to switch to this session (include activeTabId if available)
    send({ type: 'select_session', sessionId, tabId: session?.activeTabId || undefined });
  }, [sessions, send]);

  // Handle selecting a tab within a session
  const handleSelectTab = useCallback((tabId: string) => {
    if (!activeSessionId) return;
    triggerHaptic(HAPTIC_PATTERNS.tap);
    // Notify desktop to switch to this tab
    send({ type: 'select_tab', sessionId: activeSessionId, tabId });
    // Update local activeTabId state directly (triggers log fetch)
    setActiveTabId(tabId);
    // Also update sessions state for UI consistency
    setSessions(prev => prev.map(s =>
      s.id === activeSessionId
        ? { ...s, activeTabId: tabId }
        : s
    ));
  }, [activeSessionId, send]);

  // Handle creating a new tab
  const handleNewTab = useCallback(() => {
    if (!activeSessionId) return;
    triggerHaptic(HAPTIC_PATTERNS.tap);
    // Notify desktop to create a new tab
    send({ type: 'new_tab', sessionId: activeSessionId });
  }, [activeSessionId, send]);

  // Handle closing a tab
  const handleCloseTab = useCallback((tabId: string) => {
    if (!activeSessionId) return;
    triggerHaptic(HAPTIC_PATTERNS.tap);
    // Notify desktop to close this tab
    send({ type: 'close_tab', sessionId: activeSessionId, tabId });
  }, [activeSessionId, send]);

  // Handle opening All Sessions view
  const handleOpenAllSessions = useCallback(() => {
    setShowAllSessions(true);
    triggerHaptic(HAPTIC_PATTERNS.tap);
  }, []);

  // Handle closing All Sessions view
  const handleCloseAllSessions = useCallback(() => {
    setShowAllSessions(false);
  }, []);

  // Handle opening History panel (separate from command history drawer)
  const handleOpenHistoryPanel = useCallback(() => {
    setShowHistoryPanel(true);
    triggerHaptic(HAPTIC_PATTERNS.tap);
  }, []);

  // Handle closing History panel
  const handleCloseHistoryPanel = useCallback(() => {
    setShowHistoryPanel(false);
  }, []);

  // Handle opening Tab Search modal
  const handleOpenTabSearch = useCallback(() => {
    setShowTabSearch(true);
    triggerHaptic(HAPTIC_PATTERNS.tap);
  }, []);

  // Handle closing Tab Search modal
  const handleCloseTabSearch = useCallback(() => {
    setShowTabSearch(false);
  }, []);

  // Handle command submission
  const handleCommandSubmit = useCallback((command: string) => {
    if (!activeSessionId) return;

    // Find the active session to get input mode
    const session = sessions.find(s => s.id === activeSessionId);
    const currentMode = (session?.inputMode as InputMode) || 'ai';

    // Provide haptic feedback on send
    triggerHaptic(HAPTIC_PATTERNS.send);

    // Add user message to session logs immediately for display
    const userLogEntry: LogEntry = {
      id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      text: command,
      source: 'user',
    };
    setSessionLogs(prev => {
      const logKey = currentMode === 'ai' ? 'aiLogs' : 'shellLogs';
      return { ...prev, [logKey]: [...prev[logKey], userLogEntry] };
    });

    // If offline or not connected, queue the command for later
    if (isOffline || !isActuallyConnected) {
      const queued = queueCommand(activeSessionId, command, currentMode);
      if (queued) {
        webLogger.debug(`Command queued for later: ${command.substring(0, 50)}`, 'Mobile');
        // Provide different haptic feedback for queued commands
        triggerHaptic(HAPTIC_PATTERNS.tap);
      } else {
        webLogger.warn('Failed to queue command - queue may be full', 'Mobile');
      }
    } else {
      // Send the command to the active session immediately
      // Include inputMode so the server uses the web's intended mode (not stale server state)
      const currentMode = (session?.inputMode as InputMode) || 'ai';
      send({
        type: 'send_command',
        sessionId: activeSessionId,
        command,
        inputMode: currentMode,
      });
      webLogger.debug(`Command sent: ${command} (mode: ${currentMode}) to session: ${activeSessionId}`, 'Mobile');
    }

    // Clear the input
    setCommandInput('');
  }, [activeSessionId, sessions, send, isOffline, isActuallyConnected, queueCommand]);

  // Handle command input change
  const handleCommandChange = useCallback((value: string) => {
    setCommandInput(value);
  }, []);

  // Handle mode toggle between AI and Terminal
  const handleModeToggle = useCallback((mode: InputMode) => {
    if (!activeSessionId) return;

    // Provide haptic feedback
    triggerHaptic(HAPTIC_PATTERNS.tap);

    // Send mode switch command via WebSocket
    send({ type: 'switch_mode', sessionId: activeSessionId, mode });

    // Optimistically update local session state
    setSessions(prev => prev.map(s =>
      s.id === activeSessionId
        ? { ...s, inputMode: mode }
        : s
    ));

    webLogger.debug(`Mode switched to: ${mode} for session: ${activeSessionId}`, 'Mobile');
  }, [activeSessionId, send]);

  // Handle interrupt request
  const handleInterrupt = useCallback(async () => {
    if (!activeSessionId) return;

    // Provide haptic feedback
    triggerHaptic(HAPTIC_PATTERNS.tap);

    try {
      // Build the API URL with security token in path
      const apiUrl = buildApiUrl(`/session/${activeSessionId}/interrupt`);
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (response.ok && result.success) {
        webLogger.debug(`Session interrupted: ${activeSessionId}`, 'Mobile');
        triggerHaptic(HAPTIC_PATTERNS.success);
      } else {
        webLogger.error(`Failed to interrupt session: ${result.error}`, 'Mobile');
      }
    } catch (error) {
      webLogger.error('Error interrupting session', 'Mobile', error);
    }
  }, [activeSessionId]);

  // Combined slash commands (default + custom from desktop)
  const allSlashCommands = useMemo((): SlashCommand[] => {
    // Convert custom commands to SlashCommand format
    const customSlashCommands: SlashCommand[] = customCommands.map(cmd => ({
      command: cmd.command.startsWith('/') ? cmd.command : `/${cmd.command}`,
      description: cmd.description,
      aiOnly: true, // Custom commands are AI-only
    }));
    // Combine defaults with custom commands
    return [...DEFAULT_SLASH_COMMANDS, ...customSlashCommands];
  }, [customCommands]);

  // Collect all responses from sessions for navigation
  const allResponses = useMemo((): ResponseItem[] => {
    return sessions
      .filter(s => (s as any).lastResponse)
      .map(s => ({
        response: (s as any).lastResponse as LastResponsePreview,
        sessionId: s.id,
        sessionName: s.name,
      }))
      // Sort by timestamp (most recent first)
      .sort((a, b) => b.response.timestamp - a.response.timestamp);
  }, [sessions]);

  // Handle expanding response to full-screen viewer
  const handleExpandResponse = useCallback((response: LastResponsePreview) => {
    setSelectedResponse(response);

    // Find the index of this response in allResponses
    const index = allResponses.findIndex(
      item => item.response.timestamp === response.timestamp
    );
    setResponseIndex(index >= 0 ? index : 0);

    setShowResponseViewer(true);
    triggerHaptic(HAPTIC_PATTERNS.tap);
    webLogger.debug(`Opening response viewer at index: ${index}`, 'Mobile');
  }, [allResponses]);

  // Handle navigating between responses in the viewer
  const handleNavigateResponse = useCallback((index: number) => {
    if (index >= 0 && index < allResponses.length) {
      setResponseIndex(index);
      setSelectedResponse(allResponses[index].response);
      webLogger.debug(`Navigating to response index: ${index}`, 'Mobile');
    }
  }, [allResponses]);

  // Handle closing response viewer
  const handleCloseResponseViewer = useCallback(() => {
    setShowResponseViewer(false);
    // Keep selectedResponse so animation can complete
    setTimeout(() => setSelectedResponse(null), 300);
  }, []);

  // Get active session for input mode
  const activeSession = sessions.find(s => s.id === activeSessionId);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Cmd+J (Mac) or Ctrl+J (Windows/Linux) to toggle AI/CLI mode
      if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
        e.preventDefault();
        if (!activeSessionId) return;

        // Toggle mode
        const currentMode = activeSession?.inputMode || 'ai';
        const newMode = currentMode === 'ai' ? 'terminal' : 'ai';
        handleModeToggle(newMode);
        return;
      }

      // Cmd+[ or Ctrl+[ - Previous tab
      if ((e.metaKey || e.ctrlKey) && e.key === '[') {
        e.preventDefault();
        if (!activeSession?.aiTabs || activeSession.aiTabs.length < 2) return;

        const currentIndex = activeSession.aiTabs.findIndex(t => t.id === activeSession.activeTabId);
        if (currentIndex === -1) return;

        // Wrap around to last tab if at beginning
        const prevIndex = (currentIndex - 1 + activeSession.aiTabs.length) % activeSession.aiTabs.length;
        const prevTab = activeSession.aiTabs[prevIndex];
        handleSelectTab(prevTab.id);
        return;
      }

      // Cmd+] or Ctrl+] - Next tab
      if ((e.metaKey || e.ctrlKey) && e.key === ']') {
        e.preventDefault();
        if (!activeSession?.aiTabs || activeSession.aiTabs.length < 2) return;

        const currentIndex = activeSession.aiTabs.findIndex(t => t.id === activeSession.activeTabId);
        if (currentIndex === -1) return;

        // Wrap around to first tab if at end
        const nextIndex = (currentIndex + 1) % activeSession.aiTabs.length;
        const nextTab = activeSession.aiTabs[nextIndex];
        handleSelectTab(nextTab.id);
        return;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [activeSessionId, activeSession, handleModeToggle, handleSelectTab]);

  // Determine content based on connection state
  const renderContent = () => {
    // Show offline state when device has no network connectivity
    if (isOffline) {
      return (
        <div
          style={{
            marginBottom: '24px',
            padding: '16px',
            borderRadius: '12px',
            backgroundColor: colors.bgSidebar,
            border: `1px solid ${colors.border}`,
            maxWidth: '300px',
          }}
        >
          <h2 style={{ fontSize: '16px', marginBottom: '8px', color: colors.textMain }}>
            You're Offline
          </h2>
          <p style={{ fontSize: '14px', color: colors.textDim, marginBottom: '12px' }}>
            No internet connection. Maestro requires a network connection to communicate with your desktop app.
          </p>
          <p style={{ fontSize: '12px', color: colors.textDim }}>
            The app will automatically reconnect when you're back online.
          </p>
        </div>
      );
    }

    if (connectionState === 'disconnected') {
      return (
        <div
          style={{
            marginBottom: '24px',
            padding: '16px',
            borderRadius: '12px',
            backgroundColor: colors.bgSidebar,
            border: `1px solid ${colors.border}`,
            maxWidth: '300px',
          }}
        >
          <h2 style={{ fontSize: '16px', marginBottom: '8px', color: colors.textMain }}>
            Connection Lost
          </h2>
          <p style={{ fontSize: '14px', color: colors.textDim, marginBottom: '12px' }}>
            {error || 'Unable to connect to Maestro desktop app.'}
          </p>
          <p style={{ fontSize: '12px', color: colors.textDim, marginBottom: '12px' }}>
            Auto-reconnecting every 30 seconds...
            {reconnectAttempts > 0 && ` (attempt ${reconnectAttempts})`}
          </p>
          <button
            onClick={handleRetry}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              backgroundColor: colors.accent,
              color: '#fff',
              fontSize: '14px',
              fontWeight: 500,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Retry Now
          </button>
        </div>
      );
    }

    if (connectionState === 'connecting' || connectionState === 'authenticating') {
      return (
        <div
          style={{
            marginBottom: '24px',
            padding: '16px',
            borderRadius: '12px',
            backgroundColor: colors.bgSidebar,
            border: `1px solid ${colors.border}`,
            maxWidth: '300px',
          }}
        >
          <h2 style={{ fontSize: '16px', marginBottom: '8px', color: colors.textMain }}>
            Connecting to Maestro...
          </h2>
          <p style={{ fontSize: '14px', color: colors.textDim }}>
            Please wait while we establish a connection to your desktop app.
          </p>
        </div>
      );
    }

    // Connected or authenticated state - show conversation or prompt to select session
    if (!activeSession) {
      return (
        <div
          style={{
            marginBottom: '24px',
            padding: '16px',
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: '14px', color: colors.textDim }}>
            Select a session above to get started
          </p>
        </div>
      );
    }

    // Get logs based on current input mode
    const currentLogs = activeSession.inputMode === 'ai' ? sessionLogs.aiLogs : sessionLogs.shellLogs;

    // Show message history
    return (
      <div
        style={{
          width: '100%',
          maxWidth: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          alignItems: 'stretch',
          flex: 1,
          minHeight: 0, // Required for nested flex scroll to work
          overflow: 'hidden', // Contain MessageHistory's scroll
        }}
      >
        {isLoadingLogs ? (
          <div
            style={{
              padding: '16px',
              textAlign: 'center',
              color: colors.textDim,
              fontSize: '13px',
            }}
          >
            Loading conversation...
          </div>
        ) : currentLogs.length === 0 ? (
          <div
            style={{
              padding: '16px',
              textAlign: 'center',
              color: colors.textDim,
              fontSize: '14px',
            }}
          >
            {activeSession.inputMode === 'ai'
              ? 'Ask your AI assistant anything'
              : 'Run shell commands'}
          </div>
        ) : (
          <MessageHistory
            logs={currentLogs}
            inputMode={activeSession.inputMode as 'ai' | 'terminal'}
            autoScroll={true}
            maxHeight="none"
          />
        )}
      </div>
    );
  };

  // CSS variable for dynamic viewport height with fallback
  // The fixed CommandInputBar requires padding at the bottom of the container
  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    height: '100dvh',
    maxHeight: '100dvh',
    overflow: 'hidden',
    backgroundColor: colors.bgMain,
    color: colors.textMain,
  };

  // Determine if session pill bar should be shown
  const showSessionPillBar = !isOffline &&
    (connectionState === 'connected' || connectionState === 'authenticated') &&
    sessions.length > 0;

  return (
    <div style={containerStyle}>
      {/* Header with session info */}
      <MobileHeader
        activeSession={activeSession}
      />

      {/* Session pill bar - Row 1: Groups/Sessions with search button */}
      {showSessionPillBar && (
        <SessionPillBar
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={handleSelectSession}
          onOpenAllSessions={handleOpenAllSessions}
          onOpenHistory={handleOpenHistoryPanel}
        />
      )}

      {/* Tab bar - Row 2: Tabs for active session with search button */}
      {activeSession?.inputMode === 'ai' && activeSession?.aiTabs && activeSession.aiTabs.length > 1 && activeSession.activeTabId && (
        <TabBar
          tabs={activeSession.aiTabs}
          activeTabId={activeSession.activeTabId}
          onSelectTab={handleSelectTab}
          onNewTab={handleNewTab}
          onCloseTab={handleCloseTab}
          onOpenTabSearch={handleOpenTabSearch}
        />
      )}

      {/* AutoRun indicator - shown when batch processing is active on desktop */}
      {activeSessionId && autoRunStates[activeSessionId] && (
        <AutoRunIndicator
          state={autoRunStates[activeSessionId]}
          sessionName={activeSession?.name}
        />
      )}

      {/* Offline queue banner - shown when there are queued commands */}
      {offlineQueueLength > 0 && (
        <OfflineQueueBanner
          queue={offlineQueue}
          status={offlineQueueStatus}
          onClearQueue={clearOfflineQueue}
          onProcessQueue={processOfflineQueue}
          onRemoveCommand={removeQueuedCommand}
          isOffline={isOffline}
          isConnected={isActuallyConnected}
        />
      )}

      {/* All Sessions view - full-screen modal with larger session cards */}
      {showAllSessions && (
        <AllSessionsView
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={handleSelectSession}
          onClose={handleCloseAllSessions}
        />
      )}

      {/* History panel - full-screen modal with history entries */}
      {showHistoryPanel && (
        <MobileHistoryPanel
          onClose={handleCloseHistoryPanel}
          projectPath={activeSession?.cwd}
          sessionId={activeSessionId || undefined}
        />
      )}

      {/* Tab search modal - full-screen modal for searching tabs */}
      {showTabSearch && activeSession?.aiTabs && activeSession.activeTabId && (
        <TabSearchModal
          tabs={activeSession.aiTabs}
          activeTabId={activeSession.activeTabId}
          onSelectTab={handleSelectTab}
          onClose={handleCloseTabSearch}
        />
      )}

      {/* Main content area */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          padding: '12px',
          paddingBottom: 'calc(80px + env(safe-area-inset-bottom))', // Account for fixed input bar
          textAlign: 'center',
          overflow: 'hidden', // Changed from 'auto' - let MessageHistory handle scrolling
          minHeight: 0, // Required for flex child to scroll properly
        }}
      >
        {/* Content wrapper */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: connectionState === 'connected' || connectionState === 'authenticated' ? 'flex-start' : 'center',
            width: '100%',
            minHeight: 0,
            overflow: 'hidden', // Contain child scroll
          }}
        >
          {renderContent()}
          {/* Show help text only when disconnected/connecting */}
          {connectionState !== 'connected' && connectionState !== 'authenticated' && (
            <p style={{ fontSize: '12px', color: colors.textDim }}>
              Make sure Maestro desktop app is running
            </p>
          )}
        </div>
      </main>

      {/* Sticky bottom command input bar */}
      <CommandInputBar
        isOffline={isOffline}
        isConnected={connectionState === 'connected' || connectionState === 'authenticated'}
        value={commandInput}
        onChange={handleCommandChange}
        onSubmit={handleCommandSubmit}
        placeholder={
          !activeSessionId
            ? 'Select a session first...'
            : activeSession?.inputMode === 'ai'
              ? (isSmallScreen
                  ? 'Query AI...'
                  : `Ask ${activeSession?.toolType === 'claude-code' ? 'Claude' : activeSession?.toolType || 'AI'} about ${activeSession?.name || 'this session'}...`)
              : 'Run shell command...'
        }
        disabled={!activeSessionId}
        inputMode={(activeSession?.inputMode as InputMode) || 'ai'}
        onModeToggle={handleModeToggle}
        isSessionBusy={activeSession?.state === 'busy'}
        onInterrupt={handleInterrupt}
        hasActiveSession={!!activeSessionId}
        cwd={activeSession?.cwd}
        slashCommands={allSlashCommands}
        showRecentCommands={false}
      />

      {/* Full-screen response viewer modal */}
      <ResponseViewer
        isOpen={showResponseViewer}
        response={selectedResponse}
        allResponses={allResponses.length > 1 ? allResponses : undefined}
        currentIndex={responseIndex}
        onNavigate={handleNavigateResponse}
        onClose={handleCloseResponseViewer}
        sessionName={activeSession?.name}
      />
    </div>
  );
}
