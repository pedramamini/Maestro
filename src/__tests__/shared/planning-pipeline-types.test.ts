/**
 * Tests for src/shared/planning-pipeline-types.ts
 *
 * Validates stage vocabulary, transition table completeness, label mapping,
 * isValidTransition helper, and InvalidPipelineTransitionError shape.
 */

import { describe, it, expect } from 'vitest';
import {
	PIPELINE_STAGES,
	PIPELINE_FAILURE_STAGES,
	PIPELINE_TRANSITIONS,
	PIPELINE_FAILURE_TRANSITIONS,
	PIPELINE_LABEL_BY_STAGE,
	isValidTransition,
	InvalidPipelineTransitionError,
	type PipelineStage,
	type PipelineFailureStage,
	type AnyPipelineStage,
	type PipelineStageEvent,
} from '../../shared/planning-pipeline-types';

// ---------------------------------------------------------------------------
// Stage vocabulary
// ---------------------------------------------------------------------------

describe('PIPELINE_STAGES', () => {
	it('contains all 10 expected forward stages in order', () => {
		expect(PIPELINE_STAGES).toEqual([
			'idea',
			'prd-draft',
			'prd-finalized',
			'epic-decomposed',
			'tasks-decomposed',
			'agent-ready',
			'runner-active',
			'needs-review',
			'review-approved',
			'fork-merged',
		]);
	});

	it('has exactly 10 entries', () => {
		expect(PIPELINE_STAGES).toHaveLength(10);
	});
});

describe('PIPELINE_FAILURE_STAGES', () => {
	it('contains both failure-loop stages', () => {
		expect(PIPELINE_FAILURE_STAGES).toEqual(['needs-fix', 'fix-active']);
	});

	it('has exactly 2 entries', () => {
		expect(PIPELINE_FAILURE_STAGES).toHaveLength(2);
	});
});

// ---------------------------------------------------------------------------
// Transition table completeness
// ---------------------------------------------------------------------------

describe('PIPELINE_TRANSITIONS', () => {
	it('has an entry for every forward stage (no missing keys)', () => {
		for (const stage of PIPELINE_STAGES) {
			expect(
				PIPELINE_TRANSITIONS,
				`Expected PIPELINE_TRANSITIONS to have a key for stage '${stage}'`
			).toHaveProperty(stage);
		}
	});

	it('has no extra keys beyond the 10 forward stages', () => {
		expect(Object.keys(PIPELINE_TRANSITIONS)).toHaveLength(PIPELINE_STAGES.length);
	});

	it('every transition target is a member of PIPELINE_STAGES or PIPELINE_FAILURE_STAGES', () => {
		const all = new Set<string>([...PIPELINE_STAGES, ...PIPELINE_FAILURE_STAGES]);
		for (const [from, targets] of Object.entries(PIPELINE_TRANSITIONS)) {
			for (const target of targets) {
				expect(
					all.has(target),
					`Transition target '${target}' from '${from}' is not a recognised stage`
				).toBe(true);
			}
		}
	});

	it('terminal stage fork-merged has no outbound transitions', () => {
		expect(PIPELINE_TRANSITIONS['fork-merged']).toHaveLength(0);
	});

	it('needs-review has both review-approved and needs-fix as targets (failure-loop branch)', () => {
		const targets = PIPELINE_TRANSITIONS['needs-review'];
		expect(targets).toContain('review-approved');
		expect(targets).toContain('needs-fix');
	});
});

describe('PIPELINE_FAILURE_TRANSITIONS', () => {
	it('needs-fix leads to fix-active', () => {
		expect(PIPELINE_FAILURE_TRANSITIONS['needs-fix']).toContain('fix-active');
	});

	it('fix-active leads back to needs-review', () => {
		expect(PIPELINE_FAILURE_TRANSITIONS['fix-active']).toContain('needs-review');
	});
});

// ---------------------------------------------------------------------------
// Label mapping
// ---------------------------------------------------------------------------

describe('PIPELINE_LABEL_BY_STAGE', () => {
	it('every forward stage has a label', () => {
		for (const stage of PIPELINE_STAGES) {
			expect(PIPELINE_LABEL_BY_STAGE[stage], `Expected a label for stage '${stage}'`).toBeDefined();
		}
	});

	it('every failure-loop stage has a label', () => {
		for (const stage of PIPELINE_FAILURE_STAGES) {
			expect(
				PIPELINE_LABEL_BY_STAGE[stage],
				`Expected a label for failure stage '${stage}'`
			).toBeDefined();
		}
	});

	it('all labels are non-empty strings', () => {
		for (const [stage, label] of Object.entries(PIPELINE_LABEL_BY_STAGE)) {
			expect(typeof label, `Label for '${stage}' should be a string`).toBe('string');
			expect(label.length, `Label for '${stage}' should not be empty`).toBeGreaterThan(0);
		}
	});

	it('all labels use the pipeline: prefix', () => {
		for (const [stage, label] of Object.entries(PIPELINE_LABEL_BY_STAGE)) {
			expect(
				label.startsWith('pipeline:'),
				`Label for '${stage}' should start with 'pipeline:' but got '${label}'`
			).toBe(true);
		}
	});

	it('covers all 12 stages (10 forward + 2 failure)', () => {
		const total = PIPELINE_STAGES.length + PIPELINE_FAILURE_STAGES.length;
		expect(Object.keys(PIPELINE_LABEL_BY_STAGE)).toHaveLength(total);
	});
});

