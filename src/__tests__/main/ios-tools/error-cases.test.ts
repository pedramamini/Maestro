/**
 * Tests for iOS Tools - Error Cases (Missing Elements, Timeouts)
 *
 * This test file specifically covers error handling scenarios across
 * the iOS interaction tools for:
 * 1. Missing/not found elements
 * 2. Timeout scenarios
 * 3. Element validation failures
 * 4. Flow execution errors
 *
 * These tests verify that error messages are helpful and include
 * suggestions for resolving the issues.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock logger
vi.mock('../../../main/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// =============================================================================
// Imports
// =============================================================================

import {
  createElementNotFoundError,
  createFlowTimeoutError,
  createElementNotHittableError,
  createMaestroNotInstalledError,
  createAppCrashedError,
  createErrorFromActionResult,
  createErrorFromValidationResult,
  formatInteractionError,
  formatInteractionErrorCompact,
  InteractionError,
  InteractionErrorCode,
} from '../../../main/ios-tools/interaction-errors';

import {
  validateTarget,
  suggestAlternatives,
  checkHittable,
  validateForAction,
  HittabilityResult,
  ValidationResult,
} from '../../../main/ios-tools/action-validator';

import {
  ActionTarget,
  ActionResult,
  ActionStatus,
} from '../../../main/ios-tools/native-driver';

import { ElementNode } from '../../../main/ios-tools/inspect';

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Create a simple ElementNode for testing
 */
function createTestElement(overrides: Partial<ElementNode> = {}): ElementNode {
  return {
    type: 'button',
    identifier: undefined,
    label: undefined,
    value: undefined,
    title: undefined,
    hint: undefined,
    placeholder: undefined,
    frame: { x: 100, y: 100, width: 100, height: 44 },
    isEnabled: true,
    isVisible: true,
    isHittable: true,
    exists: true,
    children: [],
    ...overrides,
  };
}

/**
 * Create a realistic UI tree for testing element not found scenarios
 */
function createTestUITree(): ElementNode {
  return createTestElement({
    type: 'application',
    identifier: 'root',
    frame: { x: 0, y: 0, width: 430, height: 932 },
    children: [
      createTestElement({
        type: 'navigationBar',
        identifier: 'nav-bar',
        label: 'Navigation',
        frame: { x: 0, y: 0, width: 430, height: 88 },
        children: [
          createTestElement({
            type: 'button',
            identifier: 'back-button',
            label: 'Back',
            frame: { x: 8, y: 44, width: 44, height: 44 },
          }),
          createTestElement({
            type: 'staticText',
            identifier: 'title-text',
            label: 'Settings',
            value: 'Settings',
            frame: { x: 150, y: 44, width: 130, height: 44 },
          }),
        ],
      }),
      createTestElement({
        type: 'scrollView',
        identifier: 'main-scroll',
        frame: { x: 0, y: 88, width: 430, height: 844 },
        children: [
          createTestElement({
            type: 'button',
            identifier: 'login-button',
            label: 'Log In',
            frame: { x: 100, y: 200, width: 230, height: 50 },
          }),
          createTestElement({
            type: 'button',
            identifier: 'signin-button',
            label: 'Sign In',
            frame: { x: 100, y: 270, width: 230, height: 50 },
          }),
          createTestElement({
            type: 'textField',
            identifier: 'email-field',
            label: 'Email',
            placeholder: 'Enter your email',
            frame: { x: 20, y: 350, width: 390, height: 44 },
          }),
          createTestElement({
            type: 'button',
            identifier: 'disabled-submit',
            label: 'Submit',
            isEnabled: false,
            frame: { x: 100, y: 500, width: 230, height: 50 },
          }),
          createTestElement({
            type: 'button',
            identifier: 'offscreen-button',
            label: 'Hidden Below',
            frame: { x: 100, y: 2000, width: 230, height: 50 },
          }),
        ],
      }),
    ],
  });
}

// =============================================================================
// Element Not Found Error Cases
// =============================================================================

