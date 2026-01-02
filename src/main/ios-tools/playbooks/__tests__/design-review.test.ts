/**
 * Tests for iOS Design Review Playbook Executor
 *
 * These tests verify the playbook execution, screen capture,
 * multi-device handling, progress reporting, and report generation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Increase timeout for tests due to internal sleep calls
vi.setConfig({ testTimeout: 30000 });
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import {
  runDesignReview,
  formatDesignReviewResult,
  formatDesignReviewResultAsJson,
  formatDesignReviewResultCompact,
  type DesignReviewOptions,
  type DesignReviewResult,
  type DesignReviewProgress,
  type DesignScreen,
} from '../design-review';

// =============================================================================
// Mocks
// =============================================================================

// Mock the playbook-loader
vi.mock('../../playbook-loader', () => ({
  loadPlaybook: vi.fn().mockReturnValue({
    name: 'iOS Design Review',
    version: '1.0.0',
    variables: {
      total_devices: 0,
      total_screens: 0,
      devices_completed: 0,
      screens_captured: 0,
      capture_failures: 0,
    },
    steps: [],
  }),
}));

// Mock the build module
vi.mock('../../build', () => ({
  build: vi.fn().mockResolvedValue({
    success: true,
    data: {
      success: true,
      appPath: '/path/to/App.app',
      derivedDataPath: '/path/to/DerivedData',
      duration: 5000,
      warnings: [],
      errors: [],
    },
  }),
  detectProject: vi.fn().mockResolvedValue({
    success: true,
    data: {
      path: '/path/to/Project.xcodeproj',
      name: 'Project',
      type: 'project',
    },
  }),
}));

// Mock the simulator module
vi.mock('../../simulator', () => ({
  launchApp: vi.fn().mockResolvedValue({ success: true }),
  terminateApp: vi.fn().mockResolvedValue({ success: true }),
  getBootedSimulators: vi.fn().mockResolvedValue({
    success: true,
    data: [{
      udid: 'mock-udid-1234',
      name: 'iPhone 15',
      state: 'Booted',
      isAvailable: true,
      runtime: 'com.apple.CoreSimulator.SimRuntime.iOS-17-5',
      iosVersion: '17.5',
      deviceType: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15',
    }],
  }),
  getSimulator: vi.fn().mockResolvedValue({
    success: true,
    data: {
      udid: 'mock-udid-1234',
      name: 'iPhone 15',
      state: 'Booted',
      isAvailable: true,
      runtime: 'com.apple.CoreSimulator.SimRuntime.iOS-17-5',
      iosVersion: '17.5',
      deviceType: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15',
    },
  }),
  listSimulators: vi.fn().mockResolvedValue({
    success: true,
    data: [
      {
        udid: 'mock-udid-se',
        name: 'iPhone SE (3rd generation)',
        state: 'Shutdown',
        isAvailable: true,
        runtime: 'com.apple.CoreSimulator.SimRuntime.iOS-17-5',
        iosVersion: '17.5',
        deviceType: 'com.apple.CoreSimulator.SimDeviceType.iPhone-SE-3',
      },
      {
        udid: 'mock-udid-15',
        name: 'iPhone 15',
        state: 'Shutdown',
        isAvailable: true,
        runtime: 'com.apple.CoreSimulator.SimRuntime.iOS-17-5',
        iosVersion: '17.5',
        deviceType: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15',
      },
      {
        udid: 'mock-udid-15-pro-max',
        name: 'iPhone 15 Pro Max',
        state: 'Shutdown',
        isAvailable: true,
        runtime: 'com.apple.CoreSimulator.SimRuntime.iOS-17-5',
        iosVersion: '17.5',
        deviceType: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15-Pro-Max',
      },
    ],
  }),
  bootSimulator: vi.fn().mockResolvedValue({ success: true }),
  shutdownSimulator: vi.fn().mockResolvedValue({ success: true }),
  installApp: vi.fn().mockResolvedValue({ success: true }),
}));

// Mock capture
vi.mock('../../capture', () => ({
  screenshot: vi.fn().mockResolvedValue({
    success: true,
    data: {
      path: '/path/to/screenshot.png',
      size: 12345,
      timestamp: new Date(),
    },
  }),
}));

// Mock inspect
vi.mock('../../inspect', () => ({
  inspectWithXCUITest: vi.fn().mockResolvedValue({
    success: true,
    data: {
      timestamp: new Date(),
      bundleId: 'com.example.app',
      device: { name: 'iPhone 15', udid: 'mock-udid', platform: 'iOS', iosVersion: '17.5' },
      rootElement: {
        type: 'application',
        identifier: 'app',
        isEnabled: true,
        isHittable: false,
        isVisible: true,
        frame: { x: 0, y: 0, width: 390, height: 844 },
        children: [],
      },
      stats: {
        totalElements: 1,
        buttons: 0,
        textFields: 0,
        labels: 0,
        images: 0,
        scrollViews: 0,
        tables: 0,
        cells: 0,
        staticTexts: 0,
        other: 1,
      },
    },
  }),
}));

// Mock flow-runner
vi.mock('../../flow-runner', () => ({
  runFlow: vi.fn().mockResolvedValue({
    success: true,
    data: {
      flowPath: '/path/to/flow.yaml',
      stepsRun: 3,
      stepsPassed: 3,
      stepsFailed: 0,
      duration: 2000,
    },
  }),
}));

// Mock artifacts
vi.mock('../../artifacts', () => ({
  getArtifactDirectory: vi.fn().mockResolvedValue('/tmp/artifacts'),
  generateSnapshotId: vi.fn().mockReturnValue('snapshot-123'),
}));

// Mock logger
vi.mock('../../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock execFile
vi.mock('../../../utils/execFile', () => ({
  execFileNoThrow: vi.fn().mockResolvedValue({
    stdout: JSON.stringify({ CFBundleIdentifier: 'com.example.testapp' }),
    stderr: '',
    exitCode: 0,
  }),
}));

// =============================================================================
// Test Helpers
// =============================================================================

let testDir: string;

function createTestDir(): string {
  const dir = path.join(os.tmpdir(), `design-review-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanupTestDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function createDefaultOptions(): DesignReviewOptions {
  return {
    inputs: {
      bundle_id: 'com.example.testapp',
      navigation_map: [
        { name: 'Home', description: 'Main home screen' },
        { name: 'Settings', description: 'App settings' },
      ],
      output_dir: path.join(testDir, 'screenshots'),
      device_sizes: ['iPhone 15'],
      wait_after_navigation: 0, // No waiting in tests
    },
    sessionId: 'test-session-123',
  };
}

function createMultiDeviceOptions(): DesignReviewOptions {
  return {
    inputs: {
      bundle_id: 'com.example.testapp',
      navigation_map: [
        { name: 'Home', description: 'Main home screen' },
        { name: 'Profile', description: 'User profile' },
      ],
      output_dir: path.join(testDir, 'screenshots'),
      device_sizes: ['iPhone SE (3rd generation)', 'iPhone 15', 'iPhone 15 Pro Max'],
      wait_after_navigation: 0, // No waiting in tests
    },
    sessionId: 'test-session-123',
  };
}

/**
 * Reset all simulator-related mocks to default values
 */
