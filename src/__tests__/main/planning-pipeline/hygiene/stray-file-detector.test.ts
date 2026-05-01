import { describe, it, expect } from 'vitest';

import {
	detectStrayFiles,
	assertNoStrayFiles,
	StrayFilesPresentError,
} from '../../../../main/planning-pipeline/hygiene/stray-file-detector';
import type { StrayFileDetectorDeps } from '../../../../main/planning-pipeline/hygiene/stray-file-detector';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Build a `runGit` stub that returns the given porcelain output string.
 * Asserts that `args` is always `['status', '--porcelain']`.
 */
function makeRunGit(porcelainOutput: string): StrayFileDetectorDeps['runGit'] {
	return async (args: string[]) => {
		expect(args).toEqual(['status', '--porcelain']);
		return { stdout: porcelainOutput };
	};
}

/** Convenience builder for full deps. */
function makeDeps(
	porcelainOutput: string,
	allowlist?: ReadonlyArray<string | RegExp>
): StrayFileDetectorDeps {
	return { runGit: makeRunGit(porcelainOutput), allowlist };
}

// ---------------------------------------------------------------------------
// detectStrayFiles
// ---------------------------------------------------------------------------

describe('detectStrayFiles', () => {
	it('returns empty report when git status is empty', async () => {
		const report = await detectStrayFiles(makeDeps(''));

		expect(report.strays).toEqual([]);
		expect(report.modified).toEqual([]);
		expect(report.untracked).toEqual([]);
		expect(report.allowlisted).toEqual([]);
	});

	it('classifies modified (tracked) files correctly', async () => {
		// " M" = worktree modified, "M " = staged
		const porcelain = [' M src/foo.ts', 'M  src/bar.ts'].join('\n');
		const report = await detectStrayFiles(makeDeps(porcelain));

		expect(report.modified).toEqual(['src/foo.ts', 'src/bar.ts']);
		expect(report.untracked).toEqual([]);
		expect(report.strays).toEqual(['src/foo.ts', 'src/bar.ts']);
	});

	it('classifies untracked files correctly', async () => {
		const porcelain = '?? stray-test-file.txt\n?? docs/leaked.md';
		const report = await detectStrayFiles(makeDeps(porcelain));

		expect(report.untracked).toEqual(['stray-test-file.txt', 'docs/leaked.md']);
		expect(report.modified).toEqual([]);
		expect(report.strays).toEqual(['stray-test-file.txt', 'docs/leaked.md']);
	});

	it('handles a mix of modified and untracked files', async () => {
		const porcelain = [
			' M src/renderer/App.tsx',
			'?? stray-artifact.json',
			'M  src/main/index.ts',
			'?? .tmp/build-cache/',
		].join('\n');
		const report = await detectStrayFiles(makeDeps(porcelain));

		expect(report.modified).toEqual(['src/renderer/App.tsx', 'src/main/index.ts']);
		expect(report.untracked).toEqual(['stray-artifact.json', '.tmp/build-cache/']);
		expect(report.strays).toHaveLength(4);
	});

	it('filters strays via exact-string allowlist', async () => {
		const porcelain = '?? docs/symphony-runner-learnings.md\n?? stray.ts';
		const report = await detectStrayFiles(
			makeDeps(porcelain, ['docs/symphony-runner-learnings.md'])
		);

		expect(report.allowlisted).toEqual(['docs/symphony-runner-learnings.md']);
		expect(report.strays).toEqual(['stray.ts']);
		// Both files still appear in untracked
		expect(report.untracked).toHaveLength(2);
	});

	it('filters strays via RegExp allowlist', async () => {
		const porcelain = [
			'?? docs/generated-report.md',
			'?? docs/another.md',
			'?? src/leaked.ts',
		].join('\n');
		const report = await detectStrayFiles(makeDeps(porcelain, [/^docs\//]));

		expect(report.allowlisted).toEqual(['docs/generated-report.md', 'docs/another.md']);
		expect(report.strays).toEqual(['src/leaked.ts']);
	});

	it('filters strays via mixed string and RegExp allowlist', async () => {
		const porcelain = [
			'?? README.md',
			'?? docs/notes.md',
			' M package-lock.json',
			'?? actual-stray.ts',
		].join('\n');
		const report = await detectStrayFiles(
			makeDeps(porcelain, ['README.md', /^docs\//, /package-lock\.json/])
		);

		expect(report.allowlisted).toHaveLength(3);
		expect(report.strays).toEqual(['actual-stray.ts']);
	});

	it('returns empty strays when all dirty files are allowlisted', async () => {
		const porcelain = '?? docs/symphony-runner-learnings.md';
		const report = await detectStrayFiles(
			makeDeps(porcelain, ['docs/symphony-runner-learnings.md'])
		);

		expect(report.strays).toEqual([]);
		expect(report.allowlisted).toEqual(['docs/symphony-runner-learnings.md']);
	});

	it('handles rename lines by reporting the destination path', async () => {
		// Porcelain v1 rename: "R  old-name.ts -> new-name.ts"
		const porcelain = 'R  old-name.ts -> new-name.ts';
		const report = await detectStrayFiles(makeDeps(porcelain));

		expect(report.modified).toEqual(['new-name.ts']);
		expect(report.strays).toEqual(['new-name.ts']);
	});
});

// ---------------------------------------------------------------------------
// assertNoStrayFiles
// ---------------------------------------------------------------------------

describe('assertNoStrayFiles', () => {
	it('resolves without throwing when working tree is clean', async () => {
		await expect(assertNoStrayFiles(makeDeps(''))).resolves.toBeUndefined();
	});

	it('throws StrayFilesPresentError when strays are present', async () => {
		const porcelain = '?? leaked-file.ts';
		await expect(assertNoStrayFiles(makeDeps(porcelain))).rejects.toThrow(
			StrayFilesPresentError
		);
	});

	it('includes the stray file list in the thrown error', async () => {
		const porcelain = '?? file-a.ts\n?? file-b.ts';
		let caught: unknown;
		try {
			await assertNoStrayFiles(makeDeps(porcelain));
		} catch (err) {
			caught = err;
		}
		expect(caught).toBeInstanceOf(StrayFilesPresentError);
		const error = caught as StrayFilesPresentError;
		expect(error.strays).toEqual(['file-a.ts', 'file-b.ts']);
	});

	it('does not throw when allowlist swallows all strays', async () => {
		const porcelain = '?? docs/symphony-runner-learnings.md';
		await expect(
			assertNoStrayFiles(makeDeps(porcelain, ['docs/symphony-runner-learnings.md']))
		).resolves.toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// StrayFilesPresentError shape
// ---------------------------------------------------------------------------

describe('StrayFilesPresentError', () => {
	it('is an instance of Error', () => {
		const err = new StrayFilesPresentError(['foo.ts']);
		expect(err).toBeInstanceOf(Error);
	});

	it('has the correct name property', () => {
		const err = new StrayFilesPresentError(['foo.ts']);
		expect(err.name).toBe('StrayFilesPresentError');
	});

	it('exposes strays on the error object', () => {
		const strays = ['a.ts', 'b.ts', 'c.ts'];
		const err = new StrayFilesPresentError(strays);
		expect(err.strays).toEqual(strays);
	});

	it('includes file paths in the error message', () => {
		const err = new StrayFilesPresentError(['stray-artifact.json']);
		expect(err.message).toContain('stray-artifact.json');
	});
});
