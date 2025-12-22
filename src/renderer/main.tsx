import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/electron/renderer';
import MaestroConsole from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LayerStackProvider } from './contexts/LayerStackContext';
import { ToastProvider } from './contexts/ToastContext';
import { WizardProvider } from './components/Wizard';
import { logger } from './utils/logger';
import './index.css';

// Initialize Sentry for the renderer process (production only)
// Skip in development to avoid noise from hot-reload artifacts and temporal errors
// The main process also skips Sentry in dev mode
// Check for Vite dev server (localhost:5173) or explicit dev mode
const isDevelopment = window.location.hostname === 'localhost' || window.location.protocol === 'http:';
if (!isDevelopment) {
  Sentry.init({});
}

// Set up global error handlers for uncaught exceptions in renderer process
window.addEventListener('error', (event: ErrorEvent) => {
  logger.error(
    `Uncaught Error: ${event.message}`,
    'UncaughtError',
    {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error?.stack || String(event.error),
    }
  );
  // Prevent default browser error handling
  event.preventDefault();
});

window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  logger.error(
    `Unhandled Promise Rejection: ${event.reason?.message || String(event.reason)}`,
    'UnhandledRejection',
    {
      reason: event.reason,
      stack: event.reason?.stack,
    }
  );
  // Prevent default browser error handling
  event.preventDefault();
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <LayerStackProvider>
          <WizardProvider>
            <MaestroConsole />
          </WizardProvider>
        </LayerStackProvider>
      </ToastProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
