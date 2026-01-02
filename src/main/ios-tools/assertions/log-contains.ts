/**
 * iOS Assertion - Assert Log Contains
 *
 * Verifies that a specific pattern appears in system logs.
 * Useful for verifying API calls, analytics events, specific log messages,
 * and other expected log output.
 */

import path from 'path';
import { IOSResult, LogEntry } from '../types';
import { getBootedSimulators, getSimulator } from '../simulator';
import { getSystemLog } from '../logs';
import { screenshot } from '../capture';
import { getSnapshotDirectory } from '../artifacts';
import {
  AssertionBaseOptions,
  VerificationResult,
  VerificationAttempt,
  pollUntil,
  generateVerificationId,
  createPassedResult,
  createFailedResult,
  createTimeoutResult,
  mergePollingOptions,
} from '../verification';
import { logger } from '../../utils/logger';

const LOG_CONTEXT = '[iOS-Assert-LogContains]';

// =============================================================================
// Types
// =============================================================================

/**
 * Match mode for log pattern matching.
 */
export type LogMatchMode = 'contains' | 'exact' | 'regex' | 'startsWith' | 'endsWith';

/**
 * A matched log entry with context.
 */
export interface MatchedLogEntry {
  /** The log entry that matched */
  entry: LogEntry;
  /** The specific text that matched */
  matchedText: string;
  /** Context lines before the match */
  contextBefore?: string[];
  /** Context lines after the match */
  contextAfter?: string[];
  /** Line number within the log results (1-based) */
  lineNumber: number;
}

/**
 * Options for assertLogContains
 */
export interface AssertLogContainsOptions extends AssertionBaseOptions {
  /** App bundle identifier to filter logs (optional) */
  bundleId?: string;
  /** Time from which to check for pattern (default: 60 seconds ago) */
  since?: Date;
  /** Match mode for pattern matching (default: 'contains') */
  matchMode?: LogMatchMode;
  /** If true, pattern is case-sensitive (default: false) */
  caseSensitive?: boolean;
  /** Maximum number of matches to return (default: 10) */
  maxMatches?: number;
  /** Log level to filter (default: all levels) */
  logLevel?: 'default' | 'info' | 'debug' | 'error' | 'fault';
  /** Include context lines around matched entries (default: 2) */
  contextLines?: number;
  /** If true, assert that pattern does NOT appear (negation) */
  notContains?: boolean;
  /** Minimum number of matches required for success (default: 1) */
  minMatches?: number;
}

/**
 * Data specific to log-contains assertion results
 */
export interface LogContainsAssertionData {
  /** The pattern being searched for */
  pattern: string;
  /** The match mode used */
  matchMode: LogMatchMode;
  /** Whether this is a negation check (notContains) */
  isNegation: boolean;
  /** The bundle ID being monitored (if specified) */
  bundleId?: string;
  /** Start time for log search */
  sinceTime: Date;
  /** End time for log search */
  untilTime: Date;
  /** Search duration in ms */
  searchDuration: number;
  /** Whether any matches were found */
  matchesFound: boolean;
  /** Number of matches detected */
  matchCount: number;
  /** Total log entries scanned */
  totalLogsScanned: number;
  /** Matched log entries with context */
  matches?: MatchedLogEntry[];
  /** Minimum matches required */
  minMatches: number;
}

// =============================================================================
// Pattern Matching Utilities
// =============================================================================

/**
 * Create a RegExp from pattern based on match mode.
 */
function createMatcher(pattern: string, mode: LogMatchMode, caseSensitive: boolean): RegExp {
  const flags = caseSensitive ? '' : 'i';

  switch (mode) {
    case 'exact':
      // Escape special regex characters and match exactly
      const escapedExact = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`^${escapedExact}$`, flags);

    case 'startsWith':
      const escapedStart = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`^${escapedStart}`, flags);

    case 'endsWith':
      const escapedEnd = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`${escapedEnd}$`, flags);

    case 'regex':
      // Use pattern as-is for regex mode
      return new RegExp(pattern, flags);

    case 'contains':
    default:
      // Escape special regex characters for contains mode
      const escapedContains = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(escapedContains, flags);
  }
}

