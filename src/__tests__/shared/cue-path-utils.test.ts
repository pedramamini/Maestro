import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { computeCommonAncestorPath, isDescendantOrEqual } from '../../shared/cue-path-utils';

describe('computeCommonAncestorPath', () => {
	it('returns null for empty input', () => {
		expect(computeCommonAncestorPath([])).toBeNull();
	});

	it('returns the path itself for a single-element array', () => {
		expect(computeCommonAncestorPath(['/a/b/c'])).toBe('/a/b/c');
	});

	it('returns the common parent for sibling directories', () => {
		expect(computeCommonAncestorPath(['/a/b/c', '/a/b/d'])).toBe('/a/b');
	});

	it('returns the parent when one path is a child of the other', () => {
		expect(computeCommonAncestorPath(['/project', '/project/sub'])).toBe('/project');
	});

	it('returns the parent for deeply nested children', () => {
		expect(computeCommonAncestorPath(['/project', '/project/sub/deep', '/project/other'])).toBe(
			'/project'
		);
	});

	it('returns filesystem root for completely unrelated paths', () => {
		expect(computeCommonAncestorPath(['/a/b', '/c/d'])).toBe('/');
	});

	it('handles identical paths', () => {
		expect(computeCommonAncestorPath(['/a/b', '/a/b'])).toBe('/a/b');
	});

	it('handles three paths with a shared prefix', () => {
		expect(
			computeCommonAncestorPath([
				'/home/user/project/A',
				'/home/user/project/B',
				'/home/user/project/C',
			])
		).toBe('/home/user/project');
	});
});

describe('isDescendantOrEqual', () => {
	it('returns true when paths are identical', () => {
		expect(isDescendantOrEqual('/a/b', '/a/b')).toBe(true);
	});

	it('returns true when child is a subdirectory of parent', () => {
		expect(isDescendantOrEqual('/a/b/c', '/a/b')).toBe(true);
	});

	it('returns true for deeply nested descendant', () => {
		expect(isDescendantOrEqual('/project/sub/deep/nested', '/project')).toBe(true);
	});

	it('returns false when child is not under parent', () => {
		expect(isDescendantOrEqual('/a/b', '/c/d')).toBe(false);
	});

	it('returns false when parent is a subdirectory of child (reversed)', () => {
		expect(isDescendantOrEqual('/a', '/a/b')).toBe(false);
	});

	it('returns false for partial prefix match that is not a directory boundary', () => {
		// /a/bar is NOT a descendant of /a/b — the prefix match is not at a separator
		expect(isDescendantOrEqual('/a/bar', '/a/b')).toBe(false);
	});

	it('handles trailing separators via normalization', () => {
		expect(isDescendantOrEqual('/a/b/c', '/a/b/')).toBe(true);
		expect(isDescendantOrEqual('/a/b/', '/a/b')).toBe(true);
	});
});