async function resetSimulatorMocks(): Promise<void> {
  const simModule = await import('../../simulator');
  vi.mocked(simModule.listSimulators).mockResolvedValue({
    success: true,
    data: [
      {
        udid: 'mock-udid-se',
        name: 'iPhone SE (3rd generation)',
        state: 'Shutdown',
        isAvailable: true,
        runtime: 'com.apple.CoreSimulator.SimRuntime.iOS-17-5',
        iosVersion: '17.5',
        deviceType: 'com.apple.CoreSimulator.SimDeviceType.iPhone-SE-3',
      },
      {
        udid: 'mock-udid-15',
        name: 'iPhone 15',
        state: 'Shutdown',
        isAvailable: true,
        runtime: 'com.apple.CoreSimulator.SimRuntime.iOS-17-5',
        iosVersion: '17.5',
        deviceType: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15',
      },
      {
        udid: 'mock-udid-15-pro-max',
        name: 'iPhone 15 Pro Max',
        state: 'Shutdown',
        isAvailable: true,
        runtime: 'com.apple.CoreSimulator.SimRuntime.iOS-17-5',
        iosVersion: '17.5',
        deviceType: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15-Pro-Max',
      },
    ],
  });
  vi.mocked(simModule.bootSimulator).mockResolvedValue({ success: true });
  vi.mocked(simModule.shutdownSimulator).mockResolvedValue({ success: true });
  vi.mocked(simModule.installApp).mockResolvedValue({ success: true });
  vi.mocked(simModule.launchApp).mockResolvedValue({ success: true });
}

