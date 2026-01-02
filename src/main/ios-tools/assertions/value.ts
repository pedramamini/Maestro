/**
 * iOS Assertion - Assert Value
 *
 * Verifies that an element's value property matches expected content.
 * Useful for verifying form input state (text fields, secure text fields, etc.).
 * Supports multiple match modes: exact, contains, regex, startsWith, endsWith.
 */

import path from 'path';
import { IOSResult } from '../types';
import { getBootedSimulators, getSimulator } from '../simulator';
import { screenshot } from '../capture';
import { inspect, UIElement } from '../inspect-simple';
import { findByIdentifier, findByLabel, findByText, findElement, ElementQuery } from '../ui-analyzer';
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

const LOG_CONTEXT = '[iOS-Assert-Value]';

// =============================================================================
// Types
// =============================================================================

/**
 * Match mode for value comparison
 */
export type ValueMatchMode = 'exact' | 'contains' | 'regex' | 'startsWith' | 'endsWith' | 'empty' | 'notEmpty';

/**
 * Ways to identify the target element for value check
 */
export interface ValueElementTarget {
  /** Accessibility identifier (preferred) */
  identifier?: string;
  /** Accessibility label text */
  label?: string;
  /** Text content (for finding element by text) */
  text?: string;
  /** Element type (e.g., "TextField", "SecureTextField") */
  type?: string;
  /** Custom query for complex matching */
  query?: ElementQuery;
}

/**
 * Options for assertValue
 */
export interface AssertValueOptions extends AssertionBaseOptions {
  /** Target element to check */
  target: ValueElementTarget;
  /** Expected value (not required for 'empty' and 'notEmpty' modes) */
  expected?: string;
  /** Match mode (default: 'exact') */
  matchMode?: ValueMatchMode;
  /** Case-sensitive matching (default: true) */
  caseSensitive?: boolean;
  /** App bundle ID (optional, for context in logs) */
  bundleId?: string;
}

/**
 * Data specific to value assertion results
 */
export interface ValueAssertionData {
  /** The element that was found (if any) */
  element?: UIElement;
  /** How the element was identified */
  matchedBy?: 'identifier' | 'label' | 'text' | 'type' | 'query';
  /** Match mode used */
  matchMode: ValueMatchMode;
  /** Expected value */
  expected?: string;
  /** Actual value found */
  actualValue?: string;
  /** Whether case-sensitive match was used */
  caseSensitive: boolean;
  /** Total elements scanned */
  totalElementsScanned?: number;
  /** Element type */
  elementType?: string;
}

// =============================================================================
// Main Function
// =============================================================================

/**
 * Assert that an element's value matches expected content.
 * This is primarily useful for form inputs like text fields.
 *
 * @param options - Assertion options
 * @returns Verification result indicating pass/fail
 */
