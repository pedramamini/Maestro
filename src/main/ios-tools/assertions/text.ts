/**
 * iOS Assertion - Assert Text
 *
 * Verifies that an element contains expected text content.
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

const LOG_CONTEXT = '[iOS-Assert-Text]';

// =============================================================================
// Types
// =============================================================================

/**
 * Match mode for text comparison
 */
export type TextMatchMode = 'exact' | 'contains' | 'regex' | 'startsWith' | 'endsWith';

/**
 * Ways to identify the target element for text check
 */
export interface TextElementTarget {
  /** Accessibility identifier (preferred) */
  identifier?: string;
  /** Accessibility label text */
  label?: string;
  /** Text content (for finding element by text) */
  text?: string;
  /** Element type (e.g., "Button", "TextField") */
  type?: string;
  /** Custom query for complex matching */
  query?: ElementQuery;
}

/**
 * Options for assertText
 */
export interface AssertTextOptions extends AssertionBaseOptions {
  /** Target element to check */
  target: TextElementTarget;
  /** Expected text value */
  expected: string;
  /** Match mode (default: 'exact') */
  matchMode?: TextMatchMode;
  /** Case-sensitive matching (default: true) */
  caseSensitive?: boolean;
  /** Property to check: 'label', 'value', or 'any' (default: 'any') */
  textProperty?: 'label' | 'value' | 'any';
  /** App bundle ID (optional, for context in logs) */
  bundleId?: string;
}

/**
 * Data specific to text assertion results
 */
export interface TextAssertionData {
  /** The element that was found (if any) */
  element?: UIElement;
  /** How the element was identified */
  matchedBy?: 'identifier' | 'label' | 'text' | 'type' | 'query';
  /** Match mode used */
  matchMode: TextMatchMode;
  /** Expected text */
  expected: string;
  /** Actual text found (label or value) */
  actualLabel?: string;
  actualValue?: string;
  /** Which property matched (if passed) */
  matchedProperty?: 'label' | 'value';
  /** Whether case-sensitive match was used */
  caseSensitive: boolean;
  /** Total elements scanned */
  totalElementsScanned?: number;
}

// =============================================================================
// Main Function
// =============================================================================

/**
 * Assert that an element contains expected text.
 *
 * @param options - Assertion options
 * @returns Verification result indicating pass/fail
 */