describe('Element Not Found Error Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('basic element not found', () => {
    it('creates clear error for missing identifier', () => {
      const target: ActionTarget = { type: 'identifier', value: 'nonexistent-button' };
      const error = createElementNotFoundError(target);

      expect(error.code).toBe('ELEMENT_NOT_FOUND');
      expect(error.title).toBe('Element not found');
      expect(error.message).toContain('#nonexistent-button');
      expect(error.hint).toContain('/ios.inspect');
    });

    it('creates clear error for missing label', () => {
      const target: ActionTarget = { type: 'label', value: 'Submit Form' };
      const error = createElementNotFoundError(target);

      expect(error.message).toContain('"Submit Form"');
    });

    it('creates clear error for coordinates with no element', () => {
      const target: ActionTarget = { type: 'coordinates', value: '500,2000' };
      const error = createElementNotFoundError(target);

      expect(error.message).toContain('(500,2000)');
    });
  });

  describe('element not found with suggestions', () => {
    it('suggests similar elements when UI tree is provided', () => {
      const target: ActionTarget = { type: 'identifier', value: 'login' };
      const uiTree = createTestUITree();

      const error = createElementNotFoundError(target, uiTree);

      expect(error.suggestions).toBeDefined();
      expect(error.suggestions!.length).toBeGreaterThan(0);
      // Should suggest login-button as it's similar to 'login'
      const hasLoginSuggestion = error.suggestions!.some(
        (s) => s.target.value === 'login-button'
      );
      expect(hasLoginSuggestion).toBe(true);
    });

    it('suggests elements with matching partial identifiers', () => {
      const target: ActionTarget = { type: 'identifier', value: 'button' };
      const uiTree = createTestUITree();

      const error = createElementNotFoundError(target, uiTree);

      expect(error.suggestions).toBeDefined();
      // Should find multiple button elements
      const buttonSuggestions = error.suggestions!.filter(
        (s) => s.target.value?.includes('button')
      );
      expect(buttonSuggestions.length).toBeGreaterThan(0);
    });

    it('provides helpful suggestedAction when suggestions exist', () => {
      const target: ActionTarget = { type: 'identifier', value: 'login' };
      const uiTree = createTestUITree();

      const error = createElementNotFoundError(target, uiTree);

      expect(error.suggestedAction).toBeDefined();
      expect(error.suggestedAction).toContain('Try one of these');
    });

    it('falls back to ios.inspect hint when no suggestions', () => {
      const target: ActionTarget = { type: 'identifier', value: 'xyz123' };
      // Empty UI tree with no matching elements
      const emptyTree = createTestElement({
        type: 'application',
        children: [],
      });

      const error = createElementNotFoundError(target, emptyTree);

      expect(error.suggestedAction).toContain('/ios.inspect');
    });

    it('limits suggestions to specified max', () => {
      const target: ActionTarget = { type: 'identifier', value: 'button' };
      const uiTree = createTestUITree();

      const error = createElementNotFoundError(target, uiTree, { maxSuggestions: 2 });

      expect(error.suggestions).toBeDefined();
      expect(error.suggestions!.length).toBeLessThanOrEqual(2);
    });
  });

  describe('formatted error output', () => {
    it('formats element not found as readable markdown', () => {
      const target: ActionTarget = { type: 'identifier', value: 'missing-element' };
      const uiTree = createTestUITree();
      const error = createElementNotFoundError(target, uiTree);

      const formatted = formatInteractionError(error);

      expect(formatted).toContain('## ✗ Element not found');
      expect(formatted).toContain('**Target**: `#missing-element`');
      expect(formatted).toContain('### Troubleshooting');
      expect(formatted).toContain('**Hint**:');
    });

    it('includes suggestions table when available', () => {
      const target: ActionTarget = { type: 'identifier', value: 'login' };
      const uiTree = createTestUITree();
      const error = createElementNotFoundError(target, uiTree);

      const formatted = formatInteractionError(error);

      expect(formatted).toContain('### Similar Elements Found');
      expect(formatted).toContain('| Target | Similarity | Reason |');
    });

    it('formats compact error with top suggestion', () => {
      const target: ActionTarget = { type: 'identifier', value: 'login' };
      const uiTree = createTestUITree();
      const error = createElementNotFoundError(target, uiTree);

      const compact = formatInteractionErrorCompact(error);

      expect(compact.split('\n')).toHaveLength(1);
      expect(compact).toContain('Did you mean:');
    });
  });

  describe('validateTarget not found scenarios', () => {
    it('returns not_found reason with suggestions', () => {
      const target: ActionTarget = { type: 'identifier', value: 'nonexistent' };
      const uiTree = createTestUITree();

      const result = validateTarget(target, uiTree);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('not_found');
      expect(result.suggestions).toBeDefined();
      expect(result.message).toContain('not found');
    });

    it('returns appropriate suggestions for typos', () => {
      const target: ActionTarget = { type: 'identifier', value: 'logn-button' }; // typo: logn instead of login
      const uiTree = createTestUITree();

      const result = validateTarget(target, uiTree);

      expect(result.valid).toBe(false);
      // Should suggest login-button due to high similarity
      const hasLoginSuggestion = result.suggestions?.some(
        (s) => s.element.identifier === 'login-button'
      );
      expect(hasLoginSuggestion).toBe(true);
    });

    it('suggests by label when identifier search fails', () => {
      const target: ActionTarget = { type: 'label', value: 'Sign' }; // Partial match
      const uiTree = createTestUITree();

      const result = validateTarget(target, uiTree);

      // Should find "Sign In" button
      expect(result.valid).toBe(false);
      const hasSignInSuggestion = result.suggestions?.some(
        (s) => s.element.label === 'Sign In'
      );
      expect(hasSignInSuggestion).toBe(true);
    });
  });
});

