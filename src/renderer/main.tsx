// IMPORTANT: wdyr must be imported BEFORE React
import './wdyr';
import React, { Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/electron/renderer';
import MaestroConsole from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LayerStackProvider } from './contexts/LayerStackContext';
// ToastProvider removed - notification state now managed by notificationStore (Zustand)
// ModalProvider removed - modal state now managed by modalStore (Zustand)
import { WizardProvider } from './components/Wizard';
import { logger } from './utils/logger';
import { initI18n, LANGUAGE_STORAGE_KEY } from '../shared/i18n/config';
import './index.css';

// Initialize Sentry for renderer process
// Uses IPCMode.Classic in main process to avoid "sentry-ipc://" protocol conflicts
// See: https://github.com/getsentry/sentry-electron/issues/661
const isDevelopment = process.env.NODE_ENV === 'development';

// Check crash reporting setting - default to enabled
// This mirrors the main process check for consistency
const initSentry = async () => {
	try {
		const crashReportingEnabled =
			(await window.maestro?.settings?.get('crashReportingEnabled')) ?? true;
		if (crashReportingEnabled && !isDevelopment) {
			Sentry.init({
				// Set release version for filtering errors by app version
				release: __APP_VERSION__,
				// Only send errors, not performance data
				tracesSampleRate: 0,
				// Filter out sensitive data
				beforeSend(event) {
					if (event.user) {
						delete event.user.ip_address;
						delete event.user.email;
					}
					return event;
				},
			});
			// Tag release channel (rc vs stable) based on version string
			Sentry.setTag('channel', __APP_VERSION__.includes('-RC') ? 'rc' : 'stable');
		}
	} catch {
		// Settings not available yet, Sentry will be initialized by main process
	}
};
initSentry();

// Set up global error handlers for uncaught exceptions in renderer process
window.addEventListener('error', (event: ErrorEvent) => {
	logger.error(`Uncaught Error: ${event.message}`, 'UncaughtError', {
		filename: event.filename,
		lineno: event.lineno,
		colno: event.colno,
		error: event.error?.stack || String(event.error),
	});
	// Report to Sentry
	if (event.error) {
		Sentry.captureException(event.error, {
			extra: {
				filename: event.filename,
				lineno: event.lineno,
				colno: event.colno,
			},
		});
	}
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
	// Report to Sentry
	Sentry.captureException(event.reason || new Error('Unhandled Promise Rejection'), {
		extra: {
			type: 'unhandledrejection',
		},
	});
	// Prevent default browser error handling
	event.preventDefault();
});

// Initialize i18n before rendering.
// If the user has no stored preference, detect the system locale via IPC
// and set it as the initial language.
const bootstrap = async () => {
	const i18n = await initI18n();

	// Check for a stored user preference; if absent, detect from OS
	const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
	if (!stored) {
		try {
			const systemLocale = await window.maestro?.locale?.getSystem();
			if (systemLocale && systemLocale !== i18n.language) {
				await i18n.changeLanguage(systemLocale);
			}
		} catch {
			// IPC not available (e.g. tests) — keep fallback 'en'
		}
	}

	// Minimal loading fallback while i18n resources initialize (<100ms typically).
	// Uses inline styles to avoid FOUC — no external CSS needed.
	const i18nFallback = (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				height: '100vh',
				background: '#1a1a2e',
				color: '#888',
				fontFamily: 'system-ui, sans-serif',
				fontSize: '14px',
			}}
		>
			Loading…
		</div>
	);

	ReactDOM.createRoot(document.getElementById('root')!).render(
		<React.StrictMode>
			<ErrorBoundary>
				<Suspense fallback={i18nFallback}>
					<LayerStackProvider>
						<WizardProvider>
							<MaestroConsole />
						</WizardProvider>
					</LayerStackProvider>
				</Suspense>
			</ErrorBoundary>
		</React.StrictMode>
	);
};

bootstrap();
