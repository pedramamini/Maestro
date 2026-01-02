/**
 * iOS Tools - Inspect Formatter
 *
 * Formats UI inspection results into agent-friendly output.
 * Produces structured, readable text that AI agents can understand.
 */

import { InspectResult, UIElement } from './inspect-simple';
import {
  InteractableElement,
  QueryResult,
  getInteractableElements,
  getBestIdentifier,
  sortByPosition,
  getSuggestedAction,
  isInteractable,
} from './ui-analyzer';

// =============================================================================
// Types
// =============================================================================

/**
 * Formatted inspection output for agents
 */
export interface FormattedInspect {
  /** Brief one-line summary */
  summary: string;
  /** Detailed sections */
  sections: {
    status: string;
    interactables: string;
    elements: string;
    screenshot: string;
  };
  /** Full formatted output */
  fullOutput: string;
}

/**
 * Options for formatting
 */
export interface FormatOptions {
  /** Maximum number of elements to show in detail */
  maxElements?: number;
  /** Include raw element tree (for debugging) */
  includeRaw?: boolean;
  /** Show element frames/positions */
  showFrames?: boolean;
  /** Include hidden elements */
  includeHidden?: boolean;
}

// =============================================================================
// Main Formatter
// =============================================================================

/**
 * Format an inspection result for agent consumption.
 * Creates a structured, readable output.
 *
 * @param result - Inspection result to format
 * @param options - Formatting options
 * @returns Formatted output
 */
export function formatInspectForAgent(
  result: InspectResult,
  options: FormatOptions = {}
): FormattedInspect {
  const { maxElements = 50, includeRaw = false, showFrames = false, includeHidden = false } = options;

  const sections = {
    status: formatStatus(result),
    interactables: formatInteractables(result, showFrames),
    elements: formatElements(result, maxElements, includeHidden),
    screenshot: formatScreenshot(result),
  };

  const summary = createSummary(result);

  let fullOutput = `
## iOS UI Inspection: ${result.id}

${summary}

---

### Status
${sections.status}

### Interactable Elements (${result.stats.interactableElements})
${sections.interactables}

### All Elements Summary
${sections.elements}

### Screenshot
${sections.screenshot}

---
Artifacts saved to: ${result.artifactDir}
`.trim();

  // Add raw tree if requested
  if (includeRaw && result.rawOutput) {
    fullOutput += `

### Raw Accessibility Output
\`\`\`
${result.rawOutput.slice(0, 5000)}
\`\`\`
`;
  }

  return {
    summary,
    sections,
    fullOutput,
  };
}

// =============================================================================
// Section Formatters
// =============================================================================

/**
 * Create a brief summary line
 */
function createSummary(result: InspectResult): string {
  const parts: string[] = [];

  // Element count
  parts.push(`${result.stats.totalElements} elements`);

  // Interactables
  parts.push(`${result.stats.interactableElements} interactable`);

  // Key element types
  if (result.stats.buttons > 0) {
    parts.push(`${result.stats.buttons} buttons`);
  }

  if (result.stats.textFields > 0) {
    parts.push(`${result.stats.textFields} text fields`);
  }

  return parts.join(' | ');
}

/**
 * Format status section
 */
function formatStatus(result: InspectResult): string {
  return `
- **Simulator**: ${result.simulator.name} (iOS ${result.simulator.iosVersion})
- **UDID**: \`${result.simulator.udid}\`
- **Inspected at**: ${result.timestamp.toISOString()}

**Element Stats**:
- Total elements: ${result.stats.totalElements}
- Interactable: ${result.stats.interactableElements}
- Buttons: ${result.stats.buttons}
- Text fields: ${result.stats.textFields}
- Text elements: ${result.stats.textElements}
- Images: ${result.stats.images}
`.trim();
}

/**
 * Format interactable elements section
 */
