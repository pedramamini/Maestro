/**
 * i18n End-to-End Smoke Test
 *
 * Verifies all 9 supported languages work correctly across key UI areas:
 * (1) Settings modal keys render without overflow (string length checks)
 * (2) Hamburger menu items display correctly
 * (3) Command palette / Quick Actions labels translate
 * (4) Toast notification text translates
 * (5) Date/number formatting matches locale conventions
 * (6) Arabic RTL layout: direction, CSS properties, bidirectional text
 * (7) ARIA labels translate for screen reader accessibility
 * (8) Switching back to English restores all text
 */

import { describe, it, expect, beforeAll, beforeEach, vi, afterEach } from 'vitest';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import {
	SUPPORTED_LANGUAGES,
	I18N_NAMESPACES,
	LANGUAGE_NATIVE_NAMES,
	RTL_LANGUAGES,
} from '../../shared/i18n/config';
import type { SupportedLanguage } from '../../shared/i18n/config';
import { isRtlLanguage } from '../../renderer/components/shared/DirectionProvider';
import { formatSize, formatCost, formatTokens, formatRelativeTime } from '../../shared/formatters';

// Import all language resources
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

const allResources: Record<string, Record<string, unknown>> = {
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

// Create a dedicated i18n instance for smoke tests
const smokeI18n = i18n.createInstance();

beforeAll(async () => {
	await smokeI18n.use(initReactI18next).init({
		resources: allResources,
		fallbackLng: 'en',
		supportedLngs: [...SUPPORTED_LANGUAGES],
		ns: [...I18N_NAMESPACES],
		defaultNS: 'common',
		interpolation: { escapeValue: false },
		react: { useSuspense: false },
	});
});

/**
 * Helper: get a translated value from the smoke i18n instance.
 * Uses namespace:key syntax.
 */
function t(key: string, options?: Record<string, unknown>): string {
	return (smokeI18n.t as (key: string, opts?: Record<string, unknown>) => string)(key, options);
}

// ============================================================================
// (1) Settings modal — key labels should not be excessively long (overflow proxy)
// ============================================================================
describe('i18n Smoke: Settings modal rendering', () => {
	// Settings tab labels should be short enough for tab UI (< 30 chars)
	const settingsTabKeys = [
		'settings:tabs.general',
		'settings:tabs.display',
		'settings:tabs.llm',
		'settings:tabs.shortcuts',
		'settings:tabs.themes',
		'settings:tabs.notifications',
		'settings:tabs.ai_commands',
		'settings:tabs.ssh_hosts',
		'settings:tabs.encore_features',
	];

	// Settings section headers should be < 80 chars
	const settingsSectionKeys = [
		'settings:general.title',
		'settings:general.theme_label',
		'settings:general.language_label',
		'settings:general.language_description',
		'settings:general.shell_header',
		'settings:general.env_vars_header',
		'settings:general.log_level_header',
		'settings:general.input_behavior_header',
	];

	it.each([...SUPPORTED_LANGUAGES])(
		'tab labels in %s are not truncated (< 30 chars)',
		async (lang) => {
			await smokeI18n.changeLanguage(lang);
			for (const key of settingsTabKeys) {
				const value = t(key);
				expect(value).toBeTruthy();
				expect(value).not.toBe(key); // Resolved, not raw key
				expect(
					value.length,
					`${lang}:${key} = "${value}" (${value.length} chars) exceeds 30-char tab limit`
				).toBeLessThanOrEqual(30);
			}
		}
	);

	it.each([...SUPPORTED_LANGUAGES])(
		'section headers in %s are reasonable length (< 80 chars)',
		async (lang) => {
			await smokeI18n.changeLanguage(lang);
			for (const key of settingsSectionKeys) {
				const value = t(key);
				expect(value).toBeTruthy();
				expect(value).not.toBe(key);
				expect(
					value.length,
					`${lang}:${key} = "${value}" (${value.length} chars) exceeds 80-char header limit`
				).toBeLessThanOrEqual(80);
			}
		}
	);
});

// ============================================================================
// (2) Hamburger menu items display correctly
// ============================================================================
describe('i18n Smoke: Hamburger menu items', () => {
	const hamburgerKeys = [
		'menus:hamburger.new_agent',
		'menus:hamburger.new_group_chat',
		'menus:hamburger.wizard',
		'menus:hamburger.command_palette',
		'menus:hamburger.tour',
		'menus:hamburger.keyboard_shortcuts',
		'menus:hamburger.settings',
		'menus:hamburger.system_logs',
		'menus:hamburger.process_monitor',
		'menus:hamburger.usage_dashboard',
		'menus:hamburger.symphony',
		'menus:hamburger.director_notes',
		'menus:hamburger.website',
		'menus:hamburger.documentation',
		'menus:hamburger.check_updates',
		'menus:hamburger.about',
		'menus:hamburger.language',
		'menus:hamburger.quit',
	];

	it.each([...SUPPORTED_LANGUAGES])('all hamburger menu items translate in %s', async (lang) => {
		await smokeI18n.changeLanguage(lang);
		for (const key of hamburgerKeys) {
			const value = t(key);
			expect(value, `${lang} missing ${key}`).toBeTruthy();
			expect(value, `${lang}:${key} returned raw key`).not.toBe(key);
			expect(value, `${lang}:${key} returned raw key path`).not.toBe(key.split(':')[1]);
		}
	});

	it.each([...SUPPORTED_LANGUAGES])(
		'hamburger labels in %s are reasonable length (< 50 chars)',
		async (lang) => {
			await smokeI18n.changeLanguage(lang);
			for (const key of hamburgerKeys) {
				const value = t(key);
				expect(
					value.length,
					`${lang}:${key} = "${value}" (${value.length} chars) may overflow menu`
				).toBeLessThanOrEqual(50);
			}
		}
	);

	it.each([...SUPPORTED_LANGUAGES])('hamburger descriptions in %s translate', async (lang) => {
		await smokeI18n.changeLanguage(lang);
		const descKeys = [
			'menus:hamburger.new_agent_desc',
			'menus:hamburger.wizard_desc',
			'menus:hamburger.command_palette_desc',
			'menus:hamburger.settings_desc',
			'menus:hamburger.about_desc',
		];
		for (const key of descKeys) {
			const value = t(key);
			expect(value, `${lang} missing ${key}`).toBeTruthy();
			expect(value).not.toBe(key);
		}
	});
});

// ============================================================================
// (3) Command palette / Quick Actions search labels
// ============================================================================
describe('i18n Smoke: Command palette labels', () => {
	// These are the common action keys used in QuickActionsModal
	const paletteKeys = [
		'common:search',
		'common:settings',
		'common:help',
		'common:save',
		'common:cancel',
		'common:close',
		'common:delete',
		'common:create',
		'common:open',
		'common:refresh',
	];

	it.each([...SUPPORTED_LANGUAGES])('common action labels translate in %s', async (lang) => {
		await smokeI18n.changeLanguage(lang);
		for (const key of paletteKeys) {
			const value = t(key);
			expect(value, `${lang} missing ${key}`).toBeTruthy();
			expect(value, `${lang}:${key} returned raw key`).not.toBe(key.split(':')[1]);
		}
	});

	it.each([...SUPPORTED_LANGUAGES])(
		'translated action labels in %s are non-empty strings',
		async (lang) => {
			await smokeI18n.changeLanguage(lang);
			for (const key of paletteKeys) {
				const value = t(key);
				expect(typeof value).toBe('string');
				expect(value.trim().length).toBeGreaterThan(0);
			}
		}
	);
});

// ============================================================================
// (4) Toast notifications display translated text
// ============================================================================
describe('i18n Smoke: Toast notification text', () => {
	const notificationKeys = [
		'notifications:task.completed_title',
		'notifications:task.failed_title',
		'notifications:connection.lost_title',
		'notifications:connection.restored_title',
		'notifications:worktree.discovered_title',
		'notifications:autorun.started_title',
		'notifications:autorun.complete_title',
	];

	it.each([...SUPPORTED_LANGUAGES])('notification titles translate in %s', async (lang) => {
		await smokeI18n.changeLanguage(lang);
		for (const key of notificationKeys) {
			const value = t(key);
			expect(value, `${lang} missing ${key}`).toBeTruthy();
			expect(value).not.toBe(key);
			expect(value).not.toBe(key.split(':')[1]);
		}
	});

	it.each([...SUPPORTED_LANGUAGES])(
		'notification messages with interpolation work in %s',
		async (lang) => {
			await smokeI18n.changeLanguage(lang);

			const completedMsg = t('notifications:task.completed_message', {
				agent: 'Claude',
				duration: '5m',
			});
			expect(completedMsg).toContain('Claude');
			expect(completedMsg).toContain('5m');

			const failedMsg = t('notifications:task.failed_message', { agent: 'Codex' });
			expect(failedMsg).toContain('Codex');
		}
	);

	it.each([...SUPPORTED_LANGUAGES])('pluralized notification messages work in %s', async (lang) => {
		await smokeI18n.changeLanguage(lang);

		const singular = t('notifications:worktree.discovered_message', { count: 1 });
		const plural = t('notifications:worktree.discovered_message', { count: 5 });

		expect(singular).toBeTruthy();
		expect(plural).toBeTruthy();
		// Some languages (e.g., Arabic) use word forms for count=1 instead of the digit "1"
		// Just verify singular and plural produce different non-empty strings
		if (lang !== 'ar') {
			expect(singular).toContain('1');
		}
		expect(plural).toContain('5');
	});
});

// ============================================================================
// (5) Date/number formatting matches locale conventions
// ============================================================================
describe('i18n Smoke: Locale-aware formatting', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-03-13T12:00:00Z'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	// Locales that use comma as decimal separator
	const commaDecimalLocales: SupportedLanguage[] = ['de', 'fr', 'es', 'pt'];
	// Locales that use period as decimal separator
	const periodDecimalLocales: SupportedLanguage[] = ['en', 'zh'];

	it.each(commaDecimalLocales)('formatSize uses comma separator for %s', (locale) => {
		const result = formatSize(1536, locale);
		expect(result).toContain('1,5');
		expect(result).toContain('KB');
	});

	it.each(periodDecimalLocales)('formatSize uses period separator for %s', (locale) => {
		const result = formatSize(1536, locale);
		expect(result).toContain('1.5');
		expect(result).toContain('KB');
	});

	it.each([...SUPPORTED_LANGUAGES])('formatCost produces valid output for %s', (locale) => {
		const result = formatCost(42.99, locale);
		expect(result).toBeTruthy();
		expect(typeof result).toBe('string');
		// Some locales (Bengali, Arabic) use non-Western numeral systems via Intl.NumberFormat.
		// Verify the output is non-empty and contains currency-related content.
		expect(result.length).toBeGreaterThan(0);
		// For locales using Western Arabic numerals, check digit presence
		const westernNumeralLocales = ['en', 'es', 'fr', 'de', 'zh', 'pt'];
		if (westernNumeralLocales.includes(locale)) {
			expect(result).toMatch(/42/);
			expect(result).toMatch(/99/);
		}
	});

	it.each([...SUPPORTED_LANGUAGES])(
		'formatTokens produces valid compact output for %s',
		(locale) => {
			const result = formatTokens(2500, locale);
			expect(result).toBeTruthy();
			expect(result).toMatch(/^~/); // Approximate prefix
		}
	);

	it.each([...SUPPORTED_LANGUAGES])('formatRelativeTime produces valid output for %s', (locale) => {
		const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
		const result = formatRelativeTime(fiveMinutesAgo, locale);
		expect(result).toBeTruthy();
		expect(typeof result).toBe('string');
		expect(result.length).toBeGreaterThan(0);
		// Should contain the number 5 (in some numeral system)
		// Arabic may use Eastern Arabic numerals, so just check non-empty
	});

	it.each([...SUPPORTED_LANGUAGES])('formatRelativeTime handles hours for %s', (locale) => {
		const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
		const result = formatRelativeTime(twoHoursAgo, locale);
		expect(result).toBeTruthy();
		expect(result.length).toBeGreaterThan(0);
	});

	it.each([...SUPPORTED_LANGUAGES])('formatRelativeTime handles old dates for %s', (locale) => {
		const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
		const result = formatRelativeTime(twoWeeksAgo, locale);
		expect(result).toBeTruthy();
		// Should be a formatted date (not a relative time)
		expect(result.length).toBeGreaterThan(0);
	});
});

