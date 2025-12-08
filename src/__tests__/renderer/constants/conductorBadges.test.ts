/**
 * @fileoverview Tests for conductorBadges constants and utility functions
 *
 * Tests the achievement badge system including:
 * - CONDUCTOR_BADGES constant validation
 * - getBadgeForTime() - badge lookup by cumulative time
 * - getNextBadge() - next badge progression
 * - getProgressToNextBadge() - progress percentage calculation
 * - formatTimeRemaining() - human-readable time until next badge
 * - formatCumulativeTime() - human-readable duration format
 */

import { describe, it, expect } from 'vitest';
import {
  CONDUCTOR_BADGES,
  getBadgeForTime,
  getNextBadge,
  getProgressToNextBadge,
  formatTimeRemaining,
  formatCumulativeTime,
  type ConductorBadge,
} from '../../../renderer/constants/conductorBadges';

// Time constants for readability
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

describe('conductorBadges', () => {
  describe('CONDUCTOR_BADGES constant', () => {
    it('contains exactly 11 badges', () => {
      expect(CONDUCTOR_BADGES).toHaveLength(11);
    });

    it('has badges in ascending order by level (1-11)', () => {
      const levels = CONDUCTOR_BADGES.map(b => b.level);
      expect(levels).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    });

    it('has badges in ascending order by requiredTimeMs', () => {
      for (let i = 1; i < CONDUCTOR_BADGES.length; i++) {
        expect(CONDUCTOR_BADGES[i].requiredTimeMs).toBeGreaterThan(
          CONDUCTOR_BADGES[i - 1].requiredTimeMs
        );
      }
    });

    it('each badge has all required properties', () => {
      CONDUCTOR_BADGES.forEach(badge => {
        expect(badge).toHaveProperty('id');
        expect(badge).toHaveProperty('level');
        expect(badge).toHaveProperty('name');
        expect(badge).toHaveProperty('shortName');
        expect(badge).toHaveProperty('description');
        expect(badge).toHaveProperty('requiredTimeMs');
        expect(badge).toHaveProperty('exampleConductor');
        expect(badge).toHaveProperty('flavorText');

        // Check exampleConductor sub-properties
        expect(badge.exampleConductor).toHaveProperty('name');
        expect(badge.exampleConductor).toHaveProperty('era');
        expect(badge.exampleConductor).toHaveProperty('achievement');
        expect(badge.exampleConductor).toHaveProperty('wikipediaUrl');

        // Type validations
        expect(typeof badge.id).toBe('string');
        expect(typeof badge.level).toBe('number');
        expect(typeof badge.requiredTimeMs).toBe('number');
        expect(badge.id.length).toBeGreaterThan(0);
      });
    });

    it('level 1 requires 15 minutes', () => {
      expect(CONDUCTOR_BADGES[0].requiredTimeMs).toBe(15 * MINUTE);
    });

    it('level 11 requires 10 years', () => {
      expect(CONDUCTOR_BADGES[10].requiredTimeMs).toBe(10 * YEAR);
    });

    it('each badge has a unique ID', () => {
      const ids = CONDUCTOR_BADGES.map(b => b.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(CONDUCTOR_BADGES.length);
    });

    it('each badge has a unique level', () => {
      const levels = CONDUCTOR_BADGES.map(b => b.level);
      const uniqueLevels = new Set(levels);
      expect(uniqueLevels.size).toBe(CONDUCTOR_BADGES.length);
    });

    it('badge names are meaningful strings', () => {
      CONDUCTOR_BADGES.forEach(badge => {
        expect(badge.name.length).toBeGreaterThan(5);
        expect(badge.shortName.length).toBeGreaterThan(0);
        expect(badge.description.length).toBeGreaterThan(20);
        expect(badge.flavorText.length).toBeGreaterThan(20);
      });
    });

    it('wikipedia URLs are valid HTTP URLs', () => {
      CONDUCTOR_BADGES.forEach(badge => {
        expect(badge.exampleConductor.wikipediaUrl).toMatch(/^https:\/\/en\.wikipedia\.org\/wiki\/.+/);
      });
    });
  });

  describe('getBadgeForTime', () => {
    it('returns null for 0ms', () => {
      expect(getBadgeForTime(0)).toBeNull();
    });

    it('returns null for time below first badge (14 minutes)', () => {
      expect(getBadgeForTime(14 * MINUTE)).toBeNull();
      expect(getBadgeForTime(1 * MINUTE)).toBeNull();
      expect(getBadgeForTime(1000)).toBeNull();
    });

    it('returns level 1 badge at exactly 15 minutes', () => {
      const badge = getBadgeForTime(15 * MINUTE);
      expect(badge).not.toBeNull();
      expect(badge?.level).toBe(1);
      expect(badge?.id).toBe('apprentice-conductor');
    });

    it('returns level 1 badge at 30 minutes (before level 2)', () => {
      const badge = getBadgeForTime(30 * MINUTE);
      expect(badge?.level).toBe(1);
    });

    it('returns level 1 badge at 59 minutes (just before level 2)', () => {
      const badge = getBadgeForTime(59 * MINUTE);
      expect(badge?.level).toBe(1);
    });

    it('returns level 2 badge at exactly 1 hour', () => {
      const badge = getBadgeForTime(1 * HOUR);
      expect(badge?.level).toBe(2);
      expect(badge?.id).toBe('assistant-conductor');
    });

    it('returns highest qualifying badge for various times', () => {
      // Level 3: 8 hours
      expect(getBadgeForTime(8 * HOUR)?.level).toBe(3);

      // Level 4: 24 hours
      expect(getBadgeForTime(1 * DAY)?.level).toBe(4);

      // Level 5: 1 week
      expect(getBadgeForTime(1 * WEEK)?.level).toBe(5);

      // Level 6: 1 month
      expect(getBadgeForTime(1 * MONTH)?.level).toBe(6);

      // Level 7: 3 months
      expect(getBadgeForTime(3 * MONTH)?.level).toBe(7);

      // Level 8: 6 months
      expect(getBadgeForTime(6 * MONTH)?.level).toBe(8);

      // Level 9: 1 year
      expect(getBadgeForTime(1 * YEAR)?.level).toBe(9);

      // Level 10: 5 years
      expect(getBadgeForTime(5 * YEAR)?.level).toBe(10);
    });

    it('returns level 11 for 10+ years', () => {
      const badge = getBadgeForTime(10 * YEAR);
      expect(badge?.level).toBe(11);
      expect(badge?.id).toBe('immortal-maestro');
    });

    it('returns level 11 for times well beyond 10 years', () => {
      expect(getBadgeForTime(20 * YEAR)?.level).toBe(11);
      expect(getBadgeForTime(100 * YEAR)?.level).toBe(11);
    });

    it('returns correct badge at exact boundary times', () => {
      // Test each badge boundary exactly
      CONDUCTOR_BADGES.forEach(badge => {
        const result = getBadgeForTime(badge.requiredTimeMs);
        expect(result?.level).toBe(badge.level);
      });
    });

    it('returns previous badge just below boundary', () => {
      // Just below level 2 boundary
      expect(getBadgeForTime(1 * HOUR - 1)?.level).toBe(1);

      // Just below level 3 boundary
      expect(getBadgeForTime(8 * HOUR - 1)?.level).toBe(2);
    });
  });

  describe('getNextBadge', () => {
    it('returns first badge when currentBadge is null', () => {
      const next = getNextBadge(null);
      expect(next).not.toBeNull();
      expect(next?.level).toBe(1);
      expect(next?.id).toBe('apprentice-conductor');
    });

    it('returns level 2 for level 1 badge', () => {
      const level1 = CONDUCTOR_BADGES[0];
      const next = getNextBadge(level1);
      expect(next?.level).toBe(2);
    });

    it('returns correct next badge for each level', () => {
      for (let i = 0; i < CONDUCTOR_BADGES.length - 1; i++) {
        const current = CONDUCTOR_BADGES[i];
        const expected = CONDUCTOR_BADGES[i + 1];
        const next = getNextBadge(current);
        expect(next?.id).toBe(expected.id);
        expect(next?.level).toBe(expected.level);
      }
    });

    it('returns null for last badge (level 11)', () => {
      const lastBadge = CONDUCTOR_BADGES[10];
      expect(lastBadge.level).toBe(11); // Verify we have the right badge
      expect(getNextBadge(lastBadge)).toBeNull();
    });

    it('returns null for badge with unknown ID', () => {
      const unknownBadge: ConductorBadge = {
        id: 'unknown-badge',
        level: 99,
        name: 'Unknown',
        shortName: 'Unknown',
        description: 'Test badge',
        requiredTimeMs: 0,
        exampleConductor: {
          name: 'Test',
          era: 'Test',
          achievement: 'Test',
          wikipediaUrl: 'https://example.com',
        },
        flavorText: 'Test',
      };
      expect(getNextBadge(unknownBadge)).toBeNull();
    });
  });

  describe('getProgressToNextBadge', () => {
    it('returns 100 when nextBadge is null (at max level)', () => {
      const lastBadge = CONDUCTOR_BADGES[10];
      expect(getProgressToNextBadge(10 * YEAR, lastBadge, null)).toBe(100);
    });

    it('returns 100 when nextBadge is null regardless of time', () => {
      expect(getProgressToNextBadge(0, null, null)).toBe(100);
      expect(getProgressToNextBadge(999 * YEAR, CONDUCTOR_BADGES[10], null)).toBe(100);
    });

    it('returns 0% at start of range (no badge to first badge)', () => {
      const nextBadge = CONDUCTOR_BADGES[0]; // 15 minutes
      const progress = getProgressToNextBadge(0, null, nextBadge);
      expect(progress).toBe(0);
    });

    it('returns near 0% just after previous badge', () => {
      const current = CONDUCTOR_BADGES[0]; // 15 min
      const next = CONDUCTOR_BADGES[1]; // 1 hour
      const progress = getProgressToNextBadge(15 * MINUTE, current, next);
      expect(progress).toBe(0);
    });

    it('returns 50% at midpoint', () => {
      // From 0 to 15 minutes, midpoint is 7.5 minutes
      const nextBadge = CONDUCTOR_BADGES[0]; // 15 minutes
      const progress = getProgressToNextBadge(7.5 * MINUTE, null, nextBadge);
      expect(progress).toBe(50);
    });

    it('returns 50% at midpoint between badges', () => {
      const current = CONDUCTOR_BADGES[0]; // 15 min = 900,000ms
      const next = CONDUCTOR_BADGES[1]; // 1 hour = 3,600,000ms
      // Range is 2,700,000ms, midpoint is 15min + 1,350,000ms = 2,250,000ms
      const midpoint = current.requiredTimeMs + (next.requiredTimeMs - current.requiredTimeMs) / 2;
      const progress = getProgressToNextBadge(midpoint, current, next);
      expect(progress).toBe(50);
    });

    it('returns near 100% at end of range', () => {
      const current = CONDUCTOR_BADGES[0]; // 15 min
      const next = CONDUCTOR_BADGES[1]; // 1 hour
      const almostThere = next.requiredTimeMs - 1;
      const progress = getProgressToNextBadge(almostThere, current, next);
      expect(progress).toBeGreaterThan(99);
      expect(progress).toBeLessThan(100);
    });

    it('returns 100 when time exceeds next badge requirement', () => {
      const current = CONDUCTOR_BADGES[0];
      const next = CONDUCTOR_BADGES[1];
      const progress = getProgressToNextBadge(2 * HOUR, current, next);
      expect(progress).toBe(100);
    });

    it('returns 100 when range is negative (invalid badge order)', () => {
      // Edge case: if currentBadge is higher than nextBadge (shouldn't happen but tests defensive code)
      const next = CONDUCTOR_BADGES[1]; // 1 hour
      const current = CONDUCTOR_BADGES[5]; // 30 days (higher)
      // Range becomes negative, returns 100 as defensive behavior
      const progress = getProgressToNextBadge(0, current, next);
      expect(progress).toBe(100);
    });

    it('clamps to 0 when time is below startTime', () => {
      // Time is 0 but current badge requires 15 minutes
      // This creates negative progress which should clamp to 0
      const current = CONDUCTOR_BADGES[0]; // 15 min
      const next = CONDUCTOR_BADGES[1]; // 1 hour
      // With time=0, startTime=15min, progress = (0 - 15min) / range = negative
      const progress = getProgressToNextBadge(0, current, next);
      expect(progress).toBe(0);
    });

    it('handles progress from level 10 to level 11', () => {
      const current = CONDUCTOR_BADGES[9]; // 5 years
      const next = CONDUCTOR_BADGES[10]; // 10 years
      // At 7.5 years (midpoint)
      const midpoint = (5 * YEAR + 10 * YEAR) / 2;
      const progress = getProgressToNextBadge(midpoint, current, next);
      expect(Math.round(progress)).toBe(50);
    });
  });

  describe('formatTimeRemaining', () => {
    it('returns "Maximum level achieved!" when nextBadge is null', () => {
      expect(formatTimeRemaining(10 * YEAR, null)).toBe('Maximum level achieved!');
      expect(formatTimeRemaining(0, null)).toBe('Maximum level achieved!');
    });

    it('returns "Ready to unlock!" when remaining <= 0', () => {
      const nextBadge = CONDUCTOR_BADGES[0]; // 15 minutes
      expect(formatTimeRemaining(15 * MINUTE, nextBadge)).toBe('Ready to unlock!');
      expect(formatTimeRemaining(20 * MINUTE, nextBadge)).toBe('Ready to unlock!');
      expect(formatTimeRemaining(1 * HOUR, nextBadge)).toBe('Ready to unlock!');
    });

    it('formats years+days for multi-year remaining time', () => {
      const nextBadge = CONDUCTOR_BADGES[10]; // 10 years
      const result = formatTimeRemaining(0, nextBadge);
      expect(result).toMatch(/^\d+y \d+d remaining$/);
    });

    it('formats months+days for 1-11 months remaining', () => {
      const nextBadge = CONDUCTOR_BADGES[6]; // 3 months
      const result = formatTimeRemaining(0, nextBadge);
      expect(result).toMatch(/^\d+mo \d+d remaining$/);
    });

    it('formats days+hours for 1-30 days remaining', () => {
      const nextBadge = CONDUCTOR_BADGES[4]; // 1 week
      const result = formatTimeRemaining(0, nextBadge);
      expect(result).toMatch(/^\d+d \d+h remaining$/);
    });

    it('formats hours+minutes for 1-23 hours remaining', () => {
      const nextBadge = CONDUCTOR_BADGES[2]; // 8 hours
      const result = formatTimeRemaining(0, nextBadge);
      expect(result).toMatch(/^\d+h \d+m remaining$/);
    });

    it('formats minutes only for < 1 hour remaining', () => {
      const nextBadge = CONDUCTOR_BADGES[0]; // 15 minutes
      const result = formatTimeRemaining(0, nextBadge);
      expect(result).toMatch(/^\d+m remaining$/);
    });

    it('calculates correct remaining time', () => {
      const nextBadge = CONDUCTOR_BADGES[1]; // 1 hour
      const currentTime = 30 * MINUTE; // 30 minutes
      const result = formatTimeRemaining(currentTime, nextBadge);
      expect(result).toBe('30m remaining');
    });

    it('handles edge case of exactly 1 day remaining', () => {
      const nextBadge: ConductorBadge = {
        ...CONDUCTOR_BADGES[0],
        requiredTimeMs: 1 * DAY,
      };
      const result = formatTimeRemaining(0, nextBadge);
      expect(result).toBe('1d 0h remaining');
    });

    it('handles edge case of exactly 1 year remaining', () => {
      const nextBadge: ConductorBadge = {
        ...CONDUCTOR_BADGES[0],
        requiredTimeMs: 1 * YEAR,
      };
      const result = formatTimeRemaining(0, nextBadge);
      expect(result).toBe('1y 0d remaining');
    });
  });

  describe('formatCumulativeTime', () => {
    it('formats seconds only for < 1 minute', () => {
      expect(formatCumulativeTime(0)).toBe('0s');
      expect(formatCumulativeTime(1 * SECOND)).toBe('1s');
      expect(formatCumulativeTime(30 * SECOND)).toBe('30s');
      expect(formatCumulativeTime(59 * SECOND)).toBe('59s');
    });

    it('formats minutes+seconds for 1-59 minutes', () => {
      expect(formatCumulativeTime(1 * MINUTE)).toBe('1m 0s');
      expect(formatCumulativeTime(1 * MINUTE + 30 * SECOND)).toBe('1m 30s');
      expect(formatCumulativeTime(59 * MINUTE + 59 * SECOND)).toBe('59m 59s');
    });

    it('formats hours+minutes for 1-23 hours', () => {
      expect(formatCumulativeTime(1 * HOUR)).toBe('1h 0m');
      expect(formatCumulativeTime(1 * HOUR + 30 * MINUTE)).toBe('1h 30m');
      expect(formatCumulativeTime(23 * HOUR + 59 * MINUTE)).toBe('23h 59m');
    });

    it('formats days+hours+minutes for 1-364 days', () => {
      expect(formatCumulativeTime(1 * DAY)).toBe('1d 0h 0m');
      expect(formatCumulativeTime(1 * DAY + 12 * HOUR + 30 * MINUTE)).toBe('1d 12h 30m');
      expect(formatCumulativeTime(364 * DAY)).toBe('364d 0h 0m');
    });

    it('formats years+days for 365+ days', () => {
      expect(formatCumulativeTime(365 * DAY)).toBe('1y 0d');
      expect(formatCumulativeTime(1 * YEAR + 100 * DAY)).toBe('1y 100d');
      expect(formatCumulativeTime(10 * YEAR)).toBe('10y 0d');
      expect(formatCumulativeTime(10 * YEAR + 180 * DAY)).toBe('10y 180d');
    });

    it('handles boundary values correctly', () => {
      // Just under 1 minute
      expect(formatCumulativeTime(59 * SECOND + 999)).toBe('59s');

      // Exactly 1 minute
      expect(formatCumulativeTime(60 * SECOND)).toBe('1m 0s');

      // Just under 1 hour
      expect(formatCumulativeTime(59 * MINUTE + 59 * SECOND)).toBe('59m 59s');

      // Exactly 1 hour
      expect(formatCumulativeTime(60 * MINUTE)).toBe('1h 0m');
    });

    it('truncates partial seconds', () => {
      expect(formatCumulativeTime(1500)).toBe('1s'); // 1.5 seconds
      expect(formatCumulativeTime(999)).toBe('0s'); // Less than 1 second
    });
  });

  describe('badge progression integration', () => {
    it('correctly tracks full progression from 0 to max', () => {
      // Start with no time
      expect(getBadgeForTime(0)).toBeNull();
      expect(getNextBadge(null)?.level).toBe(1);

      // After reaching level 1
      const level1 = getBadgeForTime(15 * MINUTE);
      expect(level1?.level).toBe(1);
      expect(getNextBadge(level1)?.level).toBe(2);

      // After reaching max level
      const maxLevel = getBadgeForTime(10 * YEAR);
      expect(maxLevel?.level).toBe(11);
      expect(getNextBadge(maxLevel)).toBeNull();
    });

    it('progress increases as time accumulates', () => {
      const next = CONDUCTOR_BADGES[0]; // 15 minutes

      // Progress should increase linearly
      const progress0 = getProgressToNextBadge(0, null, next);
      const progress5 = getProgressToNextBadge(5 * MINUTE, null, next);
      const progress10 = getProgressToNextBadge(10 * MINUTE, null, next);
      const progress15 = getProgressToNextBadge(15 * MINUTE, null, next);

      expect(progress0).toBe(0);
      expect(progress5).toBeGreaterThan(progress0);
      expect(progress10).toBeGreaterThan(progress5);
      expect(progress15).toBe(100);
    });
  });
});
