/**
 * iOS Inspect Error Handling
 *
 * Provides specialized error types, detection, and user-friendly messages
 * for UI inspection failures. Handles common scenarios:
 * - App not running
 * - App crashed during inspection
 * - XCUITest build failures
 * - Timeout during inspection
 * - Empty UI tree (loading state)
 */

import { IOSErrorCode, IOSResult } from './types';

// =============================================================================
// Error Types
// =============================================================================

/**
 * Inspection-specific error codes extending base IOSErrorCode
 */
export type InspectErrorCode =
  | 'APP_NOT_RUNNING'
  | 'APP_CRASHED'
  | 'APP_TERMINATED'
  | 'XCUITEST_BUILD_FAILED'
  | 'XCUITEST_SIGNING_ERROR'
  | 'XCUITEST_DEPENDENCY_MISSING'
  | 'INSPECTION_TIMEOUT'
  | 'EMPTY_UI_TREE'
  | 'LOADING_STATE_DETECTED'
  | IOSErrorCode;

/**
 * Detailed inspection error with recovery suggestions
 */
export interface InspectError {
  /** Error code */
  code: InspectErrorCode;
  /** Human-readable message */
  message: string;
  /** Detailed explanation */
  details?: string;
  /** Suggestions for fixing the error */
  suggestions: string[];
  /** Whether the error is recoverable */
  recoverable: boolean;
  /** Suggested action for Auto Run */
  autoRunAction?: 'retry' | 'skip' | 'fail' | 'wait';
  /** Retry delay in milliseconds (if applicable) */
  retryDelayMs?: number;
  /** Original error details */
  originalError?: string;
}

// =============================================================================
// Error Detection Patterns
// =============================================================================

/**
 * Patterns to detect "app not running" errors
 */
const APP_NOT_RUNNING_PATTERNS = [
  'Application is not running',
  'Target application is not running',
  'App is not installed',
  'Application not found',
  'Unable to find bundle with identifier',
  'Failed to find matching element',
  'XCTApplicationStateNotRunning',
  'Application state: not running',
  'kAXErrorFailure',
  'The operation couldn\'t be completed',
];

/**
 * Patterns to detect app crash during inspection
 */
const APP_CRASHED_PATTERNS = [
  'Application crashed',
  'App unexpectedly quit',
  'Terminated due to signal',
  'EXC_BAD_ACCESS',
  'EXC_CRASH',
  'SIGABRT',
  'SIGSEGV',
  'SIGBUS',
  'Application is no longer running',
  'Process was terminated',
  'App terminated unexpectedly',
  'Lost connection to the application',
];

/**
 * Patterns to detect XCUITest build failures
 */
const BUILD_FAILURE_PATTERNS = [
  'Build Failed',
  'Compile Swift source files',
  'error: module',
  'cannot find',
  'undeclared identifier',
  'use of unresolved identifier',
  'Build operation failed',
  'xcodebuild: error:',
  'Command CompileSwift failed',
  'clang: error:',
  'linker command failed',
];

/**
 * Patterns to detect signing/provisioning errors
 */
const SIGNING_ERROR_PATTERNS = [
  'Signing certificate',
  'provisioning profile',
  'Code Sign error',
  'No signing certificate',
  'A valid provisioning profile',
  'Signing requires a development team',
  'Unable to install',
  'could not be verified',
  'is not signed',
];

/**
 * Patterns to detect XCUITest dependency issues
 */
const DEPENDENCY_MISSING_PATTERNS = [
  'XCTest.framework',
  'cannot find module',
  'No such module',
  'Missing required module',
  'framework not found',
  'XCUITest.framework could not be found',
];

/**
 * Patterns to detect timeout errors
 */
const TIMEOUT_PATTERNS = [
  'timed out',
  'Timeout',
  'timeout exceeded',
  'operation timed out',
  'deadline exceeded',
  'Test operation was cancelled',
  'waiting for idle state',
  'Wait for app to become idle',
];

/**
 * Patterns to detect empty/loading UI states
 */
