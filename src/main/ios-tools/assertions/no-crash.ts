/**
 * iOS Assertion - Assert No Crash
 *
 * Verifies that an app has not crashed since a given point in time.
 * Uses crash log monitoring to detect app crashes.
 */

import path from 'path';
import { IOSResult, CrashReport } from '../types';
import { getBootedSimulators, getSimulator } from '../simulator';
import { getCrashLogs, hasRecentCrashes, getSystemLogText } from '../logs';
import { screenshot } from '../capture';
import { getSnapshotDirectory } from '../artifacts';
import {
  AssertionBaseOptions,
  VerificationResult,
  pollUntil,
  generateVerificationId,
  createPassedResult,
  createFailedResult,
  createTimeoutResult,
  mergePollingOptions,
} from '../verification';
import { logger } from '../../utils/logger';

const LOG_CONTEXT = '[iOS-Assert-NoCrash]';

// =============================================================================
// Types
// =============================================================================

/**
 * Options for assertNoCrash
 */
export interface AssertNoCrashOptions extends AssertionBaseOptions {
  /** App bundle identifier to check for crashes */
  bundleId: string;
  /** Time from which to check for crashes (default: assertion start time) */
  since?: Date;
  /** Whether to include full crash report content (default: true) */
  includeCrashContent?: boolean;
  /** Whether to collect system logs on failure (default: true) */
  collectLogsOnFailure?: boolean;
}

/**
 * Data specific to no-crash assertion results
 */
export interface NoCrashAssertionData {
  /** The bundle ID being monitored */
  bundleId: string;
  /** Start time for crash monitoring */
  sinceTime: Date;
  /** End time for crash monitoring */
  untilTime: Date;
  /** Monitoring duration in ms */
  monitoringDuration: number;
  /** Whether any crashes were found */
  crashesFound: boolean;
  /** Number of crashes detected */
  crashCount: number;
  /** Crash reports if found */
  crashes?: CrashReport[];
  /** Recent system logs (if collected on failure) */
  recentLogs?: string;
}

// =============================================================================
// Main Function
// =============================================================================

/**
 * Assert that an app has not crashed.
 *
 * @param options - Assertion options
 * @returns Verification result indicating pass/fail
 */
