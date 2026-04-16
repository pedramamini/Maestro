/**
 * Path utilities for cross-directory Cue pipeline support.
 *
 * Enables pipelines to span agents in subdirectories of a common project root
 * by detecting ancestor/descendant relationships between project paths.
 */

import * as path from 'path';

/**
 * Given an array of absolute paths, return their longest common directory
 * prefix. Returns `null` for empty input, or the single path for a
 * single-element array.
 *
 * Example: `['/a/b/c', '/a/b/d']` → `'/a/b'`
 */
export function computeCommonAncestorPath(paths: string[]): string | null {
	if (paths.length === 0) return null;

	const normalized = paths.map((p) => path.resolve(p));
	if (normalized.length === 1) return normalized[0];

	const segments = normalized.map((p) => p.split(path.sep));
	const minLength = Math.min(...segments.map((s) => s.length));

	let commonLength = 0;
	for (let i = 0; i < minLength; i++) {
		const segment = segments[0][i];
		if (segments.every((s) => s[i] === segment)) {
			commonLength = i + 1;
		} else {
			break;
		}
	}

	if (commonLength === 0) return path.sep;
	return segments[0].slice(0, commonLength).join(path.sep) || path.sep;
}

/**
 * Returns `true` if `child` is the same as or a subdirectory of `parent`.
 * Both must be absolute paths. Uses normalized comparison.
 */
export function isDescendantOrEqual(child: string, parent: string): boolean {
	const normalizedChild = path.resolve(child);
	const normalizedParent = path.resolve(parent);
	if (normalizedChild === normalizedParent) return true;
	return normalizedChild.startsWith(normalizedParent + path.sep);
}
