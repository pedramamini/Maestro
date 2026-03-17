/**
 * i18n ↔ Web ThemeProvider Integration Tests
 *
 * Verifies that the web client's ThemeProvider and i18n language/direction
 * systems are independent and do not interfere with each other.
 *
 * Covers:
 * 1. Web CSS custom properties (--maestro-*) don't assume LTR layout
 * 2. Theme properties and RTL direction properties coexist on :root
 * 3. applyLanguageDirection sets correct attributes without touching theme
 * 4. injectCSSProperties doesn't clear direction properties
 * 5. Language broadcast message type is handled correctly
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
	generateCSSProperties,
	generateCSSString,
	injectCSSProperties,
	removeCSSProperties,
	THEME_CSS_PROPERTIES,
} from '../../web/utils/cssCustomProperties';
import { RTL_LANGUAGES, SUPPORTED_LANGUAGES } from '../../shared/i18n/config';
import type { Theme } from '../../shared/theme-types';

/** Test theme matching the Dracula defaults used by ThemeProvider */
const testDarkTheme: Theme = {
	id: 'dracula',
	name: 'Dracula',
	mode: 'dark',
	colors: {
		bgMain: '#0b0b0d',
		bgSidebar: '#111113',
		bgActivity: '#1c1c1f',
		border: '#27272a',
		textMain: '#e4e4e7',
		textDim: '#a1a1aa',
		accent: '#6366f1',
		accentDim: 'rgba(99, 102, 241, 0.2)',
		accentText: '#a5b4fc',
		accentForeground: '#0b0b0d',
		success: '#22c55e',
		warning: '#eab308',
		error: '#ef4444',
	},
};

const testLightTheme: Theme = {
	id: 'github-light',
	name: 'GitHub',
	mode: 'light',
	colors: {
		bgMain: '#ffffff',
		bgSidebar: '#f6f8fa',
		bgActivity: '#eff2f5',
		border: '#d0d7de',
		textMain: '#24292f',
		textDim: '#57606a',
		accent: '#0969da',
		accentDim: 'rgba(9, 105, 218, 0.1)',
		accentText: '#0969da',
		accentForeground: '#ffffff',
		success: '#1a7f37',
		warning: '#9a6700',
		error: '#cf222e',
	},
};

/**
 * Simulates the applyLanguageDirection function from web/App.tsx.
 * Duplicated here to test the logic independently of React.
 */
function applyLanguageDirection(language: string): void {
	const isRtl = (RTL_LANGUAGES as readonly string[]).includes(language);
	const dir = isRtl ? 'rtl' : 'ltr';

	document.documentElement.dir = dir;
	document.documentElement.lang = language;
	document.documentElement.setAttribute('data-dir', dir);
	document.documentElement.style.setProperty('--dir-start', isRtl ? 'right' : 'left');
	document.documentElement.style.setProperty('--dir-end', isRtl ? 'left' : 'right');
}

