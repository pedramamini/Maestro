import { describe, it, expect, vi, beforeEach } from 'vitest';

import { SlaBreachNotifier } from '../../../../main/planning-pipeline/sla/notification-emitter';
import { SlaTracker } from '../../../../main/planning-pipeline/sla/sla-tracker';
import type { NotificationChannel } from '../../../../main/planning-pipeline/sla/notification-emitter';
import type { SlaConfig } from '../../../../main/planning-pipeline/sla/sla-types';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const BASE_NOW = 1_700_000_000_000;

const SIMPLE_CONFIG: SlaConfig = {
	thresholdsMs: {
		'runner-active': 10_000,
	},
};

function makeChannel(): NotificationChannel {
	return { post: vi.fn().mockResolvedValue(undefined) };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SlaBreachNotifier', () => {
	let notifier: SlaBreachNotifier;
	let tracker: SlaTracker;

	beforeEach(() => {
		notifier = new SlaBreachNotifier();
		tracker = new SlaTracker();
	});

	// -------------------------------------------------------------------------
	// checkAndNotify — basic notification
	// -------------------------------------------------------------------------

	describe('checkAndNotify', () => {
		it('returns { notified: 0 } when there are no breaches', async () => {
			const channel = makeChannel();
			const result = await notifier.checkAndNotify(BASE_NOW, tracker, SIMPLE_CONFIG, channel);

			expect(result).toEqual({ notified: 0 });
			expect(channel.post).not.toHaveBeenCalled();
		});

		it('posts a notification and returns { notified: 1 } for a single breach', async () => {
			tracker.recordEntry('item-001', 'runner-active', BASE_NOW);
			const channel = makeChannel();

			const result = await notifier.checkAndNotify(
				BASE_NOW + 15_000,
				tracker,
				SIMPLE_CONFIG,
				channel
			);

			expect(result).toEqual({ notified: 1 });
			expect(channel.post).toHaveBeenCalledOnce();
		});

		it('notification payload includes workItemId and stage', async () => {
			tracker.recordEntry('item-42', 'runner-active', BASE_NOW);
			const channel = makeChannel();

			await notifier.checkAndNotify(BASE_NOW + 20_000, tracker, SIMPLE_CONFIG, channel);

			const call = (channel.post as ReturnType<typeof vi.fn>).mock.calls[0][0];
			expect(call.workItemId).toBe('item-42');
			expect(call.title).toContain('runner-active');
			expect(call.body).toContain('item-42');
			expect(call.severity).toBe('warn');
		});

		it('posts notifications for multiple simultaneous breaches', async () => {
			tracker.recordEntry('item-A', 'runner-active', BASE_NOW);
			tracker.recordEntry('item-B', 'runner-active', BASE_NOW);
			const channel = makeChannel();

			const result = await notifier.checkAndNotify(
				BASE_NOW + 30_000,
				tracker,
				SIMPLE_CONFIG,
				channel
			);

			expect(result).toEqual({ notified: 2 });
			expect(channel.post).toHaveBeenCalledTimes(2);
		});

		// -----------------------------------------------------------------------
		// Deduplication
		// -----------------------------------------------------------------------

		it('does NOT re-notify the same breach on a second tick (deduplication)', async () => {
			tracker.recordEntry('item-001', 'runner-active', BASE_NOW);
			const channel = makeChannel();

			// First tick — breach detected
			await notifier.checkAndNotify(BASE_NOW + 15_000, tracker, SIMPLE_CONFIG, channel);
			// Second tick — same item still in breach
			await notifier.checkAndNotify(BASE_NOW + 20_000, tracker, SIMPLE_CONFIG, channel);

			// Only one notification despite two ticks
			expect(channel.post).toHaveBeenCalledOnce();
		});

		it('allows re-notification after resetNotified()', async () => {
			tracker.recordEntry('item-001', 'runner-active', BASE_NOW);
			const channel = makeChannel();

			await notifier.checkAndNotify(BASE_NOW + 15_000, tracker, SIMPLE_CONFIG, channel);
			notifier.resetNotified();
			await notifier.checkAndNotify(BASE_NOW + 20_000, tracker, SIMPLE_CONFIG, channel);

			expect(channel.post).toHaveBeenCalledTimes(2);
		});

		it('hasBeenNotified returns true after a breach was posted', async () => {
			tracker.recordEntry('item-001', 'runner-active', BASE_NOW);
			const channel = makeChannel();

			await notifier.checkAndNotify(BASE_NOW + 15_000, tracker, SIMPLE_CONFIG, channel);

			expect(notifier.hasBeenNotified('item-001', 'runner-active')).toBe(true);
		});

		it('hasBeenNotified returns false for an item not yet in breach', () => {
			expect(notifier.hasBeenNotified('item-999', 'runner-active')).toBe(false);
		});
	});
});
