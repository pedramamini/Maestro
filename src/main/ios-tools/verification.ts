/**
 * iOS Tools - Verification Infrastructure
 *
 * Core verification system with polling loop infrastructure for assertions.
 * Provides the foundation for assertVisible, assertNoCrash, and other verification commands.
 */

import { IOSResult, IOSErrorCode } from './types';
import { sleep } from './utils';
import { logger } from '../utils/logger';

const LOG_CONTEXT = '[iOS-Verify]';

// =============================================================================
// Types
// =============================================================================

/**
 * Retry policy for verification operations
 */
export interface RetryPolicy {
  /** Maximum number of retry attempts (default: 3) */
  maxAttempts?: number;
  /** Initial delay between retries in ms (default: 500) */
  initialDelay?: number;
  /** Maximum delay between retries in ms (default: 5000) */
  maxDelay?: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier?: number;
  /** Whether to use exponential backoff (default: true) */
  exponentialBackoff?: boolean;
}

/**
 * Options for polling-based verification
 */
export interface PollingOptions {
  /** Maximum time to wait for condition in ms (default: 10000) */
  timeout?: number;
  /** Interval between polls in ms (default: 500) */
  pollInterval?: number;
  /** Optional description of what we're waiting for */
  description?: string;
}

/**
 * Base options shared by all assertion operations
 */
export interface AssertionBaseOptions {
  /** Simulator UDID (uses first booted if not specified) */
  udid?: string;
  /** Session ID for artifact storage */
  sessionId: string;
  /** Custom assertion ID (auto-generated if not provided) */
  assertionId?: string;
  /** Polling options for the assertion */
  polling?: PollingOptions;
  /** Retry policy for transient failures */
  retry?: RetryPolicy;
  /** Whether to capture screenshot on failure (default: true) */
  captureOnFailure?: boolean;
  /** Whether to capture screenshot on success (default: false) */
  captureOnSuccess?: boolean;
}

/**
 * Status of a verification check
 */
export type VerificationStatus = 'passed' | 'failed' | 'timeout' | 'error';

/**
 * Result of a single verification attempt
 */
export interface VerificationAttempt {
  /** Attempt number (1-based) */
  attempt: number;
  /** Timestamp of this attempt */
  timestamp: Date;
  /** Whether this attempt succeeded */
  success: boolean;
  /** Duration of this attempt in ms */
  duration: number;
  /** Error message if failed */
  error?: string;
  /** Additional details */
  details?: Record<string, unknown>;
}

/**
 * Result of a verification operation
 */
export interface VerificationResult<T = unknown> {
  /** Unique identifier for this verification */
  id: string;
  /** Type of assertion (e.g., 'visible', 'no-crash') */
  type: string;
  /** Overall status */
  status: VerificationStatus;
  /** Whether the verification passed */
  passed: boolean;
  /** Human-readable message */
  message: string;
  /** Target being verified (element identifier, bundle ID, etc.) */
  target: string;
  /** Start timestamp */
  startTime: Date;
  /** End timestamp */
  endTime: Date;
  /** Total duration in ms */
  duration: number;
  /** All attempts made */
  attempts: VerificationAttempt[];
  /** Associated artifacts (screenshots, logs) */
  artifacts?: {
    screenshots?: string[];
    logs?: string[];
  };
  /** Simulator info */
  simulator?: {
    udid: string;
    name: string;
    iosVersion: string;
  };
  /** Additional data specific to the assertion type */
  data?: T;
}

/**
 * Verification check function type
 */
export type VerificationCheck<T = unknown> = () => Promise<{
  passed: boolean;
  error?: string;
  data?: T;
}>;

// =============================================================================
// Default Values
// =============================================================================

const DEFAULT_RETRY_POLICY: Required<RetryPolicy> = {
  maxAttempts: 3,
  initialDelay: 500,
  maxDelay: 5000,
  backoffMultiplier: 2,
  exponentialBackoff: true,
};

const DEFAULT_POLLING_OPTIONS: Required<PollingOptions> = {
  timeout: 10000,
  pollInterval: 500,
  description: 'condition',
};

// =============================================================================
// Core Polling Functions
// =============================================================================

/**
 * Poll a condition until it returns true or timeout.
 * This is the core polling loop used by all assertions.
 *
 * @param check - Function that returns true when condition is met
 * @param options - Polling options
 * @returns Result with timing information
 */
