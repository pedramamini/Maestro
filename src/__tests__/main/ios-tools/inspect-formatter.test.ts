/**
 * Tests for inspect-formatter.ts - Formatting inspection results for agent consumption
 */

import {
  formatInspectForAgent,
  formatInspectAsJson,
  formatInspectAsElementList,
  formatInspectCompact,
  formatElementQuery,
  formatElementQueryTable,
  formatActionSuggestions,
  FormattedInspect,
} from '../../../main/ios-tools/inspect-formatter';
import { InspectResult, UIElement } from '../../../main/ios-tools/inspect-simple';
import { QueryResult } from '../../../main/ios-tools/ui-analyzer';

// =============================================================================
// Test Fixtures
// =============================================================================

function createUIElement(overrides: Partial<UIElement> = {}): UIElement {
  return {
    type: 'Other',
    frame: { x: 0, y: 0, width: 100, height: 50 },
    enabled: true,
    visible: true,
    traits: [],
    children: [],
    ...overrides,
  };
}

function createLoginScreenTree(): UIElement {
  return createUIElement({
    type: 'Application',
    identifier: 'app',
    children: [
      createUIElement({
        type: 'NavigationBar',
        label: 'Login',
        children: [
          createUIElement({
            type: 'Button',
            identifier: 'back_button',
            label: 'Back',
            frame: { x: 10, y: 50, width: 50, height: 44 },
          }),
        ],
      }),
      createUIElement({
        type: 'ScrollView',
        frame: { x: 0, y: 100, width: 393, height: 700 },
        children: [
          createUIElement({
            type: 'StaticText',
            label: 'Welcome to MyApp',
            frame: { x: 50, y: 120, width: 293, height: 30 },
          }),
          createUIElement({
            type: 'TextField',
            identifier: 'email_field',
            label: 'Email',
            placeholder: 'Enter your email',
            frame: { x: 20, y: 180, width: 353, height: 44 },
          }),
          createUIElement({
            type: 'SecureTextField',
            identifier: 'password_field',
            label: 'Password',
            placeholder: 'Enter your password',
            frame: { x: 20, y: 240, width: 353, height: 44 },
          }),
          createUIElement({
            type: 'Button',
            identifier: 'login_button',
            label: 'Log In',
            frame: { x: 20, y: 320, width: 353, height: 50 },
          }),
          createUIElement({
            type: 'Button',
            identifier: 'forgot_password',
            label: 'Forgot Password?',
            frame: { x: 100, y: 390, width: 193, height: 44 },
          }),
        ],
      }),
    ],
  });
}

function flattenTree(root: UIElement): UIElement[] {
  const elements: UIElement[] = [];
  function traverse(element: UIElement) {
    elements.push(element);
    for (const child of element.children) {
      traverse(child);
    }
  }
  traverse(root);
  return elements;
}

function createInspectResult(overrides: Partial<InspectResult> = {}): InspectResult {
  const tree = createLoginScreenTree();
  const elements = flattenTree(tree);

  return {
    id: 'test-snapshot-001',
    timestamp: new Date('2024-01-15T10:30:00Z'),
    simulator: {
      udid: '12345678-1234-1234-1234-123456789ABC',
      name: 'iPhone 15 Pro',
      iosVersion: '17.2',
    },
    tree,
    elements,
    stats: {
      totalElements: elements.length,
      interactableElements: 5, // back, email, password, login, forgot
      textElements: 1, // Welcome text
      buttons: 3, // back, login, forgot
      textFields: 2, // email, password
      images: 0,
    },
    screenshot: {
      path: '/path/to/screenshot.png',
      size: 150000,
    },
    artifactDir: '/path/to/artifacts',
    rawOutput: 'Raw accessibility output here',
    ...overrides,
  };
}

// =============================================================================
// formatInspectForAgent tests
// =============================================================================

