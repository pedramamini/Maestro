/**
 * i18n Configuration
 *
 * Initializes i18next with react-i18next for internationalization support.
 * Uses browser language detector for automatic locale detection and
 * bundled JSON resources for translation strings.
 *
 * Supported languages: en, es, fr, de, zh, hi, ar, bn, pt
 * Namespaces: common, settings, modals, menus, notifications, accessibility, shortcuts
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import all translations (bundled at build time — ~570KB total, keeps language switching instant)
import commonEn from './locales/en/common.json';
import settingsEn from './locales/en/settings.json';
import modalsEn from './locales/en/modals.json';
import menusEn from './locales/en/menus.json';
import notificationsEn from './locales/en/notifications.json';
import accessibilityEn from './locales/en/accessibility.json';
import shortcutsEn from './locales/en/shortcuts.json';

import commonEs from './locales/es/common.json';
import settingsEs from './locales/es/settings.json';
import modalsEs from './locales/es/modals.json';
import menusEs from './locales/es/menus.json';
import notificationsEs from './locales/es/notifications.json';
import accessibilityEs from './locales/es/accessibility.json';
import shortcutsEs from './locales/es/shortcuts.json';

import commonFr from './locales/fr/common.json';
import settingsFr from './locales/fr/settings.json';
import modalsFr from './locales/fr/modals.json';
import menusFr from './locales/fr/menus.json';
import notificationsFr from './locales/fr/notifications.json';
import accessibilityFr from './locales/fr/accessibility.json';
import shortcutsFr from './locales/fr/shortcuts.json';

import commonDe from './locales/de/common.json';
import settingsDe from './locales/de/settings.json';
import modalsDe from './locales/de/modals.json';
import menusDe from './locales/de/menus.json';
import notificationsDe from './locales/de/notifications.json';
import accessibilityDe from './locales/de/accessibility.json';
import shortcutsDe from './locales/de/shortcuts.json';

import commonZh from './locales/zh/common.json';
import settingsZh from './locales/zh/settings.json';
import modalsZh from './locales/zh/modals.json';
import menusZh from './locales/zh/menus.json';
import notificationsZh from './locales/zh/notifications.json';
import accessibilityZh from './locales/zh/accessibility.json';
import shortcutsZh from './locales/zh/shortcuts.json';

import commonHi from './locales/hi/common.json';
import settingsHi from './locales/hi/settings.json';
import modalsHi from './locales/hi/modals.json';
import menusHi from './locales/hi/menus.json';
import notificationsHi from './locales/hi/notifications.json';
import accessibilityHi from './locales/hi/accessibility.json';
import shortcutsHi from './locales/hi/shortcuts.json';

import commonAr from './locales/ar/common.json';
import settingsAr from './locales/ar/settings.json';
import modalsAr from './locales/ar/modals.json';
import menusAr from './locales/ar/menus.json';
import notificationsAr from './locales/ar/notifications.json';
import accessibilityAr from './locales/ar/accessibility.json';
import shortcutsAr from './locales/ar/shortcuts.json';

import commonBn from './locales/bn/common.json';
import settingsBn from './locales/bn/settings.json';
import modalsBn from './locales/bn/modals.json';
import menusBn from './locales/bn/menus.json';
import notificationsBn from './locales/bn/notifications.json';
import accessibilityBn from './locales/bn/accessibility.json';
import shortcutsBn from './locales/bn/shortcuts.json';

import commonPt from './locales/pt/common.json';
import settingsPt from './locales/pt/settings.json';
import modalsPt from './locales/pt/modals.json';
import menusPt from './locales/pt/menus.json';
import notificationsPt from './locales/pt/notifications.json';
import accessibilityPt from './locales/pt/accessibility.json';
import shortcutsPt from './locales/pt/shortcuts.json';

export const SUPPORTED_LANGUAGES = ['en', 'es', 'fr', 'de', 'zh', 'hi', 'ar', 'bn', 'pt'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const I18N_NAMESPACES = [
	'common',
	'settings',
	'modals',
	'menus',
	'notifications',
	'accessibility',
	'shortcuts',
] as const;
export type I18nNamespace = (typeof I18N_NAMESPACES)[number];

/** localStorage key used to persist the user's language preference */
export const LANGUAGE_STORAGE_KEY = 'maestro-language';

/** RTL languages in our supported set */
export const RTL_LANGUAGES: SupportedLanguage[] = ['ar'];

/** Native display names for each supported language */
export const LANGUAGE_NATIVE_NAMES: Record<SupportedLanguage, string> = {
	en: 'English',
	es: 'Español',
	fr: 'Français',
	de: 'Deutsch',
	zh: '中文',
	hi: 'हिन्दी',
	ar: 'العربية',
	bn: 'বাংলা',
	pt: 'Português',
};

/**
 * Initialize i18next with all plugins and configuration.
 * Returns a promise that resolves when i18n is ready.
 *
 * All supported language resources are bundled at build time (~570KB total).
 * This keeps language switching instant without lazy-loading complexity.
 */
export function initI18n(): Promise<typeof i18n> {
	return i18n
		.use(LanguageDetector)
		.use(initReactI18next)
		.init({
			resources: {
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
			},

			fallbackLng: 'en',
			supportedLngs: [...SUPPORTED_LANGUAGES],

			ns: [...I18N_NAMESPACES],
			defaultNS: 'common',

			interpolation: {
				escapeValue: false, // React already escapes rendered output
			},

			detection: {
				order: ['localStorage', 'navigator'],
				lookupLocalStorage: LANGUAGE_STORAGE_KEY,
			},

			// Don't suspend on missing translations — fall back to English
			react: {
				useSuspense: false,
			},
		})
		.then(() => i18n);
}

export default i18n;
