/**
 * iOS Tools - Error Handling
 *
 * Centralized error handling for iOS tooling operations.
 * Provides user-friendly error messages with troubleshooting hints.
 */

import { IOSResult, IOSErrorCode } from './types';
import { logger } from '../utils/logger';

const LOG_CONTEXT = '[iOS-Errors]';

// =============================================================================
// Error Message Templates
// =============================================================================

/**
 * User-friendly error messages with troubleshooting hints.
 */
export const ERROR_MESSAGES: Record<IOSErrorCode, { title: string; hint: string }> = {
  XCODE_NOT_FOUND: {
    title: 'Xcode not found',
    hint: 'Install Xcode from the App Store or run: xcode-select --install',
  },
  XCODE_VERSION_UNSUPPORTED: {
    title: 'Xcode version not supported',
    hint: 'Update Xcode to the latest version from the App Store',
  },
  SIMULATOR_NOT_FOUND: {
    title: 'Simulator not found',
    hint: 'Check available simulators with: xcrun simctl list devices',
  },
  SIMULATOR_NOT_BOOTED: {
    title: 'No simulator is booted',
    hint: 'Start a simulator with: xcrun simctl boot "iPhone 15 Pro" or open Simulator.app',
  },
  SIMULATOR_BOOT_FAILED: {
    title: 'Failed to boot simulator',
    hint: 'Try restarting the simulator or erasing it with: xcrun simctl erase <udid>',
  },
  APP_NOT_INSTALLED: {
    title: 'App not installed on simulator',
    hint: 'Install the app with: xcrun simctl install booted /path/to/App.app',
  },
  APP_INSTALL_FAILED: {
    title: 'Failed to install app',
    hint: 'Ensure the .app bundle is valid and built for the simulator architecture',
  },
  APP_LAUNCH_FAILED: {
    title: 'Failed to launch app',
    hint: 'Check that the bundle ID is correct and the app is properly signed',
  },
  SCREENSHOT_FAILED: {
    title: 'Failed to capture screenshot',
    hint: 'Ensure the simulator is running and responsive. Try restarting the simulator if frozen.',
  },
  RECORDING_FAILED: {
    title: 'Failed to record video',
    hint: 'Ensure no other recording is in progress. Check available disk space.',
  },
  LOG_COLLECTION_FAILED: {
    title: 'Failed to collect logs',
    hint: 'Check that the simulator is booted and log service is running',
  },
  BUILD_FAILED: {
    title: 'Build failed',
    hint: 'Check build logs for compilation errors. Ensure dependencies are installed.',
  },
  TEST_FAILED: {
    title: 'Tests failed',
    hint: 'Check test output for assertion failures or setup errors',
  },
  TIMEOUT: {
    title: 'Operation timed out',
    hint: 'The operation took too long. The simulator may be frozen or under heavy load.',
  },
  COMMAND_FAILED: {
    title: 'Command failed',
    hint: 'Check the error details for more information',
  },
  PARSE_ERROR: {
    title: 'Failed to parse response',
    hint: 'The output format was unexpected. This may be a version compatibility issue.',
  },
  UNKNOWN: {
    title: 'Unknown error',
    hint: 'An unexpected error occurred. Check the logs for details.',
  },
  // Interaction-specific errors
  ELEMENT_NOT_FOUND: {
    title: 'Element not found',
    hint: 'Use /ios.inspect to view the current UI hierarchy and find the correct element identifier or label.',
  },
  ELEMENT_NOT_HITTABLE: {
    title: 'Element not hittable',
    hint: 'The element may be obscured by another view. Try dismissing overlays or scrolling the element fully into view.',
  },
  ELEMENT_NOT_VISIBLE: {
    title: 'Element not visible',
    hint: 'The element exists but is not visible on screen. Try scrolling it into view with /ios.scroll --to <target>.',
  },
  ELEMENT_NOT_ENABLED: {
    title: 'Element is disabled',
    hint: 'The element is in a disabled state. Complete any required preceding steps or wait for the element to become enabled.',
  },
  ELEMENT_OBSCURED: {
    title: 'Element is obscured',
    hint: 'Another element is covering the target. Dismiss any alerts, popovers, or modals first.',
  },
  ELEMENT_OFF_SCREEN: {
    title: 'Element is off-screen',
    hint: 'The element is outside the visible screen bounds. Scroll the element into view first.',
  },
  ELEMENT_ZERO_SIZE: {
    title: 'Element has zero size',
    hint: 'The element may be collapsed or hidden. Wait for it to load or expand.',
  },
  MAESTRO_NOT_INSTALLED: {
    title: 'Maestro CLI not installed',
    hint: 'Install with: brew tap mobile-dev-inc/tap && brew install maestro',
  },
  FLOW_TIMEOUT: {
    title: 'Flow execution timed out',
    hint: 'The flow took too long. Increase timeout with --timeout or break into smaller steps.',
  },
  FLOW_VALIDATION_FAILED: {
    title: 'Flow validation failed',
    hint: 'Check the YAML syntax. Use maestro validate <flow.yaml> for detailed errors.',
  },
  APP_CRASHED: {
    title: 'App crashed during interaction',
    hint: 'Check crash logs with /ios.logs --crash and restart the app.',
  },
  APP_NOT_RUNNING: {
    title: 'App is not running',
    hint: 'Launch the app first with /ios.run_flow --inline "launchApp: <bundleId>".',
  },
  INTERACTION_TIMEOUT: {
    title: 'Interaction timed out',
    hint: 'The element did not respond in time. Increase timeout with --timeout <ms>.',
  },
};

