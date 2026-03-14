/**
 * i18n ↔ Theme Interaction Tests
 *
 * Verifies that theme switching and language switching do not conflict.
 * Both settings use independent per-key persistence via window.maestro.settings.set(),
 * so changing one must never clobber the other.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the i18n config module so setLanguage's i18n.changeLanguage() doesn't
// require a fully initialized i18next instance with resource stores.
vi.mock('../../shared/i18n/config', () => ({
	default: {
		changeLanguage: vi.fn().mockResolvedValue(undefined),
		language: 'en',
	},
	LANGUAGE_STORAGE_KEY: 'maestro-language',
	RTL_LANGUAGES: ['ar'],
	SUPPORTED_LANGUAGES: ['en', 'es', 'fr', 'de', 'zh', 'hi', 'ar', 'bn', 'pt'],
}));

describe('i18n ↔ Theme Interaction', () => {
	let settingsSetCalls: Array<{ key: string; value: unknown }>;
	let useSettingsStore: any;
	let loadAllSettings: any;

	beforeEach(async () => {
		settingsSetCalls = [];
		// Track all settings.set calls to verify per-key persistence
		vi.mocked(window.maestro.settings.set).mockImplementation(
			async (key: string, value: unknown) => {
				settingsSetCalls.push({ key, value });
				return undefined;
			}
		);

		// Import the store (cached module, same instance across tests)
		const mod = await import('../../renderer/stores/settingsStore');
		useSettingsStore = mod.useSettingsStore;
		loadAllSettings = mod.loadAllSettings;

		// Reset store to defaults before each test
		useSettingsStore.setState({
			activeThemeId: 'dracula',
			language: 'en',
			settingsLoaded: false,
		});
	});

	describe('per-key persistence isolation', () => {
		it('setActiveThemeId persists only the activeThemeId key', () => {
			const store = useSettingsStore.getState();
			store.setActiveThemeId('nord' as any);

			const themeSetCalls = settingsSetCalls.filter((c: any) => c.key === 'activeThemeId');
			expect(themeSetCalls).toHaveLength(1);
			expect(themeSetCalls[0].value).toBe('nord');

			// language was NOT touched
			const langSetCalls = settingsSetCalls.filter((c: any) => c.key === 'language');
			expect(langSetCalls).toHaveLength(0);
		});

		it('setLanguage persists only the language key', () => {
			const store = useSettingsStore.getState();
			store.setLanguage('es');

			const langSetCalls = settingsSetCalls.filter((c: any) => c.key === 'language');
			expect(langSetCalls).toHaveLength(1);
			expect(langSetCalls[0].value).toBe('es');

			// activeThemeId was NOT touched
			const themeSetCalls = settingsSetCalls.filter((c: any) => c.key === 'activeThemeId');
			expect(themeSetCalls).toHaveLength(0);
		});
	});

	describe('theme change does not reset language', () => {
		it('switching theme preserves language in Zustand state', () => {
			useSettingsStore.setState({ language: 'es' });

			const store = useSettingsStore.getState();
			store.setActiveThemeId('nord' as any);

			expect(useSettingsStore.getState().language).toBe('es');
		});
	});

	describe('language change does not reset theme', () => {
		it('switching language preserves activeThemeId in Zustand state', () => {
			useSettingsStore.setState({ activeThemeId: 'nord' as any });

			const store = useSettingsStore.getState();
			store.setLanguage('fr');

			expect(useSettingsStore.getState().activeThemeId).toBe('nord');
		});
	});

	describe('rapid switching does not cause race conditions', () => {
		it('alternating theme and language changes preserves both final values', () => {
			const store = useSettingsStore.getState();

			// Rapid interleaved switching
			store.setActiveThemeId('dracula' as any);
			store.setLanguage('es');
			store.setActiveThemeId('nord' as any);
			store.setLanguage('fr');
			store.setActiveThemeId('tokyo-night' as any);
			store.setLanguage('de');

			const finalState = useSettingsStore.getState();
			expect(finalState.activeThemeId).toBe('tokyo-night');
			expect(finalState.language).toBe('de');

			// Each setting should have been persisted independently
			const themeSetCalls = settingsSetCalls.filter((c: any) => c.key === 'activeThemeId');
			const langSetCalls = settingsSetCalls.filter((c: any) => c.key === 'language');
			expect(themeSetCalls).toHaveLength(3);
			expect(langSetCalls).toHaveLength(3);
		});
	});

	describe('loadAllSettings restores both settings independently', () => {
		it('loads Spanish + Nord theme from persisted store without conflict', async () => {
			vi.mocked(window.maestro.settings.getAll).mockResolvedValueOnce({
				activeThemeId: 'nord',
				language: 'es',
			});

			await loadAllSettings();

			const state = useSettingsStore.getState();
			expect(state.activeThemeId).toBe('nord');
			expect(state.language).toBe('es');
			expect(state.settingsLoaded).toBe(true);
		});

		it('loads Arabic + custom theme from persisted store', async () => {
			vi.mocked(window.maestro.settings.getAll).mockResolvedValueOnce({
				activeThemeId: 'custom',
				language: 'ar',
			});

			await loadAllSettings();

			const state = useSettingsStore.getState();
			expect(state.activeThemeId).toBe('custom');
			expect(state.language).toBe('ar');
		});
	});

	describe('document attributes are independent of theme', () => {
		it('theme change does not modify document direction attributes', () => {
			const root = document.documentElement;

			// Set Arabic RTL direction (simulating language switch)
			root.dir = 'rtl';
			root.lang = 'ar';
			root.setAttribute('data-dir', 'rtl');
			root.style.setProperty('--dir-start', 'right');
			root.style.setProperty('--dir-end', 'left');

			// Now switch theme
			const store = useSettingsStore.getState();
			store.setActiveThemeId('dracula' as any);

			// RTL direction attributes must be untouched
			expect(root.dir).toBe('rtl');
			expect(root.lang).toBe('ar');
			expect(root.getAttribute('data-dir')).toBe('rtl');
			expect(root.style.getPropertyValue('--dir-start')).toBe('right');
			expect(root.style.getPropertyValue('--dir-end')).toBe('left');
		});
	});
});