// ---------------------------------------------------------------------------
// isValidTransition
// ---------------------------------------------------------------------------

describe('isValidTransition', () => {
	it('accepts every edge in PIPELINE_TRANSITIONS', () => {
		for (const [from, targets] of Object.entries(PIPELINE_TRANSITIONS) as [
			PipelineStage,
			AnyPipelineStage[],
		][]) {
			for (const to of targets) {
				expect(
					isValidTransition(from, to),
					`Expected isValidTransition('${from}', '${to}') to be true`
				).toBe(true);
			}
		}
	});

	it('accepts every edge in PIPELINE_FAILURE_TRANSITIONS', () => {
		for (const [from, targets] of Object.entries(PIPELINE_FAILURE_TRANSITIONS) as [
			PipelineFailureStage,
			AnyPipelineStage[],
		][]) {
			for (const to of targets) {
				expect(
					isValidTransition(from, to),
					`Expected isValidTransition('${from}', '${to}') to be true`
				).toBe(true);
			}
		}
	});

	it('rejects a backwards jump (prd-finalized → idea)', () => {
		expect(isValidTransition('prd-finalized', 'idea')).toBe(false);
	});

	it('rejects skipping a stage (idea → prd-finalized)', () => {
		expect(isValidTransition('idea', 'prd-finalized')).toBe(false);
	});

	it('rejects an unrelated jump (runner-active → fork-merged)', () => {
		expect(isValidTransition('runner-active', 'fork-merged')).toBe(false);
	});

	it('rejects self-transitions (agent-ready → agent-ready)', () => {
		expect(isValidTransition('agent-ready', 'agent-ready')).toBe(false);
	});

	it('rejects entering the failure loop from a pre-review stage (tasks-decomposed → needs-fix)', () => {
		expect(isValidTransition('tasks-decomposed', 'needs-fix')).toBe(false);
	});

	it('rejects transitioning from fork-merged (terminal stage)', () => {
		expect(isValidTransition('fork-merged', 'needs-review')).toBe(false);
		expect(isValidTransition('fork-merged', 'needs-fix')).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// PipelineStageEvent interface shape
// ---------------------------------------------------------------------------

describe('PipelineStageEvent', () => {
	it('accepts a well-formed event object', () => {
		const event: PipelineStageEvent = {
			workItemId: 'wg-001',
			fromStage: 'needs-review',
			toStage: 'needs-fix',
			actor: 'agent-claude-code',
			occurredAt: '2026-05-01T12:00:00.000Z',
		};
		expect(event.workItemId).toBe('wg-001');
		expect(event.fromStage).toBe('needs-review');
		expect(event.toStage).toBe('needs-fix');
		expect(event.actor).toBe('agent-claude-code');
		expect(event.occurredAt).toBe('2026-05-01T12:00:00.000Z');
	});
});

// ---------------------------------------------------------------------------
// InvalidPipelineTransitionError
// ---------------------------------------------------------------------------

describe('InvalidPipelineTransitionError', () => {
	it('is an instance of Error', () => {
		const err = new InvalidPipelineTransitionError('idea', 'fork-merged');
		expect(err).toBeInstanceOf(Error);
	});

	it('is an instance of InvalidPipelineTransitionError', () => {
		const err = new InvalidPipelineTransitionError('idea', 'fork-merged');
		expect(err).toBeInstanceOf(InvalidPipelineTransitionError);
	});

	it('sets name to InvalidPipelineTransitionError', () => {
		const err = new InvalidPipelineTransitionError('idea', 'fork-merged');
		expect(err.name).toBe('InvalidPipelineTransitionError');
	});

	it('exposes from and to fields', () => {
		const err = new InvalidPipelineTransitionError('prd-draft', 'fork-merged');
		expect(err.from).toBe('prd-draft');
		expect(err.to).toBe('fork-merged');
	});

	it('generates a descriptive default message when none is provided', () => {
		const err = new InvalidPipelineTransitionError('agent-ready', 'idea');
		expect(err.message).toContain('agent-ready');
		expect(err.message).toContain('idea');
	});

	it('uses a custom message when provided', () => {
		const err = new InvalidPipelineTransitionError('idea', 'fork-merged', 'custom error');
		expect(err.message).toBe('custom error');
	});

	it('preserves the stack trace', () => {
		const err = new InvalidPipelineTransitionError('idea', 'fork-merged');
		expect(err.stack).toBeDefined();
		expect(err.stack).toContain('InvalidPipelineTransitionError');
	});
});
