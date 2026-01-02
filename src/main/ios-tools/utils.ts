/**
 * iOS Tools - Utility Functions
 *
 * Shared utilities for iOS tooling operations including:
 * - Safe command execution wrappers for xcrun simctl
 * - JSON parsing for simctl output
 * - Polling/wait helpers
 */

import { execFileNoThrow, ExecResult } from '../utils/execFile';
import { logger } from '../utils/logger';
import { RawSimctlListOutput, IOSResult, IOSError, IOSErrorCode } from './types';

const LOG_CONTEXT = '[iOS-Tools]';

// =============================================================================
// Command Execution Wrappers
// =============================================================================

/**
 * Run an xcrun simctl command safely.
 * Wraps execFileNoThrow to provide consistent error handling.
 *
 * @param args - Arguments to pass to simctl
 * @param cwd - Optional working directory
 * @returns ExecResult with stdout, stderr, and exitCode
 */
export async function runSimctl(args: string[], cwd?: string): Promise<ExecResult> {
  logger.debug(`${LOG_CONTEXT} Running: xcrun simctl ${args.join(' ')}`, LOG_CONTEXT);

  const result = await execFileNoThrow('xcrun', ['simctl', ...args], cwd);

  if (result.exitCode !== 0) {
    logger.warn(
      `${LOG_CONTEXT} simctl command failed: xcrun simctl ${args.join(' ')} (exit: ${result.exitCode})`,
      LOG_CONTEXT
    );
    if (result.stderr) {
      logger.debug(`${LOG_CONTEXT} stderr: ${result.stderr}`, LOG_CONTEXT);
    }
  }

  return result;
}

/**
 * Run an xcrun command (not simctl).
 *
 * @param args - Arguments to pass to xcrun
 * @param cwd - Optional working directory
 * @returns ExecResult with stdout, stderr, and exitCode
 */
export async function runXcrun(args: string[], cwd?: string): Promise<ExecResult> {
  logger.debug(`${LOG_CONTEXT} Running: xcrun ${args.join(' ')}`, LOG_CONTEXT);

  const result = await execFileNoThrow('xcrun', args, cwd);

  if (result.exitCode !== 0) {
    logger.warn(
      `${LOG_CONTEXT} xcrun command failed: xcrun ${args.join(' ')} (exit: ${result.exitCode})`,
      LOG_CONTEXT
    );
  }

  return result;
}

/**
 * Run the xcode-select command.
 *
 * @param args - Arguments to pass to xcode-select
 * @returns ExecResult with stdout, stderr, and exitCode
 */
export async function runXcodeSelect(args: string[]): Promise<ExecResult> {
  logger.debug(`${LOG_CONTEXT} Running: xcode-select ${args.join(' ')}`, LOG_CONTEXT);

  const result = await execFileNoThrow('xcode-select', args);

  if (result.exitCode !== 0) {
    logger.warn(
      `${LOG_CONTEXT} xcode-select command failed: ${args.join(' ')} (exit: ${result.exitCode})`,
      LOG_CONTEXT
    );
  }

  return result;
}

/**
 * Run xcodebuild command.
 *
 * @param args - Arguments to pass to xcodebuild
 * @param cwd - Optional working directory
 * @returns ExecResult with stdout, stderr, and exitCode
 */
export async function runXcodebuild(args: string[], cwd?: string): Promise<ExecResult> {
  logger.debug(`${LOG_CONTEXT} Running: xcodebuild ${args.join(' ')}`, LOG_CONTEXT);

  const result = await execFileNoThrow('xcodebuild', args, cwd);

  if (result.exitCode !== 0) {
    logger.warn(
      `${LOG_CONTEXT} xcodebuild command failed (exit: ${result.exitCode})`,
      LOG_CONTEXT
    );
  }

  return result;
}

// =============================================================================
// JSON Parsing
// =============================================================================

/**
 * Parse simctl JSON output safely.
 * Handles common parsing errors and returns typed result.
 *
 * @param output - Raw JSON string from simctl command
 * @returns Parsed RawSimctlListOutput or error
 */
