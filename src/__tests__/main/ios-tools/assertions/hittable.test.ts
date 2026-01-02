/**
 * Tests for iOS Hittable Assertions
 *
 * Tests the assertHittable and assertNotHittable functions
 * for verifying element tap-ability state.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies before importing the module
vi.mock('../../../../main/ios-tools/simulator', () => ({
  getBootedSimulators: vi.fn(),
  getSimulator: vi.fn(),
}));

vi.mock('../../../../main/ios-tools/capture', () => ({
  screenshot: vi.fn(),
}));

vi.mock('../../../../main/ios-tools/inspect-simple', () => ({
  inspect: vi.fn(),
}));

vi.mock('../../../../main/ios-tools/artifacts', () => ({
  getSnapshotDirectory: vi.fn(),
}));

vi.mock('../../../../main/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  assertHittable,
  assertNotHittable,
  assertHittableById,
  assertHittableByLabel,
  assertHittableByText,
  assertNotHittableById,
  assertNotHittableByLabel,
  assertNotHittableByText,
} from '../../../../main/ios-tools/assertions/hittable';
import { getBootedSimulators, getSimulator } from '../../../../main/ios-tools/simulator';
import { screenshot } from '../../../../main/ios-tools/capture';
import { inspect } from '../../../../main/ios-tools/inspect-simple';
import { getSnapshotDirectory } from '../../../../main/ios-tools/artifacts';

describe('hittable assertions', () => {
  const mockUdid = 'test-udid-12345';
  const mockSessionId = 'test-session';

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock for booted simulators
    vi.mocked(getBootedSimulators).mockResolvedValue({
      success: true,
      data: [{ udid: mockUdid, name: 'iPhone 15', state: 'Booted' }],
    });

    // Default mock for simulator info
    vi.mocked(getSimulator).mockResolvedValue({
      success: true,
      data: {
        udid: mockUdid,
        name: 'iPhone 15',
        state: 'Booted',
        iosVersion: '17.0',
      },
    });

    // Default mock for artifact directory
    vi.mocked(getSnapshotDirectory).mockResolvedValue('/tmp/artifacts/test');

    // Default mock for screenshot
    vi.mocked(screenshot).mockResolvedValue({
      success: true,
      data: { path: '/tmp/artifacts/test/screenshot.png' },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('assertHittable', () => {
    it('should pass when element is visible, enabled, and has non-zero size', async () => {
      vi.mocked(inspect).mockResolvedValue({
        success: true,
        data: {
          id: 'inspect-1',
          timestamp: new Date().toISOString(),
          simulator: { udid: mockUdid, name: 'iPhone 15', iosVersion: '17.0' },
          tree: {
            type: 'Application',
            identifier: 'app',
            visible: true,
            enabled: true,
            frame: { x: 0, y: 0, width: 375, height: 812 },
            children: [
              {
                type: 'Button',
                identifier: 'submit_button',
                label: 'Submit',
                visible: true,
                enabled: true,
                frame: { x: 100, y: 200, width: 150, height: 44 },
                children: [],
              },
            ],
          },
          elements: [
            {
              type: 'Button',
              identifier: 'submit_button',
              label: 'Submit',
              visible: true,
              enabled: true,
              frame: { x: 100, y: 200, width: 150, height: 44 },
              children: [],
            },
          ],
          stats: { totalElements: 2, interactableElements: 1, buttons: 1, textFields: 0, textElements: 0, images: 0 },
        },
      });

      const result = await assertHittable({
        sessionId: mockSessionId,
        target: { identifier: 'submit_button' },
        polling: { timeout: 100, pollInterval: 50 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('passed');
      expect(result.data?.data?.wasVisible).toBe(true);
      expect(result.data?.data?.wasEnabled).toBe(true);
      expect(result.data?.data?.hasNonZeroSize).toBe(true);
    });

    it('should fail when element is not visible', async () => {
      vi.mocked(inspect).mockResolvedValue({
        success: true,
        data: {
          id: 'inspect-1',
          timestamp: new Date().toISOString(),
          simulator: { udid: mockUdid, name: 'iPhone 15', iosVersion: '17.0' },
          tree: {
            type: 'Application',
            identifier: 'app',
            visible: true,
            enabled: true,
            frame: { x: 0, y: 0, width: 375, height: 812 },
            traits: [],
            children: [
              {
                type: 'Button',
                identifier: 'hidden_button',
                visible: false,  // Not visible
                enabled: true,
                frame: { x: 100, y: 200, width: 150, height: 44 },
                traits: ['Button'],
                children: [],
              },
            ],
          },
          elements: [],
          stats: { totalElements: 2, interactableElements: 0, buttons: 1, textFields: 0, textElements: 0, images: 0 },
        },
      });

      const result = await assertHittable({
        sessionId: mockSessionId,
        target: { identifier: 'hidden_button' },
        polling: { timeout: 100, pollInterval: 50 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('timeout');
      expect(result.data?.data?.notHittableReason).toBe('not_visible');
    });

    it('should fail when element is not enabled', async () => {
      vi.mocked(inspect).mockResolvedValue({
        success: true,
        data: {
          id: 'inspect-1',
          timestamp: new Date().toISOString(),
          simulator: { udid: mockUdid, name: 'iPhone 15', iosVersion: '17.0' },
          tree: {
            type: 'Application',
            identifier: 'app',
            visible: true,
            enabled: true,
            frame: { x: 0, y: 0, width: 375, height: 812 },
            traits: [],
            children: [
              {
                type: 'Button',
                identifier: 'disabled_button',
                visible: true,
                enabled: false,  // Not enabled
                frame: { x: 100, y: 200, width: 150, height: 44 },
                traits: ['Button'],
                children: [],
              },
            ],
          },
          elements: [],
          stats: { totalElements: 2, interactableElements: 0, buttons: 1, textFields: 0, textElements: 0, images: 0 },
        },
      });

      const result = await assertHittable({
        sessionId: mockSessionId,
        target: { identifier: 'disabled_button' },
        polling: { timeout: 100, pollInterval: 50 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('timeout');
      expect(result.data?.data?.notHittableReason).toBe('not_enabled');
    });

    it('should fail when element has zero size', async () => {
      vi.mocked(inspect).mockResolvedValue({
        success: true,
        data: {
          id: 'inspect-1',
          timestamp: new Date().toISOString(),
          simulator: { udid: mockUdid, name: 'iPhone 15', iosVersion: '17.0' },
          tree: {
            type: 'Application',
            identifier: 'app',
            visible: true,
            enabled: true,
            frame: { x: 0, y: 0, width: 375, height: 812 },
            children: [
              {
                type: 'Button',
                identifier: 'zero_size_button',
                visible: true,
                enabled: true,
                frame: { x: 100, y: 200, width: 0, height: 0 },  // Zero size
                children: [],
              },
            ],
          },
          elements: [],
          stats: { totalElements: 2, interactableElements: 0, buttons: 1, textFields: 0, textElements: 0, images: 0 },
        },
      });

      const result = await assertHittable({
        sessionId: mockSessionId,
        target: { identifier: 'zero_size_button' },
        polling: { timeout: 100, pollInterval: 50 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('timeout');
      expect(result.data?.data?.hasNonZeroSize).toBe(false);
      expect(result.data?.data?.notHittableReason).toBe('zero_size');
    });

    it('should fail when element is off-screen', async () => {
      vi.mocked(inspect).mockResolvedValue({
        success: true,
        data: {
          id: 'inspect-1',
          timestamp: new Date().toISOString(),
          simulator: { udid: mockUdid, name: 'iPhone 15', iosVersion: '17.0' },
          tree: {
            type: 'Application',
            identifier: 'app',
            visible: true,
            enabled: true,
            frame: { x: 0, y: 0, width: 375, height: 812 },
            children: [
              {
                type: 'Button',
                identifier: 'offscreen_button',
                visible: true,
                enabled: true,
                frame: { x: 500, y: 1000, width: 100, height: 44 },  // Off-screen
                children: [],
              },
            ],
          },
          elements: [],
          stats: { totalElements: 2, interactableElements: 1, buttons: 1, textFields: 0, textElements: 0, images: 0 },
        },
      });

      const result = await assertHittable({
        sessionId: mockSessionId,
        target: { identifier: 'offscreen_button' },
        polling: { timeout: 100, pollInterval: 50 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('timeout');
      expect(result.data?.data?.isOffScreen).toBe(true);
      expect(result.data?.data?.notHittableReason).toBe('off_screen');
    });

    it('should fail when element is obscured by an alert', async () => {
      vi.mocked(inspect).mockResolvedValue({
        success: true,
        data: {
          id: 'inspect-1',
          timestamp: new Date().toISOString(),
          simulator: { udid: mockUdid, name: 'iPhone 15', iosVersion: '17.0' },
          tree: {
            type: 'Application',
            identifier: 'app',
            visible: true,
            enabled: true,
            frame: { x: 0, y: 0, width: 375, height: 812 },
            children: [
              {
                type: 'Button',
                identifier: 'submit_button',
                visible: true,
                enabled: true,
                frame: { x: 100, y: 200, width: 150, height: 44 },
                children: [],
              },
              {
                type: 'Alert',
                identifier: 'error_alert',
                visible: true,
                enabled: true,
                frame: { x: 50, y: 150, width: 275, height: 200 },  // Covers the button
                children: [],
              },
            ],
          },
          elements: [
            {
              type: 'Button',
              identifier: 'submit_button',
              visible: true,
              enabled: true,
              frame: { x: 100, y: 200, width: 150, height: 44 },
              children: [],
            },
            {
              type: 'Alert',
              identifier: 'error_alert',
              visible: true,
              enabled: true,
              frame: { x: 50, y: 150, width: 275, height: 200 },
              children: [],
            },
          ],
          stats: { totalElements: 3, interactableElements: 1, buttons: 1, textFields: 0, textElements: 0, images: 0 },
        },
      });

      const result = await assertHittable({
        sessionId: mockSessionId,
        target: { identifier: 'submit_button' },
        polling: { timeout: 100, pollInterval: 50 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('timeout');
      expect(result.data?.data?.notHittableReason).toBe('obscured');
      expect(result.data?.data?.obscuringElement).toBeDefined();
      expect(result.data?.data?.obscuringElement?.type).toBe('Alert');
    });

    it('should fail when element is not found', async () => {
      vi.mocked(inspect).mockResolvedValue({
        success: true,
        data: {
          id: 'inspect-1',
          timestamp: new Date().toISOString(),
          simulator: { udid: mockUdid, name: 'iPhone 15', iosVersion: '17.0' },
          tree: {
            type: 'Application',
            identifier: 'app',
            visible: true,
            enabled: true,
            frame: { x: 0, y: 0, width: 375, height: 812 },
            children: [],
          },
          elements: [],
          stats: { totalElements: 1, interactableElements: 0, buttons: 0, textFields: 0, textElements: 0, images: 0 },
        },
      });

      const result = await assertHittable({
        sessionId: mockSessionId,
        target: { identifier: 'nonexistent' },
        polling: { timeout: 100, pollInterval: 50 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('timeout');
      expect(result.data?.data?.notHittableReason).toBe('not_found');
    });

    it('should return error when no simulator is booted', async () => {
      vi.mocked(getBootedSimulators).mockResolvedValue({
        success: true,
        data: [],
      });

      const result = await assertHittable({
        sessionId: mockSessionId,
        target: { identifier: 'submit_button' },
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('SIMULATOR_NOT_BOOTED');
    });

    it('should include position data in result', async () => {
      vi.mocked(inspect).mockResolvedValue({
        success: true,
        data: {
          id: 'inspect-1',
          timestamp: new Date().toISOString(),
          simulator: { udid: mockUdid, name: 'iPhone 15', iosVersion: '17.0' },
          tree: {
            type: 'Application',
            identifier: 'app',
            visible: true,
            enabled: true,
            frame: { x: 0, y: 0, width: 375, height: 812 },
            children: [
              {
                type: 'Button',
                identifier: 'submit_button',
                visible: true,
                enabled: true,
                frame: { x: 100, y: 200, width: 150, height: 44 },
                children: [],
              },
            ],
          },
          elements: [],
          stats: { totalElements: 2, interactableElements: 1, buttons: 1, textFields: 0, textElements: 0, images: 0 },
        },
      });

      const result = await assertHittable({
        sessionId: mockSessionId,
        target: { identifier: 'submit_button' },
        polling: { timeout: 100, pollInterval: 50 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.data?.position).toBeDefined();
      expect(result.data?.data?.position?.x).toBe(100);
      expect(result.data?.data?.position?.y).toBe(200);
      expect(result.data?.data?.position?.width).toBe(150);
      expect(result.data?.data?.position?.height).toBe(44);
      expect(result.data?.data?.position?.centerX).toBe(175);
      expect(result.data?.data?.position?.centerY).toBe(222);
    });
  });

  describe('assertNotHittable', () => {
    it('should pass when element is not found', async () => {
      vi.mocked(inspect).mockResolvedValue({
        success: true,
        data: {
          id: 'inspect-1',
          timestamp: new Date().toISOString(),
          simulator: { udid: mockUdid, name: 'iPhone 15', iosVersion: '17.0' },
          tree: {
            type: 'Application',
            identifier: 'app',
            visible: true,
            enabled: true,
            frame: { x: 0, y: 0, width: 375, height: 812 },
            children: [],
          },
          elements: [],
          stats: { totalElements: 1, interactableElements: 0, buttons: 0, textFields: 0, textElements: 0, images: 0 },
        },
      });

      const result = await assertNotHittable({
        sessionId: mockSessionId,
        target: { identifier: 'nonexistent' },
        polling: { timeout: 100, pollInterval: 50 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('passed');
      expect(result.data?.data?.notHittableReason).toBe('not_found');
    });

    it('should pass when element is not visible', async () => {
      vi.mocked(inspect).mockResolvedValue({
        success: true,
        data: {
          id: 'inspect-1',
          timestamp: new Date().toISOString(),
          simulator: { udid: mockUdid, name: 'iPhone 15', iosVersion: '17.0' },
          tree: {
            type: 'Application',
            identifier: 'app',
            visible: true,
            enabled: true,
            frame: { x: 0, y: 0, width: 375, height: 812 },
            traits: [],
            children: [
              {
                type: 'Button',
                identifier: 'hidden_button',
                visible: false,
                enabled: true,
                frame: { x: 100, y: 200, width: 150, height: 44 },
                traits: ['Button'],
                children: [],
              },
            ],
          },
          elements: [],
          stats: { totalElements: 2, interactableElements: 0, buttons: 1, textFields: 0, textElements: 0, images: 0 },
        },
      });

      const result = await assertNotHittable({
        sessionId: mockSessionId,
        target: { identifier: 'hidden_button' },
        polling: { timeout: 100, pollInterval: 50 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('passed');
      expect(result.data?.data?.notHittableReason).toBe('not_visible');
    });

    it('should pass when element is disabled', async () => {
      vi.mocked(inspect).mockResolvedValue({
        success: true,
        data: {
          id: 'inspect-1',
          timestamp: new Date().toISOString(),
          simulator: { udid: mockUdid, name: 'iPhone 15', iosVersion: '17.0' },
          tree: {
            type: 'Application',
            identifier: 'app',
            visible: true,
            enabled: true,
            frame: { x: 0, y: 0, width: 375, height: 812 },
            traits: [],
            children: [
              {
                type: 'Button',
                identifier: 'disabled_button',
                visible: true,
                enabled: false,
                frame: { x: 100, y: 200, width: 150, height: 44 },
                traits: ['Button'],
                children: [],
              },
            ],
          },
          elements: [],
          stats: { totalElements: 2, interactableElements: 0, buttons: 1, textFields: 0, textElements: 0, images: 0 },
        },
      });

      const result = await assertNotHittable({
        sessionId: mockSessionId,
        target: { identifier: 'disabled_button' },
        polling: { timeout: 100, pollInterval: 50 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('passed');
      expect(result.data?.data?.notHittableReason).toBe('not_enabled');
    });

    it('should fail when element is still hittable', async () => {
      vi.mocked(inspect).mockResolvedValue({
        success: true,
        data: {
          id: 'inspect-1',
          timestamp: new Date().toISOString(),
          simulator: { udid: mockUdid, name: 'iPhone 15', iosVersion: '17.0' },
          tree: {
            type: 'Application',
            identifier: 'app',
            visible: true,
            enabled: true,
            frame: { x: 0, y: 0, width: 375, height: 812 },
            children: [
              {
                type: 'Button',
                identifier: 'submit_button',
                visible: true,
                enabled: true,
                frame: { x: 100, y: 200, width: 150, height: 44 },
                children: [],
              },
            ],
          },
          elements: [],
          stats: { totalElements: 2, interactableElements: 1, buttons: 1, textFields: 0, textElements: 0, images: 0 },
        },
      });

      const result = await assertNotHittable({
        sessionId: mockSessionId,
        target: { identifier: 'submit_button' },
        polling: { timeout: 100, pollInterval: 50 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('timeout');
    });
  });

  describe('convenience functions', () => {
    beforeEach(() => {
      vi.mocked(inspect).mockResolvedValue({
        success: true,
        data: {
          id: 'inspect-1',
          timestamp: new Date().toISOString(),
          simulator: { udid: mockUdid, name: 'iPhone 15', iosVersion: '17.0' },
          tree: {
            type: 'Application',
            identifier: 'app',
            visible: true,
            enabled: true,
            frame: { x: 0, y: 0, width: 375, height: 812 },
            children: [
              {
                type: 'Button',
                identifier: 'submit_button',
                label: 'Submit',
                visible: true,
                enabled: true,
                frame: { x: 100, y: 200, width: 150, height: 44 },
                children: [
                  {
                    type: 'StaticText',
                    value: 'Submit',
                    visible: true,
                    enabled: true,
                    frame: { x: 110, y: 210, width: 50, height: 24 },
                    children: [],
                  },
                ],
              },
            ],
          },
          elements: [],
          stats: { totalElements: 3, interactableElements: 1, buttons: 1, textFields: 0, textElements: 1, images: 0 },
        },
      });
    });

    it('assertHittableById should find by identifier', async () => {
      const result = await assertHittableById('submit_button', {
        sessionId: mockSessionId,
        polling: { timeout: 100, pollInterval: 50 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('passed');
      expect(result.data?.data?.matchedBy).toBe('identifier');
    });

    it('assertHittableByLabel should find by label', async () => {
      const result = await assertHittableByLabel('Submit', {
        sessionId: mockSessionId,
        polling: { timeout: 100, pollInterval: 50 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('passed');
      expect(result.data?.data?.matchedBy).toBe('label');
    });

    it('assertHittableByText should find by text content', async () => {
      const result = await assertHittableByText('Submit', {
        sessionId: mockSessionId,
        polling: { timeout: 100, pollInterval: 50 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('passed');
      expect(result.data?.data?.matchedBy).toBe('text');
    });

    it('assertNotHittableById should work correctly', async () => {
      vi.mocked(inspect).mockResolvedValue({
        success: true,
        data: {
          id: 'inspect-1',
          timestamp: new Date().toISOString(),
          simulator: { udid: mockUdid, name: 'iPhone 15', iosVersion: '17.0' },
          tree: {
            type: 'Application',
            identifier: 'app',
            visible: true,
            enabled: true,
            frame: { x: 0, y: 0, width: 375, height: 812 },
            traits: [],
            children: [
              {
                type: 'Button',
                identifier: 'disabled_button',
                visible: true,
                enabled: false,
                frame: { x: 100, y: 200, width: 150, height: 44 },
                traits: ['Button'],
                children: [],
              },
            ],
          },
          elements: [],
          stats: { totalElements: 2, interactableElements: 0, buttons: 1, textFields: 0, textElements: 0, images: 0 },
        },
      });

      const result = await assertNotHittableById('disabled_button', {
        sessionId: mockSessionId,
        polling: { timeout: 100, pollInterval: 50 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('passed');
      // Element is found but not hittable because it's disabled
      expect(result.data?.data?.notHittableReason).toBe('not_enabled');
    });

    it('assertNotHittableByLabel should work correctly', async () => {
      vi.mocked(inspect).mockResolvedValue({
        success: true,
        data: {
          id: 'inspect-1',
          timestamp: new Date().toISOString(),
          simulator: { udid: mockUdid, name: 'iPhone 15', iosVersion: '17.0' },
          tree: {
            type: 'Application',
            identifier: 'app',
            visible: true,
            enabled: true,
            frame: { x: 0, y: 0, width: 375, height: 812 },
            traits: [],
            children: [
              {
                type: 'Button',
                identifier: 'disabled_button',
                label: 'Disabled',
                visible: true,
                enabled: false,
                frame: { x: 100, y: 200, width: 150, height: 44 },
                traits: ['Button'],
                children: [],
              },
            ],
          },
          elements: [],
          stats: { totalElements: 2, interactableElements: 0, buttons: 1, textFields: 0, textElements: 0, images: 0 },
        },
      });

      const result = await assertNotHittableByLabel('Disabled', {
        sessionId: mockSessionId,
        polling: { timeout: 100, pollInterval: 50 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('passed');
      // Element is found but not hittable because it's disabled
      expect(result.data?.data?.notHittableReason).toBe('not_enabled');
    });

    it('assertNotHittableByText should work correctly', async () => {
      vi.mocked(inspect).mockResolvedValue({
        success: true,
        data: {
          id: 'inspect-1',
          timestamp: new Date().toISOString(),
          simulator: { udid: mockUdid, name: 'iPhone 15', iosVersion: '17.0' },
          tree: {
            type: 'Application',
            identifier: 'app',
            visible: true,
            enabled: true,
            frame: { x: 0, y: 0, width: 375, height: 812 },
            traits: [],
            children: [
              {
                type: 'StaticText',
                value: 'Loading...',
                visible: false,  // Not visible
                enabled: true,
                frame: { x: 100, y: 200, width: 80, height: 24 },
                traits: ['StaticText'],
                children: [],
              },
            ],
          },
          elements: [],
          stats: { totalElements: 2, interactableElements: 0, buttons: 0, textFields: 0, textElements: 1, images: 0 },
        },
      });

      const result = await assertNotHittableByText('Loading...', {
        sessionId: mockSessionId,
        polling: { timeout: 100, pollInterval: 50 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('passed');
      // Element is found but not hittable because it's not visible
      expect(result.data?.data?.notHittableReason).toBe('not_visible');
    });
  });

  describe('screenshot capture', () => {
    it('should capture screenshot on failure when captureOnFailure is true', async () => {
      vi.mocked(inspect).mockResolvedValue({
        success: true,
        data: {
          id: 'inspect-1',
          timestamp: new Date().toISOString(),
          simulator: { udid: mockUdid, name: 'iPhone 15', iosVersion: '17.0' },
          tree: {
            type: 'Application',
            identifier: 'app',
            visible: true,
            enabled: true,
            frame: { x: 0, y: 0, width: 375, height: 812 },
            children: [],
          },
          elements: [],
          stats: { totalElements: 1, interactableElements: 0, buttons: 0, textFields: 0, textElements: 0, images: 0 },
        },
      });

      await assertHittable({
        sessionId: mockSessionId,
        target: { identifier: 'nonexistent' },
        captureOnFailure: true,
        polling: { timeout: 100, pollInterval: 50 },
      });

      expect(screenshot).toHaveBeenCalled();
    });

    it('should not capture screenshot on success when captureOnSuccess is false', async () => {
      vi.mocked(inspect).mockResolvedValue({
        success: true,
        data: {
          id: 'inspect-1',
          timestamp: new Date().toISOString(),
          simulator: { udid: mockUdid, name: 'iPhone 15', iosVersion: '17.0' },
          tree: {
            type: 'Application',
            identifier: 'app',
            visible: true,
            enabled: true,
            frame: { x: 0, y: 0, width: 375, height: 812 },
            children: [
              {
                type: 'Button',
                identifier: 'submit_button',
                visible: true,
                enabled: true,
                frame: { x: 100, y: 200, width: 150, height: 44 },
                children: [],
              },
            ],
          },
          elements: [],
          stats: { totalElements: 2, interactableElements: 1, buttons: 1, textFields: 0, textElements: 0, images: 0 },
        },
      });

      await assertHittable({
        sessionId: mockSessionId,
        target: { identifier: 'submit_button' },
        captureOnSuccess: false,
        captureOnFailure: false,
        polling: { timeout: 100, pollInterval: 50 },
      });

      expect(screenshot).not.toHaveBeenCalled();
    });

    it('should capture screenshot on success when captureOnSuccess is true', async () => {
      vi.mocked(inspect).mockResolvedValue({
        success: true,
        data: {
          id: 'inspect-1',
          timestamp: new Date().toISOString(),
          simulator: { udid: mockUdid, name: 'iPhone 15', iosVersion: '17.0' },
          tree: {
            type: 'Application',
            identifier: 'app',
            visible: true,
            enabled: true,
            frame: { x: 0, y: 0, width: 375, height: 812 },
            children: [
              {
                type: 'Button',
                identifier: 'submit_button',
                visible: true,
                enabled: true,
                frame: { x: 100, y: 200, width: 150, height: 44 },
                children: [],
              },
            ],
          },
          elements: [],
          stats: { totalElements: 2, interactableElements: 1, buttons: 1, textFields: 0, textElements: 0, images: 0 },
        },
      });

      await assertHittable({
        sessionId: mockSessionId,
        target: { identifier: 'submit_button' },
        captureOnSuccess: true,
        captureOnFailure: false,
        polling: { timeout: 100, pollInterval: 50 },
      });

      expect(screenshot).toHaveBeenCalled();
    });
  });
});
