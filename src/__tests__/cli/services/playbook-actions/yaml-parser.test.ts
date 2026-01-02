/**
 * Tests for YAML Playbook Parser
 */

import {
  parseYamlPlaybook,
  parseShorthandStep,
  PlaybookParseError,
} from '../../../../cli/services/playbook-actions/yaml-parser';

describe('YAML Playbook Parser', () => {
  describe('parseYamlPlaybook', () => {
    it('should parse a minimal playbook', () => {
      const yaml = `
name: Simple Playbook
steps:
  - action: ios.snapshot
`;

      const playbook = parseYamlPlaybook(yaml);

      expect(playbook.name).toBe('Simple Playbook');
      expect(playbook.steps).toHaveLength(1);
      expect(playbook.steps[0].action).toBe('ios.snapshot');
    });

    it('should parse a complete playbook', () => {
      const yaml = `
name: iOS Testing
description: Test the iOS app
inputs:
  simulator:
    type: string
    required: true
    description: Target simulator
  app:
    type: string
    required: false
    default: com.example.app
steps:
  - name: Capture Screenshot
    action: ios.snapshot
    inputs:
      simulator: "{{ inputs.simulator }}"
      app: "{{ inputs.app }}"
    store_as: snapshot_result
  - name: Verify No Crashes
    action: ios.assert_no_crash
    condition: "{{ variables.snapshot_result.success }}"
`;

      const playbook = parseYamlPlaybook(yaml);

      expect(playbook.name).toBe('iOS Testing');
      expect(playbook.description).toBe('Test the iOS app');
      expect(playbook.inputs?.simulator.required).toBe(true);
      expect(playbook.inputs?.app.default).toBe('com.example.app');
      expect(playbook.steps).toHaveLength(2);
      expect(playbook.steps[0].store_as).toBe('snapshot_result');
      expect(playbook.steps[1].condition).toBe('{{ variables.snapshot_result.success }}');
    });

    it('should parse steps with on_failure', () => {
      const yaml = `
name: With Failure Handler
steps:
  - name: Main Step
    action: ios.snapshot
    on_failure:
      - action: log.error
        inputs:
          message: Snapshot failed
`;

      const playbook = parseYamlPlaybook(yaml);

      expect(playbook.steps[0].on_failure).toBeDefined();
      expect(playbook.steps[0].on_failure).toHaveLength(1);
      expect(playbook.steps[0].on_failure![0].action).toBe('log.error');
    });

    it('should parse steps with continue_on_error', () => {
      const yaml = `
name: Continue On Error
steps:
  - action: ios.snapshot
    continue_on_error: true
`;

      const playbook = parseYamlPlaybook(yaml);

      expect(playbook.steps[0].continue_on_error).toBe(true);
    });

    it('should throw for invalid YAML', () => {
      const yaml = `
name: Bad YAML
steps:
  - action: ios.snapshot
    invalid:: nested:: colon
`;

      expect(() => parseYamlPlaybook(yaml)).toThrow(PlaybookParseError);
    });

    it('should throw for missing name', () => {
      const yaml = `
steps:
  - action: ios.snapshot
`;

      expect(() => parseYamlPlaybook(yaml)).toThrow("Playbook must have a 'name' field");
    });

    it('should throw for missing steps', () => {
      const yaml = `
name: No Steps
`;

      expect(() => parseYamlPlaybook(yaml)).toThrow("Playbook must have a 'steps' array");
    });

    it('should throw for empty steps array', () => {
      const yaml = `
name: Empty Steps
steps: []
`;

      expect(() => parseYamlPlaybook(yaml)).toThrow('Playbook must have at least one step');
    });

    it('should throw for step without action', () => {
      const yaml = `
name: No Action
steps:
  - name: Missing action
    inputs:
      foo: bar
`;

      expect(() => parseYamlPlaybook(yaml)).toThrow("Step 1 must have an 'action' field");
    });

    it('should throw for non-string action', () => {
      const yaml = `
name: Bad Action
steps:
  - action: 123
`;

      expect(() => parseYamlPlaybook(yaml)).toThrow("Step 1 must have an 'action' field");
    });

    it('should throw for non-object inputs', () => {
      const yaml = `
name: Bad Inputs
steps:
  - action: ios.snapshot
    inputs: "not an object"
`;

      expect(() => parseYamlPlaybook(yaml)).toThrow("Step 1: 'inputs' must be an object");
    });

    it('should throw for non-string name in step', () => {
      const yaml = `
name: Bad Step Name
steps:
  - name: 123
    action: ios.snapshot
`;

      expect(() => parseYamlPlaybook(yaml)).toThrow("Step 1: 'name' must be a string");
    });

    it('should throw for non-string store_as', () => {
      const yaml = `
name: Bad Store As
steps:
  - action: ios.snapshot
    store_as: 123
`;

      expect(() => parseYamlPlaybook(yaml)).toThrow("Step 1: 'store_as' must be a string");
    });

    it('should throw for non-string condition', () => {
      const yaml = `
name: Bad Condition
steps:
  - action: ios.snapshot
    condition: true
`;

      expect(() => parseYamlPlaybook(yaml)).toThrow("Step 1: 'condition' must be a string");
    });

    it('should throw for non-boolean continue_on_error', () => {
      const yaml = `
name: Bad Continue
steps:
  - action: ios.snapshot
    continue_on_error: "yes"
`;

      expect(() => parseYamlPlaybook(yaml)).toThrow("Step 1: 'continue_on_error' must be a boolean");
    });

    it('should throw for non-array on_failure', () => {
      const yaml = `
name: Bad On Failure
steps:
  - action: ios.snapshot
    on_failure: "not an array"
`;

      expect(() => parseYamlPlaybook(yaml)).toThrow("Step 1: 'on_failure' must be an array");
    });

    it('should include file info in parse errors', () => {
      const yaml = `
steps:
  - action: ios.snapshot
`;

      try {
        parseYamlPlaybook(yaml, '/path/to/playbook.yaml');
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(PlaybookParseError);
        expect((error as PlaybookParseError).file).toBe('/path/to/playbook.yaml');
      }
    });
  });

  describe('parseShorthandStep', () => {
    it('should parse action-only shorthand', () => {
      const step = parseShorthandStep('ios.snapshot');

      expect(step.action).toBe('ios.snapshot');
      expect(step.inputs).toBeUndefined();
    });

    it('should parse shorthand with flags', () => {
      const step = parseShorthandStep('ios.snapshot --include-crash');

      expect(step.action).toBe('ios.snapshot');
      expect(step.inputs?.include_crash).toBe(true);
    });

    it('should parse shorthand with key-value pairs', () => {
      const step = parseShorthandStep("ios.snapshot --simulator 'iPhone 15 Pro' --app com.example");

      expect(step.action).toBe('ios.snapshot');
      expect(step.inputs?.simulator).toBe('iPhone 15 Pro');
      expect(step.inputs?.app).toBe('com.example');
    });

    it('should convert dashes to underscores in keys', () => {
      const step = parseShorthandStep('ios.snapshot --include-crash --log-duration 120');

      expect(step.inputs?.include_crash).toBe(true);
      expect(step.inputs?.log_duration).toBe('120');
    });

    it('should remove quotes from values', () => {
      const step = parseShorthandStep('ios.snapshot --simulator "iPhone 15"');

      expect(step.inputs?.simulator).toBe('iPhone 15');
    });

    it('should throw for empty shorthand', () => {
      expect(() => parseShorthandStep('')).toThrow('Empty action shorthand');
    });

    it('should handle multiple flags', () => {
      const step = parseShorthandStep('ios.snapshot --include-crash --verbose --debug');

      expect(step.inputs?.include_crash).toBe(true);
      expect(step.inputs?.verbose).toBe(true);
      expect(step.inputs?.debug).toBe(true);
    });
  });
});