// =============================================================================
// Error Formatting
// =============================================================================

/**
 * Format an error result into a user-friendly message.
 *
 * @param result - The failed IOSResult
 * @returns Formatted error message with troubleshooting hints
 */
export function formatErrorForUser<T>(result: IOSResult<T>): string {
  if (result.success) {
    return '';
  }

  const errorCode = (result.errorCode as IOSErrorCode) || 'UNKNOWN';
  const template = ERROR_MESSAGES[errorCode] || ERROR_MESSAGES.UNKNOWN;

  let message = `**${template.title}**`;

  if (result.error) {
    message += `\n\n${result.error}`;
  }

  message += `\n\n**Tip**: ${template.hint}`;

  return message;
}

/**
 * Get troubleshooting hint for an error code.
 */
export function getTroubleshootingHint(errorCode: string): string {
  const template = ERROR_MESSAGES[errorCode as IOSErrorCode];
  return template?.hint || ERROR_MESSAGES.UNKNOWN.hint;
}

// =============================================================================
// Error Detection Patterns
// =============================================================================

/**
 * Common error patterns from simctl output.
 * Used to detect specific error conditions from command output.
 */
export const ERROR_PATTERNS = {
  // Simulator state errors
  simulatorNotBooted: [
    /simulator.*not.*booted/i,
    /device.*shutdown/i,
    /no.*booted.*device/i,
    /unable.*boot/i,
  ],
  simulatorNotFound: [
    /invalid.*device/i,
    /device.*not.*found/i,
    /unknown.*device/i,
    /no.*device.*matches/i,
  ],
  simulatorFrozen: [
    /timed?\s*out/i,
    /not.*responding/i,
    /frozen/i,
    /hang/i,
  ],

  // App errors
  appNotInstalled: [
    /unable.*find.*bundle/i,
    /app.*not.*installed/i,
    /bundle.*not.*found/i,
    /no.*such.*app/i,
  ],
  appNotRunning: [
    /not.*running/i,
    /no.*process/i,
  ],

  // Permission errors
  permissionDenied: [
    /permission.*denied/i,
    /access.*denied/i,
    /operation.*not.*permitted/i,
    /eacces/i,
  ],

  // Resource errors
  diskFull: [
    /no.*space/i,
    /disk.*full/i,
    /enospc/i,
  ],

  // Screenshot/capture errors
  captureTimeout: [
    /screenshot.*timeout/i,
    /capture.*failed.*timeout/i,
    /io.*timeout/i,
  ],
};

/**
 * Detect error type from command output.
 *
 * @param output - stderr or stdout from command
 * @returns Detected error code or undefined
 */
export function detectErrorType(output: string): IOSErrorCode | undefined {
  // Check each error pattern category
  if (ERROR_PATTERNS.simulatorNotBooted.some((p) => p.test(output))) {
    return 'SIMULATOR_NOT_BOOTED';
  }
  if (ERROR_PATTERNS.simulatorNotFound.some((p) => p.test(output))) {
    return 'SIMULATOR_NOT_FOUND';
  }
  if (ERROR_PATTERNS.simulatorFrozen.some((p) => p.test(output))) {
    return 'TIMEOUT';
  }
  if (ERROR_PATTERNS.appNotInstalled.some((p) => p.test(output))) {
    return 'APP_NOT_INSTALLED';
  }
  if (ERROR_PATTERNS.permissionDenied.some((p) => p.test(output))) {
    return 'COMMAND_FAILED';
  }
  if (ERROR_PATTERNS.diskFull.some((p) => p.test(output))) {
    return 'COMMAND_FAILED';
  }
  if (ERROR_PATTERNS.captureTimeout.some((p) => p.test(output))) {
    return 'SCREENSHOT_FAILED';
  }

  return undefined;
}

// =============================================================================
// Error Creation Helpers
// =============================================================================

/**
 * Create a failure result with user-friendly message.
 *
 * @param errorCode - The error code
 * @param details - Optional additional details
 * @returns IOSResult in failure state
 */