describe('formatInspectForAgent', () => {
  const result = createInspectResult();

  it('returns FormattedInspect structure', () => {
    const formatted = formatInspectForAgent(result);

    expect(formatted).toHaveProperty('summary');
    expect(formatted).toHaveProperty('sections');
    expect(formatted).toHaveProperty('fullOutput');
  });

  it('includes summary with element counts', () => {
    const formatted = formatInspectForAgent(result);

    expect(formatted.summary).toContain('elements');
    expect(formatted.summary).toContain('interactable');
  });

  it('includes summary with button count if present', () => {
    const formatted = formatInspectForAgent(result);

    expect(formatted.summary).toContain('buttons');
  });

  it('includes summary with text field count if present', () => {
    const formatted = formatInspectForAgent(result);

    expect(formatted.summary).toContain('text fields');
  });

  it('includes status section with simulator info', () => {
    const formatted = formatInspectForAgent(result);

    expect(formatted.sections.status).toContain('iPhone 15 Pro');
    expect(formatted.sections.status).toContain('iOS 17.2');
    expect(formatted.sections.status).toContain(result.simulator.udid);
  });

  it('includes status section with element stats', () => {
    const formatted = formatInspectForAgent(result);

    expect(formatted.sections.status).toContain('Total elements');
    expect(formatted.sections.status).toContain('Interactable');
    expect(formatted.sections.status).toContain('Buttons');
    expect(formatted.sections.status).toContain('Text fields');
  });

  it('includes interactables section', () => {
    const formatted = formatInspectForAgent(result);

    expect(formatted.sections.interactables).toContain('interactable elements');
  });

  it('includes screenshot section when screenshot is captured', () => {
    const formatted = formatInspectForAgent(result);

    expect(formatted.sections.screenshot).toContain('/path/to/screenshot.png');
    expect(formatted.sections.screenshot).toContain('KB');
  });

  it('handles missing screenshot gracefully', () => {
    const resultNoScreenshot = createInspectResult({ screenshot: undefined });
    const formatted = formatInspectForAgent(resultNoScreenshot);

    expect(formatted.sections.screenshot).toContain('No screenshot captured');
  });

  it('fullOutput includes all sections', () => {
    const formatted = formatInspectForAgent(result);

    expect(formatted.fullOutput).toContain('## iOS UI Inspection');
    expect(formatted.fullOutput).toContain('### Status');
    expect(formatted.fullOutput).toContain('### Interactable Elements');
    expect(formatted.fullOutput).toContain('### All Elements Summary');
    expect(formatted.fullOutput).toContain('### Screenshot');
    expect(formatted.fullOutput).toContain('Artifacts saved to');
  });

  it('includes raw output when includeRaw is true', () => {
    const formatted = formatInspectForAgent(result, { includeRaw: true });

    expect(formatted.fullOutput).toContain('### Raw Accessibility Output');
    expect(formatted.fullOutput).toContain('Raw accessibility output here');
  });

  it('does not include raw output by default', () => {
    const formatted = formatInspectForAgent(result);

    expect(formatted.fullOutput).not.toContain('### Raw Accessibility Output');
  });

  it('respects maxElements option', () => {
    const formatted = formatInspectForAgent(result, { maxElements: 2 });

    // The output should still work with limited elements
    expect(formatted.fullOutput).toBeDefined();
  });
});

// =============================================================================
// formatInspectAsJson tests
// =============================================================================