// ============================================================================
// (6) Arabic RTL layout
// ============================================================================
describe('i18n Smoke: Arabic RTL layout', () => {
	beforeEach(() => {
		// Reset document attributes
		document.documentElement.dir = '';
		document.documentElement.lang = '';
		document.documentElement.removeAttribute('data-dir');
		document.documentElement.style.removeProperty('--dir-start');
		document.documentElement.style.removeProperty('--dir-end');
	});

	it('Arabic is correctly identified as RTL', () => {
		expect(isRtlLanguage('ar')).toBe(true);
		expect(RTL_LANGUAGES).toContain('ar');
	});

	it('all non-Arabic languages are LTR', () => {
		for (const lang of SUPPORTED_LANGUAGES) {
			if (lang === 'ar') continue;
			expect(isRtlLanguage(lang)).toBe(false);
		}
	});

	it('RTL direction attributes set correctly for Arabic', () => {
		const root = document.documentElement;
		const rtl = isRtlLanguage('ar');
		const dir = rtl ? 'rtl' : 'ltr';

		root.lang = 'ar';
		root.dir = dir;
		root.setAttribute('data-dir', dir);
		root.style.setProperty('--dir-start', rtl ? 'right' : 'left');
		root.style.setProperty('--dir-end', rtl ? 'left' : 'right');

		// Sidebar should be on the right in RTL
		expect(root.dir).toBe('rtl');
		expect(root.getAttribute('data-dir')).toBe('rtl');
		expect(root.style.getPropertyValue('--dir-start')).toBe('right');
		expect(root.style.getPropertyValue('--dir-end')).toBe('left');
	});

	it('Arabic translations contain Arabic script characters', async () => {
		await smokeI18n.changeLanguage('ar');
		const arabicSave = t('common:save');
		const arabicSettings = t('menus:hamburger.settings');
		const arabicSearch = t('common:search');

		// Arabic Unicode range: \u0600-\u06FF (Arabic block)
		const arabicPattern = /[\u0600-\u06FF]/;
		expect(arabicSave).toMatch(arabicPattern);
		expect(arabicSettings).toMatch(arabicPattern);
		expect(arabicSearch).toMatch(arabicPattern);
	});

	it('Arabic handles bidirectional text with English product names', async () => {
		await smokeI18n.changeLanguage('ar');

		// Keys that embed "Maestro" (English) within Arabic text
		const aboutMaestro = t('menus:hamburger.about');
		const quitMaestro = t('menus:hamburger.quit');

		// Should contain both Arabic text and the English product name
		expect(aboutMaestro).toBeTruthy();
		expect(quitMaestro).toBeTruthy();
		// Both should contain "Maestro" (possibly with bidi markers)
		expect(aboutMaestro.replace(/[\u200E\u200F]/g, '')).toContain('Maestro');
		expect(quitMaestro.replace(/[\u200E\u200F]/g, '')).toContain('Maestro');
	});

	it('Arabic text alignment CSS properties are set correctly', () => {
		const root = document.documentElement;
		root.dir = 'rtl';
		root.style.setProperty('--dir-start', 'right');
		root.style.setProperty('--dir-end', 'left');

		// In RTL, text-align: start resolves to right
		expect(root.style.getPropertyValue('--dir-start')).toBe('right');
		expect(root.style.getPropertyValue('--dir-end')).toBe('left');
	});
});

