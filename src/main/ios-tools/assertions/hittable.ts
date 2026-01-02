/**
 * iOS Assertion - Assert Hittable
 *
 * Verifies that a UI element can receive tap events.
 * Checks multiple conditions: element exists, is visible, is enabled,
 * has non-zero size, and is not obscured by other elements.
 *
 * This assertion helps diagnose "why can't I tap this" issues by providing
 * detailed feedback about what's preventing an element from being interactable.
 */

import path from 'path';
import { IOSResult } from '../types';
import { getBootedSimulators, getSimulator } from '../simulator';
import { screenshot } from '../capture';
import { inspect, UIElement } from '../inspect-simple';
import { findElement, findElements, ElementQuery } from '../ui-analyzer';
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

const LOG_CONTEXT = '[iOS-Assert-Hittable]';

// =============================================================================
// Constants
// =============================================================================

// Typical iPhone screen dimensions (for off-screen detection)
const SCREEN_WIDTH = 430; // iPhone 15 Pro Max width
const SCREEN_HEIGHT = 932; // iPhone 15 Pro Max height

// Element types that typically overlay other content
const OVERLAY_TYPES = ['alert', 'sheet', 'popover', 'dialog', 'modal', 'window'];

// =============================================================================
// Types
// =============================================================================

/**
 * Reason why an element is not hittable
 */
export type NotHittableReason =
  | 'not_found'
  | 'not_visible'
  | 'not_enabled'
  | 'zero_size'
  | 'obscured'
  | 'off_screen';

/**
 * Ways to identify an element for hittable check
 */