const EMPTY_UI_PATTERNS = [
  'No accessible elements',
  'UI hierarchy is empty',
  'No elements found',
  'totalElements: 0',
  'totalElements":0',
  'interactableElements":0',
  'Only root element found',
];

/**
 * Patterns indicating app is in loading state
 */
const LOADING_STATE_PATTERNS = [
  'ActivityIndicator',
  'UIActivityIndicatorView',
  'Loading',
  'Spinner',
  'Progress',
  'Please wait',
  'ProgressHUD',
  'ProgressView',
];

// =============================================================================
// Error Detection Functions
// =============================================================================

/**
 * Check if error message matches any patterns
 */
function matchesPatterns(error: string, patterns: string[]): boolean {
  const lowerError = error.toLowerCase();
  return patterns.some((pattern) => lowerError.includes(pattern.toLowerCase()));
}

/**
 * Detect the type of inspection error from error message and output
 */
export function detectInspectError(
  errorMessage: string,
  stdout?: string,
  stderr?: string,
  exitCode?: number
): InspectError {
  const combined = [errorMessage, stdout || '', stderr || ''].join('\n');

  // Check for app not running
  if (matchesPatterns(combined, APP_NOT_RUNNING_PATTERNS)) {
    return createAppNotRunningError(errorMessage);
  }

  // Check for app crash
  if (matchesPatterns(combined, APP_CRASHED_PATTERNS)) {
    return createAppCrashedError(errorMessage);
  }

  // Check for signing errors (before general build errors)
  if (matchesPatterns(combined, SIGNING_ERROR_PATTERNS)) {
    return createSigningError(errorMessage);
  }

  // Check for dependency issues (before general build errors)
  if (matchesPatterns(combined, DEPENDENCY_MISSING_PATTERNS)) {
    return createDependencyMissingError(errorMessage);
  }

  // Check for build failures
  if (matchesPatterns(combined, BUILD_FAILURE_PATTERNS)) {
    return createBuildFailedError(errorMessage, combined);
  }

  // Check for timeout
  if (matchesPatterns(combined, TIMEOUT_PATTERNS)) {
    return createTimeoutError(errorMessage);
  }

  // Check for empty UI (could be loading state)
  if (matchesPatterns(combined, EMPTY_UI_PATTERNS)) {
    // Check if loading indicators present
    if (matchesPatterns(combined, LOADING_STATE_PATTERNS)) {
      return createLoadingStateError(errorMessage);
    }
    return createEmptyUITreeError(errorMessage);
  }

  // Unknown error - return generic
  return createGenericInspectError(errorMessage, exitCode);
}

// =============================================================================
// Error Creation Functions
// =============================================================================

/**
 * Create error for when app is not running
 */
export function createAppNotRunningError(originalError?: string): InspectError {
  return {
    code: 'APP_NOT_RUNNING',
    message: 'The target app is not running on the simulator',
    details: 'UI inspection requires the app to be launched and in the foreground.',
    suggestions: [
      'Launch the app: /ios.launch --app <bundleId>',
      'Or use ios.launch action in your playbook before ios.inspect',
      'Verify the app is installed: /ios.apps --simulator',
      'Check if the correct simulator is selected',
    ],
    recoverable: true,
    autoRunAction: 'retry',
    retryDelayMs: 2000,
    originalError,
  };
}

/**
 * Create error for when app crashes during inspection
 */
export function createAppCrashedError(originalError?: string): InspectError {
  return {
    code: 'APP_CRASHED',
    message: 'The app crashed during UI inspection',
    details: 'The application terminated unexpectedly while the UI hierarchy was being traversed.',
    suggestions: [
      'Check for crash logs: /ios.snapshot --include-crashes',
      'Review recent app changes for stability issues',
      'Try launching the app and waiting for it to stabilize',
      'If crash persists, the app may have a bug triggered by accessibility queries',
    ],
    recoverable: true,
    autoRunAction: 'fail',
    originalError,
  };
}

/**
 * Create error for XCUITest build failures
 */
