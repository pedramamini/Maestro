/**
 * iOS Assertion - Assert Visible
 *
 * Verifies that a UI element is visible on screen.
 * Uses polling to wait for the element to appear within a timeout.
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

const LOG_CONTEXT = '[iOS-Assert-Visible]';

// =============================================================================
// Types
// =============================================================================

/**
 * Ways to identify an element for visibility check
 */
export interface ElementTarget {
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
 * Options for assertVisible
 */
export interface AssertVisibleOptions extends AssertionBaseOptions {
  /** Target element to find */
  target: ElementTarget;
  /** Whether to require the element to be enabled (default: false) */
  requireEnabled?: boolean;
  /** App bundle ID (optional, for context in logs) */
  bundleId?: string;
}

/**
 * Data specific to visible assertion results
 */
export interface VisibleAssertionData {
  /** The element that was found (if any) */
  element?: UIElement;
  /** How the element was identified */
  matchedBy?: 'identifier' | 'label' | 'text' | 'type' | 'query';
  /** Whether enabled check was required */
  enabledRequired: boolean;
  /** Whether element was enabled (if found) */
  wasEnabled?: boolean;
  /** Total elements scanned */
  totalElementsScanned?: number;
}

// =============================================================================
// Main Function
// =============================================================================

/**
 * Assert that an element is visible on screen.
 *
 * @param options - Assertion options
 * @returns Verification result indicating pass/fail
 */
export async function assertVisible(
  options: AssertVisibleOptions
): Promise<IOSResult<VerificationResult<VisibleAssertionData>>> {
  const {
    udid: providedUdid,
    sessionId,
    assertionId: providedId,
    target,
    polling,
    captureOnFailure = true,
    captureOnSuccess = false,
    requireEnabled = false,
  } = options;

  const assertionId = providedId || generateVerificationId('visible');
  const pollingOpts = mergePollingOptions(polling);
  const startTime = new Date();
  const targetDescription = describeTarget(target);

  logger.info(`${LOG_CONTEXT} Asserting visible: ${targetDescription} (session: ${sessionId})`);

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
  const checkVisible = async (): Promise<{
    passed: boolean;
    error?: string;
    data?: VisibleAssertionData;
  }> => {
    // Capture current UI state
    const inspectResult = await inspect({
      udid,
      sessionId,
      captureScreenshot: false, // We'll capture our own screenshots
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
          enabledRequired: requireEnabled,
          totalElementsScanned: totalElements,
        },
      };
    }

    const element = findResult.element;

    // Check visibility
    if (!element.visible) {
      return {
        passed: false,
        error: `Element found but not visible: ${targetDescription}`,
        data: {
          element,
          matchedBy: findResult.matchedBy,
          enabledRequired: requireEnabled,
          wasEnabled: element.enabled,
          totalElementsScanned: totalElements,
        },
      };
    }

    // Check enabled if required
    if (requireEnabled && !element.enabled) {
      return {
        passed: false,
        error: `Element visible but not enabled: ${targetDescription}`,
        data: {
          element,
          matchedBy: findResult.matchedBy,
          enabledRequired: requireEnabled,
          wasEnabled: element.enabled,
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
        enabledRequired: requireEnabled,
        wasEnabled: element.enabled,
        totalElementsScanned: totalElements,
      },
    };
  };

  // Poll for the condition
  pollingOpts.description = `visibility of ${targetDescription}`;
  const pollResult = await pollUntil<VisibleAssertionData>(checkVisible, pollingOpts);

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
    type: 'visible',
    target: targetDescription,
    startTime,
    attempts,
    simulator: simulatorInfo,
    artifacts,
    data: lastData,
  };

  if (passed) {
    logger.info(`${LOG_CONTEXT} Assertion passed: ${targetDescription} is visible`);
    return {
      success: true,
      data: createPassedResult({
        ...resultParams,
        message: `Element "${targetDescription}" is visible${requireEnabled ? ' and enabled' : ''}`,
      }),
    };
  }

  // Check if it was a timeout or actual failure
  const lastAttempt = attempts[attempts.length - 1];
  const wasTimeout = pollResult.data!.duration >= pollingOpts.timeout;

  if (wasTimeout) {
    logger.warn(`${LOG_CONTEXT} Assertion timeout: ${targetDescription} not visible after ${pollingOpts.timeout}ms`);
    return {
      success: true,
      data: createTimeoutResult({
        ...resultParams,
        timeout: pollingOpts.timeout,
      }),
    };
  }

