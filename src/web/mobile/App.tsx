/**
 * Maestro Web Remote Control
 *
 * Lightweight interface for controlling sessions from mobile/tablet devices.
 * Focused on quick command input and session monitoring.
 */

import React, { useEffect, useCallback, useState, useMemo, useRef } from 'react';
import { useThemeColors } from '../components/ThemeProvider';
import { useWebSocket, type WebSocketState } from '../hooks/useWebSocket';
import { useCommandHistory } from '../hooks/useCommandHistory';
import { useNotifications } from '../hooks/useNotifications';
import { useUnreadBadge } from '../hooks/useUnreadBadge';
import { useOfflineQueue } from '../hooks/useOfflineQueue';
import { Badge, type BadgeVariant } from '../components/Badge';
import { PullToRefreshIndicator } from '../components/PullToRefresh';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { useOfflineStatus, useMaestroMode } from '../main';
import { triggerHaptic, HAPTIC_PATTERNS } from './index';
import { SessionPillBar } from './SessionPillBar';
import { AllSessionsView } from './AllSessionsView';
import { CommandInputBar, type InputMode } from './CommandInputBar';
import { CommandHistoryDrawer } from './CommandHistoryDrawer';
import { RecentCommandChips } from './RecentCommandChips';
import { SessionStatusBanner } from './SessionStatusBanner';
import { ResponseViewer, type ResponseItem } from './ResponseViewer';
import { OfflineQueueBanner } from './OfflineQueueBanner';
import { ConnectionStatusIndicator } from './ConnectionStatusIndicator';
import type { Session, LastResponsePreview } from '../hooks/useSessions';

/**
 * Map WebSocket state to display properties
 */
interface ConnectionStatusConfig {
  label: string;
  variant: BadgeVariant;
  pulse: boolean;
}

const CONNECTION_STATUS_CONFIG: Record<WebSocketState | 'offline', ConnectionStatusConfig> = {
  offline: {
    label: 'Offline',
    variant: 'error',
    pulse: false,
  },
  disconnected: {
    label: 'Disconnected',
    variant: 'error',
    pulse: false,
  },
  connecting: {
    label: 'Connecting...',
    variant: 'connecting',
    pulse: true,
  },
  authenticating: {
    label: 'Authenticating...',
    variant: 'connecting',
    pulse: true,
  },
  connected: {
    label: 'Connected',
    variant: 'success',
    pulse: false,
  },
  authenticated: {
    label: 'Connected',
    variant: 'success',
    pulse: false,
  },
};

/**
 * Header component for the mobile app
 * Displays app title (clickable to go to dashboard) and connection status indicator
 */
interface MobileHeaderProps {
  connectionState: WebSocketState;
  isOffline: boolean;
  onRetry?: () => void;
}

