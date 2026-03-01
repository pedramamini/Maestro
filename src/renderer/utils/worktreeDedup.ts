/**
 * Shared dedup mechanism for worktree paths.
 *
 * When creating a worktree, the path is marked here BEFORE the directory is
 * created on disk. The file watcher in useWorktreeHandlers checks this set
 * to avoid creating a duplicate session for a worktree that was just created
 * programmatically (e.g., by useAutoRunHandlers or useWorktreeHandlers).
 *
 * Module-level so both hooks can share the same Set without prop drilling.
 */

function normalizePath(p: string): string {
	return p.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
}

const recentlyCreatedPaths = new Set<string>();
const cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Mark a worktree path as recently created. The file watcher will skip
 * it for `ttlMs` milliseconds to avoid duplicate session creation.
 */
export function markWorktreePathAsRecentlyCreated(path: string, ttlMs = 10000): void {
	const normalized = normalizePath(path);
	recentlyCreatedPaths.add(normalized);

	// Reset any existing timer so re-marking extends the TTL
	const existingTimer = cleanupTimers.get(normalized);
	if (existingTimer) {
		clearTimeout(existingTimer);
	}

	const timer = setTimeout(() => {
		recentlyCreatedPaths.delete(normalized);
		cleanupTimers.delete(normalized);
	}, ttlMs);
	cleanupTimers.set(normalized, timer);
}

/**
 * Remove a path from the recently-created set (e.g., on creation failure).
 */
export function clearRecentlyCreatedWorktreePath(path: string): void {
	const normalized = normalizePath(path);
	recentlyCreatedPaths.delete(normalized);

	const timer = cleanupTimers.get(normalized);
	if (timer) {
		clearTimeout(timer);
		cleanupTimers.delete(normalized);
	}
}

/**
 * Check if a path was recently created programmatically.
 */
export function isRecentlyCreatedWorktreePath(path: string): boolean {
	return recentlyCreatedPaths.has(normalizePath(path));
}