export async function pollUntil<T = unknown>(
  check: VerificationCheck<T>,
  options?: PollingOptions
): Promise<IOSResult<{ passed: boolean; duration: number; attempts: VerificationAttempt[]; lastData?: T }>> {
  const opts = { ...DEFAULT_POLLING_OPTIONS, ...options };
  const startTime = Date.now();
  const attempts: VerificationAttempt[] = [];
  let attemptNum = 0;
  let lastData: T | undefined;

  logger.debug(`${LOG_CONTEXT} Polling for ${opts.description} (timeout: ${opts.timeout}ms, interval: ${opts.pollInterval}ms)`);

  while (Date.now() - startTime < opts.timeout) {
    attemptNum++;
    const attemptStart = Date.now();

    try {
      const result = await check();
      const attemptDuration = Date.now() - attemptStart;

      const attempt: VerificationAttempt = {
        attempt: attemptNum,
        timestamp: new Date(),
        success: result.passed,
        duration: attemptDuration,
        error: result.error,
        details: result.data as Record<string, unknown> | undefined,
      };
      attempts.push(attempt);

      lastData = result.data;

      if (result.passed) {
        const totalDuration = Date.now() - startTime;
        logger.info(`${LOG_CONTEXT} Condition met after ${attemptNum} attempt(s) in ${totalDuration}ms`);
        return {
          success: true,
          data: {
            passed: true,
            duration: totalDuration,
            attempts,
            lastData,
          },
        };
      }

      logger.debug(`${LOG_CONTEXT} Attempt ${attemptNum}: condition not met${result.error ? ` (${result.error})` : ''}`);
    } catch (e) {
      const attemptDuration = Date.now() - attemptStart;
      const errorMessage = e instanceof Error ? e.message : String(e);

      attempts.push({
        attempt: attemptNum,
        timestamp: new Date(),
        success: false,
        duration: attemptDuration,
        error: errorMessage,
      });

      logger.debug(`${LOG_CONTEXT} Attempt ${attemptNum} threw: ${errorMessage}`);
    }

    // Wait before next attempt
    await sleep(opts.pollInterval);
  }

  // Timeout reached
  const totalDuration = Date.now() - startTime;
  logger.warn(`${LOG_CONTEXT} Polling timed out after ${totalDuration}ms (${attemptNum} attempts)`);

  return {
    success: true, // Operation succeeded, condition just wasn't met
    data: {
      passed: false,
      duration: totalDuration,
      attempts,
      lastData,
    },
  };
}

/**
 * Execute a verification with retry support for transient failures.
 *
 * @param operation - Async operation to execute
 * @param policy - Retry policy
 * @returns Result of the operation
 */
export async function withRetry<T>(
  operation: () => Promise<IOSResult<T>>,
  policy?: RetryPolicy
): Promise<IOSResult<T>> {
  const opts = { ...DEFAULT_RETRY_POLICY, ...policy };
  let lastError: string | undefined;
  let delay = opts.initialDelay;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      const result = await operation();

      if (result.success) {
        if (attempt > 1) {
          logger.info(`${LOG_CONTEXT} Operation succeeded on attempt ${attempt}`);
        }
        return result;
      }

      lastError = result.error;
      logger.debug(`${LOG_CONTEXT} Attempt ${attempt}/${opts.maxAttempts} failed: ${result.error}`);
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      logger.debug(`${LOG_CONTEXT} Attempt ${attempt}/${opts.maxAttempts} threw: ${lastError}`);
    }

    // Don't wait after the last attempt
    if (attempt < opts.maxAttempts) {
      await sleep(delay);

      if (opts.exponentialBackoff) {
        delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelay);
      }
    }
  }

  return {
    success: false,
    error: `Failed after ${opts.maxAttempts} attempts: ${lastError}`,
    errorCode: 'COMMAND_FAILED' as IOSErrorCode,
  };
}

/**
 * Create a combined polling + retry verification.
 * First polls for the condition, then retries the entire polling on failure.
 *
 * @param check - Verification check function
 * @param polling - Polling options
 * @param retry - Retry policy
 * @returns Combined result
 */
export async function verifyWithPollingAndRetry<T>(
  check: VerificationCheck<T>,
  polling?: PollingOptions,
  retry?: RetryPolicy
): Promise<IOSResult<{ passed: boolean; duration: number; attempts: VerificationAttempt[]; lastData?: T }>> {
  return withRetry(async () => {
    const pollResult = await pollUntil(check, polling);

    if (!pollResult.success) {
      return pollResult;
    }

    // If polling succeeded but condition not met, treat as failure for retry
    if (!pollResult.data?.passed) {
      return {
        success: false,
        error: 'Condition not met within timeout',
        errorCode: 'TIMEOUT' as IOSErrorCode,
      };
    }

    return pollResult;
  }, retry);
}

