/**
 * Tests for src/main/slash-commands/ios-snapshot.ts
 *
 * Tests cover argument parsing, command execution, and error handling
 * for the /ios.snapshot slash command.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  parseSnapshotArgs,
  executeSnapshotCommand,
  snapshotCommandMetadata,
  type SnapshotCommandArgs,
} from '../../../main/slash-commands/ios-snapshot';

// Mock ios-tools module
vi.mock('../../../main/ios-tools', () => ({
  captureSnapshot: vi.fn(),
  formatSnapshotForAgent: vi.fn(),
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
const mockCaptureSnapshot = vi.mocked(iosTools.captureSnapshot);
const mockFormatSnapshotForAgent = vi.mocked(iosTools.formatSnapshotForAgent);
const mockGetBootedSimulators = vi.mocked(iosTools.getBootedSimulators);
const mockListSimulators = vi.mocked(iosTools.listSimulators);

// =============================================================================
// Test Fixtures
// =============================================================================

function createMockSnapshotResult() {
  return {
    id: 'snapshot-001',
    timestamp: new Date('2024-01-15T10:30:00Z'),
    simulator: {
      udid: 'test-udid-1234',
      name: 'iPhone 15 Pro',
      iosVersion: '17.5',
    },
    screenshot: {
      path: '/path/to/screenshot.png',
      size: 123456,
    },
    logs: {
      entries: [],
      counts: { error: 0, fault: 0, warning: 0, info: 0, debug: 0 },
    },
    crashes: {
      hasCrashes: false,
      reports: [],
    },
    artifactDir: '/path/to/artifacts',
  };
}

// =============================================================================
// parseSnapshotArgs
// =============================================================================

describe('parseSnapshotArgs', () => {
  describe('empty input', () => {
    it('returns empty args for bare command', () => {
      const args = parseSnapshotArgs('/ios.snapshot');
      expect(args).toEqual({});
    });

    it('returns empty args for command with whitespace only', () => {
      const args = parseSnapshotArgs('/ios.snapshot   ');
      expect(args).toEqual({});
    });
  });

  describe('--simulator / -s', () => {
    it('parses --simulator with simulator name', () => {
      const args = parseSnapshotArgs('/ios.snapshot --simulator "iPhone 15 Pro"');
      expect(args.simulator).toBe('iPhone 15 Pro');
    });

    it('parses -s short form', () => {
      const args = parseSnapshotArgs('/ios.snapshot -s "iPhone 15"');
      expect(args.simulator).toBe('iPhone 15');
    });

    it('parses simulator UDID without quotes', () => {
      const args = parseSnapshotArgs('/ios.snapshot --simulator 12345678-1234-1234-1234-123456789012');
      expect(args.simulator).toBe('12345678-1234-1234-1234-123456789012');
    });

    it('parses simulator name with single quotes', () => {
      const args = parseSnapshotArgs("/ios.snapshot --simulator 'iPhone 15 Pro Max'");
      expect(args.simulator).toBe('iPhone 15 Pro Max');
    });
  });

  describe('--app / -a', () => {
    it('parses --app with bundle ID', () => {
      const args = parseSnapshotArgs('/ios.snapshot --app com.example.myapp');
      expect(args.app).toBe('com.example.myapp');
    });

    it('parses -a short form', () => {
      const args = parseSnapshotArgs('/ios.snapshot -a com.example.app');
      expect(args.app).toBe('com.example.app');
    });
  });

  describe('--output / -o', () => {
    it('parses --output with path', () => {
      const args = parseSnapshotArgs('/ios.snapshot --output /custom/path');
      expect(args.output).toBe('/custom/path');
    });

    it('parses -o short form', () => {
      const args = parseSnapshotArgs('/ios.snapshot -o /another/path');
      expect(args.output).toBe('/another/path');
    });

    it('parses path with spaces in quotes', () => {
      const args = parseSnapshotArgs('/ios.snapshot --output "/path/with spaces/dir"');
      expect(args.output).toBe('/path/with spaces/dir');
    });
  });

  describe('--duration / -d', () => {
    it('parses --duration with number', () => {
      const args = parseSnapshotArgs('/ios.snapshot --duration 120');
      expect(args.duration).toBe(120);
    });

    it('parses -d short form', () => {
      const args = parseSnapshotArgs('/ios.snapshot -d 30');
      expect(args.duration).toBe(30);
    });

    it('ignores invalid duration (non-number)', () => {
      const args = parseSnapshotArgs('/ios.snapshot --duration abc');
      expect(args.duration).toBeUndefined();
    });

    it('ignores negative duration', () => {
      const args = parseSnapshotArgs('/ios.snapshot --duration -10');
      expect(args.duration).toBeUndefined();
    });
  });

  describe('--include-crash', () => {
    it('parses --include-crash flag', () => {
      const args = parseSnapshotArgs('/ios.snapshot --include-crash');
      expect(args.includeCrash).toBe(true);
    });

    it('defaults includeCrash to undefined when not provided', () => {
      const args = parseSnapshotArgs('/ios.snapshot');
      expect(args.includeCrash).toBeUndefined();
    });
  });

  describe('combined arguments', () => {
    it('parses multiple short flags', () => {
      const args = parseSnapshotArgs('/ios.snapshot -s "iPhone 15" -a com.example.app -d 120');
      expect(args.simulator).toBe('iPhone 15');
      expect(args.app).toBe('com.example.app');
      expect(args.duration).toBe(120);
    });

    it('parses mixed long and short flags', () => {
      const args = parseSnapshotArgs('/ios.snapshot --simulator "iPhone 15 Pro" -a com.test.app --include-crash');
      expect(args.simulator).toBe('iPhone 15 Pro');
      expect(args.app).toBe('com.test.app');
      expect(args.includeCrash).toBe(true);
    });

    it('parses all options together', () => {
      const args = parseSnapshotArgs(
        '/ios.snapshot --simulator "iPhone 15" --app com.example.app --output /custom/path --duration 90 --include-crash'
      );
      expect(args.simulator).toBe('iPhone 15');
      expect(args.app).toBe('com.example.app');
      expect(args.output).toBe('/custom/path');
      expect(args.duration).toBe(90);
      expect(args.includeCrash).toBe(true);
    });
  });

  describe('raw/unknown arguments', () => {
    it('captures unknown positional arguments as raw', () => {
      const args = parseSnapshotArgs('/ios.snapshot some random text');
      expect(args.raw).toBe('some random text');
    });

    it('ignores unknown flags', () => {
      const args = parseSnapshotArgs('/ios.snapshot --unknown-flag');
      // Should not crash, unknown flag is stored in raw since it starts with -
      expect(args).toBeDefined();
    });
  });
});

// =============================================================================
// executeSnapshotCommand
// =============================================================================

describe('executeSnapshotCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('successful execution', () => {
    it('executes snapshot command with no arguments', async () => {
      const mockResult = createMockSnapshotResult();
      mockCaptureSnapshot.mockResolvedValue({
        success: true,
        data: mockResult,
      });
      mockFormatSnapshotForAgent.mockReturnValue({
        summary: 'Test summary',
        sections: {
          status: 'status',
          screenshot: 'screenshot',
          logs: 'logs',
          crashes: 'crashes',
        },
        fullOutput: '## iOS Snapshot\nFormatted output here',
      });

      const result = await executeSnapshotCommand('/ios.snapshot', 'test-session-id');

      expect(result.success).toBe(true);
      expect(result.output).toContain('iOS Snapshot');
      expect(result.data).toBeDefined();
      expect(mockCaptureSnapshot).toHaveBeenCalledWith({
        udid: undefined,
        bundleId: undefined,
        sessionId: 'test-session-id',
        logDuration: undefined,
        includeCrashContent: undefined,
      });
    });

    it('passes parsed arguments to captureSnapshot', async () => {
      const mockResult = createMockSnapshotResult();
      mockCaptureSnapshot.mockResolvedValue({
        success: true,
        data: mockResult,
      });
      mockFormatSnapshotForAgent.mockReturnValue({
        summary: 'Test summary',
        sections: { status: '', screenshot: '', logs: '', crashes: '' },
        fullOutput: 'Output',
      });

      await executeSnapshotCommand(
        '/ios.snapshot --simulator 12345678-1234-1234-1234-123456789012 --app com.example.app --duration 120 --include-crash',
        'session-123'
      );

      expect(mockCaptureSnapshot).toHaveBeenCalledWith({
        udid: '12345678-1234-1234-1234-123456789012',
        bundleId: 'com.example.app',
        sessionId: 'session-123',
        logDuration: 120,
        includeCrashContent: true,
      });
    });
  });

  describe('simulator name resolution', () => {
    it('resolves simulator name to UDID from booted simulators', async () => {
      const mockResult = createMockSnapshotResult();
      mockGetBootedSimulators.mockResolvedValue({
        success: true,
        data: [
          { udid: 'booted-udid-123', name: 'iPhone 15 Pro', state: 'Booted', iosVersion: '17.5' },
        ],
      });
      mockCaptureSnapshot.mockResolvedValue({
        success: true,
        data: mockResult,
      });
      mockFormatSnapshotForAgent.mockReturnValue({
        summary: 'Test summary',
        sections: { status: '', screenshot: '', logs: '', crashes: '' },
        fullOutput: 'Output',
      });

      await executeSnapshotCommand('/ios.snapshot --simulator "iPhone 15 Pro"', 'session-123');

      expect(mockGetBootedSimulators).toHaveBeenCalled();
      expect(mockCaptureSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          udid: 'booted-udid-123',
        })
      );
    });

    it('falls back to listSimulators if not booted', async () => {
      const mockResult = createMockSnapshotResult();
      mockGetBootedSimulators.mockResolvedValue({
        success: true,
        data: [], // No booted simulators
      });
      mockListSimulators.mockResolvedValue({
        success: true,
        data: [
          { udid: 'all-udid-456', name: 'iPhone 15', state: 'Shutdown', iosVersion: '17.5' },
        ],
      });
      mockCaptureSnapshot.mockResolvedValue({
        success: true,
        data: mockResult,
      });
      mockFormatSnapshotForAgent.mockReturnValue({
        summary: 'Test summary',
        sections: { status: '', screenshot: '', logs: '', crashes: '' },
        fullOutput: 'Output',
      });

      await executeSnapshotCommand('/ios.snapshot --simulator "iPhone 15"', 'session-123');

      expect(mockListSimulators).toHaveBeenCalled();
      expect(mockCaptureSnapshot).toHaveBeenCalledWith(
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

      const result = await executeSnapshotCommand(
        '/ios.snapshot --simulator "NonExistent Device"',
        'session-123'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('NonExistent Device');
      expect(result.output).toContain('Failed');
    });
  });

  describe('error handling', () => {
    it('handles captureSnapshot failure', async () => {
      mockCaptureSnapshot.mockResolvedValue({
        success: false,
        error: 'No booted simulator found',
      });

      const result = await executeSnapshotCommand('/ios.snapshot', 'session-123');

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

      const result = await executeSnapshotCommand(
        '/ios.snapshot --simulator "iPhone"',
        'session-123'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Xcode not installed');
    });
  });
});

// =============================================================================
// snapshotCommandMetadata
// =============================================================================

describe('snapshotCommandMetadata', () => {
  it('has correct command name', () => {
    expect(snapshotCommandMetadata.command).toBe('/ios.snapshot');
  });

  it('has description', () => {
    expect(snapshotCommandMetadata.description).toBeTruthy();
    expect(typeof snapshotCommandMetadata.description).toBe('string');
  });

  it('has usage string', () => {
    expect(snapshotCommandMetadata.usage).toBeTruthy();
    expect(snapshotCommandMetadata.usage).toContain('/ios.snapshot');
  });

  it('has options defined', () => {
    expect(Array.isArray(snapshotCommandMetadata.options)).toBe(true);
    expect(snapshotCommandMetadata.options.length).toBeGreaterThan(0);

    // Check structure of first option
    const firstOption = snapshotCommandMetadata.options[0];
    expect(firstOption).toHaveProperty('name');
    expect(firstOption).toHaveProperty('description');
  });

  it('has examples', () => {
    expect(Array.isArray(snapshotCommandMetadata.examples)).toBe(true);
    expect(snapshotCommandMetadata.examples.length).toBeGreaterThan(0);
    expect(snapshotCommandMetadata.examples.every((ex) => ex.startsWith('/ios.snapshot'))).toBe(
      true
    );
  });

  it('documents all supported options', () => {
    const optionNames = snapshotCommandMetadata.options.map((o) => o.name);
    expect(optionNames.some((n) => n.includes('--simulator'))).toBe(true);
    expect(optionNames.some((n) => n.includes('--app'))).toBe(true);
    expect(optionNames.some((n) => n.includes('--output'))).toBe(true);
    expect(optionNames.some((n) => n.includes('--duration'))).toBe(true);
    expect(optionNames.some((n) => n.includes('--include-crash'))).toBe(true);
  });
});
