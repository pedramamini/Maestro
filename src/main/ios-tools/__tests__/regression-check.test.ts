/**
 * Tests for iOS Playbook - Regression Check Executor
 *
 * These tests verify the regression check playbook execution, screenshot
 * comparison, baseline management, and report generation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import {
  runRegressionCheck,
  formatRegressionCheckResult,
  formatRegressionCheckResultAsJson,
  formatRegressionCheckResultCompact,
  type RegressionCheckInputs,
  type RegressionCheckOptions,
  type RegressionCheckResult,
  type RegressionFlow,
} from '../playbooks/regression-check';
import { ensurePlaybooksDirectory } from '../playbook-loader';

// =============================================================================
// Mocks
// =============================================================================

vi.mock('../simulator', () => ({
  getBootedSimulators: vi.fn().mockResolvedValue({
    success: true,
    data: [
      {
        udid: 'test-udid-1234',
        name: 'iPhone 15 Pro',
        state: 'Booted',
        iosVersion: '17.0',
        isAvailable: true,
        runtime: 'com.apple.CoreSimulator.SimRuntime.iOS-17-0',
        deviceType: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15-Pro',
      },
    ],
  }),
  getSimulator: vi.fn().mockResolvedValue({
    success: true,
    data: {
      udid: 'test-udid-1234',
      name: 'iPhone 15 Pro',
      state: 'Booted',
      iosVersion: '17.0',
      isAvailable: true,
      runtime: 'com.apple.CoreSimulator.SimRuntime.iOS-17-0',
      deviceType: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15-Pro',
    },
  }),
  bootSimulator: vi.fn().mockResolvedValue({ success: true }),
  listSimulators: vi.fn().mockResolvedValue({
    success: true,
    data: [
      {
        udid: 'test-udid-1234',
        name: 'iPhone 15 Pro',
        state: 'Booted',
        iosVersion: '17.0',
        isAvailable: true,
        runtime: 'com.apple.CoreSimulator.SimRuntime.iOS-17-0',
        deviceType: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15-Pro',
      },
    ],
  }),
  launchApp: vi.fn().mockResolvedValue({ success: true }),
  terminateApp: vi.fn().mockResolvedValue({ success: true }),
  installApp: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('../build', () => ({
  build: vi.fn().mockResolvedValue({
    success: true,
    data: {
      appPath: '/tmp/test.app',
      scheme: 'TestApp',
      configuration: 'Debug',
      buildTime: 5000,
    },
  }),
  detectProject: vi.fn().mockResolvedValue({
    success: true,
    data: {
      path: '/tmp/TestApp.xcodeproj',
      type: 'xcodeproj',
    },
  }),
}));

vi.mock('../capture', () => ({
  screenshot: vi.fn().mockResolvedValue({
    success: true,
    data: {
      path: '/tmp/screenshot.png',
      size: 1024,
      timestamp: new Date(),
    },
  }),
}));

vi.mock('../flow-runner', () => ({
  runFlow: vi.fn().mockResolvedValue({
    success: true,
    data: {
      passed: true,
      duration: 1000,
      flowPath: '/tmp/flow.yaml',
      udid: 'test-udid-1234',
      totalSteps: 5,
      passedSteps: 5,
      failedSteps: 0,
      skippedSteps: 0,
      steps: [],
      rawOutput: 'Flow passed',
      exitCode: 0,
    },
  }),
}));

vi.mock('../artifacts', () => ({
  getArtifactDirectory: vi.fn().mockImplementation(async (sessionId: string) => {
    const dir = path.join(os.tmpdir(), 'regression-test-artifacts', sessionId);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }),
  generateSnapshotId: vi.fn().mockReturnValue('snapshot-123'),
}));

vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// =============================================================================
// Test Helpers
// =============================================================================

let testDir: string;
let playbooksDir: string;

/**
 * Create a temporary test directory
 */