// =============================================================================
// Timeout Error Cases
// =============================================================================

describe('Timeout Error Cases', () => {
  describe('flow timeout errors', () => {
    it('creates clear timeout error with flow path and duration', () => {
      const error = createFlowTimeoutError('login_flow.yaml', 30000);

      expect(error.code).toBe('FLOW_TIMEOUT');
      expect(error.title).toBe('Flow execution timed out');
      expect(error.message).toContain('login_flow.yaml');
      expect(error.message).toContain('30000ms');
    });

    it('suggests doubled timeout as resolution', () => {
      const error = createFlowTimeoutError('test.yaml', 10000);

      expect(error.suggestedAction).toContain('20000ms');
    });

    it('suggests splitting flow into smaller steps', () => {
      const error = createFlowTimeoutError('long_flow.yaml', 60000);

      expect(error.hint).toContain('smaller steps');
    });

    it('includes screenshot path when provided', () => {
      const error = createFlowTimeoutError('test.yaml', 10000, '/path/to/timeout-screenshot.png');

      expect(error.screenshotPath).toBe('/path/to/timeout-screenshot.png');
    });
  });

  describe('interaction timeout via ActionResult', () => {
    it('creates timeout error from action result', () => {
      const result: ActionResult = {
        success: false,
        status: 'timeout',
        actionType: 'waitForElement',
        duration: 10000,
        error: 'Timed out waiting for element #login-button',
        timestamp: new Date().toISOString(),
      };

      const error = createErrorFromActionResult(result);

      expect(error.code).toBe('INTERACTION_TIMEOUT');
      expect(error.title).toBe('Interaction timed out');
      expect(error.message).toContain('waiting for element');
    });

    it('provides helpful timeout hint', () => {
      const result: ActionResult = {
        success: false,
        status: 'timeout',
        actionType: 'tap',
        duration: 5000,
        error: 'Element did not appear',
        timestamp: new Date().toISOString(),
      };

      const error = createErrorFromActionResult(result);

      expect(error.hint).toContain('timeout');
    });
  });

  describe('formatted timeout output', () => {
    it('formats timeout error as readable markdown', () => {
      const error = createFlowTimeoutError('checkout_flow.yaml', 120000);

      const formatted = formatInteractionError(error);

      expect(formatted).toContain('## ✗ Flow execution timed out');
      expect(formatted).toContain('checkout_flow.yaml');
      expect(formatted).toContain('120000ms');
      expect(formatted).toContain('### Troubleshooting');
    });

    it('includes suggested action in formatted output', () => {
      const error = createFlowTimeoutError('slow.yaml', 30000);

      const formatted = formatInteractionError(error);

      expect(formatted).toContain('**Suggested Action**:');
      expect(formatted).toContain('60000ms');
    });
  });
});

// =============================================================================
// Element Validation Error Cases
// =============================================================================