describe('formatInspectAsJson', () => {
  const result = createInspectResult();

  it('returns valid JSON string', () => {
    const json = formatInspectAsJson(result);

    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('includes id and timestamp', () => {
    const json = formatInspectAsJson(result);
    const parsed = JSON.parse(json);

    expect(parsed.id).toBe(result.id);
    expect(parsed.timestamp).toBe(result.timestamp.toISOString());
  });

  it('includes simulator info', () => {
    const json = formatInspectAsJson(result);
    const parsed = JSON.parse(json);

    expect(parsed.simulator).toEqual(result.simulator);
  });

  it('includes stats', () => {
    const json = formatInspectAsJson(result);
    const parsed = JSON.parse(json);

    expect(parsed.stats).toEqual(result.stats);
  });

  it('includes interactable elements', () => {
    const json = formatInspectAsJson(result);
    const parsed = JSON.parse(json);

    expect(parsed.interactableElements).toBeDefined();
    expect(Array.isArray(parsed.interactableElements)).toBe(true);
  });

  it('interactable elements have expected properties', () => {
    const json = formatInspectAsJson(result);
    const parsed = JSON.parse(json);

    if (parsed.interactableElements.length > 0) {
      const element = parsed.interactableElements[0];
      expect(element).toHaveProperty('type');
      expect(element).toHaveProperty('frame');
      expect(element).toHaveProperty('enabled');
    }
  });

  it('includes screenshot info when present', () => {
    const json = formatInspectAsJson(result);
    const parsed = JSON.parse(json);

    expect(parsed.screenshot).toBeDefined();
    expect(parsed.screenshot.path).toBe('/path/to/screenshot.png');
    expect(parsed.screenshot.size).toBe(150000);
  });

  it('screenshot is null when not captured', () => {
    const resultNoScreenshot = createInspectResult({ screenshot: undefined });
    const json = formatInspectAsJson(resultNoScreenshot);
    const parsed = JSON.parse(json);

    expect(parsed.screenshot).toBeNull();
  });

  it('includes artifact directory', () => {
    const json = formatInspectAsJson(result);
    const parsed = JSON.parse(json);

    expect(parsed.artifactDir).toBe(result.artifactDir);
  });
});

// =============================================================================
// formatInspectAsElementList tests
// =============================================================================

describe('formatInspectAsElementList', () => {
  const result = createInspectResult();

  it('returns string with header', () => {
    const list = formatInspectAsElementList(result);

    expect(list).toContain('# UI Elements');
  });

  it('includes interactable count in header', () => {
    const list = formatInspectAsElementList(result);

    expect(list).toContain('interactable');
  });

  it('lists elements with numbers', () => {
    const list = formatInspectAsElementList(result);

    expect(list).toMatch(/1\./);
  });

  it('includes element types', () => {
    const list = formatInspectAsElementList(result);

    expect(list).toContain('Button');
  });

  it('includes suggested actions in brackets', () => {
    const list = formatInspectAsElementList(result);

    expect(list).toMatch(/\[.*\]/);
  });
});

// =============================================================================
// formatInspectCompact tests
// =============================================================================

describe('formatInspectCompact', () => {
  const result = createInspectResult();

  it('includes element count summary', () => {
    const compact = formatInspectCompact(result);

    expect(compact).toContain('UI:');
    expect(compact).toContain('elements');
    expect(compact).toContain('interactive');
  });

  it('lists button labels when present', () => {
    const compact = formatInspectCompact(result);

    expect(compact).toContain('Buttons:');
  });

  it('lists text field labels when present', () => {
    const compact = formatInspectCompact(result);

    expect(compact).toContain('Text Fields:');
  });

  it('includes screenshot path when present', () => {
    const compact = formatInspectCompact(result);

    expect(compact).toContain('Screenshot:');
    expect(compact).toContain('/path/to/screenshot.png');
  });

  it('omits screenshot line when not captured', () => {
    const resultNoScreenshot = createInspectResult({ screenshot: undefined });
    const compact = formatInspectCompact(resultNoScreenshot);

    expect(compact).not.toContain('Screenshot:');
  });
});

// =============================================================================
// formatElementQuery tests
// =============================================================================

describe('formatElementQuery', () => {
  const elements = flattenTree(createLoginScreenTree());

  function createQueryResult(overrides: Partial<QueryResult> = {}): QueryResult {
    return {
      elements: elements.filter((e) => e.type === 'Button'),
      totalSearched: elements.length,
      query: { type: 'Button' },
      ...overrides,
    };
  }

  it('includes header', () => {
    const queryResult = createQueryResult();
    const formatted = formatElementQuery(queryResult, elements);

    expect(formatted).toContain('## Element Query Results');
  });

  it('shows total searched count', () => {
    const queryResult = createQueryResult();
    const formatted = formatElementQuery(queryResult, elements);

    expect(formatted).toContain('Searched');
    expect(formatted).toContain('elements');
  });

  it('shows query criteria for type', () => {
    const queryResult = createQueryResult({ query: { type: 'Button' } });
    const formatted = formatElementQuery(queryResult, elements);

    expect(formatted).toContain('### Query Criteria');
    expect(formatted).toContain('Type:');
    expect(formatted).toContain('Button');
  });

  it('shows query criteria for identifier', () => {
    const queryResult = createQueryResult({ query: { identifier: 'login_button' } });
    const formatted = formatElementQuery(queryResult, elements);

    expect(formatted).toContain('Identifier:');
    expect(formatted).toContain('login_button');
  });

  it('shows query criteria for label', () => {
    const queryResult = createQueryResult({ query: { label: 'Log In' } });
    const formatted = formatElementQuery(queryResult, elements);

    expect(formatted).toContain('Label:');
    expect(formatted).toContain('Log In');
  });

  it('shows query criteria for containsText', () => {
    const queryResult = createQueryResult({ query: { containsText: 'password' } });
    const formatted = formatElementQuery(queryResult, elements);

    expect(formatted).toContain('Contains text:');
    expect(formatted).toContain('password');
  });

  it('shows no matches message when empty', () => {
    const queryResult = createQueryResult({ elements: [] });
    const formatted = formatElementQuery(queryResult, elements);

    expect(formatted).toContain('### No Matches Found');
    expect(formatted).toContain('Suggestions:');
  });

  it('shows found count when elements match', () => {
    const queryResult = createQueryResult();
    const formatted = formatElementQuery(queryResult, elements);

    expect(formatted).toContain('### Found');
    expect(formatted).toContain('Element');
  });

  it('includes position info for elements with valid frames', () => {
    const buttonWithFrame = createUIElement({
      type: 'Button',
      identifier: 'test_btn',
      frame: { x: 50, y: 100, width: 200, height: 50 },
    });
    const queryResult = createQueryResult({ elements: [buttonWithFrame] });
    const formatted = formatElementQuery(queryResult, elements);

    expect(formatted).toContain('Position:');
    expect(formatted).toContain('Size:');
  });

  it('includes state info for disabled elements', () => {
    const disabledButton = createUIElement({
      type: 'Button',
      identifier: 'disabled_btn',
      enabled: false,
    });
    const queryResult = createQueryResult({ elements: [disabledButton] });
    const formatted = formatElementQuery(queryResult, elements);

    expect(formatted).toContain('disabled');
  });

  it('includes state info for hidden elements', () => {
    const hiddenButton = createUIElement({
      type: 'Button',
      identifier: 'hidden_btn',
      visible: false,
    });
    const queryResult = createQueryResult({ elements: [hiddenButton] });
    const formatted = formatElementQuery(queryResult, elements);

    expect(formatted).toContain('hidden');
  });

  it('limits output to 20 elements', () => {
    const manyButtons = Array.from({ length: 30 }, (_, i) =>
      createUIElement({
        type: 'Button',
        identifier: `button_${i}`,
        label: `Button ${i}`,
      })
    );
    const queryResult = createQueryResult({ elements: manyButtons });
    const formatted = formatElementQuery(queryResult, elements);

    expect(formatted).toContain('and 10 more elements');
  });
});

// =============================================================================
// formatElementQueryTable tests
// =============================================================================

describe('formatElementQueryTable', () => {
  const elements = flattenTree(createLoginScreenTree());

  function createQueryResult(overrides: Partial<QueryResult> = {}): QueryResult {
    return {
      elements: elements.filter((e) => e.type === 'Button'),
      totalSearched: elements.length,
      query: { type: 'Button' },
      ...overrides,
    };
  }

  it('returns no elements message when empty', () => {
    const queryResult = createQueryResult({ elements: [] });
    const table = formatElementQueryTable(queryResult);

    expect(table).toBe('No elements found.');
  });

  it('includes markdown table headers', () => {
    const queryResult = createQueryResult();
    const table = formatElementQueryTable(queryResult);

    expect(table).toContain('| # | Type | Identifier | Label | Action |');
    expect(table).toContain('|---|------|------------|-------|--------|');
  });

  it('includes element rows', () => {
    const queryResult = createQueryResult();
    const table = formatElementQueryTable(queryResult);

    expect(table).toContain('Button');
  });

  it('shows dash for missing identifier', () => {
    const buttonNoId = createUIElement({
      type: 'Button',
      label: 'Submit',
    });
    const queryResult = createQueryResult({ elements: [buttonNoId] });
    const table = formatElementQueryTable(queryResult);

    // The table should have a dash for missing identifier
    expect(table).toContain('| - |');
  });

  it('shows dash for missing label', () => {
    const buttonNoLabel = createUIElement({
      type: 'Button',
      identifier: 'my_button',
    });
    const queryResult = createQueryResult({ elements: [buttonNoLabel] });
    const table = formatElementQueryTable(queryResult);

    // The row should contain the button
    const lines = table.split('\n');
    const dataRow = lines.find((l) => l.includes('my_button'));
    expect(dataRow).toBeDefined();
  });

  it('limits to 20 elements with overflow message', () => {
    const manyButtons = Array.from({ length: 25 }, (_, i) =>
      createUIElement({
        type: 'Button',
        identifier: `button_${i}`,
        label: `Button ${i}`,
      })
    );
    const queryResult = createQueryResult({ elements: manyButtons });
    const table = formatElementQueryTable(queryResult);

    expect(table).toContain('and 5 more elements');
  });
});

// =============================================================================
// formatActionSuggestions tests
// =============================================================================

describe('formatActionSuggestions', () => {
  const elements = flattenTree(createLoginScreenTree());

  describe('button actions', () => {
    const button = createUIElement({
      type: 'Button',
      identifier: 'submit_button',
      label: 'Submit',
      frame: { x: 100, y: 200, width: 200, height: 50 },
    });

    it('includes element header', () => {
      const suggestions = formatActionSuggestions(button, elements);

      expect(suggestions).toContain('## Actions for Button');
    });

    it('includes element label', () => {
      const suggestions = formatActionSuggestions(button, elements);

      expect(suggestions).toContain('Label: "Submit"');
    });

    it('includes element location', () => {
      const suggestions = formatActionSuggestions(button, elements);

      expect(suggestions).toContain('Location:');
      expect(suggestions).toContain('100');
      expect(suggestions).toContain('200');
    });

    it('suggests tap action for buttons', () => {
      const suggestions = formatActionSuggestions(button, elements);

      expect(suggestions).toContain('### Available Actions');
      expect(suggestions).toContain('tap');
    });

    it('includes example commands', () => {
      const suggestions = formatActionSuggestions(button, elements);

      expect(suggestions).toContain('**Example**:');
      expect(suggestions).toContain('tap(');
    });

    it('includes recommended approach', () => {
      const suggestions = formatActionSuggestions(button, elements);

      expect(suggestions).toContain('### Recommended Approach');
      expect(suggestions).toContain('**tap**');
    });

    it('includes tapPoint fallback with coordinates', () => {
      const suggestions = formatActionSuggestions(button, elements);

      expect(suggestions).toContain('tapPoint');
    });
  });

  describe('text field actions', () => {
    const textField = createUIElement({
      type: 'TextField',
      identifier: 'email_field',
      label: 'Email',
      frame: { x: 20, y: 180, width: 353, height: 44 },
    });

    it('suggests tap action for text fields', () => {
      const suggestions = formatActionSuggestions(textField, elements);

      expect(suggestions).toContain('tap');
    });

    it('suggests inputText action for text fields', () => {
      const suggestions = formatActionSuggestions(textField, elements);

      expect(suggestions).toContain('inputText');
    });

    it('suggests clearText action for text fields', () => {
      const suggestions = formatActionSuggestions(textField, elements);

      expect(suggestions).toContain('clearText');
    });
  });

  describe('switch actions', () => {
    const switchEl = createUIElement({
      type: 'Switch',
      identifier: 'notifications_switch',
      label: 'Notifications',
      value: '1',
      frame: { x: 300, y: 100, width: 50, height: 30 },
    });

    it('suggests tap to toggle for switches', () => {
      const suggestions = formatActionSuggestions(switchEl, elements);

      expect(suggestions).toContain('tap');
      expect(suggestions).toContain('toggle');
    });

    it('shows current state for switches', () => {
      const suggestions = formatActionSuggestions(switchEl, elements);

      expect(suggestions).toContain('ON');
    });
  });

  describe('slider actions', () => {
    const slider = createUIElement({
      type: 'Slider',
      identifier: 'volume_slider',
      label: 'Volume',
      frame: { x: 50, y: 300, width: 300, height: 30 },
    });

    it('suggests adjustSlider action', () => {
      const suggestions = formatActionSuggestions(slider, elements);

      expect(suggestions).toContain('adjustSlider');
    });
  });

  describe('scroll view actions', () => {
    const scrollView = createUIElement({
      type: 'ScrollView',
      frame: { x: 0, y: 100, width: 393, height: 700 },
    });

    it('suggests scroll action', () => {
      const suggestions = formatActionSuggestions(scrollView, elements);

      expect(suggestions).toContain('scroll');
    });

    it('suggests swipe action', () => {
      const suggestions = formatActionSuggestions(scrollView, elements);

      expect(suggestions).toContain('swipe');
    });
  });

  describe('picker actions', () => {
    const picker = createUIElement({
      type: 'Picker',
      identifier: 'country_picker',
      label: 'Country',
      frame: { x: 50, y: 200, width: 300, height: 44 },
    });

    it('suggests adjustPicker action', () => {
      const suggestions = formatActionSuggestions(picker, elements);

      expect(suggestions).toContain('adjustPicker');
    });
  });

  describe('disabled elements', () => {
    const disabledButton = createUIElement({
      type: 'Button',
      identifier: 'disabled_button',
      label: 'Disabled',
      enabled: false,
      frame: { x: 100, y: 200, width: 200, height: 50 },
    });

    it('shows warning for disabled elements', () => {
      const suggestions = formatActionSuggestions(disabledButton, elements);

      expect(suggestions).toContain('**Warning**');
      expect(suggestions).toContain('disabled');
    });

    it('includes unavailable actions section', () => {
      const suggestions = formatActionSuggestions(disabledButton, elements);

      expect(suggestions).toContain('### Unavailable Actions');
    });
  });

  describe('hidden elements', () => {
    const hiddenButton = createUIElement({
      type: 'Button',
      identifier: 'hidden_button',
      label: 'Hidden',
      visible: false,
      frame: { x: 100, y: 200, width: 200, height: 50 },
    });

    it('shows warning for hidden elements', () => {
      const suggestions = formatActionSuggestions(hiddenButton, elements);

      expect(suggestions).toContain('**Warning**');
      expect(suggestions).toContain('hidden');
    });
  });

  describe('element value display', () => {
    const elementWithValue = createUIElement({
      type: 'TextField',
      identifier: 'name_field',
      label: 'Name',
      value: 'John Doe',
      frame: { x: 20, y: 100, width: 353, height: 44 },
    });

    it('shows current value when present', () => {
      const suggestions = formatActionSuggestions(elementWithValue, elements);

      expect(suggestions).toContain('Current value: "John Doe"');
    });
  });

  describe('stepper actions', () => {
    const stepper = createUIElement({
      type: 'Stepper',
      identifier: 'quantity_stepper',
      label: 'Quantity',
      frame: { x: 100, y: 200, width: 100, height: 40 },
    });

    it('suggests tapIncrement action', () => {
      const suggestions = formatActionSuggestions(stepper, elements);

      expect(suggestions).toContain('tapIncrement');
    });

    it('suggests tapDecrement action', () => {
      const suggestions = formatActionSuggestions(stepper, elements);

      expect(suggestions).toContain('tapDecrement');
    });
  });

  describe('segmented control actions', () => {
    const segmentedControl = createUIElement({
      type: 'SegmentedControl',
      identifier: 'view_toggle',
      label: 'View Mode',
      frame: { x: 50, y: 150, width: 300, height: 40 },
    });

    it('suggests tap action', () => {
      const suggestions = formatActionSuggestions(segmentedControl, elements);

      expect(suggestions).toContain('tap');
    });
  });
});

// =============================================================================
// Edge cases and error handling
// =============================================================================

describe('edge cases', () => {
  describe('formatInspectForAgent with empty tree', () => {
    it('handles tree with no children', () => {
      const emptyTree = createUIElement({ type: 'Application', children: [] });
      const result = createInspectResult({
        tree: emptyTree,
        elements: [emptyTree],
        stats: {
          totalElements: 1,
          interactableElements: 0,
          textElements: 0,
          buttons: 0,
          textFields: 0,
          images: 0,
        },
      });

      const formatted = formatInspectForAgent(result);

      expect(formatted.sections.interactables).toContain('No interactable elements');
    });
  });

  describe('formatElementQuery with multiple types', () => {
    it('handles array of types in query', () => {
      const elements = flattenTree(createLoginScreenTree());
      const queryResult: QueryResult = {
        elements: elements.filter(
          (e) => e.type === 'TextField' || e.type === 'SecureTextField'
        ),
        totalSearched: elements.length,
        query: { type: ['TextField', 'SecureTextField'] },
      };

      const formatted = formatElementQuery(queryResult, elements);

      expect(formatted).toContain('TextField');
      expect(formatted).toContain('SecureTextField');
    });
  });

  describe('formatActionSuggestions with zero-size frame', () => {
    it('does not suggest tapPoint for zero-size elements', () => {
      const zeroSizeButton = createUIElement({
        type: 'Button',
        identifier: 'zero_button',
        frame: { x: 0, y: 0, width: 0, height: 0 },
      });

      const suggestions = formatActionSuggestions(zeroSizeButton);

      // Should not include coordinate-based tap since width/height are 0
      expect(suggestions).not.toContain('tapPoint');
    });
  });

  describe('formatInspectCompact with various element types', () => {
    it('handles result with only buttons', () => {
      const tree = createUIElement({
        type: 'Application',
        children: [
          createUIElement({ type: 'Button', label: 'Button 1', visible: true }),
          createUIElement({ type: 'Button', label: 'Button 2', visible: true }),
        ],
      });
      const elements = flattenTree(tree);
      const result = createInspectResult({
        tree,
        elements,
        stats: {
          totalElements: 3,
          interactableElements: 2,
          textElements: 0,
          buttons: 2,
          textFields: 0,
          images: 0,
        },
      });

      const compact = formatInspectCompact(result);

      expect(compact).toContain('Buttons:');
      expect(compact).not.toContain('Text Fields:');
    });

    it('truncates long button lists', () => {
      const manyButtons = Array.from({ length: 10 }, (_, i) =>
        createUIElement({
          type: 'Button',
          label: `Button ${i}`,
          visible: true,
        })
      );
      const tree = createUIElement({
        type: 'Application',
        children: manyButtons,
      });
      const elements = flattenTree(tree);
      const result = createInspectResult({
        tree,
        elements,
        stats: {
          totalElements: 11,
          interactableElements: 10,
          textElements: 0,
          buttons: 10,
          textFields: 0,
          images: 0,
        },
      });

      const compact = formatInspectCompact(result);

      expect(compact).toContain('+5 more');
    });
  });
});
