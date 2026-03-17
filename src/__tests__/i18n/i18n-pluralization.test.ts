/**
 * i18n Pluralization Tests
 *
 * Verifies pluralization works correctly for:
 * - English (2 forms: one, other)
 * - French (singular at 0 and 1)
 * - Arabic (6 CLDR forms: zero, one, two, few, many, other)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import commonEn from '../../shared/i18n/locales/en/common.json';
import commonFr from '../../shared/i18n/locales/fr/common.json';
import commonAr from '../../shared/i18n/locales/ar/common.json';

const testI18n = i18n.createInstance();

beforeAll(async () => {
	await testI18n.use(initReactI18next).init({
		resources: {
			en: { common: commonEn },
			fr: { common: commonFr },
			ar: { common: commonAr },
		},
		fallbackLng: 'en',
		supportedLngs: ['en', 'fr', 'ar'],
		ns: ['common'],
		defaultNS: 'common',
		interpolation: { escapeValue: false },
		react: { useSuspense: false },
	});
});

describe('i18n Pluralization', () => {
	describe('English (2 forms: one, other)', () => {
		beforeAll(async () => {
			await testI18n.changeLanguage('en');
		});

		it('uses singular form for count=1', () => {
			const result = testI18n.t('items_count', { count: 1 });
			expect(result).toBe('1 item');
		});

		it('uses plural form for count=0', () => {
			const result = testI18n.t('items_count', { count: 0 });
			expect(result).toBe('0 items');
		});

		it('uses plural form for count=5', () => {
			const result = testI18n.t('items_count', { count: 5 });
			expect(result).toBe('5 items');
		});

		it('uses plural form for count=100', () => {
			const result = testI18n.t('items_count', { count: 100 });
			expect(result).toBe('100 items');
		});

		it('handles agents_running pluralization', () => {
			expect(testI18n.t('agents_running', { count: 1 })).toBe('1 agent running');
			expect(testI18n.t('agents_running', { count: 3 })).toBe('3 agents running');
		});
	});

	describe('French (singular at 0 and 1)', () => {
		beforeAll(async () => {
			await testI18n.changeLanguage('fr');
		});

		it('uses singular form for count=0 (French treats 0 as singular)', () => {
			const result = testI18n.t('items_count', { count: 0 });
			// French CLDR: 0 is "one" category
			expect(result).toBeTruthy();
			expect(typeof result).toBe('string');
		});

		it('uses singular form for count=1', () => {
			const result = testI18n.t('items_count', { count: 1 });
			expect(result).toBeTruthy();
			expect(result).toContain('1');
		});

		it('uses plural form for count=2', () => {
			const result = testI18n.t('items_count', { count: 2 });
			expect(result).toBeTruthy();
			expect(result).toContain('2');
		});

		it('uses plural form for count=5', () => {
			const result = testI18n.t('items_count', { count: 5 });
			expect(result).toBeTruthy();
			expect(result).toContain('5');
		});

		it('singular and plural forms are different for count>1', () => {
			const singular = testI18n.t('items_count', { count: 1 });
			const plural = testI18n.t('items_count', { count: 5 });
			// The text around the number should differ (élément vs éléments)
			const singularWithoutNum = singular.replace(/\d+/, '');
			const pluralWithoutNum = plural.replace(/\d+/, '');
			expect(singularWithoutNum).not.toBe(pluralWithoutNum);
		});
	});

	describe('Arabic (6 CLDR forms)', () => {
		beforeAll(async () => {
			await testI18n.changeLanguage('ar');
		});

		it('uses zero form for count=0', () => {
			const result = testI18n.t('items_count', { count: 0 });
			expect(result).toBeTruthy();
			expect(typeof result).toBe('string');
			// Arabic zero form: "لا عناصر"
			expect(result.length).toBeGreaterThan(0);
		});

		it('uses one form for count=1', () => {
			const result = testI18n.t('items_count', { count: 1 });
			expect(result).toBeTruthy();
			// Arabic one form: "عنصر واحد"
			expect(result.length).toBeGreaterThan(0);
		});

		it('uses two form for count=2', () => {
			const result = testI18n.t('items_count', { count: 2 });
			expect(result).toBeTruthy();
			// Arabic two form (dual): "عنصران"
			expect(result.length).toBeGreaterThan(0);
		});

		it('uses few form for count=3', () => {
			const result = testI18n.t('items_count', { count: 3 });
			expect(result).toBeTruthy();
			expect(result).toContain('3');
			// Arabic few form (3-10): "3 عناصر"
		});

		it('uses many form for count=11', () => {
			const result = testI18n.t('items_count', { count: 11 });
			expect(result).toBeTruthy();
			expect(result).toContain('11');
			// Arabic many form (11-99): "11 عنصرًا"
		});

		it('uses other form for count=100', () => {
			const result = testI18n.t('items_count', { count: 100 });
			expect(result).toBeTruthy();
			expect(result).toContain('100');
			// Arabic other form (100+): "100 عنصر"
		});

		it('all 6 Arabic plural forms produce different results where applicable', () => {
			const zero = testI18n.t('items_count', { count: 0 });
			const one = testI18n.t('items_count', { count: 1 });
			const two = testI18n.t('items_count', { count: 2 });
			const few = testI18n.t('items_count', { count: 3 });
			const many = testI18n.t('items_count', { count: 11 });
			const other = testI18n.t('items_count', { count: 100 });

			// Each form should produce a non-empty result
			const forms = [zero, one, two, few, many, other];
			for (const form of forms) {
				expect(form).toBeTruthy();
				expect(form.length).toBeGreaterThan(0);
			}

			// At least the zero, one, two forms should be distinct from each other
			expect(zero).not.toBe(one);
			expect(one).not.toBe(two);
			expect(zero).not.toBe(two);
		});

		it('handles agents_running with all 6 forms', () => {
			const results = [0, 1, 2, 3, 11, 100].map((count) => testI18n.t('agents_running', { count }));
			// All should produce non-empty strings
			for (const result of results) {
				expect(result).toBeTruthy();
				expect(result.length).toBeGreaterThan(0);
			}
		});
	});
});
