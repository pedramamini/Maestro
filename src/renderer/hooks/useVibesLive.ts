/**
 * useVibesLive Hook
 *
 * Subscribes to the `vibes:annotation-update` IPC event for real-time,
 * push-based annotation count updates. Unlike the polling-based hooks
 * (useVibesData at 10s, useVibesSessionIndicators at 15s, VibesLiveMonitor
 * at 3s), this hook receives updates instantly when annotations are written.
 *
 * Returns a Map of sessionId → latest annotation update payload so that
 * multiple consumers (session list badges, live monitor) can read the
 * most recent data without duplicate subscriptions.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';

// ============================================================================
// Types
// ============================================================================

/** Payload shape matching the vibes:annotation-update IPC event. */
export interface VibesAnnotationUpdate {
	sessionId: string;
	annotationCount: number;
	lastAnnotation: {
		type: string;
		filePath?: string;
		action?: string;
		timestamp: string;
	};
}

/** Return value of the useVibesLive hook. */
export interface UseVibesLiveReturn {
	/** Map from sessionId → latest annotation update. */
	updates: Map<string, VibesAnnotationUpdate>;
	/** Get the annotation count for a specific session. Returns 0 if no data. */
	getCount: (sessionId: string) => number;
	/** Get the last annotation for a specific session. Returns null if no data. */
	getLastAnnotation: (sessionId: string) => VibesAnnotationUpdate['lastAnnotation'] | null;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Subscribes to real-time VIBES annotation updates via IPC.
 *
 * @param enabled - Whether to subscribe (tied to vibesEnabled setting).
 *   When false, the hook returns empty data and does not subscribe.
 *
 * @example
 * ```tsx
 * const { getCount, getLastAnnotation } = useVibesLive(vibesEnabled);
 * const count = getCount(sessionId); // live annotation count
 * ```
 */
export function useVibesLive(enabled: boolean = true): UseVibesLiveReturn {
	const [updates, setUpdates] = useState<Map<string, VibesAnnotationUpdate>>(new Map());
	const mountedRef = useRef(true);

	useEffect(() => {
		mountedRef.current = true;

		if (!enabled) {
			setUpdates(new Map());
			return;
		}

		const cleanup = window.maestro.vibes.onAnnotationUpdate((payload) => {
			if (!mountedRef.current) return;

			setUpdates((prev) => {
				const next = new Map(prev);
				next.set(payload.sessionId, payload);
				return next;
			});
		});

		return () => {
			mountedRef.current = false;
			cleanup();
		};
	}, [enabled]);

	const getCount = useCallback(
		(sessionId: string): number => {
			return updates.get(sessionId)?.annotationCount ?? 0;
		},
		[updates],
	);

	const getLastAnnotation = useCallback(
		(sessionId: string): VibesAnnotationUpdate['lastAnnotation'] | null => {
			return updates.get(sessionId)?.lastAnnotation ?? null;
		},
		[updates],
	);

	return useMemo(
		() => ({ updates, getCount, getLastAnnotation }),
		[updates, getCount, getLastAnnotation],
	);
}