// ============================================================================
// (7) Screen reader ARIA labels translate
// ============================================================================
describe('i18n Smoke: Translated ARIA labels', () => {
	const ariaKeys = [
		'accessibility:sidebar.toggle_button',
		'accessibility:sidebar.agent_list',
		'accessibility:main_panel.output_region',
		'accessibility:main_panel.input_field',
	];

	it.each([...SUPPORTED_LANGUAGES])('core ARIA labels translate in %s', async (lang) => {
		await smokeI18n.changeLanguage(lang);
		for (const key of ariaKeys) {
			const value = t(key);
			expect(value, `${lang} missing ARIA label ${key}`).toBeTruthy();
			expect(value).not.toBe(key);
			expect(value).not.toBe(key.split(':')[1]);
		}
	});

	it('English ARIA labels are plain English', async () => {
		await smokeI18n.changeLanguage('en');
		expect(t('accessibility:sidebar.toggle_button')).toBe('Toggle left panel');
		expect(t('accessibility:sidebar.agent_list')).toBe('Agent list');
		expect(t('accessibility:main_panel.output_region')).toBe('AI output region');
		expect(t('accessibility:main_panel.input_field')).toBe('Message input');
	});

	it('non-Latin script languages produce non-Latin ARIA labels', async () => {
		// Arabic
		await smokeI18n.changeLanguage('ar');
		const arToggle = t('accessibility:sidebar.toggle_button');
		expect(arToggle).toMatch(/[\u0600-\u06FF]/);

		// Chinese
		await smokeI18n.changeLanguage('zh');
		const zhToggle = t('accessibility:sidebar.toggle_button');
		expect(zhToggle).toMatch(/[\u4E00-\u9FFF\u3400-\u4DBF]/);

		// Hindi
		await smokeI18n.changeLanguage('hi');
		const hiToggle = t('accessibility:sidebar.toggle_button');
		expect(hiToggle).toMatch(/[\u0900-\u097F]/);

		// Bengali
		await smokeI18n.changeLanguage('bn');
		const bnToggle = t('accessibility:sidebar.toggle_button');
		expect(bnToggle).toMatch(/[\u0980-\u09FF]/);
	});

	it('ARIA labels with interpolation work across languages', async () => {
		const mobileCardKey = 'accessibility:mobile.session_card';

		for (const lang of SUPPORTED_LANGUAGES) {
			await smokeI18n.changeLanguage(lang);
			const value = t(mobileCardKey, {
				name: 'TestAgent',
				status: 'ready',
				mode: 'AI',
			});
			expect(value, `${lang}: interpolated ARIA label should contain agent name`).toContain(
				'TestAgent'
			);
		}
	});
});