/**
 * Find matching text in a log message.
 */
function findMatch(message: string, matcher: RegExp): RegExpMatchArray | null {
  return message.match(matcher);
}

// =============================================================================
// Main Function
// =============================================================================

/**
 * Assert that a pattern appears (or doesn't appear) in system logs.
 *
 * @param pattern - The pattern to search for
 * @param options - Assertion options
 * @returns Verification result indicating pass/fail
 */
export async function assertLogContains(
  pattern: string,
  options: AssertLogContainsOptions
): Promise<IOSResult<VerificationResult<LogContainsAssertionData>>> {
  const {
    udid: providedUdid,
    sessionId,
    assertionId: providedId,
    bundleId,
    since: providedSince,
    matchMode = 'contains',
    caseSensitive = false,
    polling,
    captureOnFailure = true,
    captureOnSuccess = false,
    maxMatches = 10,
    logLevel,
    contextLines = 2,
    notContains = false,
    minMatches = 1,
  } = options;

  const assertionId = providedId || generateVerificationId('log-contains');
  const startTime = new Date();
  // Default to 60 seconds ago if no since provided
  const sinceTime = providedSince || new Date(Date.now() - 60 * 1000);

  const assertionType = notContains ? 'log-not-contains' : 'log-contains';
  const targetDesc = bundleId ? `logs for "${bundleId}"` : 'all logs';

  logger.info(
    `${LOG_CONTEXT} Asserting ${notContains ? 'NOT ' : ''}log contains "${pattern}" in ${targetDesc} since ${sinceTime.toISOString()} (session: ${sessionId})`
  );
  logger.debug(`${LOG_CONTEXT} Match mode: ${matchMode}, Case sensitive: ${caseSensitive}`);

  // Create the pattern matcher
  let matcher: RegExp;
  try {
    matcher = createMatcher(pattern, matchMode, caseSensitive);
  } catch (e) {
    return {
      success: false,
      error: `Invalid pattern "${pattern}": ${e instanceof Error ? e.message : String(e)}`,
      errorCode: 'COMMAND_FAILED',
    };
  }

  // Get simulator
  let udid = providedUdid;
  if (!udid) {
    const bootedResult = await getBootedSimulators();
    if (!bootedResult.success || !bootedResult.data || bootedResult.data.length === 0) {
      return {
        success: false,
        error: 'No booted simulator found. Please specify --simulator or boot a simulator.',
        errorCode: 'SIMULATOR_NOT_BOOTED',
      };
    }
    udid = bootedResult.data[0].udid;
    logger.info(`${LOG_CONTEXT} Using first booted simulator: ${udid}`);
  }

  const simResult = await getSimulator(udid);
  if (!simResult.success || !simResult.data) {
    return {
      success: false,
      error: simResult.error || 'Failed to get simulator info',
      errorCode: simResult.errorCode || 'SIMULATOR_NOT_FOUND',
    };
  }

  if (simResult.data.state !== 'Booted') {
    return {
      success: false,
      error: `Simulator is not booted (state: ${simResult.data.state})`,
      errorCode: 'SIMULATOR_NOT_BOOTED',
    };
  }

  const simulatorInfo = {
    udid,
    name: simResult.data.name,
    iosVersion: simResult.data.iosVersion,
  };

  // Create artifact directory
  let artifactDir: string;
  try {
    artifactDir = await getSnapshotDirectory(sessionId, assertionId);
  } catch (error) {
    return {
      success: false,
      error: `Failed to create artifact directory: ${error}`,
      errorCode: 'COMMAND_FAILED',
    };
  }

  // Check for pattern in logs
  const checkLogContains = async (): Promise<{
    passed: boolean;
    error?: string;
    data?: LogContainsAssertionData;
  }> => {
    const endTime = new Date();

    // Get system logs - include all levels by default for searching
    const logsResult = await getSystemLog({
      udid,
      since: sinceTime,
      process: bundleId,
      level: logLevel, // Use provided level or default to all
      limit: 5000, // Reasonable limit
    });

    if (!logsResult.success) {
      return {
        passed: false,
        error: logsResult.error || 'Failed to get system logs',
      };
    }

    const logs = logsResult.data || [];
    const matchedEntries: MatchedLogEntry[] = [];

    // Scan logs for pattern
    for (let i = 0; i < logs.length && matchedEntries.length < maxMatches; i++) {
      const entry = logs[i];
      const message = entry.message;

      // Check for pattern match
      const match = findMatch(message, matcher);
      if (match) {
        // Collect context lines
        const contextBefore: string[] = [];
        const contextAfter: string[] = [];

        if (contextLines > 0) {
          // Get lines before
          for (let j = Math.max(0, i - contextLines); j < i; j++) {
            contextBefore.push(logs[j].message);
          }
          // Get lines after
          for (let j = i + 1; j < Math.min(logs.length, i + 1 + contextLines); j++) {
            contextAfter.push(logs[j].message);
          }
        }

        matchedEntries.push({
          entry,
          matchedText: match[0],
          contextBefore: contextBefore.length > 0 ? contextBefore : undefined,
          contextAfter: contextAfter.length > 0 ? contextAfter : undefined,
          lineNumber: i + 1,
        });
      }
    }

    const searchDuration = endTime.getTime() - sinceTime.getTime();

    const data: LogContainsAssertionData = {
      pattern,
      matchMode,
      isNegation: notContains,
      bundleId,
      sinceTime,
      untilTime: endTime,
      searchDuration,
      matchesFound: matchedEntries.length > 0,
      matchCount: matchedEntries.length,
      totalLogsScanned: logs.length,
      matches: matchedEntries.length > 0 ? matchedEntries : undefined,
      minMatches,
    };

    // Determine pass/fail based on notContains flag
    if (notContains) {
      // For notContains: pass if NO matches found
      if (matchedEntries.length > 0) {
        const firstMatch = matchedEntries[0];
        const errorMsg = `Found ${matchedEntries.length} unexpected match(es) for "${pattern}". First: "${firstMatch.matchedText}" at line ${firstMatch.lineNumber}`;
        return {
          passed: false,
          error: errorMsg,
          data,
        };
      }
      return {
        passed: true,
        data,
      };
    } else {
      // For contains: pass if at least minMatches found
      if (matchedEntries.length < minMatches) {
        const errorMsg = matchedEntries.length === 0
          ? `Pattern "${pattern}" not found in ${logs.length} log entries`
          : `Found ${matchedEntries.length} match(es) but required ${minMatches}`;
        return {
          passed: false,
          error: errorMsg,
          data,
        };
      }
      return {
        passed: true,
        data,
      };
    }
  };

  let finalResult: {
    passed: boolean;
    duration: number;
    attempts: VerificationAttempt[];
    lastData?: LogContainsAssertionData;
  };

  // Use polling if configured (useful for waiting for a log message to appear)
  const pollingOpts = polling ? mergePollingOptions(polling) : undefined;

  if (pollingOpts) {
    pollingOpts.description = `log ${notContains ? 'not ' : ''}contains "${pattern}"`;
    const pollResult = await pollUntil<LogContainsAssertionData>(checkLogContains, pollingOpts);

    if (!pollResult.success) {
      return {
        success: false,
        error: pollResult.error || 'Polling failed',
        errorCode: pollResult.errorCode || 'COMMAND_FAILED',
      };
    }

    finalResult = pollResult.data!;
  } else {
    // Single check (immediate)
    const singleCheck = await checkLogContains();
    finalResult = {
      passed: singleCheck.passed,
      duration: Date.now() - startTime.getTime(),
      attempts: [{
        attempt: 1,
        timestamp: new Date(),
        success: singleCheck.passed,
        duration: Date.now() - startTime.getTime(),
        error: singleCheck.error,
      }],
      lastData: singleCheck.data,
    };
  }

  const { passed, attempts, lastData } = finalResult;

  // Prepare artifacts
  const artifacts: { screenshots?: string[]; logs?: string[] } = {};

  // Capture screenshot on failure
  if (!passed && captureOnFailure) {
    const screenshotPath = path.join(artifactDir, 'log-search-state.png');
    const screenshotResult = await screenshot({ udid, outputPath: screenshotPath });

    if (screenshotResult.success) {
      artifacts.screenshots = [screenshotPath];
    }
  }

  if (passed && captureOnSuccess) {
    const screenshotPath = path.join(artifactDir, 'success.png');
    const screenshotResult = await screenshot({ udid, outputPath: screenshotPath });

    if (screenshotResult.success) {
      artifacts.screenshots = [screenshotPath];
    }
  }

  // Build result
  const resultParams = {
    id: assertionId,
    type: assertionType,
    target: `"${pattern}" in ${bundleId || 'all processes'}`,
    startTime,
    attempts,
    simulator: simulatorInfo,
    artifacts: Object.keys(artifacts).length > 0 ? artifacts : undefined,
    data: lastData,
  };

  if (passed) {
    const matchCount = lastData?.matchCount || 0;
    const scannedCount = lastData?.totalLogsScanned || 0;

    let message: string;
    if (notContains) {
      message = `Pattern "${pattern}" not found in ${scannedCount} log entries (as expected)`;
    } else {
      message = `Found ${matchCount} match(es) for "${pattern}" in ${scannedCount} log entries`;
    }

    logger.info(`${LOG_CONTEXT} Assertion passed: ${message}`);
    return {
      success: true,
      data: createPassedResult({
        ...resultParams,
        message,
      }),
    };
  }

  // Determine if it was a timeout (only applicable when polling)
  if (pollingOpts) {
    const wasTimeout = finalResult.duration >= pollingOpts.timeout;

    if (wasTimeout) {
      logger.warn(`${LOG_CONTEXT} Assertion timeout waiting for log pattern`);
      return {
        success: true,
        data: createTimeoutResult({
          ...resultParams,
          timeout: pollingOpts.timeout,
        }),
      };
    }
  }

  // Build failure message
  let failureMessage: string;
  if (notContains) {
    const matchCount = lastData?.matchCount || 0;
    const firstMatch = lastData?.matches?.[0];
    failureMessage = `Found ${matchCount} unexpected match(es) for "${pattern}"`;
    if (firstMatch) {
      const preview = firstMatch.entry.message.length > 80
        ? firstMatch.entry.message.substring(0, 80) + '...'
        : firstMatch.entry.message;
      failureMessage += `. First at line ${firstMatch.lineNumber}: "${preview}"`;
    }
  } else {
    const matchCount = lastData?.matchCount || 0;
    const scannedCount = lastData?.totalLogsScanned || 0;
    if (matchCount === 0) {
      failureMessage = `Pattern "${pattern}" not found in ${scannedCount} log entries`;
    } else {
      failureMessage = `Found ${matchCount} match(es) but required ${minMatches} for "${pattern}"`;
    }
  }

  if (bundleId) {
    failureMessage += ` (filtering by "${bundleId}")`;
  }

  logger.warn(`${LOG_CONTEXT} Assertion failed: ${failureMessage}`);
  return {
    success: true,
    data: createFailedResult({
      ...resultParams,
      message: failureMessage,
    }),
  };
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Assert log contains a pattern (simple wrapper).
 */
export async function assertLogContainsPattern(
  pattern: string,
  options: Omit<AssertLogContainsOptions, 'matchMode'>
): Promise<IOSResult<VerificationResult<LogContainsAssertionData>>> {
  return assertLogContains(pattern, { ...options, matchMode: 'contains' });
}

/**
 * Assert log contains exact text.
 */
export async function assertLogContainsExact(
  text: string,
  options: Omit<AssertLogContainsOptions, 'matchMode'>
): Promise<IOSResult<VerificationResult<LogContainsAssertionData>>> {
  return assertLogContains(text, { ...options, matchMode: 'exact' });
}

/**
 * Assert log matches a regex pattern.
 */
export async function assertLogMatches(
  regex: string,
  options: Omit<AssertLogContainsOptions, 'matchMode'>
): Promise<IOSResult<VerificationResult<LogContainsAssertionData>>> {
  return assertLogContains(regex, { ...options, matchMode: 'regex' });
}

/**
 * Assert log does NOT contain a pattern.
 */
export async function assertLogNotContains(
  pattern: string,
  options: Omit<AssertLogContainsOptions, 'notContains'>
): Promise<IOSResult<VerificationResult<LogContainsAssertionData>>> {
  return assertLogContains(pattern, { ...options, notContains: true });
}

/**
 * Assert log contains a pattern for a specific app.
 */
export async function assertLogContainsForApp(
  bundleId: string,
  pattern: string,
  options: Omit<AssertLogContainsOptions, 'bundleId'>
): Promise<IOSResult<VerificationResult<LogContainsAssertionData>>> {
  return assertLogContains(pattern, { ...options, bundleId });
}

/**
 * Count occurrences of a pattern in logs.
 */
export async function countLogMatches(
  udid: string,
  pattern: string,
  since: Date,
  bundleId?: string,
  matchMode: LogMatchMode = 'contains'
): Promise<IOSResult<number>> {
  // Create the pattern matcher
  let matcher: RegExp;
  try {
    matcher = createMatcher(pattern, matchMode, false);
  } catch (e) {
    return {
      success: false,
      error: `Invalid pattern "${pattern}": ${e instanceof Error ? e.message : String(e)}`,
      errorCode: 'COMMAND_FAILED',
    };
  }

  const logsResult = await getSystemLog({
    udid,
    since,
    process: bundleId,
    limit: 5000,
  });

  if (!logsResult.success) {
    return {
      success: false,
      error: logsResult.error,
      errorCode: logsResult.errorCode,
    };
  }

  const logs = logsResult.data || [];
  let matchCount = 0;

  for (const entry of logs) {
    if (matcher.test(entry.message)) {
      matchCount++;
    }
  }

  return {
    success: true,
    data: matchCount,
  };
}

/**
 * Check if a pattern exists in logs (returns boolean).
 */
export async function hasLogPattern(
  udid: string,
  pattern: string,
  since?: Date,
  bundleId?: string,
  matchMode: LogMatchMode = 'contains'
): Promise<IOSResult<boolean>> {
  const sinceTime = since || new Date(Date.now() - 60 * 1000);

  // Create the pattern matcher
  let matcher: RegExp;
  try {
    matcher = createMatcher(pattern, matchMode, false);
  } catch (e) {
    return {
      success: false,
      error: `Invalid pattern "${pattern}": ${e instanceof Error ? e.message : String(e)}`,
      errorCode: 'COMMAND_FAILED',
    };
  }

  const logsResult = await getSystemLog({
    udid,
    since: sinceTime,
    process: bundleId,
    limit: 1000, // Smaller limit for boolean check
  });

  if (!logsResult.success) {
    return {
      success: false,
      error: logsResult.error,
      errorCode: logsResult.errorCode,
    };
  }

  const logs = logsResult.data || [];

  for (const entry of logs) {
    if (matcher.test(entry.message)) {
      return {
        success: true,
        data: true,
      };
    }
  }

  return {
    success: true,
    data: false,
  };
}

/**
 * Wait for a log pattern to appear.
 */
export async function waitForLogPattern(
  pattern: string,
  options: AssertLogContainsOptions
): Promise<IOSResult<VerificationResult<LogContainsAssertionData>>> {
  // Ensure polling is enabled for waiting
  const pollingOpts = options.polling || { timeout: 10000, pollInterval: 500 };
  return assertLogContains(pattern, { ...options, polling: pollingOpts });
}

/**
 * Wait for a log pattern to disappear.
 */
export async function waitForLogPatternGone(
  pattern: string,
  options: Omit<AssertLogContainsOptions, 'notContains'>
): Promise<IOSResult<VerificationResult<LogContainsAssertionData>>> {
  // Ensure polling is enabled for waiting
  const pollingOpts = options.polling || { timeout: 10000, pollInterval: 500 };
  return assertLogContains(pattern, { ...options, polling: pollingOpts, notContains: true });
}
