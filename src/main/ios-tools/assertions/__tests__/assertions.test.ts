/**
 * Tests for iOS Assertion Types
 *
 * These tests verify the core assertion functions for iOS UI testing.
 * All external dependencies (simulator, screenshot, inspect, etc.) are mocked
 * to allow unit testing without requiring a real iOS simulator.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// Mock External Dependencies
// =============================================================================

// Mock simulator module
vi.mock('../../simulator', () => ({
  getBootedSimulators: vi.fn(),
  getSimulator: vi.fn(),
}));

// Mock capture module
vi.mock('../../capture', () => ({
  screenshot: vi.fn(),
}));

// Mock inspect-simple module
vi.mock('../../inspect-simple', () => ({
  inspect: vi.fn(),
}));

// Mock ui-analyzer module
vi.mock('../../ui-analyzer', () => ({
  findByIdentifier: vi.fn(),
  findByLabel: vi.fn(),
  findByText: vi.fn(),
  findElement: vi.fn(),
}));

// Mock artifacts module
vi.mock('../../artifacts', () => ({
  getSnapshotDirectory: vi.fn(),
}));

// Mock logger
vi.mock('../../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock logs module (for log assertions)
vi.mock('../../logs', () => ({
  getSystemLog: vi.fn(),
  getCrashLogs: vi.fn(),
}));

// Import mocked modules
import { getBootedSimulators, getSimulator } from '../../simulator';
import { screenshot } from '../../capture';
import { inspect } from '../../inspect-simple';
import { findByIdentifier, findByLabel, findByText, findElement } from '../../ui-analyzer';
import { getSnapshotDirectory } from '../../artifacts';
import { getSystemLog, getCrashLogs } from '../../logs';

// Import types
import type { UIElement } from '../../inspect-simple';

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Create a mock UIElement for testing
 */
function createMockElement(overrides: Partial<UIElement> = {}): UIElement {
  return {
    type: 'Button',
    identifier: 'test_button',
    label: 'Test Button',
    value: undefined,
    frame: { x: 100, y: 200, width: 80, height: 44 },
    enabled: true,
    visible: true,
    selected: false,
    traits: ['Button'],
    children: [],
    ...overrides,
  };
}

/**
 * Create mock simulator info
 */
function createMockSimulator(state = 'Booted') {
  return {
    udid: 'MOCK-UDID-12345',
    name: 'iPhone 15 Pro',
    state,
    iosVersion: '17.0',
    runtime: 'com.apple.CoreSimulator.SimRuntime.iOS-17-0',
    deviceType: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15-Pro',
  };
}

/**
 * Create a mock inspect result with a UI tree
 */
function createMockInspectResult(elements: UIElement[] = []) {
  const tree = createMockElement({
    type: 'Application',
    identifier: undefined,
    children: elements,
  });

  return {
    success: true,
    data: {
      id: 'mock-inspect-id',
      timestamp: new Date(),
      simulator: {
        udid: 'MOCK-UDID-12345',
        name: 'iPhone 15 Pro',
        iosVersion: '17.0',
      },
      tree,
      elements: [tree, ...elements],
      stats: {
        totalElements: 1 + elements.length,
        interactableElements: elements.filter(e => e.enabled).length,
        textElements: elements.filter(e => e.type === 'StaticText').length,
        buttons: elements.filter(e => e.type === 'Button').length,
      },
    },
  };
}

/**
 * Setup common mocks for successful scenario
 */
function setupSuccessMocks() {
  vi.mocked(getBootedSimulators).mockResolvedValue({
    success: true,
    data: [createMockSimulator()],
  });

  vi.mocked(getSimulator).mockResolvedValue({
    success: true,
    data: createMockSimulator(),
  });

  vi.mocked(getSnapshotDirectory).mockResolvedValue('/tmp/test-artifacts');

  vi.mocked(screenshot).mockResolvedValue({
    success: true,
    data: { path: '/tmp/test-artifacts/screenshot.png' },
  });
}

// =============================================================================
// Visibility Assertions Tests
// =============================================================================

