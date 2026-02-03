/**
 * Sentry utilities for error reporting in the main process.
 *
 * These utilities lazily load Sentry to avoid module initialization issues
 * that can occur when importing @sentry/electron/main before app.whenReady().
 */

import { logger } from './logger';

/** Sentry severity levels */
export type SentrySeverityLevel = 'fatal' | 'error' | 'warning' | 'log' | 'info' | 'debug';

/** Sentry module type for crash reporting */
interface SentryModule {
	captureMessage: (
		message: string,
		captureContext?: { level?: SentrySeverityLevel; extra?: Record<string, unknown> }
	) => string;
	captureException: (
		exception: Error | unknown,
		captureContext?: { level?: SentrySeverityLevel; extra?: Record<string, unknown> }
	) => string;
}

/** Cached Sentry module reference */
let sentryModule: SentryModule | null = null;

/**
 * Reports an exception to Sentry from the main process.
 * Lazily loads Sentry to avoid module initialization issues.
 *
 * @param error - The error to report
 * @param extra - Additional context data
 */
export async function captureException(
	error: Error | unknown,
	extra?: Record<string, unknown>
): Promise<void> {
	try {
		if (!sentryModule) {
			const sentry = await import('@sentry/electron/main');
			sentryModule = sentry;
		}
		sentryModule.captureException(error, { extra });
	} catch {
		// Sentry not available (development mode or initialization failed)
		logger.debug('Sentry not available for exception reporting', '[Sentry]');
	}
}

/**
 * Reports a message to Sentry from the main process.
 * Lazily loads Sentry to avoid module initialization issues.
 *
 * @param message - The message to report
 * @param level - Severity level
 * @param extra - Additional context data
 */
export async function captureMessage(
	message: string,
	level: SentrySeverityLevel = 'error',
	extra?: Record<string, unknown>
): Promise<void> {
	try {
		if (!sentryModule) {
			const sentry = await import('@sentry/electron/main');
			sentryModule = sentry;
		}
		sentryModule.captureMessage(message, { level, extra });
	} catch {
		// Sentry not available (development mode or initialization failed)
		logger.debug('Sentry not available for message reporting', '[Sentry]');
	}
}