function createTestDir(): string {
  const dir = path.join(os.tmpdir(), `regression-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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
 * Create a test flow YAML file
 */
function createTestFlow(dir: string, name: string): string {
  const flowPath = path.join(dir, `${name}.yaml`);
  fs.writeFileSync(
    flowPath,
    `# Test flow: ${name}
- launchApp
- tap: "Home"
- assertVisible: "Welcome"
`
  );
  return flowPath;
}

/**
 * Create a test baseline image
 */
function createTestBaseline(baselineDir: string, flowName: string): string {
  const flowDir = path.join(baselineDir, flowName);
  fs.mkdirSync(flowDir, { recursive: true });
  const baselinePath = path.join(flowDir, 'final.png');
  // Create a simple PNG-like file (just bytes for testing)
  const pngHeader = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  fs.writeFileSync(baselinePath, Buffer.concat([pngHeader, Buffer.alloc(100, 0)]));
  return baselinePath;
}

/**
 * Create minimal options for testing
 */
function createMinimalOptions(overrides: Partial<RegressionCheckOptions> = {}): RegressionCheckOptions {
  return {
    inputs: {
      app_path: '/tmp/test.app',
      flows: [{ name: 'login', path: './flows/login.yaml' }],
      baseline_dir: path.join(testDir, 'baselines'),
    },
    sessionId: 'test-session-123',
    ...overrides,
  };
}

// =============================================================================
// Input Validation Tests
// =============================================================================

describe('runRegressionCheck - Input Validation', () => {
  beforeEach(() => {
    testDir = createTestDir();
    playbooksDir = createTestDir();
    ensurePlaybooksDirectory(playbooksDir);

    // Create playbook.yaml for the Regression-Check playbook
    const playbookDir = path.join(playbooksDir, 'Regression-Check');
    fs.mkdirSync(playbookDir, { recursive: true });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const yaml = require('js-yaml');
    fs.writeFileSync(
      path.join(playbookDir, 'playbook.yaml'),
      yaml.dump({
        name: 'iOS Regression Check',
        description: 'Run flows and compare screenshots against baselines',
        version: '1.0.0',
        inputs: {
          flows: { type: 'array', required: true },
          baseline_dir: { required: true },
        },
        variables: {
          total_flows: 0,
          flows_run: 0,
          regressions_found: 0,
        },
        steps: [{ action: 'ios.boot_simulator' }],
      })
    );
  });

  afterEach(() => {
    cleanupTestDir(testDir);
    cleanupTestDir(playbooksDir);
    vi.clearAllMocks();
  });

  it('should reject inputs missing both app_path and project_path', async () => {
    const options: RegressionCheckOptions = {
      inputs: {
        flows: [{ name: 'test', path: './test.yaml' }],
        baseline_dir: '/tmp/baselines',
      } as RegressionCheckInputs,
      sessionId: 'test-session',
      playbookPath: path.join(playbooksDir, 'Regression-Check', 'playbook.yaml'),
    };

    const result = await runRegressionCheck(options);

    expect(result.success).toBe(false);
    expect(result.error).toContain('app_path or project_path is required');
  });

  it('should reject inputs with project_path but missing scheme', async () => {
    const options: RegressionCheckOptions = {
      inputs: {
        project_path: '/tmp/MyApp.xcworkspace',
        flows: [{ name: 'test', path: './test.yaml' }],
        baseline_dir: '/tmp/baselines',
      },
      sessionId: 'test-session',
      playbookPath: path.join(playbooksDir, 'Regression-Check', 'playbook.yaml'),
    };

    const result = await runRegressionCheck(options);

    expect(result.success).toBe(false);
    expect(result.error).toContain('scheme is required');
  });

  it('should reject empty flows array', async () => {
    const options: RegressionCheckOptions = {
      inputs: {
        app_path: '/tmp/test.app',
        flows: [],
        baseline_dir: '/tmp/baselines',
      },
      sessionId: 'test-session',
      playbookPath: path.join(playbooksDir, 'Regression-Check', 'playbook.yaml'),
    };

    const result = await runRegressionCheck(options);

    expect(result.success).toBe(false);
    expect(result.error).toContain('flows');
  });

  it('should reject missing baseline_dir', async () => {
    const options: RegressionCheckOptions = {
      inputs: {
        app_path: '/tmp/test.app',
        flows: [{ name: 'test', path: './test.yaml' }],
      } as RegressionCheckInputs,
      sessionId: 'test-session',
      playbookPath: path.join(playbooksDir, 'Regression-Check', 'playbook.yaml'),
    };

    const result = await runRegressionCheck(options);

    expect(result.success).toBe(false);
    expect(result.error).toContain('baseline_dir');
  });

  it('should reject threshold outside 0-1 range', async () => {
    const options: RegressionCheckOptions = {
      inputs: {
        app_path: '/tmp/test.app',
        flows: [{ name: 'test', path: './test.yaml' }],
        baseline_dir: '/tmp/baselines',
        threshold: 1.5,
      },
      sessionId: 'test-session',
      playbookPath: path.join(playbooksDir, 'Regression-Check', 'playbook.yaml'),
    };

    const result = await runRegressionCheck(options);

    expect(result.success).toBe(false);
    expect(result.error).toContain('threshold must be between 0 and 1');
  });
});

// =============================================================================
// Dry Run Tests
// =============================================================================

describe('runRegressionCheck - Dry Run', () => {
  beforeEach(() => {
    testDir = createTestDir();
    playbooksDir = createTestDir();
    ensurePlaybooksDirectory(playbooksDir);

    const playbookDir = path.join(playbooksDir, 'Regression-Check');
    fs.mkdirSync(playbookDir, { recursive: true });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const yaml = require('js-yaml');
    fs.writeFileSync(
      path.join(playbookDir, 'playbook.yaml'),
      yaml.dump({
        name: 'iOS Regression Check',
        version: '1.0.0',
        steps: [{ action: 'ios.boot_simulator' }],
      })
    );
  });

  afterEach(() => {
    cleanupTestDir(testDir);
    cleanupTestDir(playbooksDir);
    vi.clearAllMocks();
  });

  it('should validate without executing when dryRun is true', async () => {
    const options = createMinimalOptions({
      playbookPath: path.join(playbooksDir, 'Regression-Check', 'playbook.yaml'),
      dryRun: true,
    });

    const result = await runRegressionCheck(options);

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.flowResults).toHaveLength(0);
    expect(result.data!.skippedFlows).toBe(1);
  });

  it('should return correct playbook info in dry run', async () => {
    const options = createMinimalOptions({
      playbookPath: path.join(playbooksDir, 'Regression-Check', 'playbook.yaml'),
      dryRun: true,
    });

    const result = await runRegressionCheck(options);

    expect(result.data!.playbook.name).toBe('iOS Regression Check');
    expect(result.data!.playbook.version).toBe('1.0.0');
  });

  it('should return simulator info in dry run', async () => {
    const options = createMinimalOptions({
      playbookPath: path.join(playbooksDir, 'Regression-Check', 'playbook.yaml'),
      dryRun: true,
    });

    const result = await runRegressionCheck(options);

    expect(result.data!.simulator).toBeDefined();
    expect(result.data!.simulator.name).toBe('iPhone 15 Pro');
    expect(result.data!.simulator.iosVersion).toBe('17.0');
  });
});

// =============================================================================
// Progress Reporting Tests
// =============================================================================

describe('runRegressionCheck - Progress Reporting', () => {
  beforeEach(() => {
    testDir = createTestDir();
    playbooksDir = createTestDir();
    ensurePlaybooksDirectory(playbooksDir);

    const playbookDir = path.join(playbooksDir, 'Regression-Check');
    fs.mkdirSync(playbookDir, { recursive: true });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const yaml = require('js-yaml');
    fs.writeFileSync(
      path.join(playbookDir, 'playbook.yaml'),
      yaml.dump({
        name: 'iOS Regression Check',
        version: '1.0.0',
        steps: [{ action: 'ios.boot_simulator' }],
      })
    );
  });

  afterEach(() => {
    cleanupTestDir(testDir);
    cleanupTestDir(playbooksDir);
    vi.clearAllMocks();
  });

  it('should call progress callback during dry run', async () => {
    const progressUpdates: string[] = [];
    const onProgress = vi.fn((update) => {
      progressUpdates.push(update.phase);
    });

    const options = createMinimalOptions({
      playbookPath: path.join(playbooksDir, 'Regression-Check', 'playbook.yaml'),
      dryRun: true,
      onProgress,
    });

    await runRegressionCheck(options);

    expect(onProgress).toHaveBeenCalled();
    expect(progressUpdates).toContain('initializing');
  });

  it('should include phase, message, and percentComplete in progress updates', async () => {
    const updates: { phase: string; message: string; percentComplete: number }[] = [];
    const onProgress = vi.fn((update) => {
      updates.push({
        phase: update.phase,
        message: update.message,
        percentComplete: update.percentComplete,
      });
    });

    const options = createMinimalOptions({
      playbookPath: path.join(playbooksDir, 'Regression-Check', 'playbook.yaml'),
      dryRun: true,
      onProgress,
    });

    await runRegressionCheck(options);

    for (const update of updates) {
      expect(update.phase).toBeDefined();
      expect(update.message).toBeDefined();
      expect(typeof update.percentComplete).toBe('number');
      expect(update.percentComplete).toBeGreaterThanOrEqual(0);
      expect(update.percentComplete).toBeLessThanOrEqual(100);
    }
  });
});

// =============================================================================
// Result Structure Tests
// =============================================================================

describe('runRegressionCheck - Result Structure', () => {
  beforeEach(() => {
    testDir = createTestDir();
    playbooksDir = createTestDir();
    ensurePlaybooksDirectory(playbooksDir);

    const playbookDir = path.join(playbooksDir, 'Regression-Check');
    fs.mkdirSync(playbookDir, { recursive: true });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const yaml = require('js-yaml');
    fs.writeFileSync(
      path.join(playbookDir, 'playbook.yaml'),
      yaml.dump({
        name: 'iOS Regression Check',
        version: '1.0.0',
        steps: [{ action: 'ios.boot_simulator' }],
      })
    );
  });

  afterEach(() => {
    cleanupTestDir(testDir);
    cleanupTestDir(playbooksDir);
    vi.clearAllMocks();
  });

  it('should include all required fields in result', async () => {
    const options = createMinimalOptions({
      playbookPath: path.join(playbooksDir, 'Regression-Check', 'playbook.yaml'),
      dryRun: true,
    });

    const result = await runRegressionCheck(options);

    expect(result.data).toBeDefined();
    const data = result.data!;

    expect(typeof data.passed).toBe('boolean');
    expect(typeof data.totalFlows).toBe('number');
    expect(typeof data.passedFlows).toBe('number');
    expect(typeof data.failedFlows).toBe('number');
    expect(typeof data.skippedFlows).toBe('number');
    expect(typeof data.baselinesUpdated).toBe('number');
    expect(typeof data.totalDuration).toBe('number');
    expect(data.startTime).toBeInstanceOf(Date);
    expect(data.endTime).toBeInstanceOf(Date);
    expect(Array.isArray(data.flowResults)).toBe(true);
    expect(data.playbook).toBeDefined();
    expect(data.simulator).toBeDefined();
    expect(typeof data.artifactsDir).toBe('string');
    expect(typeof data.threshold).toBe('number');
    expect(data.finalVariables).toBeDefined();
  });

  it('should use default threshold of 0.01 when not specified', async () => {
    const options = createMinimalOptions({
      playbookPath: path.join(playbooksDir, 'Regression-Check', 'playbook.yaml'),
      dryRun: true,
    });

    const result = await runRegressionCheck(options);

    expect(result.data!.threshold).toBe(0.01);
  });

  it('should use custom threshold when specified', async () => {
    const options = createMinimalOptions({
      playbookPath: path.join(playbooksDir, 'Regression-Check', 'playbook.yaml'),
      dryRun: true,
    });
    options.inputs.threshold = 0.05;

    const result = await runRegressionCheck(options);

    expect(result.data!.threshold).toBe(0.05);
  });
});

// =============================================================================
// Flow Configuration Tests
// =============================================================================

describe('runRegressionCheck - Flow Configuration', () => {
  beforeEach(() => {
    testDir = createTestDir();
    playbooksDir = createTestDir();
    ensurePlaybooksDirectory(playbooksDir);

    const playbookDir = path.join(playbooksDir, 'Regression-Check');
    fs.mkdirSync(playbookDir, { recursive: true });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const yaml = require('js-yaml');
    fs.writeFileSync(
      path.join(playbookDir, 'playbook.yaml'),
      yaml.dump({
        name: 'iOS Regression Check',
        version: '1.0.0',
        steps: [{ action: 'ios.boot_simulator' }],
      })
    );
  });

  afterEach(() => {
    cleanupTestDir(testDir);
    cleanupTestDir(playbooksDir);
    vi.clearAllMocks();
  });

  it('should handle multiple flows', async () => {
    const flows: RegressionFlow[] = [
      { name: 'login', path: './flows/login.yaml' },
      { name: 'checkout', path: './flows/checkout.yaml' },
      { name: 'settings', path: './flows/settings.yaml' },
    ];

    const options = createMinimalOptions({
      playbookPath: path.join(playbooksDir, 'Regression-Check', 'playbook.yaml'),
      dryRun: true,
    });
    options.inputs.flows = flows;

    const result = await runRegressionCheck(options);

    expect(result.data!.totalFlows).toBe(3);
    expect(result.data!.skippedFlows).toBe(3);
  });

  it('should accept flows with optional description', async () => {
    const flows: RegressionFlow[] = [
      { name: 'login', path: './flows/login.yaml', description: 'Login flow with credentials' },
    ];

    const options = createMinimalOptions({
      playbookPath: path.join(playbooksDir, 'Regression-Check', 'playbook.yaml'),
      dryRun: true,
    });
    options.inputs.flows = flows;

    const result = await runRegressionCheck(options);

    expect(result.success).toBe(true);
    expect(result.data!.totalFlows).toBe(1);
  });
});

// =============================================================================
// Result Formatter Tests
// =============================================================================

describe('formatRegressionCheckResult', () => {
  const createMockResult = (overrides: Partial<RegressionCheckResult> = {}): RegressionCheckResult => ({
    passed: true,
    totalFlows: 3,
    passedFlows: 3,
    failedFlows: 0,
    skippedFlows: 0,
    baselinesUpdated: 0,
    totalDuration: 5000,
    startTime: new Date('2024-01-01T10:00:00Z'),
    endTime: new Date('2024-01-01T10:00:05Z'),
    flowResults: [
      {
        flow: { name: 'login', path: './flows/login.yaml' },
        comparison: {
          flowName: 'login',
          passed: true,
          diffPercentage: 0.001,
          threshold: 0.01,
          currentPath: '/tmp/current/login/final.png',
          baselinePath: '/tmp/baselines/login/final.png',
        },
        duration: 1500,
      },
      {
        flow: { name: 'checkout', path: './flows/checkout.yaml' },
        comparison: {
          flowName: 'checkout',
          passed: true,
          diffPercentage: 0.005,
          threshold: 0.01,
          currentPath: '/tmp/current/checkout/final.png',
          baselinePath: '/tmp/baselines/checkout/final.png',
        },
        duration: 2000,
      },
      {
        flow: { name: 'settings', path: './flows/settings.yaml' },
        comparison: {
          flowName: 'settings',
          passed: true,
          diffPercentage: 0,
          threshold: 0.01,
          currentPath: '/tmp/current/settings/final.png',
          baselinePath: '/tmp/baselines/settings/final.png',
        },
        duration: 1500,
      },
    ],
    playbook: {
      name: 'iOS Regression Check',
      version: '1.0.0',
    },
    simulator: {
      udid: 'test-udid-1234',
      name: 'iPhone 15 Pro',
      iosVersion: '17.0',
    },
    artifactsDir: '/tmp/artifacts',
    htmlReportPath: '/tmp/artifacts/regression_report.html',
    jsonReportPath: '/tmp/artifacts/regression_report.json',
    threshold: 0.01,
    finalVariables: {
      total_flows: 3,
      flows_run: 3,
      regressions_found: 0,
    },
    ...overrides,
  });

  it('should format passed result with checkmark', () => {
    const result = createMockResult();
    const formatted = formatRegressionCheckResult(result);

    expect(formatted).toContain('✅');
    expect(formatted).toContain('Passed');
    expect(formatted).not.toContain('❌');
  });

  it('should format failed result with X', () => {
    const result = createMockResult({
      passed: false,
      failedFlows: 1,
      flowResults: [
        {
          flow: { name: 'login', path: './flows/login.yaml' },
          comparison: {
            flowName: 'login',
            passed: false,
            diffPercentage: 0.15,
            threshold: 0.01,
            currentPath: '/tmp/current/login/final.png',
            baselinePath: '/tmp/baselines/login/final.png',
          },
          duration: 1500,
        },
      ],
    });

    const formatted = formatRegressionCheckResult(result);

    expect(formatted).toContain('❌');
    expect(formatted).toContain('Failed');
  });

  it('should include summary table', () => {
    const result = createMockResult();
    const formatted = formatRegressionCheckResult(result);

    expect(formatted).toContain('| Metric | Value |');
    expect(formatted).toContain('Total Flows');
    expect(formatted).toContain('Passed');
    expect(formatted).toContain('Regressions');
    expect(formatted).toContain('Threshold');
    expect(formatted).toContain('Simulator');
  });

  it('should include flow results section', () => {
    const result = createMockResult();
    const formatted = formatRegressionCheckResult(result);

    expect(formatted).toContain('### Flow Results');
    expect(formatted).toContain('login');
    expect(formatted).toContain('checkout');
    expect(formatted).toContain('settings');
  });

  it('should include report paths when available', () => {
    const result = createMockResult();
    const formatted = formatRegressionCheckResult(result);

    expect(formatted).toContain('### Reports');
    expect(formatted).toContain('HTML');
    expect(formatted).toContain('JSON');
    expect(formatted).toContain('regression_report.html');
    expect(formatted).toContain('regression_report.json');
  });

  it('should include error section when error present', () => {
    const result = createMockResult({
      error: 'Build failed with exit code 65',
    });

    const formatted = formatRegressionCheckResult(result);

    expect(formatted).toContain('### Error');
    expect(formatted).toContain('Build failed with exit code 65');
  });

  it('should show baseline updated marker', () => {
    const result = createMockResult({
      baselinesUpdated: 1,
      flowResults: [
        {
          flow: { name: 'login', path: './flows/login.yaml' },
          baselineUpdated: true,
          duration: 1500,
        },
      ],
    });

    const formatted = formatRegressionCheckResult(result);

    expect(formatted).toContain('📝');
    expect(formatted).toContain('baseline updated');
  });

  it('should show missing baseline warning', () => {
    const result = createMockResult({
      passed: false,
      failedFlows: 1,
      flowResults: [
        {
          flow: { name: 'login', path: './flows/login.yaml' },
          comparison: {
            flowName: 'login',
            passed: false,
            diffPercentage: 1.0,
            threshold: 0.01,
            currentPath: '/tmp/current/login/final.png',
            baselinePath: '/tmp/baselines/login/final.png',
            baselineMissing: true,
          },
          duration: 1500,
        },
      ],
    });

    const formatted = formatRegressionCheckResult(result);

    expect(formatted).toContain('⚠️');
  });
});

describe('formatRegressionCheckResultAsJson', () => {
  it('should return valid JSON string', () => {
    const result: RegressionCheckResult = {
      passed: true,
      totalFlows: 1,
      passedFlows: 1,
      failedFlows: 0,
      skippedFlows: 0,
      baselinesUpdated: 0,
      totalDuration: 1000,
      startTime: new Date('2024-01-01T10:00:00Z'),
      endTime: new Date('2024-01-01T10:00:01Z'),
      flowResults: [],
      playbook: { name: 'Test', version: '1.0.0' },
      simulator: { udid: 'test', name: 'iPhone', iosVersion: '17.0' },
      artifactsDir: '/tmp',
      threshold: 0.01,
      finalVariables: {},
    };

    const json = formatRegressionCheckResultAsJson(result);
    const parsed = JSON.parse(json);

    expect(parsed.passed).toBe(true);
    expect(parsed.totalFlows).toBe(1);
    expect(parsed.threshold).toBe(0.01);
  });

  it('should be pretty-printed with 2-space indentation', () => {
    const result: RegressionCheckResult = {
      passed: true,
      totalFlows: 1,
      passedFlows: 1,
      failedFlows: 0,
      skippedFlows: 0,
      baselinesUpdated: 0,
      totalDuration: 1000,
      startTime: new Date(),
      endTime: new Date(),
      flowResults: [],
      playbook: { name: 'Test' },
      simulator: { udid: 'test', name: 'iPhone', iosVersion: '17.0' },
      artifactsDir: '/tmp',
      threshold: 0.01,
      finalVariables: {},
    };

    const json = formatRegressionCheckResultAsJson(result);

    expect(json).toContain('\n');
    expect(json).toContain('  '); // 2-space indent
  });
});

describe('formatRegressionCheckResultCompact', () => {
  it('should format passed result compactly', () => {
    const result: RegressionCheckResult = {
      passed: true,
      totalFlows: 3,
      passedFlows: 3,
      failedFlows: 0,
      skippedFlows: 0,
      baselinesUpdated: 0,
      totalDuration: 5000,
      startTime: new Date(),
      endTime: new Date(),
      flowResults: [],
      playbook: { name: 'Test' },
      simulator: { udid: 'test', name: 'iPhone', iosVersion: '17.0' },
      artifactsDir: '/tmp',
      threshold: 0.01,
      finalVariables: {},
    };

    const compact = formatRegressionCheckResultCompact(result);

    expect(compact).toContain('[PASS]');
    expect(compact).toContain('3/3');
    expect(compact).toContain('0 regressions');
    expect(compact).toContain('5.0s');
  });

  it('should format failed result compactly', () => {
    const result: RegressionCheckResult = {
      passed: false,
      totalFlows: 5,
      passedFlows: 3,
      failedFlows: 2,
      skippedFlows: 0,
      baselinesUpdated: 0,
      totalDuration: 120000,
      startTime: new Date(),
      endTime: new Date(),
      flowResults: [],
      playbook: { name: 'Test' },
      simulator: { udid: 'test', name: 'iPhone', iosVersion: '17.0' },
      artifactsDir: '/tmp',
      threshold: 0.01,
      finalVariables: {},
    };

    const compact = formatRegressionCheckResultCompact(result);

    expect(compact).toContain('[FAIL]');
    expect(compact).toContain('3/5');
    expect(compact).toContain('2 regressions');
    expect(compact).toContain('2m');
  });

  it('should format millisecond durations', () => {
    const result: RegressionCheckResult = {
      passed: true,
      totalFlows: 1,
      passedFlows: 1,
      failedFlows: 0,
      skippedFlows: 0,
      baselinesUpdated: 0,
      totalDuration: 500,
      startTime: new Date(),
      endTime: new Date(),
      flowResults: [],
      playbook: { name: 'Test' },
      simulator: { udid: 'test', name: 'iPhone', iosVersion: '17.0' },
      artifactsDir: '/tmp',
      threshold: 0.01,
      finalVariables: {},
    };

    const compact = formatRegressionCheckResultCompact(result);

    expect(compact).toContain('500ms');
  });
});

// =============================================================================
// Variable Tracking Tests
// =============================================================================

describe('runRegressionCheck - Variable Tracking', () => {
  beforeEach(() => {
    testDir = createTestDir();
    playbooksDir = createTestDir();
    ensurePlaybooksDirectory(playbooksDir);

    const playbookDir = path.join(playbooksDir, 'Regression-Check');
    fs.mkdirSync(playbookDir, { recursive: true });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const yaml = require('js-yaml');
    fs.writeFileSync(
      path.join(playbookDir, 'playbook.yaml'),
      yaml.dump({
        name: 'iOS Regression Check',
        version: '1.0.0',
        variables: {
          total_flows: 0,
          flows_run: 0,
          regressions_found: 0,
          screenshots_compared: 0,
          baseline_updates: 0,
        },
        steps: [{ action: 'ios.boot_simulator' }],
      })
    );
  });

  afterEach(() => {
    cleanupTestDir(testDir);
    cleanupTestDir(playbooksDir);
    vi.clearAllMocks();
  });

  it('should initialize variables from playbook', async () => {
    const options = createMinimalOptions({
      playbookPath: path.join(playbooksDir, 'Regression-Check', 'playbook.yaml'),
      dryRun: true,
    });

    const result = await runRegressionCheck(options);

    expect(result.data!.finalVariables).toBeDefined();
    expect(result.data!.finalVariables.total_flows).toBe(1);
    expect(result.data!.finalVariables.flows_run).toBe(0);
    expect(result.data!.finalVariables.regressions_found).toBe(0);
  });

  it('should set total_flows based on input', async () => {
    const flows: RegressionFlow[] = [
      { name: 'login', path: './login.yaml' },
      { name: 'checkout', path: './checkout.yaml' },
      { name: 'settings', path: './settings.yaml' },
      { name: 'profile', path: './profile.yaml' },
    ];

    const options = createMinimalOptions({
      playbookPath: path.join(playbooksDir, 'Regression-Check', 'playbook.yaml'),
      dryRun: true,
    });
    options.inputs.flows = flows;

    const result = await runRegressionCheck(options);

    expect(result.data!.finalVariables.total_flows).toBe(4);
  });
});
