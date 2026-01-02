import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies before importing the module under test
vi.mock('../../../../main/ios-tools/simulator', () => ({
  getBootedSimulators: vi.fn(),
  getSimulator: vi.fn(),
}));

vi.mock('../../../../main/ios-tools/logs', () => ({
  getSystemLog: vi.fn(),
}));

vi.mock('../../../../main/ios-tools/capture', () => ({
  screenshot: vi.fn(),
}));

vi.mock('../../../../main/ios-tools/artifacts', () => ({
  getSnapshotDirectory: vi.fn(),
}));

import {
  assertLogContains,
  assertLogContainsPattern,
  assertLogContainsExact,
  assertLogMatches,
  assertLogNotContains,
  assertLogContainsForApp,
  countLogMatches,
  hasLogPattern,
} from '../../../../main/ios-tools/assertions/log-contains';
import { getBootedSimulators, getSimulator } from '../../../../main/ios-tools/simulator';
import { getSystemLog } from '../../../../main/ios-tools/logs';
import { screenshot } from '../../../../main/ios-tools/capture';
import { getSnapshotDirectory } from '../../../../main/ios-tools/artifacts';

describe('log-contains assertions', () => {
  const mockSimulator = {
    udid: 'test-udid-1234',
    name: 'iPhone 15 Pro',
    state: 'Booted',
    iosVersion: '17.0',
  };

  const mockLogs = [
    { timestamp: new Date('2024-01-01T10:00:00Z'), process: 'MyApp', pid: 1234, level: 'default' as const, message: 'App launched successfully' },
    { timestamp: new Date('2024-01-01T10:00:01Z'), process: 'MyApp', pid: 1234, level: 'info' as const, message: 'Login successful for user: john@example.com' },
    { timestamp: new Date('2024-01-01T10:00:02Z'), process: 'MyApp', pid: 1234, level: 'error' as const, message: 'API request failed: HTTP 500' },
    { timestamp: new Date('2024-01-01T10:00:03Z'), process: 'MyApp', pid: 1234, level: 'default' as const, message: 'Network retry attempt 1' },
    { timestamp: new Date('2024-01-01T10:00:04Z'), process: 'MyApp', pid: 1234, level: 'default' as const, message: 'Analytics event: button_tap' },
  ];

  beforeEach(() => {
    vi.resetAllMocks();

    // Default mock implementations
    (getBootedSimulators as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: [mockSimulator],
    });

    (getSimulator as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: mockSimulator,
    });

    (getSystemLog as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: mockLogs,
    });

    (getSnapshotDirectory as ReturnType<typeof vi.fn>).mockResolvedValue('/tmp/snapshots/test');

    (screenshot as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { path: '/tmp/screenshot.png' },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('assertLogContains', () => {
    it('should pass when pattern is found in logs', async () => {
      const result = await assertLogContains('Login successful', {
        sessionId: 'test-session',
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
      expect(result.data?.status).toBe('passed');
      expect(result.data?.data?.matchCount).toBe(1);
    });

    it('should fail when pattern is not found in logs', async () => {
      const result = await assertLogContains('pattern not in logs', {
        sessionId: 'test-session',
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(false);
      expect(result.data?.status).toBe('failed');
      expect(result.data?.data?.matchCount).toBe(0);
    });

    it('should support case-insensitive matching by default', async () => {
      const result = await assertLogContains('login SUCCESSFUL', {
        sessionId: 'test-session',
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
    });

    it('should support case-sensitive matching when enabled', async () => {
      const result = await assertLogContains('LOGIN SUCCESSFUL', {
        sessionId: 'test-session',
        caseSensitive: true,
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(false);
    });

    it('should match multiple occurrences', async () => {
      // Add more logs with the same pattern
      (getSystemLog as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: [
          { timestamp: new Date(), process: 'MyApp', pid: 1234, level: 'default' as const, message: 'request sent' },
          { timestamp: new Date(), process: 'MyApp', pid: 1234, level: 'default' as const, message: 'request sent' },
          { timestamp: new Date(), process: 'MyApp', pid: 1234, level: 'default' as const, message: 'request sent' },
        ],
      });

      const result = await assertLogContains('request sent', {
        sessionId: 'test-session',
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
      expect(result.data?.data?.matchCount).toBe(3);
    });

    it('should require minimum matches when specified', async () => {
      const result = await assertLogContains('Login successful', {
        sessionId: 'test-session',
        minMatches: 3,
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(false);
      expect(result.data?.data?.matchCount).toBe(1);
    });
  });

  describe('match modes', () => {
    it('should support contains mode', async () => {
      const result = await assertLogContains('successful', {
        sessionId: 'test-session',
        matchMode: 'contains',
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
    });

    it('should support exact mode', async () => {
      const result = await assertLogContains('Login successful for user: john@example.com', {
        sessionId: 'test-session',
        matchMode: 'exact',
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
    });

    it('should fail exact mode with partial match', async () => {
      const result = await assertLogContains('Login successful', {
        sessionId: 'test-session',
        matchMode: 'exact',
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(false);
    });

    it('should support startsWith mode', async () => {
      const result = await assertLogContains('App launched', {
        sessionId: 'test-session',
        matchMode: 'startsWith',
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
    });

    it('should support endsWith mode', async () => {
      const result = await assertLogContains('successfully', {
        sessionId: 'test-session',
        matchMode: 'endsWith',
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
    });

    it('should support regex mode', async () => {
      const result = await assertLogContains('user:\\s+\\S+@\\S+', {
        sessionId: 'test-session',
        matchMode: 'regex',
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
    });

    it('should handle invalid regex gracefully', async () => {
      const result = await assertLogContains('[invalid(regex', {
        sessionId: 'test-session',
        matchMode: 'regex',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid pattern');
    });
  });

  describe('notContains mode', () => {
    it('should pass when pattern is NOT found', async () => {
      const result = await assertLogContains('pattern not in logs', {
        sessionId: 'test-session',
        notContains: true,
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
      expect(result.data?.data?.isNegation).toBe(true);
    });

    it('should fail when pattern IS found in notContains mode', async () => {
      const result = await assertLogContains('Login successful', {
        sessionId: 'test-session',
        notContains: true,
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(false);
    });
  });

  describe('convenience functions', () => {
    it('assertLogContainsPattern should use contains mode', async () => {
      const result = await assertLogContainsPattern('successful', {
        sessionId: 'test-session',
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
    });

    it('assertLogContainsExact should use exact mode', async () => {
      const result = await assertLogContainsExact('Login successful for user: john@example.com', {
        sessionId: 'test-session',
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
    });

    it('assertLogMatches should use regex mode', async () => {
      const result = await assertLogMatches('HTTP\\s+\\d{3}', {
        sessionId: 'test-session',
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
    });

    it('assertLogNotContains should use notContains mode', async () => {
      const result = await assertLogNotContains('not found pattern', {
        sessionId: 'test-session',
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
    });

    it('assertLogContainsForApp should filter by bundleId', async () => {
      const result = await assertLogContainsForApp('com.example.myapp', 'Login successful', {
        sessionId: 'test-session',
      });

      expect(result.success).toBe(true);
      expect(result.data?.data?.bundleId).toBe('com.example.myapp');

      // Verify getSystemLog was called with bundleId filter
      expect(getSystemLog).toHaveBeenCalledWith(
        expect.objectContaining({
          process: 'com.example.myapp',
        })
      );
    });
  });

  describe('countLogMatches', () => {
    it('should count pattern occurrences', async () => {
      (getSystemLog as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: [
          { timestamp: new Date(), process: 'MyApp', pid: 1234, level: 'default' as const, message: 'event: click' },
          { timestamp: new Date(), process: 'MyApp', pid: 1234, level: 'default' as const, message: 'event: tap' },
          { timestamp: new Date(), process: 'MyApp', pid: 1234, level: 'default' as const, message: 'event: click' },
        ],
      });

      const result = await countLogMatches('test-udid', 'event:', new Date('2024-01-01'));

      expect(result.success).toBe(true);
      expect(result.data).toBe(3);
    });

    it('should return 0 when no matches found', async () => {
      const result = await countLogMatches('test-udid', 'not found pattern', new Date('2024-01-01'));

      expect(result.success).toBe(true);
      expect(result.data).toBe(0);
    });
  });

  describe('hasLogPattern', () => {
    it('should return true when pattern exists', async () => {
      const result = await hasLogPattern('test-udid', 'Login successful');

      expect(result.success).toBe(true);
      expect(result.data).toBe(true);
    });

    it('should return false when pattern does not exist', async () => {
      const result = await hasLogPattern('test-udid', 'not found pattern');

      expect(result.success).toBe(true);
      expect(result.data).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should fail when no simulator is booted', async () => {
      (getBootedSimulators as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: [],
      });

      const result = await assertLogContains('test', {
        sessionId: 'test-session',
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('SIMULATOR_NOT_BOOTED');
    });

    it('should fail when simulator is not booted', async () => {
      (getSimulator as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: { ...mockSimulator, state: 'Shutdown' },
      });

      const result = await assertLogContains('test', {
        sessionId: 'test-session',
        udid: 'test-udid',
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('SIMULATOR_NOT_BOOTED');
    });

    it('should fail when log retrieval fails', async () => {
      (getSystemLog as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: false,
        error: 'Log retrieval failed',
        errorCode: 'LOG_COLLECTION_FAILED',
      });

      const result = await assertLogContains('test', {
        sessionId: 'test-session',
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(false);
    });
  });

  describe('context lines', () => {
    it('should include context lines when specified', async () => {
      const result = await assertLogContains('API request failed', {
        sessionId: 'test-session',
        contextLines: 2,
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);

      const matches = result.data?.data?.matches;
      expect(matches).toBeDefined();
      expect(matches?.length).toBe(1);

      // Should have context before (2 lines) and after (2 lines)
      expect(matches?.[0].contextBefore).toBeDefined();
      expect(matches?.[0].contextAfter).toBeDefined();
    });
  });
});
