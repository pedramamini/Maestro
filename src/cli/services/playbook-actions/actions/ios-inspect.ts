/**
 * iOS Inspect Action
 *
 * Inspects the UI hierarchy of an iOS app using XCUITest.
 * Exposes the ios-tools inspect functionality as a playbook action.
 *
 * Example YAML usage:
 * ```yaml
 * - action: ios.inspect
 *   inputs:
 *     app: com.example.myapp
 *   store_as: ui_state
 *
 * - action: assert
 *   inputs:
 *     condition: "{{ variables.ui_state.summary.buttons >= 1 }}"
 *     message: "Login button should be present"
 * ```
 */

import { defineAction } from '../action-registry';
import type { ActionResult } from '../types';
import * as iosTools from '../../../../main/ios-tools';
import type {
  Simulator,
  XCUITestInspectResult,
  ElementNode,
} from '../../../../main/ios-tools';

/**
 * Input parameters for the ios.inspect action
 */
export interface IosInspectInputs {
  /** Bundle ID of the app to inspect (required) */
  app: string;
  /** Simulator name or UDID (default: first booted simulator) */
  simulator?: string;
  /** Query for specific elements (e.g., "#login_button", "Button", "*submit*") */
  element?: string;
  /** Maximum tree depth to traverse (default: unlimited) */
  depth?: number;
  /** Include hidden/non-visible elements (default: false) */
  include_hidden?: boolean;
  /** Capture paired screenshot (default: true) */
  capture_screenshot?: boolean;
}

/**
 * Internal query structure for finding elements in ElementNode tree
 */
interface InternalElementQuery {
  identifier?: string;
  label?: string;
  type?: string;
  containsText?: string;
}

/**
 * Resolve a simulator name to its UDID
 */
async function resolveSimulator(
  nameOrUdid: string | undefined
): Promise<string | undefined> {
  if (!nameOrUdid) {
    return undefined;
  }

  // Check if it's already a UDID (UUID format)
  const uuidRegex = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i;
  if (uuidRegex.test(nameOrUdid)) {
    return nameOrUdid;
  }

  // Look up by name - listSimulators returns IOSResult<Simulator[]>
  const simulatorsResult = await iosTools.listSimulators();
  if (!simulatorsResult.success || !simulatorsResult.data) {
    return undefined;
  }
  const simulators: Simulator[] = simulatorsResult.data;
  const match = simulators.find(
    (s) => s.name.toLowerCase() === nameOrUdid.toLowerCase()
  );
  return match?.udid;
}

/**
 * Get the first booted simulator UDID
 */
async function getFirstBootedSimulator(): Promise<string | undefined> {
  // getBootedSimulators returns IOSResult<Simulator[]>
  const bootedResult = await iosTools.getBootedSimulators();
  if (!bootedResult.success || !bootedResult.data) {
    return undefined;
  }
  const booted: Simulator[] = bootedResult.data;
  return booted.length > 0 ? booted[0].udid : undefined;
}

/**
 * Parse element query string into query criteria
 * Supports:
 * - By identifier: #login_button
 * - By label: "Log In" (quoted text)
 * - By type: Button (capitalized)
 * - Contains: *submit* (wildcards)
 * - Combined: Button#login_button
 */
