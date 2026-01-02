/**
 * iOS Tools - Action Validator
 *
 * Validates action targets against the UI tree before execution.
 * Provides functions to check if targets exist, are hittable,
 * and suggests alternatives when targets are not found.
 */

import { ElementNode } from './inspect';
import { ActionTarget, ActionType } from './native-driver';
import { logger } from '../utils/logger';

const LOG_CONTEXT = '[iOS-ActionValidator]';

// =============================================================================
// Types
// =============================================================================

/**
 * Reason why an element cannot be tapped
 */
export type NotHittableReason =
  | 'not_found'
  | 'not_visible'
  | 'not_enabled'
  | 'zero_size'
  | 'obscured'
  | 'off_screen'
  | 'not_hittable';

/**
 * Result of target validation
 */
export interface ValidationResult {
  /** Whether the target is valid and can be interacted with */
  valid: boolean;
  /** The element that was found (if any) */
  element?: ElementNode;
  /** Why the target is invalid */
  reason?: NotHittableReason;
  /** Human-readable error message */
  message?: string;
  /** Suggested alternatives if the target was not found */
  suggestions?: SuggestedTarget[];
  /** Confidence score (0-100) if element found */
  confidence?: number;
}

/**
 * A suggested alternative target
 */
export interface SuggestedTarget {
  /** The target specification */
  target: ActionTarget;
  /** The element this target would match */
  element: ElementNode;
  /** Similarity score (0-100) */
  similarity: number;
  /** Why this is being suggested */
  reason: string;
}

/**
 * Result of hittability check
 */
export interface HittabilityResult {
  /** Whether the element can receive tap events */
  hittable: boolean;
  /** Why the element is not hittable (if applicable) */
  reason?: NotHittableReason;
  /** Human-readable explanation */
  message: string;
  /** Position information if relevant */
  position?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** What action might make this element hittable */
  suggestedAction?: string;
}

/**
 * Options for validation
 */
export interface ValidationOptions {
  /** Whether to require visibility (default: true) */
  requireVisible?: boolean;
  /** Whether to require enabled state (default: true) */
  requireEnabled?: boolean;
  /** Whether to check hittability (default: true) */
  checkHittable?: boolean;
  /** Maximum number of suggestions to return (default: 5) */
  maxSuggestions?: number;
  /** Minimum similarity score for suggestions (default: 30) */
  minSimilarity?: number;
}

// =============================================================================
// Main Validation Functions
// =============================================================================

/**
 * Validate that a target exists in the UI tree and can be interacted with.
 *
 * @param target - The target to validate
 * @param uiTree - The UI tree to search
 * @param options - Validation options
 * @returns Validation result with element or suggestions
 */
export function validateTarget(
  target: ActionTarget,
  uiTree: ElementNode,
  options: ValidationOptions = {}
): ValidationResult {
  const {
    requireVisible = true,
    requireEnabled = true,
    checkHittable: shouldCheckHittable = true,
    maxSuggestions = 5,
    minSimilarity = 30,
  } = options;

  logger.debug(`${LOG_CONTEXT} Validating target: ${JSON.stringify(target)}`);

  // Find matching element
  const element = findElementByTarget(target, uiTree);

  if (!element) {
    // Target not found - suggest alternatives
    const suggestions = suggestAlternatives(target, uiTree, { maxSuggestions, minSimilarity });

    return {
      valid: false,
      reason: 'not_found',
      message: `Element not found: ${formatTarget(target)}`,
      suggestions,
    };
  }

  // Check visibility
  if (requireVisible && !element.isVisible) {
    return {
      valid: false,
      element,
      reason: 'not_visible',
      message: `Element "${formatTarget(target)}" exists but is not visible`,
      confidence: 100,
    };
  }

  // Check enabled state
  if (requireEnabled && !element.isEnabled) {
    return {
      valid: false,
      element,
      reason: 'not_enabled',
      message: `Element "${formatTarget(target)}" is disabled`,
      confidence: 100,
    };
  }

  // Check hittability
  if (shouldCheckHittable) {
    const hittability = checkHittable(element, uiTree);
    if (!hittability.hittable) {
      return {
        valid: false,
        element,
        reason: hittability.reason,
        message: hittability.message,
        confidence: 100,
      };
    }
  }

  logger.debug(`${LOG_CONTEXT} Target validated successfully: ${formatTarget(target)}`);

  return {
    valid: true,
    element,
    confidence: 100,
  };
}