function formatInteractables(result: InspectResult, showFrames: boolean): string {
  const interactables = getInteractableElements(result.tree, true);

  if (interactables.length === 0) {
    return 'No interactable elements found.';
  }

  // Sort by position for easier reference (cast since InteractableElement extends UIElement)
  const sorted = sortByPosition(interactables as UIElement[]) as InteractableElement[];

  let output = `Found ${interactables.length} interactable elements:\n\n`;

  // Group by suggested action
  const grouped = groupByAction(sorted);

  for (const [action, elements] of Object.entries(grouped)) {
    if (elements.length === 0) continue;

    output += `#### ${capitalizeFirst(action)} Actions (${elements.length})\n`;

    for (const el of elements.slice(0, 15)) {
      const id = getBestIdentifier(el, result.elements);
      output += `- **${el.type}** ${id}`;

      if (el.label && el.label !== el.identifier) {
        output += ` - "${truncate(el.label, 40)}"`;
      }

      if (showFrames) {
        output += ` [${el.frame.x},${el.frame.y} ${el.frame.width}x${el.frame.height}]`;
      }

      output += '\n';
    }

    if (elements.length > 15) {
      output += `  ... and ${elements.length - 15} more\n`;
    }

    output += '\n';
  }

  return output.trim();
}

/**
 * Format elements section with tree overview
 */
function formatElements(
  result: InspectResult,
  maxElements: number,
  includeHidden: boolean
): string {
  let output = '';

  // Create element tree overview
  output += formatTreeOverview(result.tree, 0, 3);

  // List notable elements
  const elements = includeHidden
    ? result.elements
    : result.elements.filter((e) => e.visible);

  const notable = elements.filter(
    (e) => e.identifier || e.label || e.value
  ).slice(0, maxElements);

  if (notable.length > 0) {
    output += '\n\n#### Notable Elements\n';

    for (const el of notable) {
      const parts: string[] = [`- **${el.type}**`];

      if (el.identifier) {
        parts.push(`id=\`${el.identifier}\``);
      }

      if (el.label) {
        parts.push(`label="${truncate(el.label, 30)}"`);
      }

      if (el.value) {
        parts.push(`value="${truncate(el.value, 30)}"`);
      }

      output += parts.join(' ') + '\n';
    }
  }

  return output;
}

/**
 * Format screenshot section
 */
function formatScreenshot(result: InspectResult): string {
  if (!result.screenshot) {
    return 'No screenshot captured.';
  }

  const sizeKB = Math.round(result.screenshot.size / 1024);
  return `
- **Path**: \`${result.screenshot.path}\`
- **Size**: ${sizeKB} KB
`.trim();
}

// =============================================================================
// Tree Formatting
// =============================================================================

/**
 * Format a tree overview with indentation
 */
function formatTreeOverview(element: UIElement, depth: number, maxDepth: number): string {
  if (depth > maxDepth) {
    if (element.children.length > 0) {
      return `${indent(depth)}... (${countDescendants(element)} more elements)\n`;
    }
    return '';
  }

  let output = '';

  // Format current element
  const prefix = depth === 0 ? '' : indent(depth);
  let line = `${prefix}${element.type}`;

  if (element.identifier) {
    line += ` (id: ${element.identifier})`;
  } else if (element.label) {
    line += ` "${truncate(element.label, 25)}"`;
  }

  if (!element.visible) {
    line += ' [hidden]';
  }

  if (!element.enabled) {
    line += ' [disabled]';
  }

  output += line + '\n';

  // Format children
  const visibleChildren = element.children.filter((c) => c.visible || depth < 1);

  for (let i = 0; i < visibleChildren.length; i++) {
    const child = visibleChildren[i];

    // Show first few children at each level
    if (i < 5) {
      output += formatTreeOverview(child, depth + 1, maxDepth);
    } else {
      output += `${indent(depth + 1)}... and ${visibleChildren.length - i} more siblings\n`;
      break;
    }
  }

  return output;
}

/**
 * Count all descendants of an element
 */
function countDescendants(element: UIElement): number {
  let count = element.children.length;
  for (const child of element.children) {
    count += countDescendants(child);
  }
  return count;
}

// =============================================================================
// JSON Formatter
// =============================================================================

/**
 * Format inspection result as JSON for structured output.
 *
 * @param result - Inspection result
 * @returns JSON-formatted string
 */
export function formatInspectAsJson(result: InspectResult): string {
  const interactables = getInteractableElements(result.tree, true);

  const serializable = {
    id: result.id,
    timestamp: result.timestamp.toISOString(),
    simulator: result.simulator,
    stats: result.stats,
    interactableElements: interactables.map((el) => ({
      type: el.type,
      identifier: el.identifier,
      label: el.label,
      value: el.value,
      action: el.suggestedAction,
      frame: el.frame,
      enabled: el.enabled,
    })),
    screenshot: result.screenshot
      ? {
          path: result.screenshot.path,
          size: result.screenshot.size,
        }
      : null,
    artifactDir: result.artifactDir,
  };

  return JSON.stringify(serializable, null, 2);
}