export interface HittableElementTarget {
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
 * Options for assertHittable
 */
export interface AssertHittableOptions extends AssertionBaseOptions {
  /** Target element to find */
  target: HittableElementTarget;
  /** App bundle ID (optional, for context in logs) */
  bundleId?: string;
}

/**
 * Position information for an element
 */
export interface ElementPosition {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

/**
 * Information about an element that may be obscuring the target
 */
export interface ObscuringElementInfo {
  /** Element type */
  type: string;
  /** Element identifier if available */
  identifier?: string;
  /** Element label if available */
  label?: string;
  /** Suggested action to resolve the obstruction */
  suggestedAction: string;
}

/**
 * Data specific to hittable assertion results
 */
export interface HittableAssertionData {
  /** The element that was found (if any) */
  element?: UIElement;
  /** How the element was identified */
  matchedBy?: 'identifier' | 'label' | 'text' | 'type' | 'query';
  /** Whether element was visible */
  wasVisible?: boolean;
  /** Whether element was enabled */
  wasEnabled?: boolean;
  /** Whether element has non-zero size */
  hasNonZeroSize?: boolean;
  /** Whether element is off-screen */
  isOffScreen?: boolean;
  /** Position information if element was found */
  position?: ElementPosition;
  /** Reason why element is not hittable (if failed) */
  notHittableReason?: NotHittableReason;
  /** Suggested action to make element hittable */
  suggestedAction?: string;
  /** Information about obscuring element if present */
  obscuringElement?: ObscuringElementInfo;
  /** Total elements scanned */
  totalElementsScanned?: number;
}

// =============================================================================
// Main Function
// =============================================================================

/**
 * Assert that an element is hittable (can receive tap events).
 *
 * Verifies:
 * - Element exists in UI tree
 * - Element is visible
 * - Element is enabled
 * - Element has non-zero size
 * - Element is within screen bounds
 * - Element is not obscured by overlays (alerts, modals, etc.)
 *
 * @param options - Assertion options
 * @returns Verification result indicating pass/fail with detailed diagnostics
 */
export async function assertHittable(
  options: AssertHittableOptions
): Promise<IOSResult<VerificationResult<HittableAssertionData>>> {
  const {
    udid: providedUdid,
    sessionId,
    assertionId: providedId,
    target,
    polling,
    captureOnFailure = true,
    captureOnSuccess = false,
  } = options;

  const assertionId = providedId || generateVerificationId('hittable');
  const pollingOpts = mergePollingOptions(polling);
  const startTime = new Date();
  const targetDescription = describeTarget(target);

  logger.info(`${LOG_CONTEXT} Asserting hittable: ${targetDescription} (session: ${sessionId})`);

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
  const checkHittable = async (): Promise<{
    passed: boolean;
    error?: string;
    data?: HittableAssertionData;
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
    const allElements = inspectResult.data.elements;
    const totalElements = inspectResult.data.stats.totalElements;

    // Try to find the element
    const findResult = findTargetElement(tree, target);

    if (!findResult.element) {
      return {
        passed: false,
        error: `Element not found: ${targetDescription}`,
        data: {
          notHittableReason: 'not_found',
          suggestedAction: 'Verify the element identifier/label is correct, or wait for the element to appear',
          totalElementsScanned: totalElements,
        },
      };
    }

    const element = findResult.element;
    const frame = element.frame;
    const position: ElementPosition = {
      x: frame.x,
      y: frame.y,
      width: frame.width,
      height: frame.height,
      centerX: Math.round(frame.x + frame.width / 2),
      centerY: Math.round(frame.y + frame.height / 2),
    };

    // Check visibility
    if (!element.visible) {
      return {
        passed: false,
        error: `Element found but not visible: ${targetDescription}`,
        data: {
          element,
          matchedBy: findResult.matchedBy,
          wasVisible: false,
          wasEnabled: element.enabled,
          hasNonZeroSize: frame.width > 0 && frame.height > 0,
          position,
          notHittableReason: 'not_visible',
          suggestedAction: 'Wait for the element to become visible or scroll it into view',
          totalElementsScanned: totalElements,
        },
      };
    }

    // Check enabled state
    if (!element.enabled) {
      return {
        passed: false,
        error: `Element found but not enabled: ${targetDescription}`,
        data: {
          element,
          matchedBy: findResult.matchedBy,
          wasVisible: true,
          wasEnabled: false,
          hasNonZeroSize: frame.width > 0 && frame.height > 0,
          position,
          notHittableReason: 'not_enabled',
          suggestedAction: 'Wait for the element to become enabled or complete required preceding steps',
          totalElementsScanned: totalElements,
        },
      };
    }

    // Check zero size
    if (frame.width === 0 || frame.height === 0) {
      return {
        passed: false,
        error: `Element has zero size (collapsed or hidden): ${targetDescription}`,
        data: {
          element,
          matchedBy: findResult.matchedBy,
          wasVisible: true,
          wasEnabled: true,
          hasNonZeroSize: false,
          position,
          notHittableReason: 'zero_size',
          suggestedAction: 'Wait for the element to load or expand',
          totalElementsScanned: totalElements,
        },
      };
    }

    // Check off-screen
    const isOffScreen =
      frame.x + frame.width < 0 ||
      frame.x > SCREEN_WIDTH ||
      frame.y + frame.height < 0 ||
      frame.y > SCREEN_HEIGHT;

    if (isOffScreen) {
      return {
        passed: false,
        error: `Element is off-screen at (${position.centerX}, ${position.centerY}): ${targetDescription}`,
        data: {
          element,
          matchedBy: findResult.matchedBy,
          wasVisible: true,
          wasEnabled: true,
          hasNonZeroSize: true,
          isOffScreen: true,
          position,
          notHittableReason: 'off_screen',
          suggestedAction: `Scroll to bring the element into view (element center at x:${position.centerX}, y:${position.centerY})`,
          totalElementsScanned: totalElements,
        },
      };
    }

    // Check for obscuring elements (alerts, modals, sheets)
    const obscuringElement = findObscuringElement(element, allElements);
    if (obscuringElement) {
      const obscuringInfo: ObscuringElementInfo = {
        type: obscuringElement.type,
        identifier: obscuringElement.identifier,
        label: obscuringElement.label,
        suggestedAction: obscuringElement.type.toLowerCase().includes('alert')
          ? 'Dismiss the alert before interacting with this element'
          : 'Wait for the obscuring element to disappear or dismiss it first',
      };

      return {
        passed: false,
        error: `Element is obscured by ${formatElementDescription(obscuringElement)}: ${targetDescription}`,
        data: {
          element,
          matchedBy: findResult.matchedBy,
          wasVisible: true,
          wasEnabled: true,
          hasNonZeroSize: true,
          isOffScreen: false,
          position,
          notHittableReason: 'obscured',
          suggestedAction: obscuringInfo.suggestedAction,
          obscuringElement: obscuringInfo,
          totalElementsScanned: totalElements,
        },
      };
    }

    // All checks passed - element is hittable!
    return {
      passed: true,
      data: {
        element,
        matchedBy: findResult.matchedBy,
        wasVisible: true,
        wasEnabled: true,
        hasNonZeroSize: true,
        isOffScreen: false,
        position,
        totalElementsScanned: totalElements,
      },
    };
  };

  // Poll for the condition
  pollingOpts.description = `hittable state of ${targetDescription}`;
  const pollResult = await pollUntil<HittableAssertionData>(checkHittable, pollingOpts);

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
    type: 'hittable',
    target: targetDescription,
    startTime,
    attempts,
    simulator: simulatorInfo,
    artifacts,
    data: lastData,
  };