describe('Element Validation Error Cases', () => {
  describe('disabled element errors', () => {
    it('reports element is disabled with helpful message', () => {
      const uiTree = createTestUITree();
      const target: ActionTarget = { type: 'identifier', value: 'disabled-submit' };

      const result = validateTarget(target, uiTree);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('not_enabled');
      expect(result.element).toBeDefined();
      expect(result.element?.isEnabled).toBe(false);
    });

    it('creates proper error from validation result for disabled element', () => {
      const validationResult: ValidationResult = {
        valid: false,
        reason: 'not_enabled',
        message: 'Element "Submit" is disabled',
      };
      const target: ActionTarget = { type: 'label', value: 'Submit' };

      const error = createErrorFromValidationResult(validationResult, target);

      expect(error.code).toBe('ELEMENT_NOT_ENABLED');
      expect(error.title).toBe('Element is disabled');
      expect(error.hint).toContain('preceding steps');
    });
  });

  describe('not visible element errors', () => {
    it('reports element is not visible', () => {
      const hiddenElement = createTestElement({
        type: 'button',
        identifier: 'hidden-button',
        isVisible: false,
      });
      const uiTree = createTestElement({
        type: 'application',
        children: [hiddenElement],
      });
      const target: ActionTarget = { type: 'identifier', value: 'hidden-button' };

      const result = validateTarget(target, uiTree);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('not_visible');
    });

    it('creates proper error with scroll suggestion for not visible', () => {
      const validationResult: ValidationResult = {
        valid: false,
        reason: 'not_visible',
        message: 'Element is not visible',
      };
      const target: ActionTarget = { type: 'identifier', value: 'hidden' };

      const error = createErrorFromValidationResult(validationResult, target);

      expect(error.code).toBe('ELEMENT_NOT_VISIBLE');
      expect(error.hint).toContain('scroll');
    });
  });

  describe('off-screen element errors', () => {
    it('detects off-screen elements', () => {
      const offscreenElement = createTestElement({
        type: 'button',
        identifier: 'far-below',
        frame: { x: 100, y: 2000, width: 100, height: 44 },
      });

      const result = checkHittable(offscreenElement, createTestUITree());

      expect(result.hittable).toBe(false);
      expect(result.reason).toBe('off_screen');
      expect(result.suggestedAction?.toLowerCase()).toContain('scroll');
    });

    it('creates proper off-screen error with position info', () => {
      const hittabilityResult: HittabilityResult = {
        hittable: false,
        reason: 'off_screen',
        message: 'Element appears to be off-screen',
        position: { x: 100, y: 2000, width: 100, height: 44 },
        suggestedAction: 'Scroll to bring element into view',
      };
      const target: ActionTarget = { type: 'identifier', value: 'far-below' };

      const error = createElementNotHittableError(target, hittabilityResult);

      expect(error.code).toBe('ELEMENT_OFF_SCREEN');
      expect(error.position).toEqual({ x: 100, y: 2000, width: 100, height: 44 });
    });
  });

  describe('obscured element errors', () => {
    it('detects elements obscured by alerts', () => {
      const uiTree = createTestElement({
        type: 'application',
        children: [
          createTestElement({
            type: 'button',
            identifier: 'submit',
            frame: { x: 100, y: 300, width: 200, height: 50 },
          }),
          createTestElement({
            type: 'alert',
            identifier: 'confirmation-alert',
            label: 'Confirm',
            frame: { x: 50, y: 200, width: 330, height: 200 },
          }),
        ],
      });

      const targetElement = createTestElement({
        type: 'button',
        identifier: 'submit',
        frame: { x: 100, y: 300, width: 200, height: 50 },
      });

      const result = checkHittable(targetElement, uiTree);

      expect(result.hittable).toBe(false);
      expect(result.reason).toBe('obscured');
      expect(result.message).toContain('alert');
    });

    it('creates proper obscured error with dismiss suggestion', () => {
      const hittabilityResult: HittabilityResult = {
        hittable: false,
        reason: 'obscured',
        message: 'Element is obscured by Alert ("Error")',
        position: { x: 100, y: 300, width: 200, height: 50 },
        suggestedAction: 'Dismiss the alert before interacting with this element',
      };
      const target: ActionTarget = { type: 'identifier', value: 'submit' };

      const error = createElementNotHittableError(target, hittabilityResult);

      expect(error.code).toBe('ELEMENT_OBSCURED');
      expect(error.suggestedAction).toContain('Dismiss');
    });
  });

  describe('zero-size element errors', () => {
    it('detects zero-size elements', () => {
      const zeroSizeElement = createTestElement({
        type: 'button',
        identifier: 'collapsed',
        frame: { x: 100, y: 100, width: 0, height: 0 },
      });

      const result = checkHittable(zeroSizeElement, createTestUITree());

      expect(result.hittable).toBe(false);
      expect(result.reason).toBe('zero_size');
    });

    it('creates proper zero-size error', () => {
      const hittabilityResult: HittabilityResult = {
        hittable: false,
        reason: 'zero_size',
        message: 'Element has zero size',
        position: { x: 100, y: 100, width: 0, height: 0 },
        suggestedAction: 'Wait for element to load',
      };
      const target: ActionTarget = { type: 'identifier', value: 'collapsed' };

      const error = createElementNotHittableError(target, hittabilityResult);

      expect(error.code).toBe('ELEMENT_ZERO_SIZE');
      expect(error.hint).toContain('collapsed');
    });
  });
});

