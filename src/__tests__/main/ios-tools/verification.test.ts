/**
 * Tests for src/main/ios-tools/verification.ts
 *
 * Tests cover the core verification infrastructure including:
 * - Polling loop functionality
 * - Retry logic with backoff
 * - Result building utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('verification.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('pollUntil', () => {
    it('should return immediately when condition is true on first check', async () => {
      const { pollUntil } = await import('../../../main/ios-tools/verification');

      const check = vi.fn().mockResolvedValue({ passed: true, data: { value: 42 } });

      const resultPromise = pollUntil(check, { timeout: 5000, pollInterval: 500 });

      // Advance time slightly to allow the first check
      await vi.advanceTimersByTimeAsync(10);

      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
      expect(result.data?.attempts.length).toBe(1);
      expect(result.data?.lastData).toEqual({ value: 42 });
      expect(check).toHaveBeenCalledTimes(1);
    });

    it('should poll until condition becomes true', async () => {
      const { pollUntil } = await import('../../../main/ios-tools/verification');

      let callCount = 0;
      const check = vi.fn().mockImplementation(async () => {
        callCount++;
        return { passed: callCount >= 3, data: { count: callCount } };
      });

      const resultPromise = pollUntil(check, { timeout: 10000, pollInterval: 500 });

      // First check (fails)
      await vi.advanceTimersByTimeAsync(10);
      // Wait for poll interval
      await vi.advanceTimersByTimeAsync(500);
      // Second check (fails)
      await vi.advanceTimersByTimeAsync(10);
      // Wait for poll interval
      await vi.advanceTimersByTimeAsync(500);
      // Third check (passes)
      await vi.advanceTimersByTimeAsync(10);

      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
      expect(result.data?.attempts.length).toBe(3);
      expect(check).toHaveBeenCalledTimes(3);
    });

    it('should timeout if condition never becomes true', async () => {
      const { pollUntil } = await import('../../../main/ios-tools/verification');

      const check = vi.fn().mockResolvedValue({ passed: false, error: 'Not found' });

      const resultPromise = pollUntil(check, { timeout: 2000, pollInterval: 500 });

      // Advance past the timeout
      await vi.advanceTimersByTimeAsync(3000);

      const result = await resultPromise;

      expect(result.success).toBe(true); // Operation succeeded, condition just wasn't met
      expect(result.data?.passed).toBe(false);
      expect(result.data?.duration).toBeGreaterThanOrEqual(2000);
    });

    it('should handle check function that throws', async () => {
      const { pollUntil } = await import('../../../main/ios-tools/verification');

      let callCount = 0;
      const check = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount < 2) {
          throw new Error('Transient error');
        }
        return { passed: true };
      });

      const resultPromise = pollUntil(check, { timeout: 10000, pollInterval: 500 });

      // First check throws
      await vi.advanceTimersByTimeAsync(10);
      // Wait for poll interval
      await vi.advanceTimersByTimeAsync(500);
      // Second check succeeds
      await vi.advanceTimersByTimeAsync(10);

      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
      expect(result.data?.attempts.length).toBe(2);
      expect(result.data?.attempts[0].success).toBe(false);
      expect(result.data?.attempts[0].error).toBe('Transient error');
    });

    it('should use default polling options when not specified', async () => {
      const { pollUntil } = await import('../../../main/ios-tools/verification');

      const check = vi.fn().mockResolvedValue({ passed: true });

      const resultPromise = pollUntil(check);
      await vi.advanceTimersByTimeAsync(10);

      const result = await resultPromise;

      expect(result.success).toBe(true);
    });
  });

  describe('withRetry', () => {
    it('should return immediately on first success', async () => {
      const { withRetry } = await import('../../../main/ios-tools/verification');

      const operation = vi.fn().mockResolvedValue({ success: true, data: 'result' });

      const resultPromise = withRetry(operation, { maxAttempts: 3 });
      await vi.advanceTimersByTimeAsync(10);

      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.data).toBe('result');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and succeed eventually', async () => {
      const { withRetry } = await import('../../../main/ios-tools/verification');

      let callCount = 0;
      const operation = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount < 3) {
          return { success: false, error: 'Temporary failure' };
        }
        return { success: true, data: 'success' };
      });

      const resultPromise = withRetry(operation, {
        maxAttempts: 5,
        initialDelay: 100,
        exponentialBackoff: false,
      });

      // First attempt fails
      await vi.advanceTimersByTimeAsync(10);
      // Wait for delay
      await vi.advanceTimersByTimeAsync(100);
      // Second attempt fails
      await vi.advanceTimersByTimeAsync(10);
      // Wait for delay
      await vi.advanceTimersByTimeAsync(100);
      // Third attempt succeeds
      await vi.advanceTimersByTimeAsync(10);

      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.data).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should fail after max attempts', async () => {
      const { withRetry } = await import('../../../main/ios-tools/verification');

      const operation = vi.fn().mockResolvedValue({ success: false, error: 'Always fails' });

      const resultPromise = withRetry(operation, {
        maxAttempts: 3,
        initialDelay: 100,
        exponentialBackoff: false,
      });

      // Run all attempts with delays
      for (let i = 0; i < 3; i++) {
        await vi.advanceTimersByTimeAsync(10);
        if (i < 2) {
          await vi.advanceTimersByTimeAsync(100);
        }
      }

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed after 3 attempts');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should handle throwing operations', async () => {
      const { withRetry } = await import('../../../main/ios-tools/verification');

      let callCount = 0;
      const operation = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Network error');
        }
        return { success: true, data: 'recovered' };
      });

      const resultPromise = withRetry(operation, {
        maxAttempts: 3,
        initialDelay: 100,
        exponentialBackoff: false,
      });

      // First attempt throws
      await vi.advanceTimersByTimeAsync(10);
      // Wait for delay
      await vi.advanceTimersByTimeAsync(100);
      // Second attempt succeeds
      await vi.advanceTimersByTimeAsync(10);

      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.data).toBe('recovered');
    });

    it('should apply exponential backoff', async () => {
      const { withRetry, calculateRetryDelay } = await import('../../../main/ios-tools/verification');

      const policy = {
        maxAttempts: 4,
        initialDelay: 100,
        maxDelay: 1000,
        backoffMultiplier: 2,
        exponentialBackoff: true,
      };

      expect(calculateRetryDelay(1, policy)).toBe(100);  // 100
      expect(calculateRetryDelay(2, policy)).toBe(200);  // 100 * 2
      expect(calculateRetryDelay(3, policy)).toBe(400);  // 100 * 4
      expect(calculateRetryDelay(4, policy)).toBe(800);  // 100 * 8
      expect(calculateRetryDelay(5, policy)).toBe(1000); // Capped at maxDelay
    });
  });

  describe('generateVerificationId', () => {
    it('should generate unique IDs', async () => {
      const { generateVerificationId } = await import('../../../main/ios-tools/verification');

      const id1 = generateVerificationId('visible');
      const id2 = generateVerificationId('visible');
      const id3 = generateVerificationId('no-crash');

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^visible-/);
      expect(id3).toMatch(/^no-crash-/);
    });
  });

  describe('result builders', () => {
    it('should build passed result correctly', async () => {
      const { createPassedResult } = await import('../../../main/ios-tools/verification');

      const result = createPassedResult({
        id: 'test-123',
        type: 'visible',
        target: 'login-button',
        startTime: new Date('2024-01-01T00:00:00Z'),
        attempts: [{ attempt: 1, timestamp: new Date(), success: true, duration: 100 }],
      });

      expect(result.status).toBe('passed');
      expect(result.passed).toBe(true);
      expect(result.id).toBe('test-123');
      expect(result.type).toBe('visible');
      expect(result.target).toBe('login-button');
      expect(result.message).toContain('passed');
    });

    it('should build failed result correctly', async () => {
      const { createFailedResult } = await import('../../../main/ios-tools/verification');

      const result = createFailedResult({
        id: 'test-456',
        type: 'visible',
        target: 'missing-element',
        startTime: new Date('2024-01-01T00:00:00Z'),
        attempts: [{ attempt: 1, timestamp: new Date(), success: false, duration: 100, error: 'Not found' }],
        message: 'Element not found in UI hierarchy',
      });

      expect(result.status).toBe('failed');
      expect(result.passed).toBe(false);
      expect(result.message).toBe('Element not found in UI hierarchy');
    });

    it('should build timeout result correctly', async () => {
      const { createTimeoutResult } = await import('../../../main/ios-tools/verification');

      const result = createTimeoutResult({
        id: 'test-789',
        type: 'visible',
        target: 'slow-element',
        startTime: new Date('2024-01-01T00:00:00Z'),
        timeout: 10000,
        attempts: [
          { attempt: 1, timestamp: new Date(), success: false, duration: 100 },
          { attempt: 2, timestamp: new Date(), success: false, duration: 100 },
        ],
      });

      expect(result.status).toBe('timeout');
      expect(result.passed).toBe(false);
      expect(result.message).toContain('10000ms');
    });

    it('should build error result correctly', async () => {
      const { createErrorResult } = await import('../../../main/ios-tools/verification');

      const result = createErrorResult({
        id: 'test-000',
        type: 'visible',
        target: 'element',
        startTime: new Date('2024-01-01T00:00:00Z'),
        error: 'Simulator crashed',
        attempts: [],
      });

      expect(result.status).toBe('error');
      expect(result.passed).toBe(false);
      expect(result.message).toContain('Simulator crashed');
    });
  });

  describe('mergePollingOptions', () => {
    it('should merge with defaults', async () => {
      const { mergePollingOptions } = await import('../../../main/ios-tools/verification');

      const opts = mergePollingOptions({ timeout: 5000 });

      expect(opts.timeout).toBe(5000);
      expect(opts.pollInterval).toBe(500); // default
      expect(opts.description).toBe('condition'); // default
    });

    it('should use all custom values', async () => {
      const { mergePollingOptions } = await import('../../../main/ios-tools/verification');

      const opts = mergePollingOptions({
        timeout: 15000,
        pollInterval: 1000,
        description: 'element visibility',
      });

      expect(opts.timeout).toBe(15000);
      expect(opts.pollInterval).toBe(1000);
      expect(opts.description).toBe('element visibility');
    });
  });

  describe('mergeRetryPolicy', () => {
    it('should merge with defaults', async () => {
      const { mergeRetryPolicy } = await import('../../../main/ios-tools/verification');

      const policy = mergeRetryPolicy({ maxAttempts: 5 });

      expect(policy.maxAttempts).toBe(5);
      expect(policy.initialDelay).toBe(500); // default
      expect(policy.maxDelay).toBe(5000); // default
      expect(policy.backoffMultiplier).toBe(2); // default
      expect(policy.exponentialBackoff).toBe(true); // default
    });
  });
});
