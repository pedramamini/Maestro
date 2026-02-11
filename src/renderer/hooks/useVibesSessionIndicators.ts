/**
 * useVibesSessionIndicators Hook
 *
 * Lightweight hook for tracking per-session VIBES annotation counts in the
 * sidebar session list. Unlike the full useVibesData hook (which fetches 5
 * endpoints in parallel), this hook only calls `vibes.isInitialized` and
 * `vibes.getStats` per unique project path to minimize IPC overhead.
 *
 * Polls every 15 seconds when enabled.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { Session } from '../types';

// ============================================================================
// Types
// ============================================================================

/** Per-project VIBES indicator data. */
export interface VibesIndicatorData {
	/** Whether `.ai-audit/` is initialized for this project path. */
	isInitialized: boolean;
	/** Total annotation count for the project. */
	annotationCount: number;
}

/** Return value of the useVibesSessionIndicators hook. */
export interface UseVibesSessionIndicatorsReturn {
	/** Map from projectRoot → indicator data. */
	indicators: Map<string, VibesIndicatorData>;
	/** Whether data is currently being fetched. */
	isLoading: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const POLL_INTERVAL_MS = 15_000;

// ============================================================================
// Hook
// ============================================================================

/**
 * Provides lightweight VIBES annotation counts keyed by session project path.
 *
 * @param sessions - Array of all sessions to track.
 * @param enabled - Whether polling is active (tied to vibesEnabled setting).
 */
export function useVibesSessionIndicators(
	sessions: Session[],
	enabled: boolean,
): UseVibesSessionIndicatorsReturn {
	const [indicators, setIndicators] = useState<Map<string, VibesIndicatorData>>(new Map());
	const [isLoading, setIsLoading] = useState(false);
	const mountedRef = useRef(true);

	// Deduplicate project paths across all sessions.
	const uniquePaths = useMemo(() => {
		const paths = new Set<string>();
		for (const session of sessions) {
			const path = session.projectRoot || session.cwd;
			if (path) paths.add(path);
		}
		return Array.from(paths);
	}, [sessions]);

	// Fetch indicator data for all unique project paths.
	const fetchIndicators = useCallback(async () => {
		if (!enabled || uniquePaths.length === 0) return;

		try {
			const results = await Promise.all(
				uniquePaths.map(async (projectPath) => {
					try {
						const [initialized, statsResult] = await Promise.all([
							window.maestro.vibes.isInitialized(projectPath),
							window.maestro.vibes.getStats(projectPath),
						]);

						let annotationCount = 0;
						if (statsResult.success && statsResult.data) {
							try {
								const data = JSON.parse(statsResult.data);
								annotationCount =
									data.total_annotations ?? data.totalAnnotations ?? 0;
							} catch {
								// Ignore parse errors
							}
						}

						return {
							projectPath,
							isInitialized: initialized,
							annotationCount,
						};
					} catch {
						return {
							projectPath,
							isInitialized: false,
							annotationCount: 0,
						};
					}
				}),
			);

			if (!mountedRef.current) return;

			const newMap = new Map<string, VibesIndicatorData>();
			for (const result of results) {
				newMap.set(result.projectPath, {
					isInitialized: result.isInitialized,
					annotationCount: result.annotationCount,
				});
			}
			setIndicators(newMap);
		} catch {
			// Silently fail — sidebar indicators are non-critical
		} finally {
			if (mountedRef.current) {
				setIsLoading(false);
			}
		}
	}, [enabled, uniquePaths]);

	// Initial fetch and polling interval.
	useEffect(() => {
		mountedRef.current = true;

		if (!enabled || uniquePaths.length === 0) {
			setIndicators(new Map());
			setIsLoading(false);
			return;
		}

		setIsLoading(true);
		fetchIndicators();

		const intervalId = setInterval(() => {
			if (mountedRef.current) {
				fetchIndicators();
			}
		}, POLL_INTERVAL_MS);

		return () => {
			mountedRef.current = false;
			clearInterval(intervalId);
		};
	}, [enabled, uniquePaths, fetchIndicators]);

	return useMemo(
		() => ({ indicators, isLoading }),
		[indicators, isLoading],
	);
}