export function createUserFriendlyError<T>(
  errorCode: IOSErrorCode,
  details?: string
): IOSResult<T> {
  const template = ERROR_MESSAGES[errorCode] || ERROR_MESSAGES.UNKNOWN;

  let errorMessage = template.title;
  if (details) {
    errorMessage += `: ${details}`;
  }
  errorMessage += `. ${template.hint}`;

  logger.warn(`${LOG_CONTEXT} ${errorCode}: ${errorMessage}`);

  return {
    success: false,
    error: errorMessage,
    errorCode,
  };
}

/**
 * Wrap an error from external command into user-friendly format.
 *
 * @param commandOutput - stderr/stdout from failed command
 * @param defaultCode - Default error code if not detected
 * @param context - Context for the operation (e.g., "capturing screenshot")
 * @returns IOSResult in failure state
 */
export function wrapCommandError<T>(
  commandOutput: string,
  defaultCode: IOSErrorCode = 'COMMAND_FAILED',
  context?: string
): IOSResult<T> {
  // Try to detect specific error type
  const detectedCode = detectErrorType(commandOutput) || defaultCode;

  let errorMessage = context ? `Failed ${context}` : 'Command failed';

  // Extract first meaningful line from output
  const firstLine = commandOutput
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !l.startsWith('Usage:'));

  if (firstLine) {
    errorMessage += `: ${firstLine}`;
  }

  return createUserFriendlyError(detectedCode, errorMessage.replace(/^Failed [^:]+: /, ''));
}

// =============================================================================
// Error Validation Helpers
// =============================================================================

/**
 * Validate that a simulator is booted and return helpful error if not.
 *
 * @param simulatorState - Current simulator state
 * @param simulatorName - Simulator name for error message
 * @returns Error result if not booted, undefined if ok
 */
export function validateSimulatorBooted<T>(
  simulatorState: string,
  simulatorName?: string
): IOSResult<T> | undefined {
  if (simulatorState === 'Booted') {
    return undefined;
  }

  const details = simulatorName
    ? `${simulatorName} is ${simulatorState.toLowerCase()}`
    : `Simulator is ${simulatorState.toLowerCase()}`;

  return createUserFriendlyError<T>('SIMULATOR_NOT_BOOTED', details);
}

/**
 * Validate that a bundle ID looks valid.
 *
 * @param bundleId - Bundle ID to validate
 * @returns Error result if invalid, undefined if ok
 */
export function validateBundleId<T>(bundleId: string): IOSResult<T> | undefined {
  // Bundle IDs should be reverse-domain format
  const bundleIdPattern = /^[a-zA-Z][a-zA-Z0-9-]*(\.[a-zA-Z][a-zA-Z0-9-]*)+$/;

  if (!bundleIdPattern.test(bundleId)) {
    return {
      success: false,
      error: `Invalid bundle ID format: "${bundleId}". Bundle IDs should be in reverse-domain format (e.g., com.example.myapp)`,
      errorCode: 'COMMAND_FAILED',
    };
  }

  return undefined;
}

// =============================================================================
// Specific Error Creators (for common scenarios)
// =============================================================================

/**
 * Create error for no booted simulator scenario.
 */
export function noBootedSimulatorError<T>(): IOSResult<T> {
  return createUserFriendlyError<T>(
    'SIMULATOR_NOT_BOOTED',
    'No booted simulator found. Please specify --simulator or boot a simulator'
  );
}

/**
 * Create error for simulator not found scenario.
 */
export function simulatorNotFoundError<T>(identifier: string): IOSResult<T> {
  return createUserFriendlyError<T>(
    'SIMULATOR_NOT_FOUND',
    `No simulator found matching "${identifier}"`
  );
}

/**
 * Create error for app not installed scenario.
 */
export function appNotInstalledError<T>(bundleId: string): IOSResult<T> {
  return createUserFriendlyError<T>(
    'APP_NOT_INSTALLED',
    `App with bundle ID "${bundleId}" is not installed on this simulator`
  );
}

/**
 * Create error for permission denied scenario.
 */
export function permissionDeniedError<T>(path: string): IOSResult<T> {
  return {
    success: false,
    error: `Permission denied accessing "${path}". Check file permissions or run with appropriate privileges.`,
    errorCode: 'COMMAND_FAILED',
  };
}

/**
 * Create error for screenshot timeout scenario.
 */
export function screenshotTimeoutError<T>(simulatorName?: string): IOSResult<T> {
  const details = simulatorName
    ? `Screenshot timed out for ${simulatorName}`
    : 'Screenshot timed out';

  return createUserFriendlyError<T>(
    'SCREENSHOT_FAILED',
    `${details}. The simulator may be frozen or unresponsive. Try restarting the Simulator.app.`
  );
}

/**
 * Create error for log parsing failure (non-fatal, for logging).
 */
export function logParsingWarning(lineNumber: number, content: string): void {
  const preview = content.length > 100 ? content.substring(0, 100) + '...' : content;
  logger.warn(
    `${LOG_CONTEXT} Skipping malformed log entry at line ${lineNumber}: ${preview}`
  );
}
