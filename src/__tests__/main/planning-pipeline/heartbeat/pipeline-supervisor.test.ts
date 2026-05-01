import { describe, it, expect, vi, beforeEach } from 'vitest';

import { PipelineSupervisor } from '../../../../main/planning-pipeline/heartbeat/pipeline-supervisor';
import type {
	PipelineSupervisorDeps,
	InFlightWorkItem,
} from '../../../../main/planning-pipeline/heartbeat/supervisor-types';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const BASE_NOW_MS = 1_700_000_000_000; // arbitrary fixed epoch for determinism

/** Returns an ISO string relative to BASE_NOW_MS. */
function iso(offsetMs: number): string {
	return new Date(BASE_NOW_MS + offsetMs).toISOString();
}

/** Build a minimal InFlightWorkItem. */
function makeItem(overrides: {
	workItemId?: string;
	sessionId?: string;
	expiresAt?: string;
	attempt?: number;
}): InFlightWorkItem {
	return {
		workItemId: overrides.workItemId ?? 'item-001',
		claim: {
			sessionId: overrides.sessionId ?? 'session-abc',
			expiresAt: overrides.expiresAt,
			attempt: overrides.attempt,
		},
	};
}

/** Build a deps stub. */
function makeDeps(
	items: InFlightWorkItem[],
	overrides: Partial<PipelineSupervisorDeps> = {}
): PipelineSupervisorDeps {
	return {
		now: () => BASE_NOW_MS,
		releaseClaim: vi.fn().mockResolvedValue(undefined),
		retryClaim: vi.fn().mockResolvedValue({ retried: true, attempt: 1 }),
		deadLetter: vi.fn().mockResolvedValue(undefined),
		listInFlight: vi.fn().mockResolvedValue(items),
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PipelineSupervisor', () => {
	describe('tick — no-op cases', () => {
		it('returns zero counts when no items are in flight', async () => {
			const deps = makeDeps([]);
			const supervisor = new PipelineSupervisor(deps);

			const result = await supervisor.tick();

			expect(result).toEqual({ released: 0, retried: 0, deadLettered: 0 });
		});

		it('is a no-op when the only item has not yet expired', async () => {
			// expiresAt is 1 second in the future
			const deps = makeDeps([makeItem({ expiresAt: iso(1_000) })]);
			const supervisor = new PipelineSupervisor(deps);

			const result = await supervisor.tick();

			expect(result).toEqual({ released: 0, retried: 0, deadLettered: 0 });
			expect(deps.releaseClaim).not.toHaveBeenCalled();
		});

		it('is a no-op when the item has no expiresAt', async () => {
			const deps = makeDeps([makeItem({ expiresAt: undefined })]);
			const supervisor = new PipelineSupervisor(deps);

			const result = await supervisor.tick();

			expect(result).toEqual({ released: 0, retried: 0, deadLettered: 0 });
			expect(deps.releaseClaim).not.toHaveBeenCalled();
		});

		it('uses injected now() — item is not expired when now() is before expiresAt', async () => {
			// Item expires at BASE_NOW_MS + 500ms; now() returns BASE_NOW_MS
			const deps = makeDeps([makeItem({ expiresAt: iso(500) })]);
			const supervisor = new PipelineSupervisor(deps);

			const result = await supervisor.tick();

			expect(result.released).toBe(0);
		});
	});

	describe('tick — release expired claims', () => {
		it('releases a claim that expired exactly at now()', async () => {
			// expiresAt === now → should be treated as expired (not strictly greater)
			const deps = makeDeps([makeItem({ expiresAt: iso(0) })]);
			const supervisor = new PipelineSupervisor(deps);

			const result = await supervisor.tick();

			expect(deps.releaseClaim).toHaveBeenCalledOnce();
			expect(result.released).toBe(1);
		});

		it('releases a claim that expired in the past', async () => {
			const deps = makeDeps([makeItem({ expiresAt: iso(-5_000) })]);
			const supervisor = new PipelineSupervisor(deps);

			const result = await supervisor.tick();

			expect(deps.releaseClaim).toHaveBeenCalledWith(
				'item-001',
				expect.stringContaining('session-abc')
			);
			expect(result.released).toBe(1);
		});
	});

	describe('tick — retry within budget', () => {
		it('retries when attempt is 0 and maxRetries is 2 (default)', async () => {
			const deps = makeDeps([makeItem({ expiresAt: iso(-1_000), attempt: 0 })]);
			const supervisor = new PipelineSupervisor(deps);

			const result = await supervisor.tick();

			expect(deps.retryClaim).toHaveBeenCalledOnce();
			expect(deps.retryClaim).toHaveBeenCalledWith('item-001', {
				previousSessionId: 'session-abc',
				attempt: 0,
			});
			expect(result.retried).toBe(1);
			expect(result.deadLettered).toBe(0);
		});

		it('retries when attempt is 1 and maxRetries is 2', async () => {
			const deps = makeDeps([makeItem({ expiresAt: iso(-1_000), attempt: 1 })]);
			const supervisor = new PipelineSupervisor(deps);

			const result = await supervisor.tick();

			expect(deps.retryClaim).toHaveBeenCalledOnce();
			expect(result.retried).toBe(1);
			expect(result.deadLettered).toBe(0);
		});

		it('treats missing attempt field as attempt 0 (within budget)', async () => {
			// No attempt field → defaults to 0
			const deps = makeDeps([makeItem({ expiresAt: iso(-1_000) })]);
			const supervisor = new PipelineSupervisor(deps);

			const result = await supervisor.tick();

			expect(deps.retryClaim).toHaveBeenCalledOnce();
			expect(result.retried).toBe(1);
		});
	});

	describe('tick — dead-letter at budget exhaustion', () => {
		it('dead-letters when attempt equals maxRetries (default 2)', async () => {
			const deps = makeDeps([makeItem({ expiresAt: iso(-1_000), attempt: 2 })]);
			const supervisor = new PipelineSupervisor(deps);

			const result = await supervisor.tick();

			expect(deps.deadLetter).toHaveBeenCalledOnce();
			expect(deps.deadLetter).toHaveBeenCalledWith(
				'item-001',
				expect.stringContaining('exceeded retry budget')
			);
			expect(result.deadLettered).toBe(1);
			expect(result.retried).toBe(0);
		});

		it('dead-letters when attempt exceeds maxRetries', async () => {
			const deps = makeDeps([makeItem({ expiresAt: iso(-1_000), attempt: 5 })]);
			const supervisor = new PipelineSupervisor(deps);

			const result = await supervisor.tick();

			expect(deps.deadLetter).toHaveBeenCalledOnce();
			expect(result.deadLettered).toBe(1);
			expect(result.retried).toBe(0);
		});

		it('respects a custom maxRetries=0 — dead-letters on first failure', async () => {
			const deps = makeDeps([makeItem({ expiresAt: iso(-1_000), attempt: 0 })], {
				maxRetries: 0,
			});
			const supervisor = new PipelineSupervisor(deps);

			const result = await supervisor.tick();

			expect(deps.deadLetter).toHaveBeenCalledOnce();
			expect(result.deadLettered).toBe(1);
			expect(result.retried).toBe(0);
		});

		it('dead-letter reason includes attempt count', async () => {
			// attempt=2 → totalAttempts=3
			const deps = makeDeps([makeItem({ expiresAt: iso(-1_000), attempt: 2 })]);
			const supervisor = new PipelineSupervisor(deps);

			await supervisor.tick();

			expect(deps.deadLetter).toHaveBeenCalledWith(
				expect.any(String),
				expect.stringContaining('3 attempts')
			);
		});
	});

	describe('tick — error resilience', () => {
		it('swallows releaseClaim error and does not retry/dead-letter that item', async () => {
			const deps = makeDeps([makeItem({ expiresAt: iso(-1_000), attempt: 0 })], {
				releaseClaim: vi.fn().mockRejectedValue(new Error('DB unavailable')),
			});
			const supervisor = new PipelineSupervisor(deps);

			// Must resolve without throwing
			await expect(supervisor.tick()).resolves.toBeDefined();

			expect(deps.retryClaim).not.toHaveBeenCalled();
			expect(deps.deadLetter).not.toHaveBeenCalled();
		});

		it('failure on item A does not block processing of item B', async () => {
			const itemA = makeItem({ workItemId: 'item-A', expiresAt: iso(-1_000), attempt: 0 });
			const itemB = makeItem({ workItemId: 'item-B', expiresAt: iso(-1_000), attempt: 0 });

			const releaseClaim = vi
				.fn()
				.mockImplementation((id: string) => {
					if (id === 'item-A') return Promise.reject(new Error('release A failed'));
					return Promise.resolve();
				});

			const deps = makeDeps([itemA, itemB], { releaseClaim });
			const supervisor = new PipelineSupervisor(deps);

			const result = await supervisor.tick();

			// Item A failed release → not counted; item B succeeded
			expect(result.released).toBe(1);
			expect(result.retried).toBe(1);
		});

		it('swallows retryClaim error and still counts the release', async () => {
			const deps = makeDeps([makeItem({ expiresAt: iso(-1_000), attempt: 0 })], {
				retryClaim: vi.fn().mockRejectedValue(new Error('queue full')),
			});
			const supervisor = new PipelineSupervisor(deps);

			const result = await supervisor.tick();

			// Release succeeded; retry failed (swallowed)
			expect(result.released).toBe(1);
			expect(result.retried).toBe(0);
		});

		it('swallows deadLetter error and still counts the release', async () => {
			const deps = makeDeps([makeItem({ expiresAt: iso(-1_000), attempt: 2 })], {
				deadLetter: vi.fn().mockRejectedValue(new Error('state machine error')),
			});
			const supervisor = new PipelineSupervisor(deps);

			const result = await supervisor.tick();

			expect(result.released).toBe(1);
			expect(result.deadLettered).toBe(0);
		});
	});

	describe('tick — summary counts are accurate', () => {
		it('counts multiple expired items correctly', async () => {
			const items: InFlightWorkItem[] = [
				makeItem({ workItemId: 'i1', expiresAt: iso(-1_000), attempt: 0 }), // retry
				makeItem({ workItemId: 'i2', expiresAt: iso(-2_000), attempt: 1 }), // retry
				makeItem({ workItemId: 'i3', expiresAt: iso(-3_000), attempt: 2 }), // dead-letter
				makeItem({ workItemId: 'i4', expiresAt: iso(5_000) }),               // not expired
			];
			const deps = makeDeps(items);
			const supervisor = new PipelineSupervisor(deps);

			const result = await supervisor.tick();

			expect(result.released).toBe(3);
			expect(result.retried).toBe(2);
			expect(result.deadLettered).toBe(1);
		});

		it('uses injected now() so tests are fully deterministic', async () => {
			let callCount = 0;
			const customNow = () => {
				callCount += 1;
				return BASE_NOW_MS;
			};

			const deps = makeDeps(
				[makeItem({ expiresAt: iso(-1_000), attempt: 0 })],
				{ now: customNow }
			);
			const supervisor = new PipelineSupervisor(deps);

			await supervisor.tick();

			// now() must have been called during the tick
			expect(callCount).toBeGreaterThan(0);
		});
	});
});
