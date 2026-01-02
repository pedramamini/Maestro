/**
 * Tests for iOS Snapshot Playbook Action
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { iosSnapshotAction } from '../../../../cli/services/playbook-actions/actions/ios-snapshot';
import type { ActionContext } from '../../../../cli/services/playbook-actions/types';

// Mock the ios-tools module
vi.mock('../../../../main/ios-tools', () => ({
  listSimulators: vi.fn(),
  getBootedSimulators: vi.fn(),
  captureSnapshot: vi.fn(),
  formatSnapshotForAgent: vi.fn(),
}));

import * as iosTools from '../../../../main/ios-tools';

const mockIosTools = vi.mocked(iosTools);

describe('iOS Snapshot Action', () => {
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
      expect(iosSnapshotAction.name).toBe('ios.snapshot');
    });

    it('should have description', () => {
      expect(iosSnapshotAction.description).toBeDefined();
      expect(iosSnapshotAction.description.length).toBeGreaterThan(0);
    });

    it('should define expected inputs', () => {
      expect(iosSnapshotAction.inputs).toHaveProperty('simulator');
      expect(iosSnapshotAction.inputs).toHaveProperty('app');
      expect(iosSnapshotAction.inputs).toHaveProperty('duration');
      expect(iosSnapshotAction.inputs).toHaveProperty('include_crash');
    });

    it('should define expected outputs', () => {
      expect(iosSnapshotAction.outputs).toHaveProperty('screenshotPath');
      expect(iosSnapshotAction.outputs).toHaveProperty('logsPath');
      expect(iosSnapshotAction.outputs).toHaveProperty('hasCrashes');
      expect(iosSnapshotAction.outputs).toHaveProperty('crashPaths');
    });

    it('should have correct input types', () => {
      expect(iosSnapshotAction.inputs.simulator.type).toBe('string');
      expect(iosSnapshotAction.inputs.app.type).toBe('string');
      expect(iosSnapshotAction.inputs.duration.type).toBe('number');
      expect(iosSnapshotAction.inputs.include_crash.type).toBe('boolean');
    });

    it('should have all inputs as optional', () => {
      expect(iosSnapshotAction.inputs.simulator.required).toBeFalsy();
      expect(iosSnapshotAction.inputs.app.required).toBeFalsy();
      expect(iosSnapshotAction.inputs.duration.required).toBeFalsy();
      expect(iosSnapshotAction.inputs.include_crash.required).toBeFalsy();
    });
  });

  describe('Handler - Success Cases', () => {
    // SnapshotResult matching the actual interface
    const mockSnapshotResult = {
      id: 'snap-123',
      timestamp: new Date(),
      artifactDir: '/path/to/artifacts',
      simulator: {
        name: 'iPhone 15 Pro',
        udid: 'ABC123',
        iosVersion: '17.2',
      },
      screenshot: {
        path: '/path/to/screenshot.png',
        size: 12345,
      },
      logs: {
        entries: [],
        counts: {
          error: 2,
          fault: 0,
          warning: 5,
          info: 50,
          debug: 43,
        },
        filePath: '/path/to/logs.json',
      },
      crashes: {
        hasCrashes: false,
        reports: [],
      },
    };

    const mockFormattedOutput = {
      summary: 'Snapshot captured',
      sections: {},
      fullOutput: '## iOS Snapshot\n...',
    };

    beforeEach(() => {
      // IOSResult wrapper
      mockIosTools.captureSnapshot.mockResolvedValue({
        success: true,
        data: mockSnapshotResult,
      });
      mockIosTools.formatSnapshotForAgent.mockReturnValue(mockFormattedOutput);
    });

    it('should capture snapshot with first booted simulator when none specified', async () => {
      mockIosTools.getBootedSimulators.mockResolvedValue({
        success: true,
        data: [{ udid: 'ABC123', name: 'iPhone 15', state: 'Booted', runtime: 'iOS 17.2' }],
      });

      const result = await iosSnapshotAction.handler({}, mockContext);

      expect(result.success).toBe(true);
      expect(mockIosTools.captureSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          udid: 'ABC123',
          sessionId: 'test-session',
        })
      );
    });

    it('should resolve simulator by name', async () => {
      mockIosTools.listSimulators.mockResolvedValue({
        success: true,
        data: [{ udid: 'DEF456', name: 'iPhone 15 Pro', state: 'Booted', runtime: 'iOS 17.2' }],
      });

      const result = await iosSnapshotAction.handler(
        { simulator: 'iPhone 15 Pro' },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(mockIosTools.captureSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          udid: 'DEF456',
        })
      );
    });

    it('should use UDID directly if provided', async () => {
      // Use a valid UUID format (hex characters only: 0-9, A-F)
      const validUuid = 'ABC12345-6789-ABCD-EF01-123456789ABC';

      const result = await iosSnapshotAction.handler(
        { simulator: validUuid },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(mockIosTools.listSimulators).not.toHaveBeenCalled();
      expect(mockIosTools.captureSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          udid: validUuid,
        })
      );
    });

    it('should pass bundleId when app is specified', async () => {
      mockIosTools.getBootedSimulators.mockResolvedValue({
        success: true,
        data: [{ udid: 'ABC123', name: 'iPhone 15', state: 'Booted', runtime: 'iOS 17.2' }],
      });

      const result = await iosSnapshotAction.handler(
        { app: 'com.example.myapp' },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(mockIosTools.captureSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          bundleId: 'com.example.myapp',
        })
      );
    });

    it('should pass duration when specified', async () => {
      mockIosTools.getBootedSimulators.mockResolvedValue({
        success: true,
        data: [{ udid: 'ABC123', name: 'iPhone 15', state: 'Booted', runtime: 'iOS 17.2' }],
      });

      const result = await iosSnapshotAction.handler(
        { duration: 120 },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(mockIosTools.captureSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          logDuration: 120,
        })
      );
    });

    it('should use default duration of 60 seconds', async () => {
      mockIosTools.getBootedSimulators.mockResolvedValue({
        success: true,
        data: [{ udid: 'ABC123', name: 'iPhone 15', state: 'Booted', runtime: 'iOS 17.2' }],
      });

      const result = await iosSnapshotAction.handler({}, mockContext);

      expect(result.success).toBe(true);
      expect(mockIosTools.captureSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          logDuration: 60,
        })
      );
    });

    it('should pass include_crash flag', async () => {
      mockIosTools.getBootedSimulators.mockResolvedValue({
        success: true,
        data: [{ udid: 'ABC123', name: 'iPhone 15', state: 'Booted', runtime: 'iOS 17.2' }],
      });

      const result = await iosSnapshotAction.handler(
        { include_crash: true },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(mockIosTools.captureSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          includeCrashContent: true,
        })
      );
    });

    it('should return structured output data', async () => {
      mockIosTools.getBootedSimulators.mockResolvedValue({
        success: true,
        data: [{ udid: 'ABC123', name: 'iPhone 15', state: 'Booted', runtime: 'iOS 17.2' }],
      });

      const result = await iosSnapshotAction.handler({}, mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(
        expect.objectContaining({
          screenshotPath: '/path/to/screenshot.png',
          logsPath: '/path/to/logs.json',
          hasCrashes: false,
          crashPaths: [],
          snapshotId: 'snap-123',
          simulator: expect.objectContaining({
            name: 'iPhone 15 Pro',
          }),
        })
      );
    });

    it('should include formatted output for agent display', async () => {
      mockIosTools.getBootedSimulators.mockResolvedValue({
        success: true,
        data: [{ udid: 'ABC123', name: 'iPhone 15', state: 'Booted', runtime: 'iOS 17.2' }],
      });

      const result = await iosSnapshotAction.handler({}, mockContext);

      expect(result.success).toBe(true);
      expect((result.data as { formattedOutput: string }).formattedOutput).toBe('## iOS Snapshot\n...');
    });

    it('should indicate errors in message when present', async () => {
      const resultWithErrors = {
        ...mockSnapshotResult,
        logs: {
          ...mockSnapshotResult.logs,
          counts: { ...mockSnapshotResult.logs.counts, error: 5, fault: 0 },
        },
      };
      mockIosTools.captureSnapshot.mockResolvedValue({
        success: true,
        data: resultWithErrors,
      });
      mockIosTools.getBootedSimulators.mockResolvedValue({
        success: true,
        data: [{ udid: 'ABC123', name: 'iPhone 15', state: 'Booted', runtime: 'iOS 17.2' }],
      });

      const result = await iosSnapshotAction.handler({}, mockContext);

      expect(result.success).toBe(true);
      expect(result.message).toContain('5 errors');
    });

    it('should indicate crashes in message when present', async () => {
      const resultWithCrashes = {
        ...mockSnapshotResult,
        crashes: {
          hasCrashes: true,
          reports: [{ path: '/crash.log', timestamp: new Date(), bundleId: 'com.example' }],
        },
      };
      mockIosTools.captureSnapshot.mockResolvedValue({
        success: true,
        data: resultWithCrashes,
      });
      mockIosTools.getBootedSimulators.mockResolvedValue({
        success: true,
        data: [{ udid: 'ABC123', name: 'iPhone 15', state: 'Booted', runtime: 'iOS 17.2' }],
      });

      const result = await iosSnapshotAction.handler({}, mockContext);

      expect(result.success).toBe(true);
      expect(result.message).toContain('CRASH LOGS FOUND');
    });
  });

  describe('Handler - Failure Cases', () => {
    it('should fail when no simulator is booted and none specified', async () => {
      mockIosTools.getBootedSimulators.mockResolvedValue({
        success: true,
        data: [],
      });

      const result = await iosSnapshotAction.handler({}, mockContext);

      expect(result.success).toBe(false);
      expect(result.message).toContain('No booted simulator');
    });

    it('should fail when specified simulator is not found', async () => {
      mockIosTools.listSimulators.mockResolvedValue({
        success: true,
        data: [],
      });
      mockIosTools.getBootedSimulators.mockResolvedValue({
        success: true,
        data: [],
      });

      const result = await iosSnapshotAction.handler(
        { simulator: 'NonExistent Simulator' },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('NonExistent Simulator');
    });

    it('should fail when captureSnapshot returns error', async () => {
      mockIosTools.getBootedSimulators.mockResolvedValue({
        success: true,
        data: [{ udid: 'ABC123', name: 'iPhone 15', state: 'Booted', runtime: 'iOS 17.2' }],
      });
      mockIosTools.captureSnapshot.mockResolvedValue({
        success: false,
        error: 'Capture failed',
      });

      const result = await iosSnapshotAction.handler({}, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Capture failed');
    });

    it('should fail when captureSnapshot throws', async () => {
      mockIosTools.getBootedSimulators.mockResolvedValue({
        success: true,
        data: [{ udid: 'ABC123', name: 'iPhone 15', state: 'Booted', runtime: 'iOS 17.2' }],
      });
      mockIosTools.captureSnapshot.mockRejectedValue(new Error('Unexpected error'));

      const result = await iosSnapshotAction.handler({}, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unexpected error');
    });

    it('should include elapsed time on failure', async () => {
      mockIosTools.getBootedSimulators.mockResolvedValue({
        success: true,
        data: [],
      });

      const result = await iosSnapshotAction.handler({}, mockContext);

      expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Handler - Edge Cases', () => {
    it('should handle simulator name case-insensitively', async () => {
      mockIosTools.listSimulators.mockResolvedValue({
        success: true,
        data: [{ udid: 'ABC123', name: 'iPhone 15 Pro', state: 'Booted', runtime: 'iOS 17.2' }],
      });
      mockIosTools.captureSnapshot.mockResolvedValue({
        success: true,
        data: {
          id: 'snap-123',
          timestamp: new Date(),
          artifactDir: '/path/to/artifacts',
          simulator: {
            name: 'iPhone 15 Pro',
            udid: 'ABC123',
            iosVersion: '17.2',
          },
          screenshot: {
            path: '/path/to/screenshot.png',
            size: 12345,
          },
          logs: {
            entries: [],
            counts: { error: 0, fault: 0, warning: 0, info: 0, debug: 0 },
          },
          crashes: {
            hasCrashes: false,
            reports: [],
          },
        },
      });
      mockIosTools.formatSnapshotForAgent.mockReturnValue({
        summary: 'Snapshot captured',
        sections: {},
        fullOutput: '...',
      });

      const result = await iosSnapshotAction.handler(
        { simulator: 'iphone 15 pro' },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(mockIosTools.captureSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          udid: 'ABC123',
        })
      );
    });

    it('should handle listSimulators failure gracefully', async () => {
      mockIosTools.listSimulators.mockResolvedValue({
        success: false,
        error: 'Failed to list simulators',
      });
      mockIosTools.getBootedSimulators.mockResolvedValue({
        success: true,
        data: [],
      });

      const result = await iosSnapshotAction.handler(
        { simulator: 'iPhone 15' },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('iPhone 15');
    });

    it('should handle getBootedSimulators failure gracefully', async () => {
      mockIosTools.getBootedSimulators.mockResolvedValue({
        success: false,
        error: 'Failed to get booted simulators',
      });

      const result = await iosSnapshotAction.handler({}, mockContext);

      expect(result.success).toBe(false);
      expect(result.message).toContain('No booted simulator');
    });
  });
});