// =============================================================================
// Tool Installation Error Cases
// =============================================================================

describe('Tool Installation Error Cases', () => {
  describe('Maestro not installed', () => {
    it('creates error with homebrew install instructions', () => {
      const error = createMaestroNotInstalledError();

      expect(error.code).toBe('MAESTRO_NOT_INSTALLED');
      expect(error.hint).toContain('brew tap mobile-dev-inc/tap');
      expect(error.hint).toContain('brew install maestro');
    });

    it('creates error with curl install instructions', () => {
      const error = createMaestroNotInstalledError();

      expect(error.hint).toContain('curl');
    });

    it('accepts custom installation instructions', () => {
      const customInstructions = 'Install via company internal portal: https://internal.example.com/maestro';
      const error = createMaestroNotInstalledError(customInstructions);

      expect(error.hint).toBe(customInstructions);
    });

    it('provides restart terminal suggestion', () => {
      const error = createMaestroNotInstalledError();

      expect(error.suggestedAction).toContain('restart');
    });
  });
});

// =============================================================================
// App Crash Error Cases
// =============================================================================

describe('App Crash Error Cases', () => {
  describe('basic crash errors', () => {
    it('creates error with bundle ID', () => {
      const error = createAppCrashedError('com.example.myapp');

      expect(error.code).toBe('APP_CRASHED');
      expect(error.message).toContain('com.example.myapp');
    });

    it('includes crash type when provided', () => {
      const error = createAppCrashedError('com.example.myapp', {
        type: 'EXC_BAD_ACCESS',
      });

      expect(error.message).toContain('EXC_BAD_ACCESS');
    });

    it('includes crash message when provided', () => {
      const error = createAppCrashedError('com.example.myapp', {
        type: 'SIGABRT',
        message: 'Null pointer dereference at 0x0',
      });

      expect(error.message).toContain('Null pointer dereference');
    });

    it('provides crash log suggestion', () => {
      const error = createAppCrashedError('com.example.myapp');

      expect(error.hint).toContain('crash logs');
    });

    it('includes screenshot path when provided', () => {
      const error = createAppCrashedError(
        'com.example.myapp',
        { type: 'SIGKILL' },
        '/path/to/crash-screenshot.png'
      );

      expect(error.screenshotPath).toBe('/path/to/crash-screenshot.png');
    });
  });
});

// =============================================================================
// ActionResult Error Conversion
// =============================================================================

