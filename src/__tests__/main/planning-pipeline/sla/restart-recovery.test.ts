import { describe, it, expect, vi, beforeEach } from 'vitest';

import { recoverPipelineState } from '../../../../main/planning-pipeline/sla/restart-recovery';
import type {
	RecoveryDeps,
	InFlightRecoveryItem,
} from '../../../../main/planning-pipeline/sla/restart-recovery';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const BASE_NOW = 1_700_000_000_000;

function makeItem(overrides: Partial<InFlightRecoveryItem> & { workItemId: string }): InFlightRecoveryItem {
	return {
		currentStage: 'runner-active',
		...overrides,
	};
}

function makeDeps(
	items: InFlightRecoveryItem[],
	partial: Partial<RecoveryDeps> = {}
): RecoveryDeps {
	return {
		now: () => BASE_NOW,
		listInFlight: vi.fn().mockResolvedValue(items),
		releaseClaim: vi.fn().mockResolvedValue(undefined),
		applyStageTransition: vi.fn().mockResolvedValue(undefined),
		...partial,
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('recoverPipelineState', () => {

	// -------------------------------------------------------------------------
	// No-op cases
	// -------------------------------------------------------------------------

	it('returns zero counts when there are no in-flight items', async () => {
		const deps = makeDeps([]);
		const result = await recoverPipelineState(deps);

		expect(result).toEqual({ rolledBack: 0, releasedExpired: 0 });
		expect(deps.releaseClaim).not.toHaveBeenCalled();
	});

	it('leaves an item alone when it has no claim', async () => {
		const deps = makeDeps([makeItem({ workItemId: 'item-001', claim: undefined })]);
		const result = await recoverPipelineState(deps);

		expect(result).toEqual({ rolledBack: 0, releasedExpired: 0 });
		expect(deps.releaseClaim).not.toHaveBeenCalled();
	});

	it('leaves an item alone when its claim has no expiresAt', async () => {
		const deps = makeDeps([
			makeItem({
				workItemId: 'item-001',
				claim: { sessionId: 'session-x', expiresAt: undefined },
			}),
		]);
		const result = await recoverPipelineState(deps);

		expect(result).toEqual({ rolledBack: 0, releasedExpired: 0 });
		expect(deps.releaseClaim).not.toHaveBeenCalled();
	});

	it('leaves an item alone when its claim is still valid', async () => {
		const deps = makeDeps([
			makeItem({
				workItemId: 'item-001',
				claim: { sessionId: 'session-x', expiresAt: BASE_NOW + 60_000 },
			}),
		]);
		const result = await recoverPipelineState(deps);

		expect(result).toEqual({ rolledBack: 0, releasedExpired: 0 });
		expect(deps.releaseClaim).not.toHaveBeenCalled();
	});

	// -------------------------------------------------------------------------
	// Expired-claim rollback
	// -------------------------------------------------------------------------

	it('releases an expired claim and rolls back runner-active → agent-ready', async () => {
		const deps = makeDeps([
			makeItem({
				workItemId: 'item-001',
				currentStage: 'runner-active',
				claim: { sessionId: 'session-x', expiresAt: BASE_NOW - 1_000 },
			}),
		]);
		const result = await recoverPipelineState(deps);

		expect(result).toEqual({ rolledBack: 1, releasedExpired: 0 });
		expect(deps.releaseClaim).toHaveBeenCalledWith(
			'item-001',
			expect.stringContaining('session-x')
		);
		expect(deps.applyStageTransition).toHaveBeenCalledWith(
			'item-001',
			'runner-active',
			'agent-ready'
		);
	});

	it('releases an expired claim and rolls back fix-active → needs-fix', async () => {
		const deps = makeDeps([
			makeItem({
				workItemId: 'item-002',
				currentStage: 'fix-active',
				claim: { sessionId: 'session-y', expiresAt: BASE_NOW - 500 },
			}),
		]);
		const result = await recoverPipelineState(deps);

		expect(result).toEqual({ rolledBack: 1, releasedExpired: 0 });
		expect(deps.applyStageTransition).toHaveBeenCalledWith(
			'item-002',
			'fix-active',
			'needs-fix'
		);
	});

	it('releases an expired claim without rollback for stages with no predecessor', async () => {
		// 'needs-review' has no STAGE_PREDECESSOR entry
		const deps = makeDeps([
			makeItem({
				workItemId: 'item-003',
				currentStage: 'needs-review',
				claim: { sessionId: 'session-z', expiresAt: BASE_NOW - 500 },
			}),
		]);
		const result = await recoverPipelineState(deps);

		// Only claim release — no stage rollback
		expect(result).toEqual({ rolledBack: 0, releasedExpired: 1 });
		expect(deps.releaseClaim).toHaveBeenCalledOnce();
		expect(deps.applyStageTransition).not.toHaveBeenCalled();
	});

	// -------------------------------------------------------------------------
	// Error resilience
	// -------------------------------------------------------------------------

	it('swallows releaseClaim error and does not apply transition for that item', async () => {
		const deps = makeDeps(
			[
				makeItem({
					workItemId: 'item-001',
					currentStage: 'runner-active',
					claim: { sessionId: 'session-x', expiresAt: BASE_NOW - 1_000 },
				}),
			],
			{
				releaseClaim: vi.fn().mockRejectedValue(new Error('DB unavailable')),
			}
		);

		await expect(recoverPipelineState(deps)).resolves.toBeDefined();
		expect(deps.applyStageTransition).not.toHaveBeenCalled();
	});

	it('failure on one item does not block recovery of the next', async () => {
		const releaseClaim = vi.fn().mockImplementation((id: string) => {
			if (id === 'item-A') return Promise.reject(new Error('release A failed'));
			return Promise.resolve();
		});
		const deps = makeDeps(
			[
				makeItem({
					workItemId: 'item-A',
					currentStage: 'runner-active',
					claim: { sessionId: 's-a', expiresAt: BASE_NOW - 1_000 },
				}),
				makeItem({
					workItemId: 'item-B',
					currentStage: 'runner-active',
					claim: { sessionId: 's-b', expiresAt: BASE_NOW - 2_000 },
				}),
			],
			{ releaseClaim }
		);

		const result = await recoverPipelineState(deps);

		// item-A failed → 0 rollback; item-B succeeded → 1 rollback
		expect(result.rolledBack).toBe(1);
		expect(deps.applyStageTransition).toHaveBeenCalledOnce();
		expect(deps.applyStageTransition).toHaveBeenCalledWith('item-B', 'runner-active', 'agent-ready');
	});
});
