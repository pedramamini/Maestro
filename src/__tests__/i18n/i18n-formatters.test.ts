/**
 * i18n Formatters Tests
 *
 * Verifies that formatRelativeTime(), formatSize(), formatCost(), and formatTokens()
 * produce correct locale-aware output for spot-checked languages.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatSize, formatCost, formatTokens, formatRelativeTime } from '../../shared/formatters';

describe('i18n Formatters', () => {
	describe('formatSize', () => {
		it('formats bytes without decimals', () => {
			expect(formatSize(500, 'en')).toBe('500 B');
		});

		it('formats kilobytes in English', () => {
			expect(formatSize(1536, 'en')).toBe('1.5 KB');
		});

		it('formats megabytes in English', () => {
			expect(formatSize(2621440, 'en')).toBe('2.5 MB');
		});

		it('uses comma as decimal separator for German locale', () => {
			const result = formatSize(1536, 'de');
			// German uses comma: "1,5 KB"
			expect(result).toContain('1,5');
			expect(result).toContain('KB');
		});

		it('uses comma as decimal separator for French locale', () => {
			const result = formatSize(1536, 'fr');
			// French uses comma: "1,5 KB"
			expect(result).toContain('1,5');
			expect(result).toContain('KB');
		});

		it('formats correctly for Chinese locale', () => {
			const result = formatSize(1536, 'zh');
			expect(result).toContain('1.5');
			expect(result).toContain('KB');
		});

		it('formats correctly for Arabic locale', () => {
			const result = formatSize(1536, 'ar');
			// Arabic may use different numeral systems; just verify it contains the unit
			expect(result).toContain('KB');
		});
	});

	describe('formatCost', () => {
		it('formats zero cost in English', () => {
			const result = formatCost(0, 'en');
			expect(result).toContain('0.00');
		});

		it('formats normal cost in English', () => {
			const result = formatCost(1.23, 'en');
			expect(result).toContain('1.23');
		});

		it('formats sub-penny amounts with < prefix', () => {
			const result = formatCost(0.005, 'en');
			expect(result).toContain('<');
			expect(result).toContain('0.01');
		});

		it('formats cost in German locale with comma separator', () => {
			const result = formatCost(1.23, 'de');
			// German typically formats as "1,23 $"
			expect(result).toContain('1,23');
		});

		it('formats cost in French locale', () => {
			const result = formatCost(1.23, 'fr');
			// French uses comma and may put currency after number
			expect(result).toContain('1,23');
		});

		it('formats cost in Chinese locale', () => {
			const result = formatCost(1.23, 'zh');
			// Chinese uses period as decimal separator
			expect(result).toContain('1.23');
		});
	});

	describe('formatTokens', () => {
		it('returns raw number for small token counts', () => {
			expect(formatTokens(500, 'en')).toBe('500');
		});

		it('formats large token counts with ~ prefix in English', () => {
			const result = formatTokens(1500, 'en');
			expect(result).toMatch(/^~/);
			expect(result).toMatch(/[12]K/i);
		});

		it('formats tokens in German locale', () => {
			const result = formatTokens(1500, 'de');
			expect(result).toMatch(/^~/);
		});

		it('formats tokens in Chinese locale', () => {
			const result = formatTokens(1500, 'zh');
			expect(result).toMatch(/^~/);
		});

		it('formats tokens in Arabic locale', () => {
			const result = formatTokens(1500, 'ar');
			expect(result).toMatch(/^~/);
		});
	});

	describe('formatRelativeTime', () => {
		beforeEach(() => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date('2026-03-13T12:00:00Z'));
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it('formats "now" for recent timestamps in English', () => {
			const result = formatRelativeTime(Date.now() - 10000, 'en'); // 10 seconds ago
			// Should be something like "this second" or "now"
			expect(result).toBeTruthy();
			expect(typeof result).toBe('string');
		});

		it('formats minutes ago in English', () => {
			const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
			const result = formatRelativeTime(fiveMinutesAgo, 'en');
			expect(result).toContain('5');
			expect(result.toLowerCase()).toContain('minute');
		});

		it('formats minutes ago in Spanish', () => {
			const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
			const result = formatRelativeTime(fiveMinutesAgo, 'es');
			expect(result).toContain('5');
			// Spanish: "hace 5 minutos"
			expect(result.toLowerCase()).toContain('minuto');
		});

		it('formats hours ago in English', () => {
			const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
			const result = formatRelativeTime(twoHoursAgo, 'en');
			expect(result).toContain('2');
			expect(result.toLowerCase()).toContain('hour');
		});

		it('formats hours ago in Chinese', () => {
			const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
			const result = formatRelativeTime(twoHoursAgo, 'zh');
			expect(result).toBeTruthy();
			// Chinese: "2小时前"
			expect(result).toContain('2');
		});

		it('formats days ago in German', () => {
			const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
			const result = formatRelativeTime(threeDaysAgo, 'de');
			expect(result).toBeTruthy();
			expect(result).toContain('3');
		});

		it('falls back to formatted date for older timestamps', () => {
			const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
			const result = formatRelativeTime(twoWeeksAgo, 'en');
			// Should be a date string like "Feb 27"
			expect(result).toBeTruthy();
			expect(typeof result).toBe('string');
		});

		it('accepts Date objects', () => {
			const date = new Date(Date.now() - 5 * 60 * 1000);
			const result = formatRelativeTime(date, 'en');
			expect(result).toContain('5');
		});

		it('accepts ISO date strings', () => {
			const isoString = new Date(Date.now() - 5 * 60 * 1000).toISOString();
			const result = formatRelativeTime(isoString, 'en');
			expect(result).toContain('5');
		});
	});
});