  logger.warn(`${LOG_CONTEXT} Assertion failed: ${targetDescription} - ${lastAttempt?.error || 'not visible'}`);
  return {
    success: true,
    data: createFailedResult({
      ...resultParams,
      message: lastAttempt?.error || `Element "${targetDescription}" not visible`,
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
  target: ElementTarget
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
function describeTarget(target: ElementTarget): string {
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
 * Assert element with identifier is visible.
 */
export async function assertVisibleById(
  identifier: string,
  options: Omit<AssertVisibleOptions, 'target'>
): Promise<IOSResult<VerificationResult<VisibleAssertionData>>> {
  return assertVisible({
    ...options,
    target: { identifier },
  });
}

/**
 * Assert element with label is visible.
 */
export async function assertVisibleByLabel(
  label: string,
  options: Omit<AssertVisibleOptions, 'target'>
): Promise<IOSResult<VerificationResult<VisibleAssertionData>>> {
  return assertVisible({
    ...options,
    target: { label },
  });
}

/**
 * Assert element with text content is visible.
 */
export async function assertVisibleByText(
  text: string,
  options: Omit<AssertVisibleOptions, 'target'>
): Promise<IOSResult<VerificationResult<VisibleAssertionData>>> {
  return assertVisible({
    ...options,
    target: { text },
  });
}

/**
 * Assert element is NOT visible.
 */
export async function assertNotVisible(
  options: AssertVisibleOptions
): Promise<IOSResult<VerificationResult<VisibleAssertionData>>> {
  const {
    udid: providedUdid,
    sessionId,
    assertionId: providedId,
    target,
    polling,
    captureOnFailure = true,
    captureOnSuccess = false,
  } = options;

  const assertionId = providedId || generateVerificationId('not-visible');
  const pollingOpts = mergePollingOptions(polling);
  const startTime = new Date();
  const targetDescription = describeTarget(target);

  logger.info(`${LOG_CONTEXT} Asserting NOT visible: ${targetDescription} (session: ${sessionId})`);

  // Get simulator
  let udid = providedUdid;
  if (!udid) {
    const bootedResult = await getBootedSimulators();
    if (!bootedResult.success || !bootedResult.data || bootedResult.data.length === 0) {
      return {
        success: false,
        error: 'No booted simulator found.',
        errorCode: 'SIMULATOR_NOT_BOOTED',
      };
    }
    udid = bootedResult.data[0].udid;
  }

  const simResult = await getSimulator(udid);
  if (!simResult.success || !simResult.data || simResult.data.state !== 'Booted') {
    return {
      success: false,
      error: simResult.error || 'Simulator not available',
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

  // Polling check function - passes when element is NOT found or NOT visible
  const checkNotVisible = async (): Promise<{
    passed: boolean;
    error?: string;
    data?: VisibleAssertionData;
  }> => {
    const inspectResult = await inspect({
      udid,
      sessionId,
      captureScreenshot: false,
      snapshotId: `${assertionId}-inspect-${Date.now()}`,
    });

    if (!inspectResult.success || !inspectResult.data) {
      // If we can't inspect, we can't verify - don't pass
      return {
        passed: false,
        error: inspectResult.error || 'Failed to inspect UI',
      };
    }

    const tree = inspectResult.data.tree;
    const findResult = findTargetElement(tree, target);

    if (!findResult.element) {
      // Element not found = passes
      return {
        passed: true,
        data: {
          enabledRequired: false,
          totalElementsScanned: inspectResult.data.stats.totalElements,
        },
      };
    }

    if (!findResult.element.visible) {
      // Element found but not visible = passes
      return {
        passed: true,
        data: {
          element: findResult.element,
          matchedBy: findResult.matchedBy,
          enabledRequired: false,
          wasEnabled: findResult.element.enabled,
          totalElementsScanned: inspectResult.data.stats.totalElements,
        },
      };
    }

    // Element is visible = fails
    return {
      passed: false,
      error: `Element is still visible: ${targetDescription}`,
      data: {
        element: findResult.element,
        matchedBy: findResult.matchedBy,
        enabledRequired: false,
        wasEnabled: findResult.element.enabled,
        totalElementsScanned: inspectResult.data.stats.totalElements,
      },
    };
  };

  pollingOpts.description = `disappearance of ${targetDescription}`;
  const pollResult = await pollUntil<VisibleAssertionData>(checkNotVisible, pollingOpts);

  if (!pollResult.success) {
    return {
      success: false,
      error: pollResult.error || 'Polling failed',
      errorCode: pollResult.errorCode || 'COMMAND_FAILED',
    };
  }

  const { passed, attempts, lastData } = pollResult.data!;
  const artifacts: { screenshots?: string[] } = {};

  if ((passed && captureOnSuccess) || (!passed && captureOnFailure)) {
    const screenshotPath = path.join(artifactDir, passed ? 'success.png' : 'failure.png');
    const screenshotResult = await screenshot({ udid, outputPath: screenshotPath });

    if (screenshotResult.success) {
      artifacts.screenshots = [screenshotPath];
    }
  }

  const resultParams = {
    id: assertionId,
    type: 'not-visible',
    target: targetDescription,
    startTime,
    attempts,
    simulator: simulatorInfo,
    artifacts,
    data: lastData,
  };

  if (passed) {
    logger.info(`${LOG_CONTEXT} Assertion passed: ${targetDescription} is NOT visible`);
    return {
      success: true,
      data: createPassedResult({
        ...resultParams,
        message: `Element "${targetDescription}" is not visible`,
      }),
    };
  }

  const wasTimeout = pollResult.data!.duration >= pollingOpts.timeout;

  if (wasTimeout) {
    logger.warn(`${LOG_CONTEXT} Assertion timeout: ${targetDescription} still visible after ${pollingOpts.timeout}ms`);
    return {
      success: true,
      data: createTimeoutResult({
        ...resultParams,
        timeout: pollingOpts.timeout,
      }),
    };
  }

  logger.warn(`${LOG_CONTEXT} Assertion failed: ${targetDescription} is still visible`);
  return {
    success: true,
    data: createFailedResult({
      ...resultParams,
      message: `Element "${targetDescription}" is still visible`,
    }),
  };
}
