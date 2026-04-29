/**
 * Test helpers for verifying that DOM event listeners attached to a target
 * are removed by the time the component is unmounted.
 *
 * Usage:
 *   const target = document; // or window, or an element
 *   const { addSpy, removeSpy } = spyOnListeners(target);
 *   const { unmount } = render(<MyComponent />);
 *   unmount();
 *   expectAllListenersRemoved(addSpy, removeSpy);
 *
 * The assertion verifies that every (eventType, listener) pair passed to
 * addEventListener was later passed to removeEventListener with the same
 * listener reference. Anonymous-handler leaks are caught because we compare
 * by identity, not name.
 */

import { vi, type MockInstance } from 'vitest';

export type AddListenerSpy = MockInstance<typeof EventTarget.prototype.addEventListener>;
export type RemoveListenerSpy = MockInstance<typeof EventTarget.prototype.removeEventListener>;

export interface ListenerSpyHandles {
	addSpy: AddListenerSpy;
	removeSpy: RemoveListenerSpy;
	/** Restore the original methods. Idempotent. */
	restore: () => void;
}

/**
 * Spy on `addEventListener` and `removeEventListener` of the given target.
 * The originals are still invoked via vi.spyOn's default behaviour, so
 * listeners attached during the test still fire.
 */
export function spyOnListeners(target: EventTarget = document): ListenerSpyHandles {
	const addSpy = vi.spyOn(target, 'addEventListener') as AddListenerSpy;
	const removeSpy = vi.spyOn(target, 'removeEventListener') as RemoveListenerSpy;
	return {
		addSpy,
		removeSpy,
		restore: () => {
			addSpy.mockRestore();
			removeSpy.mockRestore();
		},
	};
}

/**
 * Throw if any (eventType, listener) pair added via addEventListener was not
 * later passed to removeEventListener with the same listener reference.
 *
 * If the same pair was added more than once (rare but legal), each add
 * needs a matching remove — this is a count-aware multiset comparison.
 */
export function expectAllListenersRemoved(
	addSpy: AddListenerSpy,
	removeSpy: RemoveListenerSpy
): void {
	const added = addSpy.mock.calls.map(([eventType, listener]) => ({
		eventType: String(eventType),
		listener,
	}));
	const removed = removeSpy.mock.calls.map(([eventType, listener]) => ({
		eventType: String(eventType),
		listener,
	}));

	const remaining = [...removed];
	const leaked: Array<{ eventType: string }> = [];

	for (const add of added) {
		const idx = remaining.findIndex(
			(r) => r.eventType === add.eventType && r.listener === add.listener
		);
		if (idx === -1) {
			leaked.push({ eventType: add.eventType });
		} else {
			remaining.splice(idx, 1);
		}
	}

	if (leaked.length > 0) {
		const summary = leaked.map((l) => l.eventType).join(', ');
		throw new Error(
			`Listener leak: ${leaked.length} listener(s) added but never removed [${summary}]. ` +
				`Total adds: ${added.length}, total removes: ${removed.length}.`
		);
	}
}