/**
 * Suggest alternative targets that might match what the user intended.
 *
 * Uses multiple strategies:
 * - Fuzzy string matching on identifiers, labels, and text
 * - Similar element types
 * - Elements in the same screen region
 *
 * @param target - The original target that was not found
 * @param uiTree - The UI tree to search
 * @param options - Options for suggestion generation
 * @returns Array of suggested targets sorted by similarity
 */
export function suggestAlternatives(
  target: ActionTarget,
  uiTree: ElementNode,
  options: { maxSuggestions?: number; minSimilarity?: number } = {}
): SuggestedTarget[] {
  const { maxSuggestions = 5, minSimilarity = 30 } = options;

  logger.debug(`${LOG_CONTEXT} Generating suggestions for: ${formatTarget(target)}`);

  const suggestions: SuggestedTarget[] = [];
  const targetValue = target.value.toLowerCase();

  // Collect all elements
  const allElements: ElementNode[] = [];
  collectElements(uiTree, allElements);

  // Filter to only interactable elements (for most action types)
  const interactableElements = allElements.filter(
    (el) => el.isEnabled && el.isVisible && (el.isHittable || isInputElement(el.type))
  );

  for (const element of interactableElements) {
    let bestSimilarity = 0;
    let reason = '';

    // Strategy 1: Match by identifier
    if (element.identifier) {
      const similarity = calculateStringSimilarity(targetValue, element.identifier.toLowerCase());
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        reason = `Similar identifier: "${element.identifier}"`;
      }
    }

    // Strategy 2: Match by label
    if (element.label) {
      const similarity = calculateStringSimilarity(targetValue, element.label.toLowerCase());
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        reason = `Similar label: "${element.label}"`;
      }
    }

    // Strategy 3: Match by value/text
    if (element.value) {
      const similarity = calculateStringSimilarity(targetValue, element.value.toLowerCase());
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        reason = `Contains text: "${element.value}"`;
      }
    }

    // Strategy 4: Match by title
    if (element.title) {
      const similarity = calculateStringSimilarity(targetValue, element.title.toLowerCase());
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        reason = `Similar title: "${element.title}"`;
      }
    }

    // Strategy 5: Contains the search term
    const containsMatch = checkContainsMatch(element, targetValue);
    if (containsMatch.matches && containsMatch.similarity > bestSimilarity) {
      bestSimilarity = containsMatch.similarity;
      reason = containsMatch.reason;
    }

    // Strategy 6: Same element type filter (if specified)
    if (target.elementType) {
      if (element.type.toLowerCase() === target.elementType.toLowerCase()) {
        bestSimilarity = Math.min(100, bestSimilarity + 15);
        reason = reason || `Same type: ${element.type}`;
      }
    }

    // Only include if above minimum similarity
    if (bestSimilarity >= minSimilarity) {
      const suggestedTarget = createTargetForElement(element);
      if (suggestedTarget) {
        suggestions.push({
          target: suggestedTarget,
          element,
          similarity: Math.round(bestSimilarity),
          reason,
        });
      }
    }
  }

  // Sort by similarity (descending) and limit results
  return suggestions
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, maxSuggestions);
}

/**
 * Check if an element can receive tap events.
 *
 * Verifies:
 * - Element has non-zero size
 * - Element is visible
 * - Element is not obscured by other elements
 * - Element is within screen bounds
 *
 * @param element - The element to check
 * @param uiTree - The full UI tree (for obscured check)
 * @returns Hittability result with reason if not hittable
 */
