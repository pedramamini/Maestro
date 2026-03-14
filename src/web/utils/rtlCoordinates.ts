/**
 * RTL-aware coordinate utilities for touch gestures and positioning.
 *
 * Abstracts directional calculations so swipe gestures, scroll targeting,
 * and element positioning work correctly in both LTR and RTL layouts.
 *
 * Used primarily by mobile components that rely on JavaScript-computed
 * positions (clientX, offsetLeft, translateX) rather than CSS logical
 * properties alone.
 */

import { useSyncExternalStore } from 'react';

type Direction = 'ltr' | 'rtl';

/**
 * Returns a positive delta for a "forward" swipe (right in LTR, left in RTL)
 * and a negative delta for a "backward" swipe.
 *
 * This normalizes touch deltas so threshold checks like `delta > DISMISS_THRESHOLD`
 * work identically regardless of layout direction.
 */
export function getDirectionalDelta(startX: number, currentX: number, dir: Direction): number {
	const rawDelta = currentX - startX;
	return dir === 'rtl' ? -rawDelta : rawDelta;
}

/**
 * Returns a CSS `translateX()` value that accounts for layout direction.
 *
 * In LTR, a positive offset moves the element right (forward).
 * In RTL, the offset is negated so a positive logical offset still moves
 * the element in the "forward" direction (left in RTL).
 */
export function getDirectionalTranslateX(offset: number, dir: Direction): string {
	const value = dir === 'rtl' ? -offset : offset;
	return `translateX(${value}px)`;
}

/**
 * Returns the element's offset from the inline-start edge of its container.
 *
 * In LTR, this is simply `offsetLeft`. In RTL, it calculates the distance
 * from the right edge: `parent.offsetWidth - element.offsetLeft - element.offsetWidth`.
 */
export function getDirectionalOffsetLeft(element: HTMLElement, dir: Direction): number {
	if (dir === 'ltr') {
		return element.offsetLeft;
	}
	const parent = element.offsetParent as HTMLElement | null;
	const parentWidth = parent ? parent.offsetWidth : document.documentElement.offsetWidth;
	return parentWidth - element.offsetLeft - element.offsetWidth;
}

/**
 * Maps a logical side ('start' | 'end') to a physical CSS side ('left' | 'right')
 * based on the current layout direction.
 */
export function getLogicalSide(side: 'start' | 'end', dir: Direction): 'left' | 'right' {
	if (dir === 'ltr') {
		return side === 'start' ? 'left' : 'right';
	}
	return side === 'start' ? 'right' : 'left';
}

/**
 * Subscribes to `document.documentElement.dir` and returns the current direction.
 *
 * Uses `useSyncExternalStore` with a MutationObserver to react to dir attribute
 * changes, which are set by the DirectionProvider on language switch.
 */
function subscribeToDir(callback: () => void): () => void {
	const observer = new MutationObserver((mutations) => {
		for (const m of mutations) {
			if (m.attributeName === 'dir') {
				callback();
				return;
			}
		}
	});
	observer.observe(document.documentElement, {
		attributes: true,
		attributeFilter: ['dir'],
	});
	return () => observer.disconnect();
}

function getSnapshotDir(): Direction {
	const dir = document.documentElement.dir;
	return dir === 'rtl' ? 'rtl' : 'ltr';
}

/**
 * React hook that returns the current document direction ('ltr' | 'rtl').
 *
 * Reads `document.documentElement.dir` and re-renders when it changes.
 * Suitable for web/mobile components that don't have access to the
 * desktop settings store.
 */
export function useDirection(): Direction {
	return useSyncExternalStore(subscribeToDir, getSnapshotDir, () => 'ltr' as Direction);
}
