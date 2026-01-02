/**
 * iOS Assertion - Wait For
 *
 * Waits for an element to appear (or disappear) on screen.
 * Unlike assertVisible, this command is specifically designed for waiting
 * and returns success once the condition is met.
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
  createTimeoutResult,
  mergePollingOptions,
} from '../verification';
import { logger } from '../../utils/logger';

const LOG_CONTEXT = '[iOS-Wait-For]';

// =============================================================================
// Types
// =============================================================================

/**
 * Ways to identify an element to wait for
 */
export interface WaitForTarget {
  /** Accessibility identifier (preferred) */
  identifier?: string;
  /** Accessibility label text */
  label?: string;
  /** Text content (for StaticText elements) */
  text?: string;
  /** Element type (e.g., "Button", "TextField") */
  type?: string;
  /** Custom query for complex matching */
  query?: ElementQuery;
}

/**
 * Options for waitFor
 */
export interface WaitForOptions extends AssertionBaseOptions {
  /** Target element to wait for */
  target: WaitForTarget;
  /** If true, wait for element to NOT be visible/present (default: false) */
  not?: boolean;
  /** App bundle ID (optional, for context in logs) */
  bundleId?: string;
}

/**
 * Data specific to waitFor results
 */
export interface WaitForData {
  /** The element that was found (if any) */
  element?: UIElement;
  /** How the element was identified */
  matchedBy?: 'identifier' | 'label' | 'text' | 'type' | 'query';
  /** Whether we were waiting for absence (--not) */
  waitingForAbsence: boolean;
  /** Total elements scanned in last check */
  totalElementsScanned?: number;
}

// =============================================================================
// Main Function
// =============================================================================

/**
 * Wait for an element to appear (or disappear) on screen.
 *
 * @param options - Wait options
 * @returns Verification result indicating success/timeout
 */
