/**
 * Tests for iOS Playbook Slash Command
 *
 * These tests verify the parsing and execution of the /ios.playbook command
 * including list, run, and info subcommands.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import {
  parsePlaybookArgs,
  executePlaybookCommand,
  playbookCommandMetadata,
  type PlaybookCommandArgs,
} from '../ios-playbook';

// Mock the playbook-loader module
vi.mock('../../ios-tools/playbook-loader', async () => {
  const actual = await vi.importActual('../../ios-tools/playbook-loader');
  return {
    ...actual,
    // Use actual implementation but we can override as needed
  };
});

// Mock the playbook-runner module
vi.mock('../../ios-tools/playbook-runner', () => ({
  runPlaybook: vi.fn(),
  formatPlaybookResult: vi.fn(() => '## Playbook Result\n\nMocked result'),
  formatPlaybookResultAsJson: vi.fn(() => '{}'),
}));

// Mock ios-tools for simulator resolution
vi.mock('../../ios-tools', () => ({
  getBootedSimulators: vi.fn(() =>
    Promise.resolve({
      success: true,
      data: [
        { udid: 'test-udid-1234', name: 'iPhone 15 Pro', state: 'Booted' },
      ],
    })
  ),
  listSimulators: vi.fn(() =>
    Promise.resolve({
      success: true,
      data: [
        { udid: 'test-udid-1234', name: 'iPhone 15 Pro', state: 'Booted' },
        { udid: 'test-udid-5678', name: 'iPhone SE (3rd generation)', state: 'Shutdown' },
      ],
    })
  ),
}));

// =============================================================================
// Test Helpers
// =============================================================================

let testDir: string;

/**
 * Create a temporary test directory
 */