export function createBuildFailedError(
  originalError?: string,
  buildOutput?: string
): InspectError {
  // Try to extract specific error from build output
  let details = 'The XCUITest inspector failed to build.';
  if (buildOutput) {
    const errorLines = buildOutput
      .split('\n')
      .filter((line) => line.includes('error:'))
      .slice(0, 3);
    if (errorLines.length > 0) {
      details = `Build errors:\n${errorLines.join('\n')}`;
    }
  }

  return {
    code: 'XCUITEST_BUILD_FAILED',
    message: 'Failed to build XCUITest inspector',
    details,
    suggestions: [
      'Ensure Xcode is properly installed: xcode-select -p',
      'Accept Xcode license: sudo xcodebuild -license accept',
      'Try clearing the inspector cache: Clear ~/.maestro/ios-tools/xcuitest-cache',
      'Check that Xcode command line tools are current: xcode-select --install',
    ],
    recoverable: false,
    autoRunAction: 'fail',
    originalError,
  };
}

/**
 * Create error for signing/provisioning issues
 */
export function createSigningError(originalError?: string): InspectError {
  return {
    code: 'XCUITEST_SIGNING_ERROR',
    message: 'Code signing error for XCUITest inspector',
    details:
      'The test bundle requires a valid signing configuration. This usually happens when Xcode cannot automatically manage signing.',
    suggestions: [
      'Open Xcode and ensure you are signed in to a development team',
      'For personal development, a free Apple ID works fine',
      'Go to Xcode > Preferences > Accounts > add your Apple ID',
      'The inspector will use "Sign to Run Locally" which works with any Apple ID',
    ],
    recoverable: false,
    autoRunAction: 'fail',
    originalError,
  };
}

/**
 * Create error for missing XCUITest dependencies
 */
export function createDependencyMissingError(originalError?: string): InspectError {
  return {
    code: 'XCUITEST_DEPENDENCY_MISSING',
    message: 'Missing XCUITest framework dependencies',
    details: 'Required test frameworks or modules could not be found.',
    suggestions: [
      'Ensure Xcode is fully installed (not just command line tools)',
      'Open Xcode at least once to complete component installation',
      'If using a non-standard Xcode, select it: sudo xcode-select -s /path/to/Xcode.app',
      'Verify iOS Simulator platforms are installed in Xcode preferences',
    ],
    recoverable: false,
    autoRunAction: 'fail',
    originalError,
  };
}

/**
 * Create error for inspection timeout
 */
export function createTimeoutError(originalError?: string): InspectError {
  return {
    code: 'INSPECTION_TIMEOUT',
    message: 'UI inspection timed out',
    details:
      'The inspection did not complete within the allowed time. This may happen if the app is busy, has a complex UI, or is not responding.',
    suggestions: [
      'Increase timeout: /ios.inspect --app <bundleId> --timeout 60000',
      'Ensure the app is responsive and not stuck on a loading screen',
      'Try reducing inspection depth: /ios.inspect --app <bundleId> --depth 10',
      'Check if the simulator is running slowly (quit other apps)',
    ],
    recoverable: true,
    autoRunAction: 'retry',
    retryDelayMs: 5000,
    originalError,
  };
}

/**
 * Create error for empty UI tree
 */
export function createEmptyUITreeError(originalError?: string): InspectError {
  return {
    code: 'EMPTY_UI_TREE',
    message: 'UI hierarchy is empty',
    details:
      'No accessible UI elements were found. The app may not have rendered its UI yet, or accessibility may be disabled.',
    suggestions: [
      'Wait for app to fully load before inspecting',
      'Ensure the app is not showing a splash screen',
      'Check that the app has accessibility enabled',
      'Try including hidden elements: /ios.inspect --app <bundleId> --include-hidden',
    ],
    recoverable: true,
    autoRunAction: 'wait',
    retryDelayMs: 2000,
    originalError,
  };
}

/**
 * Create error for detected loading state
 */
