/**
 * Tests for iOS Tools - Interaction Error Handling
 */

import {
  InteractionErrorCode,
  InteractionError,
  mapNotHittableReasonToCode,
  mapActionStatusToCode,
  INTERACTION_ERROR_MESSAGES,
  createElementNotFoundError,
  createElementNotHittableError,
  createMaestroNotInstalledError,
  createFlowTimeoutError,
  createAppCrashedError,
  createErrorFromActionResult,
  createErrorFromValidationResult,
  formatInteractionError,
  formatInteractionErrorAsJson,
  formatInteractionErrorCompact,
  formatTarget,
  createIOSResultFromError,
  hasElementSuggestions,
  getBestSuggestion,
} from '../../../main/ios-tools/interaction-errors';
import { ActionTarget, ActionResult, ActionStatus } from '../../../main/ios-tools/native-driver';
import { NotHittableReason, ValidationResult, SuggestedTarget, HittabilityResult } from '../../../main/ios-tools/action-validator';
import { ElementNode } from '../../../main/ios-tools/inspect';

describe('Interaction Error Handling', () => {
  // ==========================================================================
  // Error Code Mapping
  // ==========================================================================

  describe('mapNotHittableReasonToCode', () => {
    const testCases: Array<{ reason: NotHittableReason; expected: InteractionErrorCode }> = [
      { reason: 'not_found', expected: 'ELEMENT_NOT_FOUND' },
      { reason: 'not_visible', expected: 'ELEMENT_NOT_VISIBLE' },
      { reason: 'not_enabled', expected: 'ELEMENT_NOT_ENABLED' },
      { reason: 'zero_size', expected: 'ELEMENT_ZERO_SIZE' },
      { reason: 'obscured', expected: 'ELEMENT_OBSCURED' },
      { reason: 'off_screen', expected: 'ELEMENT_OFF_SCREEN' },
      { reason: 'not_hittable', expected: 'ELEMENT_NOT_HITTABLE' },
    ];

    testCases.forEach(({ reason, expected }) => {
      it(`maps "${reason}" to "${expected}"`, () => {
        expect(mapNotHittableReasonToCode(reason)).toBe(expected);
      });
    });
  });

  describe('mapActionStatusToCode', () => {
    const testCases: Array<{ status: ActionStatus; expected: InteractionErrorCode }> = [
      { status: 'notFound', expected: 'ELEMENT_NOT_FOUND' },
      { status: 'notHittable', expected: 'ELEMENT_NOT_HITTABLE' },
      { status: 'notEnabled', expected: 'ELEMENT_NOT_ENABLED' },
      { status: 'timeout', expected: 'INTERACTION_TIMEOUT' },
      { status: 'failed', expected: 'UNKNOWN_ERROR' },
      { status: 'error', expected: 'UNKNOWN_ERROR' },
    ];

    testCases.forEach(({ status, expected }) => {
      it(`maps "${status}" to "${expected}"`, () => {
        expect(mapActionStatusToCode(status)).toBe(expected);
      });
    });
  });

  // ==========================================================================
  // Error Messages
  // ==========================================================================

  describe('INTERACTION_ERROR_MESSAGES', () => {
    it('has all required error codes', () => {
      const requiredCodes: InteractionErrorCode[] = [
        'ELEMENT_NOT_FOUND',
        'ELEMENT_NOT_HITTABLE',
        'ELEMENT_NOT_VISIBLE',
        'ELEMENT_NOT_ENABLED',
        'ELEMENT_OBSCURED',
        'ELEMENT_OFF_SCREEN',
        'ELEMENT_ZERO_SIZE',
        'MAESTRO_NOT_INSTALLED',
        'FLOW_TIMEOUT',
        'FLOW_VALIDATION_FAILED',
        'APP_CRASHED',
        'APP_NOT_RUNNING',
        'SCREENSHOT_FAILED',
        'SIMULATOR_NOT_BOOTED',
        'INTERACTION_TIMEOUT',
        'UNKNOWN_ERROR',
      ];

      requiredCodes.forEach((code) => {
        expect(INTERACTION_ERROR_MESSAGES[code]).toBeDefined();
        expect(INTERACTION_ERROR_MESSAGES[code].title).toBeDefined();
        expect(INTERACTION_ERROR_MESSAGES[code].hint).toBeDefined();
      });
    });

    it('has install instructions for MAESTRO_NOT_INSTALLED', () => {
      const hint = INTERACTION_ERROR_MESSAGES.MAESTRO_NOT_INSTALLED.hint;
      expect(hint).toContain('brew');
      expect(hint).toContain('maestro');
    });
  });

  // ==========================================================================
  // Error Creation Functions
  // ==========================================================================

  describe('createElementNotFoundError', () => {
    const target: ActionTarget = { type: 'identifier', value: 'login_button' };

    it('creates error with correct code and message', () => {
      const error = createElementNotFoundError(target);

      expect(error.code).toBe('ELEMENT_NOT_FOUND');
      expect(error.title).toBe('Element not found');
      expect(error.message).toContain('#login_button');
      expect(error.target).toEqual(target);
    });

    it('creates error without suggestions when no UI tree provided', () => {
      const error = createElementNotFoundError(target);

      expect(error.suggestions).toBeUndefined();
    });

    it('generates suggestions when UI tree is provided', () => {
      const uiTree: ElementNode = {
        type: 'Window',
        identifier: 'main_window',
        label: undefined,
        value: undefined,
        title: undefined,
        hint: undefined,
        placeholder: undefined,
        frame: { x: 0, y: 0, width: 390, height: 844 },
        isEnabled: true,
        isVisible: true,
        isHittable: true,
        exists: true,
        children: [
          {
            type: 'Button',
            identifier: 'signin_button',
            label: 'Sign In',
            value: undefined,
            title: undefined,
            hint: undefined,
            placeholder: undefined,
            frame: { x: 100, y: 200, width: 100, height: 44 },
            isEnabled: true,
            isVisible: true,
            isHittable: true,
            exists: true,
            children: [],
          },
          {
            type: 'Button',
            identifier: 'logout_button',
            label: 'Log Out',
            value: undefined,
            title: undefined,
            hint: undefined,
            placeholder: undefined,
            frame: { x: 100, y: 300, width: 100, height: 44 },
            isEnabled: true,
            isVisible: true,
            isHittable: true,
            exists: true,
            children: [],
          },
        ],
      };

      const error = createElementNotFoundError(target, uiTree, { maxSuggestions: 3 });

      expect(error.suggestions).toBeDefined();
      // Should find similar elements (login vs signin/logout)
    });

    it('includes screenshot path when provided', () => {
      const error = createElementNotFoundError(target, undefined, {
        screenshotPath: '/path/to/screenshot.png',
      });

      expect(error.screenshotPath).toBe('/path/to/screenshot.png');
    });
  });

  describe('createElementNotHittableError', () => {
    const target: ActionTarget = { type: 'label', value: 'Submit' };

    it('creates error for obscured element', () => {
      const hittabilityResult: HittabilityResult = {
        hittable: false,
        reason: 'obscured',
        message: 'Element is obscured by Alert ("Error")',
        position: { x: 100, y: 200, width: 100, height: 44 },
        suggestedAction: 'Dismiss the alert before interacting with this element',
      };

      const error = createElementNotHittableError(target, hittabilityResult);

      expect(error.code).toBe('ELEMENT_OBSCURED');
      expect(error.message).toContain('obscured');
      expect(error.position).toEqual({ x: 100, y: 200, width: 100, height: 44 });
      expect(error.suggestedAction).toContain('Dismiss the alert');
    });

    it('creates error for off-screen element', () => {
      const hittabilityResult: HittabilityResult = {
        hittable: false,
        reason: 'off_screen',
        message: 'Element appears to be off-screen',
        position: { x: 0, y: 2000, width: 100, height: 44 },
        suggestedAction: 'Scroll to bring the element into view',
      };

      const error = createElementNotHittableError(target, hittabilityResult);

      expect(error.code).toBe('ELEMENT_OFF_SCREEN');
      expect(error.position?.y).toBe(2000);
    });
  });

  describe('createMaestroNotInstalledError', () => {
    it('creates error with default install instructions', () => {
      const error = createMaestroNotInstalledError();

      expect(error.code).toBe('MAESTRO_NOT_INSTALLED');
      expect(error.hint).toContain('brew');
      expect(error.hint).toContain('maestro');
    });

    it('uses custom install instructions when provided', () => {
      const customInstructions = 'Install from https://example.com/install';
      const error = createMaestroNotInstalledError(customInstructions);

      expect(error.hint).toBe(customInstructions);
    });
  });

  describe('createFlowTimeoutError', () => {
    it('creates error with flow path and timeout', () => {
      const error = createFlowTimeoutError('login_flow.yaml', 30000);

      expect(error.code).toBe('FLOW_TIMEOUT');
      expect(error.message).toContain('login_flow.yaml');
      expect(error.message).toContain('30000ms');
    });

    it('suggests doubled timeout', () => {
      const error = createFlowTimeoutError('test.yaml', 10000);

      expect(error.suggestedAction).toContain('20000ms');
    });

    it('includes screenshot path', () => {
      const error = createFlowTimeoutError('test.yaml', 10000, '/path/screenshot.png');

      expect(error.screenshotPath).toBe('/path/screenshot.png');
    });
  });

  describe('createAppCrashedError', () => {
    it('creates error with bundle ID', () => {
      const error = createAppCrashedError('com.example.app');

      expect(error.code).toBe('APP_CRASHED');
      expect(error.message).toContain('com.example.app');
    });

    it('includes crash info when provided', () => {
      const error = createAppCrashedError('com.example.app', {
        type: 'EXC_BAD_ACCESS',
        message: 'Null pointer dereference',
      });

      expect(error.message).toContain('EXC_BAD_ACCESS');
      expect(error.message).toContain('Null pointer dereference');
    });
  });

  describe('createErrorFromActionResult', () => {
    it('creates error from notFound result', () => {
      const result: ActionResult = {
        success: false,
        status: 'notFound',
        actionType: 'tap',
        duration: 1000,
        error: 'Element not found: #button',
        timestamp: new Date().toISOString(),
      };

      const error = createErrorFromActionResult(result);

      expect(error.code).toBe('ELEMENT_NOT_FOUND');
    });

    it('creates error from timeout result', () => {
      const result: ActionResult = {
        success: false,
        status: 'timeout',
        actionType: 'waitForElement',
        duration: 10000,
        error: 'Timed out waiting for element',
        timestamp: new Date().toISOString(),
      };

      const error = createErrorFromActionResult(result);

      expect(error.code).toBe('INTERACTION_TIMEOUT');
    });

    it('includes suggestions from result details', () => {
      const result: ActionResult = {
        success: false,
        status: 'notFound',
        actionType: 'tap',
        duration: 1000,
        error: 'Element not found',
        details: {
          suggestions: ['#login_btn', '#signin_button'],
        },
        timestamp: new Date().toISOString(),
      };

      const error = createErrorFromActionResult(result);

      expect(error.suggestedAction).toContain('#login_btn');
    });
  });

  describe('createErrorFromValidationResult', () => {
    const target: ActionTarget = { type: 'identifier', value: 'test' };

    it('throws when result is valid', () => {
      const result: ValidationResult = { valid: true };

      expect(() => createErrorFromValidationResult(result, target)).toThrow();
    });

    it('creates error from invalid result', () => {
      const result: ValidationResult = {
        valid: false,
        reason: 'not_visible',
        message: 'Element is not visible',
      };

      const error = createErrorFromValidationResult(result, target);

      expect(error.code).toBe('ELEMENT_NOT_VISIBLE');
      expect(error.message).toBe('Element is not visible');
    });

    it('includes suggestions from validation result', () => {
      const suggestions: SuggestedTarget[] = [
        {
          target: { type: 'identifier', value: 'test_button' },
          element: {} as ElementNode,
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

      const error = createErrorFromValidationResult(result, target);

      expect(error.suggestions).toEqual(suggestions);
      expect(error.suggestedAction).toContain('#test_button');
    });
  });

  // ==========================================================================
  // Error Formatting
  // ==========================================================================

  describe('formatInteractionError', () => {
    it('formats error as markdown', () => {
      const error: InteractionError = {
        code: 'ELEMENT_NOT_FOUND',
        title: 'Element not found',
        message: 'Element not found: #login_button',
        hint: 'Use /ios.inspect to view available elements',
        target: { type: 'identifier', value: 'login_button' },
      };

      const formatted = formatInteractionError(error);

      expect(formatted).toContain('## ✗ Element not found');
      expect(formatted).toContain('**Target**: `#login_button`');
      expect(formatted).toContain('**Error**: Element not found: #login_button');
      expect(formatted).toContain('### Troubleshooting');
      expect(formatted).toContain('**Hint**:');
    });

    it('includes suggestions table', () => {
      const error: InteractionError = {
        code: 'ELEMENT_NOT_FOUND',
        title: 'Element not found',
        message: 'Element not found',
        hint: 'Check elements',
        suggestions: [
          {
            target: { type: 'identifier', value: 'signin_button' },
            element: {} as ElementNode,
            similarity: 80,
            reason: 'Similar identifier',
          },
        ],
      };

      const formatted = formatInteractionError(error);

      expect(formatted).toContain('### Similar Elements Found');
      expect(formatted).toContain('| Target | Similarity | Reason |');
      expect(formatted).toContain('#signin_button');
      expect(formatted).toContain('80%');
    });

    it('includes position info', () => {
      const error: InteractionError = {
        code: 'ELEMENT_OFF_SCREEN',
        title: 'Element is off-screen',
        message: 'Element is off-screen',
        hint: 'Scroll into view',
        position: { x: 100, y: 2000, width: 100, height: 44 },
      };

      const formatted = formatInteractionError(error);

      expect(formatted).toContain('**Position**: (100, 2000) 100×44');
    });

    it('includes screenshot path', () => {
      const error: InteractionError = {
        code: 'APP_CRASHED',
        title: 'App crashed',
        message: 'App crashed',
        hint: 'Check crash logs',
        screenshotPath: '/path/to/screenshot.png',
      };

      const formatted = formatInteractionError(error);

      expect(formatted).toContain('### Screenshot');
      expect(formatted).toContain('/path/to/screenshot.png');
    });
  });

  describe('formatInteractionErrorAsJson', () => {
    it('returns valid JSON', () => {
      const error: InteractionError = {
        code: 'ELEMENT_NOT_FOUND',
        title: 'Element not found',
        message: 'Element not found: #test',
        hint: 'Use /ios.inspect',
        target: { type: 'identifier', value: 'test' },
      };

      const json = formatInteractionErrorAsJson(error);
      const parsed = JSON.parse(json);

      expect(parsed.code).toBe('ELEMENT_NOT_FOUND');
      expect(parsed.title).toBe('Element not found');
      // Target is kept as object for programmatic use
      expect(parsed.target.type).toBe('identifier');
      expect(parsed.target.value).toBe('test');
    });

    it('formats suggestions as readable targets', () => {
      const error: InteractionError = {
        code: 'ELEMENT_NOT_FOUND',
        title: 'Element not found',
        message: 'Not found',
        hint: 'Check',
        suggestions: [
          {
            target: { type: 'label', value: 'Sign In' },
            element: {} as ElementNode,
            similarity: 90,
            reason: 'Similar label',
          },
        ],
      };

      const json = formatInteractionErrorAsJson(error);
      const parsed = JSON.parse(json);

      expect(parsed.suggestions[0].target).toBe('"Sign In"');
      expect(parsed.suggestions[0].similarity).toBe(90);
    });
  });

  describe('formatInteractionErrorCompact', () => {
    it('returns single-line message', () => {
      const error: InteractionError = {
        code: 'ELEMENT_NOT_FOUND',
        title: 'Element not found',
        message: 'Element not found: #button',
        hint: 'Check elements',
      };

      const compact = formatInteractionErrorCompact(error);

      expect(compact).toBe('Element not found: Element not found: #button');
      expect(compact.split('\n')).toHaveLength(1);
    });

    it('includes top suggestion', () => {
      const error: InteractionError = {
        code: 'ELEMENT_NOT_FOUND',
        title: 'Element not found',
        message: 'Element not found: #button',
        hint: 'Check elements',
        suggestions: [
          {
            target: { type: 'identifier', value: 'submit_button' },
            element: {} as ElementNode,
            similarity: 85,
            reason: 'Similar',
          },
        ],
      };

      const compact = formatInteractionErrorCompact(error);

      expect(compact).toContain('Did you mean: #submit_button?');
    });
  });

  // ==========================================================================
  // Utility Functions
  // ==========================================================================

  describe('formatTarget', () => {
    it('formats identifier target', () => {
      expect(formatTarget({ type: 'identifier', value: 'button' })).toBe('#button');
    });

    it('formats label target', () => {
      expect(formatTarget({ type: 'label', value: 'Sign In' })).toBe('"Sign In"');
    });

    it('formats text target', () => {
      expect(formatTarget({ type: 'text', value: 'Hello' })).toBe('text:"Hello"');
    });

    it('formats predicate target', () => {
      expect(formatTarget({ type: 'predicate', value: 'label CONTAINS "foo"' })).toBe(
        'predicate(label CONTAINS "foo")'
      );
    });

    it('formats coordinates target', () => {
      expect(formatTarget({ type: 'coordinates', value: '100,200' })).toBe('(100,200)');
    });

    it('formats type target without index', () => {
      expect(formatTarget({ type: 'type', value: 'Button' })).toBe('Button');
    });

    it('formats type target with index', () => {
      expect(formatTarget({ type: 'type', value: 'Button', index: 2 })).toBe('Button[2]');
    });
  });

  describe('createIOSResultFromError', () => {
    it('creates failure result', () => {
      const error: InteractionError = {
        code: 'ELEMENT_NOT_FOUND',
        title: 'Element not found',
        message: 'Element not found: #test',
        hint: 'Check elements',
      };

      const result = createIOSResultFromError(error);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('ELEMENT_NOT_FOUND');
      expect(result.error).toBeDefined();
    });
  });

  describe('hasElementSuggestions', () => {
    it('returns true for element not found with suggestions', () => {
      const error: InteractionError = {
        code: 'ELEMENT_NOT_FOUND',
        title: 'Element not found',
        message: 'Not found',
        hint: 'Check',
        suggestions: [
          {
            target: { type: 'identifier', value: 'test' },
            element: {} as ElementNode,
            similarity: 80,
            reason: 'Similar',
          },
        ],
      };

      expect(hasElementSuggestions(error)).toBe(true);
    });

    it('returns false for element not found without suggestions', () => {
      const error: InteractionError = {
        code: 'ELEMENT_NOT_FOUND',
        title: 'Element not found',
        message: 'Not found',
        hint: 'Check',
      };

      expect(hasElementSuggestions(error)).toBe(false);
    });

    it('returns false for other error types', () => {
      const error: InteractionError = {
        code: 'APP_CRASHED',
        title: 'App crashed',
        message: 'Crashed',
        hint: 'Check logs',
        suggestions: [
          {
            target: { type: 'identifier', value: 'test' },
            element: {} as ElementNode,
            similarity: 80,
            reason: 'Similar',
          },
        ],
      };

      expect(hasElementSuggestions(error)).toBe(false);
    });
  });

  describe('getBestSuggestion', () => {
    it('returns first suggestion (highest similarity)', () => {
      const error: InteractionError = {
        code: 'ELEMENT_NOT_FOUND',
        title: 'Element not found',
        message: 'Not found',
        hint: 'Check',
        suggestions: [
          {
            target: { type: 'identifier', value: 'best' },
            element: {} as ElementNode,
            similarity: 95,
            reason: 'Best match',
          },
          {
            target: { type: 'identifier', value: 'second' },
            element: {} as ElementNode,
            similarity: 80,
            reason: 'Second match',
          },
        ],
      };

      const best = getBestSuggestion(error);

      expect(best?.target.value).toBe('best');
      expect(best?.similarity).toBe(95);
    });

    it('returns undefined when no suggestions', () => {
      const error: InteractionError = {
        code: 'ELEMENT_NOT_FOUND',
        title: 'Element not found',
        message: 'Not found',
        hint: 'Check',
      };

      expect(getBestSuggestion(error)).toBeUndefined();
    });

    it('returns undefined for empty suggestions array', () => {
      const error: InteractionError = {
        code: 'ELEMENT_NOT_FOUND',
        title: 'Element not found',
        message: 'Not found',
        hint: 'Check',
        suggestions: [],
      };

      expect(getBestSuggestion(error)).toBeUndefined();
    });
  });
});
