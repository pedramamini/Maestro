/**
 * Tests for src/main/slash-commands/ios-inspect.ts
 *
 * Tests cover argument parsing, element query parsing, command execution,
 * and error handling for the /ios.inspect slash command.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  parseInspectArgs,
  parseElementQuery,
  executeInspectCommand,
  inspectCommandMetadata,
  type InspectCommandArgs,
} from '../../../main/slash-commands/ios-inspect';

// Mock ios-tools module
vi.mock('../../../main/ios-tools', () => ({
  inspect: vi.fn(),
  findElements: vi.fn(),
  formatInspectForAgent: vi.fn(),
  formatInspectAsJson: vi.fn(),
  formatInspectCompact: vi.fn(),
  formatElementQuery: vi.fn(),
  formatActionSuggestions: vi.fn(),
  getBootedSimulators: vi.fn(),
  listSimulators: vi.fn(),
}));

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
const mockInspect = vi.mocked(iosTools.inspect);
const mockFindElements = vi.mocked(iosTools.findElements);
const mockFormatInspectForAgent = vi.mocked(iosTools.formatInspectForAgent);
const mockFormatInspectAsJson = vi.mocked(iosTools.formatInspectAsJson);
const mockFormatInspectCompact = vi.mocked(iosTools.formatInspectCompact);
const mockFormatElementQuery = vi.mocked(iosTools.formatElementQuery);
const mockFormatActionSuggestions = vi.mocked(iosTools.formatActionSuggestions);
const mockGetBootedSimulators = vi.mocked(iosTools.getBootedSimulators);
const mockListSimulators = vi.mocked(iosTools.listSimulators);

// =============================================================================
// Test Fixtures
// =============================================================================

function createMockUIElement(overrides: Partial<iosTools.UIElement> = {}): iosTools.UIElement {
  return {
    type: 'Other',
    frame: { x: 0, y: 0, width: 100, height: 50 },
    enabled: true,
    visible: true,
    traits: [],
    children: [],
    ...overrides,
  };
}

function createMockInspectResult(): iosTools.InspectResult {
  const tree = createMockUIElement({
    type: 'Application',
    identifier: 'app',
    children: [
      createMockUIElement({
        type: 'Button',
        identifier: 'login_button',
        label: 'Log In',
        frame: { x: 20, y: 320, width: 353, height: 50 },
      }),
      createMockUIElement({
        type: 'TextField',
        identifier: 'email_field',
        label: 'Email',
        frame: { x: 20, y: 180, width: 353, height: 44 },
      }),
    ],
  });

  return {
    id: 'test-inspect-001',
    timestamp: new Date('2024-01-15T10:30:00Z'),
    simulator: {
      udid: 'test-udid-1234',
      name: 'iPhone 15 Pro',
      iosVersion: '17.5',
    },
    tree,
    elements: [tree, ...tree.children],
    stats: {
      totalElements: 3,
      interactableElements: 2,
      textElements: 0,
      buttons: 1,
      textFields: 1,
      images: 0,
    },
    screenshot: {
      path: '/path/to/screenshot.png',
      size: 123456,
    },
    artifactDir: '/path/to/artifacts',
    rawOutput: 'Raw accessibility output here',
  };
}

// =============================================================================
// parseInspectArgs
// =============================================================================

describe('parseInspectArgs', () => {
  describe('empty input', () => {
    it('returns empty args for bare command', () => {
      const args = parseInspectArgs('/ios.inspect');
      expect(args).toEqual({});
    });

    it('returns empty args for command with whitespace only', () => {
      const args = parseInspectArgs('/ios.inspect   ');
      expect(args).toEqual({});
    });
  });

  describe('--app / -a (bundle ID)', () => {
    it('parses --app with bundle ID', () => {
      const args = parseInspectArgs('/ios.inspect --app com.example.myapp');
      expect(args.app).toBe('com.example.myapp');
    });

    it('parses -a short form', () => {
      const args = parseInspectArgs('/ios.inspect -a com.example.app');
      expect(args.app).toBe('com.example.app');
    });

    it('parses bundle ID with hyphens and underscores', () => {
      const args = parseInspectArgs('/ios.inspect --app com.my-company.my_app');
      expect(args.app).toBe('com.my-company.my_app');
    });
  });

  describe('--simulator / -s', () => {
    it('parses --simulator with simulator name', () => {
      const args = parseInspectArgs('/ios.inspect --app com.test.app --simulator "iPhone 15 Pro"');
      expect(args.simulator).toBe('iPhone 15 Pro');
    });

    it('parses -s short form', () => {
      const args = parseInspectArgs('/ios.inspect --app com.test.app -s "iPhone 15"');
      expect(args.simulator).toBe('iPhone 15');
    });

    it('parses simulator UDID without quotes', () => {
      const args = parseInspectArgs(
        '/ios.inspect --app com.test.app --simulator 12345678-1234-1234-1234-123456789012'
      );
      expect(args.simulator).toBe('12345678-1234-1234-1234-123456789012');
    });

    it('parses simulator name with single quotes', () => {
      const args = parseInspectArgs("/ios.inspect --app com.test.app --simulator 'iPhone 15 Pro Max'");
      expect(args.simulator).toBe('iPhone 15 Pro Max');
    });
  });

  describe('--element / -e', () => {
    it('parses --element with identifier query', () => {
      const args = parseInspectArgs('/ios.inspect --app com.test.app --element #login_button');
      expect(args.element).toBe('#login_button');
    });

    it('parses -e short form', () => {
      const args = parseInspectArgs('/ios.inspect --app com.test.app -e #submit');
      expect(args.element).toBe('#submit');
    });

    it('parses quoted label query', () => {
      const args = parseInspectArgs('/ios.inspect --app com.test.app --element "Log In"');
      expect(args.element).toBe('Log In');
    });

    it('parses type query', () => {
      const args = parseInspectArgs('/ios.inspect --app com.test.app --element Button');
      expect(args.element).toBe('Button');
    });

    it('parses contains query', () => {
      const args = parseInspectArgs('/ios.inspect --app com.test.app --element "*submit*"');
      expect(args.element).toBe('*submit*');
    });

    it('parses combined type#identifier query', () => {
      const args = parseInspectArgs('/ios.inspect --app com.test.app --element Button#login');
      expect(args.element).toBe('Button#login');
    });

    it('parses multiple queries (comma-separated)', () => {
      const args = parseInspectArgs('/ios.inspect --app com.test.app --element "#btn1, #btn2"');
      expect(args.element).toBe('#btn1, #btn2');
    });
  });

  describe('--depth / -d', () => {
    it('parses --depth with number', () => {
      const args = parseInspectArgs('/ios.inspect --app com.test.app --depth 5');
      expect(args.depth).toBe(5);
    });

    it('parses -d short form', () => {
      const args = parseInspectArgs('/ios.inspect --app com.test.app -d 10');
      expect(args.depth).toBe(10);
    });

    it('ignores invalid depth (non-number)', () => {
      const args = parseInspectArgs('/ios.inspect --app com.test.app --depth abc');
      expect(args.depth).toBeUndefined();
    });

    it('ignores zero depth', () => {
      const args = parseInspectArgs('/ios.inspect --app com.test.app --depth 0');
      expect(args.depth).toBeUndefined();
    });

    it('ignores negative depth', () => {
      const args = parseInspectArgs('/ios.inspect --app com.test.app --depth -5');
      expect(args.depth).toBeUndefined();
    });
  });

  describe('--format / -f', () => {
    it('parses --format full', () => {
      const args = parseInspectArgs('/ios.inspect --app com.test.app --format full');
      expect(args.format).toBe('full');
    });

    it('parses --format compact', () => {
      const args = parseInspectArgs('/ios.inspect --app com.test.app --format compact');
      expect(args.format).toBe('compact');
    });

    it('parses --format json', () => {
      const args = parseInspectArgs('/ios.inspect --app com.test.app --format json');
      expect(args.format).toBe('json');
    });

    it('parses -f short form', () => {
      const args = parseInspectArgs('/ios.inspect --app com.test.app -f compact');
      expect(args.format).toBe('compact');
    });

    it('ignores invalid format', () => {
      const args = parseInspectArgs('/ios.inspect --app com.test.app --format invalid');
      expect(args.format).toBeUndefined();
    });

    it('normalizes format to lowercase', () => {
      const args = parseInspectArgs('/ios.inspect --app com.test.app --format JSON');
      expect(args.format).toBe('json');
    });
  });

  describe('--no-screenshot flag', () => {
    it('parses --no-screenshot flag', () => {
      const args = parseInspectArgs('/ios.inspect --app com.test.app --no-screenshot');
      expect(args.noScreenshot).toBe(true);
    });

    it('defaults noScreenshot to undefined when not provided', () => {
      const args = parseInspectArgs('/ios.inspect --app com.test.app');
      expect(args.noScreenshot).toBeUndefined();
    });
  });

  describe('combined arguments', () => {
    it('parses multiple short flags', () => {
      const args = parseInspectArgs('/ios.inspect -a com.example.app -s "iPhone 15" -e #button -d 5 -f compact');
      expect(args.app).toBe('com.example.app');
      expect(args.simulator).toBe('iPhone 15');
      expect(args.element).toBe('#button');
      expect(args.depth).toBe(5);
      expect(args.format).toBe('compact');
    });

    it('parses mixed long and short flags', () => {
      const args = parseInspectArgs(
        '/ios.inspect --app com.test.app -s "iPhone 15 Pro" --element Button --no-screenshot'
      );
      expect(args.app).toBe('com.test.app');
      expect(args.simulator).toBe('iPhone 15 Pro');
      expect(args.element).toBe('Button');
      expect(args.noScreenshot).toBe(true);
    });

    it('parses all options together', () => {
      const args = parseInspectArgs(
        '/ios.inspect --app com.example.app --simulator "iPhone 15" --element #login --depth 10 --format json --no-screenshot'
      );
      expect(args.app).toBe('com.example.app');
      expect(args.simulator).toBe('iPhone 15');
      expect(args.element).toBe('#login');
      expect(args.depth).toBe(10);
      expect(args.format).toBe('json');
      expect(args.noScreenshot).toBe(true);
    });
  });

  describe('raw/unknown arguments', () => {
    it('captures unknown positional arguments as raw', () => {
      const args = parseInspectArgs('/ios.inspect --app com.test.app some random text');
      expect(args.raw).toBe('some random text');
    });

    it('ignores unknown flags', () => {
      const args = parseInspectArgs('/ios.inspect --app com.test.app --unknown-flag');
      // Should not crash, unknown flag is silently ignored
      expect(args).toBeDefined();
    });
  });
});

// =============================================================================
// parseElementQuery
// =============================================================================

describe('parseElementQuery', () => {
  describe('identifier query (#identifier)', () => {
    it('parses identifier with # prefix', () => {
      const query = parseElementQuery('#login_button');
      expect(query.identifier).toBe('login_button');
      expect(query.type).toBeUndefined();
      expect(query.label).toBeUndefined();
      expect(query.containsText).toBeUndefined();
    });

    it('parses identifier with hyphens', () => {
      const query = parseElementQuery('#my-element-id');
      expect(query.identifier).toBe('my-element-id');
    });

    it('parses identifier with underscores', () => {
      const query = parseElementQuery('#my_element_id');
      expect(query.identifier).toBe('my_element_id');
    });

    it('parses simple alphanumeric identifier', () => {
      const query = parseElementQuery('#btn1');
      expect(query.identifier).toBe('btn1');
    });
  });

  describe('label query ("label text")', () => {
    it('parses label with double quotes', () => {
      const query = parseElementQuery('"Log In"');
      expect(query.label).toBe('Log In');
      expect(query.identifier).toBeUndefined();
      expect(query.type).toBeUndefined();
    });

    it('parses label with single quotes', () => {
      const query = parseElementQuery("'Submit Form'");
      expect(query.label).toBe('Submit Form');
    });

    it('parses label with special characters', () => {
      const query = parseElementQuery('"Don\'t click!"');
      expect(query.label).toBe("Don't click!");
    });

    it('does not parse empty quotes as label (requires content)', () => {
      // Empty quotes "" don't match the label pattern (.+ requires at least one char)
      // so it falls back to containsText
      const query = parseElementQuery('""');
      expect(query.label).toBeUndefined();
      expect(query.containsText).toBe('""');
    });
  });

  describe('type query (Type)', () => {
    it('parses Button type', () => {
      const query = parseElementQuery('Button');
      expect(query.type).toBe('Button');
      expect(query.identifier).toBeUndefined();
    });

    it('parses TextField type', () => {
      const query = parseElementQuery('TextField');
      expect(query.type).toBe('TextField');
    });

    it('parses StaticText type', () => {
      const query = parseElementQuery('StaticText');
      expect(query.type).toBe('StaticText');
    });

    it('parses ScrollView type', () => {
      const query = parseElementQuery('ScrollView');
      expect(query.type).toBe('ScrollView');
    });

    it('parses NavigationBar type', () => {
      const query = parseElementQuery('NavigationBar');
      expect(query.type).toBe('NavigationBar');
    });

    it('parses Switch type', () => {
      const query = parseElementQuery('Switch');
      expect(query.type).toBe('Switch');
    });

    it('parses Image type', () => {
      const query = parseElementQuery('Image');
      expect(query.type).toBe('Image');
    });

    it('parses SecureTextField type', () => {
      const query = parseElementQuery('SecureTextField');
      expect(query.type).toBe('SecureTextField');
    });

    it('does not treat lowercase as type', () => {
      const query = parseElementQuery('button');
      expect(query.type).toBeUndefined();
      expect(query.containsText).toBe('button');
    });

    it('does not treat numbers as type', () => {
      const query = parseElementQuery('Button123');
      expect(query.type).toBeUndefined();
      expect(query.containsText).toBe('Button123');
    });
  });

  describe('combined type#identifier query', () => {
    it('parses Button#login_button', () => {
      const query = parseElementQuery('Button#login_button');
      expect(query.type).toBe('Button');
      expect(query.identifier).toBe('login_button');
      expect(query.label).toBeUndefined();
    });

    it('parses TextField#email_field', () => {
      const query = parseElementQuery('TextField#email_field');
      expect(query.type).toBe('TextField');
      expect(query.identifier).toBe('email_field');
    });

    it('parses identifier with hyphens in combined query', () => {
      const query = parseElementQuery('Button#my-button');
      expect(query.type).toBe('Button');
      expect(query.identifier).toBe('my-button');
    });

    it('parses NavigationBar#nav', () => {
      const query = parseElementQuery('NavigationBar#nav');
      expect(query.type).toBe('NavigationBar');
      expect(query.identifier).toBe('nav');
    });
  });

  describe('contains query (*text*)', () => {
    it('parses *submit* contains query', () => {
      const query = parseElementQuery('*submit*');
      expect(query.containsText).toBe('submit');
      expect(query.identifier).toBeUndefined();
      expect(query.type).toBeUndefined();
    });

    it('parses *password* contains query', () => {
      const query = parseElementQuery('*password*');
      expect(query.containsText).toBe('password');
    });

    it('parses *login* contains query', () => {
      const query = parseElementQuery('*login*');
      expect(query.containsText).toBe('login');
    });

    it('parses contains with spaces', () => {
      const query = parseElementQuery('*log in*');
      expect(query.containsText).toBe('log in');
    });

    it('parses contains with special characters', () => {
      const query = parseElementQuery('*user@email*');
      expect(query.containsText).toBe('user@email');
    });
  });

  describe('multiple queries (comma-separated)', () => {
    it('parses comma-separated queries', () => {
      const query = parseElementQuery('#btn1, #btn2');
      // For multiple queries, the full string is stored in containsText
      // The actual multi-query handling happens in executeInspectCommand
      expect(query.containsText).toBe('#btn1, #btn2');
    });

    it('parses mixed query types', () => {
      const query = parseElementQuery('#login, Button, "Submit"');
      expect(query.containsText).toBe('#login, Button, "Submit"');
    });

    it('parses three or more queries', () => {
      const query = parseElementQuery('#a, #b, #c, #d');
      expect(query.containsText).toBe('#a, #b, #c, #d');
    });
  });

  describe('fallback to containsText', () => {
    it('treats unquoted text without special chars as containsText', () => {
      const query = parseElementQuery('submit');
      expect(query.containsText).toBe('submit');
    });

    it('treats mixed case text as containsText', () => {
      const query = parseElementQuery('loginButton');
      expect(query.containsText).toBe('loginButton');
    });

    it('treats text with numbers as containsText', () => {
      const query = parseElementQuery('button123');
      expect(query.containsText).toBe('button123');
    });

    it('treats text with underscores as containsText', () => {
      const query = parseElementQuery('login_button');
      expect(query.containsText).toBe('login_button');
    });
  });

  describe('edge cases', () => {
    it('handles empty string', () => {
      const query = parseElementQuery('');
      expect(query.containsText).toBe('');
    });

    it('handles whitespace only', () => {
      const query = parseElementQuery('   ');
      expect(query.containsText).toBe('   ');
    });

    it('handles # alone', () => {
      const query = parseElementQuery('#');
      expect(query.identifier).toBe('');
    });

    it('handles * alone (start of contains)', () => {
      const query = parseElementQuery('*');
      expect(query.containsText).toBe('*');
    });

    it('handles *text without closing *', () => {
      const query = parseElementQuery('*incomplete');
      expect(query.containsText).toBe('*incomplete');
    });

    it('handles Type# without identifier', () => {
      // This won't match the combined pattern, so falls through
      const query = parseElementQuery('Button#');
      expect(query.containsText).toBe('Button#');
    });
  });
});

// =============================================================================
// executeInspectCommand
// =============================================================================

describe('executeInspectCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('validation', () => {
    it('returns error when --app is missing', async () => {
      const result = await executeInspectCommand('/ios.inspect', 'test-session-id');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Bundle ID is required');
      expect(result.output).toContain('Missing required argument');
    });
  });

  describe('successful execution', () => {
    it('executes inspect command with app argument', async () => {
      const mockResult = createMockInspectResult();
      mockInspect.mockResolvedValue({
        success: true,
        data: mockResult,
      });
      mockFormatInspectForAgent.mockReturnValue({
        summary: 'Test summary',
        sections: {
          status: 'status',
          interactables: 'interactables',
          tree: 'tree',
          screenshot: 'screenshot',
        },
        fullOutput: '## iOS UI Inspection\nFormatted output here',
      });

      const result = await executeInspectCommand('/ios.inspect --app com.test.app', 'test-session-id');

      expect(result.success).toBe(true);
      expect(result.output).toContain('iOS UI Inspection');
      expect(result.data).toBeDefined();
      expect(mockInspect).toHaveBeenCalledWith({
        udid: undefined,
        bundleId: 'com.test.app',
        sessionId: 'test-session-id',
        captureScreenshot: true,
      });
    });

    it('passes noScreenshot flag to inspect', async () => {
      const mockResult = createMockInspectResult();
      mockInspect.mockResolvedValue({
        success: true,
        data: mockResult,
      });
      mockFormatInspectForAgent.mockReturnValue({
        summary: 'Test summary',
        sections: { status: '', interactables: '', tree: '', screenshot: '' },
        fullOutput: 'Output',
      });

      await executeInspectCommand(
        '/ios.inspect --app com.test.app --no-screenshot',
        'session-123'
      );

      expect(mockInspect).toHaveBeenCalledWith(
        expect.objectContaining({
          captureScreenshot: false,
        })
      );
    });
  });

  describe('output format', () => {
    beforeEach(() => {
      const mockResult = createMockInspectResult();
      mockInspect.mockResolvedValue({
        success: true,
        data: mockResult,
      });
    });

    it('uses full format by default', async () => {
      mockFormatInspectForAgent.mockReturnValue({
        summary: 'Test summary',
        sections: { status: '', interactables: '', tree: '', screenshot: '' },
        fullOutput: 'Full format output',
      });

      const result = await executeInspectCommand('/ios.inspect --app com.test.app', 'session-123');

      expect(mockFormatInspectForAgent).toHaveBeenCalled();
      expect(result.output).toBe('Full format output');
    });

    it('uses compact format when specified', async () => {
      mockFormatInspectCompact.mockReturnValue('Compact format output');

      const result = await executeInspectCommand(
        '/ios.inspect --app com.test.app --format compact',
        'session-123'
      );

      expect(mockFormatInspectCompact).toHaveBeenCalled();
      expect(result.output).toBe('Compact format output');
    });

    it('uses JSON format when specified', async () => {
      mockFormatInspectAsJson.mockReturnValue('{"format": "json"}');

      const result = await executeInspectCommand(
        '/ios.inspect --app com.test.app --format json',
        'session-123'
      );

      expect(mockFormatInspectAsJson).toHaveBeenCalled();
      expect(result.output).toBe('{"format": "json"}');
    });
  });

  describe('element query handling', () => {
    beforeEach(() => {
      const mockResult = createMockInspectResult();
      mockInspect.mockResolvedValue({
        success: true,
        data: mockResult,
      });
    });

    it('handles single element query', async () => {
      const mockButton = createMockUIElement({
        type: 'Button',
        identifier: 'login_button',
        label: 'Log In',
      });
      mockFindElements.mockReturnValue({
        query: { identifier: 'login_button' },
        elements: [mockButton],
        totalSearched: 3,
      });
      mockFormatElementQuery.mockReturnValue('Query result formatted');
      mockFormatActionSuggestions.mockReturnValue('Action suggestions');

      const result = await executeInspectCommand(
        '/ios.inspect --app com.test.app --element #login_button',
        'session-123'
      );

      expect(mockFindElements).toHaveBeenCalled();
      expect(mockFormatElementQuery).toHaveBeenCalled();
      expect(mockFormatActionSuggestions).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.output).toContain('Query result formatted');
      expect(result.output).toContain('Action suggestions');
    });

    it('handles multiple element query', async () => {
      const mockButton1 = createMockUIElement({
        type: 'Button',
        identifier: 'btn1',
        label: 'Button 1',
      });
      const mockButton2 = createMockUIElement({
        type: 'Button',
        identifier: 'btn2',
        label: 'Button 2',
      });

      mockFindElements
        .mockReturnValueOnce({
          query: { identifier: 'btn1' },
          elements: [mockButton1],
          totalSearched: 3,
        })
        .mockReturnValueOnce({
          query: { identifier: 'btn2' },
          elements: [mockButton2],
          totalSearched: 3,
        });
      mockFormatElementQuery.mockReturnValue('Multiple elements formatted');

      const result = await executeInspectCommand(
        '/ios.inspect --app com.test.app --element "#btn1, #btn2"',
        'session-123'
      );

      expect(mockFindElements).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(true);
    });

    it('returns JSON for element query when format is json', async () => {
      const mockButton = createMockUIElement({
        type: 'Button',
        identifier: 'test',
      });
      mockFindElements.mockReturnValue({
        query: { identifier: 'test' },
        elements: [mockButton],
        totalSearched: 3,
      });

      const result = await executeInspectCommand(
        '/ios.inspect --app com.test.app --element #test --format json',
        'session-123'
      );

      expect(result.success).toBe(true);
      expect(() => JSON.parse(result.output)).not.toThrow();
    });
  });

  describe('simulator name resolution', () => {
    it('resolves simulator name to UDID from booted simulators', async () => {
      const mockResult = createMockInspectResult();
      mockGetBootedSimulators.mockResolvedValue({
        success: true,
        data: [
          { udid: 'booted-udid-123', name: 'iPhone 15 Pro', state: 'Booted', iosVersion: '17.5' },
        ],
      });
      mockInspect.mockResolvedValue({
        success: true,
        data: mockResult,
      });
      mockFormatInspectForAgent.mockReturnValue({
        summary: 'Test summary',
        sections: { status: '', interactables: '', tree: '', screenshot: '' },
        fullOutput: 'Output',
      });

      await executeInspectCommand(
        '/ios.inspect --app com.test.app --simulator "iPhone 15 Pro"',
        'session-123'
      );

      expect(mockGetBootedSimulators).toHaveBeenCalled();
      expect(mockInspect).toHaveBeenCalledWith(
        expect.objectContaining({
          udid: 'booted-udid-123',
        })
      );
    });

    it('falls back to listSimulators if not booted', async () => {
      const mockResult = createMockInspectResult();
      mockGetBootedSimulators.mockResolvedValue({
        success: true,
        data: [],
      });
      mockListSimulators.mockResolvedValue({
        success: true,
        data: [
          { udid: 'all-udid-456', name: 'iPhone 15', state: 'Shutdown', iosVersion: '17.5' },
        ],
      });
      mockInspect.mockResolvedValue({
        success: true,
        data: mockResult,
      });
      mockFormatInspectForAgent.mockReturnValue({
        summary: 'Test summary',
        sections: { status: '', interactables: '', tree: '', screenshot: '' },
        fullOutput: 'Output',
      });

      await executeInspectCommand(
        '/ios.inspect --app com.test.app --simulator "iPhone 15"',
        'session-123'
      );

      expect(mockListSimulators).toHaveBeenCalled();
      expect(mockInspect).toHaveBeenCalledWith(
        expect.objectContaining({
          udid: 'all-udid-456',
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

      const result = await executeInspectCommand(
        '/ios.inspect --app com.test.app --simulator "NonExistent Device"',
        'session-123'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('NonExistent Device');
      expect(result.output).toContain('Failed');
    });

    it('uses partial match for simulator name', async () => {
      const mockResult = createMockInspectResult();
      mockGetBootedSimulators.mockResolvedValue({
        success: true,
        data: [],
      });
      mockListSimulators.mockResolvedValue({
        success: true,
        data: [
          { udid: 'partial-udid-789', name: 'iPhone 15 Pro Max', state: 'Shutdown', iosVersion: '17.5' },
        ],
      });
      mockInspect.mockResolvedValue({
        success: true,
        data: mockResult,
      });
      mockFormatInspectForAgent.mockReturnValue({
        summary: 'Test summary',
        sections: { status: '', interactables: '', tree: '', screenshot: '' },
        fullOutput: 'Output',
      });

      await executeInspectCommand(
        '/ios.inspect --app com.test.app --simulator "iPhone 15"',
        'session-123'
      );

      expect(mockInspect).toHaveBeenCalledWith(
        expect.objectContaining({
          udid: 'partial-udid-789',
        })
      );
    });
  });

  describe('error handling', () => {
    it('handles inspect failure', async () => {
      mockInspect.mockResolvedValue({
        success: false,
        error: 'No booted simulator found',
      });

      const result = await executeInspectCommand('/ios.inspect --app com.test.app', 'session-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('No booted simulator found');
      expect(result.output).toContain('No booted simulator found');
      expect(result.output).toContain('Troubleshooting');
    });

    it('handles listSimulators failure', async () => {
      mockGetBootedSimulators.mockResolvedValue({
        success: true,
        data: [],
      });
      mockListSimulators.mockResolvedValue({
        success: false,
        error: 'Xcode not installed',
      });

      const result = await executeInspectCommand(
        '/ios.inspect --app com.test.app --simulator "iPhone"',
        'session-123'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Xcode not installed');
    });
  });
});

// =============================================================================
// inspectCommandMetadata
// =============================================================================

describe('inspectCommandMetadata', () => {
  it('has correct command name', () => {
    expect(inspectCommandMetadata.command).toBe('/ios.inspect');
  });

  it('has description', () => {
    expect(inspectCommandMetadata.description).toBeTruthy();
    expect(typeof inspectCommandMetadata.description).toBe('string');
  });

  it('has usage string', () => {
    expect(inspectCommandMetadata.usage).toBeTruthy();
    expect(inspectCommandMetadata.usage).toContain('/ios.inspect');
    expect(inspectCommandMetadata.usage).toContain('--app');
  });

  it('has options defined', () => {
    expect(Array.isArray(inspectCommandMetadata.options)).toBe(true);
    expect(inspectCommandMetadata.options.length).toBeGreaterThan(0);

    // Check structure of first option
    const firstOption = inspectCommandMetadata.options[0];
    expect(firstOption).toHaveProperty('name');
    expect(firstOption).toHaveProperty('description');
  });

  it('has examples', () => {
    expect(Array.isArray(inspectCommandMetadata.examples)).toBe(true);
    expect(inspectCommandMetadata.examples.length).toBeGreaterThan(0);
    expect(inspectCommandMetadata.examples.every((ex) => ex.startsWith('/ios.inspect'))).toBe(true);
  });

  it('documents all supported options', () => {
    const optionNames = inspectCommandMetadata.options.map((o) => o.name);
    expect(optionNames.some((n) => n.includes('--app'))).toBe(true);
    expect(optionNames.some((n) => n.includes('--simulator'))).toBe(true);
    expect(optionNames.some((n) => n.includes('--element'))).toBe(true);
    expect(optionNames.some((n) => n.includes('--depth'))).toBe(true);
    expect(optionNames.some((n) => n.includes('--format'))).toBe(true);
    expect(optionNames.some((n) => n.includes('--no-screenshot'))).toBe(true);
  });

  it('includes element query syntax examples', () => {
    const hasIdentifierExample = inspectCommandMetadata.examples.some((ex) => ex.includes('#'));
    const hasTypeExample = inspectCommandMetadata.examples.some((ex) => ex.includes('Button'));
    const hasContainsExample = inspectCommandMetadata.examples.some((ex) => ex.includes('*'));

    expect(hasIdentifierExample).toBe(true);
    expect(hasTypeExample || hasContainsExample).toBe(true);
  });
});
