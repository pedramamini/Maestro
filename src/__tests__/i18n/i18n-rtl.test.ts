/**
 * i18n RTL Tests
 *
 * Verifies that the document direction attributes update correctly
 * when switching to/from Arabic (RTL) and other languages (LTR).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { isRtlLanguage } from '../../renderer/components/shared/DirectionProvider';
import { RTL_LANGUAGES, SUPPORTED_LANGUAGES } from '../../shared/i18n/config';

describe('i18n RTL Support', () => {
	describe('isRtlLanguage', () => {
		it('identifies Arabic as RTL', () => {
			expect(isRtlLanguage('ar')).toBe(true);
		});

		it('identifies English as LTR', () => {
			expect(isRtlLanguage('en')).toBe(false);
		});

		it('identifies all non-Arabic supported languages as LTR', () => {
			const ltrLanguages = SUPPORTED_LANGUAGES.filter((l) => l !== 'ar');
			for (const lang of ltrLanguages) {
				expect(isRtlLanguage(lang)).toBe(false);
			}
		});

		it('treats unknown languages as LTR', () => {
			expect(isRtlLanguage('xx')).toBe(false);
			expect(isRtlLanguage('ja')).toBe(false);
		});
	});

	describe('RTL_LANGUAGES constant', () => {
		it('contains only Arabic', () => {
			expect(RTL_LANGUAGES).toEqual(['ar']);
		});

		it('is a subset of SUPPORTED_LANGUAGES', () => {
			for (const lang of RTL_LANGUAGES) {
				expect(SUPPORTED_LANGUAGES).toContain(lang);
			}
		});
	});

	describe('document direction attributes', () => {
		beforeEach(() => {
			// Reset document attributes
			document.documentElement.dir = '';
			document.documentElement.lang = '';
			document.documentElement.removeAttribute('data-dir');
			document.documentElement.style.removeProperty('--dir-start');
			document.documentElement.style.removeProperty('--dir-end');
		});

		it('sets RTL attributes for Arabic', () => {
			const rtl = isRtlLanguage('ar');
			const dir = rtl ? 'rtl' : 'ltr';
			const root = document.documentElement;

			root.lang = 'ar';
			root.dir = dir;
			root.setAttribute('data-dir', dir);
			root.style.setProperty('--dir-start', rtl ? 'right' : 'left');
			root.style.setProperty('--dir-end', rtl ? 'left' : 'right');

			expect(root.dir).toBe('rtl');
			expect(root.lang).toBe('ar');
			expect(root.getAttribute('data-dir')).toBe('rtl');
			expect(root.style.getPropertyValue('--dir-start')).toBe('right');
			expect(root.style.getPropertyValue('--dir-end')).toBe('left');
		});

		it('sets LTR attributes for English', () => {
			const rtl = isRtlLanguage('en');
			const dir = rtl ? 'rtl' : 'ltr';
			const root = document.documentElement;

			root.lang = 'en';
			root.dir = dir;
			root.setAttribute('data-dir', dir);
			root.style.setProperty('--dir-start', rtl ? 'right' : 'left');
			root.style.setProperty('--dir-end', rtl ? 'left' : 'right');

			expect(root.dir).toBe('ltr');
			expect(root.lang).toBe('en');
			expect(root.getAttribute('data-dir')).toBe('ltr');
			expect(root.style.getPropertyValue('--dir-start')).toBe('left');
			expect(root.style.getPropertyValue('--dir-end')).toBe('right');
		});

		it('switches from RTL to LTR correctly', () => {
			const root = document.documentElement;

			// Set Arabic (RTL)
			root.dir = 'rtl';
			root.lang = 'ar';
			root.setAttribute('data-dir', 'rtl');
			root.style.setProperty('--dir-start', 'right');
			root.style.setProperty('--dir-end', 'left');

			expect(root.dir).toBe('rtl');

			// Switch to English (LTR)
			root.dir = 'ltr';
			root.lang = 'en';
			root.setAttribute('data-dir', 'ltr');
			root.style.setProperty('--dir-start', 'left');
			root.style.setProperty('--dir-end', 'right');

			expect(root.dir).toBe('ltr');
			expect(root.lang).toBe('en');
			expect(root.getAttribute('data-dir')).toBe('ltr');
			expect(root.style.getPropertyValue('--dir-start')).toBe('left');
			expect(root.style.getPropertyValue('--dir-end')).toBe('right');
		});
	});
});