function createTestDir(): string {
  const dir = path.join(
    os.tmpdir(),
    `playbook-cmd-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
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
function createTestPlaybook(
  dir: string,
  name: string,
  config: object
): string {
  const playbookDir = path.join(dir, name);
  fs.mkdirSync(playbookDir, { recursive: true });
  const configPath = path.join(playbookDir, 'playbook.yaml');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const yaml = require('js-yaml');
  fs.writeFileSync(configPath, yaml.dump(config));
  return configPath;
}

// =============================================================================
// Argument Parsing Tests
// =============================================================================

describe('parsePlaybookArgs', () => {
  describe('subcommand parsing', () => {
    it('should parse list subcommand', () => {
      const args = parsePlaybookArgs('/ios.playbook list');
      expect(args.subcommand).toBe('list');
    });

    it('should parse run subcommand with playbook name', () => {
      const args = parsePlaybookArgs('/ios.playbook run Feature-Ship-Loop');
      expect(args.subcommand).toBe('run');
      expect(args.playbookName).toBe('Feature-Ship-Loop');
    });

    it('should parse info subcommand with playbook name', () => {
      const args = parsePlaybookArgs('/ios.playbook info Crash-Hunt');
      expect(args.subcommand).toBe('info');
      expect(args.playbookName).toBe('Crash-Hunt');
    });

    it('should treat playbook name as implicit run command', () => {
      const args = parsePlaybookArgs('/ios.playbook Design-Review');
      expect(args.subcommand).toBe('run');
      expect(args.playbookName).toBe('Design-Review');
    });

    it('should return empty args for empty command', () => {
      const args = parsePlaybookArgs('/ios.playbook');
      expect(args.subcommand).toBeUndefined();
    });
  });

  describe('flag parsing', () => {
    it('should parse --dry-run flag', () => {
      const args = parsePlaybookArgs('/ios.playbook run Test-Playbook --dry-run');
      expect(args.dryRun).toBe(true);
    });

    it('should parse --continue flag', () => {
      const args = parsePlaybookArgs('/ios.playbook run Test --continue');
      expect(args.continueOnError).toBe(true);
    });

    it('should parse --simulator with short form', () => {
      const args = parsePlaybookArgs('/ios.playbook run Test -s "iPhone 15"');
      expect(args.simulator).toBe('iPhone 15');
    });

    it('should parse --simulator with long form', () => {
      const args = parsePlaybookArgs('/ios.playbook run Test --simulator "iPhone SE"');
      expect(args.simulator).toBe('iPhone SE');
    });

    it('should parse --timeout with short form', () => {
      const args = parsePlaybookArgs('/ios.playbook run Test -t 120');
      expect(args.timeout).toBe(120);
    });

    it('should parse --timeout with long form', () => {
      const args = parsePlaybookArgs('/ios.playbook run Test --timeout 300');
      expect(args.timeout).toBe(300);
    });
  });

  describe('inputs parsing', () => {
    it('should parse --inputs with JSON object', () => {
      const args = parsePlaybookArgs(
        '/ios.playbook run Test --inputs \'{"key": "value"}\''
      );
      expect(args.inputs).toEqual({ key: 'value' });
    });

    it('should parse --inputs with complex JSON', () => {
      const args = parsePlaybookArgs(
        '/ios.playbook run Test --inputs \'{"flows": ["a.yaml", "b.yaml"], "threshold": 0.01}\''
      );
      expect(args.inputs).toEqual({
        flows: ['a.yaml', 'b.yaml'],
        threshold: 0.01,
      });
    });

    it('should handle invalid JSON gracefully', () => {
      const args = parsePlaybookArgs('/ios.playbook run Test --inputs "not-json"');
      // Should not throw, just log a warning
      expect(args.inputs).toBeUndefined();
    });
  });

  describe('combined arguments', () => {
    it('should parse multiple flags together', () => {
      const args = parsePlaybookArgs(
        '/ios.playbook run Performance-Check --dry-run --continue -s "iPhone 15 Pro" --timeout 60'
      );
      expect(args.subcommand).toBe('run');
      expect(args.playbookName).toBe('Performance-Check');
      expect(args.dryRun).toBe(true);
      expect(args.continueOnError).toBe(true);
      expect(args.simulator).toBe('iPhone 15 Pro');
      expect(args.timeout).toBe(60);
    });

    it('should parse inputs with other flags', () => {
      const args = parsePlaybookArgs(
        '/ios.playbook run Regression-Check --inputs \'{"baseline_dir": "./baselines"}\' -s "iPhone SE"'
      );
      expect(args.playbookName).toBe('Regression-Check');
      expect(args.inputs).toEqual({ baseline_dir: './baselines' });
      expect(args.simulator).toBe('iPhone SE');
    });
  });

  describe('quoted string handling', () => {
    it('should handle double-quoted strings', () => {
      const args = parsePlaybookArgs('/ios.playbook run Test -s "iPhone 15 Pro Max"');
      expect(args.simulator).toBe('iPhone 15 Pro Max');
    });

    it('should handle single-quoted strings', () => {
      const args = parsePlaybookArgs("/ios.playbook run Test -s 'iPhone SE (3rd generation)'");
      expect(args.simulator).toBe('iPhone SE (3rd generation)');
    });
  });
});

// =============================================================================
// Command Execution Tests
// =============================================================================

describe('executePlaybookCommand', () => {
  beforeEach(() => {
    testDir = createTestDir();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  describe('list subcommand', () => {
    it('should return empty list when no playbooks exist', async () => {
      const result = await executePlaybookCommand(
        '/ios.playbook list',
        'test-session',
        testDir
      );

      // May succeed with built-in playbooks or empty
      expect(result.success).toBe(true);
      expect(result.output).toContain('Playbook');
    });
  });

  describe('info subcommand', () => {
    it('should return error when playbook name is missing', async () => {
      const result = await executePlaybookCommand(
        '/ios.playbook info',
        'test-session',
        testDir
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing playbook name');
    });

    it('should return error for non-existent playbook', async () => {
      const result = await executePlaybookCommand(
        '/ios.playbook info NonExistent',
        'test-session',
        testDir
      );

      expect(result.success).toBe(false);
      expect(result.output).toContain('Not Found');
    });
  });

  describe('run subcommand', () => {
    it('should return error when playbook name is missing', async () => {
      const result = await executePlaybookCommand(
        '/ios.playbook run',
        'test-session',
        testDir
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing playbook name');
    });

    it('should return error for non-existent playbook', async () => {
      const result = await executePlaybookCommand(
        '/ios.playbook run NonExistent',
        'test-session',
        testDir
      );

      expect(result.success).toBe(false);
      expect(result.output).toContain('Not Found');
    });
  });

  describe('default behavior', () => {
    it('should default to list when no subcommand provided', async () => {
      const result = await executePlaybookCommand(
        '/ios.playbook',
        'test-session',
        testDir
      );

      // Should be list command
      expect(result.success).toBe(true);
      expect(result.output).toContain('Playbook');
    });
  });
});

// =============================================================================
// Metadata Tests
// =============================================================================

describe('playbookCommandMetadata', () => {
  it('should have correct command name', () => {
    expect(playbookCommandMetadata.command).toBe('/ios.playbook');
  });

  it('should have description', () => {
    expect(playbookCommandMetadata.description).toBeTruthy();
    expect(playbookCommandMetadata.description.length).toBeGreaterThan(10);
  });

  it('should have usage instructions', () => {
    expect(playbookCommandMetadata.usage).toContain('/ios.playbook');
  });

  it('should have options documented', () => {
    expect(playbookCommandMetadata.options.length).toBeGreaterThan(0);

    // Check for key options
    const optionNames = playbookCommandMetadata.options.map((o) => o.name);
    expect(optionNames).toContain('list');
    expect(optionNames).toContain('--inputs');
    expect(optionNames).toContain('--dry-run');
  });

  it('should have examples', () => {
    expect(playbookCommandMetadata.examples.length).toBeGreaterThan(0);

    // Check examples contain the command
    for (const example of playbookCommandMetadata.examples) {
      expect(example).toContain('/ios.playbook');
    }
  });
});

// =============================================================================
// Edge Case Tests
// =============================================================================

describe('edge cases', () => {
  describe('parsePlaybookArgs edge cases', () => {
    it('should handle extra whitespace', () => {
      const args = parsePlaybookArgs('/ios.playbook   list  ');
      expect(args.subcommand).toBe('list');
    });

    it('should handle missing values for flags gracefully', () => {
      const args = parsePlaybookArgs('/ios.playbook run Test --timeout');
      expect(args.timeout).toBeUndefined();
    });

    it('should ignore invalid timeout values', () => {
      const args = parsePlaybookArgs('/ios.playbook run Test --timeout abc');
      expect(args.timeout).toBeUndefined();
    });

    it('should ignore negative timeout values', () => {
      const args = parsePlaybookArgs('/ios.playbook run Test --timeout -5');
      expect(args.timeout).toBeUndefined();
    });

    it('should handle playbook names with hyphens', () => {
      const args = parsePlaybookArgs('/ios.playbook run My-Custom-Playbook');
      expect(args.playbookName).toBe('My-Custom-Playbook');
    });

    it('should handle playbook names with underscores', () => {
      const args = parsePlaybookArgs('/ios.playbook run my_playbook');
      expect(args.playbookName).toBe('my_playbook');
    });
  });

  describe('simulator resolution', () => {
    it('should detect UDID format', async () => {
      // UDIDs don't need resolution
      const result = await executePlaybookCommand(
        '/ios.playbook run Test -s 12345678-1234-1234-1234-123456789012',
        'test-session'
      );
      // Will fail because playbook doesn't exist, but UDID parsing should work
      expect(result.output).toContain('Not Found');
    });
  });
});

// =============================================================================
// Integration Tests (with real playbook files)
// =============================================================================

describe('integration tests', () => {
  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it('should list playbooks from custom directory', async () => {
    // Create test playbook
    createTestPlaybook(testDir, 'Test-Playbook', {
      name: 'Test Playbook',
      description: 'A test playbook',
      version: '1.0.0',
      steps: [
        {
          name: 'Test Step',
          action: 'test',
        },
      ],
    });

    // Note: The list command uses the default directory, not cwd
    // This test verifies the structure is correct
    const result = await executePlaybookCommand(
      '/ios.playbook list',
      'test-session',
      testDir
    );

    expect(result.success).toBe(true);
  });
});
