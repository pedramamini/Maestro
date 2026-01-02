/**
 * Tests for src/main/slash-commands/ios-tap.ts
 *
 * Tests cover target parsing, argument parsing, command execution, and error handling
 * for the /ios.tap slash command.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  parseTarget,
  parseTapArgs,
  executeTapCommand,
  tapCommandMetadata,
  type TapTarget,
  type TapCommandArgs,
} from '../../../main/slash-commands/ios-tap';

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
    byCoordinates: vi.fn((x, y) => ({ type: 'coordinates', value: `${x},${y}` })),
    tap: vi.fn((target, offset) => ({ type: 'tap', target, offset })),
    doubleTap: vi.fn((target) => ({ type: 'doubleTap', target })),
    longPress: vi.fn((target, duration) => ({ type: 'longPress', target, duration })),
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
    actionType: 'tap',
    duration: 150,
    error: success ? undefined : 'Element not found',
    details: success
      ? {
          element: {
            type: 'Button',
            identifier: 'test_button',
            label: 'Test',
            isEnabled: true,
            isHittable: true,
            frame: { x: 100, y: 200, width: 80, height: 40 },
          },
        }
      : {
          suggestions: ['test_button_1', 'test_button_2'],
        },
    timestamp: new Date().toISOString(),
  };
}

// =============================================================================
// parseTarget
// =============================================================================

describe('parseTarget', () => {
  describe('empty/invalid input', () => {
    it('returns null for empty string', () => {
      expect(parseTarget('')).toBeNull();
    });

    it('returns null for whitespace-only string', () => {
      expect(parseTarget('   ')).toBeNull();
    });

    it('returns null for bare # without identifier', () => {
      expect(parseTarget('#')).toBeNull();
    });

    it('returns null for empty quotes', () => {
      expect(parseTarget('""')).toBeNull();
      expect(parseTarget("''")).toBeNull();
    });
  });

  describe('identifier format (#identifier)', () => {
    it('parses basic identifier', () => {
      const result = parseTarget('#login_button');
      expect(result).toEqual({
        type: 'identifier',
        value: 'login_button',
      });
    });

    it('parses identifier with underscores', () => {
      const result = parseTarget('#my_long_identifier');
      expect(result).toEqual({
        type: 'identifier',
        value: 'my_long_identifier',
      });
    });

    it('parses identifier with numbers', () => {
      const result = parseTarget('#button123');
      expect(result).toEqual({
        type: 'identifier',
        value: 'button123',
      });
    });

    it('parses identifier with hyphens', () => {
      const result = parseTarget('#my-button');
      expect(result).toEqual({
        type: 'identifier',
        value: 'my-button',
      });
    });

    it('trims whitespace around identifier', () => {
      const result = parseTarget('  #spaced_id  ');
      expect(result).toEqual({
        type: 'identifier',
        value: 'spaced_id',
      });
    });
  });

  describe('label format ("label" or \'label\')', () => {
    it('parses double-quoted label', () => {
      const result = parseTarget('"Sign In"');
      expect(result).toEqual({
        type: 'label',
        value: 'Sign In',
      });
    });

    it('parses single-quoted label', () => {
      const result = parseTarget("'Sign In'");
      expect(result).toEqual({
        type: 'label',
        value: 'Sign In',
      });
    });

    it('parses label with special characters', () => {
      const result = parseTarget('"Hello, World!"');
      expect(result).toEqual({
        type: 'label',
        value: 'Hello, World!',
      });
    });

    it('parses label with numbers', () => {
      const result = parseTarget('"Item 123"');
      expect(result).toEqual({
        type: 'label',
        value: 'Item 123',
      });
    });

    it('preserves internal quotes', () => {
      const result = parseTarget('"He said \\"hello\\""');
      expect(result).toEqual({
        type: 'label',
        value: 'He said \\"hello\\"',
      });
    });
  });

  describe('coordinate format (x,y)', () => {
    it('parses integer coordinates', () => {
      const result = parseTarget('100,200');
      expect(result).toEqual({
        type: 'coordinates',
        value: '100,200',
        x: 100,
        y: 200,
      });
    });

    it('parses floating-point coordinates', () => {
      const result = parseTarget('100.5,200.75');
      expect(result).toEqual({
        type: 'coordinates',
        value: '100.5,200.75',
        x: 100.5,
        y: 200.75,
      });
    });

    it('parses coordinates with whitespace around comma', () => {
      const result = parseTarget('100 , 200');
      expect(result).toEqual({
        type: 'coordinates',
        value: '100 , 200',
        x: 100,
        y: 200,
      });
    });

    it('parses zero coordinates', () => {
      const result = parseTarget('0,0');
      expect(result).toEqual({
        type: 'coordinates',
        value: '0,0',
        x: 0,
        y: 0,
      });
    });
  });

  describe('fallback to identifier', () => {
    it('treats unrecognized format as identifier', () => {
      const result = parseTarget('some_element');
      expect(result).toEqual({
        type: 'identifier',
        value: 'some_element',
      });
    });

    it('treats mismatched quotes as identifier', () => {
      const result = parseTarget('"unclosed');
      expect(result).toEqual({
        type: 'identifier',
        value: '"unclosed',
      });
    });
  });
});

// =============================================================================
// parseTapArgs
// =============================================================================

describe('parseTapArgs', () => {
  describe('empty input', () => {
    it('returns empty args for bare command', () => {
      const args = parseTapArgs('/ios.tap');
      expect(args).toEqual({});
    });

    it('returns empty args for command with whitespace only', () => {
      const args = parseTapArgs('/ios.tap   ');
      expect(args).toEqual({});
    });
  });

  describe('target parsing', () => {
    it('parses identifier target', () => {
      const args = parseTapArgs('/ios.tap #login_button');
      expect(args.target).toEqual({
        type: 'identifier',
        value: 'login_button',
      });
    });

    it('parses quoted label target', () => {
      const args = parseTapArgs('/ios.tap "Sign In"');
      expect(args.target).toEqual({
        type: 'label',
        value: 'Sign In',
      });
    });

    it('parses coordinate target', () => {
      const args = parseTapArgs('/ios.tap 100,200');
      expect(args.target).toEqual({
        type: 'coordinates',
        value: '100,200',
        x: 100,
        y: 200,
      });
    });
  });

  describe('--simulator / -s option', () => {
    it('parses --simulator option and strips quotes', () => {
      const args = parseTapArgs('/ios.tap #button --simulator "iPhone 15 Pro"');
      expect(args.simulator).toBe('iPhone 15 Pro');
    });

    it('parses -s short option and strips quotes', () => {
      const args = parseTapArgs('/ios.tap #button -s "iPhone 15"');
      expect(args.simulator).toBe('iPhone 15');
    });

    it('parses simulator UDID', () => {
      const args = parseTapArgs('/ios.tap #button -s 12345678-1234-1234-1234-123456789012');
      expect(args.simulator).toBe('12345678-1234-1234-1234-123456789012');
    });

    it('parses simulator name without quotes', () => {
      const args = parseTapArgs('/ios.tap #button -s iPhone15Pro');
      expect(args.simulator).toBe('iPhone15Pro');
    });
  });

  describe('--app / -a option', () => {
    it('parses --app option', () => {
      const args = parseTapArgs('/ios.tap #button --app com.example.app');
      expect(args.app).toBe('com.example.app');
    });

    it('parses -a short option', () => {
      const args = parseTapArgs('/ios.tap #button -a com.test.app');
      expect(args.app).toBe('com.test.app');
    });
  });

  describe('--double flag', () => {
    it('parses --double flag', () => {
      const args = parseTapArgs('/ios.tap #button --double');
      expect(args.doubleTap).toBe(true);
    });

    it('sets doubleTap to undefined when not present', () => {
      const args = parseTapArgs('/ios.tap #button');
      expect(args.doubleTap).toBeUndefined();
    });
  });

  describe('--long option', () => {
    it('parses --long with default duration', () => {
      const args = parseTapArgs('/ios.tap #button --long');
      expect(args.longPress).toBe(1.0);
    });

    it('parses --long with custom duration', () => {
      const args = parseTapArgs('/ios.tap #button --long 2.5');
      expect(args.longPress).toBe(2.5);
    });

    it('parses --long with integer duration', () => {
      const args = parseTapArgs('/ios.tap #button --long 3');
      expect(args.longPress).toBe(3);
    });

    it('uses default for --long followed by flag', () => {
      const args = parseTapArgs('/ios.tap #button --long --debug');
      expect(args.longPress).toBe(1.0);
      expect(args.debug).toBe(true);
    });
  });

  describe('--offset option', () => {
    it('parses --offset with positive values', () => {
      const args = parseTapArgs('/ios.tap #button --offset 10,20');
      expect(args.offset).toEqual({ x: 10, y: 20 });
    });

    it('parses --offset with negative values', () => {
      const args = parseTapArgs('/ios.tap #button --offset -10,-20');
      expect(args.offset).toEqual({ x: -10, y: -20 });
    });

    it('parses --offset with floating-point values', () => {
      const args = parseTapArgs('/ios.tap #button --offset 10.5,-5.25');
      expect(args.offset).toEqual({ x: 10.5, y: -5.25 });
    });

    it('ignores invalid offset format', () => {
      const args = parseTapArgs('/ios.tap #button --offset invalid');
      expect(args.offset).toBeUndefined();
    });
  });

  describe('--timeout option', () => {
    it('parses --timeout option', () => {
      const args = parseTapArgs('/ios.tap #button --timeout 15000');
      expect(args.timeout).toBe(15000);
    });

    it('ignores invalid timeout', () => {
      const args = parseTapArgs('/ios.tap #button --timeout invalid');
      expect(args.timeout).toBeUndefined();
    });

    it('ignores negative timeout', () => {
      const args = parseTapArgs('/ios.tap #button --timeout -1000');
      expect(args.timeout).toBeUndefined();
    });
  });

  describe('--debug flag', () => {
    it('parses --debug flag', () => {
      const args = parseTapArgs('/ios.tap #button --debug');
      expect(args.debug).toBe(true);
    });
  });

  describe('complex command combinations', () => {
    it('parses all options together', () => {
      const args = parseTapArgs(
        '/ios.tap #login_button --app com.example.app -s "iPhone 15" --timeout 5000 --debug'
      );
      expect(args.target).toEqual({ type: 'identifier', value: 'login_button' });
      expect(args.app).toBe('com.example.app');
      expect(args.simulator).toBe('iPhone 15');
      expect(args.timeout).toBe(5000);
      expect(args.debug).toBe(true);
    });

    it('parses options before target', () => {
      const args = parseTapArgs('/ios.tap --app com.example.app #button');
      expect(args.app).toBe('com.example.app');
      expect(args.target).toEqual({ type: 'identifier', value: 'button' });
    });

    it('parses double tap with all options', () => {
      const args = parseTapArgs('/ios.tap #menu --double --app com.test.app --offset 5,10');
      expect(args.target).toEqual({ type: 'identifier', value: 'menu' });
      expect(args.doubleTap).toBe(true);
      expect(args.app).toBe('com.test.app');
      expect(args.offset).toEqual({ x: 5, y: 10 });
    });

    it('parses long press with duration and options', () => {
      const args = parseTapArgs('/ios.tap "Delete" --long 2 --app com.test.app');
      expect(args.target).toEqual({ type: 'label', value: 'Delete' });
      expect(args.longPress).toBe(2);
      expect(args.app).toBe('com.test.app');
    });
  });
});

// =============================================================================
// executeTapCommand
// =============================================================================

describe('executeTapCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the mockExecute function before each test
    getMockExecute().mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('validation errors', () => {
    it('returns error when no target specified', async () => {
      const result = await executeTapCommand('/ios.tap', 'session-123');
      expect(result.success).toBe(false);
      expect(result.error).toBe('No target specified');
      expect(result.output).toContain('No target specified');
    });

    it('returns error when no app bundle ID specified', async () => {
      const result = await executeTapCommand('/ios.tap #button', 'session-123');
      expect(result.success).toBe(false);
      expect(result.error).toBe('App bundle ID required');
      expect(result.output).toContain('App bundle ID required');
    });
  });

  describe('simulator resolution', () => {
    it('resolves simulator name to UDID', async () => {
      mockGetBootedSimulators.mockResolvedValue({
        success: true,
        data: [
          { udid: 'sim-udid-1234', name: 'iPhone 15 Pro', state: 'Booted', runtime: 'iOS 17.0' },
        ],
      });
      getMockExecute().mockResolvedValue({
        success: true,
        data: createMockActionResult(),
      });

      await executeTapCommand(
        '/ios.tap #button --app com.test.app -s "iPhone 15 Pro"',
        'session-123'
      );

      expect(MockNativeDriver).toHaveBeenCalledWith(
        expect.objectContaining({
          bundleId: 'com.test.app',
          udid: 'sim-udid-1234',
        })
      );
    });

    it('uses UDID directly when provided', async () => {
      const udid = '12345678-1234-1234-1234-123456789012';
      getMockExecute().mockResolvedValue({
        success: true,
        data: createMockActionResult(),
      });

      await executeTapCommand(
        `/ios.tap #button --app com.test.app -s ${udid}`,
        'session-123'
      );

      expect(MockNativeDriver).toHaveBeenCalledWith(
        expect.objectContaining({
          bundleId: 'com.test.app',
          udid,
        })
      );
    });

    it('returns error when simulator not found', async () => {
      mockGetBootedSimulators.mockResolvedValue({
        success: true,
        data: [],
      });
      mockListSimulators.mockResolvedValue({
        success: true,
        data: [],
      });

      const result = await executeTapCommand(
        '/ios.tap #button --app com.test.app -s "Unknown Simulator"',
        'session-123'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('No simulator found');
    });
  });

  describe('tap actions', () => {
    beforeEach(() => {
      getMockExecute().mockResolvedValue({
        success: true,
        data: createMockActionResult(),
      });
    });

    it('executes tap on identifier target', async () => {
      const result = await executeTapCommand(
        '/ios.tap #login_button --app com.test.app',
        'session-123'
      );

      expect(result.success).toBe(true);
      expect(getMockExecute()).toHaveBeenCalled();
    });

    it('executes tap on label target', async () => {
      const result = await executeTapCommand(
        '/ios.tap "Sign In" --app com.test.app',
        'session-123'
      );

      expect(result.success).toBe(true);
      expect(getMockExecute()).toHaveBeenCalled();
    });

    it('executes tap on coordinate target', async () => {
      const result = await executeTapCommand(
        '/ios.tap 100,200 --app com.test.app',
        'session-123'
      );

      expect(result.success).toBe(true);
      expect(getMockExecute()).toHaveBeenCalled();
    });

    it('executes double tap when --double specified', async () => {
      await executeTapCommand(
        '/ios.tap #menu --double --app com.test.app',
        'session-123'
      );

      // Verify doubleTap action builder was used via the mock
      expect(getMockExecute()).toHaveBeenCalled();
    });

    it('executes long press when --long specified', async () => {
      await executeTapCommand(
        '/ios.tap #delete --long 2.5 --app com.test.app',
        'session-123'
      );

      expect(getMockExecute()).toHaveBeenCalled();
    });
  });

  describe('execution results', () => {
    it('returns success result with formatted output', async () => {
      getMockExecute().mockResolvedValue({
        success: true,
        data: createMockActionResult(true),
      });

      const result = await executeTapCommand(
        '/ios.tap #button --app com.test.app',
        'session-123'
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain('iOS Tap');
      expect(result.output).toContain('#button');
      expect(result.output).toContain('Success');
      expect(result.data).toBeDefined();
    });

    it('returns failure result with error details', async () => {
      getMockExecute().mockResolvedValue({
        success: true,
        data: createMockActionResult(false),
      });

      const result = await executeTapCommand(
        '/ios.tap #missing --app com.test.app',
        'session-123'
      );

      expect(result.success).toBe(false);
      expect(result.output).toContain('Failed');
      expect(result.output).toContain('Element not found');
    });

    it('returns suggestions when element not found', async () => {
      const actionResult = createMockActionResult(false);
      getMockExecute().mockResolvedValue({
        success: true,
        data: actionResult,
      });

      const result = await executeTapCommand(
        '/ios.tap #wrong_id --app com.test.app',
        'session-123'
      );

      expect(result.output).toContain('Similar Elements');
      expect(result.output).toContain('test_button_1');
    });

    it('returns execution error when driver fails', async () => {
      getMockExecute().mockResolvedValue({
        success: false,
        error: 'Driver initialization failed',
        errorCode: 'DRIVER_ERROR',
      });

      const result = await executeTapCommand(
        '/ios.tap #button --app com.test.app',
        'session-123'
      );

      expect(result.success).toBe(false);
      expect(result.output).toContain('Tap Failed');
      expect(result.output).toContain('Driver initialization failed');
    });
  });

  describe('output formatting', () => {
    it('includes element info for successful tap', async () => {
      getMockExecute().mockResolvedValue({
        success: true,
        data: createMockActionResult(true),
      });

      const result = await executeTapCommand(
        '/ios.tap #button --app com.test.app',
        'session-123'
      );

      expect(result.output).toContain('Element Info');
      expect(result.output).toContain('Button');
      expect(result.output).toContain('Enabled');
      expect(result.output).toContain('Hittable');
    });

    it('includes duration in output', async () => {
      getMockExecute().mockResolvedValue({
        success: true,
        data: createMockActionResult(true),
      });

      const result = await executeTapCommand(
        '/ios.tap #button --app com.test.app',
        'session-123'
      );

      expect(result.output).toContain('Duration');
      expect(result.output).toContain('150ms');
    });

    it('includes screenshot path when available', async () => {
      const actionResult = createMockActionResult(true);
      actionResult.details!.screenshotPath = '/path/to/screenshot.png';
      getMockExecute().mockResolvedValue({
        success: true,
        data: actionResult,
      });

      const result = await executeTapCommand(
        '/ios.tap #button --app com.test.app',
        'session-123'
      );

      expect(result.output).toContain('Screenshot');
      expect(result.output).toContain('/path/to/screenshot.png');
    });
  });
});

// =============================================================================
// tapCommandMetadata
// =============================================================================

describe('tapCommandMetadata', () => {
  it('has correct command name', () => {
    expect(tapCommandMetadata.command).toBe('/ios.tap');
  });

  it('has description', () => {
    expect(tapCommandMetadata.description).toBeTruthy();
    expect(tapCommandMetadata.description.length).toBeGreaterThan(10);
  });

  it('has usage string', () => {
    expect(tapCommandMetadata.usage).toBeTruthy();
    expect(tapCommandMetadata.usage).toContain('/ios.tap');
  });

  it('has options documented', () => {
    expect(tapCommandMetadata.options).toBeDefined();
    expect(Array.isArray(tapCommandMetadata.options)).toBe(true);
    expect(tapCommandMetadata.options.length).toBeGreaterThan(0);

    // Check required options exist
    const optionNames = tapCommandMetadata.options.map((o) => o.name);
    expect(optionNames.some((n) => n.includes('--app'))).toBe(true);
    expect(optionNames.some((n) => n.includes('--simulator'))).toBe(true);
    expect(optionNames.some((n) => n.includes('--double'))).toBe(true);
    expect(optionNames.some((n) => n.includes('--long'))).toBe(true);
  });

  it('has examples', () => {
    expect(tapCommandMetadata.examples).toBeDefined();
    expect(Array.isArray(tapCommandMetadata.examples)).toBe(true);
    expect(tapCommandMetadata.examples.length).toBeGreaterThan(0);

    // All examples should start with /ios.tap
    for (const example of tapCommandMetadata.examples) {
      expect(example.startsWith('/ios.tap')).toBe(true);
    }
  });
});