describe('ActionResult Error Conversion', () => {
  describe('status to error code mapping', () => {
    const testCases: Array<{ status: ActionStatus; expectedCode: InteractionErrorCode }> = [
      { status: 'notFound', expectedCode: 'ELEMENT_NOT_FOUND' },
      { status: 'notHittable', expectedCode: 'ELEMENT_NOT_HITTABLE' },
      { status: 'notEnabled', expectedCode: 'ELEMENT_NOT_ENABLED' },
      { status: 'timeout', expectedCode: 'INTERACTION_TIMEOUT' },
      { status: 'failed', expectedCode: 'UNKNOWN_ERROR' },
      { status: 'error', expectedCode: 'UNKNOWN_ERROR' },
    ];

    testCases.forEach(({ status, expectedCode }) => {
      it(`maps ActionStatus "${status}" to "${expectedCode}"`, () => {
        const result: ActionResult = {
          success: false,
          status,
          actionType: 'tap',
          duration: 1000,
          error: `Action failed with status: ${status}`,
          timestamp: new Date().toISOString(),
        };

        const error = createErrorFromActionResult(result);

        expect(error.code).toBe(expectedCode);
      });
    });
  });

  describe('error message preservation', () => {
    it('preserves original error message from action result', () => {
      const result: ActionResult = {
        success: false,
        status: 'notFound',
        actionType: 'tap',
        duration: 500,
        error: 'Could not find element with identifier "login-button"',
        timestamp: new Date().toISOString(),
      };

      const error = createErrorFromActionResult(result);

      expect(error.message).toContain('login-button');
    });

    it('includes suggestions from action result details', () => {
      const result: ActionResult = {
        success: false,
        status: 'notFound',
        actionType: 'tap',
        duration: 500,
        error: 'Element not found',
        details: {
          suggestions: ['#signin-button', '#login-btn', '#submit'],
        },
        timestamp: new Date().toISOString(),
      };

      const error = createErrorFromActionResult(result);

      expect(error.suggestedAction).toContain('#signin-button');
    });

    it('includes screenshot path from action result details', () => {
      const result: ActionResult = {
        success: false,
        status: 'failed',
        actionType: 'tap',
        duration: 500,
        error: 'Tap failed',
        details: {
          screenshotPath: '/artifacts/failure.png',
        },
        timestamp: new Date().toISOString(),
      };

      const error = createErrorFromActionResult(result);

      expect(error.screenshotPath).toBe('/artifacts/failure.png');
    });
  });
});

// =============================================================================
// ValidationResult Error Conversion
// =============================================================================

describe('ValidationResult Error Conversion', () => {
  it('throws when trying to create error from valid result', () => {
    const validResult: ValidationResult = { valid: true };
    const target: ActionTarget = { type: 'identifier', value: 'test' };

    expect(() => createErrorFromValidationResult(validResult, target)).toThrow();
  });

  it('preserves suggestions from validation result', () => {
    const suggestions = [
      {
        target: { type: 'identifier' as const, value: 'login-button' },
        element: createTestElement({ identifier: 'login-button' }),
        similarity: 85,
        reason: 'Similar identifier',
      },
    ];

    const result: ValidationResult = {
      valid: false,
      reason: 'not_found',
      message: 'Element not found',
      suggestions,
    };
    const target: ActionTarget = { type: 'identifier', value: 'login' };

    const error = createErrorFromValidationResult(result, target);

    expect(error.suggestions).toEqual(suggestions);
  });

  it('generates suggested action from suggestions', () => {
    const suggestions = [
      {
        target: { type: 'identifier' as const, value: 'submit-button' },
        element: createTestElement({ identifier: 'submit-button' }),
        similarity: 90,
        reason: 'Similar',
      },
    ];

    const result: ValidationResult = {
      valid: false,
      reason: 'not_found',
      message: 'Not found',
      suggestions,
    };
    const target: ActionTarget = { type: 'identifier', value: 'submit' };

    const error = createErrorFromValidationResult(result, target);

    expect(error.suggestedAction).toContain('#submit-button');
  });
});

// =============================================================================
// Edge Cases and Boundary Conditions
// =============================================================================