export function createLoadingStateError(originalError?: string): InspectError {
  return {
    code: 'LOADING_STATE_DETECTED',
    message: 'App appears to be in a loading state',
    details:
      'The UI contains loading indicators but few other elements. Wait for the app to finish loading before inspecting.',
    suggestions: [
      'Wait 2-3 seconds and retry the inspection',
      'Add a delay before inspection in your playbook',
      'Check if the app is waiting for network requests',
      'Verify app is not stuck on a loading screen',
    ],
    recoverable: true,
    autoRunAction: 'wait',
    retryDelayMs: 3000,
    originalError,
  };
}

/**
 * Create generic inspection error
 */
export function createGenericInspectError(
  originalError?: string,
  exitCode?: number
): InspectError {
  return {
    code: 'COMMAND_FAILED',
    message: 'UI inspection failed',
    details: exitCode !== undefined
      ? `The inspection command failed with exit code ${exitCode}`
      : 'An unexpected error occurred during UI inspection',
    suggestions: [
      'Ensure a simulator is booted: xcrun simctl list devices booted',
      'Verify Xcode is properly installed: xcode-select -p',
      'Try restarting the simulator',
      'Check system logs for more details',
    ],
    recoverable: false,
    autoRunAction: 'fail',
    originalError,
  };
}

// =============================================================================
// Error Formatting
// =============================================================================

/**
 * Format an InspectError for display in the AI terminal
 */
export function formatInspectError(error: InspectError): string {
  const lines: string[] = [
    `## iOS Inspect Error`,
    '',
    `**Error Code**: \`${error.code}\``,
    `**Message**: ${error.message}`,
    '',
  ];

  if (error.details) {
    lines.push(`### Details`, '', error.details, '');
  }

  if (error.suggestions.length > 0) {
    lines.push(`### Suggestions`, '');
    error.suggestions.forEach((suggestion) => {
      lines.push(`- ${suggestion}`);
    });
    lines.push('');
  }

  if (error.recoverable) {
    lines.push(`> **Note**: This error may be temporary. ${
      error.autoRunAction === 'retry'
        ? 'Retrying the inspection may succeed.'
        : error.autoRunAction === 'wait'
          ? 'Wait for the app to stabilize and try again.'
          : ''
    }`);
  }

  return lines.join('\n');
}

/**
 * Format an InspectError as a compact one-liner for logs
 */
export function formatInspectErrorCompact(error: InspectError): string {
  return `[${error.code}] ${error.message}${error.recoverable ? ' (recoverable)' : ''}`;
}

// =============================================================================
// Result Helpers
// =============================================================================

/**
 * Wrap an InspectError in an IOSResult
 */
export function wrapInspectError<T>(error: InspectError): IOSResult<T> {
  return {
    success: false,
    error: error.message,
    errorCode: error.code,
  };
}

/**
 * Check if an error is of a specific type
 */
export function isInspectErrorType(error: unknown, code: InspectErrorCode): boolean {
  if (typeof error === 'object' && error !== null) {
    return (error as { code?: string }).code === code;
  }
  return false;
}

/**
 * Check if an error is recoverable
 */
export function isRecoverableError(error: InspectError): boolean {
  return error.recoverable;
}

/**
 * Get retry delay for an error (0 if not retryable)
 */
export function getRetryDelay(error: InspectError): number {
  return error.retryDelayMs || 0;
}

// =============================================================================
// Error Handling Utilities
// =============================================================================

/**
 * Analyze raw output to detect potential issues before they become errors
 */
export function analyzeInspectionOutput(
  stdout: string,
  stderr: string
): { warnings: string[]; probableErrors: InspectError[] } {
  const warnings: string[] = [];
  const probableErrors: InspectError[] = [];
  const combined = `${stdout}\n${stderr}`;

  // Check for potential issues in stdout/stderr
  if (matchesPatterns(combined, LOADING_STATE_PATTERNS)) {
    warnings.push('App appears to be in a loading state');
  }

  if (combined.includes('totalElements":0') || combined.includes('totalElements: 0')) {
    probableErrors.push(createEmptyUITreeError());
  }

  if (matchesPatterns(combined, APP_CRASHED_PATTERNS)) {
    probableErrors.push(createAppCrashedError());
  }

  return { warnings, probableErrors };
}
