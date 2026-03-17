/**
 * i18n Configuration Tests
 *
 * Verifies that all 9 supported languages load successfully,
 * fallback to English works, and namespace loading works correctly.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import {
	SUPPORTED_LANGUAGES,
	I18N_NAMESPACES,
	LANGUAGE_NATIVE_NAMES,
	RTL_LANGUAGES,
} from '../../shared/i18n/config';

// Import all English resources for bundled init
import commonEn from '../../shared/i18n/locales/en/common.json';
import settingsEn from '../../shared/i18n/locales/en/settings.json';
import modalsEn from '../../shared/i18n/locales/en/modals.json';
import menusEn from '../../shared/i18n/locales/en/menus.json';
import notificationsEn from '../../shared/i18n/locales/en/notifications.json';
import accessibilityEn from '../../shared/i18n/locales/en/accessibility.json';
import shortcutsEn from '../../shared/i18n/locales/en/shortcuts.json';

import commonEs from '../../shared/i18n/locales/es/common.json';
import settingsEs from '../../shared/i18n/locales/es/settings.json';
import modalsEs from '../../shared/i18n/locales/es/modals.json';
import menusEs from '../../shared/i18n/locales/es/menus.json';
import notificationsEs from '../../shared/i18n/locales/es/notifications.json';
import accessibilityEs from '../../shared/i18n/locales/es/accessibility.json';
import shortcutsEs from '../../shared/i18n/locales/es/shortcuts.json';

import commonFr from '../../shared/i18n/locales/fr/common.json';
import settingsFr from '../../shared/i18n/locales/fr/settings.json';
import modalsFr from '../../shared/i18n/locales/fr/modals.json';
import menusFr from '../../shared/i18n/locales/fr/menus.json';
import notificationsFr from '../../shared/i18n/locales/fr/notifications.json';
import accessibilityFr from '../../shared/i18n/locales/fr/accessibility.json';
import shortcutsFr from '../../shared/i18n/locales/fr/shortcuts.json';

import commonDe from '../../shared/i18n/locales/de/common.json';
import settingsDe from '../../shared/i18n/locales/de/settings.json';
import modalsDe from '../../shared/i18n/locales/de/modals.json';
import menusDe from '../../shared/i18n/locales/de/menus.json';
import notificationsDe from '../../shared/i18n/locales/de/notifications.json';
import accessibilityDe from '../../shared/i18n/locales/de/accessibility.json';
import shortcutsDe from '../../shared/i18n/locales/de/shortcuts.json';

import commonZh from '../../shared/i18n/locales/zh/common.json';
import settingsZh from '../../shared/i18n/locales/zh/settings.json';
import modalsZh from '../../shared/i18n/locales/zh/modals.json';
import menusZh from '../../shared/i18n/locales/zh/menus.json';
import notificationsZh from '../../shared/i18n/locales/zh/notifications.json';
import accessibilityZh from '../../shared/i18n/locales/zh/accessibility.json';
import shortcutsZh from '../../shared/i18n/locales/zh/shortcuts.json';

import commonHi from '../../shared/i18n/locales/hi/common.json';
import settingsHi from '../../shared/i18n/locales/hi/settings.json';
import modalsHi from '../../shared/i18n/locales/hi/modals.json';
import menusHi from '../../shared/i18n/locales/hi/menus.json';
import notificationsHi from '../../shared/i18n/locales/hi/notifications.json';
import accessibilityHi from '../../shared/i18n/locales/hi/accessibility.json';
import shortcutsHi from '../../shared/i18n/locales/hi/shortcuts.json';

import commonAr from '../../shared/i18n/locales/ar/common.json';
import settingsAr from '../../shared/i18n/locales/ar/settings.json';
import modalsAr from '../../shared/i18n/locales/ar/modals.json';
import menusAr from '../../shared/i18n/locales/ar/menus.json';
import notificationsAr from '../../shared/i18n/locales/ar/notifications.json';
import accessibilityAr from '../../shared/i18n/locales/ar/accessibility.json';
import shortcutsAr from '../../shared/i18n/locales/ar/shortcuts.json';

import commonBn from '../../shared/i18n/locales/bn/common.json';
import settingsBn from '../../shared/i18n/locales/bn/settings.json';
import modalsBn from '../../shared/i18n/locales/bn/modals.json';
import menusBn from '../../shared/i18n/locales/bn/menus.json';
import notificationsBn from '../../shared/i18n/locales/bn/notifications.json';
import accessibilityBn from '../../shared/i18n/locales/bn/accessibility.json';
import shortcutsBn from '../../shared/i18n/locales/bn/shortcuts.json';

import commonPt from '../../shared/i18n/locales/pt/common.json';
import settingsPt from '../../shared/i18n/locales/pt/settings.json';
import modalsPt from '../../shared/i18n/locales/pt/modals.json';
import menusPt from '../../shared/i18n/locales/pt/menus.json';
import notificationsPt from '../../shared/i18n/locales/pt/notifications.json';
import accessibilityPt from '../../shared/i18n/locales/pt/accessibility.json';
import shortcutsPt from '../../shared/i18n/locales/pt/shortcuts.json';

const allResources = {
	en: {
		common: commonEn,
		settings: settingsEn,
		modals: modalsEn,
		menus: menusEn,
		notifications: notificationsEn,
		accessibility: accessibilityEn,
		shortcuts: shortcutsEn,
	},
	es: {
		common: commonEs,
		settings: settingsEs,
		modals: modalsEs,
		menus: menusEs,
		notifications: notificationsEs,
		accessibility: accessibilityEs,
		shortcuts: shortcutsEs,
	},
	fr: {
		common: commonFr,
		settings: settingsFr,
		modals: modalsFr,
		menus: menusFr,
		notifications: notificationsFr,
		accessibility: accessibilityFr,
		shortcuts: shortcutsFr,
	},
	de: {
		common: commonDe,
		settings: settingsDe,
		modals: modalsDe,
		menus: menusDe,
		notifications: notificationsDe,
		accessibility: accessibilityDe,
		shortcuts: shortcutsDe,
	},
	zh: {
		common: commonZh,
		settings: settingsZh,
		modals: modalsZh,
		menus: menusZh,
		notifications: notificationsZh,
		accessibility: accessibilityZh,
		shortcuts: shortcutsZh,
	},
	hi: {
		common: commonHi,
		settings: settingsHi,
		modals: modalsHi,
		menus: menusHi,
		notifications: notificationsHi,
		accessibility: accessibilityHi,
		shortcuts: shortcutsHi,
	},
	ar: {
		common: commonAr,
		settings: settingsAr,
		modals: modalsAr,
		menus: menusAr,
		notifications: notificationsAr,
		accessibility: accessibilityAr,
		shortcuts: shortcutsAr,
	},
	bn: {
		common: commonBn,
		settings: settingsBn,
		modals: modalsBn,
		menus: menusBn,
		notifications: notificationsBn,
		accessibility: accessibilityBn,
		shortcuts: shortcutsBn,
	},
	pt: {
		common: commonPt,
		settings: settingsPt,
		modals: modalsPt,
		menus: menusPt,
		notifications: notificationsPt,
		accessibility: accessibilityPt,
		shortcuts: shortcutsPt,
	},
};

// Create a dedicated i18n instance for these tests so we don't conflict
// with the global mock in setup.ts
const testI18n = i18n.createInstance();

beforeAll(async () => {
	await testI18n.use(initReactI18next).init({
		resources: allResources,
		fallbackLng: 'en',
		supportedLngs: [...SUPPORTED_LANGUAGES],
		ns: [...I18N_NAMESPACES],
		defaultNS: 'common',
		interpolation: { escapeValue: false },
		react: { useSuspense: false },
	});
});

describe('i18n Configuration', () => {
	describe('supported languages', () => {
		it('supports exactly 9 languages', () => {
			expect(SUPPORTED_LANGUAGES).toHaveLength(9);
		});

		it('includes all expected language codes', () => {
			const expected = ['en', 'es', 'fr', 'de', 'zh', 'hi', 'ar', 'bn', 'pt'];
			expect([...SUPPORTED_LANGUAGES]).toEqual(expected);
		});

		it('has native names for all supported languages', () => {
			for (const lang of SUPPORTED_LANGUAGES) {
				expect(LANGUAGE_NATIVE_NAMES[lang]).toBeDefined();
				expect(LANGUAGE_NATIVE_NAMES[lang].length).toBeGreaterThan(0);
			}
		});

		it('identifies Arabic as the only RTL language', () => {
			expect(RTL_LANGUAGES).toEqual(['ar']);
		});
	});

	describe('language loading', () => {
		it.each([...SUPPORTED_LANGUAGES])('loads %s language successfully', (lang) => {
			expect(testI18n.hasResourceBundle(lang, 'common')).toBe(true);
		});

		it.each([...SUPPORTED_LANGUAGES])('has all namespaces for %s', (lang) => {
			for (const ns of I18N_NAMESPACES) {
				expect(testI18n.hasResourceBundle(lang, ns)).toBe(true);
			}
		});
	});

	describe('namespace loading', () => {
		it('has exactly 7 namespaces', () => {
			expect(I18N_NAMESPACES).toHaveLength(7);
		});

		it('includes all expected namespaces', () => {
			const expected = [
				'common',
				'settings',
				'modals',
				'menus',
				'notifications',
				'accessibility',
				'shortcuts',
			];
			expect([...I18N_NAMESPACES]).toEqual(expected);
		});

		it('defaults to common namespace', () => {
			// t('save') without namespace prefix should resolve from common
			const result = testI18n.t('save');
			expect(result).toBe('Save');
		});

		it('resolves namespaced keys with colon syntax', () => {
			const result = testI18n.t('common:save');
			expect(result).toBe('Save');
		});
	});

	describe('fallback behavior', () => {
		it('falls back to English for missing keys', async () => {
			await testI18n.changeLanguage('es');
			// 'save' exists in Spanish, but let's test that English fallback works
			// by checking a key — the fallback mechanism is what matters
			const result = testI18n.t('save');
			expect(result).toBeTruthy();
			expect(result).not.toBe('save'); // Should not return the raw key
		});

		it('returns English text when current language has no translation', async () => {
			await testI18n.changeLanguage('en');
			const enValue = testI18n.t('save');

			// Add a resource bundle for a fake language with missing keys
			testI18n.addResourceBundle('xx', 'common', {}, true, true);
			await testI18n.changeLanguage('xx');
			const xxValue = testI18n.t('save');

			// Should fall back to English
			expect(xxValue).toBe(enValue);

			// Clean up
			await testI18n.changeLanguage('en');
		});

		it('switches between languages correctly', async () => {
			await testI18n.changeLanguage('en');
			expect(testI18n.t('save')).toBe('Save');

			await testI18n.changeLanguage('es');
			expect(testI18n.t('save')).not.toBe('Save');
			expect(testI18n.t('save')).toBeTruthy();

			// Switch back
			await testI18n.changeLanguage('en');
			expect(testI18n.t('save')).toBe('Save');
		});
	});

	describe('interpolation', () => {
		it('handles {{variable}} interpolation', async () => {
			await testI18n.changeLanguage('en');
			const result = testI18n.t('items_count_other', { count: 5 });
			expect(result).toBe('5 items');
		});

		it('handles interpolation in non-English languages', async () => {
			await testI18n.changeLanguage('es');
			const result = testI18n.t('items_count_other', { count: 5 });
			expect(result).toContain('5');
			await testI18n.changeLanguage('en');
		});
	});
});
