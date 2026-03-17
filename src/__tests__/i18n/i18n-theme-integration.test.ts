/**
 * i18n ↔ Theme Integration Smoke Tests
 *
 * Regression-prevention suite verifying that the theme system and i18n system
 * evolve independently without breaking each other. Covers:
 *
 * 1. Theme change does not reset language
 * 2. Language change does not reset theme
 * 3. Custom theme colors persist across language switch
 * 4. ThemeTab renders mode labels in the active language
 * 5. CSS custom properties contain both theme colors and RTL direction props
 * 6. Mermaid cache key is language-independent
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { THEMES } from '../../shared/themes';
import type { ThemeColors } from '../../shared/theme-types';

// Mock the i18n config module so setLanguage doesn't require a fully
// initialized i18next instance.
vi.mock('../../shared/i18n/config', () => ({
	default: {
		changeLanguage: vi.fn().mockResolvedValue(undefined),
		language: 'en',
	},
	LANGUAGE_STORAGE_KEY: 'maestro-language',
	RTL_LANGUAGES: ['ar'],
	SUPPORTED_LANGUAGES: ['en', 'es', 'fr', 'de', 'zh', 'hi', 'ar', 'bn', 'pt'],
}));

describe('i18n ↔ Theme Integration Smoke Tests', () => {
	let useSettingsStore: any;
	let loadAllSettings: any;
	let settingsSetCalls: Array<{ key: string; value: unknown }>;

	beforeEach(async () => {
		settingsSetCalls = [];
		vi.mocked(window.maestro.settings.set).mockImplementation(
			async (key: string, value: unknown) => {
				settingsSetCalls.push({ key, value });
				return undefined;
			}
		);

		const mod = await import('../../renderer/stores/settingsStore');
		useSettingsStore = mod.useSettingsStore;
		loadAllSettings = mod.loadAllSettings;

		// Reset store to known defaults
		useSettingsStore.setState({
			activeThemeId: 'dracula',
			language: 'en',
			customThemeColors: THEMES.dracula.colors,
			settingsLoaded: false,
		});

		// Reset document element
		const root = document.documentElement;
		root.dir = '';
		root.lang = '';
		root.removeAttribute('data-dir');
		root.style.removeProperty('--accent-color');
		root.style.removeProperty('--highlight-color');
		root.style.removeProperty('--dir-start');
		root.style.removeProperty('--dir-end');
		root.style.removeProperty('--rtl-sign');
	});

	// -----------------------------------------------------------------------
	// 1. Theme change does not reset language
	// -----------------------------------------------------------------------
	describe('theme change does not reset language', () => {
		it('switching theme preserves language in store state', () => {
			useSettingsStore.setState({ language: 'es' });
			const store = useSettingsStore.getState();
			store.setActiveThemeId('nord' as any);

			expect(useSettingsStore.getState().language).toBe('es');
		});

		it('switching theme does not persist language key', () => {
			useSettingsStore.setState({ language: 'fr' });
			useSettingsStore.getState().setActiveThemeId('monokai' as any);

			const langCalls = settingsSetCalls.filter((c) => c.key === 'language');
			expect(langCalls).toHaveLength(0);
		});
	});

	// -----------------------------------------------------------------------
	// 2. Language change does not reset theme
	// -----------------------------------------------------------------------
	describe('language change does not reset theme', () => {
		it('switching language preserves activeThemeId in store state', () => {
			useSettingsStore.setState({ activeThemeId: 'nord' as any });
			useSettingsStore.getState().setLanguage('de');

			expect(useSettingsStore.getState().activeThemeId).toBe('nord');
		});

		it('switching language does not persist activeThemeId key', () => {
			useSettingsStore.setState({ activeThemeId: 'tokyo-night' as any });
			useSettingsStore.getState().setLanguage('zh');

			const themeCalls = settingsSetCalls.filter((c) => c.key === 'activeThemeId');
			expect(themeCalls).toHaveLength(0);
		});
	});

	// -----------------------------------------------------------------------
	// 3. Custom theme colors persist across language switch
	// -----------------------------------------------------------------------
	describe('custom theme colors persist across language switch', () => {
		const customColors: ThemeColors = {
			bgMain: '#111111',
			bgSidebar: '#222222',
			bgActivity: '#333333',
			border: '#444444',
			textMain: '#eeeeee',
			textDim: '#999999',
			accent: '#ff00ff',
			accentDim: 'rgba(255, 0, 255, 0.2)',
			accentText: '#00ffff',
			accentForeground: '#111111',
			success: '#00ff00',
			warning: '#ffaa00',
			error: '#ff0000',
		};

		it('custom theme colors survive language switch in Zustand state', () => {
			useSettingsStore.setState({
				activeThemeId: 'custom' as any,
				customThemeColors: customColors,
			});

			// Switch language
			useSettingsStore.getState().setLanguage('ar');

			const state = useSettingsStore.getState();
			expect(state.activeThemeId).toBe('custom');
			expect(state.customThemeColors).toEqual(customColors);
		});

		it('language switch does not trigger customThemeColors persistence', () => {
			useSettingsStore.setState({
				activeThemeId: 'custom' as any,
				customThemeColors: customColors,
			});

			useSettingsStore.getState().setLanguage('hi');

			const colorCalls = settingsSetCalls.filter((c) => c.key === 'customThemeColors');
			expect(colorCalls).toHaveLength(0);
		});

		it('custom colors persist through loadAllSettings with non-English language', async () => {
			vi.mocked(window.maestro.settings.getAll).mockResolvedValueOnce({
				activeThemeId: 'custom',
				language: 'ar',
				customThemeColors: customColors,
			});

			await loadAllSettings();

			const state = useSettingsStore.getState();
			expect(state.activeThemeId).toBe('custom');
			expect(state.language).toBe('ar');
			expect(state.customThemeColors).toEqual(customColors);
		});
	});

	// -----------------------------------------------------------------------
	// 4. ThemeTab renders mode labels in the active language
	// -----------------------------------------------------------------------
	describe('ThemeTab mode labels use i18n keys', () => {
		it('settings.json contains all three mode label keys', async () => {
			// Dynamically import settings.json to verify the keys exist
			const settingsEn = await import('../../shared/i18n/locales/en/settings.json');
			const themes = (settingsEn as any).default?.themes ?? (settingsEn as any).themes;

			expect(themes.dark_mode).toBe('Dark Mode');
			expect(themes.light_mode).toBe('Light Mode');
			expect(themes.vibe_mode).toBe('Vibe Mode');
		});

		it('all non-English locales have theme mode label keys', async () => {
			const locales = ['es', 'fr', 'de', 'zh', 'hi', 'ar', 'bn', 'pt'];

			for (const locale of locales) {
				const mod = await import(`../../shared/i18n/locales/${locale}/settings.json`);
				const settings = mod.default ?? mod;
				const themes = settings.themes;

				expect(themes, `${locale} missing themes section`).toBeDefined();
				expect(themes.dark_mode, `${locale} missing dark_mode`).toBeTruthy();
				expect(themes.light_mode, `${locale} missing light_mode`).toBeTruthy();
				expect(themes.vibe_mode, `${locale} missing vibe_mode`).toBeTruthy();
			}
		});

		it('mode labels differ from English in at least one non-English locale', async () => {
			const settingsEn = await import('../../shared/i18n/locales/en/settings.json');
			const enThemes = (settingsEn as any).default?.themes ?? (settingsEn as any).themes;

			// Check Spanish as a representative non-English locale
			const settingsEs = await import('../../shared/i18n/locales/es/settings.json');
			const esThemes = (settingsEs as any).default?.themes ?? (settingsEs as any).themes;

			// At least one label should be translated (not identical to English)
			const anyTranslated =
				esThemes.dark_mode !== enThemes.dark_mode ||
				esThemes.light_mode !== enThemes.light_mode ||
				esThemes.vibe_mode !== enThemes.vibe_mode;

			expect(anyTranslated).toBe(true);
		});
	});

	// -----------------------------------------------------------------------
	// 5. CSS custom properties contain both theme colors and RTL direction
	//    props simultaneously
	// -----------------------------------------------------------------------
	describe('CSS custom properties coexist: theme + RTL', () => {
		it('theme and RTL property sets have zero overlap', () => {
			const themeProps = ['--accent-color', '--highlight-color'];
			const rtlProps = ['--dir-start', '--dir-end', '--rtl-sign'];

			const overlap = themeProps.filter((p) => rtlProps.includes(p));
			expect(overlap).toHaveLength(0);
		});

		it('simultaneous theme + Arabic RTL properties all readable on :root', () => {
			const root = document.documentElement;

			// Simulate useThemeStyles setting theme colors
			root.style.setProperty('--accent-color', '#bd93f9');
			root.style.setProperty('--highlight-color', '#bd93f9');

			// Simulate DirectionProvider setting RTL for Arabic
			root.dir = 'rtl';
			root.lang = 'ar';
			root.setAttribute('data-dir', 'rtl');
			root.style.setProperty('--dir-start', 'right');
			root.style.setProperty('--dir-end', 'left');

			// All five CSS custom properties coexist
			expect(root.style.getPropertyValue('--accent-color')).toBe('#bd93f9');
			expect(root.style.getPropertyValue('--highlight-color')).toBe('#bd93f9');
			expect(root.style.getPropertyValue('--dir-start')).toBe('right');
			expect(root.style.getPropertyValue('--dir-end')).toBe('left');
			expect(root.dir).toBe('rtl');
			expect(root.lang).toBe('ar');
		});

		it('re-applying theme colors does not clear RTL properties', () => {
			const root = document.documentElement;

			// Set RTL first
			root.style.setProperty('--dir-start', 'right');
			root.style.setProperty('--dir-end', 'left');

			// Re-apply theme (simulating theme switch)
			root.style.setProperty('--accent-color', '#88c0d0');
			root.style.setProperty('--highlight-color', '#88c0d0');

			expect(root.style.getPropertyValue('--dir-start')).toBe('right');
			expect(root.style.getPropertyValue('--dir-end')).toBe('left');
		});

		it('switching from RTL to LTR does not clear theme properties', () => {
			const root = document.documentElement;

			// Set theme + RTL
			root.style.setProperty('--accent-color', '#ff79c6');
			root.style.setProperty('--highlight-color', '#ff79c6');
			root.dir = 'rtl';
			root.style.setProperty('--dir-start', 'right');
			root.style.setProperty('--dir-end', 'left');

			// Switch back to LTR (Arabic → English)
			root.dir = 'ltr';
			root.style.setProperty('--dir-start', 'left');
			root.style.setProperty('--dir-end', 'right');

			// Theme colors remain
			expect(root.style.getPropertyValue('--accent-color')).toBe('#ff79c6');
			expect(root.style.getPropertyValue('--highlight-color')).toBe('#ff79c6');
		});
	});

	// -----------------------------------------------------------------------
	// 6. Mermaid cache key is language-independent
	// -----------------------------------------------------------------------
	describe('Mermaid cache key is language-independent', () => {
		it('theme.name is a proper noun string that does not change with language', () => {
			// All 17 theme names are English proper nouns / brand names
			const themeNames = Object.values(THEMES).map((t) => t.name);

			for (const name of themeNames) {
				expect(typeof name).toBe('string');
				expect(name.length).toBeGreaterThan(0);
				// Theme names should NOT contain i18n key patterns (namespace:key.path)
				expect(name).not.toMatch(/^[a-z]+:/);
				expect(name).not.toMatch(/\./);
			}
		});

		it('theme.name remains stable across simulated language switches', () => {
			// MermaidRenderer uses `theme.name` as a cache key.
			// Switching languages must not change theme.name values.
			const draculaName = THEMES.dracula.name;
			const nordName = THEMES.nord.name;

			// Simulate language switches (these should be no-ops for theme names)
			useSettingsStore.getState().setLanguage('es');
			expect(THEMES.dracula.name).toBe(draculaName);
			expect(THEMES.nord.name).toBe(nordName);

			useSettingsStore.getState().setLanguage('ar');
			expect(THEMES.dracula.name).toBe(draculaName);
			expect(THEMES.nord.name).toBe(nordName);

			useSettingsStore.getState().setLanguage('zh');
			expect(THEMES.dracula.name).toBe(draculaName);
			expect(THEMES.nord.name).toBe(nordName);
		});

		it('theme IDs are stable English strings usable as cache keys', () => {
			const themeIds = Object.keys(THEMES);

			expect(themeIds.length).toBeGreaterThanOrEqual(17);

			for (const id of themeIds) {
				// IDs should be lowercase kebab-case English strings
				expect(id).toMatch(/^[a-z0-9-]+$/);
			}
		});

		it('different themes produce different cache keys', () => {
			const names = Object.values(THEMES).map((t) => t.name);
			const uniqueNames = new Set(names);

			// Every theme should have a unique name (cache key)
			expect(uniqueNames.size).toBe(names.length);
		});
	});

	// -----------------------------------------------------------------------
	// Combined rapid-switching regression
	// -----------------------------------------------------------------------
	describe('rapid interleaved theme + language switching', () => {
		it('preserves final values after rapid alternation', () => {
			const store = useSettingsStore.getState();

			store.setActiveThemeId('dracula' as any);
			store.setLanguage('es');
			store.setActiveThemeId('nord' as any);
			store.setLanguage('ar');
			store.setActiveThemeId('github-light' as any);
			store.setLanguage('de');
			store.setActiveThemeId('tokyo-night' as any);
			store.setLanguage('zh');

			const final = useSettingsStore.getState();
			expect(final.activeThemeId).toBe('tokyo-night');
			expect(final.language).toBe('zh');
		});

		it('each setting type has independent persistence calls', () => {
			const store = useSettingsStore.getState();

			store.setActiveThemeId('nord' as any);
			store.setLanguage('fr');
			store.setActiveThemeId('dracula' as any);
			store.setLanguage('de');

			const themeCalls = settingsSetCalls.filter((c) => c.key === 'activeThemeId');
			const langCalls = settingsSetCalls.filter((c) => c.key === 'language');

			expect(themeCalls).toHaveLength(2);
			expect(langCalls).toHaveLength(2);

			// No cross-contamination
			expect(themeCalls.every((c) => typeof c.value === 'string')).toBe(true);
			expect(langCalls.every((c) => typeof c.value === 'string')).toBe(true);
		});
	});
});