function MobileHeader({ connectionState, isOffline, onRetry }: MobileHeaderProps) {
  const colors = useThemeColors();
  const { isDashboard, isSession, sessionId, goToDashboard } = useMaestroMode();

  // Show offline status if device is offline, otherwise show connection state
  const effectiveState = isOffline ? 'offline' : connectionState;
  const statusConfig = CONNECTION_STATUS_CONFIG[effectiveState];

  return (
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
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        {/* Maestro logo/title - clickable to go to dashboard */}
        <h1
          onClick={isSession ? goToDashboard : undefined}
          style={{
            fontSize: '18px',
            fontWeight: 600,
            margin: 0,
            color: colors.textMain,
            cursor: isSession ? 'pointer' : 'default',
          }}
          title={isSession ? 'Go to dashboard' : undefined}
        >
          Maestro
        </h1>

        {/* Show back arrow when in session mode */}
        {isSession && (
          <span
            onClick={goToDashboard}
            style={{
              fontSize: '12px',
              color: colors.textDim,
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '4px',
              backgroundColor: colors.bgMain,
            }}
          >
            ← All Sessions
          </span>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <Badge
          variant={statusConfig.variant}
          badgeStyle="subtle"
          size="sm"
          pulse={statusConfig.pulse}
          onClick={!isOffline && connectionState === 'disconnected' ? onRetry : undefined}
          style={{
            cursor: !isOffline && connectionState === 'disconnected' ? 'pointer' : 'default',
          }}
        >
          {statusConfig.label}
        </Badge>
      </div>
    </header>
  );
}

/**
 * Main mobile app component with WebSocket connection management
 */
export default function MobileApp() {
  const colors = useThemeColors();
  const isOffline = useOfflineStatus();
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [commandInput, setCommandInput] = useState('');
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);
  const [showResponseViewer, setShowResponseViewer] = useState(false);
  const [selectedResponse, setSelectedResponse] = useState<LastResponsePreview | null>(null);
  const [responseIndex, setResponseIndex] = useState(0);

  // Command history hook
  const {
    history: commandHistory,
    addCommand: addToHistory,
    removeCommand: removeFromHistory,
    clearHistory,
    getUniqueCommands,
  } = useCommandHistory();

  // Notification permission hook - requests permission on first visit
  const {
    permission: notificationPermission,
    showNotification,
  } = useNotifications({
    autoRequest: true,
    requestDelay: 3000, // Wait 3 seconds before prompting
    onGranted: () => {
      console.log('[Mobile] Notification permission granted');
      triggerHaptic(HAPTIC_PATTERNS.success);
    },
    onDenied: () => {
      console.log('[Mobile] Notification permission denied');
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
      console.log('[Mobile] Unread response count:', count);
    },
  });

  // Track previous session states for detecting busy -> idle transitions
  const previousSessionStatesRef = useRef<Map<string, string>>(new Map());

  // Reference to send function for offline queue (will be set after useWebSocket)
  const sendRef = useRef<((sessionId: string, command: string) => boolean) | null>(null);

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
    console.log('[Mobile] Added unread response:', responseId);

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
      console.log('[Mobile] Notification shown for session:', session.name);

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
      console.log('[Mobile] Connection state:', newState);
    },
    onError: (err: string) => {
      console.error('[Mobile] WebSocket error:', err);
    },
    onSessionsUpdate: (newSessions: Session[]) => {
      console.log('[Mobile] Sessions updated:', newSessions.length);

      // Update previous states map for all sessions
      newSessions.forEach(s => {
        previousSessionStatesRef.current.set(s.id, s.state);
      });

      setSessions(newSessions);
      // Auto-select first session if none selected
      setActiveSessionId(prev => {
        if (!prev && newSessions.length > 0) {
          return newSessions[0].id;
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
  }), [showResponseNotification]);

  const { state: connectionState, connect, send, error, reconnectAttempts } = useWebSocket({
    autoReconnect: true,
    maxReconnectAttempts: 10,
    reconnectDelay: 2000,
    handlers: wsHandlers,
  });

  // Connect on mount
  useEffect(() => {
    connect();
  }, [connect]);

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
      console.log('[Mobile] Queued command sent:', cmd.command.substring(0, 50));
      triggerHaptic(HAPTIC_PATTERNS.success);
    },
    onCommandFailed: (cmd, error) => {
      console.error('[Mobile] Queued command failed:', cmd.command.substring(0, 50), error);
    },
    onProcessingStart: () => {
      console.log('[Mobile] Processing offline queue...');
    },
    onProcessingComplete: (successCount, failCount) => {
      console.log('[Mobile] Offline queue processed. Success:', successCount, 'Failed:', failCount);
      if (successCount > 0) {
        triggerHaptic(HAPTIC_PATTERNS.success);
      }
    },
  });

  // Handle refresh - request updated session list
  const handleRefresh = useCallback(async () => {
    console.log('[Mobile] Pull-to-refresh triggered');

    // Provide haptic feedback
    triggerHaptic(HAPTIC_PATTERNS.tap);

    // Send request to get updated sessions
    const isConnected = connectionState === 'connected' || connectionState === 'authenticated';
    if (isConnected) {
      send({ type: 'get_sessions' });
    }

    // Simulate a minimum refresh time for better UX
    await new Promise((resolve) => setTimeout(resolve, 500));

    setLastRefreshTime(new Date());

    // Provide success haptic feedback
    triggerHaptic(HAPTIC_PATTERNS.success);
  }, [connectionState, send]);

  // Pull-to-refresh hook
  const {
    pullDistance,
    progress,
    isRefreshing,
    isThresholdReached,
    containerProps,
  } = usePullToRefresh({
    onRefresh: handleRefresh,
    enabled: !isOffline && (connectionState === 'connected' || connectionState === 'authenticated'),
  });

  // Retry connection handler
  const handleRetry = useCallback(() => {
    connect();
  }, [connect]);

  // Handle session selection
  const handleSelectSession = useCallback((sessionId: string) => {
    setActiveSessionId(sessionId);
    triggerHaptic(HAPTIC_PATTERNS.tap);
  }, []);

  // Handle opening All Sessions view
  const handleOpenAllSessions = useCallback(() => {
    setShowAllSessions(true);
    triggerHaptic(HAPTIC_PATTERNS.tap);
  }, []);

  // Handle closing All Sessions view
  const handleCloseAllSessions = useCallback(() => {
    setShowAllSessions(false);
  }, []);

  // Handle command submission
  const handleCommandSubmit = useCallback((command: string) => {
    if (!activeSessionId) return;

    // Find the active session to get input mode
    const session = sessions.find(s => s.id === activeSessionId);
    const currentMode = (session?.inputMode as InputMode) || 'ai';

    // Provide haptic feedback on send
    triggerHaptic(HAPTIC_PATTERNS.send);

    // Add to command history
    addToHistory(command, activeSessionId, currentMode);

    // If offline or not connected, queue the command for later
    if (isOffline || !isActuallyConnected) {
      const queued = queueCommand(activeSessionId, command, currentMode);
      if (queued) {
        console.log('[Mobile] Command queued for later:', command.substring(0, 50));
        // Provide different haptic feedback for queued commands
        triggerHaptic(HAPTIC_PATTERNS.tap);
      } else {
        console.warn('[Mobile] Failed to queue command - queue may be full');
      }
    } else {
      // Send the command to the active session immediately
      send({
        type: 'send_command',
        sessionId: activeSessionId,
        command,
      });
      console.log('[Mobile] Command sent:', command, 'to session:', activeSessionId);
    }

    // Clear the input
    setCommandInput('');
  }, [activeSessionId, sessions, send, addToHistory, isOffline, isActuallyConnected, queueCommand]);

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
    send({
      type: 'switch_mode',
      sessionId: activeSessionId,
      mode,
    });

    // Optimistically update local session state
    setSessions(prev => prev.map(s =>
      s.id === activeSessionId
        ? { ...s, inputMode: mode }
        : s
    ));

    console.log('[Mobile] Mode switched to:', mode, 'for session:', activeSessionId);
  }, [activeSessionId, send]);

  // Handle interrupt request
  const handleInterrupt = useCallback(async () => {
    if (!activeSessionId) return;

    // Provide haptic feedback
    triggerHaptic(HAPTIC_PATTERNS.tap);

    try {
      // Get the base URL for API requests
      const baseUrl = `${window.location.protocol}//${window.location.host}`;
      const response = await fetch(`${baseUrl}/api/session/${activeSessionId}/interrupt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (response.ok && result.success) {
        console.log('[Mobile] Session interrupted:', activeSessionId);
        triggerHaptic(HAPTIC_PATTERNS.success);
      } else {
        console.error('[Mobile] Failed to interrupt session:', result.error);
      }
    } catch (error) {
      console.error('[Mobile] Error interrupting session:', error);
    }
  }, [activeSessionId]);

  // Handle clear session request (from quick actions menu)
  const handleClearSession = useCallback(() => {
    if (!activeSessionId) return;

    // Provide haptic feedback
    triggerHaptic(HAPTIC_PATTERNS.tap);

    // Send clear command via WebSocket
    send({
      type: 'clear_session',
      sessionId: activeSessionId,
    });

    console.log('[Mobile] Clear session requested:', activeSessionId);
  }, [activeSessionId, send]);

  // Handle new session request (from quick actions menu)
  const handleNewSession = useCallback(() => {
    // Provide haptic feedback
    triggerHaptic(HAPTIC_PATTERNS.tap);

    // Send new session command via WebSocket
    send({
      type: 'new_session',
    });

    console.log('[Mobile] New session requested');
  }, [send]);

  // Handle opening history drawer
  const handleOpenHistory = useCallback(() => {
    setShowHistoryDrawer(true);
    triggerHaptic(HAPTIC_PATTERNS.tap);
  }, []);

  // Handle closing history drawer
  const handleCloseHistory = useCallback(() => {
    setShowHistoryDrawer(false);
  }, []);

  // Handle selecting a command from history
  const handleSelectHistoryCommand = useCallback((command: string) => {
    setCommandInput(command);
    // Haptic feedback is provided by the drawer
  }, []);

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
    console.log('[Mobile] Opening response viewer at index:', index);
  }, [allResponses]);

  // Handle navigating between responses in the viewer
  const handleNavigateResponse = useCallback((index: number) => {
    if (index >= 0 && index < allResponses.length) {
      setResponseIndex(index);
      setSelectedResponse(allResponses[index].response);
      console.log('[Mobile] Navigating to response index:', index);
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
          {reconnectAttempts > 0 && (
            <p style={{ fontSize: '12px', color: colors.textDim, marginBottom: '12px' }}>
              Reconnection attempts: {reconnectAttempts}
            </p>
          )}
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
            Retry Connection
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

    // Connected or authenticated state
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
          Mobile Remote Control
        </h2>
        <p style={{ fontSize: '14px', color: colors.textDim }}>
          Send commands to your AI assistants from anywhere. Session selector
          and command input will be added next.
        </p>
      </div>
    );
  };

  // CSS variable for dynamic viewport height with fallback
  // The fixed CommandInputBar requires padding at the bottom of the container
  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100dvh',
    backgroundColor: colors.bgMain,
    color: colors.textMain,
    // Add padding at bottom to account for fixed input bar (~70px + safe area)
    paddingBottom: 'calc(70px + max(12px, env(safe-area-inset-bottom)))',
  };

  // Determine if session pill bar should be shown
  const showSessionPillBar = !isOffline &&
    (connectionState === 'connected' || connectionState === 'authenticated') &&
    sessions.length > 0;

  return (
    <div style={containerStyle}>
      {/* Header with connection status */}
      <MobileHeader
        connectionState={connectionState}
        isOffline={isOffline}
        onRetry={handleRetry}
      />

      {/* Connection status indicator with retry button - shows when disconnected or reconnecting */}
      <ConnectionStatusIndicator
        connectionState={connectionState}
        isOffline={isOffline}
        reconnectAttempts={reconnectAttempts}
        maxReconnectAttempts={10}
        error={error}
        onRetry={handleRetry}
      />

      {/* Session pill bar - shown when connected and sessions available */}
      {showSessionPillBar && (
        <SessionPillBar
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={handleSelectSession}
          onOpenAllSessions={handleOpenAllSessions}
        />
      )}

      {/* Session status banner - shown when connected and a session is selected */}
      {showSessionPillBar && activeSession && (
        <SessionStatusBanner
          session={activeSession}
          onExpandResponse={handleExpandResponse}
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

      {/* Main content area with pull-to-refresh */}
      <main
        {...containerProps}
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          padding: '20px',
          paddingTop: `${20 + pullDistance}px`,
          textAlign: 'center',
          overflow: 'auto',
          overscrollBehavior: 'contain',
          position: 'relative',
          touchAction: pullDistance > 0 ? 'none' : 'pan-y',
          transition: isRefreshing ? 'padding-top 0.3s ease' : 'none',
        }}
      >
        {/* Pull-to-refresh indicator */}
        <PullToRefreshIndicator
          pullDistance={pullDistance}
          progress={progress}
          isRefreshing={isRefreshing}
          isThresholdReached={isThresholdReached}
          style={{
            position: 'fixed',
            // Adjust top position based on what's shown above
            // Header: ~56px, Session pill bar: ~52px, Status banner: ~44px when active session
            top: showSessionPillBar
              ? activeSession
                ? 'max(152px, calc(152px + env(safe-area-inset-top)))' // Header + pill bar + status banner
                : 'max(108px, calc(108px + env(safe-area-inset-top)))' // Header + pill bar
              : 'max(56px, calc(56px + env(safe-area-inset-top)))', // Just header
            left: 0,
            right: 0,
            zIndex: 10,
          }}
        />

        {/* Content wrapper to center items when not scrolling */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
          }}
        >
          {renderContent()}
          <p style={{ fontSize: '12px', color: colors.textDim }}>
            Make sure Maestro desktop app is running
          </p>
          {lastRefreshTime && (connectionState === 'connected' || connectionState === 'authenticated') && (
            <p style={{ fontSize: '11px', color: colors.textDim, marginTop: '8px' }}>
              Last updated: {lastRefreshTime.toLocaleTimeString()}
            </p>
          )}
        </div>
      </main>

      {/* Sticky bottom command input bar with recent command chips */}
      <CommandInputBar
        isOffline={isOffline}
        isConnected={connectionState === 'connected' || connectionState === 'authenticated'}
        value={commandInput}
        onChange={handleCommandChange}
        onSubmit={handleCommandSubmit}
        placeholder={activeSessionId ? 'Enter command...' : 'Select a session first...'}
        disabled={!activeSessionId}
        inputMode={(activeSession?.inputMode as InputMode) || 'ai'}
        onModeToggle={handleModeToggle}
        isSessionBusy={activeSession?.state === 'busy'}
        onInterrupt={handleInterrupt}
        onHistoryOpen={handleOpenHistory}
        recentCommands={getUniqueCommands(5)}
        onSelectRecentCommand={handleSelectHistoryCommand}
        onClearSession={handleClearSession}
        onNewSession={handleNewSession}
        hasActiveSession={!!activeSessionId}
      />

      {/* Command history drawer - swipe up from input area */}
      <CommandHistoryDrawer
        isOpen={showHistoryDrawer}
        onClose={handleCloseHistory}
        history={commandHistory}
        onSelectCommand={handleSelectHistoryCommand}
        onDeleteCommand={removeFromHistory}
        onClearHistory={clearHistory}
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
