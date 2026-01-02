/**
 * iOS Tools - Interaction Error Handling
 *
 * Centralized error handling for iOS interaction operations (tap, type, scroll, swipe).
 * Provides user-friendly error messages with suggestions and troubleshooting hints.
 * Integrates with action-validator for element suggestions on "not found" errors.
 */

import { IOSResult } from './types';
import { ElementNode } from './inspect';
import {
  ActionTarget,
  ActionStatus,
  ActionResult,
} from './native-driver';
import {
  ValidationResult,
  SuggestedTarget,
  HittabilityResult,
  NotHittableReason,
  suggestAlternatives,
} from './action-validator';
import { logger } from '../utils/logger';

const LOG_CONTEXT = '[iOS-InteractionErrors]';

// =============================================================================
// Error Codes
// =============================================================================

/**
 * Interaction-specific error codes
 */
export type InteractionErrorCode =
  | 'ELEMENT_NOT_FOUND'
  | 'ELEMENT_NOT_HITTABLE'
  | 'ELEMENT_NOT_VISIBLE'
  | 'ELEMENT_NOT_ENABLED'
  | 'ELEMENT_OBSCURED'
  | 'ELEMENT_OFF_SCREEN'
  | 'ELEMENT_ZERO_SIZE'
  | 'MAESTRO_NOT_INSTALLED'
  | 'FLOW_TIMEOUT'
  | 'FLOW_VALIDATION_FAILED'
  | 'APP_CRASHED'
  | 'APP_NOT_RUNNING'
  | 'SCREENSHOT_FAILED'
  | 'SIMULATOR_NOT_BOOTED'
  | 'INTERACTION_TIMEOUT'
  | 'UNKNOWN_ERROR';

/**
 * Map NotHittableReason to InteractionErrorCode
 */
export function mapNotHittableReasonToCode(reason: NotHittableReason): InteractionErrorCode {
  switch (reason) {
    case 'not_found':
      return 'ELEMENT_NOT_FOUND';
    case 'not_visible':
      return 'ELEMENT_NOT_VISIBLE';
    case 'not_enabled':
      return 'ELEMENT_NOT_ENABLED';
    case 'zero_size':
      return 'ELEMENT_ZERO_SIZE';
    case 'obscured':
      return 'ELEMENT_OBSCURED';
    case 'off_screen':
      return 'ELEMENT_OFF_SCREEN';
    case 'not_hittable':
      return 'ELEMENT_NOT_HITTABLE';
    default:
      return 'UNKNOWN_ERROR';
  }
}

/**
 * Map ActionStatus to InteractionErrorCode
 */
export function mapActionStatusToCode(status: ActionStatus): InteractionErrorCode {
  switch (status) {
    case 'notFound':
      return 'ELEMENT_NOT_FOUND';
    case 'notHittable':
      return 'ELEMENT_NOT_HITTABLE';
    case 'notEnabled':
      return 'ELEMENT_NOT_ENABLED';
    case 'timeout':
      return 'INTERACTION_TIMEOUT';
    case 'failed':
    case 'error':
    default:
      return 'UNKNOWN_ERROR';
  }
}

// =============================================================================
// Error Messages
// =============================================================================

/**
 * User-friendly error messages with troubleshooting hints
 */
export const INTERACTION_ERROR_MESSAGES: Record<
  InteractionErrorCode,
  { title: string; hint: string }