/**
 * Format inspection result as a simplified element list.
 * Useful for agents that need a flat list of actionable elements.
 *
 * @param result - Inspection result
 * @returns Simplified list string
 */
export function formatInspectAsElementList(result: InspectResult): string {
  const interactables = getInteractableElements(result.tree, true);
  const sorted = sortByPosition(interactables as UIElement[]) as InteractableElement[];

  let output = `# UI Elements (${sorted.length} interactable)\n\n`;

  for (let i = 0; i < sorted.length; i++) {
    const el = sorted[i];
    const id = getBestIdentifier(el, result.elements);

    output += `${i + 1}. ${el.type} ${id}`;

    if (el.label && el.label !== el.identifier) {
      output += ` - "${truncate(el.label, 50)}"`;
    }

    output += ` [${el.suggestedAction}]\n`;
  }

  return output;
}

// =============================================================================
// Compact Formatter
// =============================================================================

/**
 * Format inspection result in a compact form for quick reference.
 *
 * @param result - Inspection result
 * @returns Compact summary string
 */
export function formatInspectCompact(result: InspectResult): string {
  const lines: string[] = [];

  lines.push(`UI: ${result.stats.totalElements} elements, ${result.stats.interactableElements} interactive`);

  // List buttons
  const buttons = result.elements.filter((e) => e.type === 'Button' && e.visible);
  if (buttons.length > 0) {
    const buttonLabels = buttons
      .filter((b) => b.label || b.identifier)
      .slice(0, 5)
      .map((b) => b.label || b.identifier);
    lines.push(`Buttons: ${buttonLabels.join(', ')}${buttons.length > 5 ? `, +${buttons.length - 5} more` : ''}`);
  }

  // List text fields
  const textFields = result.elements.filter(
    (e) => ['TextField', 'SecureTextField', 'TextEditor'].includes(e.type) && e.visible
  );
  if (textFields.length > 0) {
    const fieldLabels = textFields
      .filter((f) => f.label || f.identifier || f.placeholder)
      .slice(0, 3)
      .map((f) => f.label || f.identifier || f.placeholder);
    lines.push(`Text Fields: ${fieldLabels.join(', ')}`);
  }

  // List visible text
  const texts = result.elements.filter(
    (e) => ['StaticText', 'Text'].includes(e.type) && e.visible && e.label
  );
  if (texts.length > 0) {
    const textLabels = texts.slice(0, 5).map((t) => `"${truncate(t.label!, 30)}"`);
    lines.push(`Text: ${textLabels.join(', ')}`);
  }

  if (result.screenshot) {
    lines.push(`Screenshot: ${result.screenshot.path}`);
  }

  return lines.join('\n');
}

// =============================================================================
// Element Query Formatting
// =============================================================================

/**
 * Format element query results for agent consumption.
 * Produces a structured output that helps agents understand what was found.
 *
 * @param queryResult - Result from findElements()
 * @param elements - Optional full element list for position calculation
 * @returns Formatted query result string
 */
