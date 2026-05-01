/**
 * Path-resolution validation tests for Delivery Planner.
 *
 * These tests cover the path-safety guarantees in
 * `src/main/delivery-planner/path-resolver.ts`:
 *   - `resolveCcpmProjectPaths` produces predictable, containable paths.
 *   - `slugifyCcpmSegment` normalises slugs to lowercase-hyphenated form.
 *   - `resolveCcpmArtifactPath` resolves per-kind paths correctly.
 *   - Paths always stay within the provided project root.
 *   - Paths outside the project root are rejected at config time.
 */

import { describe, it, expect } from 'vitest';
import path from 'path';
import {
	resolveCcpmProjectPaths,
	resolveCcpmArtifactPath,
	slugifyCcpmSegment,
} from '../../../main/delivery-planner/path-resolver';

const PROJECT = '/projects/maestro';

// ---------------------------------------------------------------------------
// slugifyCcpmSegment
// ---------------------------------------------------------------------------

describe('slugifyCcpmSegment', () => {
	it('lowercases and hyphenates a title slug', () => {
		expect(slugifyCcpmSegment('Delivery Planner')).toBe('delivery-planner');
	});

	it('accepts an already-lowercase slug unchanged', () => {
		expect(slugifyCcpmSegment('delivery-planner')).toBe('delivery-planner');
	});

	it('strips leading/trailing whitespace', () => {
		expect(slugifyCcpmSegment('  feature-123  ')).toBe('feature-123');
	});

	it('collapses consecutive non-alphanumeric characters to a single hyphen', () => {
		expect(slugifyCcpmSegment('work  graph')).toBe('work-graph');
	});

	it('strips leading and trailing hyphens after normalisation', () => {
		expect(slugifyCcpmSegment('---title---')).toBe('title');
	});

	it('returns "untitled" for a slug that reduces to empty', () => {
		expect(slugifyCcpmSegment('  !!!  ')).toBe('untitled');
		expect(slugifyCcpmSegment('')).toBe('untitled');
	});

	it('strips single quotes and double quotes', () => {
		expect(slugifyCcpmSegment("O'Reilly's Feature")).toBe('oreillys-feature');
	});
});

// ---------------------------------------------------------------------------
// resolveCcpmProjectPaths — default config
// ---------------------------------------------------------------------------

describe('resolveCcpmProjectPaths — default config', () => {
	it('places prdFile at <project>/.claude/prds/<slug>.md', () => {
		const paths = resolveCcpmProjectPaths(PROJECT, 'delivery-planner');
		expect(paths.prdFile).toBe(path.join(PROJECT, '.claude', 'prds', 'delivery-planner.md'));
	});

	it('places epicFile at <project>/.claude/epics/<slug>/epic.md', () => {
		const paths = resolveCcpmProjectPaths(PROJECT, 'delivery-planner');
		expect(paths.epicFile).toBe(
			path.join(PROJECT, '.claude', 'epics', 'delivery-planner', 'epic.md')
		);
	});

	it('places tasksDir at <project>/.claude/epics/<slug>/tasks', () => {
		const paths = resolveCcpmProjectPaths(PROJECT, 'delivery-planner');
		expect(paths.tasksDir).toBe(
			path.join(PROJECT, '.claude', 'epics', 'delivery-planner', 'tasks')
		);
	});

	it('places progressFile at <project>/.claude/epics/<slug>/progress.md', () => {
		const paths = resolveCcpmProjectPaths(PROJECT, 'delivery-planner');
		expect(paths.progressFile).toBe(
			path.join(PROJECT, '.claude', 'epics', 'delivery-planner', 'progress.md')
		);
	});

	it('places bugsDir at <project>/.claude/epics/<slug>/bugs', () => {
		const paths = resolveCcpmProjectPaths(PROJECT, 'delivery-planner');
		expect(paths.bugsDir).toBe(path.join(PROJECT, '.claude', 'epics', 'delivery-planner', 'bugs'));
	});

	it('normalises an upper-cased slug via slugifyCcpmSegment', () => {
		const paths = resolveCcpmProjectPaths(PROJECT, 'Delivery Planner');
		expect(paths.prdFile).toBe(path.join(PROJECT, '.claude', 'prds', 'delivery-planner.md'));
	});

	it('all resolved paths stay within the project root', () => {
		const paths = resolveCcpmProjectPaths(PROJECT, 'work-graph');
		for (const resolved of Object.values(paths)) {
			if (typeof resolved === 'string') {
				expect(resolved.startsWith(PROJECT)).toBe(true);
			}
		}
	});

	it('exposes the projectRoot, ccpmRoot, prdsDir, epicsDir segments', () => {
		const paths = resolveCcpmProjectPaths(PROJECT, 'living-wiki');
		expect(paths.projectRoot).toBe(PROJECT);
		expect(paths.ccpmRoot).toBe(path.join(PROJECT, '.claude'));
		expect(paths.prdsDir).toBe(path.join(PROJECT, '.claude', 'prds'));
		expect(paths.epicsDir).toBe(path.join(PROJECT, '.claude', 'epics'));
	});
});