export function checkHittable(
  element: ElementNode,
  uiTree: ElementNode
): HittabilityResult {
  const frame = element.frame;

  // Check if element exists
  if (!element.exists) {
    return {
      hittable: false,
      reason: 'not_found',
      message: 'Element does not exist in the hierarchy',
    };
  }

  // Check visibility
  if (!element.isVisible) {
    return {
      hittable: false,
      reason: 'not_visible',
      message: 'Element is not visible',
      position: frame,
      suggestedAction: 'Wait for the element to become visible or scroll it into view',
    };
  }

  // Check enabled state
  if (!element.isEnabled) {
    return {
      hittable: false,
      reason: 'not_enabled',
      message: 'Element is disabled and cannot receive taps',
      position: frame,
      suggestedAction: 'Wait for the element to become enabled or complete required preceding steps',
    };
  }

  // Check zero size
  if (frame.width === 0 || frame.height === 0) {
    return {
      hittable: false,
      reason: 'zero_size',
      message: 'Element has zero size (collapsed or hidden)',
      position: frame,
      suggestedAction: 'Wait for the element to load or expand',
    };
  }

  // Check if element reports itself as not hittable
  if (!element.isHittable) {
    // Some elements like text fields can receive focus even if not "hittable" in XCUITest terms
    if (isInputElement(element.type)) {
      return {
        hittable: true,
        message: 'Element can receive input (text field/search field)',
        position: frame,
      };
    }

    return {
      hittable: false,
      reason: 'not_hittable',
      message: 'Element is marked as not hittable by XCUITest',
      position: frame,
      suggestedAction: 'The element may be obscured by another view or be in a non-interactive state',
    };
  }

  // Check if off-screen (assuming typical iPhone screen dimensions)
  // This is a heuristic check - actual screen size varies by device
  const SCREEN_WIDTH = 430; // iPhone 15 Pro Max width
  const SCREEN_HEIGHT = 932; // iPhone 15 Pro Max height (approximate)

  if (frame.x + frame.width < 0 || frame.x > SCREEN_WIDTH ||
      frame.y + frame.height < 0 || frame.y > SCREEN_HEIGHT) {
    return {
      hittable: false,
      reason: 'off_screen',
      message: 'Element appears to be off-screen',
      position: frame,
      suggestedAction: `Scroll to bring the element into view (element at x:${Math.round(frame.x)}, y:${Math.round(frame.y)})`,
    };
  }

  // Check for obscuring elements (simplified check)
  const obscuringElement = findObscuringElement(element, uiTree);
  if (obscuringElement) {
    return {
      hittable: false,
      reason: 'obscured',
      message: `Element is obscured by ${formatElementForMessage(obscuringElement)}`,
      position: frame,
      suggestedAction: obscuringElement.type.toLowerCase().includes('alert')
        ? 'Dismiss the alert before interacting with this element'
        : 'Wait for the obscuring element to disappear or dismiss it first',
    };
  }

  return {
    hittable: true,
    message: 'Element is hittable',
    position: frame,
  };
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Validate a target for a specific action type.
 * Adjusts validation requirements based on the action.
 *
 * @param target - The target to validate
 * @param uiTree - The UI tree to search
 * @param actionType - The type of action being performed
 * @returns Validation result
 */
export function validateForAction(
  target: ActionTarget,
  uiTree: ElementNode,
  actionType: ActionType
): ValidationResult {
  const options: ValidationOptions = {
    requireVisible: true,
    requireEnabled: true,
    checkHittable: true,
  };

  // Adjust based on action type
  switch (actionType) {
    case 'waitForElement':
    case 'assertExists':
      // These actions just check existence, don't require enabled/hittable
      options.requireEnabled = false;
      options.checkHittable = false;
      break;
    case 'waitForNotExist':
    case 'assertNotExists':
      // For "not exist" checks, we actually want to NOT find the element
      // Return valid if element is not found
      const element = findElementByTarget(target, uiTree);
      if (!element) {
        return { valid: true };
      }
      return {
        valid: false,
        element,
        reason: 'not_found', // Misleading but this signals failure for assertNotExists
        message: `Element "${formatTarget(target)}" still exists`,
      };
    case 'assertDisabled':
      // Want to find the element but confirm it's disabled
      options.requireEnabled = false;
      options.checkHittable = false;
      break;
  }

  return validateTarget(target, uiTree, options);
}

/**
 * Quick check if a target exists (without full validation).
 *
 * @param target - The target to check
 * @param uiTree - The UI tree to search
 * @returns True if target exists
 */
export function targetExists(target: ActionTarget, uiTree: ElementNode): boolean {
  return findElementByTarget(target, uiTree) !== null;
}

/**
 * Get the center point of an element for tap actions.
 *
 * @param element - The element to get center for
 * @returns Center coordinates or null if element has zero size
 */
export function getElementCenter(element: ElementNode): { x: number; y: number } | null {
  const frame = element.frame;

  if (frame.width === 0 || frame.height === 0) {
    return null;
  }

  return {
    x: Math.round(frame.x + frame.width / 2),
    y: Math.round(frame.y + frame.height / 2),
  };
}

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Find an element in the UI tree matching the target.
 */
function findElementByTarget(target: ActionTarget, root: ElementNode): ElementNode | null {
  const elements: ElementNode[] = [];
  collectElements(root, elements);

  switch (target.type) {
    case 'identifier':
      return elements.find((el) => el.identifier === target.value) || null;

    case 'label':
      return elements.find((el) => el.label === target.value) || null;

    case 'text':
      return elements.find((el) =>
        el.value === target.value ||
        el.label === target.value ||
        el.title === target.value
      ) || null;

    case 'predicate':
      // Simplified predicate matching (supports basic patterns)
      return matchByPredicate(elements, target.value);

    case 'coordinates':
      // Find element at specific coordinates
      const [x, y] = target.value.split(',').map(Number);
      return findElementAtPoint(root, x, y);

    case 'type':
      const matches = elements.filter(
        (el) => el.type.toLowerCase() === target.value.toLowerCase()
      );
      const index = target.index ?? 0;
      return matches[index] || null;

    default:
      return null;
  }
}

/**
 * Collect all elements from the tree into a flat array.
 */
function collectElements(root: ElementNode, elements: ElementNode[]): void {
  elements.push(root);
  for (const child of root.children) {
    collectElements(child, elements);
  }
}

/**
 * Find element at specific screen coordinates.
 */
function findElementAtPoint(root: ElementNode, x: number, y: number): ElementNode | null {
  // Collect all elements that contain the point
  const candidates: { element: ElementNode; area: number }[] = [];

  function traverse(element: ElementNode) {
    const frame = element.frame;
    if (x >= frame.x && x <= frame.x + frame.width &&
        y >= frame.y && y <= frame.y + frame.height) {
      candidates.push({
        element,
        area: frame.width * frame.height,
      });
    }
    for (const child of element.children) {
      traverse(child);
    }
  }

  traverse(root);

  // Return the smallest element containing the point (most specific)
  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => a.area - b.area);
  return candidates[0].element;
}

