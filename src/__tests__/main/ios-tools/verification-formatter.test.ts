/**
 * Tests for src/main/ios-tools/verification-formatter.ts
 *
 * Tests cover verification result formatting for agent output.
 */

import { describe, it, expect } from 'vitest';
import type { VerificationResult, VerificationAttempt } from '../../../main/ios-tools/verification';

describe('verification-formatter.ts', () => {
  // Helper to create a test result
  const createTestResult = (overrides?: Partial<VerificationResult>): VerificationResult => ({
    id: 'test-123',
    type: 'visible',
    status: 'passed',
    passed: true,
    message: 'Element is visible',
    target: 'login-button',
    startTime: new Date('2024-01-01T10:00:00Z'),
    endTime: new Date('2024-01-01T10:00:01Z'),
    duration: 1000,
    attempts: [{
      attempt: 1,
      timestamp: new Date('2024-01-01T10:00:00Z'),
      success: true,
      duration: 100,
    }],
    simulator: {
      udid: 'ABC-123',
      name: 'iPhone 15 Pro',
      iosVersion: '17.0',
    },
    ...overrides,
  });

  describe('formatVerificationResult', () => {
    it('should format a passed result as markdown', async () => {
      const { formatVerificationResult } = await import('../../../main/ios-tools/verification-formatter');

      const result = createTestResult();
      const formatted = formatVerificationResult(result);

      expect(formatted.markdown).toContain('Verification: visible');
      expect(formatted.markdown).toContain('PASSED');
      expect(formatted.markdown).toContain('login-button');
      expect(formatted.emoji).toBe(':white_check_mark:');
      expect(formatted.summary).toContain('PASSED');
    });

    it('should format a failed result', async () => {
      const { formatVerificationResult } = await import('../../../main/ios-tools/verification-formatter');

      const result = createTestResult({
        status: 'failed',
        passed: false,
        message: 'Element not found',
        attempts: [{
          attempt: 1,
          timestamp: new Date(),
          success: false,
          duration: 500,
          error: 'Element not in hierarchy',
        }],
      });

      const formatted = formatVerificationResult(result);

      expect(formatted.markdown).toContain('FAILED');
      expect(formatted.markdown).toContain('Element not found');
      expect(formatted.emoji).toBe(':x:');
    });

    it('should format a timeout result', async () => {
      const { formatVerificationResult } = await import('../../../main/ios-tools/verification-formatter');

      const result = createTestResult({
        status: 'timeout',
        passed: false,
        message: 'Timeout after 10000ms',
        duration: 10000,
        attempts: [
          { attempt: 1, timestamp: new Date(), success: false, duration: 100 },
          { attempt: 2, timestamp: new Date(), success: false, duration: 100 },
        ],
      });

      const formatted = formatVerificationResult(result);

      expect(formatted.markdown).toContain('TIMEOUT');
      expect(formatted.emoji).toBe(':hourglass:');
    });

    it('should include simulator info when present', async () => {
      const { formatVerificationResult } = await import('../../../main/ios-tools/verification-formatter');

      const result = createTestResult();
      const formatted = formatVerificationResult(result, { includeSimulator: true });

      expect(formatted.markdown).toContain('iPhone 15 Pro');
      expect(formatted.markdown).toContain('17.0');
      expect(formatted.markdown).toContain('ABC-123');
    });

    it('should exclude simulator info when disabled', async () => {
      const { formatVerificationResult } = await import('../../../main/ios-tools/verification-formatter');

      const result = createTestResult();
      const formatted = formatVerificationResult(result, { includeSimulator: false });

      expect(formatted.markdown).not.toContain('iPhone 15 Pro');
    });

    it('should include attempt details when enabled', async () => {
      const { formatVerificationResult } = await import('../../../main/ios-tools/verification-formatter');

      const result = createTestResult({
        attempts: [
          { attempt: 1, timestamp: new Date(), success: false, duration: 100, error: 'Not found' },
          { attempt: 2, timestamp: new Date(), success: true, duration: 50 },
        ],
      });

      const formatted = formatVerificationResult(result, { includeAttempts: true });

      expect(formatted.markdown).toContain('Attempts');
      expect(formatted.markdown).toContain('| # |');
    });

    it('should limit shown attempts to maxAttempts', async () => {
      const { formatVerificationResult } = await import('../../../main/ios-tools/verification-formatter');

      const attempts: VerificationAttempt[] = [];
      for (let i = 1; i <= 10; i++) {
        attempts.push({
          attempt: i,
          timestamp: new Date(),
          success: i === 10,
          duration: 50,
        });
      }

      const result = createTestResult({ attempts });
      const formatted = formatVerificationResult(result, { includeAttempts: true, maxAttempts: 3 });

      expect(formatted.markdown).toContain('Showing last 3 of 10 attempts');
    });

    it('should include artifacts when present', async () => {
      const { formatVerificationResult } = await import('../../../main/ios-tools/verification-formatter');

      const result = createTestResult({
        artifacts: {
          screenshots: ['/path/to/screenshot.png'],
          logs: ['/path/to/logs.txt'],
        },
      });

      const formatted = formatVerificationResult(result, { includeArtifacts: true });

      expect(formatted.markdown).toContain('Artifacts');
      expect(formatted.markdown).toContain('/path/to/screenshot.png');
      expect(formatted.markdown).toContain('/path/to/logs.txt');
    });

    it('should include timing information', async () => {
      const { formatVerificationResult } = await import('../../../main/ios-tools/verification-formatter');

      const result = createTestResult({ duration: 5500 });
      const formatted = formatVerificationResult(result, { includeTiming: true });

      expect(formatted.markdown).toContain('Duration');
      expect(formatted.markdown).toContain('5.5s');
    });
  });

  describe('formatVerificationAsJson', () => {
    it('should produce valid JSON', async () => {
      const { formatVerificationAsJson } = await import('../../../main/ios-tools/verification-formatter');

      const result = createTestResult();
      const json = formatVerificationAsJson(result);

      const parsed = JSON.parse(json);
      expect(parsed.id).toBe('test-123');
      expect(parsed.type).toBe('visible');
      expect(parsed.passed).toBe(true);
    });

    it('should convert dates to ISO strings', async () => {
      const { formatVerificationAsJson } = await import('../../../main/ios-tools/verification-formatter');

      const result = createTestResult();
      const json = formatVerificationAsJson(result);

      const parsed = JSON.parse(json);
      expect(parsed.startTime).toBe('2024-01-01T10:00:00.000Z');
      expect(parsed.endTime).toBe('2024-01-01T10:00:01.000Z');
    });
  });

  describe('formatVerificationCompact', () => {
    it('should format as single line', async () => {
      const { formatVerificationCompact } = await import('../../../main/ios-tools/verification-formatter');

      const result = createTestResult({ duration: 1500 });
      const compact = formatVerificationCompact(result);

      expect(compact).toContain(':white_check_mark:');
      expect(compact).toContain('visible');
      expect(compact).toContain('1.5s');
      expect(compact.split('\n').length).toBe(1);
    });

    it('should include attempt count when multiple', async () => {
      const { formatVerificationCompact } = await import('../../../main/ios-tools/verification-formatter');

      const result = createTestResult({
        attempts: [
          { attempt: 1, timestamp: new Date(), success: false, duration: 50 },
          { attempt: 2, timestamp: new Date(), success: true, duration: 50 },
        ],
      });

      const compact = formatVerificationCompact(result);

      expect(compact).toContain('(2 attempts)');
    });
  });

  describe('formatVerificationBatch', () => {
    it('should summarize multiple results', async () => {
      const { formatVerificationBatch } = await import('../../../main/ios-tools/verification-formatter');

      const results: VerificationResult[] = [
        createTestResult({ id: '1', target: 'button1' }),
        createTestResult({ id: '2', target: 'button2', status: 'failed', passed: false }),
        createTestResult({ id: '3', target: 'button3' }),
      ];

      const formatted = formatVerificationBatch(results);

      expect(formatted.markdown).toContain('Batch Results');
      expect(formatted.markdown).toContain('Total:** 3');
      expect(formatted.markdown).toContain('Passed:** 2');
      expect(formatted.markdown).toContain('Failed:** 1');
    });

    it('should show success emoji when all pass', async () => {
      const { formatVerificationBatch } = await import('../../../main/ios-tools/verification-formatter');

      const results = [
        createTestResult({ id: '1' }),
        createTestResult({ id: '2' }),
      ];

      const formatted = formatVerificationBatch(results);

      expect(formatted.emoji).toBe(':white_check_mark:');
    });

    it('should show failure emoji when any fail', async () => {
      const { formatVerificationBatch } = await import('../../../main/ios-tools/verification-formatter');

      const results = [
        createTestResult({ id: '1' }),
        createTestResult({ id: '2', status: 'failed', passed: false }),
      ];

      const formatted = formatVerificationBatch(results);

      expect(formatted.emoji).toBe(':x:');
    });

    it('should include failure details', async () => {
      const { formatVerificationBatch } = await import('../../../main/ios-tools/verification-formatter');

      const results = [
        createTestResult({ id: '1' }),
        createTestResult({
          id: '2',
          target: 'missing-button',
          status: 'failed',
          passed: false,
          message: 'Element not found',
          artifacts: { screenshots: ['/path/to/failure.png'] },
        }),
      ];

      const formatted = formatVerificationBatch(results);

      expect(formatted.markdown).toContain('Failures');
      expect(formatted.markdown).toContain('missing-button');
      expect(formatted.markdown).toContain('Element not found');
      expect(formatted.markdown).toContain('/path/to/failure.png');
    });
  });

  describe('formatDuration', () => {
    it('should format milliseconds', async () => {
      const { formatDuration } = await import('../../../main/ios-tools/verification-formatter');

      expect(formatDuration(500)).toBe('500ms');
      expect(formatDuration(50)).toBe('50ms');
    });

    it('should format seconds', async () => {
      const { formatDuration } = await import('../../../main/ios-tools/verification-formatter');

      expect(formatDuration(1500)).toBe('1.5s');
      expect(formatDuration(30000)).toBe('30.0s');
    });

    it('should format minutes', async () => {
      const { formatDuration } = await import('../../../main/ios-tools/verification-formatter');

      expect(formatDuration(90000)).toBe('1m 30s');
      expect(formatDuration(120000)).toBe('2m 0s');
    });
  });

  describe('formatProgressBar', () => {
    it('should show correct progress', async () => {
      const { formatProgressBar } = await import('../../../main/ios-tools/verification-formatter');

      expect(formatProgressBar(5, 10, 10)).toBe('[=====-----] 5/10');
      expect(formatProgressBar(10, 10, 10)).toBe('[==========] 10/10');
      expect(formatProgressBar(0, 10, 10)).toBe('[----------] 0/10');
    });
  });

  describe('formatStatusBadge', () => {
    it('should format status badges', async () => {
      const { formatStatusBadge } = await import('../../../main/ios-tools/verification-formatter');

      expect(formatStatusBadge('passed')).toBe(':white_check_mark: PASSED');
      expect(formatStatusBadge('failed')).toBe(':x: FAILED');
      expect(formatStatusBadge('timeout')).toBe(':hourglass: TIMEOUT');
      expect(formatStatusBadge('error')).toBe(':warning: ERROR');
    });
  });
});