describe('Visibility Assertions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSuccessMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('assertVisible', () => {
    it('should pass when element is found and visible', async () => {
      const { assertVisible } = await import('../visible');

      const visibleButton = createMockElement({
        identifier: 'login_button',
        visible: true,
        enabled: true,
      });

      vi.mocked(inspect).mockResolvedValue(createMockInspectResult([visibleButton]));
      vi.mocked(findByIdentifier).mockReturnValue(visibleButton);

      const result = await assertVisible({
        sessionId: 'test-session',
        target: { identifier: 'login_button' },
        polling: { timeout: 1000, pollInterval: 100 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('passed');
      expect(result.data?.passed).toBe(true);
    });

    it('should fail when element is not found', async () => {
      const { assertVisible } = await import('../visible');

      vi.mocked(inspect).mockResolvedValue(createMockInspectResult([]));
      vi.mocked(findByIdentifier).mockReturnValue(undefined);

      const result = await assertVisible({
        sessionId: 'test-session',
        target: { identifier: 'nonexistent_button' },
        polling: { timeout: 500, pollInterval: 100 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('timeout');
      expect(result.data?.passed).toBe(false);
    });

    it('should fail when element is found but not visible', async () => {
      const { assertVisible } = await import('../visible');

      const hiddenButton = createMockElement({
        identifier: 'hidden_button',
        visible: false,
      });

      vi.mocked(inspect).mockResolvedValue(createMockInspectResult([hiddenButton]));
      vi.mocked(findByIdentifier).mockReturnValue(hiddenButton);

      const result = await assertVisible({
        sessionId: 'test-session',
        target: { identifier: 'hidden_button' },
        polling: { timeout: 500, pollInterval: 100 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(false);
    });

    it('should handle requireEnabled option', async () => {
      const { assertVisible } = await import('../visible');

      const disabledButton = createMockElement({
        identifier: 'disabled_button',
        visible: true,
        enabled: false,
      });

      vi.mocked(inspect).mockResolvedValue(createMockInspectResult([disabledButton]));
      vi.mocked(findByIdentifier).mockReturnValue(disabledButton);

      const result = await assertVisible({
        sessionId: 'test-session',
        target: { identifier: 'disabled_button' },
        requireEnabled: true,
        polling: { timeout: 500, pollInterval: 100 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(false);
      // When a condition is not met within timeout, we get a timeout status
      // The data contains the enabled state info
      expect(result.data?.data?.wasEnabled).toBe(false);
    });

    it('should return error when no simulator is booted', async () => {
      const { assertVisible } = await import('../visible');

      vi.mocked(getBootedSimulators).mockResolvedValue({
        success: true,
        data: [],
      });

      const result = await assertVisible({
        sessionId: 'test-session',
        target: { identifier: 'any_button' },
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('SIMULATOR_NOT_BOOTED');
    });
  });

  describe('assertNotVisible', () => {
    it('should pass when element is not found', async () => {
      const { assertNotVisible } = await import('../visible');

      vi.mocked(inspect).mockResolvedValue(createMockInspectResult([]));
      vi.mocked(findByIdentifier).mockReturnValue(undefined);

      const result = await assertNotVisible({
        sessionId: 'test-session',
        target: { identifier: 'gone_element' },
        polling: { timeout: 500, pollInterval: 100 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('passed');
      expect(result.data?.passed).toBe(true);
    });

    it('should pass when element is found but not visible', async () => {
      const { assertNotVisible } = await import('../visible');

      const hiddenElement = createMockElement({
        identifier: 'hidden_element',
        visible: false,
      });

      vi.mocked(inspect).mockResolvedValue(createMockInspectResult([hiddenElement]));
      vi.mocked(findByIdentifier).mockReturnValue(hiddenElement);

      const result = await assertNotVisible({
        sessionId: 'test-session',
        target: { identifier: 'hidden_element' },
        polling: { timeout: 500, pollInterval: 100 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
    });

    it('should fail when element is still visible', async () => {
      const { assertNotVisible } = await import('../visible');

      const visibleElement = createMockElement({
        identifier: 'still_visible',
        visible: true,
      });

      vi.mocked(inspect).mockResolvedValue(createMockInspectResult([visibleElement]));
      vi.mocked(findByIdentifier).mockReturnValue(visibleElement);

      const result = await assertNotVisible({
        sessionId: 'test-session',
        target: { identifier: 'still_visible' },
        polling: { timeout: 500, pollInterval: 100 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(false);
    });
  });

  describe('convenience functions', () => {
    it('assertVisibleById should find element by identifier', async () => {
      const { assertVisibleById } = await import('../visible');

      const button = createMockElement({ identifier: 'my_button', visible: true });

      vi.mocked(inspect).mockResolvedValue(createMockInspectResult([button]));
      vi.mocked(findByIdentifier).mockReturnValue(button);

      const result = await assertVisibleById('my_button', {
        sessionId: 'test-session',
        polling: { timeout: 500, pollInterval: 100 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
      expect(vi.mocked(findByIdentifier)).toHaveBeenCalled();
    });

    it('assertVisibleByLabel should find element by label', async () => {
      const { assertVisibleByLabel } = await import('../visible');

      const button = createMockElement({ label: 'Submit', visible: true });

      vi.mocked(inspect).mockResolvedValue(createMockInspectResult([button]));
      vi.mocked(findByLabel).mockReturnValue(button);

      const result = await assertVisibleByLabel('Submit', {
        sessionId: 'test-session',
        polling: { timeout: 500, pollInterval: 100 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
    });

    it('assertVisibleByText should find element by text', async () => {
      const { assertVisibleByText } = await import('../visible');

      const textElement = createMockElement({
        type: 'StaticText',
        label: 'Welcome message',
        visible: true,
      });

      vi.mocked(inspect).mockResolvedValue(createMockInspectResult([textElement]));
      vi.mocked(findByText).mockReturnValue({ elements: [textElement], count: 1 });

      const result = await assertVisibleByText('Welcome message', {
        sessionId: 'test-session',
        polling: { timeout: 500, pollInterval: 100 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
    });
  });
});

// =============================================================================
// Text Assertions Tests
// =============================================================================

describe('Text Assertions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSuccessMocks();
  });

  describe('assertText', () => {
    it('should pass with exact match on label', async () => {
      const { assertText } = await import('../text');

      const element = createMockElement({
        identifier: 'greeting_label',
        label: 'Hello World',
        visible: true,
      });

      vi.mocked(inspect).mockResolvedValue(createMockInspectResult([element]));
      vi.mocked(findByIdentifier).mockReturnValue(element);

      const result = await assertText({
        sessionId: 'test-session',
        target: { identifier: 'greeting_label' },
        expected: 'Hello World',
        matchMode: 'exact',
        polling: { timeout: 500, pollInterval: 100 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
    });

    it('should pass with exact match on value', async () => {
      const { assertText } = await import('../text');

      const textField = createMockElement({
        type: 'TextField',
        identifier: 'email_field',
        value: 'test@example.com',
        visible: true,
      });

      vi.mocked(inspect).mockResolvedValue(createMockInspectResult([textField]));
      vi.mocked(findByIdentifier).mockReturnValue(textField);

      const result = await assertText({
        sessionId: 'test-session',
        target: { identifier: 'email_field' },
        expected: 'test@example.com',
        polling: { timeout: 500, pollInterval: 100 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
    });

    it('should pass with contains match mode', async () => {
      const { assertText } = await import('../text');

      const element = createMockElement({
        identifier: 'message_label',
        label: 'Operation completed successfully',
        visible: true,
      });

      vi.mocked(inspect).mockResolvedValue(createMockInspectResult([element]));
      vi.mocked(findByIdentifier).mockReturnValue(element);

      const result = await assertText({
        sessionId: 'test-session',
        target: { identifier: 'message_label' },
        expected: 'completed',
        matchMode: 'contains',
        polling: { timeout: 500, pollInterval: 100 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
    });

    it('should pass with regex match mode', async () => {
      const { assertText } = await import('../text');

      const element = createMockElement({
        identifier: 'status_label',
        label: 'Order #12345 confirmed',
        visible: true,
      });

      vi.mocked(inspect).mockResolvedValue(createMockInspectResult([element]));
      vi.mocked(findByIdentifier).mockReturnValue(element);

      const result = await assertText({
        sessionId: 'test-session',
        target: { identifier: 'status_label' },
        expected: 'Order #\\d+ confirmed',
        matchMode: 'regex',
        polling: { timeout: 500, pollInterval: 100 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
    });

    it('should pass with startsWith match mode', async () => {
      const { assertText } = await import('../text');

      const element = createMockElement({
        identifier: 'title_label',
        label: 'Welcome to our app',
        visible: true,
      });

      vi.mocked(inspect).mockResolvedValue(createMockInspectResult([element]));
      vi.mocked(findByIdentifier).mockReturnValue(element);

      const result = await assertText({
        sessionId: 'test-session',
        target: { identifier: 'title_label' },
        expected: 'Welcome',
        matchMode: 'startsWith',
        polling: { timeout: 500, pollInterval: 100 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
    });

    it('should pass with endsWith match mode', async () => {
      const { assertText } = await import('../text');

      const element = createMockElement({
        identifier: 'file_label',
        label: 'document.pdf',
        visible: true,
      });

      vi.mocked(inspect).mockResolvedValue(createMockInspectResult([element]));
      vi.mocked(findByIdentifier).mockReturnValue(element);

      const result = await assertText({
        sessionId: 'test-session',
        target: { identifier: 'file_label' },
        expected: '.pdf',
        matchMode: 'endsWith',
        polling: { timeout: 500, pollInterval: 100 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
    });

    it('should handle case-insensitive matching', async () => {
      const { assertText } = await import('../text');

      const element = createMockElement({
        identifier: 'status',
        label: 'SUCCESS',
        visible: true,
      });

      vi.mocked(inspect).mockResolvedValue(createMockInspectResult([element]));
      vi.mocked(findByIdentifier).mockReturnValue(element);

      const result = await assertText({
        sessionId: 'test-session',
        target: { identifier: 'status' },
        expected: 'success',
        caseSensitive: false,
        polling: { timeout: 500, pollInterval: 100 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
    });

    it('should fail when text does not match', async () => {
      const { assertText } = await import('../text');

      const element = createMockElement({
        identifier: 'label',
        label: 'Actual text',
        visible: true,
      });

      vi.mocked(inspect).mockResolvedValue(createMockInspectResult([element]));
      vi.mocked(findByIdentifier).mockReturnValue(element);

      const result = await assertText({
        sessionId: 'test-session',
        target: { identifier: 'label' },
        expected: 'Expected text',
        polling: { timeout: 500, pollInterval: 100 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(false);
    });
  });

  describe('convenience functions', () => {
    it('assertTextContains should use contains mode', async () => {
      const { assertTextContains } = await import('../text');

      const element = createMockElement({
        identifier: 'msg',
        label: 'Hello there friend',
        visible: true,
      });

      vi.mocked(inspect).mockResolvedValue(createMockInspectResult([element]));
      vi.mocked(findByIdentifier).mockReturnValue(element);

      const result = await assertTextContains(
        { identifier: 'msg' },
        'there',
        { sessionId: 'test-session', polling: { timeout: 500, pollInterval: 100 } }
      );

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
    });

    it('assertTextMatches should use regex mode', async () => {
      const { assertTextMatches } = await import('../text');

      const element = createMockElement({
        identifier: 'count',
        label: '42 items',
        visible: true,
      });

      vi.mocked(inspect).mockResolvedValue(createMockInspectResult([element]));
      vi.mocked(findByIdentifier).mockReturnValue(element);

      const result = await assertTextMatches(
        { identifier: 'count' },
        '\\d+ items',
        { sessionId: 'test-session', polling: { timeout: 500, pollInterval: 100 } }
      );

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
    });
  });
});

// =============================================================================
// Enabled/Disabled Assertions Tests
// =============================================================================

describe('Enabled/Disabled Assertions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSuccessMocks();
  });

  describe('assertEnabled', () => {
    it('should pass when element is enabled', async () => {
      const { assertEnabled } = await import('../enabled');

      const button = createMockElement({
        identifier: 'submit_button',
        enabled: true,
        visible: true,
      });

      vi.mocked(inspect).mockResolvedValue(createMockInspectResult([button]));
      vi.mocked(findByIdentifier).mockReturnValue(button);

      const result = await assertEnabled({
        sessionId: 'test-session',
        target: { identifier: 'submit_button' },
        polling: { timeout: 500, pollInterval: 100 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
    });

    it('should fail when element is disabled', async () => {
      const { assertEnabled } = await import('../enabled');

      const button = createMockElement({
        identifier: 'disabled_button',
        enabled: false,
        visible: true,
      });

      vi.mocked(inspect).mockResolvedValue(createMockInspectResult([button]));
      vi.mocked(findByIdentifier).mockReturnValue(button);

      const result = await assertEnabled({
        sessionId: 'test-session',
        target: { identifier: 'disabled_button' },
        polling: { timeout: 500, pollInterval: 100 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(false);
    });

    it('should fail when element is not visible with requireVisible=true', async () => {
      const { assertEnabled } = await import('../enabled');

      const button = createMockElement({
        identifier: 'hidden_button',
        enabled: true,
        visible: false,
      });

      vi.mocked(inspect).mockResolvedValue(createMockInspectResult([button]));
      vi.mocked(findByIdentifier).mockReturnValue(button);

      const result = await assertEnabled({
        sessionId: 'test-session',
        target: { identifier: 'hidden_button' },
        requireVisible: true,
        polling: { timeout: 500, pollInterval: 100 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(false);
      // When a condition is not met within timeout, we get timeout status
      // The data contains visibility state info
      expect(result.data?.data?.wasVisible).toBe(false);
    });
  });

  describe('assertDisabled', () => {
    it('should pass when element is disabled', async () => {
      const { assertDisabled } = await import('../enabled');

      const button = createMockElement({
        identifier: 'disabled_button',
        enabled: false,
        visible: true,
      });

      vi.mocked(inspect).mockResolvedValue(createMockInspectResult([button]));
      vi.mocked(findByIdentifier).mockReturnValue(button);

      const result = await assertDisabled({
        sessionId: 'test-session',
        target: { identifier: 'disabled_button' },
        polling: { timeout: 500, pollInterval: 100 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
    });

    it('should fail when element is enabled', async () => {
      const { assertDisabled } = await import('../enabled');

      const button = createMockElement({
        identifier: 'enabled_button',
        enabled: true,
        visible: true,
      });

      vi.mocked(inspect).mockResolvedValue(createMockInspectResult([button]));
      vi.mocked(findByIdentifier).mockReturnValue(button);

      const result = await assertDisabled({
        sessionId: 'test-session',
        target: { identifier: 'enabled_button' },
        polling: { timeout: 500, pollInterval: 100 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(false);
    });
  });

  describe('convenience functions', () => {
    it('assertEnabledById should work correctly', async () => {
      const { assertEnabledById } = await import('../enabled');

      const button = createMockElement({
        identifier: 'btn',
        enabled: true,
        visible: true,
      });

      vi.mocked(inspect).mockResolvedValue(createMockInspectResult([button]));
      vi.mocked(findByIdentifier).mockReturnValue(button);

      const result = await assertEnabledById('btn', {
        sessionId: 'test-session',
        polling: { timeout: 500, pollInterval: 100 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
    });

    it('assertDisabledByLabel should work correctly', async () => {
      const { assertDisabledByLabel } = await import('../enabled');

      const button = createMockElement({
        label: 'Submit',
        enabled: false,
        visible: true,
      });

      vi.mocked(inspect).mockResolvedValue(createMockInspectResult([button]));
      vi.mocked(findByLabel).mockReturnValue(button);

      const result = await assertDisabledByLabel('Submit', {
        sessionId: 'test-session',
        polling: { timeout: 500, pollInterval: 100 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
    });
  });
});

// =============================================================================
// Selected Assertions Tests
// =============================================================================

describe('Selected Assertions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSuccessMocks();
  });

  describe('assertSelected', () => {
    it('should pass when element is selected', async () => {
      const { assertSelected } = await import('../selected');

      const tab = createMockElement({
        type: 'Button',
        identifier: 'tab_1',
        selected: true,
        visible: true,
        enabled: true,
      });

      vi.mocked(inspect).mockResolvedValue(createMockInspectResult([tab]));
      vi.mocked(findByIdentifier).mockReturnValue(tab);

      const result = await assertSelected({
        sessionId: 'test-session',
        target: { identifier: 'tab_1' },
        polling: { timeout: 500, pollInterval: 100 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
    });

    it('should fail when element is not selected', async () => {
      const { assertSelected } = await import('../selected');

      const tab = createMockElement({
        type: 'Button',
        identifier: 'tab_2',
        selected: false,
        visible: true,
        enabled: true,
      });

      vi.mocked(inspect).mockResolvedValue(createMockInspectResult([tab]));
      vi.mocked(findByIdentifier).mockReturnValue(tab);

      const result = await assertSelected({
        sessionId: 'test-session',
        target: { identifier: 'tab_2' },
        polling: { timeout: 500, pollInterval: 100 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(false);
    });
  });

  describe('assertNotSelected', () => {
    it('should pass when element is not selected', async () => {
      const { assertNotSelected } = await import('../selected');

      const checkbox = createMockElement({
        type: 'Button',
        identifier: 'checkbox_1',
        selected: false,
        visible: true,
      });

      vi.mocked(inspect).mockResolvedValue(createMockInspectResult([checkbox]));
      vi.mocked(findByIdentifier).mockReturnValue(checkbox);

      const result = await assertNotSelected({
        sessionId: 'test-session',
        target: { identifier: 'checkbox_1' },
        polling: { timeout: 500, pollInterval: 100 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
    });

    it('should fail when element is selected', async () => {
      const { assertNotSelected } = await import('../selected');

      const checkbox = createMockElement({
        type: 'Button',
        identifier: 'checkbox_checked',
        selected: true,
        visible: true,
      });

      vi.mocked(inspect).mockResolvedValue(createMockInspectResult([checkbox]));
      vi.mocked(findByIdentifier).mockReturnValue(checkbox);

      const result = await assertNotSelected({
        sessionId: 'test-session',
        target: { identifier: 'checkbox_checked' },
        polling: { timeout: 500, pollInterval: 100 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(false);
    });
  });
});

// =============================================================================
// Value Assertions Tests
// =============================================================================

describe('Value Assertions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSuccessMocks();
  });

  describe('assertValue', () => {
    it('should pass with exact value match', async () => {
      const { assertValue } = await import('../value');

      const textField = createMockElement({
        type: 'TextField',
        identifier: 'username_field',
        value: 'john_doe',
        visible: true,
      });

      vi.mocked(inspect).mockResolvedValue(createMockInspectResult([textField]));
      vi.mocked(findByIdentifier).mockReturnValue(textField);

      const result = await assertValue({
        sessionId: 'test-session',
        target: { identifier: 'username_field' },
        expected: 'john_doe',
        polling: { timeout: 500, pollInterval: 100 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
    });

    it('should pass with contains match mode', async () => {
      const { assertValue } = await import('../value');

      const textField = createMockElement({
        type: 'TextField',
        identifier: 'search_field',
        value: 'search term here',
        visible: true,
      });

      vi.mocked(inspect).mockResolvedValue(createMockInspectResult([textField]));
      vi.mocked(findByIdentifier).mockReturnValue(textField);

      const result = await assertValue({
        sessionId: 'test-session',
        target: { identifier: 'search_field' },
        expected: 'term',
        matchMode: 'contains',
        polling: { timeout: 500, pollInterval: 100 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
    });

    it('should fail when value does not match', async () => {
      const { assertValue } = await import('../value');

      const textField = createMockElement({
        type: 'TextField',
        identifier: 'amount_field',
        value: '100',
        visible: true,
      });

      vi.mocked(inspect).mockResolvedValue(createMockInspectResult([textField]));
      vi.mocked(findByIdentifier).mockReturnValue(textField);

      const result = await assertValue({
        sessionId: 'test-session',
        target: { identifier: 'amount_field' },
        expected: '200',
        polling: { timeout: 500, pollInterval: 100 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(false);
    });
  });

  describe('assertValueEmpty', () => {
    it('should pass when value is empty', async () => {
      const { assertValueEmpty } = await import('../value');

      const textField = createMockElement({
        type: 'TextField',
        identifier: 'empty_field',
        value: '',
        visible: true,
      });

      vi.mocked(inspect).mockResolvedValue(createMockInspectResult([textField]));
      vi.mocked(findByIdentifier).mockReturnValue(textField);

      const result = await assertValueEmpty(
        { identifier: 'empty_field' },
        { sessionId: 'test-session', polling: { timeout: 500, pollInterval: 100 } }
      );

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
    });

    it('should fail when value is not empty', async () => {
      const { assertValueEmpty } = await import('../value');

      const textField = createMockElement({
        type: 'TextField',
        identifier: 'filled_field',
        value: 'some text',
        visible: true,
      });

      vi.mocked(inspect).mockResolvedValue(createMockInspectResult([textField]));
      vi.mocked(findByIdentifier).mockReturnValue(textField);

      const result = await assertValueEmpty(
        { identifier: 'filled_field' },
        { sessionId: 'test-session', polling: { timeout: 500, pollInterval: 100 } }
      );

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(false);
    });
  });

  describe('assertValueNotEmpty', () => {
    it('should pass when value is not empty', async () => {
      const { assertValueNotEmpty } = await import('../value');

      const textField = createMockElement({
        type: 'TextField',
        identifier: 'filled_field',
        value: 'content',
        visible: true,
      });

      vi.mocked(inspect).mockResolvedValue(createMockInspectResult([textField]));
      vi.mocked(findByIdentifier).mockReturnValue(textField);

      const result = await assertValueNotEmpty(
        { identifier: 'filled_field' },
        { sessionId: 'test-session', polling: { timeout: 500, pollInterval: 100 } }
      );

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
    });

    it('should fail when value is empty', async () => {
      const { assertValueNotEmpty } = await import('../value');

      const textField = createMockElement({
        type: 'TextField',
        identifier: 'empty_field',
        value: '',
        visible: true,
      });

      vi.mocked(inspect).mockResolvedValue(createMockInspectResult([textField]));
      vi.mocked(findByIdentifier).mockReturnValue(textField);

      const result = await assertValueNotEmpty(
        { identifier: 'empty_field' },
        { sessionId: 'test-session', polling: { timeout: 500, pollInterval: 100 } }
      );

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(false);
    });
  });
});

// =============================================================================
// Wait For Assertions Tests
// =============================================================================

describe('Wait For Assertions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSuccessMocks();
  });

  describe('waitFor', () => {
    it('should pass when element appears', async () => {
      const { waitFor } = await import('../wait-for');

      const element = createMockElement({
        identifier: 'appearing_element',
        visible: true,
      });

      vi.mocked(inspect).mockResolvedValue(createMockInspectResult([element]));
      vi.mocked(findByIdentifier).mockReturnValue(element);

      const result = await waitFor({
        sessionId: 'test-session',
        target: { identifier: 'appearing_element' },
        polling: { timeout: 500, pollInterval: 100 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
    });

    it('should timeout when element never appears', async () => {
      const { waitFor } = await import('../wait-for');

      vi.mocked(inspect).mockResolvedValue(createMockInspectResult([]));
      vi.mocked(findByIdentifier).mockReturnValue(undefined);

      const result = await waitFor({
        sessionId: 'test-session',
        target: { identifier: 'never_appears' },
        polling: { timeout: 500, pollInterval: 100 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(false);
      expect(result.data?.status).toBe('timeout');
    });
  });

  describe('waitForNot', () => {
    it('should pass when element disappears', async () => {
      const { waitForNot } = await import('../wait-for');

      vi.mocked(inspect).mockResolvedValue(createMockInspectResult([]));
      vi.mocked(findByIdentifier).mockReturnValue(undefined);

      const result = await waitForNot({
        sessionId: 'test-session',
        target: { identifier: 'disappearing_element' },
        polling: { timeout: 500, pollInterval: 100 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
    });

    it('should timeout when element remains visible', async () => {
      const { waitForNot } = await import('../wait-for');

      const element = createMockElement({
        identifier: 'persistent_element',
        visible: true,
      });

      vi.mocked(inspect).mockResolvedValue(createMockInspectResult([element]));
      vi.mocked(findByIdentifier).mockReturnValue(element);

      const result = await waitForNot({
        sessionId: 'test-session',
        target: { identifier: 'persistent_element' },
        polling: { timeout: 500, pollInterval: 100 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(false);
    });
  });
});

// =============================================================================
// Verification Infrastructure Tests
// =============================================================================

describe('Verification Infrastructure', () => {
  describe('pollUntil', () => {
    it('should poll until condition is met', async () => {
      const { pollUntil } = await import('../../verification');

      let callCount = 0;
      const check = async () => {
        callCount++;
        return { passed: callCount >= 3, data: { count: callCount } };
      };

      const result = await pollUntil(check, { timeout: 5000, pollInterval: 50 });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
      expect(callCount).toBeGreaterThanOrEqual(3);
    });

    it('should timeout when condition is never met', async () => {
      const { pollUntil } = await import('../../verification');

      const check = async () => ({ passed: false, error: 'Not ready' });

      const result = await pollUntil(check, { timeout: 200, pollInterval: 50 });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(false);
    });

    it('should handle exceptions in check function', async () => {
      const { pollUntil } = await import('../../verification');

      let callCount = 0;
      const check = async () => {
        callCount++;
        if (callCount < 3) {
          throw new Error('Transient error');
        }
        return { passed: true };
      };

      const result = await pollUntil(check, { timeout: 5000, pollInterval: 50 });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
    });
  });

  describe('generateVerificationId', () => {
    it('should generate unique IDs', async () => {
      const { generateVerificationId } = await import('../../verification');

      const id1 = generateVerificationId('test');
      const id2 = generateVerificationId('test');

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^test-/);
      expect(id2).toMatch(/^test-/);
    });
  });

  describe('result builders', () => {
    it('createPassedResult should create passed result', async () => {
      const { createPassedResult } = await import('../../verification');

      const result = createPassedResult({
        id: 'test-id',
        type: 'visible',
        target: 'button',
        startTime: new Date(),
        attempts: [],
      });

      expect(result.status).toBe('passed');
      expect(result.passed).toBe(true);
    });

    it('createFailedResult should create failed result', async () => {
      const { createFailedResult } = await import('../../verification');

      const result = createFailedResult({
        id: 'test-id',
        type: 'visible',
        target: 'button',
        startTime: new Date(),
        attempts: [],
        message: 'Element not found',
      });

      expect(result.status).toBe('failed');
      expect(result.passed).toBe(false);
      expect(result.message).toBe('Element not found');
    });

    it('createTimeoutResult should create timeout result', async () => {
      const { createTimeoutResult } = await import('../../verification');

      const result = createTimeoutResult({
        id: 'test-id',
        type: 'visible',
        target: 'button',
        startTime: new Date(),
        timeout: 5000,
        attempts: [],
      });

      expect(result.status).toBe('timeout');
      expect(result.passed).toBe(false);
      expect(result.message).toContain('5000');
    });
  });
});

// =============================================================================
// Error Handling Tests
// =============================================================================

describe('Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle simulator not found error', async () => {
    const { assertVisible } = await import('../visible');

    vi.mocked(getBootedSimulators).mockResolvedValue({
      success: false,
      error: 'Failed to list simulators',
    });

    const result = await assertVisible({
      sessionId: 'test-session',
      target: { identifier: 'button' },
    });

    expect(result.success).toBe(false);
  });

  it('should handle simulator not booted error', async () => {
    const { assertVisible } = await import('../visible');

    vi.mocked(getBootedSimulators).mockResolvedValue({
      success: true,
      data: [createMockSimulator('Shutdown')],
    });

    vi.mocked(getSimulator).mockResolvedValue({
      success: true,
      data: createMockSimulator('Shutdown'),
    });

    const result = await assertVisible({
      sessionId: 'test-session',
      target: { identifier: 'button' },
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('SIMULATOR_NOT_BOOTED');
  });

  it('should handle inspect failure', async () => {
    const { assertVisible } = await import('../visible');

    setupSuccessMocks();

    vi.mocked(inspect).mockResolvedValue({
      success: false,
      error: 'Failed to inspect UI',
    });

    const result = await assertVisible({
      sessionId: 'test-session',
      target: { identifier: 'button' },
      polling: { timeout: 500, pollInterval: 100 },
    });

    expect(result.success).toBe(true);
    expect(result.data?.passed).toBe(false);
  });
});

// =============================================================================
// Timeout Behavior Tests
// =============================================================================

describe('Timeout Behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSuccessMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('pollUntil timeout behavior', () => {
    it('should respect custom timeout values', async () => {
      const { pollUntil } = await import('../../verification');

      const check = vi.fn().mockResolvedValue({ passed: false, error: 'Not ready' });

      // Start polling with 300ms timeout
      const resultPromise = pollUntil(check, { timeout: 300, pollInterval: 50 });

      // Advance timer past timeout
      await vi.advanceTimersByTimeAsync(350);

      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(false);
      // Should have made multiple attempts within 300ms
      expect(check).toHaveBeenCalled();
    });

    it('should stop polling immediately when condition is met', async () => {
      const { pollUntil } = await import('../../verification');

      let callCount = 0;
      const check = vi.fn().mockImplementation(async () => {
        callCount++;
        return { passed: callCount >= 2, data: { count: callCount } };
      });

      // Start polling
      const resultPromise = pollUntil(check, { timeout: 5000, pollInterval: 100 });

      // Advance through first attempt (fails)
      await vi.advanceTimersByTimeAsync(10);
      // Wait for next poll
      await vi.advanceTimersByTimeAsync(100);
      // Second attempt should succeed
      await vi.advanceTimersByTimeAsync(10);

      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
      expect(result.data?.duration).toBeLessThan(5000);
    });

    it('should include duration in result that matches elapsed time', async () => {
      const { pollUntil } = await import('../../verification');

      const check = vi.fn().mockResolvedValue({ passed: false });

      const resultPromise = pollUntil(check, { timeout: 200, pollInterval: 50 });

      // Advance time past timeout
      await vi.advanceTimersByTimeAsync(250);

      const result = await resultPromise;

      expect(result.data?.duration).toBeGreaterThanOrEqual(200);
    });

    it('should respect pollInterval for check frequency', async () => {
      const { pollUntil } = await import('../../verification');

      const check = vi.fn().mockResolvedValue({ passed: false });

      // Use 100ms poll interval with 350ms timeout
      const resultPromise = pollUntil(check, { timeout: 350, pollInterval: 100 });

      // Advance timer past timeout
      await vi.advanceTimersByTimeAsync(400);

      await resultPromise;

      // With 350ms timeout and 100ms interval:
      // Calls at ~0ms, ~100ms, ~200ms, ~300ms = 4 attempts before timeout
      expect(check.mock.calls.length).toBeGreaterThanOrEqual(3);
      expect(check.mock.calls.length).toBeLessThanOrEqual(5);
    });
  });

  describe('assertion timeout integration', () => {
    it('should timeout when element never appears within timeout period', async () => {
      vi.useRealTimers(); // Use real timers for this integration test
      const { assertVisible } = await import('../visible');

      vi.mocked(inspect).mockResolvedValue(createMockInspectResult([]));
      vi.mocked(findByIdentifier).mockReturnValue(undefined);

      const result = await assertVisible({
        sessionId: 'test-session',
        target: { identifier: 'never_appears' },
        polling: { timeout: 200, pollInterval: 50 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('timeout');
      expect(result.data?.passed).toBe(false);
      expect(result.data?.duration).toBeGreaterThanOrEqual(200);
    });

    it('should record all attempts during timeout period', async () => {
      vi.useRealTimers();
      const { assertVisible } = await import('../visible');

      vi.mocked(inspect).mockResolvedValue(createMockInspectResult([]));
      vi.mocked(findByIdentifier).mockReturnValue(undefined);

      const result = await assertVisible({
        sessionId: 'test-session',
        target: { identifier: 'nonexistent' },
        polling: { timeout: 300, pollInterval: 50 },
      });

      // Should have multiple attempts recorded
      expect(result.data?.attempts.length).toBeGreaterThan(1);
      // Each attempt should have proper metadata
      result.data?.attempts.forEach((attempt) => {
        expect(attempt.timestamp).toBeInstanceOf(Date);
        expect(typeof attempt.duration).toBe('number');
        expect(typeof attempt.attempt).toBe('number');
      });
    });

    it('should not exceed timeout even with slow checks', async () => {
      vi.useRealTimers();
      const { pollUntil } = await import('../../verification');

      // Simulate a slow check that takes 100ms each time
      const check = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 80));
        return { passed: false };
      });

      const startTime = Date.now();
      const result = await pollUntil(check, { timeout: 300, pollInterval: 50 });
      const elapsed = Date.now() - startTime;

      expect(result.data?.passed).toBe(false);
      // Should timeout reasonably close to 300ms (with some margin for execution)
      expect(elapsed).toBeGreaterThanOrEqual(280);
      expect(elapsed).toBeLessThan(500);
    });
  });
});

// =============================================================================
// Retry Logic Tests
// =============================================================================

describe('Retry Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('withRetry', () => {
    it('should succeed on first attempt if operation succeeds', async () => {
      const { withRetry } = await import('../../verification');

      const operation = vi.fn().mockResolvedValue({
        success: true,
        data: { value: 'test' },
      });

      const result = await withRetry(operation, { maxAttempts: 3 });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ value: 'test' });
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on transient failures', async () => {
      const { withRetry } = await import('../../verification');

      let callCount = 0;
      const operation = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount < 3) {
          return { success: false, error: 'Transient error' };
        }
        return { success: true, data: 'recovered' };
      });

      const result = await withRetry(operation, {
        maxAttempts: 5,
        initialDelay: 10,
      });

      expect(result.success).toBe(true);
      expect(result.data).toBe('recovered');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should fail after max attempts exhausted', async () => {
      const { withRetry } = await import('../../verification');

      const operation = vi.fn().mockResolvedValue({
        success: false,
        error: 'Persistent failure',
      });

      const result = await withRetry(operation, {
        maxAttempts: 3,
        initialDelay: 10,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed after 3 attempts');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should handle exceptions in operation', async () => {
      const { withRetry } = await import('../../verification');

      let callCount = 0;
      const operation = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount < 2) {
          throw new Error('Network error');
        }
        return { success: true, data: 'success' };
      });

      const result = await withRetry(operation, {
        maxAttempts: 3,
        initialDelay: 10,
      });

      expect(result.success).toBe(true);
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should report last error when all attempts fail', async () => {
      const { withRetry } = await import('../../verification');

      let callCount = 0;
      const operation = vi.fn().mockImplementation(async () => {
        callCount++;
        return { success: false, error: `Error ${callCount}` };
      });

      const result = await withRetry(operation, {
        maxAttempts: 3,
        initialDelay: 10,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Error 3'); // Last error
    });
  });

  describe('exponential backoff', () => {
    it('should apply exponential backoff between retries', async () => {
      const { calculateRetryDelay } = await import('../../verification');

      const policy = {
        initialDelay: 100,
        backoffMultiplier: 2,
        maxDelay: 10000,
        exponentialBackoff: true,
      };

      expect(calculateRetryDelay(1, policy)).toBe(100);
      expect(calculateRetryDelay(2, policy)).toBe(200);
      expect(calculateRetryDelay(3, policy)).toBe(400);
      expect(calculateRetryDelay(4, policy)).toBe(800);
    });

    it('should respect maxDelay cap', async () => {
      const { calculateRetryDelay } = await import('../../verification');

      const policy = {
        initialDelay: 1000,
        backoffMultiplier: 2,
        maxDelay: 3000,
        exponentialBackoff: true,
      };

      expect(calculateRetryDelay(1, policy)).toBe(1000);
      expect(calculateRetryDelay(2, policy)).toBe(2000);
      expect(calculateRetryDelay(3, policy)).toBe(3000); // Capped at maxDelay
      expect(calculateRetryDelay(4, policy)).toBe(3000); // Still capped
    });

    it('should use constant delay when exponentialBackoff is false', async () => {
      const { calculateRetryDelay } = await import('../../verification');

      const policy = {
        initialDelay: 500,
        backoffMultiplier: 2,
        maxDelay: 5000,
        exponentialBackoff: false,
      };

      expect(calculateRetryDelay(1, policy)).toBe(500);
      expect(calculateRetryDelay(2, policy)).toBe(500);
      expect(calculateRetryDelay(3, policy)).toBe(500);
    });
  });

  describe('verifyWithPollingAndRetry', () => {
    it('should combine polling and retry correctly', async () => {
      const { verifyWithPollingAndRetry } = await import('../../verification');

      let pollAttempts = 0;
      const check = vi.fn().mockImplementation(async () => {
        pollAttempts++;
        // Pass on second overall poll attempt
        return { passed: pollAttempts >= 2, data: { attempt: pollAttempts } };
      });

      const result = await verifyWithPollingAndRetry(
        check,
        { timeout: 1000, pollInterval: 50 },
        { maxAttempts: 2, initialDelay: 10 }
      );

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
    });

    it('should retry entire polling cycle on timeout', async () => {
      const { verifyWithPollingAndRetry } = await import('../../verification');

      let retryCycle = 0;
      const check = vi.fn().mockImplementation(async () => {
        // Fail first cycle, pass in second
        if (retryCycle === 0) {
          return { passed: false };
        }
        return { passed: true, data: { cycle: retryCycle } };
      });

      // First poll cycle will timeout, increment retry
      setTimeout(() => {
        retryCycle++;
      }, 150);

      const result = await verifyWithPollingAndRetry(
        check,
        { timeout: 100, pollInterval: 20 },
        { maxAttempts: 2, initialDelay: 10 }
      );

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
    });
  });

  describe('default policy values', () => {
    it('should use default retry policy when none specified', async () => {
      const { mergeRetryPolicy } = await import('../../verification');

      const merged = mergeRetryPolicy();

      expect(merged.maxAttempts).toBe(3);
      expect(merged.initialDelay).toBe(500);
      expect(merged.maxDelay).toBe(5000);
      expect(merged.backoffMultiplier).toBe(2);
      expect(merged.exponentialBackoff).toBe(true);
    });

    it('should merge custom values with defaults', async () => {
      const { mergeRetryPolicy } = await import('../../verification');

      const merged = mergeRetryPolicy({
        maxAttempts: 5,
        initialDelay: 100,
      });

      expect(merged.maxAttempts).toBe(5);
      expect(merged.initialDelay).toBe(100);
      expect(merged.maxDelay).toBe(5000); // Default
      expect(merged.backoffMultiplier).toBe(2); // Default
    });
  });
});

// =============================================================================
// Compound Assertions Tests
// =============================================================================

describe('Compound Assertions (assertScreen)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSuccessMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('assertScreen', () => {
    it('should pass when all required visible elements are present', async () => {
      const { assertScreen } = await import('../screen');

      const emailField = createMockElement({
        identifier: 'email_field',
        visible: true,
        enabled: true,
      });
      const passwordField = createMockElement({
        identifier: 'password_field',
        visible: true,
        enabled: true,
      });
      const loginButton = createMockElement({
        identifier: 'login_button',
        visible: true,
        enabled: true,
      });

      vi.mocked(inspect).mockResolvedValue(createMockInspectResult([emailField, passwordField, loginButton]));
      vi.mocked(findByIdentifier).mockImplementation((tree, id) => {
        if (id === 'email_field') return emailField;
        if (id === 'password_field') return passwordField;
        if (id === 'login_button') return loginButton;
        return undefined;
      });

      const result = await assertScreen({
        sessionId: 'test-session',
        screen: {
          name: 'login',
          elements: [{ identifier: 'email_field' }, { identifier: 'password_field' }, { identifier: 'login_button' }],
        },
        polling: { timeout: 500, pollInterval: 100 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
      expect(result.data?.data?.screenName).toBe('login');
      expect(result.data?.data?.passedChecks).toBe(3);
      expect(result.data?.data?.failedChecks).toBe(0);
    });

    it('should fail when any required visible element is missing', async () => {
      const { assertScreen } = await import('../screen');

      const emailField = createMockElement({
        identifier: 'email_field',
        visible: true,
      });
      // password_field is missing

      vi.mocked(inspect).mockResolvedValue(createMockInspectResult([emailField]));
      vi.mocked(findByIdentifier).mockImplementation((tree, id) => {
        if (id === 'email_field') return emailField;
        return undefined;
      });

      const result = await assertScreen({
        sessionId: 'test-session',
        screen: {
          name: 'login',
          elements: [{ identifier: 'email_field' }, { identifier: 'password_field' }],
        },
        polling: { timeout: 500, pollInterval: 100 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(false);
      expect(result.data?.data?.failedChecks).toBe(1);
    });

    it('should check notVisible elements are not present', async () => {
      const { assertScreen } = await import('../screen');

      const content = createMockElement({
        identifier: 'main_content',
        visible: true,
      });
      // Loading spinner is gone (not in tree)

      vi.mocked(inspect).mockResolvedValue(createMockInspectResult([content]));
      vi.mocked(findByIdentifier).mockImplementation((tree, id) => {
        if (id === 'main_content') return content;
        return undefined; // loading_spinner not found = good
      });

      const result = await assertScreen({
        sessionId: 'test-session',
        screen: {
          name: 'content_loaded',
          elements: [{ identifier: 'main_content' }],
          notVisible: [{ identifier: 'loading_spinner' }],
        },
        polling: { timeout: 500, pollInterval: 100 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
      expect(result.data?.data?.passedChecks).toBe(2); // visible + notVisible
    });

    it('should fail when notVisible element is actually visible', async () => {
      const { assertScreen } = await import('../screen');

      const content = createMockElement({
        identifier: 'main_content',
        visible: true,
      });
      const spinner = createMockElement({
        identifier: 'loading_spinner',
        visible: true, // Still visible = should fail
      });

      vi.mocked(inspect).mockResolvedValue(createMockInspectResult([content, spinner]));
      vi.mocked(findByIdentifier).mockImplementation((tree, id) => {
        if (id === 'main_content') return content;
        if (id === 'loading_spinner') return spinner;
        return undefined;
      });

      const result = await assertScreen({
        sessionId: 'test-session',
        screen: {
          name: 'content_loaded',
          elements: [{ identifier: 'main_content' }],
          notVisible: [{ identifier: 'loading_spinner' }],
        },
        polling: { timeout: 500, pollInterval: 100 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(false);
      expect(result.data?.data?.failedChecks).toBe(1);
    });

    it('should verify enabled elements are enabled', async () => {
      const { assertScreen } = await import('../screen');

      const submitButton = createMockElement({
        identifier: 'submit_button',
        visible: true,
        enabled: true,
      });

      vi.mocked(inspect).mockResolvedValue(createMockInspectResult([submitButton]));
      vi.mocked(findByIdentifier).mockReturnValue(submitButton);

      const result = await assertScreen({
        sessionId: 'test-session',
        screen: {
          name: 'form_valid',
          elements: [{ identifier: 'submit_button' }],
          enabled: [{ identifier: 'submit_button' }],
        },
        polling: { timeout: 500, pollInterval: 100 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
    });

    it('should verify disabled elements are disabled', async () => {
      const { assertScreen } = await import('../screen');

      const submitButton = createMockElement({
        identifier: 'submit_button',
        visible: true,
        enabled: false, // Disabled
      });

      vi.mocked(inspect).mockResolvedValue(createMockInspectResult([submitButton]));
      vi.mocked(findByIdentifier).mockReturnValue(submitButton);

      const result = await assertScreen({
        sessionId: 'test-session',
        screen: {
          name: 'form_invalid',
          elements: [{ identifier: 'submit_button' }],
          disabled: [{ identifier: 'submit_button' }],
        },
        polling: { timeout: 500, pollInterval: 100 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
    });

    it('should fail when enabled element is actually disabled', async () => {
      const { assertScreen } = await import('../screen');

      const submitButton = createMockElement({
        identifier: 'submit_button',
        visible: true,
        enabled: false, // Disabled when should be enabled
      });

      vi.mocked(inspect).mockResolvedValue(createMockInspectResult([submitButton]));
      vi.mocked(findByIdentifier).mockReturnValue(submitButton);

      const result = await assertScreen({
        sessionId: 'test-session',
        screen: {
          name: 'form_valid',
          elements: [{ identifier: 'submit_button' }],
          enabled: [{ identifier: 'submit_button' }],
        },
        polling: { timeout: 500, pollInterval: 100 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(false);
    });

    it('should handle requireAll=false mode', async () => {
      const { assertScreen } = await import('../screen');

      // Only one of two required elements is visible
      const title = createMockElement({
        identifier: 'screen_title',
        visible: true,
      });

      vi.mocked(inspect).mockResolvedValue(createMockInspectResult([title]));
      vi.mocked(findByIdentifier).mockImplementation((tree, id) => {
        if (id === 'screen_title') return title;
        return undefined;
      });

      const result = await assertScreen({
        sessionId: 'test-session',
        screen: {
          name: 'partial_screen',
          elements: [{ identifier: 'screen_title' }, { identifier: 'optional_element' }],
        },
        requireAll: false, // At least one visible is enough
        polling: { timeout: 500, pollInterval: 100 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
    });

    it('should include detailed element check results', async () => {
      const { assertScreen } = await import('../screen');

      const element1 = createMockElement({
        identifier: 'element1',
        visible: true,
      });
      const element2 = createMockElement({
        identifier: 'element2',
        visible: false, // Not visible
      });

      vi.mocked(inspect).mockResolvedValue(createMockInspectResult([element1, element2]));
      vi.mocked(findByIdentifier).mockImplementation((tree, id) => {
        if (id === 'element1') return element1;
        if (id === 'element2') return element2;
        return undefined;
      });

      const result = await assertScreen({
        sessionId: 'test-session',
        screen: {
          name: 'test_screen',
          elements: [{ identifier: 'element1' }, { identifier: 'element2' }],
        },
        polling: { timeout: 500, pollInterval: 100 },
      });

      expect(result.data?.data?.elementChecks).toHaveLength(2);
      expect(result.data?.data?.elementChecks[0].passed).toBe(true);
      expect(result.data?.data?.elementChecks[1].passed).toBe(false);
      expect(result.data?.data?.elementChecks[1].reason).toBe('Element exists but is not visible');
    });
  });

  describe('createScreenDefinition helper', () => {
    it('should create screen definition from string identifiers', async () => {
      const { createScreenDefinition } = await import('../screen');

      const screen = createScreenDefinition('login', ['#email', '#password', '#submit']);

      expect(screen.name).toBe('login');
      expect(screen.elements).toHaveLength(3);
      expect(screen.elements[0]).toEqual({ identifier: 'email' });
      expect(screen.elements[1]).toEqual({ identifier: 'password' });
      expect(screen.elements[2]).toEqual({ identifier: 'submit' });
    });

    it('should handle text strings without # prefix', async () => {
      const { createScreenDefinition } = await import('../screen');

      const screen = createScreenDefinition('welcome', ['Welcome back!', 'Please log in']);

      expect(screen.elements).toHaveLength(2);
      expect(screen.elements[0]).toEqual({ text: 'Welcome back!' });
      expect(screen.elements[1]).toEqual({ text: 'Please log in' });
    });

    it('should accept ElementSpec objects directly', async () => {
      const { createScreenDefinition } = await import('../screen');

      const screen = createScreenDefinition(
        'mixed',
        [
          '#button',
          { label: 'Submit' },
          { type: 'StaticText', text: 'Hello' },
        ],
        ['#loading']
      );

      expect(screen.elements).toHaveLength(3);
      expect(screen.elements[0]).toEqual({ identifier: 'button' });
      expect(screen.elements[1]).toEqual({ label: 'Submit' });
      expect(screen.elements[2]).toEqual({ type: 'StaticText', text: 'Hello' });
      expect(screen.notVisible).toHaveLength(1);
      expect(screen.notVisible![0]).toEqual({ identifier: 'loading' });
    });
  });

  describe('parseScreenDefinition helper', () => {
    it('should parse YAML-style config with # and @ prefixes', async () => {
      const { parseScreenDefinition } = await import('../screen');

      const screen = parseScreenDefinition({
        name: 'login',
        description: 'Login screen',
        elements: ['#email_field', '@Submit Button', 'Welcome Text'],
        not_visible: ['#loading_spinner'],
        enabled: ['#submit_button'],
        disabled: ['#forgot_password'],
      });

      expect(screen.name).toBe('login');
      expect(screen.description).toBe('Login screen');
      expect(screen.elements).toEqual([
        { identifier: 'email_field' },
        { label: 'Submit Button' },
        { text: 'Welcome Text' },
      ]);
      expect(screen.notVisible).toEqual([{ identifier: 'loading_spinner' }]);
      expect(screen.enabled).toEqual([{ identifier: 'submit_button' }]);
      expect(screen.disabled).toEqual([{ identifier: 'forgot_password' }]);
    });

    it('should handle empty optional arrays', async () => {
      const { parseScreenDefinition } = await import('../screen');

      const screen = parseScreenDefinition({
        name: 'simple',
        elements: ['#main'],
      });

      expect(screen.name).toBe('simple');
      expect(screen.elements).toHaveLength(1);
      expect(screen.notVisible).toEqual([]);
      expect(screen.enabled).toEqual([]);
      expect(screen.disabled).toEqual([]);
    });
  });

  describe('assertScreenByName', () => {
    it('should look up screen from registry and assert', async () => {
      const { assertScreenByName } = await import('../screen');

      const loginButton = createMockElement({
        identifier: 'login_button',
        visible: true,
      });

      vi.mocked(inspect).mockResolvedValue(createMockInspectResult([loginButton]));
      vi.mocked(findByIdentifier).mockReturnValue(loginButton);

      const registry = {
        login: {
          name: 'login',
          elements: [{ identifier: 'login_button' }],
        },
        home: {
          name: 'home',
          elements: [{ identifier: 'home_title' }],
        },
      };

      const result = await assertScreenByName('login', registry, {
        sessionId: 'test-session',
        polling: { timeout: 500, pollInterval: 100 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
    });

    it('should fail with helpful error when screen not in registry', async () => {
      const { assertScreenByName } = await import('../screen');

      const registry = {
        login: { name: 'login', elements: [] },
        home: { name: 'home', elements: [] },
      };

      const result = await assertScreenByName('nonexistent', registry, {
        sessionId: 'test-session',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('nonexistent');
      expect(result.error).toContain('login');
      expect(result.error).toContain('home');
    });
  });

  describe('complex compound scenarios', () => {
    it('should verify complete login flow screen state', async () => {
      const { assertScreen } = await import('../screen');

      // Simulate a complete login screen state
      const emailField = createMockElement({
        type: 'TextField',
        identifier: 'email_field',
        visible: true,
        enabled: true,
      });
      const passwordField = createMockElement({
        type: 'SecureTextField',
        identifier: 'password_field',
        visible: true,
        enabled: true,
      });
      const loginButton = createMockElement({
        type: 'Button',
        identifier: 'login_button',
        visible: true,
        enabled: false, // Disabled until form is valid
      });
      const welcomeText = createMockElement({
        type: 'StaticText',
        label: 'Welcome back',
        visible: true,
      });

      vi.mocked(inspect).mockResolvedValue(
        createMockInspectResult([emailField, passwordField, loginButton, welcomeText])
      );
      vi.mocked(findByIdentifier).mockImplementation((tree, id) => {
        if (id === 'email_field') return emailField;
        if (id === 'password_field') return passwordField;
        if (id === 'login_button') return loginButton;
        if (id === 'loading_spinner') return undefined;
        return undefined;
      });
      vi.mocked(findByLabel).mockImplementation((tree, label) => {
        if (label === 'Welcome back') return welcomeText;
        return undefined;
      });

      const result = await assertScreen({
        sessionId: 'test-session',
        screen: {
          name: 'login_ready',
          description: 'Login screen with empty form',
          elements: [
            { identifier: 'email_field' },
            { identifier: 'password_field' },
            { identifier: 'login_button' },
            { label: 'Welcome back' },
          ],
          notVisible: [{ identifier: 'loading_spinner' }],
          enabled: [{ identifier: 'email_field' }, { identifier: 'password_field' }],
          disabled: [{ identifier: 'login_button' }],
        },
        polling: { timeout: 500, pollInterval: 100 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
      expect(result.data?.data?.totalChecks).toBe(8); // 4 visible + 1 notVisible + 2 enabled + 1 disabled
      expect(result.data?.data?.passedChecks).toBe(8);
    });
  });
});
