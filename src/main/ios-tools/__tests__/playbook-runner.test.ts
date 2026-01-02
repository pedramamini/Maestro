/**
 * Tests for iOS Playbook Runner
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock the artifacts module before importing the runner
vi.mock('../artifacts', () => ({
  getArtifactDirectory: vi.fn().mockImplementation(async (sessionId: string) => {
    const dir = path.join(os.tmpdir(), `mock-artifacts-${sessionId}`);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }),
  generateSnapshotId: vi.fn().mockReturnValue('mock-snapshot-id'),
}));

import {
  runPlaybook,
  resolveValue,
  resolveObject,
  evaluateExpression,
  evaluateCondition,
  formatPlaybookResult,
  formatPlaybookResultAsJson,
  formatPlaybookResultAsText,
  formatPlaybookResultCompact,
  ExecutionContext,
  PlaybookRunResult,
  ActionRegistry,
} from '../playbook-runner';
import { IOSPlaybookConfig, PlaybookVariables } from '../playbook-loader';

// =============================================================================
// Test Helpers
// =============================================================================

let testDir: string;

function createTestDir(): string {
  const dir = path.join(
    os.tmpdir(),
    `playbook-runner-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanupTestDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function writePlaybookYaml(dir: string, name: string, config: IOSPlaybookConfig): string {
  const playbookDir = path.join(dir, name);
  fs.mkdirSync(playbookDir, { recursive: true });
  const yamlPath = path.join(playbookDir, 'playbook.yaml');

  // Simple YAML serialization for tests
  const yaml = serializeToYaml(config);
  fs.writeFileSync(yamlPath, yaml);
  return yamlPath;
}

function serializeToYaml(obj: unknown, indent = 0): string {
  const spaces = '  '.repeat(indent);

  if (obj === null || obj === undefined) {
    return 'null';
  }
  if (typeof obj === 'boolean') {
    return obj.toString();
  }
  if (typeof obj === 'number') {
    return obj.toString();
  }
  if (typeof obj === 'string') {
    // Quote strings with special characters
    if (obj.includes('\n') || obj.includes(':') || obj.includes('#') || obj.includes('{')) {
      return `"${obj.replace(/"/g, '\\"')}"`;
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    return obj.map((item) => `${spaces}- ${serializeToYaml(item, indent + 1).trimStart()}`).join('\n');
  }
  if (typeof obj === 'object') {
    const entries = Object.entries(obj as Record<string, unknown>);
    if (entries.length === 0) return '{}';
    return entries
      .map(([key, value]) => {
        const valueStr = serializeToYaml(value, indent + 1);
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          return `${spaces}${key}:\n${valueStr}`;
        }
        if (Array.isArray(value) && value.length > 0) {
          return `${spaces}${key}:\n${valueStr}`;
        }
        return `${spaces}${key}: ${valueStr}`;
      })
      .join('\n');
  }
  return String(obj);
}

// =============================================================================
// Test Setup
// =============================================================================

beforeEach(() => {
  testDir = createTestDir();
});

afterEach(() => {
  cleanupTestDir(testDir);
});

// =============================================================================
// Variable Resolution Tests
// =============================================================================

describe('playbook-runner', () => {
  describe('resolveValue', () => {
    const createContext = (overrides: Partial<ExecutionContext> = {}): ExecutionContext => ({
      playbook: { name: 'Test', steps: [] },
      inputs: { project_path: '/path/to/project', scheme: 'MyApp' },
      variables: { iteration: 1, max_iterations: 10, build_success: true },
      outputs: { build: { bundle_id: 'com.test.app', appPath: '/path/to/app' } },
      collected: { diffs: [{ flow: 'login', diff: 0.1 }] },
      sessionId: 'test-session',
      artifactsDir: '/artifacts',
      cwd: '/workspace',
      actions: {},
      dryRun: false,
      stepTimeout: 60000,
      continueOnError: false,
      loopStack: [],
      startTime: new Date(),
      currentStepIndex: 0,
      totalSteps: 5,
      ...overrides,
    });

    it('returns primitive values unchanged', () => {
      const context = createContext();

      expect(resolveValue(context, 42)).toBe(42);
      expect(resolveValue(context, true)).toBe(true);
      expect(resolveValue(context, null)).toBe(null);
    });

    it('resolves input references', () => {
      const context = createContext();

      expect(resolveValue(context, '{{ inputs.project_path }}')).toBe('/path/to/project');
      expect(resolveValue(context, '{{ inputs.scheme }}')).toBe('MyApp');
    });

    it('resolves variable references', () => {
      const context = createContext();

      expect(resolveValue(context, '{{ variables.iteration }}')).toBe(1);
      expect(resolveValue(context, '{{ variables.max_iterations }}')).toBe(10);
      expect(resolveValue(context, '{{ variables.build_success }}')).toBe(true);
    });

    it('resolves output references with nested properties', () => {
      const context = createContext();

      expect(resolveValue(context, '{{ outputs.build.bundle_id }}')).toBe('com.test.app');
      expect(resolveValue(context, '{{ outputs.build.appPath }}')).toBe('/path/to/app');
    });

    it('resolves special context values', () => {
      const context = createContext();

      expect(resolveValue(context, '{{ artifacts_dir }}')).toBe('/artifacts');
      expect(resolveValue(context, '{{ session_id }}')).toBe('test-session');
      expect(resolveValue(context, '{{ cwd }}')).toBe('/workspace');
    });

    it('handles embedded templates in strings', () => {
      const context = createContext();

      expect(resolveValue(context, 'Build for {{ inputs.scheme }}')).toBe('Build for MyApp');
      // Note: artifacts_dir is a special value that resolves from context, not variables
      expect(resolveValue(context, 'Output to {{ inputs.scheme }}/iter_{{ variables.iteration }}')).toBe(
        'Output to MyApp/iter_1'
      );
    });

    it('returns undefined for missing references', () => {
      const context = createContext();

      expect(resolveValue(context, '{{ inputs.missing }}')).toBeUndefined();
      expect(resolveValue(context, '{{ variables.nonexistent }}')).toBeUndefined();
    });

    it('resolves arrays recursively', () => {
      const context = createContext();

      const result = resolveValue(context, ['{{ inputs.scheme }}', '{{ variables.iteration }}']);
      expect(result).toEqual(['MyApp', 1]);
    });

    it('resolves objects recursively', () => {
      const context = createContext();

      const result = resolveValue(context, {
        scheme: '{{ inputs.scheme }}',
        iteration: '{{ variables.iteration }}',
      });
      expect(result).toEqual({ scheme: 'MyApp', iteration: 1 });
    });

    it('handles loop variable references', () => {
      const context = createContext({
        loopStack: [
          {
            as: 'item',
            item: { name: 'login_flow', path: '/flows/login.yaml' },
            index: 0,
            total: 3,
            startTime: new Date(),
          },
        ],
      });
      context.variables.item = { name: 'login_flow', path: '/flows/login.yaml' };

      expect(resolveValue(context, '{{ item }}')).toEqual({
        name: 'login_flow',
        path: '/flows/login.yaml',
      });
    });
  });

  describe('resolveObject', () => {
    it('resolves all values in an object', () => {
      const context: ExecutionContext = {
        playbook: { name: 'Test', steps: [] },
        inputs: { scheme: 'MyApp', simulator: 'iPhone 15' },
        variables: {},
        outputs: {},
        collected: {},
        sessionId: 'test',
        artifactsDir: '/artifacts',
        cwd: '/workspace',
        actions: {},
        dryRun: false,
        stepTimeout: 60000,
        continueOnError: false,
        loopStack: [],
        startTime: new Date(),
        currentStepIndex: 0,
        totalSteps: 1,
      };

      const result = resolveObject(context, {
        project: '{{ inputs.scheme }}',
        device: '{{ inputs.simulator }}',
        dir: '{{ artifacts_dir }}',
      });

      expect(result).toEqual({
        project: 'MyApp',
        device: 'iPhone 15',
        dir: '/artifacts',
      });
    });
  });

  describe('evaluateExpression', () => {
    const createContext = (): ExecutionContext => ({
      playbook: { name: 'Test', steps: [] },
      inputs: { value: 'test' },
      variables: { count: 5 },
      outputs: {},
      collected: {},
      sessionId: 'test',
      artifactsDir: '/artifacts',
      cwd: '/workspace',
      actions: {},
      dryRun: false,
      stepTimeout: 60000,
      continueOnError: false,
      loopStack: [],
      startTime: new Date(),
      currentStepIndex: 0,
      totalSteps: 1,
    });

    it('handles default filter', () => {
      const context = createContext();

      expect(evaluateExpression(context, "inputs.missing | default('fallback')")).toBe('fallback');
      expect(evaluateExpression(context, "inputs.value | default('fallback')")).toBe('test');
    });

    it('handles length filter', () => {
      const context = createContext();
      context.inputs.items = [1, 2, 3];
      context.inputs.text = 'hello';

      expect(evaluateExpression(context, 'inputs.items | length')).toBe(3);
      expect(evaluateExpression(context, 'inputs.text | length')).toBe(5);
    });

    it('handles json filter', () => {
      const context = createContext();
      context.inputs.data = { key: 'value' };

      expect(evaluateExpression(context, 'inputs.data | json')).toBe('{"key":"value"}');
    });

    it('recognizes range() syntax', () => {
      const context = createContext();

      expect(evaluateExpression(context, 'range(5)')).toBe('range(5)');
    });
  });

  describe('evaluateCondition', () => {
    const createContext = (variables: PlaybookVariables = {}): ExecutionContext => ({
      playbook: { name: 'Test', steps: [] },
      inputs: { enabled: true, disabled: false },
      variables,
      outputs: {},
      collected: {},
      sessionId: 'test',
      artifactsDir: '/artifacts',
      cwd: '/workspace',
      actions: {},
      dryRun: false,
      stepTimeout: 60000,
      continueOnError: false,
      loopStack: [],
      startTime: new Date(),
      currentStepIndex: 0,
      totalSteps: 1,
    });

    it('returns true for truthy values', () => {
      const context = createContext({ flag: true, count: 5, text: 'hello' });

      expect(evaluateCondition(context, 'variables.flag')).toBe(true);
      expect(evaluateCondition(context, 'variables.count')).toBe(true);
      expect(evaluateCondition(context, 'variables.text')).toBe(true);
      expect(evaluateCondition(context, 'inputs.enabled')).toBe(true);
    });

    it('returns false for falsy values', () => {
      const context = createContext({ flag: false, count: 0, text: '' });

      expect(evaluateCondition(context, 'variables.flag')).toBe(false);
      expect(evaluateCondition(context, 'variables.count')).toBe(false);
      expect(evaluateCondition(context, 'variables.text')).toBe(false);
      expect(evaluateCondition(context, 'inputs.disabled')).toBe(false);
    });

    it('returns false for undefined references', () => {
      const context = createContext();

      expect(evaluateCondition(context, 'variables.missing')).toBe(false);
      expect(evaluateCondition(context, 'inputs.nonexistent')).toBe(false);
    });
  });

  // ==========================================================================
  // runPlaybook Tests
  // ==========================================================================

  describe('runPlaybook', () => {
    it('loads and executes simple playbook', async () => {
      const config: IOSPlaybookConfig = {
        name: 'Test Playbook',
        version: '1.0.0',
        steps: [
          { name: 'Step 1', action: 'increment_iteration' },
          { name: 'Step 2', action: 'report_status', inputs: { passed: 1, failed: 0 } },
        ],
        variables: { iteration: 0 },
      };
      writePlaybookYaml(testDir, 'Test-Playbook', config);

      const result = await runPlaybook({
        playbook: 'Test-Playbook',
        inputs: {},
        sessionId: 'test-session',
        playbooksDir: testDir,
      });

      expect(result.success).toBe(true);
      expect(result.data?.stepsExecuted).toBe(2);
      expect(result.data?.stepsPassed).toBe(2);
    });

    it('returns error for missing required inputs', async () => {
      const config: IOSPlaybookConfig = {
        name: 'Test',
        inputs: { name: { required: true, description: 'A name' } },
        steps: [{ name: 'Step', action: 'report_status' }],
      };
      writePlaybookYaml(testDir, 'Test', config);

      const result = await runPlaybook({
        playbook: 'Test',
        inputs: {}, // Missing required 'name'
        sessionId: 'test-session',
        playbooksDir: testDir,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('name');
    });

    it('executes steps in order', async () => {
      const config: IOSPlaybookConfig = {
        name: 'Test',
        steps: [
          { name: 'First', action: 'report_status' },
          { name: 'Second', action: 'report_status' },
          { name: 'Third', action: 'report_status' },
        ],
      };
      writePlaybookYaml(testDir, 'Test', config);

      const result = await runPlaybook({
        playbook: 'Test',
        inputs: {},
        sessionId: 'test-session',
        playbooksDir: testDir,
      });

      expect(result.success).toBe(true);
      expect(result.data?.stepsExecuted).toBe(3);
      expect(result.data?.stepResults.map((s) => s.name)).toEqual(['First', 'Second', 'Third']);
    });

    it('reports progress during execution', async () => {
      const config: IOSPlaybookConfig = {
        name: 'Test',
        steps: [{ name: 'Step', action: 'report_status' }],
      };
      writePlaybookYaml(testDir, 'Test', config);

      const progressUpdates: string[] = [];
      const result = await runPlaybook({
        playbook: 'Test',
        inputs: {},
        sessionId: 'test-session',
        playbooksDir: testDir,
        onProgress: (update) => {
          progressUpdates.push(update.phase);
        },
      });

      expect(result.success).toBe(true);
      expect(progressUpdates).toContain('initializing');
      expect(progressUpdates).toContain('executing');
      expect(progressUpdates).toContain('complete');
    });

    it('handles dry run mode', async () => {
      const config: IOSPlaybookConfig = {
        name: 'Test',
        steps: [
          { name: 'Step 1', action: 'report_status' },
          { name: 'Step 2', action: 'report_status' },
        ],
      };
      writePlaybookYaml(testDir, 'Test', config);

      const result = await runPlaybook({
        playbook: 'Test',
        inputs: {},
        sessionId: 'test-session',
        playbooksDir: testDir,
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.data?.stepsExecuted).toBe(0);
      expect(result.data?.stepsSkipped).toBe(2);
    });

    it('handles unknown actions gracefully', async () => {
      const config: IOSPlaybookConfig = {
        name: 'Test',
        steps: [{ name: 'Unknown Step', action: 'unknown_action' }],
      };
      writePlaybookYaml(testDir, 'Test', config);

      const result = await runPlaybook({
        playbook: 'Test',
        inputs: {},
        sessionId: 'test',
        playbooksDir: testDir,
      });

      expect(result.success).toBe(true);
      expect(result.data?.stepsFailed).toBe(1);
    });

    it('supports custom action handlers', async () => {
      const config: IOSPlaybookConfig = {
        name: 'Test',
        steps: [
          { name: 'Custom', action: 'my_custom_action', inputs: { value: 42 }, store_as: 'result' },
        ],
      };
      writePlaybookYaml(testDir, 'Test', config);

      const customActions: ActionRegistry = {
        my_custom_action: async (_context, inputs) => {
          return { success: true, data: { doubled: (inputs.value as number) * 2 } };
        },
      };

      const result = await runPlaybook({
        playbook: 'Test',
        inputs: {},
        sessionId: 'test',
        playbooksDir: testDir,
        customActions,
      });

      expect(result.success).toBe(true);
      expect(result.data?.finalOutputs.result).toEqual({ doubled: 84 });
    });

    it('stores step outputs with store_as', async () => {
      const config: IOSPlaybookConfig = {
        name: 'Test',
        steps: [{ name: 'Increment', action: 'increment_iteration', store_as: 'increment_result' }],
        variables: { iteration: 0 },
      };
      writePlaybookYaml(testDir, 'Test', config);

      const result = await runPlaybook({
        playbook: 'Test',
        inputs: {},
        sessionId: 'test',
        playbooksDir: testDir,
      });

      expect(result.success).toBe(true);
      expect(result.data?.finalOutputs.increment_result).toEqual({ iteration: 1 });
    });

    it('applies input defaults', async () => {
      const config: IOSPlaybookConfig = {
        name: 'Test',
        inputs: {
          name: { required: true },
          simulator: { default: 'iPhone 15 Pro' },
        },
        steps: [{ name: 'Report', action: 'report_status', inputs: { passed: 1, failed: 0 } }],
      };
      writePlaybookYaml(testDir, 'Test', config);

      const result = await runPlaybook({
        playbook: 'Test',
        inputs: { name: 'test' },
        sessionId: 'test',
        playbooksDir: testDir,
      });

      expect(result.success).toBe(true);
    });
  });

  // ==========================================================================
  // Condition and Loop Tests
  // ==========================================================================

  describe('conditional execution', () => {
    it('skips steps when condition is false', async () => {
      const config: IOSPlaybookConfig = {
        name: 'Test',
        variables: { flag: false },
        steps: [
          { name: 'Conditional', action: 'report_status', condition: 'variables.flag' },
          { name: 'Always', action: 'report_status' },
        ],
      };
      writePlaybookYaml(testDir, 'Test', config);

      const result = await runPlaybook({
        playbook: 'Test',
        inputs: {},
        sessionId: 'test',
        playbooksDir: testDir,
      });

      expect(result.success).toBe(true);
      expect(result.data?.stepResults[0].skipped).toBe(true);
      expect(result.data?.stepResults[1].skipped).toBe(false);
    });

    it('executes steps when condition is true', async () => {
      const config: IOSPlaybookConfig = {
        name: 'Test',
        variables: { flag: true },
        steps: [{ name: 'Conditional', action: 'report_status', condition: 'variables.flag' }],
      };
      writePlaybookYaml(testDir, 'Test', config);

      const result = await runPlaybook({
        playbook: 'Test',
        inputs: {},
        sessionId: 'test',
        playbooksDir: testDir,
      });

      expect(result.success).toBe(true);
      expect(result.data?.stepResults[0].skipped).toBe(false);
    });
  });

  describe('loop execution', () => {
    it('executes loop steps for each item', async () => {
      const config: IOSPlaybookConfig = {
        name: 'Test',
        steps: [
          {
            name: 'Loop',
            loop: '{{ inputs.items }}',
            as: 'item',
            steps: [{ name: 'Process', action: 'report_status' }],
          },
        ],
      };
      writePlaybookYaml(testDir, 'Test', config);

      const processedItems: unknown[] = [];
      const customActions: ActionRegistry = {
        report_status: async (context) => {
          processedItems.push(context.variables.item);
          return { success: true };
        },
      };

      const result = await runPlaybook({
        playbook: 'Test',
        inputs: { items: ['a', 'b', 'c'] },
        sessionId: 'test',
        playbooksDir: testDir,
        customActions,
      });

      expect(result.success).toBe(true);
      expect(processedItems).toEqual(['a', 'b', 'c']);
    });

    it('handles empty loop arrays', async () => {
      const config: IOSPlaybookConfig = {
        name: 'Test',
        steps: [
          {
            name: 'Empty Loop',
            loop: '{{ inputs.items }}',
            as: 'item',
            steps: [{ name: 'Never', action: 'report_status' }],
          },
        ],
      };
      writePlaybookYaml(testDir, 'Test', config);

      const result = await runPlaybook({
        playbook: 'Test',
        inputs: { items: [] },
        sessionId: 'test',
        playbooksDir: testDir,
      });

      expect(result.success).toBe(true);
    });

    it('handles range() syntax in loops', async () => {
      const config: IOSPlaybookConfig = {
        name: 'Test',
        steps: [
          {
            name: 'Range Loop',
            loop: '{{ range(3) }}',
            as: 'i',
            steps: [{ name: 'Count', action: 'track_iteration' }],
          },
        ],
      };
      writePlaybookYaml(testDir, 'Test', config);

      const iterations: number[] = [];
      const customActions: ActionRegistry = {
        track_iteration: async (context) => {
          iterations.push(context.variables.i as number);
          return { success: true };
        },
      };

      const result = await runPlaybook({
        playbook: 'Test',
        inputs: {},
        sessionId: 'test',
        playbooksDir: testDir,
        customActions,
      });

      expect(result.success).toBe(true);
      expect(iterations).toEqual([0, 1, 2]);
    });
  });

  // ==========================================================================
  // Error Handling Tests
  // ==========================================================================

  describe('error handling', () => {
    it('handles playbook load failure', async () => {
      const result = await runPlaybook({
        playbook: 'NonExistent',
        inputs: {},
        sessionId: 'test',
        playbooksDir: testDir,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('executes on_failure handlers when step fails', async () => {
      const failureCalled = { value: false };
      const customActions: ActionRegistry = {
        failing_action: async () => {
          return { success: false, error: 'Intentional failure' };
        },
        handle_failure: async () => {
          failureCalled.value = true;
          return { success: true };
        },
      };

      const config: IOSPlaybookConfig = {
        name: 'Test',
        steps: [
          {
            name: 'Failing Step',
            action: 'failing_action',
            on_failure: [{ name: 'Handle', action: 'handle_failure' }],
          },
        ],
      };
      writePlaybookYaml(testDir, 'Test', config);

      await runPlaybook({
        playbook: 'Test',
        inputs: {},
        sessionId: 'test',
        playbooksDir: testDir,
        customActions,
      });

      expect(failureCalled.value).toBe(true);
    });

    it('respects continue_on_error setting', async () => {
      const customActions: ActionRegistry = {
        failing_action: async () => {
          return { success: false, error: 'Failure' };
        },
      };

      const config: IOSPlaybookConfig = {
        name: 'Test',
        steps: [
          { name: 'Fail', action: 'failing_action', continue_on_error: true },
          { name: 'Continue', action: 'report_status' },
        ],
      };
      writePlaybookYaml(testDir, 'Test', config);

      const result = await runPlaybook({
        playbook: 'Test',
        inputs: {},
        sessionId: 'test',
        playbooksDir: testDir,
        customActions,
      });

      expect(result.success).toBe(true);
      expect(result.data?.stepsExecuted).toBe(2);
    });

    it('stops execution on failure without continue_on_error', async () => {
      const customActions: ActionRegistry = {
        failing_action: async () => {
          return { success: false, error: 'Failure' };
        },
      };

      const config: IOSPlaybookConfig = {
        name: 'Test',
        steps: [
          { name: 'Fail', action: 'failing_action' },
          { name: 'Never', action: 'report_status' },
        ],
      };
      writePlaybookYaml(testDir, 'Test', config);

      const result = await runPlaybook({
        playbook: 'Test',
        inputs: {},
        sessionId: 'test',
        playbooksDir: testDir,
        customActions,
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(false);
      expect(result.data?.stepsExecuted).toBe(1);
    });
  });

  // ==========================================================================
  // Collection Tests
  // ==========================================================================

  describe('data collection', () => {
    it('collects data using record_diff action', async () => {
      const config: IOSPlaybookConfig = {
        name: 'Test',
        steps: [
          {
            name: 'Record',
            action: 'record_diff',
            inputs: { flow: 'login', diffs: { percent: 0.05 } },
          },
          {
            name: 'Record 2',
            action: 'record_diff',
            inputs: { flow: 'logout', diffs: { percent: 0.01 } },
          },
        ],
      };
      writePlaybookYaml(testDir, 'Test', config);

      const result = await runPlaybook({
        playbook: 'Test',
        inputs: {},
        sessionId: 'test',
        playbooksDir: testDir,
      });

      expect(result.success).toBe(true);
      expect(result.data?.collected.diffs).toHaveLength(2);
    });
  });

  // ==========================================================================
  // Result Formatter Tests
  // ==========================================================================

  describe('formatPlaybookResult', () => {
    const createResult = (passed: boolean): PlaybookRunResult => ({
      passed,
      playbook: { name: 'Test Playbook', version: '1.0.0' },
      stepsExecuted: 5,
      stepsPassed: passed ? 5 : 3,
      stepsFailed: passed ? 0 : 2,
      stepsSkipped: 1,
      totalDuration: 12500,
      startTime: new Date('2024-01-01T00:00:00Z'),
      endTime: new Date('2024-01-01T00:00:12Z'),
      stepResults: [
        { name: 'Step 1', success: true, duration: 1000, skipped: false },
        { name: 'Step 2', success: false, duration: 500, skipped: false, error: 'Test error' },
        { name: 'Step 3', success: true, duration: 200, skipped: true, skipReason: 'Condition' },
      ],
      finalVariables: { count: 5 },
      finalOutputs: {},
      artifactsDir: '/artifacts/run-123',
      collected: {},
      error: passed ? undefined : 'Some error',
    });

    it('formats result as markdown', () => {
      const result = createResult(true);
      const formatted = formatPlaybookResult(result);

      expect(formatted).toContain('## ✅ Playbook: Test Playbook');
      expect(formatted).toContain('PASSED');
      expect(formatted).toContain('Steps Executed');
      expect(formatted).toContain('Step 1');
    });

    it('formats failed result with error', () => {
      const result = createResult(false);
      const formatted = formatPlaybookResult(result);

      expect(formatted).toContain('## ❌ Playbook: Test Playbook');
      expect(formatted).toContain('FAILED');
      expect(formatted).toContain('### Error');
      expect(formatted).toContain('Some error');
    });

    it('formats result as JSON', () => {
      const result = createResult(true);
      const formatted = formatPlaybookResultAsJson(result);

      const parsed = JSON.parse(formatted);
      expect(parsed.passed).toBe(true);
      expect(parsed.playbook.name).toBe('Test Playbook');
    });

    it('formats result as text', () => {
      const result = createResult(true);
      const formatted = formatPlaybookResultAsText(result);

      expect(formatted).toContain('PLAYBOOK: Test Playbook');
      expect(formatted).toContain('PASSED');
      expect(formatted).toContain('STEPS');
    });

    it('formats result in compact form', () => {
      const result = createResult(true);
      const formatted = formatPlaybookResultCompact(result);

      expect(formatted).toContain('[PASS]');
      expect(formatted).toContain('Test Playbook');
      expect(formatted).toContain('5/5 steps');
    });
  });

  // ==========================================================================
  // Input Validation Tests
  // ==========================================================================

  describe('input validation', () => {
    it('validates input types', async () => {
      const config: IOSPlaybookConfig = {
        name: 'Test',
        inputs: {
          count: { type: 'number', required: true },
          items: { type: 'array', required: true },
        },
        steps: [],
      };
      writePlaybookYaml(testDir, 'Test', config);

      const result = await runPlaybook({
        playbook: 'Test',
        inputs: { count: 'not-a-number', items: 'not-an-array' },
        sessionId: 'test',
        playbooksDir: testDir,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('must be a number');
    });

    it('accepts valid typed inputs', async () => {
      const config: IOSPlaybookConfig = {
        name: 'Test',
        inputs: {
          count: { type: 'number', required: true },
          items: { type: 'array', required: true },
          enabled: { type: 'boolean', required: true },
        },
        steps: [{ name: 'Report', action: 'report_status' }],
      };
      writePlaybookYaml(testDir, 'Test', config);

      const result = await runPlaybook({
        playbook: 'Test',
        inputs: { count: 5, items: [1, 2, 3], enabled: true },
        sessionId: 'test',
        playbooksDir: testDir,
      });

      expect(result.success).toBe(true);
    });
  });

  // ==========================================================================
  // Wait Action Tests
  // ==========================================================================

  describe('wait action', () => {
    it('waits for specified duration', async () => {
      const config: IOSPlaybookConfig = {
        name: 'Test',
        steps: [{ name: 'Wait', action: 'wait', inputs: { seconds: 0.1 } }],
      };
      writePlaybookYaml(testDir, 'Test', config);

      const start = Date.now();
      await runPlaybook({
        playbook: 'Test',
        inputs: {},
        sessionId: 'test',
        playbooksDir: testDir,
      });
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(90);
    });

    it('skips wait in dry run mode', async () => {
      const config: IOSPlaybookConfig = {
        name: 'Test',
        steps: [{ name: 'Wait', action: 'wait', inputs: { seconds: 10 } }],
      };
      writePlaybookYaml(testDir, 'Test', config);

      const start = Date.now();
      await runPlaybook({
        playbook: 'Test',
        inputs: {},
        sessionId: 'test',
        playbooksDir: testDir,
        dryRun: true,
      });
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(1000);
    });
  });
});
