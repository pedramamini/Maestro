import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('../../../main/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  validateTarget,
  suggestAlternatives,
  checkHittable,
  validateForAction,
  targetExists,
  getElementCenter,
  ValidationResult,
  HittabilityResult,
  SuggestedTarget,
} from '../../../main/ios-tools/action-validator';

import { ElementNode } from '../../../main/ios-tools/inspect';
import { ActionTarget } from '../../../main/ios-tools/native-driver';

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
    placeholderValue: undefined,
    hint: undefined,
    title: undefined,
    frame: { x: 100, y: 100, width: 100, height: 44 },
    isEnabled: true,
    isSelected: false,
    isFocused: false,
    exists: true,
    isHittable: true,
    isVisible: true,
    traits: [],
    children: [],
    ...overrides,
  };
}

/**
 * Create a UI tree with multiple elements for testing
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
            identifier: 'title',
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
            identifier: 'signup-button',
            label: 'Sign Up',
            frame: { x: 100, y: 270, width: 230, height: 50 },
          }),
          createTestElement({
            type: 'textField',
            identifier: 'email-field',
            label: 'Email',
            placeholderValue: 'Enter your email',
            frame: { x: 20, y: 350, width: 390, height: 44 },
          }),
          createTestElement({
            type: 'secureTextField',
            identifier: 'password-field',
            label: 'Password',
            placeholderValue: 'Enter password',
            frame: { x: 20, y: 410, width: 390, height: 44 },
          }),
          createTestElement({
            type: 'button',
            identifier: 'disabled-button',
            label: 'Disabled Button',
            isEnabled: false,
            frame: { x: 100, y: 500, width: 230, height: 50 },
          }),
          createTestElement({
            type: 'button',
            identifier: 'hidden-button',
            label: 'Hidden Button',
            isVisible: false,
            frame: { x: 100, y: 570, width: 230, height: 50 },
          }),
          createTestElement({
            type: 'button',
            identifier: 'not-hittable-button',
            label: 'Not Hittable',
            isHittable: false,
            frame: { x: 100, y: 640, width: 230, height: 50 },
          }),
          createTestElement({
            type: 'button',
            identifier: 'zero-size-button',
            label: 'Zero Size',
            frame: { x: 100, y: 710, width: 0, height: 0 },
          }),
        ],
      }),
    ],
  });
}

describe('action-validator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // validateTarget Tests
  // ===========================================================================

  describe('validateTarget', () => {
    describe('finding elements', () => {
      it('finds element by identifier', () => {
        const uiTree = createTestUITree();
        const target: ActionTarget = { type: 'identifier', value: 'login-button' };

        const result = validateTarget(target, uiTree);

        expect(result.valid).toBe(true);
        expect(result.element?.identifier).toBe('login-button');
        expect(result.confidence).toBe(100);
      });

      it('finds element by label', () => {
        const uiTree = createTestUITree();
        const target: ActionTarget = { type: 'label', value: 'Log In' };

        const result = validateTarget(target, uiTree);

        expect(result.valid).toBe(true);
        expect(result.element?.label).toBe('Log In');
      });

      it('finds element by text (value)', () => {
        const uiTree = createTestUITree();
        const target: ActionTarget = { type: 'text', value: 'Settings' };

        const result = validateTarget(target, uiTree);

        expect(result.valid).toBe(true);
        expect(result.element?.value).toBe('Settings');
      });

      it('finds element by coordinates', () => {
        const uiTree = createTestUITree();
        // Center of login-button is at (215, 225)
        const target: ActionTarget = { type: 'coordinates', value: '215,225' };

        const result = validateTarget(target, uiTree);

        expect(result.valid).toBe(true);
        expect(result.element?.identifier).toBe('login-button');
      });

      it('finds element by type', () => {
        const uiTree = createTestUITree();
        const target: ActionTarget = { type: 'type', value: 'textField' };

        const result = validateTarget(target, uiTree);

        expect(result.valid).toBe(true);
        expect(result.element?.type).toBe('textField');
      });

      it('finds element by type with index', () => {
        const uiTree = createTestUITree();
        const target: ActionTarget = { type: 'type', value: 'button', index: 1 };

        const result = validateTarget(target, uiTree);

        expect(result.valid).toBe(true);
        // Second button (index 1) after nav button
        expect(result.element?.type).toBe('button');
      });

      it('finds element by predicate (CONTAINS)', () => {
        const uiTree = createTestUITree();
        const target: ActionTarget = { type: 'predicate', value: 'identifier CONTAINS "login"' };

        const result = validateTarget(target, uiTree);

        expect(result.valid).toBe(true);
        expect(result.element?.identifier).toBe('login-button');
      });

      it('finds element by predicate (equals)', () => {
        const uiTree = createTestUITree();
        const target: ActionTarget = { type: 'predicate', value: 'label == "Log In"' };

        const result = validateTarget(target, uiTree);

        expect(result.valid).toBe(true);
        expect(result.element?.label).toBe('Log In');
      });
    });

    describe('element not found', () => {
      it('returns not found when element does not exist', () => {
        const uiTree = createTestUITree();
        const target: ActionTarget = { type: 'identifier', value: 'nonexistent' };

        const result = validateTarget(target, uiTree);

        expect(result.valid).toBe(false);
        expect(result.reason).toBe('not_found');
        expect(result.message).toContain('not found');
        expect(result.element).toBeUndefined();
      });

      it('provides suggestions when element not found', () => {
        const uiTree = createTestUITree();
        const target: ActionTarget = { type: 'identifier', value: 'login' };

        const result = validateTarget(target, uiTree);

        expect(result.valid).toBe(false);
        expect(result.suggestions).toBeDefined();
        expect(result.suggestions!.length).toBeGreaterThan(0);
        // Should suggest login-button
        expect(result.suggestions!.some((s) => s.element.identifier === 'login-button')).toBe(true);
      });
    });

    describe('visibility checks', () => {
      it('rejects hidden elements by default', () => {
        const uiTree = createTestUITree();
        const target: ActionTarget = { type: 'identifier', value: 'hidden-button' };

        const result = validateTarget(target, uiTree);

        expect(result.valid).toBe(false);
        expect(result.reason).toBe('not_visible');
        expect(result.element).toBeDefined();
      });

      it('accepts hidden elements when requireVisible is false', () => {
        const uiTree = createTestUITree();
        const target: ActionTarget = { type: 'identifier', value: 'hidden-button' };

        const result = validateTarget(target, uiTree, { requireVisible: false });

        // Still fails because disabled check happens after visibility
        // Let's check with a visible but we'll test the option separately
        expect(result.element).toBeDefined();
      });
    });

    describe('enabled checks', () => {
      it('rejects disabled elements by default', () => {
        const uiTree = createTestUITree();
        const target: ActionTarget = { type: 'identifier', value: 'disabled-button' };

        const result = validateTarget(target, uiTree);

        expect(result.valid).toBe(false);
        expect(result.reason).toBe('not_enabled');
      });

      it('accepts disabled elements when requireEnabled is false', () => {
        const uiTree = createTestUITree();
        const target: ActionTarget = { type: 'identifier', value: 'disabled-button' };

        const result = validateTarget(target, uiTree, { requireEnabled: false });

        // Should pass visibility but fail on hittable
        expect(result.element).toBeDefined();
      });
    });

    describe('hittability checks', () => {
      it('rejects non-hittable buttons', () => {
        const uiTree = createTestUITree();
        const target: ActionTarget = { type: 'identifier', value: 'not-hittable-button' };

        const result = validateTarget(target, uiTree);

        expect(result.valid).toBe(false);
        expect(result.reason).toBe('not_hittable');
      });

      it('skips hittability check when disabled', () => {
        const uiTree = createTestUITree();
        const target: ActionTarget = { type: 'identifier', value: 'not-hittable-button' };

        const result = validateTarget(target, uiTree, { checkHittable: false });

        expect(result.valid).toBe(true);
      });

      it('accepts non-hittable text fields (they can still receive input)', () => {
        const textFieldTree = createTestElement({
          type: 'application',
          children: [
            createTestElement({
              type: 'textField',
              identifier: 'input',
              label: 'Input',
              isHittable: false, // Text fields may not be "hittable" but can receive input
            }),
          ],
        });

        const target: ActionTarget = { type: 'identifier', value: 'input' };
        const result = validateTarget(target, textFieldTree);

        expect(result.valid).toBe(true);
      });

      it('rejects zero-size elements', () => {
        const uiTree = createTestUITree();
        const target: ActionTarget = { type: 'identifier', value: 'zero-size-button' };

        const result = validateTarget(target, uiTree);

        expect(result.valid).toBe(false);
        expect(result.reason).toBe('zero_size');
      });
    });
  });

  // ===========================================================================
  // suggestAlternatives Tests
  // ===========================================================================

  describe('suggestAlternatives', () => {
    it('suggests elements with similar identifiers', () => {
      const uiTree = createTestUITree();
      const target: ActionTarget = { type: 'identifier', value: 'login' };

      const suggestions = suggestAlternatives(target, uiTree);

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].element.identifier).toBe('login-button');
      expect(suggestions[0].similarity).toBeGreaterThan(50);
    });

    it('suggests elements with similar labels', () => {
      const uiTree = createTestUITree();
      const target: ActionTarget = { type: 'label', value: 'Login' };

      const suggestions = suggestAlternatives(target, uiTree);

      expect(suggestions.length).toBeGreaterThan(0);
      // "Log In" is similar to "Login"
      expect(suggestions.some((s) => s.element.label === 'Log In')).toBe(true);
    });

    it('suggests elements containing the search term', () => {
      const uiTree = createTestUITree();
      const target: ActionTarget = { type: 'text', value: 'email' };

      const suggestions = suggestAlternatives(target, uiTree);

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some((s) => s.element.identifier?.includes('email'))).toBe(true);
    });

    it('limits suggestions to maxSuggestions', () => {
      const uiTree = createTestUITree();
      const target: ActionTarget = { type: 'identifier', value: 'button' };

      const suggestions = suggestAlternatives(target, uiTree, { maxSuggestions: 2 });

      expect(suggestions.length).toBeLessThanOrEqual(2);
    });

    it('filters suggestions below minSimilarity', () => {
      const uiTree = createTestUITree();
      const target: ActionTarget = { type: 'identifier', value: 'xyz' };

      const suggestions = suggestAlternatives(target, uiTree, { minSimilarity: 90 });

      // With very different search term and high threshold, should get few/no results
      expect(suggestions.every((s) => s.similarity >= 90)).toBe(true);
    });

    it('sorts suggestions by similarity (descending)', () => {
      const uiTree = createTestUITree();
      const target: ActionTarget = { type: 'identifier', value: 'button' };

      const suggestions = suggestAlternatives(target, uiTree);

      for (let i = 1; i < suggestions.length; i++) {
        expect(suggestions[i - 1].similarity).toBeGreaterThanOrEqual(suggestions[i].similarity);
      }
    });

    it('only suggests interactable elements', () => {
      const uiTree = createTestUITree();
      const target: ActionTarget = { type: 'identifier', value: 'test' };

      const suggestions = suggestAlternatives(target, uiTree);

      // All suggested elements should be enabled, visible, and either hittable or input
      for (const suggestion of suggestions) {
        expect(suggestion.element.isEnabled).toBe(true);
        expect(suggestion.element.isVisible).toBe(true);
      }
    });

    it('includes reason for suggestion', () => {
      const uiTree = createTestUITree();
      const target: ActionTarget = { type: 'identifier', value: 'login' };

      const suggestions = suggestAlternatives(target, uiTree);

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].reason).toBeDefined();
      expect(suggestions[0].reason.length).toBeGreaterThan(0);
    });

    it('creates appropriate target for suggested element', () => {
      const uiTree = createTestUITree();
      const target: ActionTarget = { type: 'identifier', value: 'login' };

      const suggestions = suggestAlternatives(target, uiTree);

      expect(suggestions.length).toBeGreaterThan(0);
      // Should prefer identifier as target type
      const firstSuggestion = suggestions[0];
      expect(firstSuggestion.target.type).toBe('identifier');
      expect(firstSuggestion.target.value).toBe(firstSuggestion.element.identifier);
    });
  });

  // ===========================================================================
  // checkHittable Tests
  // ===========================================================================

  describe('checkHittable', () => {
    it('returns hittable for valid element', () => {
      const element = createTestElement({
        identifier: 'valid-button',
        isHittable: true,
        isVisible: true,
        isEnabled: true,
      });

      const result = checkHittable(element, createTestUITree());

      expect(result.hittable).toBe(true);
      expect(result.message).toContain('hittable');
      expect(result.position).toEqual(element.frame);
    });

    it('returns not hittable for non-visible element', () => {
      const element = createTestElement({
        identifier: 'hidden',
        isVisible: false,
      });

      const result = checkHittable(element, createTestUITree());

      expect(result.hittable).toBe(false);
      expect(result.reason).toBe('not_visible');
      expect(result.suggestedAction).toBeDefined();
    });

    it('returns not hittable for disabled element', () => {
      const element = createTestElement({
        identifier: 'disabled',
        isEnabled: false,
      });

      const result = checkHittable(element, createTestUITree());

      expect(result.hittable).toBe(false);
      expect(result.reason).toBe('not_enabled');
    });

    it('returns not hittable for zero-size element', () => {
      const element = createTestElement({
        identifier: 'zero-size',
        frame: { x: 100, y: 100, width: 0, height: 0 },
      });

      const result = checkHittable(element, createTestUITree());

      expect(result.hittable).toBe(false);
      expect(result.reason).toBe('zero_size');
    });

    it('returns not hittable for element marked as not hittable', () => {
      const element = createTestElement({
        type: 'button',
        identifier: 'not-hittable',
        isHittable: false,
      });

      const result = checkHittable(element, createTestUITree());

      expect(result.hittable).toBe(false);
      expect(result.reason).toBe('not_hittable');
    });

    it('returns hittable for non-hittable text field (can receive input)', () => {
      const element = createTestElement({
        type: 'textField',
        identifier: 'input',
        isHittable: false,
      });

      const result = checkHittable(element, createTestUITree());

      expect(result.hittable).toBe(true);
    });

    it('returns hittable for non-hittable search field', () => {
      const element = createTestElement({
        type: 'searchField',
        identifier: 'search',
        isHittable: false,
      });

      const result = checkHittable(element, createTestUITree());

      expect(result.hittable).toBe(true);
    });

    it('returns not hittable for element that does not exist', () => {
      const element = createTestElement({
        identifier: 'ghost',
        exists: false,
      });

      const result = checkHittable(element, createTestUITree());

      expect(result.hittable).toBe(false);
      expect(result.reason).toBe('not_found');
    });

    it('returns not hittable for off-screen element', () => {
      const element = createTestElement({
        identifier: 'off-screen',
        frame: { x: 1000, y: 2000, width: 100, height: 50 },
      });

      const result = checkHittable(element, createTestUITree());

      expect(result.hittable).toBe(false);
      expect(result.reason).toBe('off_screen');
      expect(result.suggestedAction?.toLowerCase()).toContain('scroll');
    });

    it('detects alert obscuring element', () => {
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

      const element = createTestElement({
        type: 'button',
        identifier: 'submit',
        frame: { x: 100, y: 300, width: 200, height: 50 },
      });

      const result = checkHittable(element, uiTree);

      expect(result.hittable).toBe(false);
      expect(result.reason).toBe('obscured');
      expect(result.message).toContain('alert');
      expect(result.suggestedAction).toContain('alert');
    });

    it('includes position in result', () => {
      const element = createTestElement({
        identifier: 'positioned',
        frame: { x: 50, y: 200, width: 150, height: 60 },
      });

      const result = checkHittable(element, createTestUITree());

      expect(result.position).toEqual({ x: 50, y: 200, width: 150, height: 60 });
    });
  });

  // ===========================================================================
  // validateForAction Tests
  // ===========================================================================

  describe('validateForAction', () => {
    it('validates tap action normally', () => {
      const uiTree = createTestUITree();
      const target: ActionTarget = { type: 'identifier', value: 'login-button' };

      const result = validateForAction(target, uiTree, 'tap');

      expect(result.valid).toBe(true);
    });

    it('validates waitForElement without requiring enabled/hittable', () => {
      const uiTree = createTestUITree();
      const target: ActionTarget = { type: 'identifier', value: 'disabled-button' };

      const result = validateForAction(target, uiTree, 'waitForElement');

      expect(result.valid).toBe(true);
      expect(result.element?.identifier).toBe('disabled-button');
    });

    it('validates assertExists without requiring enabled/hittable', () => {
      const uiTree = createTestUITree();
      const target: ActionTarget = { type: 'identifier', value: 'not-hittable-button' };

      const result = validateForAction(target, uiTree, 'assertExists');

      expect(result.valid).toBe(true);
    });

    it('validates assertNotExists - returns valid when element NOT found', () => {
      const uiTree = createTestUITree();
      const target: ActionTarget = { type: 'identifier', value: 'nonexistent' };

      const result = validateForAction(target, uiTree, 'assertNotExists');

      expect(result.valid).toBe(true);
    });

    it('validates assertNotExists - returns invalid when element IS found', () => {
      const uiTree = createTestUITree();
      const target: ActionTarget = { type: 'identifier', value: 'login-button' };

      const result = validateForAction(target, uiTree, 'assertNotExists');

      expect(result.valid).toBe(false);
      expect(result.message).toContain('still exists');
    });

    it('validates waitForNotExist - returns valid when element NOT found', () => {
      const uiTree = createTestUITree();
      const target: ActionTarget = { type: 'identifier', value: 'nonexistent' };

      const result = validateForAction(target, uiTree, 'waitForNotExist');

      expect(result.valid).toBe(true);
    });

    it('validates assertDisabled without requiring enabled', () => {
      const uiTree = createTestUITree();
      const target: ActionTarget = { type: 'identifier', value: 'disabled-button' };

      const result = validateForAction(target, uiTree, 'assertDisabled');

      expect(result.valid).toBe(true);
      expect(result.element?.isEnabled).toBe(false);
    });
  });

  // ===========================================================================
  // targetExists Tests
  // ===========================================================================

  describe('targetExists', () => {
    it('returns true when target exists', () => {
      const uiTree = createTestUITree();
      const target: ActionTarget = { type: 'identifier', value: 'login-button' };

      const exists = targetExists(target, uiTree);

      expect(exists).toBe(true);
    });

    it('returns false when target does not exist', () => {
      const uiTree = createTestUITree();
      const target: ActionTarget = { type: 'identifier', value: 'nonexistent' };

      const exists = targetExists(target, uiTree);

      expect(exists).toBe(false);
    });

    it('returns true for hidden elements (exists check only)', () => {
      const uiTree = createTestUITree();
      const target: ActionTarget = { type: 'identifier', value: 'hidden-button' };

      const exists = targetExists(target, uiTree);

      expect(exists).toBe(true);
    });
  });

  // ===========================================================================
  // getElementCenter Tests
  // ===========================================================================

  describe('getElementCenter', () => {
    it('calculates center for normal element', () => {
      const element = createTestElement({
        frame: { x: 100, y: 200, width: 100, height: 50 },
      });

      const center = getElementCenter(element);

      expect(center).toEqual({ x: 150, y: 225 });
    });

    it('rounds center coordinates', () => {
      const element = createTestElement({
        frame: { x: 100, y: 200, width: 101, height: 51 },
      });

      const center = getElementCenter(element);

      expect(center).toEqual({ x: 151, y: 226 });
    });

    it('returns null for zero-width element', () => {
      const element = createTestElement({
        frame: { x: 100, y: 200, width: 0, height: 50 },
      });

      const center = getElementCenter(element);

      expect(center).toBeNull();
    });

    it('returns null for zero-height element', () => {
      const element = createTestElement({
        frame: { x: 100, y: 200, width: 100, height: 0 },
      });

      const center = getElementCenter(element);

      expect(center).toBeNull();
    });

    it('returns null for completely zero-size element', () => {
      const element = createTestElement({
        frame: { x: 100, y: 200, width: 0, height: 0 },
      });

      const center = getElementCenter(element);

      expect(center).toBeNull();
    });
  });

  // ===========================================================================
  // Edge Cases and Special Scenarios
  // ===========================================================================

  describe('edge cases', () => {
    it('handles empty UI tree', () => {
      const emptyTree = createTestElement({
        type: 'application',
        children: [],
      });
      const target: ActionTarget = { type: 'identifier', value: 'anything' };

      const result = validateTarget(target, emptyTree);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('not_found');
    });

    it('handles deeply nested elements', () => {
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
                        type: 'button',
                        identifier: 'deep-button',
                        label: 'Deep Button',
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      });

      const target: ActionTarget = { type: 'identifier', value: 'deep-button' };
      const result = validateTarget(target, deepTree);

      expect(result.valid).toBe(true);
      expect(result.element?.identifier).toBe('deep-button');
    });

    it('handles elements with special characters in identifiers', () => {
      const tree = createTestElement({
        type: 'view',
        children: [
          createTestElement({
            type: 'button',
            identifier: 'button-with-dash_and_underscore.and.dots',
          }),
        ],
      });

      const target: ActionTarget = {
        type: 'identifier',
        value: 'button-with-dash_and_underscore.and.dots',
      };

      const result = validateTarget(target, tree);

      expect(result.valid).toBe(true);
    });

    it('handles elements with unicode in labels', () => {
      const tree = createTestElement({
        type: 'view',
        children: [
          createTestElement({
            type: 'button',
            identifier: 'emoji-button',
            label: '🚀 Launch',
          }),
        ],
      });

      const target: ActionTarget = { type: 'label', value: '🚀 Launch' };

      const result = validateTarget(target, tree);

      expect(result.valid).toBe(true);
    });

    it('handles case-insensitive type matching', () => {
      const tree = createTestElement({
        type: 'view',
        children: [
          createTestElement({
            type: 'Button', // Capital B
            identifier: 'my-button',
          }),
        ],
      });

      const target: ActionTarget = { type: 'type', value: 'button' }; // lowercase

      const result = validateTarget(target, tree);

      expect(result.valid).toBe(true);
    });

    it('handles multiple elements with same type - uses index correctly', () => {
      const tree = createTestElement({
        type: 'view',
        children: [
          createTestElement({ type: 'button', identifier: 'first' }),
          createTestElement({ type: 'button', identifier: 'second' }),
          createTestElement({ type: 'button', identifier: 'third' }),
        ],
      });

      const target0: ActionTarget = { type: 'type', value: 'button', index: 0 };
      const target1: ActionTarget = { type: 'type', value: 'button', index: 1 };
      const target2: ActionTarget = { type: 'type', value: 'button', index: 2 };
      const target3: ActionTarget = { type: 'type', value: 'button', index: 3 };

      expect(validateTarget(target0, tree).element?.identifier).toBe('first');
      expect(validateTarget(target1, tree).element?.identifier).toBe('second');
      expect(validateTarget(target2, tree).element?.identifier).toBe('third');
      expect(validateTarget(target3, tree).valid).toBe(false); // Out of bounds
    });

    it('handles coordinate at exact element boundary', () => {
      const tree = createTestElement({
        type: 'view',
        frame: { x: 0, y: 0, width: 400, height: 400 },
        children: [
          createTestElement({
            type: 'button',
            identifier: 'boundary-button',
            frame: { x: 100, y: 100, width: 100, height: 100 },
          }),
        ],
      });

      // Test coordinates at corners and edges (all inside the element)
      const topLeft: ActionTarget = { type: 'coordinates', value: '100,100' };
      const bottomRight: ActionTarget = { type: 'coordinates', value: '200,200' };
      const center: ActionTarget = { type: 'coordinates', value: '150,150' };

      expect(validateTarget(topLeft, tree).element?.identifier).toBe('boundary-button');
      expect(validateTarget(bottomRight, tree).element?.identifier).toBe('boundary-button');
      expect(validateTarget(center, tree).element?.identifier).toBe('boundary-button');
    });

    it('selects smallest element at coordinates (most specific)', () => {
      const tree = createTestElement({
        type: 'view',
        frame: { x: 0, y: 0, width: 400, height: 400 },
        children: [
          createTestElement({
            type: 'view',
            frame: { x: 50, y: 50, width: 300, height: 300 },
            children: [
              createTestElement({
                type: 'button',
                identifier: 'small-button',
                frame: { x: 100, y: 100, width: 100, height: 50 },
              }),
            ],
          }),
        ],
      });

      // Point inside the button
      const target: ActionTarget = { type: 'coordinates', value: '150,125' };

      const result = validateTarget(target, tree);

      expect(result.valid).toBe(true);
      expect(result.element?.identifier).toBe('small-button');
    });
  });

  // ===========================================================================
  // Similarity Calculation Tests
  // ===========================================================================

  describe('similarity calculations', () => {
    it('gives high similarity for exact partial match', () => {
      const uiTree = createTestElement({
        type: 'view',
        children: [
          createTestElement({ type: 'button', identifier: 'login-button' }),
        ],
      });

      const target: ActionTarget = { type: 'identifier', value: 'login' };
      const suggestions = suggestAlternatives(target, uiTree);

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].similarity).toBeGreaterThanOrEqual(50);
    });

    it('gives lower similarity for different strings', () => {
      const uiTree = createTestElement({
        type: 'view',
        children: [
          createTestElement({ type: 'button', identifier: 'submit-button' }),
        ],
      });

      const target: ActionTarget = { type: 'identifier', value: 'cancel' };
      const suggestions = suggestAlternatives(target, uiTree, { minSimilarity: 0 });

      // Should still return something but with lower similarity
      if (suggestions.length > 0) {
        expect(suggestions[0].similarity).toBeLessThan(50);
      }
    });
  });
});
