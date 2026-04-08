/**
 * useEventListener.ts
 *
 * Generic hook for adding and removing window event listeners with proper
 * cleanup on unmount or when the event type / handler changes.
 */

import { useEffect, useRef } from 'react';

/**
 * Attaches an event listener to `window` for the given event type and
 * automatically removes it when the component unmounts or dependencies change.
 *
 * @param eventType - The name of the DOM event (e.g. 'maestro:openFileTab')
 * @param handler   - The event handler callback
 *
 * @example
 * useEventListener('maestro:openFileTab', (e: Event) => {
 *   const { sessionId, filePath } = (e as CustomEvent).detail;
 *   // ...
 * });
 */
export function useEventListener(eventType: string, handler: (event: Event) => void): void {
	// Keep a stable ref to the handler so the effect only re-runs when
	// eventType changes, not on every render where handler is re-created.
	const handlerRef = useRef(handler);
	handlerRef.current = handler;

	useEffect(() => {
		const listener = (event: Event) => handlerRef.current(event);
		window.addEventListener(eventType, listener);
		return () => {
			window.removeEventListener(eventType, listener);
		};
	}, [eventType]);
}
