/**
 * @fileoverview Tests for RTL layout CSS overrides in index.css.
 *
 * Verifies that the RTL override section exists with the expected rules:
 *   - --rtl-sign custom property (1 for LTR, -1 for RTL)
 *   - Shimmer animation direction reversal
 *   - Progress bar stripe angle mirror
 *   - Comment block with contributor guidelines
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const CSS_PATH = resolve(__dirname, '../../../renderer/index.css');
let css: string;

beforeAll(() => {
	css = readFileSync(CSS_PATH, 'utf-8');
});

describe('RTL Layout Overrides section', () => {
	it('contains the RTL Layout Overrides comment header', () => {
		expect(css).toContain('RTL Layout Overrides');
		expect(css).toContain('GUIDELINES FOR CONTRIBUTORS');
	});

	it('documents scrollbar behaviour (no override needed)', () => {
		expect(css).toContain('SCROLLBARS');
		// The comment explains browsers handle scrollbar position automatically
		expect(css).toContain('automatically repositions scrollbars');
	});

	it('documents box-shadow pattern for future directional shadows', () => {
		expect(css).toContain('BOX SHADOWS');
		expect(css).toContain('non-directional');
	});

	it('documents translateX inversion pattern', () => {
		expect(css).toContain('TRANSLATEX');
		expect(css).toContain('--rtl-sign');
	});
});

describe('--rtl-sign custom property', () => {
	it('sets --rtl-sign: 1 for LTR', () => {
		// Match the [dir='ltr'] block containing --rtl-sign: 1
		expect(css).toMatch(/\[dir=['"]ltr['"]\]\s*\{[^}]*--rtl-sign:\s*1/);
	});

	it('sets --rtl-sign: -1 for RTL', () => {
		// Match the [dir='rtl'] block containing --rtl-sign: -1
		expect(css).toMatch(/\[dir=['"]rtl['"]\]\s*\{[^}]*--rtl-sign:\s*-1/);
	});
});

describe('shimmer animation RTL override', () => {
	it('reverses shimmer animation direction in RTL', () => {
		expect(css).toContain('animation-direction: reverse');
	});
});

describe('progress-bar-animated RTL override', () => {
	it('mirrors the stripe angle to -45deg in RTL', () => {
		// The RTL override should use -45deg instead of 45deg
		expect(css).toMatch(/\[dir=['"]rtl['"]\]\s+\.progress-bar-animated/);
		// Extract the RTL progress bar section and verify -45deg
		const rtlProgressMatch = css.match(
			/\[dir=['"]rtl['"]\]\s+\.progress-bar-animated\s*\{([^}]+)\}/
		);
		expect(rtlProgressMatch).not.toBeNull();
		expect(rtlProgressMatch![1]).toContain('-45deg');
	});
});

describe('RTL icon flipping rule', () => {
	it('still has the rtl-flip transform rule', () => {
		expect(css).toMatch(/\[dir=['"]rtl['"]\]\s+\.rtl-flip\s*\{[^}]*scaleX\(-1\)/);
	});
});
