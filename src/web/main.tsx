/**
 * Maestro Web Interface Entry Point
 *
 * Remote control interface for mobile/tablet devices.
 * Provides session monitoring and command input from anywhere on your network.
 */

import React, { StrictMode, lazy, Suspense, useEffect, useState, createContext, useContext } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from './components/ThemeProvider';
import { registerServiceWorker, isOffline } from './utils/serviceWorker';
import {
  getMaestroConfig,
  isDashboardMode,
  isSessionMode,
  getCurrentSessionId,
  getDashboardUrl,
  getSessionUrl,
} from './utils/config';
import './index.css';

/**
 * Context for offline status
 * Provides offline state to all components in the app
 */
interface OfflineContextValue {
  isOffline: boolean;
}

const OfflineContext = createContext<OfflineContextValue>({ isOffline: false });

/**
 * Hook to access offline status
 */
export function useOfflineStatus(): boolean {
  return useContext(OfflineContext).isOffline;
}

/**
 * Context for Maestro mode (dashboard vs session)
 */
interface MaestroModeContextValue {
  /** Whether we're viewing the dashboard (all live sessions) */
  isDashboard: boolean;
  /** Whether we're viewing a specific session */
  isSession: boolean;
  /** Current session ID (if in session mode) */
  sessionId: string | null;
  /** Security token for API/WS calls */
  securityToken: string;
  /** Navigate to dashboard */
  goToDashboard: () => void;
  /** Navigate to a specific session */
  goToSession: (sessionId: string) => void;
}

const MaestroModeContext = createContext<MaestroModeContextValue>({
  isDashboard: true,
  isSession: false,
  sessionId: null,
  securityToken: '',
  goToDashboard: () => {},
  goToSession: () => {},
});

/**
 * Hook to access Maestro mode context
 */
export function useMaestroMode(): MaestroModeContextValue {
  return useContext(MaestroModeContext);
}

// Lazy load the web app
// Both mobile and desktop use the same remote control interface
const WebApp = lazy(() =>
  import(/* webpackChunkName: "mobile" */ './mobile').catch(() => ({
    default: () => <PlaceholderApp />,
  }))
);

/**
 * Placeholder component shown while the actual app loads
 * or if there's an error loading the app module
 */
function PlaceholderApp() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        padding: '20px',
        textAlign: 'center',
        color: 'var(--color-text-main)',
        backgroundColor: 'var(--color-background)',
      }}
    >
      <h1 style={{ marginBottom: '16px', fontSize: '24px' }}>Maestro Web</h1>
      <p style={{ marginBottom: '8px', color: 'var(--color-text-muted)' }}>
        Remote control interface
      </p>
      <p style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>
        Connect to your Maestro desktop app to get started
      </p>
    </div>
  );
}

/**
 * Loading fallback component
 */
function LoadingFallback() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        backgroundColor: 'var(--color-background)',
      }}
    >
      <div
        style={{
          width: '40px',
          height: '40px',
          border: '3px solid var(--color-border)',
          borderTopColor: 'var(--color-accent)',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }}
      />
    </div>
  );
}

/**
 * Main App component - renders the remote control interface
 */
function App() {
  const [offline, setOffline] = useState(isOffline());

  // Get config on mount
  const config = getMaestroConfig();

  // Mode context value
  const modeContextValue: MaestroModeContextValue = {
    isDashboard: isDashboardMode(),
    isSession: isSessionMode(),
    sessionId: getCurrentSessionId(),
    securityToken: config.securityToken,
    goToDashboard: () => {
      window.location.href = getDashboardUrl();
    },
    goToSession: (sessionId: string) => {
      window.location.href = getSessionUrl(sessionId);
    },
  };

  // Register service worker for offline capability
  useEffect(() => {
    registerServiceWorker({
      onSuccess: (registration) => {
        console.log('[App] Service worker ready:', registration.scope);
      },
      onUpdate: (registration) => {
        console.log('[App] New content available, refresh recommended');
        // Could show a toast/notification here prompting user to refresh
      },
      onOfflineChange: (newOfflineStatus) => {
        console.log('[App] Offline status changed:', newOfflineStatus);
        setOffline(newOfflineStatus);
      },
    });
  }, []);

  // Log mode info on mount
  useEffect(() => {
    console.log('[App] Mode:', modeContextValue.isDashboard ? 'dashboard' : `session:${modeContextValue.sessionId}`);
  }, []);

  return (
    <MaestroModeContext.Provider value={modeContextValue}>
      <OfflineContext.Provider value={{ isOffline: offline }}>
        {/*
          Enable useDevicePreference to respect the device's dark/light mode preference.
          When no theme is provided from the desktop app via WebSocket, the web interface
          will automatically use a dark or light theme based on the user's device settings.
          Once the desktop app sends a theme, it will override the device preference.
        */}
        <ThemeProvider useDevicePreference>
          <Suspense fallback={<LoadingFallback />}>
            <WebApp />
          </Suspense>
        </ThemeProvider>
      </OfflineContext.Provider>
    </MaestroModeContext.Provider>
  );
}

// Mount the application
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  );
} else {
  console.error('Root element not found');
}
