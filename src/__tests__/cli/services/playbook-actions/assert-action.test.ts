/**
 * Tests for Assert Playbook Action
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { assertAction } from '../../../../cli/services/playbook-actions/actions/assert';
import type { ActionContext } from '../../../../cli/services/playbook-actions/types';

describe('Assert Action', () => {
  const mockContext: ActionContext = {
    cwd: '/test/project',
    sessionId: 'test-session',
    variables: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Action Definition', () => {
    it('should have correct name', () => {
      expect(assertAction.name).toBe('assert');
    });

    it('should have description', () => {
      expect(assertAction.description).toBeDefined();
      expect(assertAction.description.length).toBeGreaterThan(0);
    });

    it('should define expected inputs', () => {
      expect(assertAction.inputs).toHaveProperty('condition');
      expect(assertAction.inputs).toHaveProperty('message');
      expect(assertAction.inputs).toHaveProperty('not');
    });

    it('should require condition and message', () => {
      expect(assertAction.inputs.condition.required).toBe(true);
      expect(assertAction.inputs.message.required).toBe(true);
    });

    it('should have optional not input', () => {
      expect(assertAction.inputs.not.required).toBeFalsy();
    });

    it('should define expected outputs', () => {
      expect(assertAction.outputs).toHaveProperty('passed');
      expect(assertAction.outputs).toHaveProperty('condition');
      expect(assertAction.outputs).toHaveProperty('expected');
      expect(assertAction.outputs).toHaveProperty('message');
    });
  });

  describe('Handler - Truthy Values', () => {
    it('should pass for boolean true', async () => {
      const result = await assertAction.handler(
        { condition: true, message: 'Should be true' },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('✓');
    });

    it('should pass for non-zero number', async () => {
      const result = await assertAction.handler(
        { condition: 42, message: 'Should be truthy' },
        mockContext
      );

      expect(result.success).toBe(true);
    });

    it('should pass for non-empty string', async () => {
      const result = await assertAction.handler(
        { condition: 'hello', message: 'Should be truthy' },
        mockContext
      );

      expect(result.success).toBe(true);
    });

    it('should pass for non-empty array', async () => {
      const result = await assertAction.handler(
        { condition: [1, 2, 3], message: 'Should be truthy' },
        mockContext
      );

      expect(result.success).toBe(true);
    });

    it('should pass for object with success: true', async () => {
      const result = await assertAction.handler(
        { condition: { success: true, data: {} }, message: 'Should be truthy' },
        mockContext
      );

      expect(result.success).toBe(true);
    });

    it('should pass for object with passed: true', async () => {
      const result = await assertAction.handler(
        { condition: { passed: true, steps: [] }, message: 'Should be truthy' },
        mockContext
      );

      expect(result.success).toBe(true);
    });

    it('should pass for plain object', async () => {
      const result = await assertAction.handler(
        { condition: { key: 'value' }, message: 'Should be truthy' },
        mockContext
      );

      expect(result.success).toBe(true);
    });
  });

  describe('Handler - Falsy Values', () => {
    it('should fail for boolean false', async () => {
      const result = await assertAction.handler(
        { condition: false, message: 'Should be true' },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('✗');
    });

    it('should fail for null', async () => {
      const result = await assertAction.handler(
        { condition: null, message: 'Should be truthy' },
        mockContext
      );

      expect(result.success).toBe(false);
    });

    it('should fail for undefined', async () => {
      const result = await assertAction.handler(
        { condition: undefined, message: 'Should be truthy' },
        mockContext
      );

      expect(result.success).toBe(false);
    });

    it('should fail for zero', async () => {
      const result = await assertAction.handler(
        { condition: 0, message: 'Should be truthy' },
        mockContext
      );

      expect(result.success).toBe(false);
    });

    it('should fail for NaN', async () => {
      const result = await assertAction.handler(
        { condition: NaN, message: 'Should be truthy' },
        mockContext
      );

      expect(result.success).toBe(false);
    });

    it('should fail for empty string', async () => {
      const result = await assertAction.handler(
        { condition: '', message: 'Should be truthy' },
        mockContext
      );

      expect(result.success).toBe(false);
    });

    it('should fail for "false" string', async () => {
      const result = await assertAction.handler(
        { condition: 'false', message: 'Should be truthy' },
        mockContext
      );

      expect(result.success).toBe(false);
    });

    it('should fail for "0" string', async () => {
      const result = await assertAction.handler(
        { condition: '0', message: 'Should be truthy' },
        mockContext
      );

      expect(result.success).toBe(false);
    });

    it('should fail for empty array', async () => {
      const result = await assertAction.handler(
        { condition: [], message: 'Should be truthy' },
        mockContext
      );

      expect(result.success).toBe(false);
    });

    it('should fail for object with success: false', async () => {
      const result = await assertAction.handler(
        { condition: { success: false, error: 'Failed' }, message: 'Should be truthy' },
        mockContext
      );

      expect(result.success).toBe(false);
    });

    it('should fail for object with passed: false', async () => {
      const result = await assertAction.handler(
        { condition: { passed: false, failedSteps: 2 }, message: 'Should be truthy' },
        mockContext
      );

      expect(result.success).toBe(false);
    });
  });

  describe('Handler - Negation (not: true)', () => {
    it('should pass when condition is false and not: true', async () => {
      const result = await assertAction.handler(
        { condition: false, message: 'Should be false', not: true },
        mockContext
      );

      expect(result.success).toBe(true);
    });

    it('should pass when condition is null and not: true', async () => {
      const result = await assertAction.handler(
        { condition: null, message: 'Should be null', not: true },
        mockContext
      );

      expect(result.success).toBe(true);
    });

    it('should fail when condition is true and not: true', async () => {
      const result = await assertAction.handler(
        { condition: true, message: 'Should not be true', not: true },
        mockContext
      );

      expect(result.success).toBe(false);
    });

    it('should fail when condition is truthy object and not: true', async () => {
      const result = await assertAction.handler(
        { condition: { success: true }, message: 'Should not succeed', not: true },
        mockContext
      );

      expect(result.success).toBe(false);
    });
  });

  describe('Handler - Output Data', () => {
    it('should include passed status in output', async () => {
      const result = await assertAction.handler(
        { condition: true, message: 'Test assertion' },
        mockContext
      );

      expect(result.data).toHaveProperty('passed', true);
    });

    it('should include condition value in output', async () => {
      const result = await assertAction.handler(
        { condition: true, message: 'Test assertion' },
        mockContext
      );

      expect(result.data).toHaveProperty('condition', true);
    });

    it('should include expected value in output', async () => {
      const result = await assertAction.handler(
        { condition: true, message: 'Test assertion', not: true },
        mockContext
      );

      expect(result.data).toHaveProperty('expected', false);
    });

    it('should include message in output', async () => {
      const result = await assertAction.handler(
        { condition: true, message: 'My test message' },
        mockContext
      );

      expect(result.data).toHaveProperty('message', 'My test message');
    });

    it('should include raw value in output', async () => {
      const rawValue = { passed: true, steps: [1, 2, 3] };
      const result = await assertAction.handler(
        { condition: rawValue, message: 'Test' },
        mockContext
      );

      expect(result.data).toHaveProperty('rawValue', rawValue);
    });
  });

  describe('Handler - Error Messages', () => {
    it('should include helpful error message on failure', async () => {
      const result = await assertAction.handler(
        { condition: false, message: 'Login should succeed' },
        mockContext
      );

      expect(result.error).toContain('Assertion failed');
      expect(result.error).toContain('Login should succeed');
      expect(result.error).toContain('Expected');
      expect(result.error).toContain('Actual');
    });

    it('should include value in error for complex values', async () => {
      const result = await assertAction.handler(
        { condition: { success: false, error: 'API error' }, message: 'API call should succeed' },
        mockContext
      );

      expect(result.error).toContain('false');
    });

    it('should format null value correctly', async () => {
      const result = await assertAction.handler(
        { condition: null, message: 'Value should exist' },
        mockContext
      );

      expect(result.error).toContain('Assertion failed');
    });
  });

  describe('Handler - Validation', () => {
    it('should fail when message is empty', async () => {
      const result = await assertAction.handler(
        { condition: true, message: '' },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('message');
    });

    it('should fail when message is whitespace only', async () => {
      const result = await assertAction.handler(
        { condition: true, message: '   ' },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('message');
    });
  });

  describe('Handler - Elapsed Time', () => {
    it('should include elapsed time on success', async () => {
      const result = await assertAction.handler(
        { condition: true, message: 'Test' },
        mockContext
      );

      expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
    });

    it('should include elapsed time on failure', async () => {
      const result = await assertAction.handler(
        { condition: false, message: 'Test' },
        mockContext
      );

      expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Handler - Real World Scenarios', () => {
    it('should work with flow result from ios.run_flow', async () => {
      const flowResult = {
        passed: true,
        totalSteps: 5,
        passedSteps: 5,
        failedSteps: 0,
      };

      const result = await assertAction.handler(
        { condition: flowResult, message: 'Login flow should pass' },
        mockContext
      );

      expect(result.success).toBe(true);
    });

    it('should fail for failed flow result', async () => {
      const flowResult = {
        passed: false,
        totalSteps: 5,
        passedSteps: 3,
        failedSteps: 2,
      };

      const result = await assertAction.handler(
        { condition: flowResult, message: 'Login flow should pass' },
        mockContext
      );

      expect(result.success).toBe(false);
    });

    it('should work with inspect result summary', async () => {
      const inspectResult = {
        summary: {
          buttons: 3,
          textInputs: 2,
        },
      };

      // Note: This tests a plain object without success/passed - should be truthy
      const result = await assertAction.handler(
        { condition: inspectResult, message: 'UI should have elements' },
        mockContext
      );

      expect(result.success).toBe(true);
    });

    it('should work with snapshot crash check (not: true)', async () => {
      const snapshotResult = {
        hasCrashes: false,
        crashes: [],
      };

      const result = await assertAction.handler(
        { condition: snapshotResult.hasCrashes, message: 'App should not crash', not: true },
        mockContext
      );

      expect(result.success).toBe(true);
    });

    it('should fail crash check when crashes exist', async () => {
      const snapshotResult = {
        hasCrashes: true,
        crashes: [{ path: '/crash.log' }],
      };

      const result = await assertAction.handler(
        { condition: snapshotResult.hasCrashes, message: 'App should not crash', not: true },
        mockContext
      );

      expect(result.success).toBe(false);
    });
  });
});