export function formatElementQuery(
  queryResult: QueryResult,
  elements?: UIElement[]
): string {
  const { query, totalSearched } = queryResult;
  const foundElements = queryResult.elements;

  const lines: string[] = [];

  // Header with query summary
  lines.push('## Element Query Results\n');
  lines.push(`Searched ${totalSearched} elements\n`);

  // Show what was queried
  lines.push('### Query Criteria');
  const queryParts: string[] = [];

  if (query.identifier) {
    queryParts.push(`- Identifier: \`${query.identifier}\``);
  }
  if (query.label) {
    queryParts.push(`- Label: \`${query.label}\``);
  }
  if (query.type) {
    const types = Array.isArray(query.type) ? query.type.join(', ') : query.type;
    queryParts.push(`- Type: ${types}`);
  }
  if (query.value) {
    queryParts.push(`- Value: \`${query.value}\``);
  }
  if (query.containsText) {
    queryParts.push(`- Contains text: "${query.containsText}"`);
  }
  if (query.visible !== undefined) {
    queryParts.push(`- Visible: ${query.visible}`);
  }
  if (query.enabled !== undefined) {
    queryParts.push(`- Enabled: ${query.enabled}`);
  }
  if (query.traits && query.traits.length > 0) {
    queryParts.push(`- Traits: ${query.traits.join(', ')}`);
  }

  if (queryParts.length > 0) {
    lines.push(queryParts.join('\n'));
  } else {
    lines.push('(all elements)');
  }

  lines.push('');

  // Results
  if (foundElements.length === 0) {
    lines.push('### No Matches Found\n');
    lines.push('No elements matched the specified criteria.');
    lines.push('');
    lines.push('**Suggestions:**');
    lines.push('- Try a less restrictive query');
    lines.push('- Check if the element exists on the current screen');
    lines.push('- Verify the identifier or label spelling');
  } else {
    lines.push(`### Found ${foundElements.length} Element${foundElements.length > 1 ? 's' : ''}\n`);

    // Format each found element
    const sorted = sortByPosition(foundElements);
    for (let i = 0; i < Math.min(sorted.length, 20); i++) {
      const el = sorted[i];
      const bestId = getBestIdentifier(el, elements);

      lines.push(`**${i + 1}. ${el.type}** ${bestId}`);

      const details: string[] = [];
      if (el.identifier && !bestId.startsWith('id:')) {
        details.push(`id=\`${el.identifier}\``);
      }
      if (el.label) {
        details.push(`label="${truncate(el.label, 40)}"`);
      }
      if (el.value) {
        details.push(`value="${truncate(el.value, 30)}"`);
      }

      if (details.length > 0) {
        lines.push(`   ${details.join(' | ')}`);
      }

      // Position info
      if (el.frame.width > 0 && el.frame.height > 0) {
        lines.push(`   Position: (${el.frame.x}, ${el.frame.y}) Size: ${el.frame.width}x${el.frame.height}`);
      }

      // State info
      const stateInfo: string[] = [];
      if (!el.enabled) stateInfo.push('disabled');
      if (!el.visible) stateInfo.push('hidden');
      if (stateInfo.length > 0) {
        lines.push(`   State: [${stateInfo.join(', ')}]`);
      }

      // Action suggestion if interactable
      if (isInteractable(el)) {
        const action = getSuggestedAction(el);
        lines.push(`   Suggested action: **${action}**`);
      }

      lines.push('');
    }

    if (foundElements.length > 20) {
      lines.push(`... and ${foundElements.length - 20} more elements`);
    }
  }

  return lines.join('\n');
}

/**
 * Format element query as a simple table for quick reference.
 *
 * @param queryResult - Result from findElements()
 * @returns Formatted table string
 */
export function formatElementQueryTable(queryResult: QueryResult): string {
  const { elements: foundElements } = queryResult;

  if (foundElements.length === 0) {
    return 'No elements found.';
  }

  const lines: string[] = [];
  lines.push('| # | Type | Identifier | Label | Action |');
  lines.push('|---|------|------------|-------|--------|');

  const sorted = sortByPosition(foundElements);
  for (let i = 0; i < Math.min(sorted.length, 20); i++) {
    const el = sorted[i];
    const action = isInteractable(el) ? getSuggestedAction(el) : '-';
    const id = el.identifier ? `\`${truncate(el.identifier, 20)}\`` : '-';
    const label = el.label ? truncate(el.label, 25) : '-';

    lines.push(`| ${i + 1} | ${el.type} | ${id} | ${label} | ${action} |`);
  }

  if (foundElements.length > 20) {
    lines.push(`\n*... and ${foundElements.length - 20} more elements*`);
  }

  return lines.join('\n');
}

// =============================================================================
// Action Suggestions Formatting
// =============================================================================

/**
 * Possible actions for an element based on its type
 */
interface ActionSuggestion {
  /** Primary action name */
  action: string;
  /** How to reference this element */
  target: string;
  /** Description of what this action does */
  description: string;
  /** Example code/command */
  example: string;
  /** Whether this is available (based on element state) */
  available: boolean;
  /** Reason if not available */
  unavailableReason?: string;
}

/**
 * Format action suggestions for an element.
 * Provides context about what actions can be taken on the element.
 *
 * @param element - The UI element to analyze
 * @param allElements - Optional full element list for position calculation
 * @returns Formatted action suggestions string
 */