// ---------------------------------------------------------------------------
// resolveCcpmProjectPaths — custom config
// ---------------------------------------------------------------------------

describe('resolveCcpmProjectPaths — custom config', () => {
	it('accepts a custom relative ccpmRoot', () => {
		const paths = resolveCcpmProjectPaths(PROJECT, 'work-graph', {
			ccpmRoot: 'planning/.ccpm',
		});
		expect(paths.prdFile).toBe(path.join(PROJECT, 'planning', '.ccpm', 'prds', 'work-graph.md'));
	});

	it('rejects an absolute ccpmRoot that escapes the project', () => {
		expect(() =>
			resolveCcpmProjectPaths(PROJECT, 'test', {
				ccpmRoot: path.dirname(PROJECT),
			})
		).toThrow('CCPM root must be inside the active project');
	});

	it('rejects an absolute prdsDir that escapes the project', () => {
		expect(() =>
			resolveCcpmProjectPaths(PROJECT, 'test', {
				prdsDir: '/tmp/outside',
			})
		).toThrow('CCPM root must be inside the active project');
	});
});

// ---------------------------------------------------------------------------
// resolveCcpmArtifactPath
// ---------------------------------------------------------------------------

describe('resolveCcpmArtifactPath', () => {
	it('resolves a prd artifact path', () => {
		const result = resolveCcpmArtifactPath({
			projectPath: PROJECT,
			kind: 'prd',
			slug: 'delivery-planner',
		});
		expect(result).toBe(path.join(PROJECT, '.claude', 'prds', 'delivery-planner.md'));
	});

	it('resolves an epic artifact path', () => {
		const result = resolveCcpmArtifactPath({
			projectPath: PROJECT,
			kind: 'epic',
			slug: 'delivery-planner',
		});
		expect(result).toBe(path.join(PROJECT, '.claude', 'epics', 'delivery-planner', 'epic.md'));
	});

	it('resolves a numeric task artifact path with zero-padding', () => {
		const result = resolveCcpmArtifactPath({
			projectPath: PROJECT,
			kind: 'task',
			slug: 'delivery-planner',
			taskId: 1,
		});
		expect(result).toBe(
			path.join(PROJECT, '.claude', 'epics', 'delivery-planner', 'tasks', '001.md')
		);
	});

	it('resolves a task artifact path from a string task ID', () => {
		const result = resolveCcpmArtifactPath({
			projectPath: PROJECT,
			kind: 'task',
			slug: 'delivery-planner',
			taskId: '42',
		});
		expect(result).toBe(
			path.join(PROJECT, '.claude', 'epics', 'delivery-planner', 'tasks', '42.md')
		);
	});

	it('resolves a progress artifact path', () => {
		const result = resolveCcpmArtifactPath({
			projectPath: PROJECT,
			kind: 'progress',
			slug: 'delivery-planner',
		});
		expect(result).toBe(path.join(PROJECT, '.claude', 'epics', 'delivery-planner', 'progress.md'));
	});

	it('resolves a bug artifact path', () => {
		const result = resolveCcpmArtifactPath({
			projectPath: PROJECT,
			kind: 'bug',
			slug: 'delivery-planner',
			bugId: 3,
		});
		expect(result).toBe(
			path.join(PROJECT, '.claude', 'epics', 'delivery-planner', 'bugs', '003.md')
		);
	});

	it('resolved artifact path stays within the project root', () => {
		const result = resolveCcpmArtifactPath({
			projectPath: PROJECT,
			kind: 'prd',
			slug: 'work-graph',
		});
		expect(result.startsWith(PROJECT)).toBe(true);
	});
});