  if (passed) {
    const position = lastData?.position;
    const positionStr = position ? ` at (${position.centerX}, ${position.centerY})` : '';
    logger.info(`${LOG_CONTEXT} Assertion passed: ${targetDescription} is hittable${positionStr}`);
    return {
      success: true,
      data: createPassedResult({
        ...resultParams,
        message: `Element "${targetDescription}" is hittable${positionStr}`,
      }),
    };
  }

  // Check if it was a timeout or actual failure
  const wasTimeout = pollResult.data!.duration >= pollingOpts.timeout;

  if (wasTimeout) {
    const reason = lastData?.notHittableReason || 'unknown';
    logger.warn(`${LOG_CONTEXT} Assertion timeout: ${targetDescription} not hittable after ${pollingOpts.timeout}ms (reason: ${reason})`);
    return {
      success: true,
      data: createTimeoutResult({
        ...resultParams,
        timeout: pollingOpts.timeout,
      }),
    };
  }

  const lastAttempt = attempts[attempts.length - 1];
  const reason = lastData?.notHittableReason || 'unknown';
  logger.warn(`${LOG_CONTEXT} Assertion failed: ${targetDescription} not hittable (reason: ${reason})`);
  return {
    success: true,
    data: createFailedResult({
      ...resultParams,
      message: lastAttempt?.error || `Element "${targetDescription}" is not hittable: ${reason}`,
    }),
  };
}

/**
 * Assert that an element is NOT hittable.
 *
 * This is useful for verifying that an element should not be interactable,
 * such as a disabled button or an element obscured by a modal.
 *
 * @param options - Assertion options
 * @returns Verification result indicating pass/fail
 */
export async function assertNotHittable(
  options: AssertHittableOptions
): Promise<IOSResult<VerificationResult<HittableAssertionData>>> {
  const {
    udid: providedUdid,
    sessionId,
    assertionId: providedId,
    target,
    polling,
    captureOnFailure = true,
    captureOnSuccess = false,
  } = options;

  const assertionId = providedId || generateVerificationId('not-hittable');
  const pollingOpts = mergePollingOptions(polling);
  const startTime = new Date();
  const targetDescription = describeTarget(target);

  logger.info(`${LOG_CONTEXT} Asserting not hittable: ${targetDescription} (session: ${sessionId})`);

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

  // Polling check function - passes when element is NOT hittable
  const checkNotHittable = async (): Promise<{
    passed: boolean;
    error?: string;
    data?: HittableAssertionData;
  }> => {
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
    const allElements = inspectResult.data.elements;
    const totalElements = inspectResult.data.stats.totalElements;
    const findResult = findTargetElement(tree, target);

    // If element not found, it's not hittable - passes!
    if (!findResult.element) {
      return {
        passed: true,
        data: {
          notHittableReason: 'not_found',
          totalElementsScanned: totalElements,
        },
      };
    }

    const element = findResult.element;
    const frame = element.frame;
    const position: ElementPosition = {
      x: frame.x,
      y: frame.y,
      width: frame.width,
      height: frame.height,
      centerX: Math.round(frame.x + frame.width / 2),
      centerY: Math.round(frame.y + frame.height / 2),
    };

    // Check if NOT visible
    if (!element.visible) {
      return {
        passed: true,
        data: {
          element,
          matchedBy: findResult.matchedBy,
          wasVisible: false,
          position,
          notHittableReason: 'not_visible',
          totalElementsScanned: totalElements,
        },
      };
    }

    // Check if NOT enabled
    if (!element.enabled) {
      return {
        passed: true,
        data: {
          element,
          matchedBy: findResult.matchedBy,
          wasVisible: true,
          wasEnabled: false,
          position,
          notHittableReason: 'not_enabled',
          totalElementsScanned: totalElements,
        },
      };
    }

    // Check zero size
    if (frame.width === 0 || frame.height === 0) {
      return {
        passed: true,
        data: {
          element,
          matchedBy: findResult.matchedBy,
          wasVisible: true,
          wasEnabled: true,
          hasNonZeroSize: false,
          position,
          notHittableReason: 'zero_size',
          totalElementsScanned: totalElements,
        },
      };
    }

    // Check off-screen
    const isOffScreen =
      frame.x + frame.width < 0 ||
      frame.x > SCREEN_WIDTH ||
      frame.y + frame.height < 0 ||
      frame.y > SCREEN_HEIGHT;

    if (isOffScreen) {
      return {
        passed: true,
        data: {
          element,
          matchedBy: findResult.matchedBy,
          wasVisible: true,
          wasEnabled: true,
          hasNonZeroSize: true,
          isOffScreen: true,
          position,
          notHittableReason: 'off_screen',
          totalElementsScanned: totalElements,
        },
      };
    }

    // Check for obscuring elements
    const obscuringElement = findObscuringElement(element, allElements);
    if (obscuringElement) {
      return {
        passed: true,
        data: {
          element,
          matchedBy: findResult.matchedBy,
          wasVisible: true,
          wasEnabled: true,
          hasNonZeroSize: true,
          isOffScreen: false,
          position,
          notHittableReason: 'obscured',
          obscuringElement: {
            type: obscuringElement.type,
            identifier: obscuringElement.identifier,
            label: obscuringElement.label,
            suggestedAction: '',
          },
          totalElementsScanned: totalElements,
        },
      };
    }

    // Element IS hittable - assertion fails
    return {
      passed: false,
      error: `Element is still hittable: ${targetDescription}`,
      data: {
        element,
        matchedBy: findResult.matchedBy,
        wasVisible: true,
        wasEnabled: true,
        hasNonZeroSize: true,
        isOffScreen: false,
        position,
        totalElementsScanned: totalElements,
      },
    };
  };

  pollingOpts.description = `not-hittable state of ${targetDescription}`;
  const pollResult = await pollUntil<HittableAssertionData>(checkNotHittable, pollingOpts);

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
    type: 'not-hittable',
    target: targetDescription,
    startTime,
    attempts,
    simulator: simulatorInfo,
    artifacts,
    data: lastData,
  };