export function formatActionSuggestions(
  element: UIElement,
  allElements?: UIElement[]
): string {
  const suggestions = getActionSuggestions(element, allElements);
  const lines: string[] = [];

  // Element header
  const bestId = getBestIdentifier(element, allElements);
  lines.push(`## Actions for ${element.type} ${bestId}\n`);

  // Element description
  if (element.label) {
    lines.push(`Label: "${element.label}"`);
  }
  if (element.value) {
    lines.push(`Current value: "${element.value}"`);
  }
  if (element.frame.width > 0) {
    lines.push(`Location: (${element.frame.x}, ${element.frame.y}) Size: ${element.frame.width}x${element.frame.height}`);
  }
  lines.push('');

  // State check
  if (!element.enabled) {
    lines.push('**Warning**: This element is currently **disabled**.');
    lines.push('Wait for it to become enabled before interacting.\n');
  }

  if (!element.visible) {
    lines.push('**Warning**: This element is currently **hidden**.');
    lines.push('It may need to be scrolled into view first.\n');
  }

  // Available actions
  const available = suggestions.filter(s => s.available);
  const unavailable = suggestions.filter(s => !s.available);

  if (available.length > 0) {
    lines.push('### Available Actions\n');

    for (const suggestion of available) {
      lines.push(`#### ${suggestion.action}`);
      lines.push(suggestion.description);
      lines.push(`\n**Target**: \`${suggestion.target}\``);
      lines.push(`**Example**: \`${suggestion.example}\``);
      lines.push('');
    }
  }

  if (unavailable.length > 0) {
    lines.push('### Unavailable Actions\n');

    for (const suggestion of unavailable) {
      lines.push(`- ~~${suggestion.action}~~: ${suggestion.unavailableReason}`);
    }
    lines.push('');
  }

  // Best approach recommendation
  if (available.length > 0) {
    lines.push('### Recommended Approach\n');
    const primary = available[0];
    lines.push(`The most reliable action for this ${element.type} is **${primary.action}**.`);
    lines.push(`Use target: \`${primary.target}\``);
  }

  return lines.join('\n');
}

/**
 * Get action suggestions for an element
 */
