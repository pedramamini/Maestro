/**
 * Tests for Playbook Executor
 */

import {
  executePlaybook,
  executeAction,
} from '../../../../cli/services/playbook-actions/executor';
import {
  registerAction,
  clearRegistry,
} from '../../../../cli/services/playbook-actions/action-registry';
import type {
  YamlPlaybook,
  ActionDefinition,
} from '../../../../cli/services/playbook-actions/types';

describe('Playbook Executor', () => {
  // Register test actions before each test
  beforeEach(() => {
    clearRegistry();

    // Simple success action
    registerAction({
      name: 'test.success',
      description: 'Always succeeds',
      inputs: {},
      handler: async () => ({
        success: true,
        message: 'Success',
        data: { result: 'ok' },
      }),
    });

    // Simple failure action
    registerAction({
      name: 'test.fail',
      description: 'Always fails',
      inputs: {},
      handler: async () => ({
        success: false,
        message: 'Failed',
        error: 'Test failure',
      }),
    });

    // Action that echoes inputs
    registerAction({
      name: 'test.echo',
      description: 'Echoes inputs',
      inputs: {},
      handler: async (inputs) => ({
        success: true,
        message: 'Echoed',
        data: inputs,
      }),
    });

    // Action that throws
    registerAction({
      name: 'test.throw',
      description: 'Throws an error',
      inputs: {},
      handler: async () => {
        throw new Error('Test exception');
      },
    });

    // Slow action
    registerAction({
      name: 'test.slow',
      description: 'Takes time',
      inputs: {},
      handler: async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return {
          success: true,
          message: 'Completed',
        };
      },
    });
  });

  describe('executePlaybook', () => {
    const baseOptions = {
      cwd: '/test/project',
      sessionId: 'test-session',
    };

    it('should execute a single-step playbook', async () => {
      const playbook: YamlPlaybook = {
        name: 'Simple Playbook',
        steps: [{ action: 'test.success' }],
      };

      const result = await executePlaybook(playbook, baseOptions);

      expect(result.success).toBe(true);
      expect(result.totalSteps).toBe(1);
      expect(result.successfulSteps).toBe(1);
      expect(result.failedSteps).toBe(0);
      expect(result.stepResults).toHaveLength(1);
    });

    it('should execute multiple steps in order', async () => {
      const order: string[] = [];

      registerAction({
        name: 'test.order1',
        description: 'First',
        inputs: {},
        handler: async () => {
          order.push('first');
          return { success: true, message: 'First' };
        },
      });

      registerAction({
        name: 'test.order2',
        description: 'Second',
        inputs: {},
        handler: async () => {
          order.push('second');
          return { success: true, message: 'Second' };
        },
      });

      const playbook: YamlPlaybook = {
        name: 'Ordered Playbook',
        steps: [
          { action: 'test.order1' },
          { action: 'test.order2' },
        ],
      };

      await executePlaybook(playbook, baseOptions);

      expect(order).toEqual(['first', 'second']);
    });

    it('should stop on failure', async () => {
      const playbook: YamlPlaybook = {
        name: 'Failing Playbook',
        steps: [
          { action: 'test.success' },
          { action: 'test.fail' },
          { action: 'test.success' },
        ],
      };

      const result = await executePlaybook(playbook, baseOptions);

      expect(result.success).toBe(false);
      expect(result.stepResults).toHaveLength(2);
      expect(result.successfulSteps).toBe(1);
      expect(result.failedSteps).toBe(1);
    });

    it('should continue on error when specified', async () => {
      const playbook: YamlPlaybook = {
        name: 'Continue On Error',
        steps: [
          { action: 'test.fail', continue_on_error: true },
          { action: 'test.success' },
        ],
      };

      const result = await executePlaybook(playbook, baseOptions);

      expect(result.success).toBe(false);
      expect(result.stepResults).toHaveLength(2);
      expect(result.successfulSteps).toBe(1);
      expect(result.failedSteps).toBe(1);
    });

    it('should store results in variables', async () => {
      const playbook: YamlPlaybook = {
        name: 'Store Result',
        steps: [
          {
            action: 'test.echo',
            inputs: { value: 42 },
            store_as: 'echo_result',
          },
        ],
      };

      const result = await executePlaybook(playbook, baseOptions);

      expect(result.success).toBe(true);
      expect(result.variables.echo_result).toEqual({ value: 42 });
    });

    it('should substitute variables in inputs', async () => {
      registerAction({
        name: 'test.capture',
        description: 'Captures input',
        inputs: {},
        handler: async (inputs) => ({
          success: true,
          message: 'Captured',
          data: { captured: inputs },
        }),
      });

      const playbook: YamlPlaybook = {
        name: 'Variable Substitution',
        steps: [
          {
            action: 'test.success',
            store_as: 'first_result',
          },
          {
            action: 'test.capture',
            inputs: {
              result: '{{ variables.first_result.result }}',
            },
          },
        ],
      };

      const result = await executePlaybook(playbook, baseOptions);

      expect(result.success).toBe(true);
      expect(result.stepResults[1].data).toEqual({
        captured: { result: 'ok' },
      });
    });

    it('should skip steps when condition is false', async () => {
      const playbook: YamlPlaybook = {
        name: 'Conditional Skip',
        steps: [
          {
            action: 'test.success',
            condition: 'false',
          },
        ],
      };

      const result = await executePlaybook(playbook, baseOptions);

      expect(result.success).toBe(true);
      expect(result.skippedSteps).toBe(1);
      expect(result.stepResults[0].skipped).toBe(true);
    });

    it('should execute steps when condition is true', async () => {
      const playbook: YamlPlaybook = {
        name: 'Conditional Execute',
        steps: [
          {
            action: 'test.success',
            condition: 'true',
          },
        ],
      };

      const result = await executePlaybook(playbook, baseOptions);

      expect(result.success).toBe(true);
      expect(result.successfulSteps).toBe(1);
      expect(result.stepResults[0].skipped).toBeUndefined();
    });

    it('should execute on_failure steps when step fails', async () => {
      const failureExecuted: string[] = [];

      registerAction({
        name: 'test.failure_handler',
        description: 'Handles failure',
        inputs: {},
        handler: async () => {
          failureExecuted.push('handled');
          return { success: true, message: 'Handled' };
        },
      });

      const playbook: YamlPlaybook = {
        name: 'With Failure Handler',
        steps: [
          {
            action: 'test.fail',
            on_failure: [{ action: 'test.failure_handler' }],
          },
        ],
      };

      const result = await executePlaybook(playbook, baseOptions);

      expect(result.success).toBe(false);
      expect(failureExecuted).toContain('handled');
      // Main step + failure handler step
      expect(result.stepResults).toHaveLength(2);
    });

    it('should handle unknown actions', async () => {
      const playbook: YamlPlaybook = {
        name: 'Unknown Action',
        steps: [{ action: 'non.existent' }],
      };

      const result = await executePlaybook(playbook, baseOptions);

      expect(result.success).toBe(false);
      expect(result.stepResults[0].error).toContain("'non.existent' is not registered");
    });

    it('should handle action exceptions', async () => {
      const playbook: YamlPlaybook = {
        name: 'Throwing Action',
        steps: [{ action: 'test.throw' }],
      };

      const result = await executePlaybook(playbook, baseOptions);

      expect(result.success).toBe(false);
      expect(result.stepResults[0].error).toBe('Test exception');
    });

    it('should respect abort signal', async () => {
      const controller = new AbortController();

      const playbook: YamlPlaybook = {
        name: 'Abortable Playbook',
        steps: [
          { action: 'test.slow' },
          { action: 'test.success' },
        ],
      };

      // Abort immediately
      controller.abort();

      const result = await executePlaybook(playbook, {
        ...baseOptions,
        abortSignal: controller.signal,
      });

      expect(result.success).toBe(false);
      expect(result.stepResults[0].error).toBe('Aborted');
      expect(result.stepResults).toHaveLength(1);
    });

    it('should call onStepStart and onStepComplete callbacks', async () => {
      const starts: number[] = [];
      const completes: number[] = [];

      const playbook: YamlPlaybook = {
        name: 'With Callbacks',
        steps: [
          { action: 'test.success' },
          { action: 'test.success' },
        ],
      };

      await executePlaybook(playbook, {
        ...baseOptions,
        onStepStart: (_, index) => starts.push(index),
        onStepComplete: (_, index) => completes.push(index),
      });

      expect(starts).toEqual([0, 1]);
      expect(completes).toEqual([0, 1]);
    });

    it('should track elapsed time', async () => {
      const playbook: YamlPlaybook = {
        name: 'Timed Playbook',
        steps: [{ action: 'test.slow' }],
      };

      const result = await executePlaybook(playbook, baseOptions);

      expect(result.elapsedMs).toBeGreaterThan(0);
      expect(result.stepResults[0].elapsedMs).toBeGreaterThan(0);
    });

    it('should pass initial variables', async () => {
      const playbook: YamlPlaybook = {
        name: 'With Initial Variables',
        steps: [
          {
            action: 'test.echo',
            inputs: {
              value: '{{ variables.initial }}',
            },
          },
        ],
      };

      const result = await executePlaybook(playbook, {
        ...baseOptions,
        variables: { initial: 'test-value' },
      });

      expect(result.success).toBe(true);
      expect(result.stepResults[0].data).toEqual({ value: 'test-value' });
    });
  });

  describe('executeAction', () => {
    const baseOptions = {
      cwd: '/test/project',
      sessionId: 'test-session',
    };

    it('should execute a single action', async () => {
      const result = await executeAction('test.success', {}, baseOptions);

      expect(result.success).toBe(true);
      expect(result.action).toBe('test.success');
    });

    it('should pass inputs to action', async () => {
      const result = await executeAction(
        'test.echo',
        { key: 'value' },
        baseOptions
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ key: 'value' });
    });

    it('should handle action failure', async () => {
      const result = await executeAction('test.fail', {}, baseOptions);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Test failure');
    });

    it('should handle unknown action', async () => {
      const result = await executeAction('unknown.action', {}, baseOptions);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not registered');
    });
  });
});