/**
 * Match elements using a simplified predicate string.
 * Supports: label CONTAINS "x", identifier == "x", type == "x"
 */
function matchByPredicate(elements: ElementNode[], predicate: string): ElementNode | null {
  const loweredPredicate = predicate.toLowerCase();

  // Parse common predicate patterns
  const containsMatch = loweredPredicate.match(/(\w+)\s+contains\s+["']([^"']+)["']/i);
  if (containsMatch) {
    const [, field, value] = containsMatch;
    const lowerValue = value.toLowerCase();

    for (const el of elements) {
      const fieldValue = getFieldValue(el, field);
      if (fieldValue && fieldValue.toLowerCase().includes(lowerValue)) {
        return el;
      }
    }
    return null;
  }

  const equalsMatch = loweredPredicate.match(/(\w+)\s*==\s*["']([^"']+)["']/i);
  if (equalsMatch) {
    const [, field, value] = equalsMatch;
    const lowerValue = value.toLowerCase();

    for (const el of elements) {
      const fieldValue = getFieldValue(el, field);
      if (fieldValue && fieldValue.toLowerCase() === lowerValue) {
        return el;
      }
    }
    return null;
  }

  return null;
}

/**
 * Get a field value from an element by field name.
 */
function getFieldValue(element: ElementNode, field: string): string | undefined {
  const fieldLower = field.toLowerCase();
  switch (fieldLower) {
    case 'label':
      return element.label;
    case 'identifier':
      return element.identifier;
    case 'value':
      return element.value;
    case 'type':
      return element.type;
    case 'title':
      return element.title;
    case 'hint':
      return element.hint;
    default:
      return undefined;
  }
}

/**
 * Calculate similarity between two strings using Levenshtein distance.
 */
function calculateStringSimilarity(a: string, b: string): number {
  if (a === b) return 100;
  if (a.length === 0 || b.length === 0) return 0;

  // Check for containment (strong match)
  if (a.includes(b) || b.includes(a)) {
    const shorter = Math.min(a.length, b.length);
    const longer = Math.max(a.length, b.length);
    return Math.round((shorter / longer) * 100);
  }

  // Levenshtein distance
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  const maxLen = Math.max(a.length, b.length);
  const distance = matrix[b.length][a.length];
  return Math.round(((maxLen - distance) / maxLen) * 100);
}

/**
 * Check if element contains the target value anywhere.
 */