function getActionSuggestions(
  element: UIElement,
  _allElements?: UIElement[]
): ActionSuggestion[] {
  const suggestions: ActionSuggestion[] = [];
  const type = element.type.toLowerCase();

  // Determine target string for commands
  const targetId = element.identifier
    ? `id:${element.identifier}`
    : element.label
      ? `label:${element.label}`
      : `type:${element.type}`;

  // Common checks
  const isEnabled = element.enabled;
  const isVisible = element.visible;

  // Type-specific suggestions
  switch (type) {
    case 'button':
    case 'link':
    case 'cell':
    case 'menuitem':
    case 'tab':
      suggestions.push({
        action: 'tap',
        target: targetId,
        description: 'Tap this button to trigger its action.',
        example: `tap(${targetId})`,
        available: isEnabled && isVisible,
        unavailableReason: !isEnabled ? 'Element is disabled' : !isVisible ? 'Element is not visible' : undefined,
      });
      break;

    case 'textfield':
    case 'securetextfield':
    case 'searchfield':
    case 'texteditor':
      suggestions.push({
        action: 'tap',
        target: targetId,
        description: 'Tap to focus the text field.',
        example: `tap(${targetId})`,
        available: isEnabled && isVisible,
        unavailableReason: !isEnabled ? 'Element is disabled' : !isVisible ? 'Element is not visible' : undefined,
      });
      suggestions.push({
        action: 'inputText',
        target: targetId,
        description: 'Enter text into this field.',
        example: `inputText(${targetId}, "your text here")`,
        available: isEnabled && isVisible,
        unavailableReason: !isEnabled ? 'Element is disabled' : !isVisible ? 'Element is not visible' : undefined,
      });
      suggestions.push({
        action: 'clearText',
        target: targetId,
        description: 'Clear the existing text in this field.',
        example: `clearText(${targetId})`,
        available: isEnabled && isVisible,
        unavailableReason: !isEnabled ? 'Element is disabled' : !isVisible ? 'Element is not visible' : undefined,
      });
      break;

    case 'switch':
    case 'toggle':
    case 'checkbox':
      suggestions.push({
        action: 'tap',
        target: targetId,
        description: 'Tap to toggle this switch on or off.',
        example: `tap(${targetId})`,
        available: isEnabled && isVisible,
        unavailableReason: !isEnabled ? 'Element is disabled' : !isVisible ? 'Element is not visible' : undefined,
      });
      if (element.value) {
        const currentState = element.value === '1' || element.value.toLowerCase() === 'true' ? 'ON' : 'OFF';
        suggestions[0].description = `Tap to toggle (currently ${currentState}).`;
      }
      break;

    case 'slider':
      suggestions.push({
        action: 'adjustSlider',
        target: targetId,
        description: 'Adjust the slider to a specific value.',
        example: `adjustSlider(${targetId}, 0.5)`,
        available: isEnabled && isVisible,
        unavailableReason: !isEnabled ? 'Element is disabled' : !isVisible ? 'Element is not visible' : undefined,
      });
      break;

    case 'scrollview':
    case 'tableview':
    case 'collectionview':
    case 'list':
      suggestions.push({
        action: 'scroll',
        target: targetId,
        description: 'Scroll within this container.',
        example: `scroll(${targetId}, "down")`,
        available: isVisible,
        unavailableReason: !isVisible ? 'Element is not visible' : undefined,
      });
      suggestions.push({
        action: 'swipe',
        target: targetId,
        description: 'Swipe within this container.',
        example: `swipe(${targetId}, "up")`,
        available: isVisible,
        unavailableReason: !isVisible ? 'Element is not visible' : undefined,
      });
      break;

    case 'picker':
    case 'datepicker':
    case 'pickerwheel':
      suggestions.push({
        action: 'adjustPicker',
        target: targetId,
        description: 'Select a value from the picker.',
        example: `adjustPicker(${targetId}, "Option 1")`,
        available: isEnabled && isVisible,
        unavailableReason: !isEnabled ? 'Element is disabled' : !isVisible ? 'Element is not visible' : undefined,
      });
      break;

    case 'segmentedcontrol':
      suggestions.push({
        action: 'tap',
        target: targetId,
        description: 'Tap to select a segment.',
        example: `tap(${targetId})`,
        available: isEnabled && isVisible,
        unavailableReason: !isEnabled ? 'Element is disabled' : !isVisible ? 'Element is not visible' : undefined,
      });
      break;

    case 'stepper':
      suggestions.push({
        action: 'tapIncrement',
        target: targetId,
        description: 'Tap the increment button.',
        example: `tap(${targetId}, "increment")`,
        available: isEnabled && isVisible,
        unavailableReason: !isEnabled ? 'Element is disabled' : !isVisible ? 'Element is not visible' : undefined,
      });
      suggestions.push({
        action: 'tapDecrement',
        target: targetId,
        description: 'Tap the decrement button.',
        example: `tap(${targetId}, "decrement")`,
        available: isEnabled && isVisible,
        unavailableReason: !isEnabled ? 'Element is disabled' : !isVisible ? 'Element is not visible' : undefined,
      });
      break;

    default:
      // Generic tap for any element
      if (isInteractable(element)) {
        suggestions.push({
          action: 'tap',
          target: targetId,
          description: `Tap this ${element.type} element.`,
          example: `tap(${targetId})`,
          available: isEnabled && isVisible,
          unavailableReason: !isEnabled ? 'Element is disabled' : !isVisible ? 'Element is not visible' : undefined,
        });
      }
  }

  // Always add coordinate-based fallback if element has valid frame
  if (element.frame.width > 0 && element.frame.height > 0) {
    const centerX = Math.round(element.frame.x + element.frame.width / 2);
    const centerY = Math.round(element.frame.y + element.frame.height / 2);

    suggestions.push({
      action: 'tapPoint',
      target: `point:${centerX},${centerY}`,
      description: 'Tap at the center coordinates of this element (fallback option).',
      example: `tapPoint(${centerX}, ${centerY})`,
      available: isVisible,
      unavailableReason: !isVisible ? 'Element is not visible' : undefined,
    });
  }

  return suggestions;
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Truncate a string to a maximum length
 */
function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Create indentation string
 */
function indent(depth: number): string {
  return '  '.repeat(depth);
}

/**
 * Capitalize first letter
 */
function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Group interactable elements by suggested action
 */
function groupByAction(
  elements: InteractableElement[]
): Record<string, InteractableElement[]> {
  const groups: Record<string, InteractableElement[]> = {
    tap: [],
    type: [],
    toggle: [],
    scroll: [],
    select: [],
  };

  for (const el of elements) {
    if (groups[el.suggestedAction]) {
      groups[el.suggestedAction].push(el);
    }
  }

  return groups;
}