describe('Edge Cases and Boundary Conditions', () => {
  describe('empty or null inputs', () => {
    it('handles empty identifier gracefully', () => {
      const target: ActionTarget = { type: 'identifier', value: '' };
      const error = createElementNotFoundError(target);

      expect(error.code).toBe('ELEMENT_NOT_FOUND');
      expect(error.message).toContain('#');
    });

    it('handles UI tree with no matching elements', () => {
      const target: ActionTarget = { type: 'identifier', value: 'very-specific-id-12345' };
      const emptyTree = createTestElement({
        type: 'application',
        identifier: 'root',
        children: [],
      });

      const error = createElementNotFoundError(target, emptyTree, { maxSuggestions: 5 });

      // Should still create error but with no or few suggestions
      expect(error.code).toBe('ELEMENT_NOT_FOUND');
    });
  });

  describe('special characters in targets', () => {
    it('handles identifier with special characters', () => {
      const target: ActionTarget = {
        type: 'identifier',
        value: 'button-with-dash_and_underscore.and.dots',
      };
      const error = createElementNotFoundError(target);

      expect(error.message).toContain('button-with-dash_and_underscore.and.dots');
    });

    it('handles label with unicode', () => {
      const target: ActionTarget = { type: 'label', value: '🚀 Launch App' };
      const error = createElementNotFoundError(target);

      expect(error.message).toContain('🚀 Launch App');
    });

    it('handles label with quotes', () => {
      const target: ActionTarget = { type: 'label', value: 'Click "Here"' };
      const error = createElementNotFoundError(target);

      expect(error.message).toContain('Click "Here"');
    });
  });

  describe('extreme timeout values', () => {
    it('handles very short timeout (1ms)', () => {
      const error = createFlowTimeoutError('quick.yaml', 1);

      expect(error.message).toContain('1ms');
      expect(error.suggestedAction).toContain('2ms');
    });

    it('handles very long timeout (10 minutes)', () => {
      const error = createFlowTimeoutError('long.yaml', 600000);

      expect(error.message).toContain('600000ms');
    });
  });

  describe('deeply nested UI trees', () => {
    it('finds elements in deeply nested structure', () => {
      const deepTree = createTestElement({
        type: 'view',
        children: [
          createTestElement({
            type: 'view',
            children: [
              createTestElement({
                type: 'view',
                children: [
                  createTestElement({
                    type: 'view',
                    children: [
                      createTestElement({
                        type: 'view',
                        children: [
                          createTestElement({
                            type: 'button',
                            identifier: 'deep-nested-button',
                            label: 'Deep Button',
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      });

      const target: ActionTarget = { type: 'identifier', value: 'deep-nested' };
      const result = validateTarget(target, deepTree);

      // Should not find exact match but should suggest the deep button
      expect(result.valid).toBe(false);
      const hasSuggestion = result.suggestions?.some(
        (s) => s.element.identifier === 'deep-nested-button'
      );
      expect(hasSuggestion).toBe(true);
    });
  });
});

// =============================================================================
// Error Message Quality
// =============================================================================

describe('Error Message Quality', () => {
  describe('actionable error messages', () => {
    it('element not found error suggests using /ios.inspect', () => {
      const target: ActionTarget = { type: 'identifier', value: 'missing' };
      const error = createElementNotFoundError(target);

      expect(error.hint).toContain('/ios.inspect');
    });

    it('timeout error suggests increasing timeout value', () => {
      const error = createFlowTimeoutError('test.yaml', 30000);

      expect(error.hint).toContain('timeout');
      expect(error.suggestedAction).toContain('60000ms');
    });

    it('off-screen error suggests scrolling', () => {
      const hittabilityResult: HittabilityResult = {
        hittable: false,
        reason: 'off_screen',
        message: 'Element is off-screen',
        position: { x: 0, y: 2000, width: 100, height: 44 },
        suggestedAction: 'Scroll to bring element into view',
      };
      const target: ActionTarget = { type: 'identifier', value: 'below' };

      const error = createElementNotHittableError(target, hittabilityResult);

      expect(error.hint.toLowerCase()).toContain('scroll');
    });

    it('disabled element error suggests completing prerequisites', () => {
      const hittabilityResult: HittabilityResult = {
        hittable: false,
        reason: 'not_enabled',
        message: 'Element is disabled',
        suggestedAction: 'Complete required fields first',
      };
      const target: ActionTarget = { type: 'identifier', value: 'submit' };

      const error = createElementNotHittableError(target, hittabilityResult);

      expect(error.hint).toContain('preceding steps');
    });
  });

  describe('formatted output readability', () => {
    it('produces well-structured markdown for complex errors', () => {
      const target: ActionTarget = { type: 'identifier', value: 'login' };
      const uiTree = createTestUITree();
      const error = createElementNotFoundError(target, uiTree);
      error.screenshotPath = '/path/to/screenshot.png';

      const formatted = formatInteractionError(error);

      // Should have clear sections
      expect(formatted).toContain('## ✗');
      expect(formatted).toContain('**Target**:');
      expect(formatted).toContain('**Error**:');
      expect(formatted).toContain('### Similar Elements Found');
      expect(formatted).toContain('### Troubleshooting');
      expect(formatted).toContain('### Screenshot');
    });

    it('compact format is single line', () => {
      const error: InteractionError = {
        code: 'ELEMENT_NOT_FOUND',
        title: 'Element not found',
        message: 'Could not find element',
        hint: 'Check elements',
      };

      const compact = formatInteractionErrorCompact(error);

      expect(compact.split('\n').length).toBe(1);
    });
  });
});