function checkContainsMatch(
  element: ElementNode,
  targetValue: string
): { matches: boolean; similarity: number; reason: string } {
  const fields = [
    { name: 'identifier', value: element.identifier },
    { name: 'label', value: element.label },
    { name: 'value', value: element.value },
    { name: 'title', value: element.title },
    { name: 'hint', value: element.hint },
  ];

  for (const field of fields) {
    if (field.value && field.value.toLowerCase().includes(targetValue)) {
      // Calculate similarity based on how much of the field is the target
      const similarity = (targetValue.length / field.value.length) * 80 + 20;
      return {
        matches: true,
        similarity: Math.min(95, similarity),
        reason: `${field.name} contains "${targetValue}"`,
      };
    }
  }

  return { matches: false, similarity: 0, reason: '' };
}

/**
 * Create an ActionTarget for an element (preferring identifier > label > coordinates).
 */
function createTargetForElement(element: ElementNode): ActionTarget | null {
  if (element.identifier) {
    return { type: 'identifier', value: element.identifier };
  }

  if (element.label) {
    return { type: 'label', value: element.label };
  }

  if (element.title) {
    return { type: 'text', value: element.title };
  }

  if (element.value) {
    return { type: 'text', value: element.value };
  }

  // Fall back to coordinates
  if (element.frame.width > 0 && element.frame.height > 0) {
    const centerX = Math.round(element.frame.x + element.frame.width / 2);
    const centerY = Math.round(element.frame.y + element.frame.height / 2);
    return { type: 'coordinates', value: `${centerX},${centerY}` };
  }

  return null;
}

/**
 * Find any element that might be obscuring the target element.
 * Checks for alerts, modals, overlays, etc.
 */
function findObscuringElement(target: ElementNode, root: ElementNode): ElementNode | null {
  const targetFrame = target.frame;
  const targetCenter = {
    x: targetFrame.x + targetFrame.width / 2,
    y: targetFrame.y + targetFrame.height / 2,
  };

  // Element types that commonly obscure other elements
  const overlayTypes = ['alert', 'sheet', 'popover', 'dialog', 'overlay', 'modal'];

  const candidates: { element: ElementNode; zIndex: number }[] = [];

  function traverse(element: ElementNode, depth: number) {
    // Skip the target element itself
    if (element === target) return;

    const frame = element.frame;
    const typeLower = element.type.toLowerCase();

    // Check if this element overlaps the target
    const overlaps = frameContainsPoint(frame, targetCenter.x, targetCenter.y);

    if (overlaps && element.isVisible && frame.width > 0 && frame.height > 0) {
      // Check if it's a known overlay type
      const isOverlay = overlayTypes.some((t) => typeLower.includes(t));

      // Check if it's positioned above the target (higher in hierarchy often means on top)
      // This is a heuristic - true z-order would need XCUITest isHittable checks
      if (isOverlay) {
        candidates.push({ element, zIndex: depth + 1000 });
      }
    }

    for (let i = 0; i < element.children.length; i++) {
      traverse(element.children[i], depth + 1);
    }
  }

  traverse(root, 0);

  // Return the highest z-index obscuring element
  if (candidates.length > 0) {
    candidates.sort((a, b) => b.zIndex - a.zIndex);
    return candidates[0].element;
  }

  return null;
}

/**
 * Check if a frame contains a point.
 */
function frameContainsPoint(frame: ElementNode['frame'], x: number, y: number): boolean {
  return x >= frame.x && x <= frame.x + frame.width &&
         y >= frame.y && y <= frame.y + frame.height;
}

/**
 * Check if element type is an input element.
 */
function isInputElement(type: string): boolean {
  const inputTypes = ['textfield', 'securetextfield', 'searchfield', 'texteditor', 'textarea'];
  return inputTypes.includes(type.toLowerCase());
}

/**
 * Format a target for display in messages.
 */
function formatTarget(target: ActionTarget): string {
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
      return target.index !== undefined
        ? `${target.value}[${target.index}]`
        : target.value;
    default:
      return target.value;
  }
}

/**
 * Format an element for display in messages.
 */
function formatElementForMessage(element: ElementNode): string {
  if (element.identifier) {
    return `${element.type} (#${element.identifier})`;
  }
  if (element.label) {
    return `${element.type} ("${element.label}")`;
  }
  return element.type;
}
