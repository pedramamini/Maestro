import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs/promises';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue('- tapOn: "Login"'),
  mkdir: vi.fn().mockResolvedValue(undefined),
  access: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  default: {
    readFile: vi.fn().mockResolvedValue('- tapOn: "Login"'),
    mkdir: vi.fn().mockResolvedValue(undefined),
    access: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock electron app
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/mock/user/data'),
  },
}));

// Mock logger
vi.mock('../../../main/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock maestro-cli
vi.mock('../../../main/ios-tools/maestro-cli', () => ({
  runMaestro: vi.fn().mockResolvedValue({
    stdout: '✓ Step 1: Launch app\n✓ Step 2: Tap Login\n✓ Step 3: Assert Welcome',
    stderr: '',
    exitCode: 0,
  }),
  isMaestroAvailable: vi.fn().mockResolvedValue(true),
  detectMaestroCli: vi.fn().mockResolvedValue({
    success: true,
    data: { available: true, path: '/usr/local/bin/maestro', version: '1.36.0' },
  }),
}));

// Mock simulator
vi.mock('../../../main/ios-tools/simulator', () => ({
  getBootedSimulators: vi.fn().mockResolvedValue({
    success: true,
    data: [{ udid: 'mock-udid-1234', name: 'iPhone 15 Pro', state: 'Booted' }],
  }),
}));

// Mock artifacts
vi.mock('../../../main/ios-tools/artifacts', () => ({
  getArtifactDirectory: vi.fn().mockResolvedValue('/mock/artifacts/session-123'),
}));

// Mock capture
vi.mock('../../../main/ios-tools/capture', () => ({
  captureScreenshot: vi.fn().mockResolvedValue({
    success: true,
    data: { path: '/mock/artifacts/failure.png', size: 12345, timestamp: new Date() },
  }),
}));

import {
  runFlow,
  runFlowWithRetry,
  runFlows,
  validateFlow,
  validateFlowWithMaestro,
  FlowRunOptions,
} from '../../../main/ios-tools/flow-runner';

import * as maestroCli from '../../../main/ios-tools/maestro-cli';
import * as simulator from '../../../main/ios-tools/simulator';
import * as artifacts from '../../../main/ios-tools/artifacts';
import * as capture from '../../../main/ios-tools/capture';

describe('flow-runner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('runFlow', () => {
    const baseOptions: FlowRunOptions = {
      flowPath: '/test/flows/login.yaml',
      sessionId: 'session-123',
    };

    it('runs a flow and returns success result', async () => {
      const result = await runFlow(baseOptions);

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
      expect(result.data?.udid).toBe('mock-udid-1234');
      expect(result.data?.flowPath).toContain('login.yaml');
    });

    it('uses provided udid instead of auto-detecting', async () => {
      const options = { ...baseOptions, udid: 'custom-udid-5678' };
      const result = await runFlow(options);

      expect(result.success).toBe(true);
      expect(result.data?.udid).toBe('custom-udid-5678');
      expect(vi.mocked(simulator.getBootedSimulators)).not.toHaveBeenCalled();
    });

    it('auto-detects simulator when udid not provided', async () => {
      const result = await runFlow(baseOptions);

      expect(result.success).toBe(true);
      expect(vi.mocked(simulator.getBootedSimulators)).toHaveBeenCalled();
    });

    it('returns error when Maestro is not available', async () => {
      vi.mocked(maestroCli.isMaestroAvailable).mockResolvedValueOnce(false);
      vi.mocked(maestroCli.detectMaestroCli).mockResolvedValueOnce({
        success: true,
        data: {
          available: false,
          installInstructions: 'Install from https://maestro.mobile.dev/',
        },
      });

      const result = await runFlow(baseOptions);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Maestro CLI is not installed');
    });

    it('returns error when flow file does not exist', async () => {
      vi.mocked(fs.access).mockRejectedValueOnce(new Error('ENOENT'));

      const result = await runFlow(baseOptions);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Flow file not found');
    });

    it('returns error when no simulators are booted', async () => {
      vi.mocked(simulator.getBootedSimulators).mockResolvedValueOnce({
        success: true,
        data: [],
      });

      const result = await runFlow(baseOptions);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No booted simulators found');
    });

    it('captures screenshot on failure when enabled', async () => {
      vi.mocked(maestroCli.runMaestro).mockResolvedValueOnce({
        stdout: '✗ Step 1: Tap Login - Element not found',
        stderr: 'Error: Element not found',
        exitCode: 1,
      });

      const options = { ...baseOptions, captureOnFailure: true };
      const result = await runFlow(options);

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(false);
      expect(vi.mocked(capture.captureScreenshot)).toHaveBeenCalled();
      expect(result.data?.failureScreenshotPath).toBe('/mock/artifacts/failure.png');
    });

    it('does not capture screenshot on failure when disabled', async () => {
      vi.mocked(maestroCli.runMaestro).mockResolvedValueOnce({
        stdout: '✗ Step 1: Tap Login',
        stderr: '',
        exitCode: 1,
      });

      const options = { ...baseOptions, captureOnFailure: false };
      const result = await runFlow(options);

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(false);
      expect(vi.mocked(capture.captureScreenshot)).not.toHaveBeenCalled();
    });

    it('parses step results from output', async () => {
      vi.mocked(maestroCli.runMaestro).mockResolvedValueOnce({
        stdout: '✓ Launch app\n✓ Tap Login\n✗ Assert Welcome',
        stderr: '',
        exitCode: 1,
      });

      const result = await runFlow(baseOptions);

      expect(result.success).toBe(true);
      expect(result.data?.totalSteps).toBe(3);
      expect(result.data?.passedSteps).toBe(2);
      expect(result.data?.failedSteps).toBe(1);
    });

    it('passes environment variables to flow', async () => {
      const options = {
        ...baseOptions,
        env: { USERNAME: 'test@example.com', PASSWORD: 'secret' },
      };

      await runFlow(options);

      const runMaestroCalls = vi.mocked(maestroCli.runMaestro).mock.calls;
      expect(runMaestroCalls.length).toBe(1);
      const args = runMaestroCalls[0][0];
      expect(args).toContain('-e');
      expect(args.join(' ')).toContain('USERNAME=test@example.com');
    });

    it('tracks duration correctly', async () => {
      const result = await runFlow(baseOptions);

      expect(result.success).toBe(true);
      // Duration can be 0 in mocked tests since mocks execute instantly
      expect(result.data?.duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('runFlowWithRetry', () => {
    const baseOptions = {
      flowPath: '/test/flows/login.yaml',
      sessionId: 'session-123',
      maxRetries: 3,
      retryDelay: 100,
    };

    it('returns immediately on success', async () => {
      const result = await runFlowWithRetry(baseOptions);

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
      expect(vi.mocked(maestroCli.runMaestro)).toHaveBeenCalledTimes(1);
    });

    it('retries on failure up to maxRetries', async () => {
      vi.mocked(maestroCli.runMaestro)
        .mockResolvedValueOnce({ stdout: '✗ Failed', stderr: '', exitCode: 1 })
        .mockResolvedValueOnce({ stdout: '✗ Failed', stderr: '', exitCode: 1 })
        .mockResolvedValueOnce({ stdout: '✓ Passed', stderr: '', exitCode: 0 });

      const result = await runFlowWithRetry(baseOptions);

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
      expect(vi.mocked(maestroCli.runMaestro)).toHaveBeenCalledTimes(3);
    });

    it('returns failure after exhausting retries', async () => {
      vi.mocked(maestroCli.runMaestro).mockResolvedValue({
        stdout: '✗ Failed',
        stderr: 'Error',
        exitCode: 1,
      });

      const result = await runFlowWithRetry(baseOptions);

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(false);
      expect(vi.mocked(maestroCli.runMaestro)).toHaveBeenCalledTimes(3);
    });

    it('only retries on matching error patterns', async () => {
      vi.mocked(maestroCli.runMaestro).mockResolvedValue({
        stdout: '✗ Failed',
        stderr: '',
        exitCode: 1,
      });

      const options = {
        ...baseOptions,
        retryOnErrors: ['timeout', 'network'],
      };

      // First run fails with non-matching error
      vi.mocked(maestroCli.runMaestro).mockResolvedValueOnce({
        stdout: '✗ Step failed: Element not found',
        stderr: '',
        exitCode: 1,
      });

      const result = await runFlowWithRetry(options);

      // Should not retry because error doesn't match patterns
      expect(vi.mocked(maestroCli.runMaestro)).toHaveBeenCalledTimes(1);
      expect(result.data?.passed).toBe(false);
    });
  });

  describe('runFlows', () => {
    const flowPaths = [
      '/test/flows/flow1.yaml',
      '/test/flows/flow2.yaml',
      '/test/flows/flow3.yaml',
    ];
    const baseOptions = { sessionId: 'session-123' };

    it('runs multiple flows in sequence', async () => {
      // Reset mocks for this test to ensure clean state
      vi.mocked(maestroCli.runMaestro).mockResolvedValue({
        stdout: '✓ Passed',
        stderr: '',
        exitCode: 0,
      });
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const result = await runFlows(flowPaths, baseOptions);

      expect(result.success).toBe(true);
      expect(result.data?.totalFlows).toBe(3);
      expect(result.data?.passedFlows).toBe(3);
      expect(result.data?.results.length).toBe(3);
    });

    it('stops on first failure by default', async () => {
      vi.mocked(maestroCli.runMaestro)
        .mockResolvedValueOnce({ stdout: '✓ Passed', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '✗ Failed', stderr: '', exitCode: 1 })
        .mockResolvedValueOnce({ stdout: '✓ Passed', stderr: '', exitCode: 0 });

      const result = await runFlows(flowPaths, baseOptions);

      expect(result.success).toBe(true);
      expect(result.data?.results.length).toBe(2);
      expect(result.data?.passedFlows).toBe(1);
      expect(result.data?.failedFlows).toBe(1);
    });

    it('continues on failure when continueOnError is true', async () => {
      vi.mocked(maestroCli.runMaestro)
        .mockResolvedValueOnce({ stdout: '✓ Passed', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '✗ Failed', stderr: '', exitCode: 1 })
        .mockResolvedValueOnce({ stdout: '✓ Passed', stderr: '', exitCode: 0 });

      const result = await runFlows(flowPaths, { ...baseOptions, continueOnError: true });

      expect(result.success).toBe(true);
      expect(result.data?.results.length).toBe(3);
      expect(result.data?.passedFlows).toBe(2);
      expect(result.data?.failedFlows).toBe(1);
    });

    it('tracks total duration', async () => {
      // Reset mocks for this test to ensure clean state
      vi.mocked(maestroCli.runMaestro).mockResolvedValue({
        stdout: '✓ Passed',
        stderr: '',
        exitCode: 0,
      });
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const result = await runFlows(flowPaths, baseOptions);

      expect(result.success).toBe(true);
      // Duration can be 0 in mocked tests since mocks execute instantly
      expect(result.data?.totalDuration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('validateFlow', () => {
    it('returns valid for existing flow file', async () => {
      const result = await validateFlow('/test/flows/valid.yaml');

      expect(result.success).toBe(true);
      expect(result.data?.valid).toBe(true);
      expect(result.data?.errors.length).toBe(0);
    });

    it('returns error for non-existent file', async () => {
      vi.mocked(fs.access).mockRejectedValueOnce(new Error('ENOENT'));

      const result = await validateFlow('/test/flows/missing.yaml');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Flow file not found');
    });

    it('detects empty flow file', async () => {
      vi.mocked(fs.readFile).mockResolvedValueOnce('');

      const result = await validateFlow('/test/flows/empty.yaml');

      expect(result.success).toBe(true);
      expect(result.data?.valid).toBe(false);
      expect(result.data?.errors).toContain('Flow file is empty');
    });

    it('detects flow with no steps', async () => {
      vi.mocked(fs.readFile).mockResolvedValueOnce('appId: com.example.app');

      const result = await validateFlow('/test/flows/no-steps.yaml');

      expect(result.success).toBe(true);
      expect(result.data?.valid).toBe(false);
      expect(result.data?.errors.some(e => e.includes('no steps'))).toBe(true);
    });
  });

  describe('validateFlowWithMaestro', () => {
    it('returns validation result from maestro', async () => {
      vi.mocked(maestroCli.runMaestro).mockResolvedValueOnce({
        stdout: 'Flow is valid',
        stderr: '',
        exitCode: 0,
      });

      const result = await validateFlowWithMaestro('/test/flows/valid.yaml');

      expect(result.success).toBe(true);
      expect(result.data).toBe('Flow is valid');
    });

    it('returns error when validation fails', async () => {
      vi.mocked(maestroCli.runMaestro).mockResolvedValueOnce({
        stdout: '',
        stderr: 'Invalid YAML syntax',
        exitCode: 1,
      });

      const result = await validateFlowWithMaestro('/test/flows/invalid.yaml');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid YAML syntax');
    });

    it('returns error when Maestro is not available', async () => {
      vi.mocked(maestroCli.isMaestroAvailable).mockResolvedValueOnce(false);

      const result = await validateFlowWithMaestro('/test/flows/valid.yaml');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Maestro CLI is not installed');
    });
  });
});
