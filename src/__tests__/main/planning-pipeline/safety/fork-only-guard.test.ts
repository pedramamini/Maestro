import { describe, it, expect } from 'vitest';

import {
	assertForkOnlyOperation,
	isForkOnlyOperation,
} from '../../../../main/planning-pipeline/safety/fork-only-guard';
import type { ForkOnlyGuardArgs } from '../../../../main/planning-pipeline/safety/fork-only-guard';
import { ForkOnlyViolationError } from '../../../../shared/fork-only-github';

// ---------------------------------------------------------------------------
// assertForkOnlyOperation
// ---------------------------------------------------------------------------

describe('assertForkOnlyOperation', () => {
	// ---- repo slug form ----

	it('accepts the canonical fork repo slug', () => {
		expect(() =>
			assertForkOnlyOperation({ repo: 'HumpfTech/Maestro' })
		).not.toThrow();
	});

	it('rejects the upstream RunMaestro/Maestro slug', () => {
		expect(() =>
			assertForkOnlyOperation({ repo: 'RunMaestro/Maestro' })
		).toThrow(ForkOnlyViolationError);
	});

	it('rejects an arbitrary third-party repo slug', () => {
		expect(() =>
			assertForkOnlyOperation({ repo: 'SomeUser/Maestro' })
		).toThrow(ForkOnlyViolationError);
	});

	// ---- ghArgs form ----

	it('accepts gh args containing -R HumpfTech/Maestro', () => {
		expect(() =>
			assertForkOnlyOperation({
				ghArgs: ['pr', 'create', '-R', 'HumpfTech/Maestro', '--title', 'Test PR'],
			})
		).not.toThrow();
	});

	it('accepts gh args containing --repo HumpfTech/Maestro', () => {
		expect(() =>
			assertForkOnlyOperation({
				ghArgs: ['pr', 'merge', '--repo', 'HumpfTech/Maestro', '--squash'],
			})
		).not.toThrow();
	});

	it('rejects gh args missing -R / --repo flag entirely', () => {
		let thrown: unknown;
		try {
			assertForkOnlyOperation({ ghArgs: ['pr', 'create', '--title', 'Test PR'] });
		} catch (e) {
			thrown = e;
		}

		expect(thrown).toBeInstanceOf(ForkOnlyViolationError);
		// Message must describe the missing flag, not just a wrong owner/repo.
		expect((thrown as Error).message).toMatch(/missing -R/i);
	});

	it('rejects gh args with -R pointing at the upstream repo', () => {
		expect(() =>
			assertForkOnlyOperation({
				ghArgs: ['pr', 'create', '-R', 'RunMaestro/Maestro', '--title', 'Bad PR'],
			})
		).toThrow(ForkOnlyViolationError);
	});

	it('rejects gh args with -R pointing at an arbitrary repo', () => {
		expect(() =>
			assertForkOnlyOperation({
				ghArgs: ['issue', 'comment', '-R', 'evil/repo', '--body', 'hi'],
			})
		).toThrow(ForkOnlyViolationError);
	});

	it('rejects a -R flag that appears at the very end of args (no value)', () => {
		// The flag is present but has no subsequent value — treat as missing.
		expect(() =>
			assertForkOnlyOperation({ ghArgs: ['pr', 'create', '-R'] })
		).toThrow(ForkOnlyViolationError);
	});

	// ---- empty input ----

	it('throws a plain Error (not ForkOnlyViolationError) when neither repo nor ghArgs provided', () => {
		const args: ForkOnlyGuardArgs = {};
		let thrown: unknown;
		try {
			assertForkOnlyOperation(args);
		} catch (e) {
			thrown = e;
		}

		// Must throw...
		expect(thrown).toBeDefined();
		// ...but NOT as a ForkOnlyViolationError (it is a programming error,
		// not a fork-safety violation).
		expect(thrown).not.toBeInstanceOf(ForkOnlyViolationError);
		expect(thrown).toBeInstanceOf(Error);
		expect((thrown as Error).message).toMatch(/at least one/i);
	});
});

// ---------------------------------------------------------------------------
// isForkOnlyOperation
// ---------------------------------------------------------------------------

describe('isForkOnlyOperation', () => {
	it('returns true for the canonical fork slug', () => {
		expect(isForkOnlyOperation({ repo: 'HumpfTech/Maestro' })).toBe(true);
	});

	it('returns false for the upstream slug', () => {
		expect(isForkOnlyOperation({ repo: 'RunMaestro/Maestro' })).toBe(false);
	});

	it('returns true for gh args with correct -R flag', () => {
		expect(
			isForkOnlyOperation({ ghArgs: ['pr', 'create', '-R', 'HumpfTech/Maestro'] })
		).toBe(true);
	});

	it('returns false for gh args missing -R flag', () => {
		expect(isForkOnlyOperation({ ghArgs: ['pr', 'create', '--title', 'foo'] })).toBe(false);
	});

	it('returns false when neither repo nor ghArgs provided', () => {
		expect(isForkOnlyOperation({})).toBe(false);
	});
});
