/**
 * Assert Action
 *
 * Evaluates a condition and fails the playbook if the condition is false.
 * Useful for validating results from previous actions.
 *
 * Example YAML usage:
 * ```yaml
 * - action: ios.run_flow
 *   inputs:
 *     flow: login_flow.yaml
 *   store_as: login_result
 *
 * - action: assert
 *   inputs:
 *     condition: "{{ variables.login_result.passed }}"
 *     message: "Login flow should complete successfully"
 *
 * - action: assert
 *   inputs:
 *     condition: "{{ variables.ui_state.summary.buttons >= 1 }}"
 *     message: "At least one button should be present"
 *
 * - action: assert
 *   inputs:
 *     not: true
 *     condition: "{{ variables.snapshot.hasCrashes }}"
 *     message: "App should not have crashed"
 * ```
 */

import { defineAction } from '../action-registry';
import type { ActionResult } from '../types';

/**
 * Input parameters for the assert action
 */
export interface AssertInputs {
  /** The condition to evaluate (required) - should be a value that evaluates to truthy/falsy */
  condition: unknown;
  /** Human-readable message describing the assertion (required) */
  message: string;
  /** Negate the condition (assert that it's false) */
  not?: boolean;
}

/**
 * Evaluate if a value is truthy
 */
function isTruthy(value: unknown): boolean {
  // Handle null/undefined
  if (value === null || value === undefined) {
    return false;
  }

  // Handle booleans
  if (typeof value === 'boolean') {
    return value;
  }

  // Handle numbers (0 is falsy)
  if (typeof value === 'number') {
    return value !== 0 && !Number.isNaN(value);
  }

  // Handle strings ("false", "0", "" are falsy)
  if (typeof value === 'string') {
    const trimmed = value.toLowerCase().trim();
    if (trimmed === '' || trimmed === 'false' || trimmed === '0' || trimmed === 'null' || trimmed === 'undefined') {
      return false;
    }
    return true;
  }

  // Handle arrays (empty array is falsy)
  if (Array.isArray(value)) {
    return value.length > 0;
  }

  // Handle objects (empty object is truthy, but check for special cases)
  if (typeof value === 'object') {
    // Check for success/passed properties common in action results
    if ('success' in value) {
      return isTruthy((value as { success: unknown }).success);
    }
    if ('passed' in value) {
      return isTruthy((value as { passed: unknown }).passed);
    }
    // Objects are generally truthy
    return true;
  }

  // Default: truthy
  return true;
}

/**
 * Format a value for display in error messages
 */
function formatValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return '[Object]';
    }
  }
  return String(value);
}

/**
 * Assert action definition
 */
export const assertAction = defineAction<AssertInputs>({
  name: 'assert',
  description: 'Assert that a condition is true (or false with not: true)',

  inputs: {
    condition: {
      type: 'boolean',
      required: true,
      description: 'The condition to evaluate',
    },
    message: {
      type: 'string',
      required: true,
      description: 'Human-readable message describing the assertion',
    },
    not: {
      type: 'boolean',
      required: false,
      default: false,
      description: 'Negate the condition (assert that it is false)',
    },
  },

  outputs: {
    passed: {
      type: 'boolean',
      description: 'Whether the assertion passed',
    },
    condition: {
      type: 'boolean',
      description: 'The evaluated condition value',
    },
    expected: {
      type: 'boolean',
      description: 'The expected value (true if not: false, false if not: true)',
    },
    message: {
      type: 'string',
      description: 'The assertion message',
    },
  },

  async handler(inputs, _context): Promise<ActionResult> {
    const startTime = Date.now();

    try {
      // Validate required message
      if (!inputs.message || inputs.message.trim() === '') {
        return {
          success: false,
          message: 'Assertion message is required',
          error: 'The "message" input is required. Describe what you are asserting.',
          elapsedMs: Date.now() - startTime,
        };
      }

      // Evaluate the condition
      const conditionValue = isTruthy(inputs.condition);
      const expectTrue = !(inputs.not ?? false);
      const passed = conditionValue === expectTrue;

      // Build output data
      const outputData = {
        passed,
        condition: conditionValue,
        expected: expectTrue,
        message: inputs.message,
        rawValue: inputs.condition,
      };

      if (passed) {
        // Assertion passed
        return {
          success: true,
          message: `✓ ${inputs.message}`,
          data: outputData,
          elapsedMs: Date.now() - startTime,
        };
      } else {
        // Assertion failed
        const expectedDesc = expectTrue ? 'truthy' : 'falsy';
        const actualDesc = conditionValue ? 'truthy' : 'falsy';

        let errorMessage = `Assertion failed: ${inputs.message}`;
        errorMessage += `\n  Expected: ${expectedDesc}`;
        errorMessage += `\n  Actual: ${actualDesc}`;

        // Include the actual value for debugging
        if (inputs.condition !== conditionValue) {
          errorMessage += `\n  Value: ${formatValue(inputs.condition)}`;
        }

        return {
          success: false,
          message: `✗ ${inputs.message}`,
          error: errorMessage,
          data: outputData,
          elapsedMs: Date.now() - startTime,
        };
      }
    } catch (error) {
      return {
        success: false,
        message: 'Failed to evaluate assertion',
        error: error instanceof Error ? error.message : String(error),
        elapsedMs: Date.now() - startTime,
      };
    }
  },
});
