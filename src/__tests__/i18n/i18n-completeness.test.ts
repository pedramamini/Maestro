/**
 * i18n Completeness Tests
 *
 * Runs the same validation assertions as scripts/i18n-validate.ts
 * so that CI fails if translations are incomplete, have orphaned keys,
 * or are missing interpolation variables.
 */

import { describe, it, expect } from 'vitest';
import {
	flattenKeys,
	extractInterpolationVars,
	loadNamespace,
	validateLanguage,
} from '../../../scripts/i18n-validate';

const LANGUAGES = ['en', 'es', 'fr', 'de', 'zh', 'hi', 'ar', 'bn', 'pt'] as const;
type Language = (typeof LANGUAGES)[number];

const NAMESPACES = [
	'common',
	'settings',
	'modals',
	'menus',
	'notifications',
	'accessibility',
	'shortcuts',
] as const;

// Load English data once
function loadEnglishData(): Map<string, Map<string, string>> {
	const englishData = new Map<string, Map<string, string>>();
	for (const ns of NAMESPACES) {
		const { data, syntaxError } = loadNamespace('en', ns);
		if (syntaxError) throw new Error(syntaxError);
		englishData.set(ns, data);
	}
	return englishData;
}

describe('i18n Translation Completeness', () => {
	const englishData = loadEnglishData();

	describe('English source files', () => {
		it('loads all namespace files without syntax errors', () => {
			for (const ns of NAMESPACES) {
				const { syntaxError } = loadNamespace('en', ns);
				expect(syntaxError).toBeNull();
			}
		});

		it('has a non-trivial number of keys', () => {
			let totalKeys = 0;
			for (const [, keys] of englishData) {
				totalKeys += keys.size;
			}
			// We know there are ~2984 keys; ensure at least 2000 exist
			expect(totalKeys).toBeGreaterThan(2000);
		});
	});

	describe.each(LANGUAGES.filter((l) => l !== 'en'))('%s translation', (lang) => {
		it('has no syntax errors in any namespace', () => {
			for (const ns of NAMESPACES) {
				const { syntaxError } = loadNamespace(lang, ns);
				expect(syntaxError, `Syntax error in ${lang}/${ns}.json`).toBeNull();
			}
		});

		it('passes full validation with 0 issues', () => {
			const report = validateLanguage(lang as Language, englishData);
			const issueDetails = report.issues
				.map((i) => `[${i.type}] ${i.namespace}:${i.key} — ${i.detail}`)
				.join('\n');
			expect(
				report.issues.length,
				`${lang} has ${report.issues.length} issue(s):\n${issueDetails}`
			).toBe(0);
			expect(report.syntaxErrors.length).toBe(0);
		});

		it('has 100% completion', () => {
			const report = validateLanguage(lang as Language, englishData);
			expect(report.completionPercent).toBe(100);
		});
	});

	describe('utility functions', () => {
		it('flattenKeys handles nested objects', () => {
			const result = flattenKeys({
				a: { b: { c: 'hello' } },
				d: 'world',
			});
			expect(result.get('a.b.c')).toBe('hello');
			expect(result.get('d')).toBe('world');
		});

		it('extractInterpolationVars finds all variables', () => {
			const vars = extractInterpolationVars('Hello {{name}}, you have {{count}} items');
			expect(vars).toEqual(new Set(['name', 'count']));
		});

		it('extractInterpolationVars returns empty set for plain text', () => {
			const vars = extractInterpolationVars('Hello world');
			expect(vars.size).toBe(0);
		});
	});
});
