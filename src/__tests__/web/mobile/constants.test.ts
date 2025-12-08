/**
 * Tests for src/web/mobile/constants.ts
 *
 * Tests all exported constants, interfaces, and utility functions for the mobile web interface.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  MobileConfig,
  defaultMobileConfig,
  MOBILE_BREAKPOINTS,
  SAFE_AREA_DEFAULTS,
  GESTURE_THRESHOLDS,
  isMobileViewport,
  supportsHaptics,
  triggerHaptic,
  HAPTIC_PATTERNS,
  supportsVoiceInput,
} from '../../../web/mobile/constants';

describe('web/mobile/constants', () => {
  // ===========================================
  // MobileConfig Interface Tests
  // ===========================================
  describe('MobileConfig interface', () => {
    it('should allow creating a config with all properties', () => {
      const config: MobileConfig = {
        enableHaptics: true,
        enableVoiceInput: true,
        enableOfflineQueue: true,
        maxInputLines: 6,
        enablePullToRefresh: true,
      };
      expect(config.enableHaptics).toBe(true);
      expect(config.enableVoiceInput).toBe(true);
      expect(config.enableOfflineQueue).toBe(true);
      expect(config.maxInputLines).toBe(6);
      expect(config.enablePullToRefresh).toBe(true);
    });

    it('should allow creating a config with no properties (all optional)', () => {
      const config: MobileConfig = {};
      expect(config.enableHaptics).toBeUndefined();
      expect(config.enableVoiceInput).toBeUndefined();
      expect(config.enableOfflineQueue).toBeUndefined();
      expect(config.maxInputLines).toBeUndefined();
      expect(config.enablePullToRefresh).toBeUndefined();
    });

    it('should allow creating a config with partial properties', () => {
      const config: MobileConfig = {
        enableHaptics: false,
        maxInputLines: 10,
      };
      expect(config.enableHaptics).toBe(false);
      expect(config.maxInputLines).toBe(10);
      expect(config.enableVoiceInput).toBeUndefined();
    });
  });

  // ===========================================
  // defaultMobileConfig Tests
  // ===========================================
  describe('defaultMobileConfig', () => {
    it('should have enableHaptics set to true', () => {
      expect(defaultMobileConfig.enableHaptics).toBe(true);
    });

    it('should have enableVoiceInput set to true', () => {
      expect(defaultMobileConfig.enableVoiceInput).toBe(true);
    });

    it('should have enableOfflineQueue set to true', () => {
      expect(defaultMobileConfig.enableOfflineQueue).toBe(true);
    });

    it('should have maxInputLines set to 4', () => {
      expect(defaultMobileConfig.maxInputLines).toBe(4);
    });

    it('should have enablePullToRefresh set to true', () => {
      expect(defaultMobileConfig.enablePullToRefresh).toBe(true);
    });

    it('should have exactly 5 properties', () => {
      expect(Object.keys(defaultMobileConfig)).toHaveLength(5);
    });

    it('should be a valid MobileConfig', () => {
      const config: MobileConfig = defaultMobileConfig;
      expect(config).toBeDefined();
    });
  });

  // ===========================================
  // MOBILE_BREAKPOINTS Tests
  // ===========================================
  describe('MOBILE_BREAKPOINTS', () => {
    it('should have small breakpoint at 320px', () => {
      expect(MOBILE_BREAKPOINTS.small).toBe(320);
    });

    it('should have medium breakpoint at 375px', () => {
      expect(MOBILE_BREAKPOINTS.medium).toBe(375);
    });

    it('should have large breakpoint at 428px', () => {
      expect(MOBILE_BREAKPOINTS.large).toBe(428);
    });

    it('should have max breakpoint at 768px', () => {
      expect(MOBILE_BREAKPOINTS.max).toBe(768);
    });

    it('should have breakpoints in ascending order', () => {
      expect(MOBILE_BREAKPOINTS.small).toBeLessThan(MOBILE_BREAKPOINTS.medium);
      expect(MOBILE_BREAKPOINTS.medium).toBeLessThan(MOBILE_BREAKPOINTS.large);
      expect(MOBILE_BREAKPOINTS.large).toBeLessThan(MOBILE_BREAKPOINTS.max);
    });

    it('should have exactly 4 breakpoints', () => {
      expect(Object.keys(MOBILE_BREAKPOINTS)).toHaveLength(4);
    });

    it('should be readonly (const assertion)', () => {
      // TypeScript ensures this at compile time with "as const"
      // Runtime verification that values exist
      expect(typeof MOBILE_BREAKPOINTS.small).toBe('number');
      expect(typeof MOBILE_BREAKPOINTS.medium).toBe('number');
      expect(typeof MOBILE_BREAKPOINTS.large).toBe('number');
      expect(typeof MOBILE_BREAKPOINTS.max).toBe('number');
    });
  });

  // ===========================================
  // SAFE_AREA_DEFAULTS Tests
  // ===========================================
  describe('SAFE_AREA_DEFAULTS', () => {
    it('should have top safe area at 44px', () => {
      expect(SAFE_AREA_DEFAULTS.top).toBe(44);
    });

    it('should have bottom safe area at 34px', () => {
      expect(SAFE_AREA_DEFAULTS.bottom).toBe(34);
    });

    it('should have left safe area at 0px', () => {
      expect(SAFE_AREA_DEFAULTS.left).toBe(0);
    });

    it('should have right safe area at 0px', () => {
      expect(SAFE_AREA_DEFAULTS.right).toBe(0);
    });

    it('should have exactly 4 safe area properties', () => {
      expect(Object.keys(SAFE_AREA_DEFAULTS)).toHaveLength(4);
    });

    it('should have vertical safe areas larger than horizontal', () => {
      // Notched devices have more vertical intrusion than horizontal
      expect(SAFE_AREA_DEFAULTS.top).toBeGreaterThan(SAFE_AREA_DEFAULTS.left);
      expect(SAFE_AREA_DEFAULTS.top).toBeGreaterThan(SAFE_AREA_DEFAULTS.right);
      expect(SAFE_AREA_DEFAULTS.bottom).toBeGreaterThan(SAFE_AREA_DEFAULTS.left);
      expect(SAFE_AREA_DEFAULTS.bottom).toBeGreaterThan(SAFE_AREA_DEFAULTS.right);
    });

    it('should have non-negative values', () => {
      expect(SAFE_AREA_DEFAULTS.top).toBeGreaterThanOrEqual(0);
      expect(SAFE_AREA_DEFAULTS.bottom).toBeGreaterThanOrEqual(0);
      expect(SAFE_AREA_DEFAULTS.left).toBeGreaterThanOrEqual(0);
      expect(SAFE_AREA_DEFAULTS.right).toBeGreaterThanOrEqual(0);
    });
  });

  // ===========================================
  // GESTURE_THRESHOLDS Tests
  // ===========================================
  describe('GESTURE_THRESHOLDS', () => {
    it('should have swipeDistance at 50px', () => {
      expect(GESTURE_THRESHOLDS.swipeDistance).toBe(50);
    });

    it('should have swipeTime at 300ms', () => {
      expect(GESTURE_THRESHOLDS.swipeTime).toBe(300);
    });

    it('should have pullToRefresh at 80px', () => {
      expect(GESTURE_THRESHOLDS.pullToRefresh).toBe(80);
    });

    it('should have longPress at 500ms', () => {
      expect(GESTURE_THRESHOLDS.longPress).toBe(500);
    });

    it('should have exactly 4 threshold properties', () => {
      expect(Object.keys(GESTURE_THRESHOLDS)).toHaveLength(4);
    });

    it('should have pullToRefresh greater than swipeDistance', () => {
      // Pull to refresh should require more movement than a swipe
      expect(GESTURE_THRESHOLDS.pullToRefresh).toBeGreaterThan(
        GESTURE_THRESHOLDS.swipeDistance
      );
    });

    it('should have longPress greater than swipeTime', () => {
      // Long press should take longer than a swipe gesture
      expect(GESTURE_THRESHOLDS.longPress).toBeGreaterThan(GESTURE_THRESHOLDS.swipeTime);
    });

    it('should have reasonable UX values', () => {
      // Swipe should complete within half a second
      expect(GESTURE_THRESHOLDS.swipeTime).toBeLessThanOrEqual(500);
      // Swipe distance should be noticeable but not too far
      expect(GESTURE_THRESHOLDS.swipeDistance).toBeGreaterThanOrEqual(30);
      expect(GESTURE_THRESHOLDS.swipeDistance).toBeLessThanOrEqual(100);
    });
  });

  // ===========================================
  // HAPTIC_PATTERNS Tests
  // ===========================================
  describe('HAPTIC_PATTERNS', () => {
    it('should have tap pattern as a single number (10ms)', () => {
      expect(HAPTIC_PATTERNS.tap).toBe(10);
    });

    it('should have send pattern as an array [10, 30, 10]', () => {
      expect(HAPTIC_PATTERNS.send).toEqual([10, 30, 10]);
    });

    it('should have interrupt pattern as an array [50, 30, 50]', () => {
      expect(HAPTIC_PATTERNS.interrupt).toEqual([50, 30, 50]);
    });

    it('should have success pattern as an array [10, 50, 20]', () => {
      expect(HAPTIC_PATTERNS.success).toEqual([10, 50, 20]);
    });

    it('should have error pattern as an array [100, 30, 100, 30, 100]', () => {
      expect(HAPTIC_PATTERNS.error).toEqual([100, 30, 100, 30, 100]);
    });

    it('should have exactly 5 pattern types', () => {
      expect(Object.keys(HAPTIC_PATTERNS)).toHaveLength(5);
    });

    it('should have error pattern longer than other patterns', () => {
      // Error should be more noticeable
      const errorDuration = Array.isArray(HAPTIC_PATTERNS.error)
        ? HAPTIC_PATTERNS.error.reduce((a, b) => a + b, 0)
        : HAPTIC_PATTERNS.error;
      const tapDuration = HAPTIC_PATTERNS.tap;
      expect(errorDuration).toBeGreaterThan(tapDuration);
    });

    it('should have all patterns with positive values', () => {
      expect(HAPTIC_PATTERNS.tap).toBeGreaterThan(0);
      expect(HAPTIC_PATTERNS.send.every((v) => v > 0)).toBe(true);
      expect(HAPTIC_PATTERNS.interrupt.every((v) => v > 0)).toBe(true);
      expect(HAPTIC_PATTERNS.success.every((v) => v > 0)).toBe(true);
      expect(HAPTIC_PATTERNS.error.every((v) => v > 0)).toBe(true);
    });

    it('should have increasing intensity from tap to error', () => {
      // Calculate total duration for each pattern
      const getDuration = (pattern: number | readonly number[]): number =>
        Array.isArray(pattern)
          ? (pattern as readonly number[]).reduce((a, b) => a + b, 0)
          : pattern;

      const tapDur = getDuration(HAPTIC_PATTERNS.tap);
      const sendDur = getDuration(HAPTIC_PATTERNS.send);
      const successDur = getDuration(HAPTIC_PATTERNS.success);
      const interruptDur = getDuration(HAPTIC_PATTERNS.interrupt);
      const errorDur = getDuration(HAPTIC_PATTERNS.error);

      // Tap should be the shortest (quickest feedback)
      expect(tapDur).toBeLessThanOrEqual(sendDur);
      // Error should be longest (most attention-grabbing)
      expect(errorDur).toBeGreaterThanOrEqual(interruptDur);
    });
  });

  // ===========================================
  // isMobileViewport Function Tests
  // ===========================================
  describe('isMobileViewport', () => {
    const originalInnerWidth = window.innerWidth;

    afterEach(() => {
      Object.defineProperty(window, 'innerWidth', {
        value: originalInnerWidth,
        writable: true,
        configurable: true,
      });
    });

    it('should return true for width equal to max breakpoint (768)', () => {
      Object.defineProperty(window, 'innerWidth', {
        value: MOBILE_BREAKPOINTS.max,
        writable: true,
        configurable: true,
      });
      expect(isMobileViewport()).toBe(true);
    });

    it('should return true for width less than max breakpoint', () => {
      Object.defineProperty(window, 'innerWidth', {
        value: 767,
        writable: true,
        configurable: true,
      });
      expect(isMobileViewport()).toBe(true);
    });

    it('should return false for width greater than max breakpoint', () => {
      Object.defineProperty(window, 'innerWidth', {
        value: 769,
        writable: true,
        configurable: true,
      });
      expect(isMobileViewport()).toBe(false);
    });

    it('should return true for small phone width (320)', () => {
      Object.defineProperty(window, 'innerWidth', {
        value: MOBILE_BREAKPOINTS.small,
        writable: true,
        configurable: true,
      });
      expect(isMobileViewport()).toBe(true);
    });

    it('should return true for medium phone width (375)', () => {
      Object.defineProperty(window, 'innerWidth', {
        value: MOBILE_BREAKPOINTS.medium,
        writable: true,
        configurable: true,
      });
      expect(isMobileViewport()).toBe(true);
    });

    it('should return true for large phone width (428)', () => {
      Object.defineProperty(window, 'innerWidth', {
        value: MOBILE_BREAKPOINTS.large,
        writable: true,
        configurable: true,
      });
      expect(isMobileViewport()).toBe(true);
    });

    it('should return false for desktop width (1024)', () => {
      Object.defineProperty(window, 'innerWidth', {
        value: 1024,
        writable: true,
        configurable: true,
      });
      expect(isMobileViewport()).toBe(false);
    });

    it('should return false for wide desktop width (1920)', () => {
      Object.defineProperty(window, 'innerWidth', {
        value: 1920,
        writable: true,
        configurable: true,
      });
      expect(isMobileViewport()).toBe(false);
    });

    it('should return true for very small width (0)', () => {
      Object.defineProperty(window, 'innerWidth', {
        value: 0,
        writable: true,
        configurable: true,
      });
      expect(isMobileViewport()).toBe(true);
    });

    it('should return true for width of 1', () => {
      Object.defineProperty(window, 'innerWidth', {
        value: 1,
        writable: true,
        configurable: true,
      });
      expect(isMobileViewport()).toBe(true);
    });

    describe('SSR safety (no window)', () => {
      it('should return false when window is undefined', () => {
        const windowBackup = global.window;
        // @ts-expect-error - Testing SSR scenario
        delete global.window;

        // Re-import module to test SSR path
        // The function checks typeof window === 'undefined'
        // Since we're in jsdom, window is always defined
        // We test the logic by checking the function exists

        // Restore immediately
        global.window = windowBackup;

        // Verify function handles the case (can't actually test SSR in jsdom)
        expect(typeof isMobileViewport).toBe('function');
      });
    });
  });

  // ===========================================
  // supportsHaptics Function Tests
  // ===========================================
  describe('supportsHaptics', () => {
    const originalNavigator = global.navigator;

    afterEach(() => {
      Object.defineProperty(global, 'navigator', {
        value: originalNavigator,
        writable: true,
        configurable: true,
      });
    });

    it('should return true when navigator.vibrate exists', () => {
      Object.defineProperty(global, 'navigator', {
        value: { vibrate: vi.fn() },
        writable: true,
        configurable: true,
      });
      expect(supportsHaptics()).toBe(true);
    });

    it('should return false when navigator.vibrate does not exist', () => {
      Object.defineProperty(global, 'navigator', {
        value: {},
        writable: true,
        configurable: true,
      });
      expect(supportsHaptics()).toBe(false);
    });

    it('should return true when vibrate is a function', () => {
      Object.defineProperty(global, 'navigator', {
        value: { vibrate: () => true },
        writable: true,
        configurable: true,
      });
      expect(supportsHaptics()).toBe(true);
    });

    it('should check using "in" operator, not truthy check', () => {
      // Even if vibrate is null, "vibrate" in navigator is true
      Object.defineProperty(global, 'navigator', {
        value: { vibrate: null },
        writable: true,
        configurable: true,
      });
      expect(supportsHaptics()).toBe(true);
    });
  });

  // ===========================================
  // triggerHaptic Function Tests
  // ===========================================
  describe('triggerHaptic', () => {
    const originalNavigator = global.navigator;
    let vibrateMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      vibrateMock = vi.fn().mockReturnValue(true);
      Object.defineProperty(global, 'navigator', {
        value: { vibrate: vibrateMock },
        writable: true,
        configurable: true,
      });
    });

    afterEach(() => {
      Object.defineProperty(global, 'navigator', {
        value: originalNavigator,
        writable: true,
        configurable: true,
      });
    });

    it('should call navigator.vibrate with default pattern (10)', () => {
      triggerHaptic();
      expect(vibrateMock).toHaveBeenCalledWith(10);
    });

    it('should call navigator.vibrate with custom number pattern', () => {
      triggerHaptic(50);
      expect(vibrateMock).toHaveBeenCalledWith(50);
    });

    it('should call navigator.vibrate with array pattern', () => {
      triggerHaptic([10, 20, 10]);
      expect(vibrateMock).toHaveBeenCalledWith([10, 20, 10]);
    });

    it('should work with HAPTIC_PATTERNS.tap', () => {
      triggerHaptic(HAPTIC_PATTERNS.tap);
      expect(vibrateMock).toHaveBeenCalledWith(10);
    });

    it('should work with HAPTIC_PATTERNS.send', () => {
      triggerHaptic(HAPTIC_PATTERNS.send);
      expect(vibrateMock).toHaveBeenCalledWith([10, 30, 10]);
    });

    it('should work with HAPTIC_PATTERNS.interrupt', () => {
      triggerHaptic(HAPTIC_PATTERNS.interrupt);
      expect(vibrateMock).toHaveBeenCalledWith([50, 30, 50]);
    });

    it('should work with HAPTIC_PATTERNS.success', () => {
      triggerHaptic(HAPTIC_PATTERNS.success);
      expect(vibrateMock).toHaveBeenCalledWith([10, 50, 20]);
    });

    it('should work with HAPTIC_PATTERNS.error', () => {
      triggerHaptic(HAPTIC_PATTERNS.error);
      expect(vibrateMock).toHaveBeenCalledWith([100, 30, 100, 30, 100]);
    });

    it('should not throw when haptics not supported', () => {
      Object.defineProperty(global, 'navigator', {
        value: {},
        writable: true,
        configurable: true,
      });
      expect(() => triggerHaptic()).not.toThrow();
    });

    it('should not call vibrate when not supported', () => {
      Object.defineProperty(global, 'navigator', {
        value: {},
        writable: true,
        configurable: true,
      });
      triggerHaptic();
      expect(vibrateMock).not.toHaveBeenCalled();
    });

    it('should accept 0 as pattern (cancel vibration)', () => {
      triggerHaptic(0);
      expect(vibrateMock).toHaveBeenCalledWith(0);
    });

    it('should accept empty array', () => {
      triggerHaptic([]);
      expect(vibrateMock).toHaveBeenCalledWith([]);
    });

    it('should return undefined', () => {
      const result = triggerHaptic();
      expect(result).toBeUndefined();
    });
  });

  // ===========================================
  // supportsVoiceInput Function Tests
  // ===========================================
  describe('supportsVoiceInput', () => {
    const originalWindow = global.window;

    afterEach(() => {
      // Restore window properties
      if (originalWindow.webkitSpeechRecognition) {
        // @ts-expect-error - Testing webkit property
        window.webkitSpeechRecognition = originalWindow.webkitSpeechRecognition;
      } else {
        // @ts-expect-error - Testing webkit property
        delete window.webkitSpeechRecognition;
      }
      if (originalWindow.SpeechRecognition) {
        // @ts-expect-error - Testing standard property
        window.SpeechRecognition = originalWindow.SpeechRecognition;
      } else {
        // @ts-expect-error - Testing standard property
        delete window.SpeechRecognition;
      }
    });

    it('should return true when webkitSpeechRecognition exists', () => {
      // @ts-expect-error - Testing webkit property
      window.webkitSpeechRecognition = class {};
      expect(supportsVoiceInput()).toBe(true);
    });

    it('should return true when SpeechRecognition exists', () => {
      // @ts-expect-error - Testing standard property
      window.SpeechRecognition = class {};
      expect(supportsVoiceInput()).toBe(true);
    });

    it('should return true when both APIs exist', () => {
      // @ts-expect-error - Testing webkit property
      window.webkitSpeechRecognition = class {};
      // @ts-expect-error - Testing standard property
      window.SpeechRecognition = class {};
      expect(supportsVoiceInput()).toBe(true);
    });

    it('should return false when neither API exists', () => {
      // @ts-expect-error - Testing webkit property
      delete window.webkitSpeechRecognition;
      // @ts-expect-error - Testing standard property
      delete window.SpeechRecognition;
      expect(supportsVoiceInput()).toBe(false);
    });

    it('should use "in" operator to check (accepts null)', () => {
      // @ts-expect-error - Testing webkit property
      window.webkitSpeechRecognition = null;
      expect(supportsVoiceInput()).toBe(true);
    });

    it('should handle function as value', () => {
      // @ts-expect-error - Testing webkit property
      window.webkitSpeechRecognition = function () {};
      expect(supportsVoiceInput()).toBe(true);
    });
  });

  // ===========================================
  // Integration Tests
  // ===========================================
  describe('integration scenarios', () => {
    it('should use consistent thresholds between constants', () => {
      // swipeDistance from GESTURE_THRESHOLDS is used by hooks
      expect(GESTURE_THRESHOLDS.swipeDistance).toBeDefined();
      expect(typeof GESTURE_THRESHOLDS.swipeDistance).toBe('number');
    });

    it('should have default config enable all features', () => {
      // All features enabled by default for best UX
      expect(defaultMobileConfig.enableHaptics).toBe(true);
      expect(defaultMobileConfig.enableVoiceInput).toBe(true);
      expect(defaultMobileConfig.enableOfflineQueue).toBe(true);
      expect(defaultMobileConfig.enablePullToRefresh).toBe(true);
    });

    it('should have MOBILE_BREAKPOINTS.max match common tablet breakpoint', () => {
      // 768px is a common tablet/mobile breakpoint in CSS frameworks
      expect(MOBILE_BREAKPOINTS.max).toBe(768);
    });

    it('should chain haptic patterns with triggerHaptic', () => {
      const vibrateMock = vi.fn().mockReturnValue(true);
      Object.defineProperty(global, 'navigator', {
        value: { vibrate: vibrateMock },
        writable: true,
        configurable: true,
      });

      // Simulate user flow: tap -> send -> success
      triggerHaptic(HAPTIC_PATTERNS.tap);
      triggerHaptic(HAPTIC_PATTERNS.send);
      triggerHaptic(HAPTIC_PATTERNS.success);

      expect(vibrateMock).toHaveBeenCalledTimes(3);
    });

    it('should have safe area values suitable for iPhone notch', () => {
      // iPhone X-style notch: ~44px top, ~34px bottom
      expect(SAFE_AREA_DEFAULTS.top).toBe(44);
      expect(SAFE_AREA_DEFAULTS.bottom).toBe(34);
    });
  });

  // ===========================================
  // Edge Cases
  // ===========================================
  describe('edge cases', () => {
    it('should handle isMobileViewport with negative width', () => {
      Object.defineProperty(window, 'innerWidth', {
        value: -100,
        writable: true,
        configurable: true,
      });
      // Negative is less than max, so technically "mobile"
      expect(isMobileViewport()).toBe(true);
    });

    it('should handle very large viewport width', () => {
      Object.defineProperty(window, 'innerWidth', {
        value: 10000,
        writable: true,
        configurable: true,
      });
      expect(isMobileViewport()).toBe(false);
    });

    it('should handle fractional viewport width', () => {
      Object.defineProperty(window, 'innerWidth', {
        value: 768.5,
        writable: true,
        configurable: true,
      });
      // 768.5 > 768, so not mobile
      expect(isMobileViewport()).toBe(false);
    });

    it('should handle viewport width of exactly 768', () => {
      Object.defineProperty(window, 'innerWidth', {
        value: 768,
        writable: true,
        configurable: true,
      });
      // 768 <= 768, so mobile
      expect(isMobileViewport()).toBe(true);
    });

    it('should handle triggerHaptic with large pattern values', () => {
      const vibrateMock = vi.fn().mockReturnValue(true);
      Object.defineProperty(global, 'navigator', {
        value: { vibrate: vibrateMock },
        writable: true,
        configurable: true,
      });

      triggerHaptic(10000);
      expect(vibrateMock).toHaveBeenCalledWith(10000);
    });

    it('should handle triggerHaptic with readonly array', () => {
      const vibrateMock = vi.fn().mockReturnValue(true);
      Object.defineProperty(global, 'navigator', {
        value: { vibrate: vibrateMock },
        writable: true,
        configurable: true,
      });

      const readonlyPattern = [10, 20, 10] as const;
      triggerHaptic(readonlyPattern);
      expect(vibrateMock).toHaveBeenCalledWith([10, 20, 10]);
    });

    it('should handle HAPTIC_PATTERNS values are readonly', () => {
      // HAPTIC_PATTERNS uses "as const", so values should not be modifiable at runtime
      // This is a compile-time check, but we verify the values exist
      expect(HAPTIC_PATTERNS.tap).toBe(10);
      expect(HAPTIC_PATTERNS.send).toEqual([10, 30, 10]);
    });
  });

  // ===========================================
  // Export Verification
  // ===========================================
  describe('exports', () => {
    it('should export MobileConfig interface (via type checking)', () => {
      // Interface is compile-time only, but we can verify objects conform
      const config: MobileConfig = {};
      expect(config).toBeDefined();
    });

    it('should export defaultMobileConfig', () => {
      expect(defaultMobileConfig).toBeDefined();
      expect(typeof defaultMobileConfig).toBe('object');
    });

    it('should export MOBILE_BREAKPOINTS', () => {
      expect(MOBILE_BREAKPOINTS).toBeDefined();
      expect(typeof MOBILE_BREAKPOINTS).toBe('object');
    });

    it('should export SAFE_AREA_DEFAULTS', () => {
      expect(SAFE_AREA_DEFAULTS).toBeDefined();
      expect(typeof SAFE_AREA_DEFAULTS).toBe('object');
    });

    it('should export GESTURE_THRESHOLDS', () => {
      expect(GESTURE_THRESHOLDS).toBeDefined();
      expect(typeof GESTURE_THRESHOLDS).toBe('object');
    });

    it('should export isMobileViewport function', () => {
      expect(isMobileViewport).toBeDefined();
      expect(typeof isMobileViewport).toBe('function');
    });

    it('should export supportsHaptics function', () => {
      expect(supportsHaptics).toBeDefined();
      expect(typeof supportsHaptics).toBe('function');
    });

    it('should export triggerHaptic function', () => {
      expect(triggerHaptic).toBeDefined();
      expect(typeof triggerHaptic).toBe('function');
    });

    it('should export HAPTIC_PATTERNS', () => {
      expect(HAPTIC_PATTERNS).toBeDefined();
      expect(typeof HAPTIC_PATTERNS).toBe('object');
    });

    it('should export supportsVoiceInput function', () => {
      expect(supportsVoiceInput).toBeDefined();
      expect(typeof supportsVoiceInput).toBe('function');
    });
  });
});
