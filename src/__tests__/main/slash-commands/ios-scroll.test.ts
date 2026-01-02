/**
 * Tests for src/main/slash-commands/ios-scroll.ts
 *
 * Tests cover direction parsing, target parsing, argument parsing, command execution,
 * and error handling for the /ios.scroll slash command.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  parseDirection,
  parseScrollTarget,
  parseScrollArgs,
  executeScrollCommand,
  scrollCommandMetadata,
  type ScrollTarget,
  type ScrollCommandArgs,
  type ScrollDirection,
} from '../../../main/slash-commands/ios-scroll';

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
    scroll: vi.fn((direction, options) => ({ type: 'scroll', direction, options })),
    scrollTo: vi.fn((target, options) => ({ type: 'scrollTo', target, options })),
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
    actionType: 'scroll',
    duration: 200,
    error: success ? undefined : 'Element not found',
    details: success
      ? {
          element: {
            type: 'ScrollView',
            identifier: 'main_scroll',
            isEnabled: true,
            isHittable: true,
            frame: { x: 0, y: 100, width: 390, height: 600 },
          },
          scrollAttempts: 3,
        }
      : {
          suggestions: ['scroll_view_1', 'scroll_view_2'],
        },
    timestamp: new Date().toISOString(),
  };
}

// =============================================================================
// parseDirection
// =============================================================================

describe('parseDirection', () => {
  describe('empty/invalid input', () => {
    it('returns null for empty string', () => {
      expect(parseDirection('')).toBeNull();
    });

    it('returns null for whitespace-only string', () => {
      expect(parseDirection('   ')).toBeNull();
    });

    it('returns null for invalid direction', () => {
      expect(parseDirection('diagonal')).toBeNull();
    });

    it('returns null for numbers', () => {
      expect(parseDirection('123')).toBeNull();
    });
  });

  describe('full direction names', () => {
    it('parses "up"', () => {
      expect(parseDirection('up')).toBe('up');
    });

    it('parses "down"', () => {
      expect(parseDirection('down')).toBe('down');
    });

    it('parses "left"', () => {
      expect(parseDirection('left')).toBe('left');
    });

    it('parses "right"', () => {
      expect(parseDirection('right')).toBe('right');
    });

    it('parses uppercase', () => {
      expect(parseDirection('UP')).toBe('up');
      expect(parseDirection('DOWN')).toBe('down');
      expect(parseDirection('LEFT')).toBe('left');
      expect(parseDirection('RIGHT')).toBe('right');
    });

    it('parses mixed case', () => {
      expect(parseDirection('Up')).toBe('up');
      expect(parseDirection('DoWn')).toBe('down');
    });

    it('trims whitespace', () => {
      expect(parseDirection('  up  ')).toBe('up');
      expect(parseDirection('  down  ')).toBe('down');
    });
  });

  describe('shorthand direction names', () => {
    it('parses "u" as up', () => {
      expect(parseDirection('u')).toBe('up');
    });

    it('parses "d" as down', () => {
      expect(parseDirection('d')).toBe('down');
    });

    it('parses "l" as left', () => {
      expect(parseDirection('l')).toBe('left');
    });

    it('parses "r" as right', () => {
      expect(parseDirection('r')).toBe('right');
    });

    it('parses uppercase shorthand', () => {
      expect(parseDirection('U')).toBe('up');
      expect(parseDirection('D')).toBe('down');
      expect(parseDirection('L')).toBe('left');
      expect(parseDirection('R')).toBe('right');
    });
  });
});

// =============================================================================
// parseScrollTarget
// =============================================================================

describe('parseScrollTarget', () => {
  describe('empty/invalid input', () => {
    it('returns null for empty string', () => {
      expect(parseScrollTarget('')).toBeNull();
    });

    it('returns null for whitespace-only string', () => {
      expect(parseScrollTarget('   ')).toBeNull();
    });

    it('returns null for bare # without identifier', () => {
      expect(parseScrollTarget('#')).toBeNull();
    });

    it('returns null for empty quotes', () => {
      expect(parseScrollTarget('""')).toBeNull();
      expect(parseScrollTarget("''")).toBeNull();
    });
  });

  describe('identifier format (#identifier)', () => {
    it('parses basic identifier', () => {
      const result = parseScrollTarget('#settings_item');
      expect(result).toEqual({
        type: 'identifier',
        value: 'settings_item',
      });
    });

    it('parses identifier with underscores', () => {
      const result = parseScrollTarget('#my_long_identifier');
      expect(result).toEqual({
        type: 'identifier',
        value: 'my_long_identifier',
      });
    });

    it('parses identifier with numbers', () => {
      const result = parseScrollTarget('#item123');
      expect(result).toEqual({
        type: 'identifier',
        value: 'item123',
      });
    });

    it('parses identifier with hyphens', () => {
      const result = parseScrollTarget('#my-item');
      expect(result).toEqual({
        type: 'identifier',
        value: 'my-item',
      });
    });

    it('trims whitespace around identifier', () => {
      const result = parseScrollTarget('  #spaced_id  ');
      expect(result).toEqual({
        type: 'identifier',
        value: 'spaced_id',
      });
    });
  });

  describe('label format ("label" or \'label\')', () => {
    it('parses double-quoted label', () => {
      const result = parseScrollTarget('"Settings"');
      expect(result).toEqual({
        type: 'label',
        value: 'Settings',
      });
    });

    it('parses single-quoted label', () => {
      const result = parseScrollTarget("'Settings'");
      expect(result).toEqual({
        type: 'label',
        value: 'Settings',
      });
    });

    it('parses label with spaces', () => {
      const result = parseScrollTarget('"Privacy Policy"');
      expect(result).toEqual({
        type: 'label',
        value: 'Privacy Policy',
      });
    });

    it('parses label with special characters', () => {
      const result = parseScrollTarget('"Terms & Conditions"');
      expect(result).toEqual({
        type: 'label',
        value: 'Terms & Conditions',
      });
    });

    it('parses label with numbers', () => {
      const result = parseScrollTarget('"Item 123"');
      expect(result).toEqual({
        type: 'label',
        value: 'Item 123',
      });
    });
  });

  describe('lenient parsing (no prefix)', () => {
    it('treats unquoted string as identifier', () => {
      const result = parseScrollTarget('footer_element');
      expect(result).toEqual({
        type: 'identifier',
        value: 'footer_element',
      });
    });
  });
});

// =============================================================================
// parseScrollArgs
// =============================================================================

describe('parseScrollArgs', () => {
  describe('empty input', () => {
    it('returns empty args for bare command', () => {
      const result = parseScrollArgs('/ios.scroll');
      expect(result).toEqual({});
    });

    it('returns empty args for command with only whitespace', () => {
      const result = parseScrollArgs('/ios.scroll   ');
      expect(result).toEqual({});
    });
  });

  describe('direction parsing', () => {
    it('parses direction alone', () => {
      const result = parseScrollArgs('/ios.scroll down');
      expect(result.direction).toBe('down');
    });

    it('parses up direction', () => {
      const result = parseScrollArgs('/ios.scroll up');
      expect(result.direction).toBe('up');
    });

    it('parses left direction', () => {
      const result = parseScrollArgs('/ios.scroll left');
      expect(result.direction).toBe('left');
    });

    it('parses right direction', () => {
      const result = parseScrollArgs('/ios.scroll right');
      expect(result.direction).toBe('right');
    });

    it('parses shorthand direction', () => {
      const result = parseScrollArgs('/ios.scroll d');
      expect(result.direction).toBe('down');
    });
  });

  describe('--to / -t option', () => {
    it('parses --to with identifier', () => {
      const result = parseScrollArgs('/ios.scroll --to #footer');
      expect(result.target).toEqual({
        type: 'identifier',
        value: 'footer',
      });
    });

    it('parses -t with identifier', () => {
      const result = parseScrollArgs('/ios.scroll -t #footer');
      expect(result.target).toEqual({
        type: 'identifier',
        value: 'footer',
      });
    });

    it('parses --to with label', () => {
      const result = parseScrollArgs('/ios.scroll --to "Privacy Policy"');
      expect(result.target).toEqual({
        type: 'label',
        value: 'Privacy Policy',
      });
    });

    it('parses -t with single-quoted label', () => {
      const result = parseScrollArgs("/ios.scroll -t 'Settings'");
      expect(result.target).toEqual({
        type: 'label',
        value: 'Settings',
      });
    });
  });

  describe('--in option (container)', () => {
    it('parses --in with identifier', () => {
      const result = parseScrollArgs('/ios.scroll down --in #scroll_view');
      expect(result.container).toEqual({
        type: 'identifier',
        value: 'scroll_view',
      });
      expect(result.direction).toBe('down');
    });

    it('parses --in with label', () => {
      const result = parseScrollArgs('/ios.scroll up --in "Main Content"');
      expect(result.container).toEqual({
        type: 'label',
        value: 'Main Content',
      });
    });
  });

  describe('--app / -a option', () => {
    it('parses --app option', () => {
      const result = parseScrollArgs('/ios.scroll down --app com.example.app');
      expect(result.app).toBe('com.example.app');
    });

    it('parses -a shorthand', () => {
      const result = parseScrollArgs('/ios.scroll down -a com.example.app');
      expect(result.app).toBe('com.example.app');
    });

    it('parses quoted app ID', () => {
      const result = parseScrollArgs('/ios.scroll down --app "com.example.app"');
      expect(result.app).toBe('com.example.app');
    });
  });

  describe('--simulator / -s option', () => {
    it('parses --simulator option', () => {
      const result = parseScrollArgs('/ios.scroll down --simulator "iPhone 15 Pro"');
      expect(result.simulator).toBe('iPhone 15 Pro');
    });

    it('parses -s shorthand', () => {
      const result = parseScrollArgs('/ios.scroll down -s "iPhone 15"');
      expect(result.simulator).toBe('iPhone 15');
    });

    it('parses UDID', () => {
      const result = parseScrollArgs('/ios.scroll down -s 12345678-1234-1234-1234-123456789012');
      expect(result.simulator).toBe('12345678-1234-1234-1234-123456789012');
    });
  });

  describe('--distance option', () => {
    it('parses --distance with decimal', () => {
      const result = parseScrollArgs('/ios.scroll down --distance 0.8');
      expect(result.distance).toBe(0.8);
    });

    it('parses --distance with 1.0', () => {
      const result = parseScrollArgs('/ios.scroll down --distance 1.0');
      expect(result.distance).toBe(1.0);
    });

    it('parses --distance with 0', () => {
      const result = parseScrollArgs('/ios.scroll down --distance 0');
      expect(result.distance).toBe(0);
    });

    it('ignores invalid distance > 1', () => {
      const result = parseScrollArgs('/ios.scroll down --distance 1.5');
      expect(result.distance).toBeUndefined();
    });

    it('ignores invalid distance < 0', () => {
      const result = parseScrollArgs('/ios.scroll down --distance -0.5');
      expect(result.distance).toBeUndefined();
    });

    it('ignores non-numeric distance', () => {
      const result = parseScrollArgs('/ios.scroll down --distance abc');
      expect(result.distance).toBeUndefined();
    });
  });

  describe('--attempts option', () => {
    it('parses --attempts', () => {
      const result = parseScrollArgs('/ios.scroll --to #footer --attempts 20');
      expect(result.attempts).toBe(20);
    });

    it('ignores zero attempts', () => {
      const result = parseScrollArgs('/ios.scroll --to #footer --attempts 0');
      expect(result.attempts).toBeUndefined();
    });

    it('ignores negative attempts', () => {
      const result = parseScrollArgs('/ios.scroll --to #footer --attempts -5');
      expect(result.attempts).toBeUndefined();
    });

    it('ignores non-numeric attempts', () => {
      const result = parseScrollArgs('/ios.scroll --to #footer --attempts abc');
      expect(result.attempts).toBeUndefined();
    });
  });

  describe('--timeout option', () => {
    it('parses --timeout', () => {
      const result = parseScrollArgs('/ios.scroll --to #item --timeout 15000');
      expect(result.timeout).toBe(15000);
    });

    it('ignores zero timeout', () => {
      const result = parseScrollArgs('/ios.scroll --to #item --timeout 0');
      expect(result.timeout).toBeUndefined();
    });

    it('ignores negative timeout', () => {
      const result = parseScrollArgs('/ios.scroll --to #item --timeout -1000');
      expect(result.timeout).toBeUndefined();
    });
  });

  describe('--debug flag', () => {
    it('parses --debug flag', () => {
      const result = parseScrollArgs('/ios.scroll down --debug');
      expect(result.debug).toBe(true);
    });

    it('defaults to undefined when not present', () => {
      const result = parseScrollArgs('/ios.scroll down');
      expect(result.debug).toBeUndefined();
    });
  });

  describe('complex commands', () => {
    it('parses full command with direction', () => {
      const result = parseScrollArgs('/ios.scroll down --app com.example.app --distance 0.5 --simulator "iPhone 15" --debug');
      expect(result).toEqual({
        direction: 'down',
        app: 'com.example.app',
        distance: 0.5,
        simulator: 'iPhone 15',
        debug: true,
      });
    });

    it('parses full command with target', () => {
      const result = parseScrollArgs('/ios.scroll --to #footer --app com.example.app --attempts 15 --in #scroll_view');
      expect(result).toEqual({
        target: { type: 'identifier', value: 'footer' },
        app: 'com.example.app',
        attempts: 15,
        container: { type: 'identifier', value: 'scroll_view' },
      });
    });

    it('parses direction with target', () => {
      const result = parseScrollArgs('/ios.scroll down --to #footer --app com.example.app');
      expect(result.direction).toBe('down');
      expect(result.target).toEqual({ type: 'identifier', value: 'footer' });
    });

    it('handles options in any order', () => {
      const result = parseScrollArgs('/ios.scroll --app com.app --debug --to #elem down');
      expect(result.app).toBe('com.app');
      expect(result.debug).toBe(true);
      expect(result.target).toEqual({ type: 'identifier', value: 'elem' });
      expect(result.direction).toBe('down');
    });
  });
});

// =============================================================================
// executeScrollCommand
// =============================================================================

describe('executeScrollCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('validation errors', () => {
    it('returns error when no direction or target specified', async () => {
      const result = await executeScrollCommand('/ios.scroll', 'session-1');
      expect(result.success).toBe(false);
      expect(result.error).toBe('No direction or target specified');
      expect(result.output).toContain('No direction or target specified');
    });

    it('returns error when app bundle ID is missing', async () => {
      const result = await executeScrollCommand('/ios.scroll down', 'session-1');
      expect(result.success).toBe(false);
      expect(result.error).toBe('App bundle ID required');
      expect(result.output).toContain('App bundle ID required');
    });

    it('treats invalid direction as lenient target (identifier)', async () => {
      // Note: "invalid" is not a valid direction but is treated as a lenient target
      // because parseScrollTarget allows unquoted strings as identifiers
      mockExecute.mockResolvedValue({
        success: true,
        data: createMockActionResult(true),
      });

      const result = await executeScrollCommand('/ios.scroll invalid --app com.app', 'session-1');
      // This will try to scroll to an element with identifier "invalid"
      expect(result.success).toBe(true);
    });
  });

  describe('simulator resolution', () => {
    it('uses simulator name to find UDID', async () => {
      mockGetBootedSimulators.mockResolvedValue({
        success: true,
        data: [
          { udid: 'BOOTED-UDID', name: 'iPhone 15 Pro', state: 'Booted', osVersion: '17.0' },
        ],
      });
      mockExecute.mockResolvedValue({
        success: true,
        data: createMockActionResult(true),
      });

      await executeScrollCommand('/ios.scroll down --app com.app --simulator "iPhone 15 Pro"', 'session-1');

      expect(mockGetBootedSimulators).toHaveBeenCalled();
      expect(MockNativeDriver).toHaveBeenCalledWith(
        expect.objectContaining({
          udid: 'BOOTED-UDID',
        })
      );
    });

    it('uses UDID directly when provided', async () => {
      mockExecute.mockResolvedValue({
        success: true,
        data: createMockActionResult(true),
      });

      const udid = '12345678-1234-1234-1234-123456789012';
      await executeScrollCommand(`/ios.scroll down --app com.app --simulator ${udid}`, 'session-1');

      expect(mockGetBootedSimulators).not.toHaveBeenCalled();
      expect(MockNativeDriver).toHaveBeenCalledWith(
        expect.objectContaining({
          udid,
        })
      );
    });

    it('returns error when simulator name not found', async () => {
      mockGetBootedSimulators.mockResolvedValue({
        success: true,
        data: [],
      });
      mockListSimulators.mockResolvedValue({
        success: true,
        data: [],
      });

      const result = await executeScrollCommand('/ios.scroll down --app com.app -s "Unknown Simulator"', 'session-1');
      expect(result.success).toBe(false);
      expect(result.error).toContain('No simulator found');
    });

    it('falls back to all simulators when not in booted list', async () => {
      mockGetBootedSimulators.mockResolvedValue({
        success: true,
        data: [],
      });
      mockListSimulators.mockResolvedValue({
        success: true,
        data: [
          { udid: 'SIM-UDID', name: 'iPhone 15', state: 'Shutdown', osVersion: '17.0' },
        ],
      });
      mockExecute.mockResolvedValue({
        success: true,
        data: createMockActionResult(true),
      });

      await executeScrollCommand('/ios.scroll down --app com.app -s "iPhone 15"', 'session-1');

      expect(MockNativeDriver).toHaveBeenCalledWith(
        expect.objectContaining({
          udid: 'SIM-UDID',
        })
      );
    });
  });

  describe('scroll direction execution', () => {
    beforeEach(() => {
      mockExecute.mockResolvedValue({
        success: true,
        data: createMockActionResult(true),
      });
    });

    it('executes scroll down', async () => {
      const result = await executeScrollCommand('/ios.scroll down --app com.app', 'session-1');
      expect(result.success).toBe(true);
      expect(result.output).toContain('Scroll Down');
    });

    it('executes scroll up', async () => {
      const result = await executeScrollCommand('/ios.scroll up --app com.app', 'session-1');
      expect(result.success).toBe(true);
      expect(result.output).toContain('Scroll Up');
    });

    it('executes scroll left', async () => {
      const result = await executeScrollCommand('/ios.scroll left --app com.app', 'session-1');
      expect(result.success).toBe(true);
      expect(result.output).toContain('Scroll Left');
    });

    it('executes scroll right', async () => {
      const result = await executeScrollCommand('/ios.scroll right --app com.app', 'session-1');
      expect(result.success).toBe(true);
      expect(result.output).toContain('Scroll Right');
    });

    it('passes distance option', async () => {
      const { scroll } = await import('../../../main/ios-tools/native-driver');
      await executeScrollCommand('/ios.scroll down --distance 0.8 --app com.app', 'session-1');
      expect(scroll).toHaveBeenCalledWith('down', expect.objectContaining({ distance: 0.8 }));
    });

    it('passes container target', async () => {
      const { scroll, byId } = await import('../../../main/ios-tools/native-driver');
      await executeScrollCommand('/ios.scroll down --in #container --app com.app', 'session-1');
      expect(byId).toHaveBeenCalledWith('container');
      expect(scroll).toHaveBeenCalledWith('down', expect.objectContaining({ target: expect.any(Object) }));
    });
  });

  describe('scroll to target execution', () => {
    beforeEach(() => {
      mockExecute.mockResolvedValue({
        success: true,
        data: createMockActionResult(true),
      });
    });

    it('executes scroll to identifier', async () => {
      const { scrollTo, byId } = await import('../../../main/ios-tools/native-driver');
      const result = await executeScrollCommand('/ios.scroll --to #footer --app com.app', 'session-1');
      expect(result.success).toBe(true);
      expect(byId).toHaveBeenCalledWith('footer');
      expect(scrollTo).toHaveBeenCalled();
      expect(result.output).toContain('Scroll To');
      expect(result.output).toContain('#footer');
    });

    it('executes scroll to label', async () => {
      const { scrollTo, byLabel } = await import('../../../main/ios-tools/native-driver');
      const result = await executeScrollCommand('/ios.scroll --to "Privacy Policy" --app com.app', 'session-1');
      expect(result.success).toBe(true);
      expect(byLabel).toHaveBeenCalledWith('Privacy Policy');
      expect(scrollTo).toHaveBeenCalled();
    });

    it('passes max attempts option', async () => {
      const { scrollTo } = await import('../../../main/ios-tools/native-driver');
      await executeScrollCommand('/ios.scroll --to #footer --attempts 20 --app com.app', 'session-1');
      expect(scrollTo).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ maxAttempts: 20 }));
    });

    it('passes direction when scrolling to target', async () => {
      const { scrollTo } = await import('../../../main/ios-tools/native-driver');
      await executeScrollCommand('/ios.scroll up --to #header --app com.app', 'session-1');
      expect(scrollTo).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ direction: 'up' }));
    });
  });

  describe('driver configuration', () => {
    beforeEach(() => {
      mockExecute.mockResolvedValue({
        success: true,
        data: createMockActionResult(true),
      });
    });

    it('passes app bundle ID to driver', async () => {
      await executeScrollCommand('/ios.scroll down --app com.example.testapp', 'session-1');
      expect(MockNativeDriver).toHaveBeenCalledWith(
        expect.objectContaining({
          bundleId: 'com.example.testapp',
        })
      );
    });

    it('passes timeout to driver', async () => {
      await executeScrollCommand('/ios.scroll down --app com.app --timeout 15000', 'session-1');
      expect(MockNativeDriver).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 15000,
        })
      );
    });

    it('passes debug flag to driver', async () => {
      await executeScrollCommand('/ios.scroll down --app com.app --debug', 'session-1');
      expect(MockNativeDriver).toHaveBeenCalledWith(
        expect.objectContaining({
          debug: true,
        })
      );
    });
  });

  describe('action execution results', () => {
    it('returns success with formatted output', async () => {
      mockExecute.mockResolvedValue({
        success: true,
        data: createMockActionResult(true),
      });

      const result = await executeScrollCommand('/ios.scroll down --app com.app', 'session-1');
      expect(result.success).toBe(true);
      expect(result.output).toContain('✓');
      expect(result.output).toContain('Success');
      expect(result.output).toContain('Duration');
    });

    it('includes element info in output', async () => {
      mockExecute.mockResolvedValue({
        success: true,
        data: createMockActionResult(true),
      });

      const result = await executeScrollCommand('/ios.scroll down --app com.app', 'session-1');
      expect(result.output).toContain('Element Info');
      expect(result.output).toContain('ScrollView');
    });

    it('includes scroll attempts when present', async () => {
      mockExecute.mockResolvedValue({
        success: true,
        data: createMockActionResult(true),
      });

      const result = await executeScrollCommand('/ios.scroll --to #footer --app com.app', 'session-1');
      expect(result.output).toContain('Scroll Details');
      expect(result.output).toContain('Attempts');
    });

    it('returns failure when action fails', async () => {
      mockExecute.mockResolvedValue({
        success: true,
        data: createMockActionResult(false),
      });

      const result = await executeScrollCommand('/ios.scroll --to #missing --app com.app', 'session-1');
      expect(result.success).toBe(false);
      expect(result.output).toContain('✗');
      expect(result.output).toContain('Element not found');
    });

    it('includes suggestions when available', async () => {
      mockExecute.mockResolvedValue({
        success: true,
        data: createMockActionResult(false),
      });

      const result = await executeScrollCommand('/ios.scroll --to #missing --app com.app', 'session-1');
      expect(result.output).toContain('Similar Elements');
      expect(result.output).toContain('scroll_view_1');
    });

    it('returns error when driver execution fails', async () => {
      mockExecute.mockResolvedValue({
        success: false,
        error: 'Driver connection failed',
      });

      const result = await executeScrollCommand('/ios.scroll down --app com.app', 'session-1');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Driver connection failed');
      expect(result.output).toContain('Troubleshooting');
    });
  });

  describe('output includes distance', () => {
    beforeEach(() => {
      mockExecute.mockResolvedValue({
        success: true,
        data: createMockActionResult(true),
      });
    });

    it('shows distance in output when specified', async () => {
      const result = await executeScrollCommand('/ios.scroll down --distance 0.8 --app com.app', 'session-1');
      expect(result.output).toContain('Distance');
      expect(result.output).toContain('0.8');
    });

    it('shows container in output when specified', async () => {
      const result = await executeScrollCommand('/ios.scroll down --in #container --app com.app', 'session-1');
      expect(result.output).toContain('Container');
      expect(result.output).toContain('#container');
    });
  });
});

// =============================================================================
// scrollCommandMetadata
// =============================================================================

describe('scrollCommandMetadata', () => {
  it('has correct command name', () => {
    expect(scrollCommandMetadata.command).toBe('/ios.scroll');
  });

  it('has description', () => {
    expect(scrollCommandMetadata.description).toBeTruthy();
    expect(scrollCommandMetadata.description.length).toBeGreaterThan(10);
  });

  it('has usage', () => {
    expect(scrollCommandMetadata.usage).toBeTruthy();
    expect(scrollCommandMetadata.usage).toContain('/ios.scroll');
  });

  it('has required options', () => {
    const optionNames = scrollCommandMetadata.options.map((o) => o.name);
    expect(optionNames).toContain('--app, -a');
    expect(optionNames).toContain('--to, -t');
    expect(optionNames).toContain('--simulator, -s');
    expect(optionNames).toContain('--distance');
    expect(optionNames).toContain('--attempts');
    expect(optionNames).toContain('--in');
    expect(optionNames).toContain('--timeout');
    expect(optionNames).toContain('--debug');
  });

  it('has examples', () => {
    expect(scrollCommandMetadata.examples).toBeDefined();
    expect(scrollCommandMetadata.examples.length).toBeGreaterThan(0);
    expect(scrollCommandMetadata.examples.some((e) => e.includes('down'))).toBe(true);
    expect(scrollCommandMetadata.examples.some((e) => e.includes('--to'))).toBe(true);
  });

  it('all options have descriptions', () => {
    for (const option of scrollCommandMetadata.options) {
      expect(option.description).toBeTruthy();
    }
  });

  it('all examples are valid command strings', () => {
    for (const example of scrollCommandMetadata.examples) {
      expect(example.startsWith('/ios.scroll')).toBe(true);
    }
  });
});