function parseElementQuery(query: string): InternalElementQuery {
  const result: InternalElementQuery = {};

  // Handle combined type#identifier format
  const combinedMatch = query.match(/^([A-Z][a-zA-Z]+)#(.+)$/);
  if (combinedMatch) {
    result.type = combinedMatch[1].toLowerCase();
    result.identifier = combinedMatch[2];
    return result;
  }

  // By identifier: #login_button
  if (query.startsWith('#')) {
    result.identifier = query.slice(1);
    return result;
  }

  // By label: "Log In" (quoted)
  if (query.startsWith('"') && query.endsWith('"')) {
    result.label = query.slice(1, -1);
    return result;
  }

  // Contains: *submit*
  if (query.startsWith('*') && query.endsWith('*')) {
    result.containsText = query.slice(1, -1);
    return result;
  }

  // By type: Button (starts with capital letter)
  if (/^[A-Z][a-zA-Z]+$/.test(query)) {
    result.type = query.toLowerCase();
    return result;
  }

  // Default: treat as contains text search
  result.containsText = query;
  return result;
}

/**
 * Find elements matching a query in the element tree
 */
function findMatchingElements(
  root: ElementNode,
  query: InternalElementQuery
): ElementNode[] {
  const results: ElementNode[] = [];

  function traverse(element: ElementNode) {
    let matches = true;

    if (query.identifier && element.identifier !== query.identifier) {
      matches = false;
    }
    if (query.label && element.label !== query.label) {
      matches = false;
    }
    if (query.type && element.type.toLowerCase() !== query.type.toLowerCase()) {
      matches = false;
    }
    if (query.containsText) {
      const searchText = query.containsText.toLowerCase();
      const elementText = (element.value || element.label || element.identifier || '').toLowerCase();
      if (!elementText.includes(searchText)) {
        matches = false;
      }
    }

    if (matches) {
      results.push(element);
    }

    for (const child of element.children) {
      traverse(child);
    }
  }

  traverse(root);
  return results;
}

/**
 * Create a formatted summary for the inspection result
 */
function formatResultSummary(result: XCUITestInspectResult): string {
  const lines: string[] = [];

  lines.push(`## iOS UI Inspection: ${result.id}`);
  lines.push('');
  lines.push(`**App**: ${result.bundleId}`);
  lines.push(`**Simulator**: ${result.simulator.name} (iOS ${result.simulator.iosVersion})`);
  lines.push(`**Inspected at**: ${result.timestamp.toISOString()}`);
  lines.push('');
  lines.push('### Element Summary');
  lines.push(`- Total elements: ${result.summary.totalElements}`);
  lines.push(`- Interactable: ${result.summary.interactableElements}`);
  lines.push(`- Buttons: ${result.summary.buttons}`);
  lines.push(`- Text inputs: ${result.summary.textInputs}`);
  lines.push(`- Text elements: ${result.summary.textElements}`);
  lines.push(`- Images: ${result.summary.images}`);

  if (result.summary.warnings.length > 0) {
    lines.push('');
    lines.push('### Accessibility Warnings');
    for (const warning of result.summary.warnings.slice(0, 10)) {
      lines.push(`- ${warning.description}`);
    }
    if (result.summary.warnings.length > 10) {
      lines.push(`  ... and ${result.summary.warnings.length - 10} more warnings`);
    }
  }

  if (result.screenshotPath) {
    lines.push('');
    lines.push(`### Screenshot`);
    lines.push(`Path: \`${result.screenshotPath}\``);
  }

  lines.push('');
  lines.push(`Artifacts saved to: ${result.artifactDir}`);

  return lines.join('\n');
}

/**
 * iOS Inspect action definition
 */
export const iosInspectAction = defineAction<IosInspectInputs>({
  name: 'ios.inspect',
  description: 'Inspect iOS app UI hierarchy using XCUITest',

  inputs: {
    app: {
      type: 'string',
      required: true,
      description: 'Bundle ID of app to inspect',
    },
    simulator: {
      type: 'string',
      required: false,
      description: 'Simulator name or UDID (default: first booted simulator)',
    },
    element: {
      type: 'string',
      required: false,
      description: 'Query for specific elements (#id, "label", Type, *contains*)',
    },
    depth: {
      type: 'number',
      required: false,
      description: 'Maximum tree depth to traverse',
    },
    include_hidden: {
      type: 'boolean',
      required: false,
      default: false,
      description: 'Include hidden/non-visible elements',
    },
    capture_screenshot: {
      type: 'boolean',
      required: false,
      default: true,
      description: 'Capture paired screenshot',
    },
  },

  outputs: {
    id: {
      type: 'string',
      description: 'Unique inspection ID',
    },
    bundleId: {
      type: 'string',
      description: 'App bundle ID that was inspected',
    },
    simulator: {
      type: 'object',
      description: 'Simulator info (name, udid, iosVersion)',
    },
    rootElement: {
      type: 'object',
      description: 'Root element of the UI tree',
    },
    summary: {
      type: 'object',
      description: 'Element count summary and accessibility warnings',
    },
    screenshotPath: {
      type: 'string',
      description: 'Path to paired screenshot',
    },
    artifactDir: {
      type: 'string',
      description: 'Directory containing all artifacts',
    },
    queriedElements: {
      type: 'array',
      description: 'Elements matching the query (if element query specified)',
    },
    formattedOutput: {
      type: 'string',
      description: 'Human-readable formatted output for agent display',
    },
  },

  async handler(inputs, context): Promise<ActionResult> {
    const startTime = Date.now();

    try {
      // Validate required bundle ID
      if (!inputs.app || inputs.app.trim() === '') {
        return {
          success: false,
          message: 'Bundle ID is required',
          error: 'The "app" input is required. Specify the bundle ID of the app to inspect.',
          elapsedMs: Date.now() - startTime,
        };
      }

      // Resolve simulator UDID
      let udid = await resolveSimulator(inputs.simulator);

      // If no simulator specified, use first booted
      if (!udid) {
        udid = await getFirstBootedSimulator();
      }

      if (!udid) {
        return {
          success: false,
          message: 'No booted simulator found',
          error: inputs.simulator
            ? `Simulator '${inputs.simulator}' not found or not booted`
            : 'No simulator is currently booted. Boot a simulator first.',
          elapsedMs: Date.now() - startTime,
        };
      }

      // Build inspection options
      const inspectOptions: iosTools.XCUITestInspectOptions = {
        simulatorUdid: udid,
        bundleId: inputs.app,
        sessionId: context.sessionId,
        maxDepth: inputs.depth,
        includeHidden: inputs.include_hidden ?? false,
        captureScreenshot: inputs.capture_screenshot ?? true,
      };

      // Run inspection
      const inspectResult = await iosTools.inspectWithXCUITest(inspectOptions);

      // Check for failure
      if (!inspectResult.success || !inspectResult.data) {
        return {
          success: false,
          message: 'Failed to inspect UI hierarchy',
          error: inspectResult.error || 'Unknown error',
          elapsedMs: Date.now() - startTime,
        };
      }

      const result: XCUITestInspectResult = inspectResult.data;

      // Query for specific elements if requested
      let queriedElements: ElementNode[] | undefined;
      if (inputs.element) {
        const query = parseElementQuery(inputs.element);
        queriedElements = findMatchingElements(result.rootElement, query);
      }

      // Format for agent consumption
      const formattedOutput = formatResultSummary(result);

      // Build output data structure
      const outputData = {
        id: result.id,
        bundleId: result.bundleId,
        simulator: result.simulator,
        rootElement: result.rootElement,
        summary: result.summary,
        screenshotPath: result.screenshotPath,
        artifactDir: result.artifactDir,
        queriedElements,
        // Include the formatted output for agent display
        formattedOutput,
      };

      // Build message based on results
      let message = `Inspected ${result.bundleId}: ${result.summary.totalElements} elements`;
      if (result.summary.interactableElements > 0) {
        message += ` (${result.summary.interactableElements} interactable)`;
      }
      if (queriedElements && queriedElements.length > 0) {
        message += `, ${queriedElements.length} matched query`;
      }
      if (result.summary.warnings.length > 0) {
        message += ` - ${result.summary.warnings.length} accessibility warning(s)`;
      }

      return {
        success: true,
        message,
        data: outputData,
        elapsedMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to inspect UI hierarchy',
        error: error instanceof Error ? error.message : String(error),
        elapsedMs: Date.now() - startTime,
      };
    }
  },
});