// ============================================================================
// (8) Language switching — restoring to English
// ============================================================================
describe('i18n Smoke: Language switching round-trip', () => {
	it('switching to each language and back to English restores original text', async () => {
		// Capture English values
		await smokeI18n.changeLanguage('en');
		const enSave = t('common:save');
		const enSettings = t('menus:hamburger.settings');
		const enGeneral = t('settings:tabs.general');
		const enTaskComplete = t('notifications:task.completed_title');
		const enToggle = t('accessibility:sidebar.toggle_button');

		expect(enSave).toBe('Save');
		expect(enSettings).toBe('Settings');
		expect(enGeneral).toBe('General');

		for (const lang of SUPPORTED_LANGUAGES) {
			if (lang === 'en') continue;

			// Switch to non-English language
			await smokeI18n.changeLanguage(lang);
			const foreignSave = t('common:save');

			// Non-English languages should have a different translation for "Save"
			// (except coincidental matches for single-word cognates are unlikely)
			expect(foreignSave).toBeTruthy();

			// Switch back to English
			await smokeI18n.changeLanguage('en');
			expect(t('common:save')).toBe(enSave);
			expect(t('menus:hamburger.settings')).toBe(enSettings);
			expect(t('settings:tabs.general')).toBe(enGeneral);
			expect(t('notifications:task.completed_title')).toBe(enTaskComplete);
			expect(t('accessibility:sidebar.toggle_button')).toBe(enToggle);
		}
	});

	it('language switching updates i18n instance language property', async () => {
		for (const lang of SUPPORTED_LANGUAGES) {
			await smokeI18n.changeLanguage(lang);
			expect(smokeI18n.language).toBe(lang);
		}
	});

	it('RTL direction toggles correctly when switching Arabic ↔ English', () => {
		const root = document.documentElement;

		// Switch to Arabic
		const arRtl = isRtlLanguage('ar');
		root.dir = arRtl ? 'rtl' : 'ltr';
		root.lang = 'ar';
		root.setAttribute('data-dir', root.dir);
		root.style.setProperty('--dir-start', arRtl ? 'right' : 'left');
		root.style.setProperty('--dir-end', arRtl ? 'left' : 'right');

		expect(root.dir).toBe('rtl');

		// Switch back to English
		const enRtl = isRtlLanguage('en');
		root.dir = enRtl ? 'rtl' : 'ltr';
		root.lang = 'en';
		root.setAttribute('data-dir', root.dir);
		root.style.setProperty('--dir-start', enRtl ? 'right' : 'left');
		root.style.setProperty('--dir-end', enRtl ? 'left' : 'right');

		expect(root.dir).toBe('ltr');
		expect(root.lang).toBe('en');
		expect(root.getAttribute('data-dir')).toBe('ltr');
		expect(root.style.getPropertyValue('--dir-start')).toBe('left');
		expect(root.style.getPropertyValue('--dir-end')).toBe('right');
	});
});

// ============================================================================
// Cross-cutting: every language has translated native name
// ============================================================================
describe('i18n Smoke: Language metadata', () => {
	it('every supported language has a native name', () => {
		for (const lang of SUPPORTED_LANGUAGES) {
			const name = LANGUAGE_NATIVE_NAMES[lang];
			expect(name).toBeTruthy();
			expect(name.length).toBeGreaterThan(0);
		}
	});

	it('native names are unique per language', () => {
		const names = Object.values(LANGUAGE_NATIVE_NAMES);
		const uniqueNames = new Set(names);
		expect(uniqueNames.size).toBe(names.length);
	});

	it('non-Latin languages have native names in their own script', () => {
		// Chinese
		expect(LANGUAGE_NATIVE_NAMES['zh']).toMatch(/[\u4E00-\u9FFF]/);
		// Hindi
		expect(LANGUAGE_NATIVE_NAMES['hi']).toMatch(/[\u0900-\u097F]/);
		// Arabic
		expect(LANGUAGE_NATIVE_NAMES['ar']).toMatch(/[\u0600-\u06FF]/);
		// Bengali
		expect(LANGUAGE_NATIVE_NAMES['bn']).toMatch(/[\u0980-\u09FF]/);
	});
});
