import { describe, it, expect, beforeEach } from 'vitest';

import { SlaTracker } from '../../../../main/planning-pipeline/sla/sla-tracker';
import type { SlaConfig } from '../../../../main/planning-pipeline/sla/sla-types';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const BASE_NOW = 1_700_000_000_000;

const SIMPLE_CONFIG: SlaConfig = {
	thresholdsMs: {
		'runner-active': 10_000,  // 10s
		'agent-ready': 5_000,     // 5s
	},
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SlaTracker', () => {
	let tracker: SlaTracker;

	beforeEach(() => {
		tracker = new SlaTracker();
	});

	// -------------------------------------------------------------------------
	// recordEntry / getDurations
	// -------------------------------------------------------------------------

	describe('recordEntry', () => {
		it('creates a new open duration for a fresh item', () => {
			tracker.recordEntry('item-001', 'runner-active', BASE_NOW);

			const durations = tracker.getDurations('item-001');
			expect(durations).toHaveLength(1);
			expect(durations[0].stage).toBe('runner-active');
			expect(durations[0].enteredAt).toBe(BASE_NOW);
			expect(durations[0].exitedAt).toBeUndefined();
			expect(durations[0].durationMs).toBeUndefined();
		});

		it('appends multiple stage entries for the same item', () => {
			tracker.recordEntry('item-001', 'agent-ready', BASE_NOW);
			tracker.recordEntry('item-001', 'runner-active', BASE_NOW + 1_000);

			const durations = tracker.getDurations('item-001');
			expect(durations).toHaveLength(2);
			expect(durations[0].stage).toBe('agent-ready');
			expect(durations[1].stage).toBe('runner-active');
		});

		it('tracks multiple items independently', () => {
			tracker.recordEntry('item-A', 'runner-active', BASE_NOW);
			tracker.recordEntry('item-B', 'agent-ready', BASE_NOW + 500);

			expect(tracker.getDurations('item-A')).toHaveLength(1);
			expect(tracker.getDurations('item-B')).toHaveLength(1);
			expect(tracker.trackedItemCount).toBe(2);
		});
	});

	// -------------------------------------------------------------------------
	// recordExit
	// -------------------------------------------------------------------------

	describe('recordExit', () => {
		it('closes the most recent open duration', () => {
			tracker.recordEntry('item-001', 'runner-active', BASE_NOW);
			tracker.recordExit('item-001', BASE_NOW + 3_000);

			const durations = tracker.getDurations('item-001');
			expect(durations[0].exitedAt).toBe(BASE_NOW + 3_000);
			expect(durations[0].durationMs).toBe(3_000);
		});

		it('only closes the most recent open duration when multiple exist', () => {
			tracker.recordEntry('item-001', 'agent-ready', BASE_NOW);
			tracker.recordEntry('item-001', 'runner-active', BASE_NOW + 100);

			tracker.recordExit('item-001', BASE_NOW + 200);

			const durations = tracker.getDurations('item-001');
			// Only the last (runner-active) entry should be closed
			expect(durations[0].exitedAt).toBeUndefined();  // agent-ready still open
			expect(durations[1].exitedAt).toBe(BASE_NOW + 200);
		});

		it('is a no-op when the item has no records', () => {
			// Should not throw
			expect(() => tracker.recordExit('nonexistent', BASE_NOW)).not.toThrow();
		});

		it('is a no-op when all durations are already closed', () => {
			tracker.recordEntry('item-001', 'runner-active', BASE_NOW);
			tracker.recordExit('item-001', BASE_NOW + 1_000);

			// Second exit should be silently ignored
			expect(() => tracker.recordExit('item-001', BASE_NOW + 2_000)).not.toThrow();

			const durations = tracker.getDurations('item-001');
			// The first exit timestamp must not be overwritten
			expect(durations[0].exitedAt).toBe(BASE_NOW + 1_000);
		});
	});

	// -------------------------------------------------------------------------
	// getDurations
	// -------------------------------------------------------------------------

	describe('getDurations', () => {
		it('returns an empty array for unknown item IDs', () => {
			expect(tracker.getDurations('nonexistent')).toEqual([]);
		});
	});

	// -------------------------------------------------------------------------
	// findBreaches
	// -------------------------------------------------------------------------

	describe('findBreaches', () => {
		it('returns empty array when there are no tracked items', () => {
			expect(tracker.findBreaches(BASE_NOW, SIMPLE_CONFIG)).toEqual([]);
		});

		it('returns empty array when the open duration has not exceeded the threshold', () => {
			tracker.recordEntry('item-001', 'runner-active', BASE_NOW);

			// Only 5s elapsed; threshold is 10s
			const breaches = tracker.findBreaches(BASE_NOW + 5_000, SIMPLE_CONFIG);
			expect(breaches).toHaveLength(0);
		});

		it('returns a breach when elapsed > threshold', () => {
			tracker.recordEntry('item-001', 'runner-active', BASE_NOW);

			const breaches = tracker.findBreaches(BASE_NOW + 15_000, SIMPLE_CONFIG);
			expect(breaches).toHaveLength(1);
			expect(breaches[0]).toMatchObject({
				workItemId: 'item-001',
				stage: 'runner-active',
				durationMs: 15_000,
				thresholdMs: 10_000,
				enteredAt: BASE_NOW,
			});
		});

		it('does not report a breach at exactly the threshold', () => {
			tracker.recordEntry('item-001', 'runner-active', BASE_NOW);

			// elapsed === threshold: NOT a breach (strictly greater-than required)
			const breaches = tracker.findBreaches(BASE_NOW + 10_000, SIMPLE_CONFIG);
			expect(breaches).toHaveLength(0);
		});

		it('does not report breaches for closed durations', () => {
			tracker.recordEntry('item-001', 'runner-active', BASE_NOW);
			tracker.recordExit('item-001', BASE_NOW + 100);

			// Item exited — must not appear as a breach even though elapsed > threshold
			const breaches = tracker.findBreaches(BASE_NOW + 50_000, SIMPLE_CONFIG);
			expect(breaches).toHaveLength(0);
		});

		it('uses defaultThresholdMs when stage has no explicit entry', () => {
			const config: SlaConfig = {
				thresholdsMs: {},
				defaultThresholdMs: 3_000,
			};
			tracker.recordEntry('item-001', 'needs-review', BASE_NOW);

			const breaches = tracker.findBreaches(BASE_NOW + 5_000, config);
			expect(breaches).toHaveLength(1);
			expect(breaches[0].thresholdMs).toBe(3_000);
		});

		it('skips stages with no threshold and no defaultThresholdMs', () => {
			const config: SlaConfig = { thresholdsMs: {} };
			tracker.recordEntry('item-001', 'needs-review', BASE_NOW);

			// No threshold → never a breach
			const breaches = tracker.findBreaches(BASE_NOW + 999_999, config);
			expect(breaches).toHaveLength(0);
		});

		it('reports breaches across multiple items', () => {
			tracker.recordEntry('item-A', 'runner-active', BASE_NOW);
			tracker.recordEntry('item-B', 'runner-active', BASE_NOW);

			const breaches = tracker.findBreaches(BASE_NOW + 20_000, SIMPLE_CONFIG);
			expect(breaches).toHaveLength(2);
			const ids = breaches.map((b) => b.workItemId).sort();
			expect(ids).toEqual(['item-A', 'item-B']);
		});
	});

	// -------------------------------------------------------------------------
	// clear
	// -------------------------------------------------------------------------

	describe('clear', () => {
		it('removes all records for an item', () => {
			tracker.recordEntry('item-001', 'runner-active', BASE_NOW);
			tracker.clear('item-001');

			expect(tracker.getDurations('item-001')).toEqual([]);
			expect(tracker.trackedItemCount).toBe(0);
		});

		it('is a no-op for unknown item IDs', () => {
			expect(() => tracker.clear('nonexistent')).not.toThrow();
		});
	});
});