> = {
  ELEMENT_NOT_FOUND: {
    title: 'Element not found',
    hint: 'Use `/ios.inspect` to view the current UI hierarchy and find the correct element identifier or label.',
  },
  ELEMENT_NOT_HITTABLE: {
    title: 'Element not hittable',
    hint: 'The element may be obscured by another view. Try dismissing overlays or scrolling the element fully into view.',
  },
  ELEMENT_NOT_VISIBLE: {
    title: 'Element not visible',
    hint: 'The element exists but is not visible on screen. Try scrolling it into view with `/ios.scroll --to <target>`.',
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
    hint: 'Install Maestro with: `brew tap mobile-dev-inc/tap && brew install maestro` or `curl -Ls "https://get.maestro.mobile.dev" | bash`',
  },
  FLOW_TIMEOUT: {
    title: 'Flow execution timed out',
    hint: 'The flow took too long to complete. Increase the timeout with `--timeout` or break the flow into smaller steps.',
  },
  FLOW_VALIDATION_FAILED: {
    title: 'Flow validation failed',
    hint: 'Check the YAML syntax and ensure all action types are valid. Use `maestro validate <flow.yaml>` for detailed errors.',
  },
  APP_CRASHED: {
    title: 'App crashed during interaction',
    hint: 'The app crashed during the operation. Check crash logs with `/ios.logs --crash` and restart the app.',
  },
  APP_NOT_RUNNING: {
    title: 'App is not running',
    hint: 'Launch the app first with `/ios.run_flow --inline "launchApp: com.example.app"` or via Simulator.',
  },
  SCREENSHOT_FAILED: {
    title: 'Failed to capture screenshot',
    hint: 'Ensure the simulator is running and responsive. Try restarting the Simulator if frozen.',
  },
  SIMULATOR_NOT_BOOTED: {
    title: 'No simulator is booted',
    hint: 'Boot a simulator with: `xcrun simctl boot "iPhone 15 Pro"` or open Simulator.app.',
  },
  INTERACTION_TIMEOUT: {
    title: 'Interaction timed out',
    hint: 'The element did not respond in time. Increase timeout with `--timeout <ms>` or check if the app is frozen.',
  },
  UNKNOWN_ERROR: {
    title: 'Unknown error',
    hint: 'An unexpected error occurred. Check the error details and try again.',
  },
};

// =============================================================================
// Error Result Types
// =============================================================================

/**
 * Enhanced error result with suggestions and troubleshooting
 */
export interface InteractionError {
  /** Error code for programmatic handling */
  code: InteractionErrorCode;
  /** Human-readable error title */
  title: string;
  /** Detailed error message */
  message: string;
  /** Troubleshooting hint */
  hint: string;
  /** Suggested alternative elements (for element not found) */
  suggestions?: SuggestedTarget[];
  /** Suggested action to resolve the issue */
  suggestedAction?: string;
  /** Element position if relevant */
  position?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** Screenshot path if captured */
  screenshotPath?: string;
  /** Original target that failed */
  target?: ActionTarget;
}

// =============================================================================
// Error Creation Functions
// =============================================================================

/**
 * Create an "element not found" error with suggestions.
 *
 * @param target - The target that was not found
 * @param uiTree - Optional UI tree to generate suggestions from
 * @param options - Additional options
 * @returns InteractionError with suggestions
 */
export function createElementNotFoundError(
  target: ActionTarget,
  uiTree?: ElementNode,
  options?: { maxSuggestions?: number; screenshotPath?: string }
): InteractionError {
  const { maxSuggestions = 5, screenshotPath } = options || {};

  let suggestions: SuggestedTarget[] | undefined;
  if (uiTree) {
    suggestions = suggestAlternatives(target, uiTree, { maxSuggestions, minSimilarity: 30 });
    logger.debug(
      `${LOG_CONTEXT} Generated ${suggestions.length} suggestions for "${formatTarget(target)}"`,
      LOG_CONTEXT
    );
  }

  return {
    code: 'ELEMENT_NOT_FOUND',
    title: INTERACTION_ERROR_MESSAGES.ELEMENT_NOT_FOUND.title,
    message: `Element not found: ${formatTarget(target)}`,
    hint: INTERACTION_ERROR_MESSAGES.ELEMENT_NOT_FOUND.hint,
    suggestions,
    target,
    screenshotPath,
    suggestedAction: suggestions && suggestions.length > 0
      ? `Try one of these similar elements: ${suggestions.slice(0, 3).map((s) => formatTarget(s.target)).join(', ')}`
      : 'Use /ios.inspect to view available elements',
  };
}

/**
 * Create an "element not hittable" error with reason.
 *
 * @param target - The target that is not hittable
 * @param hittabilityResult - Result from checkHittable
 * @param options - Additional options
 * @returns InteractionError with reason and suggested action
 */
export function createElementNotHittableError(
  target: ActionTarget,
  hittabilityResult: HittabilityResult,
  options?: { screenshotPath?: string }
): InteractionError {
  const code = mapNotHittableReasonToCode(hittabilityResult.reason || 'not_hittable');
  const template = INTERACTION_ERROR_MESSAGES[code];

  return {
    code,
    title: template.title,
    message: hittabilityResult.message,
    hint: template.hint,
    target,
    position: hittabilityResult.position,
    suggestedAction: hittabilityResult.suggestedAction,
    screenshotPath: options?.screenshotPath,
  };
}

/**
 * Create a "Maestro not installed" error with install instructions.
 *
 * @param installInstructions - Optional custom install instructions
 * @returns InteractionError with install steps
 */
