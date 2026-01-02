/**
 * Tests for src/main/slash-commands/ios-swipe.ts
 *
 * Tests cover direction parsing, target parsing, velocity parsing, argument parsing,
 * command execution, and error handling for the /ios.swipe slash command.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  parseSwipeDirection,
  parseSwipeTarget,
  parseVelocity,
  parseSwipeArgs,
  executeSwipeCommand,
  swipeCommandMetadata,
  type SwipeTarget,
  type SwipeCommandArgs,
  type SwipeDirection,
} from '../../../main/slash-commands/ios-swipe';

// Mock ios-tools module
vi.mock('../../../main/ios-tools', () => ({
  getBootedSimulators: vi.fn(),
  listSimulators: vi.fn(),
}));

// Mock native-driver module - use function syntax for class mock
const mockExecute = vi.fn();
vi.mock('../../../main/ios-tools/native-driver', () => {
  return {
    NativeDriver: vi.fn().mockImplementation(function () {
      return {
        execute: mockExecute,
      };
    }),
    byId: vi.fn((id) => ({ type: 'identifier', value: id })),
    byLabel: vi.fn((label) => ({ type: 'label', value: label })),
    swipe: vi.fn((direction, options) => ({ type: 'swipe', direction, options })),
  };
});

// Mock logger
vi.mock('../../../main/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Get mocked functions
import * as iosTools from '../../../main/ios-tools';
import { NativeDriver } from '../../../main/ios-tools/native-driver';

const mockGetBootedSimulators = vi.mocked(iosTools.getBootedSimulators);
const mockListSimulators = vi.mocked(iosTools.listSimulators);
const MockNativeDriver = vi.mocked(NativeDriver);

// Reset mockExecute for each test
const getMockExecute = () => mockExecute;

// =============================================================================
// Test Fixtures
// =============================================================================

function createMockActionResult(success = true) {
  return {
    success,
    status: success ? 'success' : 'failed',
    actionType: 'swipe',
    duration: 150,
    error: success ? undefined : 'Element not found',
    details: success
      ? {
          element: {
            type: 'View',
            identifier: 'carousel',
            isEnabled: true,
            isHittable: true,
            frame: { x: 0, y: 100, width: 390, height: 300 },
          },
          direction: 'left',
        }
      : {
          suggestions: ['carousel_view', 'image_carousel'],
        },
    timestamp: new Date().toISOString(),
  };
}

// =============================================================================
// parseSwipeDirection
// =============================================================================

describe('parseSwipeDirection', () => {
  describe('empty/invalid input', () => {
    it('returns null for empty string', () => {
      expect(parseSwipeDirection('')).toBeNull();
    });

    it('returns null for whitespace-only string', () => {
      expect(parseSwipeDirection('   ')).toBeNull();
    });

    it('returns null for invalid direction', () => {
      expect(parseSwipeDirection('diagonal')).toBeNull();
    });

    it('returns null for numbers', () => {
      expect(parseSwipeDirection('123')).toBeNull();
    });
  });

  describe('full direction names', () => {
    it('parses "up"', () => {
      expect(parseSwipeDirection('up')).toBe('up');
    });

    it('parses "down"', () => {
      expect(parseSwipeDirection('down')).toBe('down');
    });

    it('parses "left"', () => {
      expect(parseSwipeDirection('left')).toBe('left');
    });

    it('parses "right"', () => {
      expect(parseSwipeDirection('right')).toBe('right');
    });

    it('parses uppercase', () => {
      expect(parseSwipeDirection('UP')).toBe('up');
      expect(parseSwipeDirection('DOWN')).toBe('down');
      expect(parseSwipeDirection('LEFT')).toBe('left');
      expect(parseSwipeDirection('RIGHT')).toBe('right');
    });

    it('parses mixed case', () => {
      expect(parseSwipeDirection('Up')).toBe('up');
      expect(parseSwipeDirection('DoWn')).toBe('down');
    });

    it('trims whitespace', () => {
      expect(parseSwipeDirection('  up  ')).toBe('up');
      expect(parseSwipeDirection('  down  ')).toBe('down');
    });
  });

  describe('shorthand direction names', () => {
    it('parses "u" as up', () => {
      expect(parseSwipeDirection('u')).toBe('up');
    });

    it('parses "d" as down', () => {
      expect(parseSwipeDirection('d')).toBe('down');
    });

    it('parses "l" as left', () => {
      expect(parseSwipeDirection('l')).toBe('left');
    });

    it('parses "r" as right', () => {
      expect(parseSwipeDirection('r')).toBe('right');
    });

    it('parses uppercase shorthand', () => {
      expect(parseSwipeDirection('U')).toBe('up');
      expect(parseSwipeDirection('D')).toBe('down');
      expect(parseSwipeDirection('L')).toBe('left');
      expect(parseSwipeDirection('R')).toBe('right');
    });
  });
});

// =============================================================================
// parseSwipeTarget
// =============================================================================

describe('parseSwipeTarget', () => {
  describe('empty/invalid input', () => {
    it('returns null for empty string', () => {
      expect(parseSwipeTarget('')).toBeNull();
    });

    it('returns null for whitespace-only string', () => {
      expect(parseSwipeTarget('   ')).toBeNull();
    });

    it('returns null for bare # without identifier', () => {
      expect(parseSwipeTarget('#')).toBeNull();
    });

    it('returns null for empty quotes', () => {
      expect(parseSwipeTarget('""')).toBeNull();
      expect(parseSwipeTarget("''")).toBeNull();
    });
  });

  describe('identifier format', () => {
    it('parses #identifier', () => {
      expect(parseSwipeTarget('#carousel')).toEqual({
        type: 'identifier',
        value: 'carousel',
      });
    });

    it('parses identifier with underscores', () => {
      expect(parseSwipeTarget('#image_carousel')).toEqual({
        type: 'identifier',
        value: 'image_carousel',
      });
    });

    it('parses identifier with numbers', () => {
      expect(parseSwipeTarget('#carousel123')).toEqual({
        type: 'identifier',
        value: 'carousel123',
      });
    });

    it('trims whitespace around identifier', () => {
      expect(parseSwipeTarget('  #carousel  ')).toEqual({
        type: 'identifier',
        value: 'carousel',
      });
    });
  });

  describe('label format', () => {
    it('parses double-quoted label', () => {
      expect(parseSwipeTarget('"Image Gallery"')).toEqual({
        type: 'label',
        value: 'Image Gallery',
      });
    });

    it('parses single-quoted label', () => {
      expect(parseSwipeTarget("'Image Gallery'")).toEqual({
        type: 'label',
        value: 'Image Gallery',
      });
    });

    it('parses label with special characters', () => {
      expect(parseSwipeTarget('"Card View - Item 1"')).toEqual({
        type: 'label',
        value: 'Card View - Item 1',
      });
    });

    it('trims whitespace around quoted label', () => {
      expect(parseSwipeTarget('  "Gallery"  ')).toEqual({
        type: 'label',
        value: 'Gallery',
      });
    });
  });

  describe('bare identifier (lenient parsing)', () => {
    it('treats unquoted text as identifier', () => {
      expect(parseSwipeTarget('carousel')).toEqual({
        type: 'identifier',
        value: 'carousel',
      });
    });

    it('treats multi-word unquoted text as identifier', () => {
      expect(parseSwipeTarget('imageGallery')).toEqual({
        type: 'identifier',
        value: 'imageGallery',
      });
    });
  });
});

// =============================================================================
// parseVelocity
// =============================================================================

describe('parseVelocity', () => {
  describe('empty/invalid input', () => {
    it('returns null for empty string', () => {
      expect(parseVelocity('')).toBeNull();
    });

    it('returns null for whitespace-only string', () => {
      expect(parseVelocity('   ')).toBeNull();
    });

    it('returns null for invalid velocity', () => {
      expect(parseVelocity('supersonic')).toBeNull();
    });

    it('returns null for numbers', () => {
      expect(parseVelocity('100')).toBeNull();
    });
  });

  describe('full velocity names', () => {
    it('parses "slow"', () => {
      expect(parseVelocity('slow')).toBe('slow');
    });

    it('parses "normal"', () => {
      expect(parseVelocity('normal')).toBe('normal');
    });

    it('parses "fast"', () => {
      expect(parseVelocity('fast')).toBe('fast');
    });

    it('parses uppercase', () => {
      expect(parseVelocity('SLOW')).toBe('slow');
      expect(parseVelocity('NORMAL')).toBe('normal');
      expect(parseVelocity('FAST')).toBe('fast');
    });

    it('parses mixed case', () => {
      expect(parseVelocity('Slow')).toBe('slow');
      expect(parseVelocity('NoRmAl')).toBe('normal');
    });

    it('trims whitespace', () => {
      expect(parseVelocity('  fast  ')).toBe('fast');
    });
  });

  describe('shorthand velocity names', () => {
    it('parses "s" as slow', () => {
      expect(parseVelocity('s')).toBe('slow');
    });

    it('parses "n" as normal', () => {
      expect(parseVelocity('n')).toBe('normal');
    });

    it('parses "f" as fast', () => {
      expect(parseVelocity('f')).toBe('fast');
    });

    it('parses uppercase shorthand', () => {
      expect(parseVelocity('S')).toBe('slow');
      expect(parseVelocity('N')).toBe('normal');
      expect(parseVelocity('F')).toBe('fast');
    });
  });
});

// =============================================================================
// parseSwipeArgs
// =============================================================================

describe('parseSwipeArgs', () => {
  describe('empty/minimal input', () => {
    it('returns empty args for just command', () => {
      expect(parseSwipeArgs('/ios.swipe')).toEqual({});
    });

    it('returns empty args for command with whitespace', () => {
      expect(parseSwipeArgs('/ios.swipe   ')).toEqual({});
    });
  });

  describe('direction parsing', () => {
    it('parses direction from first argument', () => {
      expect(parseSwipeArgs('/ios.swipe left')).toEqual({ direction: 'left' });
    });

    it('parses direction with other options', () => {
      expect(parseSwipeArgs('/ios.swipe right --app com.example.app')).toEqual({
        direction: 'right',
        app: 'com.example.app',
      });
    });

    it('stores invalid direction as raw', () => {
      expect(parseSwipeArgs('/ios.swipe invalid')).toEqual({ raw: 'invalid' });
    });
  });

  describe('--from option', () => {
    it('parses --from with identifier', () => {
      expect(parseSwipeArgs('/ios.swipe left --from #carousel')).toEqual({
        direction: 'left',
        from: { type: 'identifier', value: 'carousel' },
      });
    });

    it('parses --from with label', () => {
      expect(parseSwipeArgs('/ios.swipe left --from "Image Gallery"')).toEqual({
        direction: 'left',
        from: { type: 'label', value: 'Image Gallery' },
      });
    });

    it('parses --from with single-quoted label', () => {
      expect(parseSwipeArgs("/ios.swipe left --from 'Gallery'")).toEqual({
        direction: 'left',
        from: { type: 'label', value: 'Gallery' },
      });
    });
  });

  describe('--simulator option', () => {
    it('parses --simulator', () => {
      expect(parseSwipeArgs('/ios.swipe left --simulator "iPhone 15 Pro"')).toEqual({
        direction: 'left',
        simulator: 'iPhone 15 Pro',
      });
    });

    it('parses -s shorthand', () => {
      expect(parseSwipeArgs('/ios.swipe left -s "iPhone 15"')).toEqual({
        direction: 'left',
        simulator: 'iPhone 15',
      });
    });

    it('parses simulator UDID', () => {
      const udid = '12345678-1234-1234-1234-123456789012';
      expect(parseSwipeArgs(`/ios.swipe left --simulator ${udid}`)).toEqual({
        direction: 'left',
        simulator: udid,
      });
    });
  });

  describe('--app option', () => {
    it('parses --app', () => {
      expect(parseSwipeArgs('/ios.swipe left --app com.example.app')).toEqual({
        direction: 'left',
        app: 'com.example.app',
      });
    });

    it('parses -a shorthand', () => {
      expect(parseSwipeArgs('/ios.swipe left -a com.example.app')).toEqual({
        direction: 'left',
        app: 'com.example.app',
      });
    });
  });

  describe('--velocity option', () => {
    it('parses --velocity slow', () => {
      expect(parseSwipeArgs('/ios.swipe left --velocity slow')).toEqual({
        direction: 'left',
        velocity: 'slow',
      });
    });

    it('parses --velocity normal', () => {
      expect(parseSwipeArgs('/ios.swipe left --velocity normal')).toEqual({
        direction: 'left',
        velocity: 'normal',
      });
    });

    it('parses --velocity fast', () => {
      expect(parseSwipeArgs('/ios.swipe left --velocity fast')).toEqual({
        direction: 'left',
        velocity: 'fast',
      });
    });

    it('parses -v shorthand', () => {
      expect(parseSwipeArgs('/ios.swipe left -v fast')).toEqual({
        direction: 'left',
        velocity: 'fast',
      });
    });

    it('ignores invalid velocity', () => {
      const result = parseSwipeArgs('/ios.swipe left --velocity invalid');
      expect(result.velocity).toBeUndefined();
    });
  });

  describe('--timeout option', () => {
    it('parses --timeout with value', () => {
      expect(parseSwipeArgs('/ios.swipe left --timeout 15000')).toEqual({
        direction: 'left',
        timeout: 15000,
      });
    });

    it('ignores invalid timeout', () => {
      const result = parseSwipeArgs('/ios.swipe left --timeout abc');
      expect(result.timeout).toBeUndefined();
    });

    it('ignores negative timeout', () => {
      const result = parseSwipeArgs('/ios.swipe left --timeout -1000');
      expect(result.timeout).toBeUndefined();
    });

    it('ignores zero timeout', () => {
      const result = parseSwipeArgs('/ios.swipe left --timeout 0');
      expect(result.timeout).toBeUndefined();
    });
  });

  describe('--debug flag', () => {
    it('parses --debug', () => {
      expect(parseSwipeArgs('/ios.swipe left --debug')).toEqual({
        direction: 'left',
        debug: true,
      });
    });

    it('works with other options', () => {
      expect(parseSwipeArgs('/ios.swipe left --app com.example.app --debug')).toEqual({
        direction: 'left',
        app: 'com.example.app',
        debug: true,
      });
    });
  });

  describe('complex command parsing', () => {
    it('parses all options together', () => {
      const cmd =
        '/ios.swipe left --app com.example.app --simulator "iPhone 15" --velocity fast --from #carousel --timeout 15000 --debug';
      expect(parseSwipeArgs(cmd)).toEqual({
        direction: 'left',
        app: 'com.example.app',
        simulator: 'iPhone 15',
        velocity: 'fast',
        from: { type: 'identifier', value: 'carousel' },
        timeout: 15000,
        debug: true,
      });
    });

    it('handles options in any order', () => {
      const cmd = '/ios.swipe --debug --app com.example.app left --from #carousel';
      const result = parseSwipeArgs(cmd);
      expect(result.direction).toBe('left');
      expect(result.debug).toBe(true);
      expect(result.app).toBe('com.example.app');
      expect(result.from).toEqual({ type: 'identifier', value: 'carousel' });
    });
  });
});

// =============================================================================
// executeSwipeCommand
// =============================================================================

describe('executeSwipeCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('validation errors', () => {
    it('returns error for missing direction', async () => {
      const result = await executeSwipeCommand('/ios.swipe --app com.example.app', 'session-1');
      expect(result.success).toBe(false);
      expect(result.error).toBe('No direction specified');
      expect(result.output).toContain('No direction specified');
      expect(result.output).toContain('Usage');
    });

    it('returns error for missing app bundle ID', async () => {
      const result = await executeSwipeCommand('/ios.swipe left', 'session-1');
      expect(result.success).toBe(false);
      expect(result.error).toBe('App bundle ID required');
      expect(result.output).toContain('App bundle ID required');
    });
  });

  describe('simulator resolution', () => {
    it('resolves simulator name to UDID from booted simulators', async () => {
      mockGetBootedSimulators.mockResolvedValue({
        success: true,
        data: [
          { udid: 'ABCD-1234', name: 'iPhone 15 Pro', state: 'Booted' },
        ],
      });

      mockExecute.mockResolvedValue({
        success: true,
        data: createMockActionResult(true),
      });

      const result = await executeSwipeCommand(
        '/ios.swipe left --simulator "iPhone 15 Pro" --app com.example.app',
        'session-1'
      );

      expect(mockGetBootedSimulators).toHaveBeenCalled();
    });

    it('falls back to all simulators if not in booted list', async () => {
      mockGetBootedSimulators.mockResolvedValue({
        success: true,
        data: [],
      });

      mockListSimulators.mockResolvedValue({
        success: true,
        data: [
          { udid: 'ABCD-1234', name: 'iPhone 15 Pro', state: 'Shutdown' },
        ],
      });

      mockExecute.mockResolvedValue({
        success: true,
        data: createMockActionResult(true),
      });

      await executeSwipeCommand(
        '/ios.swipe left --simulator "iPhone 15 Pro" --app com.example.app',
        'session-1'
      );

      expect(mockListSimulators).toHaveBeenCalled();
    });

    it('returns error if simulator not found', async () => {
      mockGetBootedSimulators.mockResolvedValue({
        success: true,
        data: [],
      });

      mockListSimulators.mockResolvedValue({
        success: true,
        data: [],
      });

      const result = await executeSwipeCommand(
        '/ios.swipe left --simulator "NonExistent" --app com.example.app',
        'session-1'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('No simulator found');
    });
  });

  describe('successful execution', () => {
    it('executes swipe with direction only', async () => {
      mockExecute.mockResolvedValue({
        success: true,
        data: createMockActionResult(true),
      });

      const result = await executeSwipeCommand(
        '/ios.swipe left --app com.example.app',
        'session-1'
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain('✓');
      expect(result.output).toContain('Swipe Left');
      expect(result.output).toContain('Success');
      expect(MockNativeDriver).toHaveBeenCalledWith(
        expect.objectContaining({
          bundleId: 'com.example.app',
        })
      );
    });

    it('executes swipe with --from target', async () => {
      mockExecute.mockResolvedValue({
        success: true,
        data: createMockActionResult(true),
      });

      const result = await executeSwipeCommand(
        '/ios.swipe left --from #carousel --app com.example.app',
        'session-1'
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain('from `#carousel`');
    });

    it('executes swipe with velocity', async () => {
      mockExecute.mockResolvedValue({
        success: true,
        data: createMockActionResult(true),
      });

      const result = await executeSwipeCommand(
        '/ios.swipe left --velocity fast --app com.example.app',
        'session-1'
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain('fast');
    });

    it('executes swipe with all options', async () => {
      mockExecute.mockResolvedValue({
        success: true,
        data: createMockActionResult(true),
      });

      const result = await executeSwipeCommand(
        '/ios.swipe right --from #gallery --velocity slow --timeout 15000 --app com.example.app',
        'session-1'
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain('Swipe Right');
      expect(result.output).toContain('#gallery');
    });
  });

  describe('execution failures', () => {
    it('handles driver execution failure', async () => {
      mockExecute.mockResolvedValue({
        success: false,
        error: 'Connection failed',
      });

      const result = await executeSwipeCommand(
        '/ios.swipe left --app com.example.app',
        'session-1'
      );

      expect(result.success).toBe(false);
      expect(result.output).toContain('Swipe Failed');
      expect(result.output).toContain('Connection failed');
    });

    it('handles action result failure', async () => {
      mockExecute.mockResolvedValue({
        success: true,
        data: createMockActionResult(false),
      });

      const result = await executeSwipeCommand(
        '/ios.swipe left --app com.example.app',
        'session-1'
      );

      expect(result.success).toBe(false);
      expect(result.output).toContain('✗');
    });

    it('includes troubleshooting tips on failure', async () => {
      mockExecute.mockResolvedValue({
        success: false,
        error: 'Element not found',
      });

      const result = await executeSwipeCommand(
        '/ios.swipe left --from #carousel --app com.example.app',
        'session-1'
      );

      expect(result.output).toContain('Troubleshooting');
      expect(result.output).toContain('/ios.inspect');
    });
  });
});

// =============================================================================
// swipeCommandMetadata
// =============================================================================

describe('swipeCommandMetadata', () => {
  it('has correct command', () => {
    expect(swipeCommandMetadata.command).toBe('/ios.swipe');
  });

  it('has description', () => {
    expect(swipeCommandMetadata.description).toBeTruthy();
    expect(typeof swipeCommandMetadata.description).toBe('string');
  });

  it('has usage', () => {
    expect(swipeCommandMetadata.usage).toBeTruthy();
    expect(swipeCommandMetadata.usage).toContain('/ios.swipe');
    expect(swipeCommandMetadata.usage).toContain('direction');
  });

  it('has options array', () => {
    expect(Array.isArray(swipeCommandMetadata.options)).toBe(true);
    expect(swipeCommandMetadata.options.length).toBeGreaterThan(0);
  });

  it('has --app option', () => {
    const appOption = swipeCommandMetadata.options.find((o) => o.name.includes('--app'));
    expect(appOption).toBeTruthy();
    expect(appOption!.description).toContain('App bundle ID');
  });

  it('has --simulator option', () => {
    const simOption = swipeCommandMetadata.options.find((o) => o.name.includes('--simulator'));
    expect(simOption).toBeTruthy();
  });

  it('has --velocity option', () => {
    const velOption = swipeCommandMetadata.options.find((o) => o.name.includes('--velocity'));
    expect(velOption).toBeTruthy();
    expect(velOption!.description).toContain('velocity');
  });

  it('has --from option', () => {
    const fromOption = swipeCommandMetadata.options.find((o) => o.name.includes('--from'));
    expect(fromOption).toBeTruthy();
  });

  it('has --debug option', () => {
    const debugOption = swipeCommandMetadata.options.find((o) => o.name.includes('--debug'));
    expect(debugOption).toBeTruthy();
  });

  it('has examples array', () => {
    expect(Array.isArray(swipeCommandMetadata.examples)).toBe(true);
    expect(swipeCommandMetadata.examples.length).toBeGreaterThan(0);
  });

  it('examples all start with /ios.swipe', () => {
    for (const example of swipeCommandMetadata.examples) {
      expect(example.startsWith('/ios.swipe')).toBe(true);
    }
  });
});