export async function assertText(
  options: AssertTextOptions
): Promise<IOSResult<VerificationResult<TextAssertionData>>> {
  const {
    udid: providedUdid,
    sessionId,
    assertionId: providedId,
    target,
    expected,
    matchMode = 'exact',
    caseSensitive = true,
    textProperty = 'any',
    polling,
    captureOnFailure = true,
    captureOnSuccess = false,
  } = options;

  const assertionId = providedId || generateVerificationId('text');
  const pollingOpts = mergePollingOptions(polling);
  const startTime = new Date();
  const targetDescription = describeTarget(target);

  logger.info(`${LOG_CONTEXT} Asserting text: "${expected}" (${matchMode}) on ${targetDescription} (session: ${sessionId})`);

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
  const checkText = async (): Promise<{
    passed: boolean;
    error?: string;
    data?: TextAssertionData;
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

    // Check text content
    const matchResult = checkTextMatch(
      element,
      expected,
      matchMode,
      caseSensitive,
      textProperty
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
          actualLabel: element.label,
          actualValue: element.value,
          caseSensitive,
          totalElementsScanned: totalElements,
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
        actualLabel: element.label,
        actualValue: element.value,
        matchedProperty: matchResult.matchedProperty,
        caseSensitive,
        totalElementsScanned: totalElements,
      },
    };
  };

  // Poll for the condition
  pollingOpts.description = `text "${expected}" (${matchMode}) on ${targetDescription}`;
  const pollResult = await pollUntil<TextAssertionData>(checkText, pollingOpts);

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
    type: 'text',
    target: targetDescription,
    startTime,
    attempts,
    simulator: simulatorInfo,
    artifacts,
    data: lastData,
  };

  if (passed) {
    logger.info(`${LOG_CONTEXT} Assertion passed: ${targetDescription} contains "${expected}"`);
    return {
      success: true,
      data: createPassedResult({
        ...resultParams,
        message: `Element "${targetDescription}" text matches "${expected}" (${matchMode})`,
      }),
    };
  }

  // Check if it was a timeout or actual failure
  const lastAttempt = attempts[attempts.length - 1];
  const wasTimeout = pollResult.data!.duration >= pollingOpts.timeout;

  if (wasTimeout) {
    logger.warn(`${LOG_CONTEXT} Assertion timeout: ${targetDescription} text "${expected}" not matched after ${pollingOpts.timeout}ms`);
    return {
      success: true,
      data: createTimeoutResult({
        ...resultParams,
        timeout: pollingOpts.timeout,
      }),
    };
  }

  logger.warn(`${LOG_CONTEXT} Assertion failed: ${targetDescription} - ${lastAttempt?.error || 'text mismatch'}`);
  return {
    success: true,
    data: createFailedResult({
      ...resultParams,
      message: lastAttempt?.error || `Element "${targetDescription}" text does not match "${expected}"`,
    }),
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if element text matches expected value using the specified mode.
 */
function checkTextMatch(
  element: UIElement,
  expected: string,
  matchMode: TextMatchMode,
  caseSensitive: boolean,
  textProperty: 'label' | 'value' | 'any'
): { passed: boolean; error?: string; matchedProperty?: 'label' | 'value' } {
  const normalize = (s: string | undefined): string => {
    if (!s) return '';
    return caseSensitive ? s : s.toLowerCase();
  };

  const normalizedExpected = normalize(expected);
  const normalizedLabel = normalize(element.label);
  const normalizedValue = normalize(element.value);

  const matchText = (actual: string): boolean => {
    if (!actual && normalizedExpected) return false;

    switch (matchMode) {
      case 'exact':
        return actual === normalizedExpected;

      case 'contains':
        return actual.includes(normalizedExpected);

      case 'startsWith':
        return actual.startsWith(normalizedExpected);

      case 'endsWith':
        return actual.endsWith(normalizedExpected);

      case 'regex': {
        try {
          const flags = caseSensitive ? '' : 'i';
          const regex = new RegExp(expected, flags);
          // For regex, we use the original (non-normalized) value
          const actualOriginal = caseSensitive ? actual : (element.label || element.value || '');
          return regex.test(caseSensitive ? actual : actualOriginal);
        } catch {
          return false;
        }
      }

      default:
        return actual === normalizedExpected;
    }
  };

  // Check based on textProperty setting
  if (textProperty === 'label' || textProperty === 'any') {
    if (matchText(normalizedLabel)) {
      return { passed: true, matchedProperty: 'label' };
    }
  }

  if (textProperty === 'value' || textProperty === 'any') {
    if (matchText(normalizedValue)) {
      return { passed: true, matchedProperty: 'value' };
    }
  }

  // Build error message
  const actualTexts: string[] = [];
  if (element.label) actualTexts.push(`label="${element.label}"`);
  if (element.value) actualTexts.push(`value="${element.value}"`);

  const actualDescription = actualTexts.length > 0
    ? actualTexts.join(', ')
    : 'no text content';

  const modeDescription = matchMode === 'regex'
    ? `match pattern "${expected}"`
    : matchMode === 'exact'
    ? `equal "${expected}"`
    : `${matchMode} "${expected}"`;

  return {
    passed: false,
    error: `Text does not ${modeDescription}. Found: ${actualDescription}`,
  };
}

/**
 * Find an element matching the target specification.
 */
function findTargetElement(
  tree: UIElement,
  target: TextElementTarget
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
function describeTarget(target: TextElementTarget): string {
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
 * Assert element with identifier has expected text.
 */
export async function assertTextById(
  identifier: string,
  expected: string,
  options: Omit<AssertTextOptions, 'target' | 'expected'>
): Promise<IOSResult<VerificationResult<TextAssertionData>>> {
  return assertText({
    ...options,
    target: { identifier },
    expected,
  });
}

/**
 * Assert element with label has expected text.
 */
export async function assertTextByLabel(
  label: string,
  expected: string,
  options: Omit<AssertTextOptions, 'target' | 'expected'>
): Promise<IOSResult<VerificationResult<TextAssertionData>>> {
  return assertText({
    ...options,
    target: { label },
    expected,
  });
}

/**
 * Assert element contains text (convenience for contains match mode).
 */
export async function assertTextContains(
  target: TextElementTarget,
  expected: string,
  options: Omit<AssertTextOptions, 'target' | 'expected' | 'matchMode'>
): Promise<IOSResult<VerificationResult<TextAssertionData>>> {
  return assertText({
    ...options,
    target,
    expected,
    matchMode: 'contains',
  });
}

/**
 * Assert element text matches regex pattern.
 */
export async function assertTextMatches(
  target: TextElementTarget,
  pattern: string,
  options: Omit<AssertTextOptions, 'target' | 'expected' | 'matchMode'>
): Promise<IOSResult<VerificationResult<TextAssertionData>>> {
  return assertText({
    ...options,
    target,
    expected: pattern,
    matchMode: 'regex',
  });
}

/**
 * Assert element text starts with expected value.
 */
export async function assertTextStartsWith(
  target: TextElementTarget,
  expected: string,
  options: Omit<AssertTextOptions, 'target' | 'expected' | 'matchMode'>
): Promise<IOSResult<VerificationResult<TextAssertionData>>> {
  return assertText({
    ...options,
    target,
    expected,
    matchMode: 'startsWith',
  });
}

/**
 * Assert element text ends with expected value.
 */
export async function assertTextEndsWith(
  target: TextElementTarget,
  expected: string,
  options: Omit<AssertTextOptions, 'target' | 'expected' | 'matchMode'>
): Promise<IOSResult<VerificationResult<TextAssertionData>>> {
  return assertText({
    ...options,
    target,
    expected,
    matchMode: 'endsWith',
  });
}
