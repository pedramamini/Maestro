/**
 * Path validation utilities for workspace approval security.
 * Normalizes, validates, and classifies paths before granting workspace access.
 */

import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';

/** System-critical directories that should never be approved as workspace dirs */
const SYSTEM_PATHS_POSIX = [
	'/',
	'/etc',
	'/usr',
	'/var',
	'/root',
	'/bin',
	'/sbin',
	'/lib',
	'/boot',
	'/dev',
	'/proc',
	'/sys',
];
const SYSTEM_PATHS_WINDOWS = [
	'C:\\Windows',
	'C:\\System32',
	'C:\\Program Files',
	'C:\\Program Files (x86)',
];

/**
 * Normalize a workspace approval path:
 * - Expand tilde (~) to home directory
 * - Resolve relative paths against projectCwd
 * - Attempt fs.realpath() to resolve symlinks (falls back to resolved path)
 *
 * Returns the normalized absolute path and optionally the symlink target if different.
 */
export async function normalizeApprovalPath(
	rawPath: string,
	projectCwd: string
): Promise<{ normalized: string; symlinkTarget?: string }> {
	let resolved = rawPath;

	// Expand tilde
	if (resolved.startsWith('~')) {
		resolved = path.join(os.homedir(), resolved.slice(1));
	}

	// Resolve relative paths against project CWD
	resolved = path.resolve(projectCwd, resolved);

	// Attempt to resolve symlinks
	try {
		const real = await fs.realpath(resolved);
		if (real !== resolved) {
			return { normalized: real, symlinkTarget: real };
		}
	} catch {
		// Path may not exist yet — use the resolved form
	}

	return { normalized: resolved };
}

/**
 * Synchronous version of normalizeApprovalPath for use in contexts where async is not available.
 * Does not resolve symlinks.
 */
export function normalizeApprovalPathSync(rawPath: string, projectCwd: string): string {
	let resolved = rawPath;

	if (resolved.startsWith('~')) {
		resolved = path.join(os.homedir(), resolved.slice(1));
	}

	return path.resolve(projectCwd, resolved);
}

/**
 * Check if a normalized path is a system-critical directory.
 * These paths should never be approved for workspace access.
 */
export function isSystemPath(normalizedPath: string): boolean {
	const normalized = normalizedPath.replace(/[\\/]+$/, '') || '/'; // Strip trailing separators (preserve root)

	// Check root paths
	if (normalized === '/' || /^[A-Za-z]:[\\/]?$/.test(normalized)) {
		return true;
	}

	// Check POSIX system directories
	for (const sysPath of SYSTEM_PATHS_POSIX) {
		if (normalized === sysPath || normalized.startsWith(sysPath + '/')) {
			// Allow paths under /home (those are user directories)
			if (sysPath === '/' && (normalized.startsWith('/home') || normalized.startsWith('/Users'))) {
				continue;
			}
			return true;
		}
	}

	// Check Windows system directories (case-insensitive)
	const normalizedLower = normalized.toLowerCase().replace(/\//g, '\\');
	for (const sysPath of SYSTEM_PATHS_WINDOWS) {
		const sysLower = sysPath.toLowerCase();
		if (normalizedLower === sysLower || normalizedLower.startsWith(sysLower + '\\')) {
			return true;
		}
	}

	return false;
}

/**
 * Check if a normalized path is within the project scope.
 * A path is in scope if it's under the project CWD or the user's home directory.
 */
export function isWithinProjectScope(normalizedPath: string, projectCwd: string): boolean {
	const normalized = path.resolve(normalizedPath);
	const cwd = path.resolve(projectCwd);
	const home = os.homedir();

	// Check if under project CWD
	if (normalized === cwd || normalized.startsWith(cwd + path.sep)) {
		return true;
	}

	// Check if under home directory
	if (normalized === home || normalized.startsWith(home + path.sep)) {
		return true;
	}

	return false;
}
