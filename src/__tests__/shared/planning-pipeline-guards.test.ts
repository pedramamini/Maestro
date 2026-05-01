/**
 * Tests for src/shared/planning-pipeline-guards.ts
 *
 * Covers:
 *   - isPipelineLabel — known/unknown label matrix
 *   - detectCurrentStage — 0 / 1 / 2 pipeline labels
 *   - planStageTransition — happy path, invalid transitions, null-from guard,
 *     multi-label stripping, failure-loop edges
 *   - applyStageTransition — resulting label set with non-pipeline labels preserved
 */

import { describe, it, expect } from 'vitest';
import {
	isPipelineLabel,
	detectCurrentStage,
	planStageTransition,
	applyStageTransition,
} from '../../shared/planning-pipeline-guards';
import { InvalidPipelineTransitionError } from '../../shared/planning-pipeline-types';

// ---------------------------------------------------------------------------
// isPipelineLabel
// ---------------------------------------------------------------------------

describe('isPipelineLabel', () => {
	it('returns true for every canonical pipeline label', () => {
		const knownLabels = [
			'pipeline:idea',
			'pipeline:prd-draft',
			'pipeline:prd-finalized',
			'pipeline:epic-decomposed',
			'pipeline:tasks-decomposed',
			'pipeline:agent-ready',
			'pipeline:runner-active',
			'pipeline:needs-review',
			'pipeline:review-approved',
			'pipeline:fork-merged',
			'pipeline:needs-fix',
			'pipeline:fix-active',
		];
		for (const label of knownLabels) {
			expect(isPipelineLabel(label), `expected ${label} to be a pipeline label`).toBe(true);
		}
	});

	it('returns false for non-pipeline labels', () => {
		expect(isPipelineLabel('bug')).toBe(false);
		expect(isPipelineLabel('enhancement')).toBe(false);
		expect(isPipelineLabel('agent-ready')).toBe(false); // missing prefix
		expect(isPipelineLabel('pipeline:')).toBe(false); // prefix only, no stage
		expect(isPipelineLabel('')).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// detectCurrentStage
// ---------------------------------------------------------------------------

describe('detectCurrentStage', () => {
	it('returns null when labels array is empty', () => {
		expect(detectCurrentStage([])).toBeNull();
	});

	it('returns null when no pipeline labels are present', () => {
		expect(detectCurrentStage(['bug', 'help wanted', 'good first issue'])).toBeNull();
	});

	it('returns the stage when exactly one pipeline label is present', () => {
		expect(detectCurrentStage(['bug', 'pipeline:agent-ready', 'priority:high'])).toBe(
			'agent-ready'
		);
	});

	it('returns the first matched pipeline label when two are present (multi-label edge case)', () => {
		// Order matters — returns whichever pipeline label is first in the array.
		const result = detectCurrentStage(['pipeline:agent-ready', 'pipeline:runner-active']);
		expect(result).toBe('agent-ready');
	});

	it('correctly identifies each failure-loop stage', () => {
		expect(detectCurrentStage(['pipeline:needs-fix'])).toBe('needs-fix');
		expect(detectCurrentStage(['pipeline:fix-active'])).toBe('fix-active');
	});
});

// ---------------------------------------------------------------------------
// planStageTransition — happy path
// ---------------------------------------------------------------------------

describe('planStageTransition — happy path', () => {
	it('initial transition null → idea: adds idea label, removes nothing', () => {
		const plan = planStageTransition([], 'idea');
		expect(plan.from).toBeNull();
		expect(plan.to).toBe('idea');
		expect(plan.add).toEqual(['pipeline:idea']);
		expect(plan.remove).toEqual([]);
	});

	it('idea → prd-draft: strips idea label, adds prd-draft label', () => {
		const plan = planStageTransition(['pipeline:idea', 'bug'], 'prd-draft');
		expect(plan.from).toBe('idea');
		expect(plan.to).toBe('prd-draft');
		expect(plan.add).toEqual(['pipeline:prd-draft']);
		expect(plan.remove).toEqual(['pipeline:idea']);
	});

	it('agent-ready → runner-active: correct labels', () => {
		const plan = planStageTransition(['pipeline:agent-ready', 'priority:high'], 'runner-active');
		expect(plan.from).toBe('agent-ready');
		expect(plan.to).toBe('runner-active');
		expect(plan.add).toEqual(['pipeline:runner-active']);
		expect(plan.remove).toEqual(['pipeline:agent-ready']);
	});

	it('runner-active → needs-review: correct labels', () => {
		const plan = planStageTransition(['pipeline:runner-active'], 'needs-review');
		expect(plan.from).toBe('runner-active');
		expect(plan.to).toBe('needs-review');
		expect(plan.add).toEqual(['pipeline:needs-review']);
		expect(plan.remove).toEqual(['pipeline:runner-active']);
	});

	it('review-approved → fork-merged: terminal transition succeeds', () => {
		const plan = planStageTransition(['pipeline:review-approved'], 'fork-merged');
		expect(plan.from).toBe('review-approved');
		expect(plan.to).toBe('fork-merged');
		expect(plan.add).toEqual(['pipeline:fork-merged']);
		expect(plan.remove).toEqual(['pipeline:review-approved']);
	});
});

// ---------------------------------------------------------------------------
// planStageTransition — failure-loop transitions
// ---------------------------------------------------------------------------

describe('planStageTransition — failure-loop transitions', () => {
	it('needs-review → needs-fix is permitted', () => {
		const plan = planStageTransition(['pipeline:needs-review'], 'needs-fix');
		expect(plan.from).toBe('needs-review');
		expect(plan.to).toBe('needs-fix');
		expect(plan.add).toEqual(['pipeline:needs-fix']);
		expect(plan.remove).toEqual(['pipeline:needs-review']);
	});

	it('needs-fix → fix-active is permitted', () => {
		const plan = planStageTransition(['pipeline:needs-fix'], 'fix-active');
		expect(plan.from).toBe('needs-fix');
		expect(plan.to).toBe('fix-active');
		expect(plan.add).toEqual(['pipeline:fix-active']);
		expect(plan.remove).toEqual(['pipeline:needs-fix']);
	});

	it('fix-active → needs-review is permitted (loop back)', () => {
		const plan = planStageTransition(['pipeline:fix-active'], 'needs-review');
		expect(plan.from).toBe('fix-active');
		expect(plan.to).toBe('needs-review');
		expect(plan.add).toEqual(['pipeline:needs-review']);
		expect(plan.remove).toEqual(['pipeline:fix-active']);
	});
});

// ---------------------------------------------------------------------------
// planStageTransition — invalid transitions (throws)
// ---------------------------------------------------------------------------

describe('planStageTransition — rejects invalid transitions', () => {
	it('throws InvalidPipelineTransitionError for agent-ready → review-approved (skip)', () => {
		expect(() => planStageTransition(['pipeline:agent-ready'], 'review-approved')).toThrow(
			InvalidPipelineTransitionError
		);
	});

	it('error has correct from/to fields', () => {
		let caught: InvalidPipelineTransitionError | null = null;
		try {
			planStageTransition(['pipeline:agent-ready'], 'review-approved');
		} catch (e) {
			caught = e as InvalidPipelineTransitionError;
		}
		expect(caught).not.toBeNull();
		expect(caught!.from).toBe('agent-ready');
		expect(caught!.to).toBe('review-approved');
		expect(caught!.name).toBe('InvalidPipelineTransitionError');
	});

	it('throws for fork-merged → anything (terminal stage has no outbound edges)', () => {
		expect(() => planStageTransition(['pipeline:fork-merged'], 'review-approved')).toThrow(
			InvalidPipelineTransitionError
		);
	});

	it('throws for needs-fix → review-approved (must go through fix-active → needs-review)', () => {
		expect(() => planStageTransition(['pipeline:needs-fix'], 'review-approved')).toThrow(
			InvalidPipelineTransitionError
		);
	});

	it('throws for idea → runner-active (multi-step skip)', () => {
		expect(() => planStageTransition(['pipeline:idea'], 'runner-active')).toThrow(
			InvalidPipelineTransitionError
		);
	});
});

// ---------------------------------------------------------------------------
// planStageTransition — null-from guard
// ---------------------------------------------------------------------------

describe('planStageTransition — from-null only allows idea', () => {
	it('throws when no current pipeline label and target is not idea', () => {
		expect(() => planStageTransition([], 'prd-draft')).toThrow(InvalidPipelineTransitionError);
		expect(() => planStageTransition([], 'runner-active')).toThrow(InvalidPipelineTransitionError);
		expect(() => planStageTransition(['bug', 'priority:high'], 'agent-ready')).toThrow(
			InvalidPipelineTransitionError
		);
	});

	it('error message mentions the requested stage when null-from guard fires', () => {
		let caught: InvalidPipelineTransitionError | null = null;
		try {
			planStageTransition([], 'prd-draft');
		} catch (e) {
			caught = e as InvalidPipelineTransitionError;
		}
		expect(caught).not.toBeNull();
		expect(caught!.message).toMatch(/prd-draft/);
	});

	it('accepts idea as the only valid first stage from null', () => {
		expect(() => planStageTransition([], 'idea')).not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// planStageTransition — multi-label stripping
// ---------------------------------------------------------------------------

describe('planStageTransition — strips ALL pipeline labels when multiple present', () => {
	it('removes both conflicting pipeline labels in the plan', () => {
		// Simulate operator error: item has both agent-ready and runner-active.
		// detectCurrentStage returns 'agent-ready' (first hit).
		// planStageTransition should permit agent-ready → runner-active and strip both.
		const labels = ['pipeline:agent-ready', 'pipeline:runner-active', 'enhancement'];
		const plan = planStageTransition(labels, 'runner-active');
		expect(plan.remove).toContain('pipeline:agent-ready');
		expect(plan.remove).toContain('pipeline:runner-active');
		expect(plan.add).toEqual(['pipeline:runner-active']);
	});
});

// ---------------------------------------------------------------------------
// applyStageTransition
// ---------------------------------------------------------------------------

describe('applyStageTransition', () => {
	it('returns new label set with pipeline label swapped', () => {
		const result = applyStageTransition(
			['pipeline:agent-ready', 'priority:high', 'enhancement'],
			'runner-active'
		);
		expect(result).toContain('pipeline:runner-active');
		expect(result).not.toContain('pipeline:agent-ready');
		// Non-pipeline labels preserved.
		expect(result).toContain('priority:high');
		expect(result).toContain('enhancement');
	});

	it('preserves non-pipeline labels through a failure-loop transition', () => {
		const result = applyStageTransition(
			['pipeline:needs-review', 'bug', 'needs-discussion'],
			'needs-fix'
		);
		expect(result).toContain('pipeline:needs-fix');
		expect(result).not.toContain('pipeline:needs-review');
		expect(result).toContain('bug');
		expect(result).toContain('needs-discussion');
	});

	it('initial transition: adds pipeline:idea to a label-free item', () => {
		const result = applyStageTransition(['good first issue'], 'idea');
		expect(result).toContain('pipeline:idea');
		expect(result).toContain('good first issue');
	});

	it('strips all pipeline labels even when multiple are present', () => {
		const result = applyStageTransition(
			['pipeline:agent-ready', 'pipeline:runner-active'],
			'runner-active'
		);
		// Should contain exactly one pipeline label.
		const pipelineLabels = result.filter((l) => l.startsWith('pipeline:'));
		expect(pipelineLabels).toEqual(['pipeline:runner-active']);
	});

	it('throws InvalidPipelineTransitionError for disallowed transition', () => {
		expect(() => applyStageTransition(['pipeline:agent-ready'], 'review-approved')).toThrow(
			InvalidPipelineTransitionError
		);
	});
});