// =============================================================================
// ID Generation
// =============================================================================

let verificationCounter = 0;

/**
 * Generate a unique verification ID.
 */
export function generateVerificationId(type: string): string {
  verificationCounter++;
  const timestamp = Date.now().toString(36);
  const counter = verificationCounter.toString(36).padStart(4, '0');
  return `${type}-${timestamp}-${counter}`;
}

// =============================================================================
// Result Builders
// =============================================================================

/**
 * Build a VerificationResult from the components.
 */
export function buildVerificationResult<T>(params: {
  id: string;
  type: string;
  target: string;
  status: VerificationStatus;
  message: string;
  startTime: Date;
  attempts: VerificationAttempt[];
  simulator?: { udid: string; name: string; iosVersion: string };
  artifacts?: { screenshots?: string[]; logs?: string[] };
  data?: T;
}): VerificationResult<T> {
  const endTime = new Date();
  const duration = endTime.getTime() - params.startTime.getTime();

  return {
    id: params.id,
    type: params.type,
    status: params.status,
    passed: params.status === 'passed',
    message: params.message,
    target: params.target,
    startTime: params.startTime,
    endTime,
    duration,
    attempts: params.attempts,
    simulator: params.simulator,
    artifacts: params.artifacts,
    data: params.data,
  };
}

/**
 * Create a passed verification result.
 */
export function createPassedResult<T>(params: {
  id: string;
  type: string;
  target: string;
  startTime: Date;
  attempts: VerificationAttempt[];
  message?: string;
  simulator?: { udid: string; name: string; iosVersion: string };
  artifacts?: { screenshots?: string[]; logs?: string[] };
  data?: T;
}): VerificationResult<T> {
  return buildVerificationResult({
    ...params,
    status: 'passed',
    message: params.message || `${params.type} assertion passed for ${params.target}`,
  });
}

/**
 * Create a failed verification result.
 */
export function createFailedResult<T>(params: {
  id: string;
  type: string;
  target: string;
  startTime: Date;
  attempts: VerificationAttempt[];
  message: string;
  simulator?: { udid: string; name: string; iosVersion: string };
  artifacts?: { screenshots?: string[]; logs?: string[] };
  data?: T;
}): VerificationResult<T> {
  return buildVerificationResult({
    ...params,
    status: 'failed',
  });
}

/**
 * Create a timeout verification result.
 */
export function createTimeoutResult<T>(params: {
  id: string;
  type: string;
  target: string;
  startTime: Date;
  timeout: number;
  attempts: VerificationAttempt[];
  simulator?: { udid: string; name: string; iosVersion: string };
  artifacts?: { screenshots?: string[]; logs?: string[] };
  data?: T;
}): VerificationResult<T> {
  return buildVerificationResult({
    ...params,
    status: 'timeout',
    message: `Timeout after ${params.timeout}ms waiting for ${params.type} on ${params.target}`,
  });
}

/**
 * Create an error verification result.
 */
export function createErrorResult<T>(params: {
  id: string;
  type: string;
  target: string;
  startTime: Date;
  error: string;
  attempts: VerificationAttempt[];
  simulator?: { udid: string; name: string; iosVersion: string };
  artifacts?: { screenshots?: string[]; logs?: string[] };
}): VerificationResult<T> {
  return buildVerificationResult({
    ...params,
    status: 'error',
    message: `Error during ${params.type} assertion: ${params.error}`,
  });
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get the final retry delay based on policy.
 */
export function calculateRetryDelay(attempt: number, policy: RetryPolicy): number {
  const opts = { ...DEFAULT_RETRY_POLICY, ...policy };

  if (!opts.exponentialBackoff) {
    return opts.initialDelay;
  }

  const delay = opts.initialDelay * Math.pow(opts.backoffMultiplier, attempt - 1);
  return Math.min(delay, opts.maxDelay);
}

/**
 * Merge polling options with defaults.
 */
export function mergePollingOptions(options?: PollingOptions): Required<PollingOptions> {
  return { ...DEFAULT_POLLING_OPTIONS, ...options };
}

/**
 * Merge retry policy with defaults.
 */
export function mergeRetryPolicy(policy?: RetryPolicy): Required<RetryPolicy> {
  return { ...DEFAULT_RETRY_POLICY, ...policy };
}
