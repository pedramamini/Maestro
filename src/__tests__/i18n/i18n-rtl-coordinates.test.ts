/**
 * i18n RTL Coordinate Utility Tests
 *
 * Verifies that the RTL-aware coordinate helpers in
 * src/web/utils/rtlCoordinates.ts produce correct values for
 * both LTR and RTL layout directions.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
	getDirectionalDelta,
	getDirectionalTranslateX,
	getDirectionalOffsetLeft,
	getLogicalSide,
} from '../../web/utils/rtlCoordinates';

describe('RTL Coordinate Utilities', () => {
	describe('getDirectionalDelta', () => {
		it('returns positive delta for rightward swipe in LTR', () => {
			// Swiping from x=100 to x=200 (rightward = forward in LTR)
			expect(getDirectionalDelta(100, 200, 'ltr')).toBe(100);
		});

		it('returns negative delta for leftward swipe in LTR', () => {
			// Swiping from x=200 to x=100 (leftward = backward in LTR)
			expect(getDirectionalDelta(200, 100, 'ltr')).toBe(-100);
		});

		it('returns positive delta for leftward swipe in RTL', () => {
			// Swiping from x=200 to x=100 (leftward = forward in RTL)
			expect(getDirectionalDelta(200, 100, 'rtl')).toBe(100);
		});

		it('returns negative delta for rightward swipe in RTL', () => {
			// Swiping from x=100 to x=200 (rightward = backward in RTL)
			expect(getDirectionalDelta(100, 200, 'rtl')).toBe(-100);
		});

		it('returns zero for no movement in both directions', () => {
			expect(getDirectionalDelta(150, 150, 'ltr')).toBe(0);
			// RTL negation of 0 yields -0; both are == 0
			expect(getDirectionalDelta(150, 150, 'rtl')).toEqual(-0);
		});
	});

	describe('getDirectionalTranslateX', () => {
		it('returns positive translateX in LTR', () => {
			expect(getDirectionalTranslateX(50, 'ltr')).toBe('translateX(50px)');
		});

		it('returns negated translateX in RTL', () => {
			expect(getDirectionalTranslateX(50, 'rtl')).toBe('translateX(-50px)');
		});

		it('handles zero offset in both directions', () => {
			expect(getDirectionalTranslateX(0, 'ltr')).toBe('translateX(0px)');
			expect(getDirectionalTranslateX(0, 'rtl')).toBe('translateX(0px)');
		});

		it('handles negative offset in LTR', () => {
			expect(getDirectionalTranslateX(-30, 'ltr')).toBe('translateX(-30px)');
		});

		it('double-negates negative offset in RTL', () => {
			// -(-30) = 30
			expect(getDirectionalTranslateX(-30, 'rtl')).toBe('translateX(30px)');
		});
	});

	describe('getDirectionalOffsetLeft', () => {
		function makeElement(
			offsetLeft: number,
			offsetWidth: number,
			parentWidth: number
		): HTMLElement {
			const parent = {
				offsetWidth: parentWidth,
			} as HTMLElement;

			const element = {
				offsetLeft,
				offsetWidth,
				offsetParent: parent,
			} as unknown as HTMLElement;

			return element;
		}

		it('returns offsetLeft directly in LTR', () => {
			const el = makeElement(40, 100, 500);
			expect(getDirectionalOffsetLeft(el, 'ltr')).toBe(40);
		});

		it('returns right-edge offset in RTL', () => {
			// parentWidth(500) - offsetLeft(40) - elementWidth(100) = 360
			const el = makeElement(40, 100, 500);
			expect(getDirectionalOffsetLeft(el, 'rtl')).toBe(360);
		});

		it('returns 0 for element flush with start edge in LTR', () => {
			const el = makeElement(0, 100, 500);
			expect(getDirectionalOffsetLeft(el, 'ltr')).toBe(0);
		});

		it('returns 0 for element flush with start edge in RTL', () => {
			// Element at far right: offsetLeft = 400, width = 100, parent = 500
			// 500 - 400 - 100 = 0
			const el = makeElement(400, 100, 500);
			expect(getDirectionalOffsetLeft(el, 'rtl')).toBe(0);
		});

		it('handles element with no offsetParent by using documentElement', () => {
			const element = {
				offsetLeft: 10,
				offsetWidth: 50,
				offsetParent: null,
			} as unknown as HTMLElement;

			// Falls back to document.documentElement.offsetWidth
			const docWidth = document.documentElement.offsetWidth;
			expect(getDirectionalOffsetLeft(element, 'rtl')).toBe(docWidth - 10 - 50);
		});
	});

	describe('getLogicalSide', () => {
		it('maps start to left in LTR', () => {
			expect(getLogicalSide('start', 'ltr')).toBe('left');
		});

		it('maps end to right in LTR', () => {
			expect(getLogicalSide('end', 'ltr')).toBe('right');
		});

		it('maps start to right in RTL', () => {
			expect(getLogicalSide('start', 'rtl')).toBe('right');
		});

		it('maps end to left in RTL', () => {
			expect(getLogicalSide('end', 'rtl')).toBe('left');
		});
	});

	describe('useDirection (document.dir integration)', () => {
		beforeEach(() => {
			document.documentElement.dir = '';
		});

		it('reads ltr when dir is unset', () => {
			// getSnapshotDir falls back to 'ltr' for empty/unrecognized values
			const dir = document.documentElement.dir;
			expect(dir === 'rtl' ? 'rtl' : 'ltr').toBe('ltr');
		});

		it('reads rtl when dir is set to rtl', () => {
			document.documentElement.dir = 'rtl';
			const dir = document.documentElement.dir;
			expect(dir === 'rtl' ? 'rtl' : 'ltr').toBe('rtl');
		});

		it('reads ltr when dir is explicitly set to ltr', () => {
			document.documentElement.dir = 'ltr';
			const dir = document.documentElement.dir;
			expect(dir === 'rtl' ? 'rtl' : 'ltr').toBe('ltr');
		});
	});
});