export async function assertValue(
  options: AssertValueOptions
): Promise<IOSResult<VerificationResult<ValueAssertionData>>> {
  const {
    udid: providedUdid,
    sessionId,
    assertionId: providedId,
    target,
    expected,
    matchMode = 'exact',
    caseSensitive = true,
    polling,
    captureOnFailure = true,
    captureOnSuccess = false,
  } = options;

  // Validate that expected is provided for modes that require it
  if (matchMode !== 'empty' && matchMode !== 'notEmpty' && expected === undefined) {
    return {
      success: false,
      error: `Expected value is required for match mode "${matchMode}"`,
      errorCode: 'INVALID_ARGUMENT',
    };
  }

  const assertionId = providedId || generateVerificationId('value');
  const pollingOpts = mergePollingOptions(polling);
  const startTime = new Date();
  const targetDescription = describeTarget(target);

  const modeDescription = matchMode === 'empty' || matchMode === 'notEmpty'
    ? matchMode
    : `"${expected}" (${matchMode})`;

  logger.info(`${LOG_CONTEXT} Asserting value: ${modeDescription} on ${targetDescription} (session: ${sessionId})`);

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

  // Polling check function
  const checkValue = async (): Promise<{
    passed: boolean;
    error?: string;
    data?: ValueAssertionData;
  }> => {
    // Capture current UI state
    const inspectResult = await inspect({
      udid,
      sessionId,
      captureScreenshot: false,
      snapshotId: `${assertionId}-inspect-${Date.now()}`,
    });

    if (!inspectResult.success || !inspectResult.data) {
      return {
        passed: false,
        error: inspectResult.error || 'Failed to inspect UI',
      };
    }

    const tree = inspectResult.data.tree;
    const totalElements = inspectResult.data.stats.totalElements;

    // Try to find the element
    const findResult = findTargetElement(tree, target);

    if (!findResult.element) {
      return {
        passed: false,
        error: `Element not found: ${targetDescription}`,
        data: {
          matchMode,
          expected,
          caseSensitive,
          totalElementsScanned: totalElements,
        },
      };
    }

    const element = findResult.element;

    // Check value content
    const matchResult = checkValueMatch(
      element,
      expected,
      matchMode,
      caseSensitive
    );

    if (!matchResult.passed) {
      return {
        passed: false,
        error: matchResult.error,
        data: {
          element,
          matchedBy: findResult.matchedBy,
          matchMode,
          expected,
          actualValue: element.value,
          caseSensitive,
          totalElementsScanned: totalElements,
          elementType: element.type,
        },
      };
    }

    // Success!
    return {
      passed: true,
      data: {
        element,
        matchedBy: findResult.matchedBy,
        matchMode,
        expected,
        actualValue: element.value,
        caseSensitive,
        totalElementsScanned: totalElements,
        elementType: element.type,
      },
    };
  };

  // Poll for the condition
  pollingOpts.description = `value ${modeDescription} on ${targetDescription}`;
  const pollResult = await pollUntil<ValueAssertionData>(checkValue, pollingOpts);

  if (!pollResult.success) {
    return {
      success: false,
      error: pollResult.error || 'Polling failed',
      errorCode: pollResult.errorCode || 'COMMAND_FAILED',
    };
  }

  const { passed, attempts, lastData } = pollResult.data!;

  // Prepare artifacts
  const artifacts: { screenshots?: string[] } = {};

  // Capture screenshot based on result and options
  if ((passed && captureOnSuccess) || (!passed && captureOnFailure)) {
    const screenshotPath = path.join(artifactDir, passed ? 'success.png' : 'failure.png');
    const screenshotResult = await screenshot({ udid, outputPath: screenshotPath });

    if (screenshotResult.success) {
      artifacts.screenshots = [screenshotPath];
    }
  }

  // Build result
  const resultParams = {
    id: assertionId,
    type: 'value',
    target: targetDescription,
    startTime,
    attempts,
    simulator: simulatorInfo,
    artifacts,
    data: lastData,
  };

  if (passed) {
    logger.info(`${LOG_CONTEXT} Assertion passed: ${targetDescription} value is ${modeDescription}`);
    return {
      success: true,
      data: createPassedResult({
        ...resultParams,
        message: `Element "${targetDescription}" value matches ${modeDescription}`,
      }),
    };
  }

  // Check if it was a timeout or actual failure
  const lastAttempt = attempts[attempts.length - 1];
  const wasTimeout = pollResult.data!.duration >= pollingOpts.timeout;

  if (wasTimeout) {
    logger.warn(`${LOG_CONTEXT} Assertion timeout: ${targetDescription} value ${modeDescription} not matched after ${pollingOpts.timeout}ms`);
    return {
      success: true,
      data: createTimeoutResult({
        ...resultParams,
        timeout: pollingOpts.timeout,
      }),
    };
  }

  logger.warn(`${LOG_CONTEXT} Assertion failed: ${targetDescription} - ${lastAttempt?.error || 'value mismatch'}`);
  return {
    success: true,
    data: createFailedResult({
      ...resultParams,
      message: lastAttempt?.error || `Element "${targetDescription}" value does not match ${modeDescription}`,
    }),
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if element value matches expected using the specified mode.
 */
function checkValueMatch(
  element: UIElement,
  expected: string | undefined,
  matchMode: ValueMatchMode,
  caseSensitive: boolean
): { passed: boolean; error?: string } {
  const normalize = (s: string | undefined): string => {
    if (!s) return '';
    return caseSensitive ? s : s.toLowerCase();
  };

  const normalizedExpected = expected ? normalize(expected) : '';
  const normalizedValue = normalize(element.value);
  const actualValue = element.value || '';

  // Handle special modes first
  if (matchMode === 'empty') {
    if (!actualValue || actualValue.trim() === '') {
      return { passed: true };
    }
    return {
      passed: false,
      error: `Value is not empty. Found: "${actualValue}"`,
    };
  }

  if (matchMode === 'notEmpty') {
    if (actualValue && actualValue.trim() !== '') {
      return { passed: true };
    }
    return {
      passed: false,
      error: 'Value is empty',
    };
  }

  // Standard match modes
  const matchText = (): boolean => {
    if (!normalizedValue && normalizedExpected) return false;

    switch (matchMode) {
      case 'exact':
        return normalizedValue === normalizedExpected;

      case 'contains':
        return normalizedValue.includes(normalizedExpected);

      case 'startsWith':
        return normalizedValue.startsWith(normalizedExpected);

      case 'endsWith':
        return normalizedValue.endsWith(normalizedExpected);

      case 'regex': {
        try {
          const flags = caseSensitive ? '' : 'i';
          const regex = new RegExp(expected || '', flags);
          return regex.test(actualValue);
        } catch {
          return false;
        }
      }

      default:
        return normalizedValue === normalizedExpected;
    }
  };

  if (matchText()) {
    return { passed: true };
  }

  // Build error message
  const actualDescription = actualValue
    ? `value="${actualValue}"`
    : 'no value';

  const modeDescription = matchMode === 'regex'
    ? `match pattern "${expected}"`
    : matchMode === 'exact'
    ? `equal "${expected}"`
    : `${matchMode} "${expected}"`;

  return {
    passed: false,
    error: `Value does not ${modeDescription}. Found: ${actualDescription}`,
  };
}

/**
 * Find an element matching the target specification.
 */
function findTargetElement(
  tree: UIElement,
  target: ValueElementTarget
): { element: UIElement | undefined; matchedBy?: 'identifier' | 'label' | 'text' | 'type' | 'query' } {
  // Priority order: identifier > label > text > type > query

  if (target.identifier) {
    const element = findByIdentifier(tree, target.identifier);
    if (element) {
      return { element, matchedBy: 'identifier' };
    }
  }

  if (target.label) {
    const element = findByLabel(tree, target.label);
    if (element) {
      return { element, matchedBy: 'label' };
    }
  }

  if (target.text) {
    const result = findByText(tree, target.text);
    if (result.elements.length > 0) {
      return { element: result.elements[0], matchedBy: 'text' };
    }
  }

  if (target.type) {
    const element = findElement(tree, { type: target.type });
    if (element) {
      return { element, matchedBy: 'type' };
    }
  }

  if (target.query) {
    const element = findElement(tree, target.query);
    if (element) {
      return { element, matchedBy: 'query' };
    }
  }

  return { element: undefined };
}

/**
 * Create a human-readable description of the target.
 */
function describeTarget(target: ValueElementTarget): string {
  const parts: string[] = [];

  if (target.identifier) {
    parts.push(`identifier="${target.identifier}"`);
  }
  if (target.label) {
    parts.push(`label="${target.label}"`);
  }
  if (target.text) {
    parts.push(`text="${target.text}"`);
  }
  if (target.type) {
    parts.push(`type=${target.type}`);
  }
  if (target.query) {
    parts.push('custom query');
  }

  return parts.join(', ') || 'unknown element';
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Assert element with identifier has expected value.
 */
export async function assertValueById(
  identifier: string,
  expected: string,
  options: Omit<AssertValueOptions, 'target' | 'expected'>
): Promise<IOSResult<VerificationResult<ValueAssertionData>>> {
  return assertValue({
    ...options,
    target: { identifier },
    expected,
  });
}

/**
 * Assert element with label has expected value.
 */
export async function assertValueByLabel(
  label: string,
  expected: string,
  options: Omit<AssertValueOptions, 'target' | 'expected'>
): Promise<IOSResult<VerificationResult<ValueAssertionData>>> {
  return assertValue({
    ...options,
    target: { label },
    expected,
  });
}

/**
 * Assert element value contains substring (convenience for contains match mode).
 */
export async function assertValueContains(
  target: ValueElementTarget,
  expected: string,
  options: Omit<AssertValueOptions, 'target' | 'expected' | 'matchMode'>
): Promise<IOSResult<VerificationResult<ValueAssertionData>>> {
  return assertValue({
    ...options,
    target,
    expected,
    matchMode: 'contains',
  });
}

/**
 * Assert element value matches regex pattern.
 */
export async function assertValueMatches(
  target: ValueElementTarget,
  pattern: string,
  options: Omit<AssertValueOptions, 'target' | 'expected' | 'matchMode'>
): Promise<IOSResult<VerificationResult<ValueAssertionData>>> {
  return assertValue({
    ...options,
    target,
    expected: pattern,
    matchMode: 'regex',
  });
}

/**
 * Assert element value starts with expected string.
 */
export async function assertValueStartsWith(
  target: ValueElementTarget,
  expected: string,
  options: Omit<AssertValueOptions, 'target' | 'expected' | 'matchMode'>
): Promise<IOSResult<VerificationResult<ValueAssertionData>>> {
  return assertValue({
    ...options,
    target,
    expected,
    matchMode: 'startsWith',
  });
}

/**
 * Assert element value ends with expected string.
 */
export async function assertValueEndsWith(
  target: ValueElementTarget,
  expected: string,
  options: Omit<AssertValueOptions, 'target' | 'expected' | 'matchMode'>
): Promise<IOSResult<VerificationResult<ValueAssertionData>>> {
  return assertValue({
    ...options,
    target,
    expected,
    matchMode: 'endsWith',
  });
}

/**
 * Assert element value is empty.
 */
export async function assertValueEmpty(
  target: ValueElementTarget,
  options: Omit<AssertValueOptions, 'target' | 'expected' | 'matchMode'>
): Promise<IOSResult<VerificationResult<ValueAssertionData>>> {
  return assertValue({
    ...options,
    target,
    matchMode: 'empty',
  });
}

/**
 * Assert element value is not empty.
 */
export async function assertValueNotEmpty(
  target: ValueElementTarget,
  options: Omit<AssertValueOptions, 'target' | 'expected' | 'matchMode'>
): Promise<IOSResult<VerificationResult<ValueAssertionData>>> {
  return assertValue({
    ...options,
    target,
    matchMode: 'notEmpty',
  });
}
