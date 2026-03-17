/**
 * tNotify — i18n-aware wrapper around notifyToast().
 *
 * Uses the i18n instance directly (not the React hook) so it can be called
 * from anywhere: event handlers, services, orchestrators, etc.
 *
 * Usage:
 *   tNotify({ titleKey: 'notifications:task.completed_title', messageKey: 'notifications:task.completed_message', type: 'success' })
 *   tNotify({ titleKey: 'notifications:task.failed_title', messageKey: 'notifications:task.failed_message', type: 'error', values: { agent: 'Claude' } })
 */

import i18n from '../../shared/i18n/config';
import { notifyToast, type Toast } from '../stores/notificationStore';

export interface TNotifyOptions extends Omit<Toast, 'id' | 'timestamp' | 'title' | 'message'> {
	/** i18n key for the toast title (e.g. "notifications:task.completed_title") */
	titleKey: string;
	/** i18n key for the toast message (e.g. "notifications:task.completed_message") */
	messageKey: string;
	/** Interpolation values passed to both titleKey and messageKey */
	values?: Record<string, string | number>;
}

/**
 * Fire a translated toast notification.
 *
 * Translates `titleKey` and `messageKey` via the i18n instance, then
 * delegates to `notifyToast()` with the resolved strings plus any
 * extra Toast properties (group, project, duration, etc.).
 *
 * @returns The generated toast ID (from notifyToast)
 */
export function tNotify({ titleKey, messageKey, values, ...rest }: TNotifyOptions): string {
	const title = (i18n as any).t(titleKey, values) as string;

	const message = (i18n as any).t(messageKey, values) as string;

	return notifyToast({ title, message, ...rest });
}
