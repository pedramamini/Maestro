/**
 * Tests for searchableSettings.ts
 *
 * Tests the search algorithm, scoring, and registry completeness.
 */

import { describe, it, expect } from 'vitest';
import {
	searchSettings,
	ALL_SEARCHABLE_SETTINGS,
} from '../../../../renderer/components/Settings/searchableSettings';

describe('searchableSettings', () => {
	describe('ALL_SEARCHABLE_SETTINGS', () => {
		it('should contain entries from all tabs', () => {
			const tabs = new Set(ALL_SEARCHABLE_SETTINGS.map((s) => s.tab));
			expect(tabs).toContain('general');
			expect(tabs).toContain('display');
			expect(tabs).toContain('shortcuts');
			expect(tabs).toContain('theme');
			expect(tabs).toContain('notifications');
			expect(tabs).toContain('aicommands');
			expect(tabs).toContain('ssh');
			expect(tabs).toContain('environment');
			expect(tabs).toContain('encore');
		});

		it('should have unique ids', () => {
			const ids = ALL_SEARCHABLE_SETTINGS.map((s) => s.id);
			expect(new Set(ids).size).toBe(ids.length);
		});

		it('should have non-empty labels and tabLabels', () => {
			for (const s of ALL_SEARCHABLE_SETTINGS) {
				expect(s.label.length).toBeGreaterThan(0);
				expect(s.tabLabel.length).toBeGreaterThan(0);
			}
		});
	});

	describe('searchSettings', () => {
		it('should return empty array for empty query', () => {
			expect(searchSettings('')).toEqual([]);
			expect(searchSettings('   ')).toEqual([]);
		});

		it('should match by label', () => {
			const results = searchSettings('Font Size');
			expect(results.some((s) => s.id === 'display-font-size')).toBe(true);
		});

		it('should match by description', () => {
			const results = searchSettings('desktop notifications');
			expect(results.some((s) => s.id === 'notifications-os')).toBe(true);
		});

		it('should match by keywords', () => {
			const results = searchSettings('gpu');
			expect(results.some((s) => s.id === 'general-rendering')).toBe(true);
		});

		it('should be case insensitive', () => {
			const lower = searchSettings('font');
			const upper = searchSettings('FONT');
			const mixed = searchSettings('Font');
			expect(lower.length).toBe(upper.length);
			expect(lower.length).toBe(mixed.length);
		});

		it('should match multiple terms (AND logic)', () => {
			const results = searchSettings('tab naming');
			expect(results.some((s) => s.id === 'general-tab-naming')).toBe(true);
			// Should not match things that only have one of the terms
			for (const r of results) {
				const all =
					`${r.label} ${r.description || ''} ${r.tabLabel} ${(r.keywords || []).join(' ')}`.toLowerCase();
				expect(all).toContain('tab');
				expect(all).toContain('naming');
			}
		});

		it('should return no results for gibberish', () => {
			expect(searchSettings('xyznonexistent123')).toEqual([]);
		});

		it('should rank label matches higher than keyword matches', () => {
			const results = searchSettings('font');
			// 'Font Family' and 'Font Size' should appear before items where 'font' is only a keyword
			const labelMatches = results.filter((s) => s.label.toLowerCase().includes('font'));
			const keywordOnly = results.filter(
				(s) =>
					!s.label.toLowerCase().includes('font') && !s.description?.toLowerCase().includes('font')
			);
			if (labelMatches.length > 0 && keywordOnly.length > 0) {
				const firstLabelIdx = results.indexOf(labelMatches[0]);
				const firstKwIdx = results.indexOf(keywordOnly[0]);
				expect(firstLabelIdx).toBeLessThan(firstKwIdx);
			}
		});
	});
});
