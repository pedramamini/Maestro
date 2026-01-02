/**
 * Tests for iOS Interaction Playbook Actions
 *
 * Tests for ios.run_flow, ios.tap, ios.type, ios.scroll, ios.swipe actions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  iosRunFlowAction,
  iosTapAction,
  iosTypeAction,
  iosScrollAction,
  iosSwipeAction,
} from '../../../../cli/services/playbook-actions/actions';
import type { ActionContext } from '../../../../cli/services/playbook-actions/types';

// Mock the ios-tools module
vi.mock('../../../../main/ios-tools', () => ({
  listSimulators: vi.fn(),
  getBootedSimulators: vi.fn(),
  isMaestroAvailable: vi.fn(),
  detectMaestroCli: vi.fn(),
  runFlow: vi.fn(),
  runFlowWithRetry: vi.fn(),
  formatFlowResult: vi.fn(),
  createNativeDriver: vi.fn(),
  byId: vi.fn((id) => ({ type: 'identifier', value: id })),
  byLabel: vi.fn((label) => ({ type: 'label', value: label })),
  byCoordinates: vi.fn((x, y) => ({ type: 'coordinates', value: `${x},${y}` })),
  nativeTap: vi.fn((target, options) => ({ type: 'tap', target, ...options })),
  nativeDoubleTap: vi.fn((target) => ({ type: 'doubleTap', target })),
  nativeLongPress: vi.fn((target, duration) => ({ type: 'longPress', target, duration })),
  nativeTypeText: vi.fn((text, options) => ({ type: 'typeText', text, ...options })),
  nativeScroll: vi.fn((direction, options) => ({ type: 'scroll', direction, ...options })),
  nativeScrollTo: vi.fn((target, options) => ({ type: 'scrollTo', target, ...options })),
  nativeSwipe: vi.fn((direction, options) => ({ type: 'swipe', direction, ...options })),
}));

import * as iosTools from '../../../../main/ios-tools';

const mockIosTools = vi.mocked(iosTools);

describe('iOS Interaction Actions', () => {
  const mockContext: ActionContext = {
    cwd: '/test/project',
    sessionId: 'test-session',
    variables: {},
  };

  const mockBootedSimulator = {
    udid: 'ABC12345-6789-ABCD-EF01-123456789ABC',
    name: 'iPhone 15 Pro',
    state: 'Booted',
    runtime: 'iOS 17.2',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock for booted simulators
    mockIosTools.getBootedSimulators.mockResolvedValue({
      success: true,
      data: [mockBootedSimulator],
    });

    mockIosTools.listSimulators.mockResolvedValue({
      success: true,
      data: [mockBootedSimulator],
    });
  });

  // ===========================================================================
  // ios.run_flow Action Tests
  // ===========================================================================
  describe('ios.run_flow Action', () => {
    describe('Action Definition', () => {
      it('should have correct name', () => {
        expect(iosRunFlowAction.name).toBe('ios.run_flow');
      });

      it('should have description', () => {
        expect(iosRunFlowAction.description).toBeDefined();
        expect(iosRunFlowAction.description.length).toBeGreaterThan(0);
      });

      it('should define expected inputs', () => {
        expect(iosRunFlowAction.inputs).toHaveProperty('flow');
        expect(iosRunFlowAction.inputs).toHaveProperty('app');
        expect(iosRunFlowAction.inputs).toHaveProperty('simulator');
        expect(iosRunFlowAction.inputs).toHaveProperty('timeout');
        expect(iosRunFlowAction.inputs).toHaveProperty('retry');
      });

      it('should require flow input', () => {
        expect(iosRunFlowAction.inputs.flow.required).toBe(true);
      });

      it('should define expected outputs', () => {
        expect(iosRunFlowAction.outputs).toHaveProperty('passed');
        expect(iosRunFlowAction.outputs).toHaveProperty('duration');
        expect(iosRunFlowAction.outputs).toHaveProperty('totalSteps');
        expect(iosRunFlowAction.outputs).toHaveProperty('steps');
      });
    });

    describe('Handler - Success Cases', () => {
      const mockFlowResult = {
        passed: true,
        duration: 5000,
        flowPath: '/test/project/flows/test.yaml',
        udid: 'ABC12345-6789-ABCD-EF01-123456789ABC',
        totalSteps: 5,
        passedSteps: 5,
        failedSteps: 0,
        skippedSteps: 0,
        steps: [],
        rawOutput: 'Flow completed',
        exitCode: 0,
      };

      beforeEach(() => {
        mockIosTools.isMaestroAvailable.mockResolvedValue(true);
        mockIosTools.runFlow.mockResolvedValue({
          success: true,
          data: mockFlowResult,
        });
        mockIosTools.formatFlowResult.mockReturnValue({
          fullOutput: 'Flow passed: 5/5 steps',
        });
      });

      it('should run flow successfully', async () => {
        const result = await iosRunFlowAction.handler(
          { flow: 'flows/test.yaml' },
          mockContext
        );

        expect(result.success).toBe(true);
        expect(result.data).toHaveProperty('passed', true);
        expect(result.data).toHaveProperty('totalSteps', 5);
      });

      it('should use runFlowWithRetry when retry > 1', async () => {
        mockIosTools.runFlowWithRetry.mockResolvedValue({
          success: true,
          data: mockFlowResult,
        });

        const result = await iosRunFlowAction.handler(
          { flow: 'flows/test.yaml', retry: 3 },
          mockContext
        );

        expect(result.success).toBe(true);
        expect(mockIosTools.runFlowWithRetry).toHaveBeenCalled();
      });

      it('should pass environment variables', async () => {
        await iosRunFlowAction.handler(
          { flow: 'flows/test.yaml', env: { MY_VAR: 'value' } },
          mockContext
        );

        expect(mockIosTools.runFlow).toHaveBeenCalledWith(
          expect.objectContaining({
            env: { MY_VAR: 'value' },
          })
        );
      });
    });

    describe('Handler - Failure Cases', () => {
      it('should fail when flow path is empty', async () => {
        const result = await iosRunFlowAction.handler(
          { flow: '' },
          mockContext
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('flow');
      });

      it('should fail when Maestro is not available', async () => {
        mockIosTools.isMaestroAvailable.mockResolvedValue(false);
        mockIosTools.detectMaestroCli.mockResolvedValue({
          success: true,
          data: { installInstructions: 'brew install maestro' },
        });

        const result = await iosRunFlowAction.handler(
          { flow: 'flows/test.yaml' },
          mockContext
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('Maestro');
      });

      it('should fail when no simulator is booted', async () => {
        mockIosTools.isMaestroAvailable.mockResolvedValue(true);
        mockIosTools.getBootedSimulators.mockResolvedValue({
          success: true,
          data: [],
        });

        const result = await iosRunFlowAction.handler(
          { flow: 'flows/test.yaml' },
          mockContext
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('booted');
      });
    });
  });

  // ===========================================================================
  // ios.tap Action Tests
  // ===========================================================================
  describe('ios.tap Action', () => {
    const mockDriver = {
      execute: vi.fn(),
    };

    beforeEach(() => {
      mockIosTools.createNativeDriver.mockReturnValue(mockDriver as any);
    });

    describe('Action Definition', () => {
      it('should have correct name', () => {
        expect(iosTapAction.name).toBe('ios.tap');
      });

      it('should require target and app inputs', () => {
        expect(iosTapAction.inputs.target.required).toBe(true);
        expect(iosTapAction.inputs.app.required).toBe(true);
      });

      it('should define tap modifiers', () => {
        expect(iosTapAction.inputs).toHaveProperty('double');
        expect(iosTapAction.inputs).toHaveProperty('long');
        expect(iosTapAction.inputs).toHaveProperty('duration');
        expect(iosTapAction.inputs).toHaveProperty('offset_x');
        expect(iosTapAction.inputs).toHaveProperty('offset_y');
      });
    });

    describe('Handler - Target Parsing', () => {
      beforeEach(() => {
        mockDriver.execute.mockResolvedValue({
          success: true,
          data: { duration: 100 },
        });
      });

      it('should parse identifier target (#)', async () => {
        await iosTapAction.handler(
          { target: '#login_button', app: 'com.example.app' },
          mockContext
        );

        expect(mockIosTools.byId).toHaveBeenCalledWith('login_button');
      });

      it('should parse coordinate target (x,y)', async () => {
        await iosTapAction.handler(
          { target: '100,200', app: 'com.example.app' },
          mockContext
        );

        expect(mockIosTools.byCoordinates).toHaveBeenCalledWith(100, 200);
      });

      it('should parse quoted label target', async () => {
        await iosTapAction.handler(
          { target: '"Sign In"', app: 'com.example.app' },
          mockContext
        );

        expect(mockIosTools.byLabel).toHaveBeenCalledWith('Sign In');
      });

      it('should treat unquoted text as label', async () => {
        await iosTapAction.handler(
          { target: 'Login', app: 'com.example.app' },
          mockContext
        );

        expect(mockIosTools.byLabel).toHaveBeenCalledWith('Login');
      });
    });

    describe('Handler - Tap Types', () => {
      beforeEach(() => {
        mockDriver.execute.mockResolvedValue({
          success: true,
          data: { duration: 100 },
        });
      });

      it('should perform single tap by default', async () => {
        await iosTapAction.handler(
          { target: '#button', app: 'com.example.app' },
          mockContext
        );

        expect(mockIosTools.nativeTap).toHaveBeenCalled();
      });

      it('should perform double tap when double: true', async () => {
        await iosTapAction.handler(
          { target: '#button', app: 'com.example.app', double: true },
          mockContext
        );

        expect(mockIosTools.nativeDoubleTap).toHaveBeenCalled();
      });

      it('should perform long press when long: true', async () => {
        await iosTapAction.handler(
          { target: '#button', app: 'com.example.app', long: true, duration: 2.0 },
          mockContext
        );

        expect(mockIosTools.nativeLongPress).toHaveBeenCalledWith(
          expect.anything(),
          2.0
        );
      });
    });

    describe('Handler - Failure Cases', () => {
      it('should fail when target is empty', async () => {
        const result = await iosTapAction.handler(
          { target: '', app: 'com.example.app' },
          mockContext
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('target');
      });

      it('should fail when app is empty', async () => {
        const result = await iosTapAction.handler(
          { target: '#button', app: '' },
          mockContext
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('app');
      });

      it('should fail when no simulator is booted', async () => {
        mockIosTools.getBootedSimulators.mockResolvedValue({
          success: true,
          data: [],
        });

        const result = await iosTapAction.handler(
          { target: '#button', app: 'com.example.app' },
          mockContext
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('booted');
      });
    });
  });

  // ===========================================================================
  // ios.type Action Tests
  // ===========================================================================
  describe('ios.type Action', () => {
    const mockDriver = {
      execute: vi.fn(),
    };

    beforeEach(() => {
      mockIosTools.createNativeDriver.mockReturnValue(mockDriver as any);
      mockDriver.execute.mockResolvedValue({
        success: true,
        data: { duration: 100 },
      });
    });

    describe('Action Definition', () => {
      it('should have correct name', () => {
        expect(iosTypeAction.name).toBe('ios.type');
      });

      it('should require text and app inputs', () => {
        expect(iosTypeAction.inputs.text.required).toBe(true);
        expect(iosTypeAction.inputs.app.required).toBe(true);
      });

      it('should have optional into and clear inputs', () => {
        expect(iosTypeAction.inputs.into.required).toBeFalsy();
        expect(iosTypeAction.inputs.clear.required).toBeFalsy();
      });
    });

    describe('Handler - Success Cases', () => {
      it('should type text into focused element', async () => {
        const result = await iosTypeAction.handler(
          { text: 'hello world', app: 'com.example.app' },
          mockContext
        );

        expect(result.success).toBe(true);
        expect(mockIosTools.nativeTypeText).toHaveBeenCalledWith(
          'hello world',
          expect.objectContaining({ clearFirst: false })
        );
      });

      it('should type into specific element', async () => {
        await iosTypeAction.handler(
          { text: 'email@test.com', into: '#email_field', app: 'com.example.app' },
          mockContext
        );

        expect(mockIosTools.byId).toHaveBeenCalledWith('email_field');
        expect(mockIosTools.nativeTypeText).toHaveBeenCalledWith(
          'email@test.com',
          expect.objectContaining({ target: expect.anything() })
        );
      });

      it('should clear text first when clear: true', async () => {
        await iosTypeAction.handler(
          { text: 'new text', app: 'com.example.app', clear: true },
          mockContext
        );

        expect(mockIosTools.nativeTypeText).toHaveBeenCalledWith(
          'new text',
          expect.objectContaining({ clearFirst: true })
        );
      });
    });

    describe('Handler - Failure Cases', () => {
      it('should fail when app is empty', async () => {
        const result = await iosTypeAction.handler(
          { text: 'hello', app: '' },
          mockContext
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('app');
      });

      it('should allow empty text (for clearing)', async () => {
        const result = await iosTypeAction.handler(
          { text: '', app: 'com.example.app' },
          mockContext
        );

        // Empty string is valid - might be used with clear: true
        expect(mockDriver.execute).toHaveBeenCalled();
      });
    });
  });

  // ===========================================================================
  // ios.scroll Action Tests
  // ===========================================================================
  describe('ios.scroll Action', () => {
    const mockDriver = {
      execute: vi.fn(),
    };

    beforeEach(() => {
      mockIosTools.createNativeDriver.mockReturnValue(mockDriver as any);
      mockDriver.execute.mockResolvedValue({
        success: true,
        data: { duration: 100 },
      });
    });

    describe('Action Definition', () => {
      it('should have correct name', () => {
        expect(iosScrollAction.name).toBe('ios.scroll');
      });

      it('should require app input', () => {
        expect(iosScrollAction.inputs.app.required).toBe(true);
      });

      it('should have optional direction and to inputs', () => {
        expect(iosScrollAction.inputs.direction.required).toBeFalsy();
        expect(iosScrollAction.inputs.to.required).toBeFalsy();
      });
    });

    describe('Handler - Direction Scrolling', () => {
      it('should scroll in specified direction', async () => {
        const result = await iosScrollAction.handler(
          { direction: 'down', app: 'com.example.app' },
          mockContext
        );

        expect(result.success).toBe(true);
        expect(mockIosTools.nativeScroll).toHaveBeenCalledWith(
          'down',
          expect.anything()
        );
      });

      it('should scroll with custom distance', async () => {
        await iosScrollAction.handler(
          { direction: 'up', app: 'com.example.app', distance: 0.8 },
          mockContext
        );

        expect(mockIosTools.nativeScroll).toHaveBeenCalledWith(
          'up',
          expect.objectContaining({ distance: 0.8 })
        );
      });

      it('should scroll within container', async () => {
        await iosScrollAction.handler(
          { direction: 'down', in: '#scroll_view', app: 'com.example.app' },
          mockContext
        );

        expect(mockIosTools.byId).toHaveBeenCalledWith('scroll_view');
      });
    });

    describe('Handler - Scroll To Element', () => {
      it('should scroll to target element', async () => {
        const result = await iosScrollAction.handler(
          { to: '#footer', app: 'com.example.app' },
          mockContext
        );

        expect(result.success).toBe(true);
        expect(mockIosTools.nativeScrollTo).toHaveBeenCalled();
      });

      it('should respect max attempts', async () => {
        await iosScrollAction.handler(
          { to: '#footer', app: 'com.example.app', attempts: 20 },
          mockContext
        );

        expect(mockIosTools.nativeScrollTo).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ maxAttempts: 20 })
        );
      });
    });

    describe('Handler - Failure Cases', () => {
      it('should fail when neither direction nor to is specified', async () => {
        const result = await iosScrollAction.handler(
          { app: 'com.example.app' },
          mockContext
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('direction');
      });

      it('should fail with invalid direction', async () => {
        const result = await iosScrollAction.handler(
          { direction: 'diagonal' as any, app: 'com.example.app' },
          mockContext
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('Direction');
      });
    });
  });

  // ===========================================================================
  // ios.swipe Action Tests
  // ===========================================================================
  describe('ios.swipe Action', () => {
    const mockDriver = {
      execute: vi.fn(),
    };

    beforeEach(() => {
      mockIosTools.createNativeDriver.mockReturnValue(mockDriver as any);
      mockDriver.execute.mockResolvedValue({
        success: true,
        data: { duration: 100 },
      });
    });

    describe('Action Definition', () => {
      it('should have correct name', () => {
        expect(iosSwipeAction.name).toBe('ios.swipe');
      });

      it('should require direction and app inputs', () => {
        expect(iosSwipeAction.inputs.direction.required).toBe(true);
        expect(iosSwipeAction.inputs.app.required).toBe(true);
      });

      it('should have optional velocity and from inputs', () => {
        expect(iosSwipeAction.inputs.velocity.required).toBeFalsy();
        expect(iosSwipeAction.inputs.from.required).toBeFalsy();
      });
    });

    describe('Handler - Success Cases', () => {
      it('should swipe in specified direction', async () => {
        const result = await iosSwipeAction.handler(
          { direction: 'left', app: 'com.example.app' },
          mockContext
        );

        expect(result.success).toBe(true);
        expect(mockIosTools.nativeSwipe).toHaveBeenCalledWith(
          'left',
          expect.anything()
        );
      });

      it('should swipe with velocity', async () => {
        await iosSwipeAction.handler(
          { direction: 'up', app: 'com.example.app', velocity: 'fast' },
          mockContext
        );

        expect(mockIosTools.nativeSwipe).toHaveBeenCalledWith(
          'up',
          expect.objectContaining({ velocity: 'fast' })
        );
      });

      it('should swipe from specific element', async () => {
        await iosSwipeAction.handler(
          { direction: 'right', from: '#card', app: 'com.example.app' },
          mockContext
        );

        expect(mockIosTools.byId).toHaveBeenCalledWith('card');
      });
    });

    describe('Handler - Failure Cases', () => {
      it('should fail with invalid direction', async () => {
        const result = await iosSwipeAction.handler(
          { direction: 'forward' as any, app: 'com.example.app' },
          mockContext
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('Direction');
      });

      it('should fail with invalid velocity', async () => {
        const result = await iosSwipeAction.handler(
          { direction: 'left', app: 'com.example.app', velocity: 'supersonic' as any },
          mockContext
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('Velocity');
      });
    });
  });
});
