/**
 * i18n RTL Integration Tests — Touch Gestures and Dynamic Positioning
 *
 * Validates that RTL-aware coordinate utilities, toggle switch positioning,
 * and context menu anchoring all work correctly and coherently when the
 * document direction is set to RTL.
 *
 * These are integration-level tests that verify cross-cutting RTL behavior
 * rather than testing individual utilities in isolation.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { render } from '@testing-library/react';
import React from 'react';
import { useRef } from 'react';
import {
	getDirectionalDelta,
	getDirectionalTranslateX,
	getLogicalSide,
} from '../../web/utils/rtlCoordinates';
import { useContextMenuPosition } from '../../renderer/hooks/ui/useContextMenuPosition';
import { ToggleSwitch } from '../../renderer/components/ui/ToggleSwitch';
import type { Theme } from '../../renderer/types';

const mockTheme: Theme = {
	id: 'test-theme',
	name: 'Test Theme',
	mode: 'dark',
	colors: {
		bgMain: '#1a1a1a',
		bgSidebar: '#242424',
		bgActivity: '#2a2a2a',
		textMain: '#ffffff',
		textDim: '#888888',
		accent: '#3b82f6',
		accentForeground: '#ffffff',
		border: '#333333',
		error: '#ef4444',
		success: '#22c55e',
		warning: '#f59e0b',
		cursor: '#ffffff',
		terminalBg: '#1a1a1a',
	},
};

describe('RTL Touch and Positioning Integration', () => {
	const originalDir = document.documentElement.dir;
	const originalInnerWidth = window.innerWidth;
	const originalInnerHeight = window.innerHeight;
	const originalGetBCR = Element.prototype.getBoundingClientRect;

	afterEach(() => {
		document.documentElement.dir = originalDir;
		Object.defineProperty(window, 'innerWidth', { value: originalInnerWidth, configurable: true });
		Object.defineProperty(window, 'innerHeight', {
			value: originalInnerHeight,
			configurable: true,
		});
		Element.prototype.getBoundingClientRect = originalGetBCR;
	});

	describe('getDirectionalDelta — swipe direction normalization', () => {
		it('returns positive delta for forward swipe in LTR (rightward)', () => {
			expect(getDirectionalDelta(100, 250, 'ltr')).toBe(150);
		});

		it('returns negative delta for backward swipe in LTR (leftward)', () => {
			expect(getDirectionalDelta(250, 100, 'ltr')).toBe(-150);
		});

		it('returns positive delta for forward swipe in RTL (leftward)', () => {
			expect(getDirectionalDelta(250, 100, 'rtl')).toBe(150);
		});

		it('returns negative delta for backward swipe in RTL (rightward)', () => {
			expect(getDirectionalDelta(100, 250, 'rtl')).toBe(-150);
		});

		it('produces symmetric results: same physical swipe gives opposite logical deltas', () => {
			const startX = 200;
			const endX = 350;
			const ltrDelta = getDirectionalDelta(startX, endX, 'ltr');
			const rtlDelta = getDirectionalDelta(startX, endX, 'rtl');

			expect(ltrDelta).toBe(150);
			expect(rtlDelta).toBe(-150);
			expect(ltrDelta + rtlDelta).toBe(0);
		});
	});

	describe('getDirectionalTranslateX — RTL-inverted transforms', () => {
		it('returns positive translateX in LTR', () => {
			expect(getDirectionalTranslateX(100, 'ltr')).toBe('translateX(100px)');
		});

		it('returns negated translateX in RTL', () => {
			expect(getDirectionalTranslateX(100, 'rtl')).toBe('translateX(-100px)');
		});

		it('zero offset is unaffected by direction', () => {
			expect(getDirectionalTranslateX(0, 'ltr')).toBe('translateX(0px)');
			expect(getDirectionalTranslateX(0, 'rtl')).toBe('translateX(0px)');
		});

		it('negative offset becomes positive in RTL (double negation)', () => {
			expect(getDirectionalTranslateX(-50, 'rtl')).toBe('translateX(50px)');
		});

		it('swipe delta + transform produce coherent dismiss animation', () => {
			// Simulate: user swipes forward 200px → dismiss animation
			const delta = getDirectionalDelta(100, 300, 'ltr');
			const transform = getDirectionalTranslateX(delta, 'ltr');
			expect(transform).toBe('translateX(200px)');

			// Same physical gesture in RTL
			const rtlDelta = getDirectionalDelta(300, 100, 'rtl');
			const rtlTransform = getDirectionalTranslateX(rtlDelta, 'rtl');
			// Forward swipe (leftward in RTL) → positive delta → negated to visual left
			expect(rtlDelta).toBe(200);
			expect(rtlTransform).toBe('translateX(-200px)');
		});
	});

	describe('getLogicalSide — logical-to-physical side mapping', () => {
		it('maps start → left in LTR', () => {
			expect(getLogicalSide('start', 'ltr')).toBe('left');
		});

		it('maps start → right in RTL', () => {
			expect(getLogicalSide('start', 'rtl')).toBe('right');
		});

		it('maps end → right in LTR', () => {
			expect(getLogicalSide('end', 'ltr')).toBe('right');
		});

		it('maps end → left in RTL', () => {
			expect(getLogicalSide('end', 'rtl')).toBe('left');
		});

		it('start and end always produce opposite physical sides', () => {
			const ltrStart = getLogicalSide('start', 'ltr');
			const ltrEnd = getLogicalSide('end', 'ltr');
			expect(ltrStart).not.toBe(ltrEnd);

			const rtlStart = getLogicalSide('start', 'rtl');
			const rtlEnd = getLogicalSide('end', 'rtl');
			expect(rtlStart).not.toBe(rtlEnd);
		});
	});

	describe('ToggleSwitch — RTL-mirrored knob positioning', () => {
		it('uses insetInlineStart (not translateX) for auto RTL mirroring', () => {
			const { container } = render(
				React.createElement(ToggleSwitch, {
					checked: true,
					onChange: () => {},
					theme: mockTheme,
					size: 'md',
				})
			);

			const knob = container.querySelector('span') as HTMLElement;
			expect(knob.style.insetInlineStart).toBe('22px');
			// Must not use translateX — it doesn't auto-mirror
			expect(knob.style.transform).toBe('');
		});

		it('positions knob at offPos when unchecked', () => {
			const { container } = render(
				React.createElement(ToggleSwitch, {
					checked: false,
					onChange: () => {},
					theme: mockTheme,
					size: 'lg',
				})
			);

			const knob = container.querySelector('span') as HTMLElement;
			expect(knob.style.insetInlineStart).toBe('4px');
		});

		it('positions knob at onPos when checked', () => {
			const { container } = render(
				React.createElement(ToggleSwitch, {
					checked: true,
					onChange: () => {},
					theme: mockTheme,
					size: 'lg',
				})
			);

			const knob = container.querySelector('span') as HTMLElement;
			expect(knob.style.insetInlineStart).toBe('26px');
		});

		it('transitions inset-inline-start for smooth knob animation', () => {
			const { container } = render(
				React.createElement(ToggleSwitch, {
					checked: false,
					onChange: () => {},
					theme: mockTheme,
				})
			);

			const knob = container.querySelector('span') as HTMLElement;
			expect(knob.style.transition).toContain('inset-inline-start');
		});

		it('renders all three size presets with correct positioning', () => {
			const sizes = [
				{ size: 'sm' as const, off: '2px', on: '18px' },
				{ size: 'md' as const, off: '2px', on: '22px' },
				{ size: 'lg' as const, off: '4px', on: '26px' },
			];

			for (const { size, off, on } of sizes) {
				const { container: uncheckedContainer } = render(
					React.createElement(ToggleSwitch, {
						checked: false,
						onChange: () => {},
						theme: mockTheme,
						size,
					})
				);
				expect(
					(uncheckedContainer.querySelector('span') as HTMLElement).style.insetInlineStart
				).toBe(off);

				const { container: checkedContainer } = render(
					React.createElement(ToggleSwitch, {
						checked: true,
						onChange: () => {},
						theme: mockTheme,
						size,
					})
				);
				expect((checkedContainer.querySelector('span') as HTMLElement).style.insetInlineStart).toBe(
					on
				);
			}
		});
	});

	describe('Context menu positioning — RTL anchor adjustment', () => {
		function setupViewport(width: number, height: number) {
			Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
			Object.defineProperty(window, 'innerHeight', { value: height, configurable: true });
		}

		function mockMenuSize(width: number, height: number) {
			Element.prototype.getBoundingClientRect = function () {
				return {
					width,
					height,
					top: 0,
					left: 0,
					right: width,
					bottom: height,
					x: 0,
					y: 0,
					toJSON: () => ({}),
				};
			};
		}

		it('in LTR, menu anchors from left edge of click point', () => {
			document.documentElement.dir = 'ltr';
			setupViewport(1024, 768);
			mockMenuSize(200, 150);

			const el = document.createElement('div');
			document.body.appendChild(el);

			const { result } = renderHook(() => {
				const ref = useRef<HTMLDivElement>(el);
				return useContextMenuPosition(ref, 400, 300);
			});

			// LTR: left = clickX = 400
			expect(result.current.left).toBe(400);
			expect(result.current.top).toBe(300);
			expect(result.current.ready).toBe(true);

			document.body.removeChild(el);
		});

		it('in RTL, menu anchors from right edge of click point (left = x - menuWidth)', () => {
			document.documentElement.dir = 'rtl';
			setupViewport(1024, 768);
			mockMenuSize(200, 150);

			const el = document.createElement('div');
			document.body.appendChild(el);

			const { result } = renderHook(() => {
				const ref = useRef<HTMLDivElement>(el);
				return useContextMenuPosition(ref, 400, 300);
			});

			// RTL: left = x - width = 400 - 200 = 200
			expect(result.current.left).toBe(200);
			expect(result.current.top).toBe(300);
			expect(result.current.ready).toBe(true);

			document.body.removeChild(el);
		});

		it('in RTL, clamps to padding when menu would overflow left edge', () => {
			document.documentElement.dir = 'rtl';
			setupViewport(800, 600);
			mockMenuSize(200, 120);

			const el = document.createElement('div');
			document.body.appendChild(el);

			const { result } = renderHook(() => {
				const ref = useRef<HTMLDivElement>(el);
				// Click at x=80: anchor = 80 - 200 = -120, clamped to padding(8)
				return useContextMenuPosition(ref, 80, 200);
			});

			expect(result.current.left).toBe(8);
			expect(result.current.ready).toBe(true);

			document.body.removeChild(el);
		});

		it('in RTL, clamps to right edge when click is near viewport right', () => {
			document.documentElement.dir = 'rtl';
			setupViewport(800, 600);
			mockMenuSize(200, 120);

			const el = document.createElement('div');
			document.body.appendChild(el);

			const { result } = renderHook(() => {
				const ref = useRef<HTMLDivElement>(el);
				// Click at x=790: anchor = 790 - 200 = 590, maxLeft = 800 - 200 - 8 = 592
				return useContextMenuPosition(ref, 790, 200);
			});

			// 590 < 592, so left = 590
			expect(result.current.left).toBe(590);
			expect(result.current.ready).toBe(true);

			document.body.removeChild(el);
		});

		it('same click point produces different left values in LTR vs RTL', () => {
			setupViewport(1024, 768);
			mockMenuSize(180, 120);

			const el = document.createElement('div');
			document.body.appendChild(el);

			// LTR
			document.documentElement.dir = 'ltr';
			const { result: ltrResult } = renderHook(() => {
				const ref = useRef<HTMLDivElement>(el);
				return useContextMenuPosition(ref, 500, 300);
			});

			// RTL
			document.documentElement.dir = 'rtl';
			const { result: rtlResult } = renderHook(() => {
				const ref = useRef<HTMLDivElement>(el);
				return useContextMenuPosition(ref, 500, 300);
			});

			// LTR: left = 500, RTL: left = 500 - 180 = 320
			expect(ltrResult.current.left).toBe(500);
			expect(rtlResult.current.left).toBe(320);
			// Top is unaffected by direction
			expect(ltrResult.current.top).toBe(rtlResult.current.top);

			document.body.removeChild(el);
		});
	});
});