export function createMaestroNotInstalledError(installInstructions?: string): InteractionError {
  const template = INTERACTION_ERROR_MESSAGES.MAESTRO_NOT_INSTALLED;

  return {
    code: 'MAESTRO_NOT_INSTALLED',
    title: template.title,
    message: 'Maestro Mobile CLI is not installed or not in PATH.',
    hint: installInstructions || template.hint,
    suggestedAction: 'Run the installation command above and restart your terminal.',
  };
}

/**
 * Create a "flow timeout" error.
 *
 * @param flowPath - Path to the flow that timed out
 * @param timeout - Timeout value in ms
 * @param screenshotPath - Optional screenshot of the state when timeout occurred
 * @returns InteractionError with timeout details
 */
export function createFlowTimeoutError(
  flowPath: string,
  timeout: number,
  screenshotPath?: string
): InteractionError {
  const template = INTERACTION_ERROR_MESSAGES.FLOW_TIMEOUT;

  return {
    code: 'FLOW_TIMEOUT',
    title: template.title,
    message: `Flow "${flowPath}" timed out after ${timeout}ms`,
    hint: template.hint,
    screenshotPath,
    suggestedAction: `Increase timeout to ${timeout * 2}ms or split the flow into smaller steps.`,
  };
}

/**
 * Create an "app crashed" error.
 *
 * @param bundleId - Bundle ID of the crashed app
 * @param crashInfo - Optional crash details
 * @param screenshotPath - Optional screenshot before crash
 * @returns InteractionError with crash details
 */
export function createAppCrashedError(
  bundleId: string,
  crashInfo?: { type?: string; message?: string },
  screenshotPath?: string
): InteractionError {
  const template = INTERACTION_ERROR_MESSAGES.APP_CRASHED;

  let message = `App "${bundleId}" crashed during interaction`;
  if (crashInfo?.type) {
    message += `: ${crashInfo.type}`;
  }
  if (crashInfo?.message) {
    message += ` - ${crashInfo.message}`;
  }

  return {
    code: 'APP_CRASHED',
    title: template.title,
    message,
    hint: template.hint,
    screenshotPath,
    suggestedAction: 'Restart the app and check crash logs for the root cause.',
  };
}

/**
 * Create error from ActionResult.
 *
 * @param result - The failed ActionResult
 * @param target - The target that was acted upon
 * @param uiTree - Optional UI tree for suggestions
 * @returns InteractionError based on the result status
 */
export function createErrorFromActionResult(
  result: ActionResult,
  target?: ActionTarget,
  uiTree?: ElementNode
): InteractionError {
  const code = mapActionStatusToCode(result.status);
  const template = INTERACTION_ERROR_MESSAGES[code];

  // For element not found, include suggestions
  if (code === 'ELEMENT_NOT_FOUND' && target && uiTree) {
    return createElementNotFoundError(target, uiTree, {
      screenshotPath: result.details?.screenshotPath,
    });
  }

  return {
    code,
    title: template.title,
    message: result.error || template.title,
    hint: template.hint,
    target,
    screenshotPath: result.details?.screenshotPath,
    suggestedAction:
      result.details?.suggestions && result.details.suggestions.length > 0
        ? `Try: ${result.details.suggestions.slice(0, 3).join(', ')}`
        : undefined,
  };
}

/**
 * Create error from ValidationResult.
 *
 * @param result - The failed ValidationResult
 * @param target - The target that failed validation
 * @returns InteractionError based on the validation result
 */
export function createErrorFromValidationResult(
  result: ValidationResult,
  target: ActionTarget
): InteractionError {
  if (result.valid) {
    throw new Error('Cannot create error from valid result');
  }

  const code = mapNotHittableReasonToCode(result.reason || 'not_found');
  const template = INTERACTION_ERROR_MESSAGES[code];

  return {
    code,
    title: template.title,
    message: result.message || template.title,
    hint: template.hint,
    target,
    suggestions: result.suggestions,
    suggestedAction:
      result.suggestions && result.suggestions.length > 0
        ? `Try one of these: ${result.suggestions.slice(0, 3).map((s) => formatTarget(s.target)).join(', ')}`
        : undefined,
  };
}

// =============================================================================
// Error Formatting
// =============================================================================

/**
 * Format an InteractionError for display in the agent terminal.
 *
 * @param error - The InteractionError to format
 * @param options - Formatting options
 * @returns Markdown-formatted error message
 */