describe('Web ThemeProvider i18n Compatibility', () => {
	beforeEach(() => {
		// Reset document attributes
		const root = document.documentElement;
		root.dir = '';
		root.lang = '';
		root.removeAttribute('data-dir');
		root.style.removeProperty('--dir-start');
		root.style.removeProperty('--dir-end');
		// Clean up injected style elements
		removeCSSProperties();
	});

	describe('CSS custom properties are layout-agnostic', () => {
		it('generated property names use --maestro- prefix, not directional names', () => {
			const props = generateCSSProperties(testDarkTheme);
			const propNames = Object.keys(props);

			for (const name of propNames) {
				expect(name).toMatch(/^--maestro-/);
				// No directional suffixes like -left, -right, -start, -end
				expect(name).not.toMatch(/-(left|right|start|end)$/);
			}
		});

		it('generated property values are colors and mode, not directional', () => {
			const props = generateCSSProperties(testDarkTheme);
			const values = Object.values(props);

			for (const value of values) {
				// Values should be hex colors, rgba(), or mode strings
				expect(value).not.toMatch(/^(left|right|ltr|rtl)$/);
			}
		});

		it('THEME_CSS_PROPERTIES list has no overlap with RTL properties', () => {
			const rtlProps = ['--dir-start', '--dir-end', '--rtl-sign'];
			const overlap = THEME_CSS_PROPERTIES.filter((p) => rtlProps.includes(p));
			expect(overlap).toHaveLength(0);
		});

		it('generateCSSString targets :root by default, not [dir]', () => {
			const css = generateCSSString(testDarkTheme);
			expect(css).toMatch(/^:root \{/);
			expect(css).not.toMatch(/\[dir/);
		});
	});

	describe('applyLanguageDirection sets correct attributes', () => {
		it('sets LTR attributes for English', () => {
			applyLanguageDirection('en');
			const root = document.documentElement;
			expect(root.dir).toBe('ltr');
			expect(root.lang).toBe('en');
			expect(root.getAttribute('data-dir')).toBe('ltr');
			expect(root.style.getPropertyValue('--dir-start')).toBe('left');
			expect(root.style.getPropertyValue('--dir-end')).toBe('right');
		});

		it('sets RTL attributes for Arabic', () => {
			applyLanguageDirection('ar');
			const root = document.documentElement;
			expect(root.dir).toBe('rtl');
			expect(root.lang).toBe('ar');
			expect(root.getAttribute('data-dir')).toBe('rtl');
			expect(root.style.getPropertyValue('--dir-start')).toBe('right');
			expect(root.style.getPropertyValue('--dir-end')).toBe('left');
		});

		it('sets LTR for all non-Arabic supported languages', () => {
			const ltrLanguages = SUPPORTED_LANGUAGES.filter((l) => l !== 'ar');
			for (const lang of ltrLanguages) {
				applyLanguageDirection(lang);
				expect(document.documentElement.dir).toBe('ltr');
			}
		});
	});

	describe('theme and direction properties coexist', () => {
		it('injectCSSProperties does not clear direction properties', () => {
			const root = document.documentElement;

			// Set direction properties first (simulating Arabic language switch)
			applyLanguageDirection('ar');

			// Now inject theme CSS properties
			injectCSSProperties(testDarkTheme);

			// Direction properties must still be present
			expect(root.dir).toBe('rtl');
			expect(root.lang).toBe('ar');
			expect(root.getAttribute('data-dir')).toBe('rtl');
			expect(root.style.getPropertyValue('--dir-start')).toBe('right');
			expect(root.style.getPropertyValue('--dir-end')).toBe('left');
		});

		it('applyLanguageDirection does not clear theme style element', () => {
			// Inject theme first
			injectCSSProperties(testDarkTheme);

			// Verify theme style element exists
			const styleEl = document.getElementById('maestro-theme-css-properties');
			expect(styleEl).not.toBeNull();

			// Apply language direction
			applyLanguageDirection('ar');

			// Theme style element must still exist with content
			const styleElAfter = document.getElementById('maestro-theme-css-properties');
			expect(styleElAfter).not.toBeNull();
			expect(styleElAfter!.textContent).toContain('--maestro-bg-main');
			expect(styleElAfter!.textContent).toContain('--maestro-accent');
		});

		it('theme switch does not alter direction attributes', () => {
			const root = document.documentElement;

			// Set Arabic direction
			applyLanguageDirection('ar');

			// Switch theme from dark to light
			injectCSSProperties(testDarkTheme);
			injectCSSProperties(testLightTheme);

			// Direction attributes untouched
			expect(root.dir).toBe('rtl');
			expect(root.lang).toBe('ar');
			expect(root.style.getPropertyValue('--dir-start')).toBe('right');
		});

		it('language switch does not alter theme CSS variables', () => {
			// Inject dark theme
			injectCSSProperties(testDarkTheme);

			// Switch language from English to Arabic
			applyLanguageDirection('en');
			applyLanguageDirection('ar');

			// Theme style element still has dark theme values
			const styleEl = document.getElementById('maestro-theme-css-properties');
			expect(styleEl!.textContent).toContain(testDarkTheme.colors.bgMain);
			expect(styleEl!.textContent).toContain(testDarkTheme.colors.accent);
		});
	});

	describe('web ThemeProvider uses style element injection (not inline styles)', () => {
		it('injectCSSProperties creates a <style> element, not inline styles', () => {
			injectCSSProperties(testDarkTheme);

			// Should create a style element in head
			const styleEl = document.getElementById('maestro-theme-css-properties');
			expect(styleEl).not.toBeNull();
			expect(styleEl!.tagName).toBe('STYLE');

			// Should NOT set theme properties as inline styles on root
			const root = document.documentElement;
			expect(root.style.getPropertyValue('--maestro-bg-main')).toBe('');
			expect(root.style.getPropertyValue('--maestro-accent')).toBe('');
		});

		it('removeCSSProperties cleans up without touching direction styles', () => {
			// Set both theme and direction
			injectCSSProperties(testDarkTheme);
			applyLanguageDirection('ar');

			// Remove theme
			removeCSSProperties();

			// Direction attributes should remain
			const root = document.documentElement;
			expect(root.dir).toBe('rtl');
			expect(root.style.getPropertyValue('--dir-start')).toBe('right');
			expect(root.style.getPropertyValue('--dir-end')).toBe('left');
		});
	});

	describe('rapid theme + language switching', () => {
		it('alternating theme and language preserves both final states', () => {
			const root = document.documentElement;

			// Rapid interleaved switching
			injectCSSProperties(testDarkTheme);
			applyLanguageDirection('en');
			injectCSSProperties(testLightTheme);
			applyLanguageDirection('ar');
			injectCSSProperties(testDarkTheme);
			applyLanguageDirection('fr');

			// Final state: dark theme + French LTR
			const styleEl = document.getElementById('maestro-theme-css-properties');
			expect(styleEl!.textContent).toContain(testDarkTheme.colors.bgMain);
			expect(root.dir).toBe('ltr');
			expect(root.lang).toBe('fr');
			expect(root.style.getPropertyValue('--dir-start')).toBe('left');
		});
	});
});