/**
 * Reset capture mocks
 */
async function resetCaptureMocks(): Promise<void> {
  const captureModule = await import('../../capture');
  vi.mocked(captureModule.screenshot).mockResolvedValue({
    success: true,
    data: {
      path: '/path/to/screenshot.png',
      size: 12345,
      timestamp: new Date(),
    },
  });
}

// =============================================================================
// Input Validation Tests
// =============================================================================

describe('Design Review - Input Validation', () => {
  beforeEach(async () => {
    testDir = createTestDir();
    vi.clearAllMocks();
    await resetSimulatorMocks();
    await resetCaptureMocks();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it('should reject when no app source is provided', async () => {
    const options = createDefaultOptions();
    options.inputs.bundle_id = undefined;

    const result = await runDesignReview(options);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Either app_path or project_path is required');
  });

  it('should reject when project_path provided without scheme', async () => {
    const options = createDefaultOptions();
    options.inputs.bundle_id = undefined;
    options.inputs.project_path = '/path/to/project';

    const result = await runDesignReview(options);

    expect(result.success).toBe(false);
    expect(result.error).toContain('scheme is required');
  });

  it('should reject when navigation_map is empty', async () => {
    const options = createDefaultOptions();
    options.inputs.navigation_map = [];

    const result = await runDesignReview(options);

    expect(result.success).toBe(false);
    expect(result.error).toContain('navigation_map');
  });

  it('should reject when navigation_map screen has no name', async () => {
    const options = createDefaultOptions();
    options.inputs.navigation_map = [
      { name: '', description: 'Missing name' } as DesignScreen,
    ];

    const result = await runDesignReview(options);

    expect(result.success).toBe(false);
    expect(result.error).toContain('name');
  });

  it('should reject when output_dir is missing', async () => {
    const options = createDefaultOptions();
    options.inputs.output_dir = '';

    const result = await runDesignReview(options);

    expect(result.success).toBe(false);
    expect(result.error).toContain('output_dir is required');
  });

  it('should accept bundle_id as valid input', async () => {
    const options = createDefaultOptions();

    const result = await runDesignReview(options);

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  it('should accept app_path as valid input', async () => {
    const options = createDefaultOptions();
    options.inputs.app_path = '/path/to/App.app';

    const result = await runDesignReview(options);

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.appPath).toBe('/path/to/App.app');
  });

  it('should accept project_path + scheme as valid input', async () => {
    const options = createDefaultOptions();
    options.inputs.project_path = '/path/to/project';
    options.inputs.scheme = 'TestApp';
    options.inputs.bundle_id = undefined;

    const result = await runDesignReview(options);

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });
});

// =============================================================================
// Dry Run Tests
// =============================================================================

describe('Design Review - Dry Run', () => {
  beforeEach(async () => {
    testDir = createTestDir();
    vi.clearAllMocks();
    await resetSimulatorMocks();
    await resetCaptureMocks();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it('should validate inputs without executing in dry run mode', async () => {
    const options = createDefaultOptions();
    options.dryRun = true;

    const result = await runDesignReview(options);

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.devicesCompleted).toBe(0);
    expect(result.data?.screensCaptured).toBe(0);
  });

  it('should return correct structure in dry run mode', async () => {
    const options = createMultiDeviceOptions();
    options.dryRun = true;

    const result = await runDesignReview(options);

    expect(result.success).toBe(true);
    expect(result.data?.totalDevices).toBe(3);
    expect(result.data?.totalScreens).toBe(6); // 3 devices * 2 screens
    expect(result.data?.playbook.name).toBe('iOS Design Review');
  });

  it('should not call simulator functions in dry run mode', async () => {
    const simModule = await import('../../simulator');
    const options = createDefaultOptions();
    options.dryRun = true;

    await runDesignReview(options);

    expect(simModule.bootSimulator).not.toHaveBeenCalled();
    expect(simModule.installApp).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Execution Tests
// =============================================================================

describe('Design Review - Execution', () => {
  beforeEach(async () => {
    testDir = createTestDir();
    vi.clearAllMocks();
    await resetSimulatorMocks();
    await resetCaptureMocks();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it('should complete successfully with single device', async () => {
    const options = createDefaultOptions();

    const result = await runDesignReview(options);

    expect(result.success).toBe(true);
    expect(result.data?.passed).toBe(true);
    expect(result.data?.devicesCompleted).toBe(1);
    expect(result.data?.screensCaptured).toBe(2);
  });

  it('should capture screens across multiple devices', async () => {
    const options = createMultiDeviceOptions();

    const result = await runDesignReview(options);

    expect(result.success).toBe(true);
    expect(result.data?.totalDevices).toBe(3);
    expect(result.data?.devicesCompleted).toBe(3);
    expect(result.data?.screensCaptured).toBe(6);
  });

  it('should boot and shutdown simulators for each device', async () => {
    const simModule = await import('../../simulator');
    const options = createMultiDeviceOptions();

    await runDesignReview(options);

    expect(simModule.bootSimulator).toHaveBeenCalledTimes(3);
    expect(simModule.shutdownSimulator).toHaveBeenCalledTimes(3);
  });

  it('should install app on each device', async () => {
    const simModule = await import('../../simulator');
    const options = createMultiDeviceOptions();
    options.inputs.app_path = '/path/to/App.app';

    await runDesignReview(options);

    expect(simModule.installApp).toHaveBeenCalledTimes(3);
  });

  it('should capture screenshots for each screen', async () => {
    const captureModule = await import('../../capture');
    const options = createDefaultOptions();

    await runDesignReview(options);

    expect(captureModule.screenshot).toHaveBeenCalledTimes(2);
  });

  it('should create device result for each device', async () => {
    const options = createMultiDeviceOptions();

    const result = await runDesignReview(options);

    expect(result.data?.deviceResults.length).toBe(3);
    expect(result.data?.deviceResults[0].device).toBe('iPhone SE (3rd generation)');
    expect(result.data?.deviceResults[1].device).toBe('iPhone 15');
    expect(result.data?.deviceResults[2].device).toBe('iPhone 15 Pro Max');
  });

  it('should track elapsed time', async () => {
    const options = createDefaultOptions();

    const result = await runDesignReview(options);

    expect(result.data?.totalDuration).toBeGreaterThan(0);
    expect(result.data?.startTime).toBeInstanceOf(Date);
    expect(result.data?.endTime).toBeInstanceOf(Date);
  });
});

// =============================================================================
// Progress Reporting Tests
// =============================================================================

describe('Design Review - Progress Reporting', () => {
  beforeEach(async () => {
    testDir = createTestDir();
    vi.clearAllMocks();
    await resetSimulatorMocks();
    await resetCaptureMocks();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it('should report progress during execution', async () => {
    const progressUpdates: DesignReviewProgress[] = [];
    const options = createDefaultOptions();
    options.onProgress = (update) => progressUpdates.push(update);

    await runDesignReview(options);

    expect(progressUpdates.length).toBeGreaterThan(0);
    expect(progressUpdates[0].phase).toBe('initializing');
    expect(progressUpdates[progressUpdates.length - 1].phase).toBe('complete');
  });

  it('should include device and screen names in progress', async () => {
    const progressUpdates: DesignReviewProgress[] = [];
    const options = createDefaultOptions();
    options.onProgress = (update) => progressUpdates.push(update);

    await runDesignReview(options);

    const capturingUpdates = progressUpdates.filter(u => u.phase === 'capturing');
    expect(capturingUpdates.length).toBeGreaterThan(0);
    expect(capturingUpdates[0].deviceName).toBeDefined();
    expect(capturingUpdates[0].screenName).toBeDefined();
  });

  it('should track percentage complete', async () => {
    const progressUpdates: DesignReviewProgress[] = [];
    const options = createDefaultOptions();
    options.onProgress = (update) => progressUpdates.push(update);

    await runDesignReview(options);

    const lastUpdate = progressUpdates[progressUpdates.length - 1];
    expect(lastUpdate.percentComplete).toBe(100);
  });

  it('should report correct device and screen counts', async () => {
    const progressUpdates: DesignReviewProgress[] = [];
    const options = createMultiDeviceOptions();
    options.onProgress = (update) => progressUpdates.push(update);

    await runDesignReview(options);

    const initUpdate = progressUpdates.find(u => u.phase === 'initializing');
    expect(initUpdate?.totalDevices).toBe(3);
    expect(initUpdate?.totalScreens).toBe(2);
  });
});

// =============================================================================
// Error Handling Tests
// =============================================================================

describe('Design Review - Error Handling', () => {
  beforeEach(async () => {
    testDir = createTestDir();
    vi.clearAllMocks();
    await resetSimulatorMocks();
    await resetCaptureMocks();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it('should handle simulator boot failure gracefully', async () => {
    const simModule = await import('../../simulator');
    vi.mocked(simModule.bootSimulator).mockResolvedValueOnce({
      success: false,
      error: 'Simulator failed to boot',
    });

    const options = createDefaultOptions();

    const result = await runDesignReview(options);

    expect(result.success).toBe(true);
    expect(result.data?.devicesFailed).toBe(1);
    expect(result.data?.deviceResults[0].success).toBe(false);
  });

  it('should handle screenshot failure gracefully', async () => {
    const captureModule = await import('../../capture');
    vi.mocked(captureModule.screenshot).mockResolvedValue({
      success: false,
      error: 'Screenshot failed',
      errorCode: 'COMMAND_FAILED',
    });

    const options = createDefaultOptions();

    const result = await runDesignReview(options);

    expect(result.success).toBe(true);
    expect(result.data?.captureFailures).toBe(2);
    expect(result.data?.passed).toBe(false);
  });

  it('should continue with other devices after failure', async () => {
    const simModule = await import('../../simulator');
    // First device fails, others succeed
    vi.mocked(simModule.bootSimulator)
      .mockResolvedValueOnce({ success: false, error: 'Boot failed' })
      .mockResolvedValue({ success: true });

    const options = createMultiDeviceOptions();

    const result = await runDesignReview(options);

    expect(result.success).toBe(true);
    expect(result.data?.devicesCompleted).toBe(2);
    expect(result.data?.devicesFailed).toBe(1);
  });

  it('should handle unavailable simulator gracefully', async () => {
    const simModule = await import('../../simulator');
    vi.mocked(simModule.listSimulators).mockResolvedValue({
      success: true,
      data: [], // No simulators available
    });

    const options = createDefaultOptions();
    options.inputs.device_sizes = ['Nonexistent Device'];

    const result = await runDesignReview(options);

    expect(result.success).toBe(true);
    expect(result.data?.devicesFailed).toBe(1);
    expect(result.data?.deviceResults[0].error).toContain('not found');
  });
});

// =============================================================================
// UI Tree Capture Tests
// =============================================================================

describe('Design Review - UI Tree Capture', () => {
  beforeEach(async () => {
    testDir = createTestDir();
    vi.clearAllMocks();
    await resetSimulatorMocks();
    await resetCaptureMocks();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it('should capture UI tree by default', async () => {
    const inspectModule = await import('../../inspect');
    const options = createDefaultOptions();

    await runDesignReview(options);

    expect(inspectModule.inspectWithXCUITest).toHaveBeenCalled();
  });

  it('should not capture UI tree when disabled', async () => {
    const inspectModule = await import('../../inspect');
    const options = createDefaultOptions();
    options.inputs.capture_ui_tree = false;

    await runDesignReview(options);

    expect(inspectModule.inspectWithXCUITest).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Reset Between Screens Tests
// =============================================================================

describe('Design Review - Reset Between Screens', () => {
  beforeEach(async () => {
    testDir = createTestDir();
    vi.clearAllMocks();
    await resetSimulatorMocks();
    await resetCaptureMocks();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it('should not terminate app between screens by default', async () => {
    const simModule = await import('../../simulator');
    const options = createDefaultOptions();

    await runDesignReview(options);

    // Should only launch once per device, not terminate between screens
    expect(simModule.launchApp).toHaveBeenCalledTimes(1);
    expect(simModule.terminateApp).not.toHaveBeenCalled();
  });

  it('should reset app between screens when configured', async () => {
    const simModule = await import('../../simulator');
    const options = createDefaultOptions();
    options.inputs.reset_between_screens = true;

    await runDesignReview(options);

    // Should terminate and relaunch for each screen after the first
    expect(simModule.terminateApp).toHaveBeenCalledTimes(1); // For 2nd screen
  });
});

// =============================================================================
// Report Generation Tests
// =============================================================================

describe('Design Review - Report Generation', () => {
  beforeEach(async () => {
    testDir = createTestDir();
    vi.clearAllMocks();
    await resetSimulatorMocks();
    await resetCaptureMocks();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it('should generate comparison sheet by default', async () => {
    const options = createDefaultOptions();

    const result = await runDesignReview(options);

    expect(result.data?.comparisonSheetPath).toBeDefined();
    expect(result.data?.comparisonSheetPath).toContain('design_review.html');
  });

  it('should generate JSON report', async () => {
    const options = createDefaultOptions();

    const result = await runDesignReview(options);

    expect(result.data?.jsonReportPath).toBeDefined();
    expect(result.data?.jsonReportPath).toContain('design_review.json');
  });

  it('should not generate comparison sheet when disabled', async () => {
    const options = createDefaultOptions();
    options.inputs.generate_comparison_sheet = false;

    const result = await runDesignReview(options);

    expect(result.data?.comparisonSheetPath).toBeUndefined();
    expect(result.data?.jsonReportPath).toBeUndefined();
  });
});

// =============================================================================
// Result Formatting Tests
// =============================================================================

describe('Design Review - Result Formatters', () => {
  const mockResult: DesignReviewResult = {
    passed: true,
    totalDevices: 3,
    devicesCompleted: 3,
    devicesFailed: 0,
    totalScreens: 6,
    screensCaptured: 6,
    captureFailures: 0,
    totalDuration: 45000,
    startTime: new Date('2024-01-15T10:00:00Z'),
    endTime: new Date('2024-01-15T10:00:45Z'),
    deviceResults: [
      {
        device: 'iPhone SE (3rd generation)',
        deviceSlug: 'iphone-se-3rd-generation',
        success: true,
        captures: [
          {
            device: 'iPhone SE (3rd generation)',
            deviceSlug: 'iphone-se-3rd-generation',
            screen: 'Home',
            screenSlug: 'home',
            success: true,
            timestamp: new Date(),
            duration: 1000,
            screenshotPath: '/output/iphone-se-3rd-generation/home.png',
          },
        ],
        duration: 15000,
      },
    ],
    allCaptures: [],
    playbook: {
      name: 'iOS Design Review',
      version: '1.0.0',
    },
    outputDir: '/output',
    comparisonSheetPath: '/output/design_review.html',
    jsonReportPath: '/output/design_review.json',
    finalVariables: {},
  };

  it('should format result as markdown', () => {
    const formatted = formatDesignReviewResult(mockResult);

    expect(formatted).toContain('## ✅ Design Review Complete');
    expect(formatted).toContain('| Devices | 3/3 |');
    expect(formatted).toContain('| Screens Captured | 6/6 |');
    expect(formatted).toContain('design_review.html');
  });

  it('should format failed result correctly', () => {
    const failedResult = { ...mockResult, passed: false, captureFailures: 2 };
    const formatted = formatDesignReviewResult(failedResult);

    expect(formatted).toContain('## ⚠️ Design Review Completed with Issues');
    expect(formatted).toContain('| Failures | 2 |');
  });

  it('should format result as JSON', () => {
    const formatted = formatDesignReviewResultAsJson(mockResult);
    const parsed = JSON.parse(formatted);

    expect(parsed.passed).toBe(true);
    expect(parsed.totalDevices).toBe(3);
    expect(parsed.screensCaptured).toBe(6);
  });

  it('should format result in compact form', () => {
    const formatted = formatDesignReviewResultCompact(mockResult);

    expect(formatted).toContain('[SUCCESS]');
    expect(formatted).toContain('6/6 captures');
    expect(formatted).toContain('3 devices');
    expect(formatted).toContain('45');
  });

  it('should format partial result in compact form', () => {
    const partialResult = { ...mockResult, passed: false };
    const formatted = formatDesignReviewResultCompact(partialResult);

    expect(formatted).toContain('[PARTIAL]');
  });
});

// =============================================================================
// Default Device Sizes Tests
// =============================================================================

describe('Design Review - Default Device Sizes', () => {
  beforeEach(async () => {
    testDir = createTestDir();
    vi.clearAllMocks();
    await resetSimulatorMocks();
    await resetCaptureMocks();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it('should use default device sizes when not specified', async () => {
    const options: DesignReviewOptions = {
      inputs: {
        bundle_id: 'com.example.testapp',
        navigation_map: [{ name: 'Home' }],
        output_dir: path.join(testDir, 'screenshots'),
        // device_sizes not specified
      },
      sessionId: 'test-session-123',
      dryRun: true,
    };

    const result = await runDesignReview(options);

    expect(result.data?.totalDevices).toBe(4); // Default is 4 devices
  });
});

// =============================================================================
// Slugify Tests
// =============================================================================

describe('Design Review - Slugify', () => {
  beforeEach(async () => {
    testDir = createTestDir();
    vi.clearAllMocks();
    await resetSimulatorMocks();
    await resetCaptureMocks();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it('should slugify device names correctly', async () => {
    const options = createDefaultOptions();
    options.inputs.device_sizes = ['iPhone 15 Pro Max'];

    const result = await runDesignReview(options);

    expect(result.data?.deviceResults[0].deviceSlug).toBe('iphone-15-pro-max');
  });

  it('should slugify screen names correctly', async () => {
    const options = createDefaultOptions();
    options.inputs.navigation_map = [{ name: 'My Profile Screen' }];

    const result = await runDesignReview(options);

    const capture = result.data?.allCaptures[0];
    expect(capture?.screenSlug).toBe('my-profile-screen');
  });
});