  if (passed) {
    const reason = lastData?.notHittableReason || 'not found';
    logger.info(`${LOG_CONTEXT} Assertion passed: ${targetDescription} is not hittable (${reason})`);
    return {
      success: true,
      data: createPassedResult({
        ...resultParams,
        message: `Element "${targetDescription}" is not hittable: ${reason}`,
      }),
    };
  }

  const wasTimeout = pollResult.data!.duration >= pollingOpts.timeout;

  if (wasTimeout) {
    logger.warn(`${LOG_CONTEXT} Assertion timeout: ${targetDescription} still hittable after ${pollingOpts.timeout}ms`);
    return {
      success: true,
      data: createTimeoutResult({
        ...resultParams,
        timeout: pollingOpts.timeout,
      }),
    };
  }

  const lastAttempt = attempts[attempts.length - 1];
  logger.warn(`${LOG_CONTEXT} Assertion failed: ${targetDescription} is still hittable`);
  return {
    success: true,
    data: createFailedResult({
      ...resultParams,
      message: lastAttempt?.error || `Element "${targetDescription}" is still hittable`,
    }),
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Find an element matching the target specification.
 * Note: We search with visible: false and enabled: false to find elements
 * regardless of their state, since we want to check hittability ourselves.
 */
function findTargetElement(
  tree: UIElement,
  target: HittableElementTarget
): { element: UIElement | undefined; matchedBy?: 'identifier' | 'label' | 'text' | 'type' | 'query' } {
  // Priority order: identifier > label > text > type > query
  // We use visible: false and enabled: false to bypass default filters
  // since we want to find the element regardless of its state and check hittability ourselves

  if (target.identifier) {
    const element = findElement(tree, { identifier: target.identifier, visible: false, enabled: false });
    if (element) {
      return { element, matchedBy: 'identifier' };
    }
  }

  if (target.label) {
    const element = findElement(tree, { label: target.label, visible: false, enabled: false });
    if (element) {
      return { element, matchedBy: 'label' };
    }
  }

  if (target.text) {
    const result = findElements(tree, { containsText: target.text, visible: false, enabled: false });
    if (result.elements.length > 0) {
      return { element: result.elements[0], matchedBy: 'text' };
    }
  }

  if (target.type) {
    const element = findElement(tree, { type: target.type, visible: false, enabled: false });
    if (element) {
      return { element, matchedBy: 'type' };
    }
  }

  if (target.query) {
    // Merge visible and enabled into the user's query to bypass filters
    const element = findElement(tree, { ...target.query, visible: false, enabled: false });
    if (element) {
      return { element, matchedBy: 'query' };
    }
  }

  return { element: undefined };
}

/**
 * Create a human-readable description of the target.
 */
function describeTarget(target: HittableElementTarget): string {
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

/**
 * Format an element description for error messages.
 */
function formatElementDescription(element: UIElement): string {
  if (element.identifier) {
    return `${element.type} (#${element.identifier})`;
  }
  if (element.label) {
    return `${element.type} ("${element.label}")`;
  }
  return element.type;
}

/**
 * Find any element that might be obscuring the target element.
 * Checks for alerts, modals, overlays, etc.
 */
function findObscuringElement(target: UIElement, allElements: UIElement[]): UIElement | null {
  const targetFrame = target.frame;
  const targetCenter = {
    x: targetFrame.x + targetFrame.width / 2,
    y: targetFrame.y + targetFrame.height / 2,
  };

  // Find overlay-type elements that contain the target's center point
  for (const element of allElements) {
    // Skip the target element itself
    if (element === target) continue;

    // Skip non-visible elements
    if (!element.visible) continue;

    // Check if it's an overlay type
    const typeLower = element.type.toLowerCase();
    const isOverlay = OVERLAY_TYPES.some((t) => typeLower.includes(t));

    if (!isOverlay) continue;

    // Check if overlay contains the target's center
    const frame = element.frame;
    const containsCenter =
      targetCenter.x >= frame.x &&
      targetCenter.x <= frame.x + frame.width &&
      targetCenter.y >= frame.y &&
      targetCenter.y <= frame.y + frame.height;

    if (containsCenter && frame.width > 0 && frame.height > 0) {
      return element;
    }
  }

  return null;
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Assert element with identifier is hittable.
 */
export async function assertHittableById(
  identifier: string,
  options: Omit<AssertHittableOptions, 'target'>
): Promise<IOSResult<VerificationResult<HittableAssertionData>>> {
  return assertHittable({
    ...options,
    target: { identifier },
  });
}

/**
 * Assert element with label is hittable.
 */
export async function assertHittableByLabel(
  label: string,
  options: Omit<AssertHittableOptions, 'target'>
): Promise<IOSResult<VerificationResult<HittableAssertionData>>> {
  return assertHittable({
    ...options,
    target: { label },
  });
}

/**
 * Assert element with text content is hittable.
 */
export async function assertHittableByText(
  text: string,
  options: Omit<AssertHittableOptions, 'target'>
): Promise<IOSResult<VerificationResult<HittableAssertionData>>> {
  return assertHittable({
    ...options,
    target: { text },
  });
}

/**
 * Assert element with identifier is NOT hittable.
 */
export async function assertNotHittableById(
  identifier: string,
  options: Omit<AssertHittableOptions, 'target'>
): Promise<IOSResult<VerificationResult<HittableAssertionData>>> {
  return assertNotHittable({
    ...options,
    target: { identifier },
  });
}

/**
 * Assert element with label is NOT hittable.
 */
export async function assertNotHittableByLabel(
  label: string,
  options: Omit<AssertHittableOptions, 'target'>
): Promise<IOSResult<VerificationResult<HittableAssertionData>>> {
  return assertNotHittable({
    ...options,
    target: { label },
  });
}

/**
 * Assert element with text content is NOT hittable.
 */
export async function assertNotHittableByText(
  text: string,
  options: Omit<AssertHittableOptions, 'target'>
): Promise<IOSResult<VerificationResult<HittableAssertionData>>> {
  return assertNotHittable({
    ...options,
    target: { text },
  });
}