export function parseSimctlJson(output: string): IOSResult<RawSimctlListOutput> {
  try {
    // simctl sometimes includes non-JSON output before the JSON
    // Find the first '{' and parse from there
    const jsonStart = output.indexOf('{');
    if (jsonStart === -1) {
      return {
        success: false,
        error: 'No JSON object found in simctl output',
        errorCode: 'PARSE_ERROR',
      };
    }

    const jsonString = output.slice(jsonStart);
    const parsed = JSON.parse(jsonString) as RawSimctlListOutput;

    // Validate expected structure
    if (!parsed.devices || typeof parsed.devices !== 'object') {
      return {
        success: false,
        error: 'Invalid simctl output: missing devices object',
        errorCode: 'PARSE_ERROR',
      };
    }

    return {
      success: true,
      data: parsed,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown parse error';
    return {
      success: false,
      error: `Failed to parse simctl JSON: ${message}`,
      errorCode: 'PARSE_ERROR',
    };
  }
}

/**
 * Parse a generic JSON output safely.
 *
 * @param output - Raw JSON string
 * @returns Parsed object or error
 */
export function parseJson<T>(output: string): IOSResult<T> {
  try {
    const jsonStart = output.indexOf('{');
    const jsonArrayStart = output.indexOf('[');

    let startIndex = -1;
    if (jsonStart === -1 && jsonArrayStart === -1) {
      return {
        success: false,
        error: 'No JSON found in output',
        errorCode: 'PARSE_ERROR',
      };
    } else if (jsonStart === -1) {
      startIndex = jsonArrayStart;
    } else if (jsonArrayStart === -1) {
      startIndex = jsonStart;
    } else {
      startIndex = Math.min(jsonStart, jsonArrayStart);
    }

    const jsonString = output.slice(startIndex);
    const parsed = JSON.parse(jsonString) as T;

    return {
      success: true,
      data: parsed,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown parse error';
    return {
      success: false,
      error: `Failed to parse JSON: ${message}`,
      errorCode: 'PARSE_ERROR',
    };
  }
}

// =============================================================================
// Polling Helpers
// =============================================================================

/**
 * Wait for a condition to be true with timeout.
 *
 * @param condition - Async function that returns true when condition is met
 * @param timeout - Maximum time to wait in milliseconds
 * @param interval - Polling interval in milliseconds (default: 500)
 * @returns IOSResult indicating success or timeout
 */
export async function waitFor(
  condition: () => Promise<boolean>,
  timeout: number,
  interval: number = 500
): Promise<IOSResult<void>> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const result = await condition();
      if (result) {
        return { success: true };
      }
    } catch (e) {
      // Condition threw an error, continue waiting
      logger.debug(`${LOG_CONTEXT} waitFor condition threw: ${e}`, LOG_CONTEXT);
    }

    // Wait before next check
    await sleep(interval);
  }

  return {
    success: false,
    error: `Timeout after ${timeout}ms`,
    errorCode: 'TIMEOUT',
  };
}

/**
 * Sleep for specified milliseconds.
 *
 * @param ms - Milliseconds to sleep
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// Error Helpers
// =============================================================================

/**
 * Create an IOSError from an ExecResult.
 *
 * @param result - ExecResult from command execution
 * @param code - Error code to use
 * @param message - Human-readable message
 * @param command - Command that was executed
 */
export function createError(
  result: ExecResult,
  code: IOSErrorCode,
  message: string,
  command?: string
): IOSError {
  return {
    code,
    message,
    details: result.stderr || result.stdout,
    command,
    exitCode: result.exitCode,
  };
}

/**
 * Create an IOSResult failure from an ExecResult.
 *
 * @param result - ExecResult from command execution
 * @param code - Error code to use
 * @param message - Human-readable message
 */
export function createFailure<T>(
  result: ExecResult,
  code: IOSErrorCode,
  message: string
): IOSResult<T> {
  return {
    success: false,
    error: message,
    errorCode: code,
  };
}

// =============================================================================
// Version Parsing
// =============================================================================

/**
 * Parse iOS version from runtime identifier.
 * E.g., "com.apple.CoreSimulator.SimRuntime.iOS-17-5" -> "17.5"
 *
 * @param runtimeId - Full runtime identifier
 * @returns iOS version string or "unknown"
 */
export function parseIOSVersionFromRuntime(runtimeId: string): string {
  // Match patterns like:
  // - com.apple.CoreSimulator.SimRuntime.iOS-17-5
  // - com.apple.CoreSimulator.SimRuntime.iOS-16-4
  const match = runtimeId.match(/iOS-(\d+)-(\d+)/i);
  if (match) {
    return `${match[1]}.${match[2]}`;
  }

  // Try alternate pattern for older runtimes
  const altMatch = runtimeId.match(/iOS (\d+\.\d+)/i);
  if (altMatch) {
    return altMatch[1];
  }

  return 'unknown';
}

/**
 * Parse device type name from identifier.
 * E.g., "com.apple.CoreSimulator.SimDeviceType.iPhone-15-Pro" -> "iPhone 15 Pro"
 *
 * @param deviceTypeId - Full device type identifier
 * @returns Human-readable device name or the original identifier
 */
export function parseDeviceTypeName(deviceTypeId: string): string {
  // Extract the device part from identifiers like:
  // - com.apple.CoreSimulator.SimDeviceType.iPhone-15-Pro
  const match = deviceTypeId.match(/SimDeviceType\.(.+)$/);
  if (match) {
    // Replace hyphens with spaces
    return match[1].replace(/-/g, ' ');
  }
  return deviceTypeId;
}
