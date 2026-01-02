/**
 * Tests for Playbook Actions Type Definitions
 *
 * These tests verify the type structures are correctly defined
 * and can be used as expected.
 */

import type {
  ActionVariables,
  ActionContext,
  ActionResult,
  ActionDefinition,
  PlaybookStep,
  YamlPlaybook,
  StepExecutionResult,
  PlaybookExecutionResult,
} from '../../../../cli/services/playbook-actions/types';

describe('Playbook Actions Types', () => {
  describe('ActionVariables', () => {
    it('should allow string keys with unknown values', () => {
      const variables: ActionVariables = {
        name: 'test',
        count: 42,
        active: true,
        data: { nested: 'value' },
        list: [1, 2, 3],
      };

      expect(variables.name).toBe('test');
      expect(variables.count).toBe(42);
    });
  });

  describe('ActionContext', () => {
    it('should have required fields', () => {
      const context: ActionContext = {
        cwd: '/path/to/project',
        sessionId: 'session-123',
        variables: {},
      };

      expect(context.cwd).toBe('/path/to/project');
      expect(context.sessionId).toBe('session-123');
      expect(context.variables).toEqual({});
    });

    it('should allow optional abortSignal', () => {
      const controller = new AbortController();
      const context: ActionContext = {
        cwd: '/path',
        sessionId: 'session',
        variables: {},
        abortSignal: controller.signal,
      };

      expect(context.abortSignal).toBeDefined();
    });
  });

  describe('ActionResult', () => {
    it('should represent a successful result', () => {
      const result: ActionResult = {
        success: true,
        message: 'Action completed',
        data: { value: 42 },
        elapsedMs: 100,
      };

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should represent a failed result', () => {
      const result: ActionResult = {
        success: false,
        message: 'Action failed',
        error: 'Something went wrong',
        elapsedMs: 50,
      };

      expect(result.success).toBe(false);
      expect(result.error).toBe('Something went wrong');
    });
  });

  describe('ActionDefinition', () => {
    it('should define an action with typed inputs', () => {
      interface TestInputs {
        name: string;
        count?: number;
      }

      const action: ActionDefinition<TestInputs> = {
        name: 'test.action',
        description: 'A test action',
        inputs: {
          name: {
            type: 'string',
            required: true,
            description: 'The name',
          },
          count: {
            type: 'number',
            required: false,
            default: 10,
            description: 'The count',
          },
        },
        outputs: {
          result: {
            type: 'string',
            description: 'The result',
          },
        },
        handler: async (inputs, _context) => ({
          success: true,
          message: `Processed ${inputs.name}`,
          data: { processed: inputs.name },
        }),
      };

      expect(action.name).toBe('test.action');
      expect(action.inputs.name.required).toBe(true);
      expect(action.inputs.count?.default).toBe(10);
    });
  });

  describe('PlaybookStep', () => {
    it('should have required action field', () => {
      const step: PlaybookStep = {
        action: 'ios.snapshot',
      };

      expect(step.action).toBe('ios.snapshot');
    });

    it('should support all optional fields', () => {
      const step: PlaybookStep = {
        name: 'Capture screenshot',
        action: 'ios.snapshot',
        inputs: {
          simulator: 'iPhone 15',
          app: 'com.example.app',
        },
        store_as: 'snapshot_result',
        condition: '{{ variables.should_capture }}',
        continue_on_error: true,
        on_failure: [
          {
            action: 'log.error',
            inputs: { message: 'Snapshot failed' },
          },
        ],
      };

      expect(step.name).toBe('Capture screenshot');
      expect(step.store_as).toBe('snapshot_result');
      expect(step.on_failure).toHaveLength(1);
    });
  });

  describe('YamlPlaybook', () => {
    it('should define a playbook with steps', () => {
      const playbook: YamlPlaybook = {
        name: 'iOS Testing',
        description: 'Test the iOS app',
        inputs: {
          simulator: {
            type: 'string',
            required: true,
            description: 'Target simulator',
          },
        },
        steps: [
          {
            action: 'ios.snapshot',
            inputs: {
              simulator: '{{ inputs.simulator }}',
            },
            store_as: 'snapshot',
          },
        ],
      };

      expect(playbook.name).toBe('iOS Testing');
      expect(playbook.steps).toHaveLength(1);
      expect(playbook.inputs?.simulator.required).toBe(true);
    });
  });

  describe('StepExecutionResult', () => {
    it('should represent a successful step', () => {
      const result: StepExecutionResult = {
        step: 'Capture screenshot',
        action: 'ios.snapshot',
        success: true,
        message: 'Screenshot captured',
        data: { path: '/path/to/screenshot.png' },
        elapsedMs: 500,
      };

      expect(result.success).toBe(true);
      expect(result.skipped).toBeUndefined();
    });

    it('should represent a skipped step', () => {
      const result: StepExecutionResult = {
        step: 'Optional step',
        action: 'ios.snapshot',
        success: true,
        message: 'Skipped due to condition',
        skipped: true,
        elapsedMs: 1,
      };

      expect(result.skipped).toBe(true);
    });
  });

  describe('PlaybookExecutionResult', () => {
    it('should summarize playbook execution', () => {
      const result: PlaybookExecutionResult = {
        playbook: 'iOS Testing',
        success: true,
        totalSteps: 3,
        successfulSteps: 2,
        failedSteps: 0,
        skippedSteps: 1,
        stepResults: [],
        variables: { snapshot: { path: '/path' } },
        elapsedMs: 1500,
      };

      expect(result.success).toBe(true);
      expect(result.totalSteps).toBe(3);
      expect(result.successfulSteps + result.failedSteps + result.skippedSteps).toBeLessThanOrEqual(result.totalSteps);
    });
  });
});
