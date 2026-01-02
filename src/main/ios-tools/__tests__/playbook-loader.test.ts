/**
 * Tests for iOS Playbook Loader
 *
 * These tests verify the playbook loading, validation, and directory management
 * functionality for iOS playbooks.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import {
  ensurePlaybooksDirectory,
  loadPlaybook,
  listPlaybooks,
  validatePlaybook,
  getPlaybookInfo,
  playbookExists,
  getPlaybookTemplatesDir,
  getPlaybookBaselinesDir,
  getCommonFlowsDir,
  getCommonScreensDir,
  getCommonAssertionsDir,
  BUILTIN_PLAYBOOKS,
  type IOSPlaybookConfig,
} from '../playbook-loader';

// =============================================================================
// Test Helpers
// =============================================================================

let testDir: string;

/**
 * Create a temporary test directory
 */
function createTestDir(): string {
  const dir = path.join(os.tmpdir(), `playbook-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Clean up test directory
 */
function cleanupTestDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Create a test playbook YAML file
 */
function createTestPlaybook(dir: string, name: string, config: object): string {
  const playbookDir = path.join(dir, name);
  fs.mkdirSync(playbookDir, { recursive: true });
  const configPath = path.join(playbookDir, 'playbook.yaml');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const yaml = require('js-yaml');
  fs.writeFileSync(configPath, yaml.dump(config));
  return configPath;
}

// =============================================================================
// Directory Structure Tests
// =============================================================================

describe('ensurePlaybooksDirectory', () => {
  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it('should create the iOS playbooks directory structure', () => {
    const dir = ensurePlaybooksDirectory(testDir);

    expect(fs.existsSync(dir)).toBe(true);
    expect(dir).toBe(testDir);
  });

  it('should create directories for all built-in playbooks', () => {
    ensurePlaybooksDirectory(testDir);

    for (const playbookId of BUILTIN_PLAYBOOKS) {
      const playbookDir = path.join(testDir, playbookId);
      expect(fs.existsSync(playbookDir)).toBe(true);
    }
  });

  it('should create the Common directory with subdirectories', () => {
    ensurePlaybooksDirectory(testDir);

    const commonDir = path.join(testDir, 'Common');
    expect(fs.existsSync(commonDir)).toBe(true);
    expect(fs.existsSync(path.join(commonDir, 'flows'))).toBe(true);
    expect(fs.existsSync(path.join(commonDir, 'screens'))).toBe(true);
    expect(fs.existsSync(path.join(commonDir, 'assertions'))).toBe(true);
  });

  it('should be idempotent (safe to call multiple times)', () => {
    ensurePlaybooksDirectory(testDir);
    ensurePlaybooksDirectory(testDir);

    expect(fs.existsSync(testDir)).toBe(true);
  });
});

// =============================================================================
// Playbook Loading Tests
// =============================================================================

describe('loadPlaybook', () => {
  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it('should load a valid playbook by name', () => {
    createTestPlaybook(testDir, 'test-playbook', {
      name: 'Test Playbook',
      description: 'A test playbook',
      version: '1.0.0',
      steps: [
        { action: 'ios.snapshot', name: 'Take Screenshot' },
      ],
    });

    const config = loadPlaybook('test-playbook', testDir);

    expect(config.name).toBe('Test Playbook');
    expect(config.description).toBe('A test playbook');
    expect(config.version).toBe('1.0.0');
    expect(config.steps).toHaveLength(1);
    expect(config.steps[0].action).toBe('ios.snapshot');
  });

  it('should load a playbook with inputs and variables', () => {
    createTestPlaybook(testDir, 'input-playbook', {
      name: 'Input Playbook',
      inputs: {
        simulator: {
          description: 'Simulator to use',
          type: 'string',
          required: true,
        },
        timeout: {
          type: 'number',
          default: 30,
        },
      },
      variables: {
        build_success: false,
        iteration: 0,
      },
      steps: [
        { action: 'ios.boot_simulator' },
      ],
    });

    const config = loadPlaybook('input-playbook', testDir);

    expect(config.inputs).toBeDefined();
    expect(config.inputs?.simulator?.required).toBe(true);
    expect(config.inputs?.timeout?.default).toBe(30);
    expect(config.variables?.build_success).toBe(false);
    expect(config.variables?.iteration).toBe(0);
  });

  it('should load a playbook with complex step definitions', () => {
    createTestPlaybook(testDir, 'complex-playbook', {
      name: 'Complex Playbook',
      steps: [
        {
          name: 'Build Project',
          action: 'ios.build',
          inputs: {
            project: '{{ inputs.project_path }}',
            scheme: '{{ inputs.scheme }}',
          },
          store_as: 'build_result',
          on_failure: [
            { action: 'report_build_errors' },
            { action: 'exit_loop', reason: 'Build failed' },
          ],
        },
        {
          name: 'Conditional Step',
          condition: '{{ variables.build_success }}',
          action: 'ios.launch',
        },
      ],
    });

    const config = loadPlaybook('complex-playbook', testDir);

    expect(config.steps).toHaveLength(2);
    expect(config.steps[0].store_as).toBe('build_result');
    expect(config.steps[0].on_failure).toHaveLength(2);
    expect(config.steps[1].condition).toBe('{{ variables.build_success }}');
  });

  it('should throw error for non-existent playbook', () => {
    expect(() => loadPlaybook('non-existent', testDir)).toThrow('Playbook not found');
  });

  it('should throw error for playbook without name', () => {
    createTestPlaybook(testDir, 'no-name', {
      steps: [{ action: 'ios.snapshot' }],
    });

    expect(() => loadPlaybook('no-name', testDir)).toThrow("must have a 'name' field");
  });

  it('should throw error for playbook without steps', () => {
    createTestPlaybook(testDir, 'no-steps', {
      name: 'No Steps Playbook',
    });

    expect(() => loadPlaybook('no-steps', testDir)).toThrow("must have a 'steps' array");
  });

  it('should load playbook by absolute path', () => {
    const configPath = createTestPlaybook(testDir, 'abs-path', {
      name: 'Absolute Path Playbook',
      steps: [{ action: 'ios.snapshot' }],
    });

    const config = loadPlaybook(configPath);

    expect(config.name).toBe('Absolute Path Playbook');
  });
});

// =============================================================================
// Playbook Listing Tests
// =============================================================================

describe('listPlaybooks', () => {
  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it('should list all playbooks in directory', () => {
    createTestPlaybook(testDir, 'playbook-a', {
      name: 'Playbook A',
      description: 'First playbook',
      steps: [{ action: 'ios.snapshot' }],
    });
    createTestPlaybook(testDir, 'playbook-b', {
      name: 'Playbook B',
      version: '2.0.0',
      steps: [{ action: 'ios.inspect' }],
    });

    const playbooks = listPlaybooks(testDir);

    expect(playbooks).toHaveLength(2);

    const playbookA = playbooks.find((p) => p.id === 'playbook-a');
    expect(playbookA).toBeDefined();
    expect(playbookA?.name).toBe('Playbook A');
    expect(playbookA?.description).toBe('First playbook');

    const playbookB = playbooks.find((p) => p.id === 'playbook-b');
    expect(playbookB).toBeDefined();
    expect(playbookB?.version).toBe('2.0.0');
  });

  it('should return empty array for non-existent directory', () => {
    const playbooks = listPlaybooks('/non/existent/path');
    expect(playbooks).toEqual([]);
  });

  it('should skip Common directory', () => {
    // Create Common directory with a playbook.yaml (should be skipped)
    const commonDir = path.join(testDir, 'Common');
    fs.mkdirSync(commonDir, { recursive: true });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const yaml = require('js-yaml');
    fs.writeFileSync(
      path.join(commonDir, 'playbook.yaml'),
      yaml.dump({ name: 'Common', steps: [] })
    );

    // Create a regular playbook
    createTestPlaybook(testDir, 'regular-playbook', {
      name: 'Regular',
      steps: [{ action: 'ios.snapshot' }],
    });

    const playbooks = listPlaybooks(testDir);

    expect(playbooks).toHaveLength(1);
    expect(playbooks[0].id).toBe('regular-playbook');
  });

  it('should skip hidden directories', () => {
    createTestPlaybook(testDir, '.hidden-playbook', {
      name: 'Hidden',
      steps: [{ action: 'ios.snapshot' }],
    });
    createTestPlaybook(testDir, 'visible-playbook', {
      name: 'Visible',
      steps: [{ action: 'ios.snapshot' }],
    });

    const playbooks = listPlaybooks(testDir);

    expect(playbooks).toHaveLength(1);
    expect(playbooks[0].id).toBe('visible-playbook');
  });

  it('should skip directories without playbook.yaml', () => {
    // Create directory without playbook.yaml
    fs.mkdirSync(path.join(testDir, 'empty-dir'));

    createTestPlaybook(testDir, 'valid-playbook', {
      name: 'Valid',
      steps: [{ action: 'ios.snapshot' }],
    });

    const playbooks = listPlaybooks(testDir);

    expect(playbooks).toHaveLength(1);
    expect(playbooks[0].id).toBe('valid-playbook');
  });

  it('should identify built-in playbooks', () => {
    // Create Feature-Ship-Loop (a built-in)
    createTestPlaybook(testDir, 'Feature-Ship-Loop', {
      name: 'iOS Feature Ship Loop',
      steps: [{ action: 'ios.build' }],
    });

    // Create a custom playbook
    createTestPlaybook(testDir, 'custom-playbook', {
      name: 'Custom Playbook',
      steps: [{ action: 'ios.snapshot' }],
    });

    const playbooks = listPlaybooks(testDir);

    const builtIn = playbooks.find((p) => p.id === 'Feature-Ship-Loop');
    expect(builtIn?.builtIn).toBe(true);

    const custom = playbooks.find((p) => p.id === 'custom-playbook');
    expect(custom?.builtIn).toBe(false);
  });
});

// =============================================================================
// Playbook Validation Tests
// =============================================================================

describe('validatePlaybook', () => {
  it('should validate a correct playbook', () => {
    const config: IOSPlaybookConfig = {
      name: 'Valid Playbook',
      steps: [
        { name: 'Step 1', action: 'ios.snapshot' },
        { name: 'Step 2', action: 'ios.inspect' },
      ],
    };

    const result = validatePlaybook(config);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should fail validation for missing name', () => {
    const config = {
      steps: [{ action: 'ios.snapshot' }],
    } as unknown as IOSPlaybookConfig;

    const result = validatePlaybook(config);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Playbook must have a 'name' field");
  });

  it('should fail validation for missing steps', () => {
    const config = {
      name: 'No Steps',
    } as unknown as IOSPlaybookConfig;

    const result = validatePlaybook(config);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Playbook must have a 'steps' array");
  });

  it('should fail validation for empty steps array', () => {
    const config: IOSPlaybookConfig = {
      name: 'Empty Steps',
      steps: [],
    };

    const result = validatePlaybook(config);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Playbook must have at least one step');
  });

  it('should fail validation for step without action', () => {
    const config: IOSPlaybookConfig = {
      name: 'Bad Step',
      steps: [
        { name: 'Good Step', action: 'ios.snapshot' },
        { name: 'Bad Step' } as any, // Missing action
      ],
    };

    const result = validatePlaybook(config);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("'action'"))).toBe(true);
  });

  it('should validate nested on_failure steps', () => {
    const config: IOSPlaybookConfig = {
      name: 'Nested Playbook',
      steps: [
        {
          name: 'Main Step',
          action: 'ios.build',
          on_failure: [
            { name: 'Bad Failure Step' } as any, // Missing action
          ],
        },
      ],
    };

    const result = validatePlaybook(config);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Failure Step'))).toBe(true);
  });

  it('should accept loop steps without action', () => {
    const config: IOSPlaybookConfig = {
      name: 'Loop Playbook',
      steps: [
        {
          loop: '{{ inputs.flows }}',
          as: 'flow',
          steps: [
            { action: 'ios.run_flow' },
          ],
        },
      ],
    };

    const result = validatePlaybook(config);

    expect(result.valid).toBe(true);
  });

  it('should warn about required inputs with defaults', () => {
    const config: IOSPlaybookConfig = {
      name: 'Warning Playbook',
      inputs: {
        param: {
          required: true,
          default: 'value', // Both required and has default
        },
      },
      steps: [{ action: 'ios.snapshot' }],
    };

    const result = validatePlaybook(config);

    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes("'param'"))).toBe(true);
  });

  it('should warn about steps without names', () => {
    const config: IOSPlaybookConfig = {
      name: 'Unnamed Steps',
      steps: [
        { action: 'ios.snapshot' }, // No name
      ],
    };

    const result = validatePlaybook(config);

    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes('name'))).toBe(true);
  });
});

// =============================================================================
// Helper Function Tests
// =============================================================================

describe('getPlaybookInfo', () => {
  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it('should return playbook info for existing playbook', () => {
    createTestPlaybook(testDir, 'my-playbook', {
      name: 'My Playbook',
      description: 'My description',
      version: '1.0.0',
      steps: [{ action: 'ios.snapshot' }],
    });

    const info = getPlaybookInfo('my-playbook', testDir);

    expect(info).toBeDefined();
    expect(info?.id).toBe('my-playbook');
    expect(info?.name).toBe('My Playbook');
    expect(info?.description).toBe('My description');
    expect(info?.version).toBe('1.0.0');
    expect(info?.directory).toBe(path.join(testDir, 'my-playbook'));
    expect(info?.configPath).toBe(path.join(testDir, 'my-playbook', 'playbook.yaml'));
  });

  it('should return undefined for non-existent playbook', () => {
    const info = getPlaybookInfo('non-existent', testDir);
    expect(info).toBeUndefined();
  });
});

describe('playbookExists', () => {
  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it('should return true for existing playbook', () => {
    createTestPlaybook(testDir, 'exists', {
      name: 'Exists',
      steps: [{ action: 'ios.snapshot' }],
    });

    expect(playbookExists('exists', testDir)).toBe(true);
  });

  it('should return false for non-existent playbook', () => {
    expect(playbookExists('does-not-exist', testDir)).toBe(false);
  });

  it('should return false for directory without playbook.yaml', () => {
    fs.mkdirSync(path.join(testDir, 'empty-dir'));

    expect(playbookExists('empty-dir', testDir)).toBe(false);
  });
});

describe('directory path helpers', () => {
  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it('getPlaybookTemplatesDir should return correct path', () => {
    const templatesDir = getPlaybookTemplatesDir('Feature-Ship-Loop', testDir);
    expect(templatesDir).toBe(path.join(testDir, 'Feature-Ship-Loop', 'templates'));
  });

  it('getPlaybookBaselinesDir should return correct path', () => {
    const baselinesDir = getPlaybookBaselinesDir('Regression-Check', testDir);
    expect(baselinesDir).toBe(path.join(testDir, 'Regression-Check', 'baselines'));
  });

  it('getCommonFlowsDir should return correct path', () => {
    const flowsDir = getCommonFlowsDir(testDir);
    expect(flowsDir).toBe(path.join(testDir, 'Common', 'flows'));
  });

  it('getCommonScreensDir should return correct path', () => {
    const screensDir = getCommonScreensDir(testDir);
    expect(screensDir).toBe(path.join(testDir, 'Common', 'screens'));
  });

  it('getCommonAssertionsDir should return correct path', () => {
    const assertionsDir = getCommonAssertionsDir(testDir);
    expect(assertionsDir).toBe(path.join(testDir, 'Common', 'assertions'));
  });
});

// =============================================================================
// Built-in Playbooks Tests
// =============================================================================

describe('BUILTIN_PLAYBOOKS constant', () => {
  it('should contain expected playbook IDs', () => {
    expect(BUILTIN_PLAYBOOKS).toContain('Feature-Ship-Loop');
    expect(BUILTIN_PLAYBOOKS).toContain('Regression-Check');
    expect(BUILTIN_PLAYBOOKS).toContain('Crash-Hunt');
    expect(BUILTIN_PLAYBOOKS).toContain('Design-Review');
    expect(BUILTIN_PLAYBOOKS).toContain('Performance-Check');
  });

  it('should have exactly 5 built-in playbooks', () => {
    expect(BUILTIN_PLAYBOOKS.length).toBe(5);
  });
});