export function formatInteractionError(
  error: InteractionError,
  options?: { includeRaw?: boolean; includeScreenshot?: boolean }
): string {
  const { includeScreenshot = true } = options || {};

  let output = `## ✗ ${error.title}\n\n`;

  // Target info
  if (error.target) {
    output += `**Target**: \`${formatTarget(error.target)}\`\n`;
  }

  // Error message
  output += `**Error**: ${error.message}\n\n`;

  // Position info for off-screen/obscured elements
  if (error.position) {
    output += `**Position**: (${error.position.x}, ${error.position.y}) ${error.position.width}×${error.position.height}\n\n`;
  }

  // Suggestions for element not found
  if (error.suggestions && error.suggestions.length > 0) {
    output += `### Similar Elements Found\n\n`;
    output += `| Target | Similarity | Reason |\n`;
    output += `|--------|------------|--------|\n`;
    for (const suggestion of error.suggestions.slice(0, 5)) {
      output += `| \`${formatTarget(suggestion.target)}\` | ${suggestion.similarity}% | ${suggestion.reason} |\n`;
    }
    output += '\n';
  }

  // Troubleshooting hint
  output += `### Troubleshooting\n\n`;
  output += `**Hint**: ${error.hint}\n\n`;

  // Suggested action
  if (error.suggestedAction) {
    output += `**Suggested Action**: ${error.suggestedAction}\n\n`;
  }

  // Screenshot reference
  if (includeScreenshot && error.screenshotPath) {
    output += `### Screenshot\n\n`;
    output += `\`${error.screenshotPath}\`\n`;
  }

  return output;
}

/**
 * Format an InteractionError as JSON for programmatic use.
 *
 * @param error - The InteractionError to format
 * @returns JSON representation
 */
export function formatInteractionErrorAsJson(error: InteractionError): string {
  return JSON.stringify(
    {
      code: error.code,
      title: error.title,
      message: error.message,
      hint: error.hint,
      target: error.target,
      suggestions: error.suggestions?.map((s) => ({
        target: formatTarget(s.target),
        similarity: s.similarity,
        reason: s.reason,
      })),
      suggestedAction: error.suggestedAction,
      position: error.position,
      screenshotPath: error.screenshotPath,
    },
    null,
    2
  );
}

/**
 * Format an InteractionError as a compact single-line message.
 *
 * @param error - The InteractionError to format
 * @returns Single-line error summary
 */
export function formatInteractionErrorCompact(error: InteractionError): string {
  let message = `${error.title}: ${error.message}`;

  if (error.suggestions && error.suggestions.length > 0) {
    const topSuggestion = error.suggestions[0];
    message += ` (Did you mean: ${formatTarget(topSuggestion.target)}?)`;
  }

  return message;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Format an ActionTarget for display.
 */
export function formatTarget(target: ActionTarget): string {
  switch (target.type) {
    case 'identifier':
      return `#${target.value}`;
    case 'label':
      return `"${target.value}"`;
    case 'text':
      return `text:"${target.value}"`;
    case 'predicate':
      return `predicate(${target.value})`;
    case 'coordinates':
      return `(${target.value})`;
    case 'type':
      return target.index !== undefined ? `${target.value}[${target.index}]` : target.value;
    default:
      return target.value;
  }
}

/**
 * Create an IOSResult failure from an InteractionError.
 *
 * @param error - The InteractionError
 * @returns IOSResult in failure state with formatted error
 */
export function createIOSResultFromError<T>(error: InteractionError): IOSResult<T> {
  return {
    success: false,
    error: formatInteractionErrorCompact(error),
    errorCode: error.code,
  };
}

/**
 * Check if an error suggests element not found with alternatives.
 *
 * @param error - The error to check
 * @returns True if this is an element not found error with suggestions
 */
export function hasElementSuggestions(error: InteractionError): boolean {
  return (
    error.code === 'ELEMENT_NOT_FOUND' &&
    error.suggestions !== undefined &&
    error.suggestions.length > 0
  );
}

/**
 * Get the best suggestion from an error (highest similarity).
 *
 * @param error - The error with suggestions
 * @returns The best suggestion or undefined
 */
export function getBestSuggestion(error: InteractionError): SuggestedTarget | undefined {
  if (!error.suggestions || error.suggestions.length === 0) {
    return undefined;
  }
  // Suggestions are already sorted by similarity (highest first)
  return error.suggestions[0];
}