export async function waitFor(
  options: WaitForOptions
): Promise<IOSResult<VerificationResult<WaitForData>>> {
  const {
    udid: providedUdid,
    sessionId,
    assertionId: providedId,
    target,
    not: waitForAbsence = false,
    polling,
    captureOnFailure = true,
    captureOnSuccess = false,
  } = options;

  const assertionId = providedId || generateVerificationId('wait-for');
  const pollingOpts = mergePollingOptions(polling);
  const startTime = new Date();
  const targetDescription = describeTarget(target);
  const actionDescription = waitForAbsence ? 'disappear' : 'appear';

  logger.info(`${LOG_CONTEXT} Waiting for ${targetDescription} to ${actionDescription} (session: ${sessionId})`);

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
  const checkCondition = async (): Promise<{
    passed: boolean;
    error?: string;
    data?: WaitForData;
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

    if (waitForAbsence) {
      // Waiting for element to NOT be visible/present
      if (!findResult.element || !findResult.element.visible) {
        // Success - element is not present or not visible
        return {
          passed: true,
          data: {
            element: findResult.element,
            matchedBy: findResult.matchedBy,
            waitingForAbsence: true,
            totalElementsScanned: totalElements,
          },
        };
      }
      // Element is still visible - keep waiting
      return {
        passed: false,
        error: `Element still visible: ${targetDescription}`,
        data: {
          element: findResult.element,
          matchedBy: findResult.matchedBy,
          waitingForAbsence: true,
          totalElementsScanned: totalElements,
        },
      };
    } else {
      // Waiting for element to appear and be visible
      if (findResult.element && findResult.element.visible) {
        // Success - element found and visible
        return {
          passed: true,
          data: {
            element: findResult.element,
            matchedBy: findResult.matchedBy,
            waitingForAbsence: false,
            totalElementsScanned: totalElements,
          },
        };
      }
      // Element not found or not visible - keep waiting
      const reason = !findResult.element
        ? `Element not found: ${targetDescription}`
        : `Element found but not visible: ${targetDescription}`;
      return {
        passed: false,
        error: reason,
        data: {
          element: findResult.element,
          matchedBy: findResult.matchedBy,
          waitingForAbsence: false,
          totalElementsScanned: totalElements,
        },
      };
    }
  };

  // Poll for the condition
  pollingOpts.description = `${targetDescription} to ${actionDescription}`;
  const pollResult = await pollUntil<WaitForData>(checkCondition, pollingOpts);

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
    const screenshotPath = path.join(artifactDir, passed ? 'success.png' : 'timeout.png');
    const screenshotResult = await screenshot({ udid, outputPath: screenshotPath });

    if (screenshotResult.success) {
      artifacts.screenshots = [screenshotPath];
    }
  }

  // Build result
  const resultParams = {
    id: assertionId,
    type: waitForAbsence ? 'wait-for-not' : 'wait-for',
    target: targetDescription,
    startTime,
    attempts,
    simulator: simulatorInfo,
    artifacts,
    data: lastData,
  };

  if (passed) {
    const message = waitForAbsence
      ? `Element "${targetDescription}" is no longer visible`
      : `Element "${targetDescription}" appeared and is visible`;
    logger.info(`${LOG_CONTEXT} Wait complete: ${message}`);
    return {
      success: true,
      data: createPassedResult({
        ...resultParams,
        message,
      }),
    };
  }

  // Timeout - condition was not met
  const timeoutMessage = waitForAbsence
    ? `Element "${targetDescription}" did not disappear within ${pollingOpts.timeout}ms`
    : `Element "${targetDescription}" did not appear within ${pollingOpts.timeout}ms`;
  logger.warn(`${LOG_CONTEXT} Wait timeout: ${timeoutMessage}`);
  return {
    success: true,
    data: createTimeoutResult({
      ...resultParams,
      timeout: pollingOpts.timeout,
    }),
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Find an element matching the target specification.
 */
function findTargetElement(
  tree: UIElement,
  target: WaitForTarget
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
function describeTarget(target: WaitForTarget): string {
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
 * Wait for element with identifier to appear.
 */
export async function waitForById(
  identifier: string,
  options: Omit<WaitForOptions, 'target'>
): Promise<IOSResult<VerificationResult<WaitForData>>> {
  return waitFor({
    ...options,
    target: { identifier },
  });
}

/**
 * Wait for element with label to appear.
 */
export async function waitForByLabel(
  label: string,
  options: Omit<WaitForOptions, 'target'>
): Promise<IOSResult<VerificationResult<WaitForData>>> {
  return waitFor({
    ...options,
    target: { label },
  });
}

/**
 * Wait for element with text content to appear.
 */
export async function waitForByText(
  text: string,
  options: Omit<WaitForOptions, 'target'>
): Promise<IOSResult<VerificationResult<WaitForData>>> {
  return waitFor({
    ...options,
    target: { text },
  });
}

/**
 * Wait for element to disappear.
 */
export async function waitForNot(
  options: WaitForOptions
): Promise<IOSResult<VerificationResult<WaitForData>>> {
  return waitFor({
    ...options,
    not: true,
  });
}

/**
 * Wait for element with identifier to disappear.
 */
export async function waitForNotById(
  identifier: string,
  options: Omit<WaitForOptions, 'target' | 'not'>
): Promise<IOSResult<VerificationResult<WaitForData>>> {
  return waitFor({
    ...options,
    target: { identifier },
    not: true,
  });
}

/**
 * Wait for element with label to disappear.
 */
export async function waitForNotByLabel(
  label: string,
  options: Omit<WaitForOptions, 'target' | 'not'>
): Promise<IOSResult<VerificationResult<WaitForData>>> {
  return waitFor({
    ...options,
    target: { label },
    not: true,
  });
}

/**
 * Wait for element with text to disappear.
 */
export async function waitForNotByText(
  text: string,
  options: Omit<WaitForOptions, 'target' | 'not'>
): Promise<IOSResult<VerificationResult<WaitForData>>> {
  return waitFor({
    ...options,
    target: { text },
    not: true,
  });
}