export async function assertNoCrash(
  options: AssertNoCrashOptions
): Promise<IOSResult<VerificationResult<NoCrashAssertionData>>> {
  const {
    udid: providedUdid,
    sessionId,
    assertionId: providedId,
    bundleId,
    since: providedSince,
    polling,
    captureOnFailure = true,
    captureOnSuccess = false,
    includeCrashContent = true,
    collectLogsOnFailure = true,
  } = options;

  const assertionId = providedId || generateVerificationId('no-crash');
  const startTime = new Date();
  const sinceTime = providedSince || startTime;

  logger.info(`${LOG_CONTEXT} Asserting no crash for ${bundleId} since ${sinceTime.toISOString()} (session: ${sessionId})`);

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

  // Check for crashes immediately (no polling for this assertion type)
  // However, if polling is specified, we wait and check periodically
  const pollingOpts = polling ? mergePollingOptions(polling) : undefined;

  const checkNoCrash = async (): Promise<{
    passed: boolean;
    error?: string;
    data?: NoCrashAssertionData;
  }> => {
    const endTime = new Date();

    // Check for crashes
    const crashResult = await getCrashLogs({
      udid,
      bundleId,
      since: sinceTime,
      limit: 10, // Get up to 10 recent crashes
      includeContent: includeCrashContent,
    });

    if (!crashResult.success) {
      // If we can't check crashes, we can't verify - treat as unknown
      return {
        passed: false,
        error: crashResult.error || 'Failed to check crash logs',
      };
    }

    const crashes = crashResult.data || [];
    const monitoringDuration = endTime.getTime() - sinceTime.getTime();

    const data: NoCrashAssertionData = {
      bundleId,
      sinceTime,
      untilTime: endTime,
      monitoringDuration,
      crashesFound: crashes.length > 0,
      crashCount: crashes.length,
      crashes: crashes.length > 0 ? crashes : undefined,
    };

    if (crashes.length > 0) {
      const latestCrash = crashes[0];
      const crashTime = latestCrash.timestamp.toISOString();
      const errorMsg = `App "${bundleId}" crashed at ${crashTime}${latestCrash.exceptionType ? ` (${latestCrash.exceptionType})` : ''}`;

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
  };

  let finalResult: {
    passed: boolean;
    duration: number;
    attempts: { attempt: number; timestamp: Date; success: boolean; duration: number; error?: string }[];
    lastData?: NoCrashAssertionData;
  };

  if (pollingOpts) {
    // Use polling if specified
    pollingOpts.description = `no crash for ${bundleId}`;
    const pollResult = await pollUntil<NoCrashAssertionData>(checkNoCrash, pollingOpts);

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
    const singleCheck = await checkNoCrash();
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
    const screenshotPath = path.join(artifactDir, 'crash-state.png');
    const screenshotResult = await screenshot({ udid, outputPath: screenshotPath });

    if (screenshotResult.success) {
      artifacts.screenshots = [screenshotPath];
    }

    // Also collect recent logs
    if (collectLogsOnFailure) {
      const logsResult = await getSystemLogText(udid, sinceTime);
      if (logsResult.success && logsResult.data && lastData) {
        lastData.recentLogs = logsResult.data.slice(0, 10000); // Limit log size
      }
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
    type: 'no-crash',
    target: bundleId,
    startTime,
    attempts,
    simulator: simulatorInfo,
    artifacts: Object.keys(artifacts).length > 0 ? artifacts : undefined,
    data: lastData,
  };

  if (passed) {
    const monitoringTime = lastData?.monitoringDuration || (Date.now() - sinceTime.getTime());
    logger.info(`${LOG_CONTEXT} Assertion passed: ${bundleId} has not crashed (monitored for ${monitoringTime}ms)`);
    return {
      success: true,
      data: createPassedResult({
        ...resultParams,
        message: `App "${bundleId}" has not crashed since ${sinceTime.toISOString()}`,
      }),
    };
  }

  // Determine if it was a timeout (only applicable when polling)
  if (pollingOpts) {
    const wasTimeout = finalResult.duration >= pollingOpts.timeout;

    if (wasTimeout) {
      logger.warn(`${LOG_CONTEXT} Assertion timeout checking for crashes in ${bundleId}`);
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
  const crashCount = lastData?.crashCount || 0;
  const latestCrash = lastData?.crashes?.[0];
  let failureMessage = `App "${bundleId}" crashed`;

  if (crashCount > 1) {
    failureMessage += ` (${crashCount} crashes detected)`;
  }

  if (latestCrash) {
    failureMessage += ` at ${latestCrash.timestamp.toISOString()}`;
    if (latestCrash.exceptionType) {
      failureMessage += `: ${latestCrash.exceptionType}`;
    }
    if (latestCrash.exceptionMessage) {
      failureMessage += ` - ${latestCrash.exceptionMessage}`;
    }
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
 * Quick check if an app has crashed recently.
 * Returns a simple boolean result.
 */
export async function hasCrashed(
  bundleId: string,
  udid: string,
  since: Date
): Promise<IOSResult<boolean>> {
  return hasRecentCrashes(udid, bundleId, since);
}

/**
 * Wait for app to not crash for a specified duration.
 * Useful for soak testing or stability verification.
 */
export async function waitForNoCrash(
  options: AssertNoCrashOptions & { monitorDuration: number }
): Promise<IOSResult<VerificationResult<NoCrashAssertionData>>> {
  const { monitorDuration, ...assertOptions } = options;

  // Set up polling to match the monitoring duration
  return assertNoCrash({
    ...assertOptions,
    polling: {
      timeout: monitorDuration,
      pollInterval: Math.min(1000, monitorDuration / 10), // Poll at least 10 times
      description: `stability monitoring for ${options.bundleId}`,
    },
  });
}

/**
 * Assert that no crashes occurred during a specific time window.
 */
export async function assertNoCrashInWindow(
  bundleId: string,
  sessionId: string,
  startTime: Date,
  endTime: Date,
  udid?: string
): Promise<IOSResult<VerificationResult<NoCrashAssertionData>>> {
  const result = await assertNoCrash({
    bundleId,
    sessionId,
    udid,
    since: startTime,
  });

  // Verify the check completed before endTime
  if (result.success && result.data) {
    const checkTime = result.data.endTime;
    if (checkTime > endTime) {
      logger.warn(`${LOG_CONTEXT} Crash check completed after the specified window end time`);
    }
  }

  return result;
}
