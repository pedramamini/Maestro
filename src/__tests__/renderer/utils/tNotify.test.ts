/**
 * @fileoverview Tests for the tNotify() i18n-aware toast notification helper.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock i18n before importing tNotify
vi.mock('../../../shared/i18n/config', () => ({
	default: {
		t: vi.fn((key: string, values?: Record<string, unknown>) => {
			// Simulate basic interpolation for testing
			let result = `translated:${key}`;
			if (values) {
				for (const [k, v] of Object.entries(values)) {
					result = result.replace(`{{${k}}}`, String(v));
				}
			}
			return result;
		}),
	},
}));

// Mock notifyToast
vi.mock('../../../renderer/stores/notificationStore', () => ({
	notifyToast: vi.fn(() => 'toast-123-0'),
}));

import { tNotify } from '../../../renderer/utils/tNotify';
import i18n from '../../../shared/i18n/config';
import { notifyToast } from '../../../renderer/stores/notificationStore';

describe('tNotify', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('translates titleKey and messageKey and calls notifyToast', () => {
		const id = tNotify({
			titleKey: 'notifications:task.completed_title',
			messageKey: 'notifications:task.completed_message',
			type: 'success',
		});

		expect(i18n.t).toHaveBeenCalledWith('notifications:task.completed_title', undefined);
		expect(i18n.t).toHaveBeenCalledWith('notifications:task.completed_message', undefined);
		expect(notifyToast).toHaveBeenCalledWith({
			title: 'translated:notifications:task.completed_title',
			message: 'translated:notifications:task.completed_message',
			type: 'success',
		});
		expect(id).toBe('toast-123-0');
	});

	it('passes interpolation values to both title and message', () => {
		tNotify({
			titleKey: 'notifications:task.failed_title',
			messageKey: 'notifications:task.failed_message',
			type: 'error',
			values: { agent: 'Claude' },
		});

		expect(i18n.t).toHaveBeenCalledWith('notifications:task.failed_title', { agent: 'Claude' });
		expect(i18n.t).toHaveBeenCalledWith('notifications:task.failed_message', { agent: 'Claude' });
	});

	it('passes through extra toast properties', () => {
		tNotify({
			titleKey: 'notifications:task.completed_title',
			messageKey: 'notifications:task.completed_message',
			type: 'success',
			group: 'my-group',
			project: 'my-agent',
			sessionId: 'sess-123',
			tabId: 'tab-456',
			duration: 5000,
		});

		expect(notifyToast).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'success',
				group: 'my-group',
				project: 'my-agent',
				sessionId: 'sess-123',
				tabId: 'tab-456',
				duration: 5000,
			})
		);
	});

	it('passes through action URL properties', () => {
		tNotify({
			titleKey: 'notifications:connection.lost_title',
			messageKey: 'notifications:connection.lost_title',
			type: 'warning',
			actionUrl: 'https://example.com',
			actionLabel: 'Open',
		});

		expect(notifyToast).toHaveBeenCalledWith(
			expect.objectContaining({
				actionUrl: 'https://example.com',
				actionLabel: 'Open',
			})
		);
	});

	it('returns the toast ID from notifyToast', () => {
		const id = tNotify({
			titleKey: 'common:save',
			messageKey: 'common:saved_message',
			type: 'info',
		});

		expect(id).toBe('toast-123-0');
	});
});
