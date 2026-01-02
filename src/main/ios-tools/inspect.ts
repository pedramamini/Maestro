/**
 * iOS Tools - XCUITest-based UI Inspection
 *
 * Inspects the UI hierarchy of an iOS app using XCUITest.
 * This provides more reliable and detailed inspection than simctl ui describe.
 *
 * Uses the Swift XCUITest runner in xcuitest-runner/ to access
 * XCUIElement properties that aren't available through simctl.
 */

import path from 'path';
import { IOSResult } from './types';
import { getSimulator, getBootedSimulators } from './simulator';
import { screenshot } from './capture';
import { getSnapshotDirectory, generateSnapshotId } from './artifacts';
import { logger } from '../utils/logger';
import {
  InspectError,
  detectInspectError,
  createEmptyUITreeError,
  formatInspectError,
} from './inspect-errors';

const LOG_CONTEXT = '[iOS-Inspect-XCUITest]';

// =============================================================================
// Types
// =============================================================================

/**
 * Options for XCUITest-based UI inspection
 */
export interface XCUITestInspectOptions {
  /** Simulator UDID (uses first booted if not specified) */
  simulatorUdid?: string;
  /** App bundle ID to inspect (required) */
  bundleId: string;
  /** Session ID for artifact storage */
  sessionId: string;
  /** Maximum depth to traverse (default: unlimited) */
  maxDepth?: number;
  /** Include hidden/non-visible elements (default: false) */
  includeHidden?: boolean;
  /** Include frame/position data (default: true) */
  includeFrames?: boolean;
  /** Whether to capture a paired screenshot (default: true) */
  captureScreenshot?: boolean;
  /** Custom snapshot ID (auto-generated if not provided) */
  snapshotId?: string;
  /** Timeout for inspection (ms, default: 30000) */
  timeout?: number;
}

/**
 * Result of XCUITest-based UI inspection
 */
export interface XCUITestInspectResult {
  /** Unique identifier for this inspection */
  id: string;
  /** Timestamp of inspection */
  timestamp: Date;
  /** App bundle ID that was inspected */
  bundleId: string;
  /** Simulator info */
  simulator: {
    udid: string;
    name: string;
    iosVersion: string;
  };
  /** Root element of the UI tree */
  rootElement: ElementNode;
  /** Summary statistics */
  summary: {
    totalElements: number;
    interactableElements: number;
    identifiedElements: number;
    labeledElements: number;
    textInputs: number;
    buttons: number;
    textElements: number;
    images: number;
    scrollViews: number;
    tables: number;
    alerts: number;
    warnings: AccessibilityWarning[];
  };
  /** Path to paired screenshot */
  screenshotPath?: string;
  /** Directory containing artifacts */
  artifactDir: string;
}

/**
 * A node in the UI element tree
 * Matches the Swift ElementNode structure
 */
export interface ElementNode {
  /** Element type (e.g., "button", "textField", "staticText") */
  type: string;
  /** Accessibility identifier (most reliable for testing) */
  identifier?: string;
  /** Accessibility label (what VoiceOver reads) */
  label?: string;
  /** Current value (for inputs, switches, etc.) */
  value?: string;
  /** Placeholder text (for text fields) */
  placeholderValue?: string;
  /** Accessibility hint text */
  hint?: string;
  /** Element title */
  title?: string;
  /** Frame in screen coordinates */
  frame: ElementFrame;
  /** Whether the element is enabled for interaction */
  isEnabled: boolean;
  /** Whether the element is currently selected */
  isSelected: boolean;
  /** Whether the element has keyboard focus */
  isFocused: boolean;
  /** Whether the element exists in the hierarchy */
  exists: boolean;
  /** Whether the element can receive tap events */
  isHittable: boolean;
  /** Whether the element is visible (non-zero size) */
  isVisible: boolean;
  /** Accessibility traits */
  traits: string[];
  /** Child elements */
  children: ElementNode[];
  /** Unique path to this element */
  elementPath?: string;
  /** Suggested action for this element */
  suggestedAction?: string;
  /** Best identifier to use for targeting this element */
  bestTargetId?: string;
}

/**
 * Frame/bounds of an element in screen coordinates
 */
export interface ElementFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Warning about potential accessibility issues
 */
export interface AccessibilityWarning {
  /** Warning type */
  type: 'missing_identifier' | 'missing_label' | 'zero_size' | string;
  /** Type of the problematic element */
  elementType: string;
  /** Human-readable description */
  description: string;
  /** Location of the element */
  frame?: ElementFrame;
  /** How to fix the issue */
  suggestedFix?: string;
}

/**
 * Raw inspector result from Swift XCUITest runner
 */
interface RawInspectorResult {
  success: boolean;
  error?: string;
  bundleId: string;
  rootElement?: ElementNode;
  stats?: {
    totalElements: number;
    interactableElements: number;
    identifiedElements: number;
    labeledElements: number;
    buttons: number;
    textFields: number;
    textElements: number;
    images: number;
    scrollViews: number;
    tables: number;
    alerts: number;
    warnings: AccessibilityWarning[];
  };
  timestamp: string;
}

/**
 * Extended IOSResult with debug information for error detection
 */
interface ExtendedIOSResult<T> extends IOSResult<T> {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
}

// =============================================================================
// Output Markers
// =============================================================================

/** Marker to identify start of JSON output in stdout */
const OUTPUT_START_MARKER = '<<<MAESTRO_INSPECT_OUTPUT_START>>>';
/** Marker to identify end of JSON output in stdout */
const OUTPUT_END_MARKER = '<<<MAESTRO_INSPECT_OUTPUT_END>>>';

// =============================================================================
// Main Inspect Function
// =============================================================================

/**
 * Inspect the UI hierarchy of an app using XCUITest.
 *
 * This method provides more detailed element information than simctl ui describe,
 * including:
 * - Accurate isHittable state
 * - Element hierarchy with proper parent-child relationships
 * - Suggested actions for each element
 * - Best target identifiers for automation
 *
 * @param options - Inspection options
 * @returns Inspection result with element tree or error
 */
export async function inspectWithXCUITest(
  options: XCUITestInspectOptions
): Promise<IOSResult<XCUITestInspectResult>> {
  const {
    simulatorUdid: providedUdid,
    bundleId,
    sessionId,
    maxDepth,
    includeHidden = false,
    includeFrames = true,
    captureScreenshot: shouldCapture = true,
    snapshotId: providedSnapshotId,
    timeout = 30000,
  } = options;

  const snapshotId = providedSnapshotId || generateSnapshotId();
  const startTime = new Date();

  logger.info(`${LOG_CONTEXT} Inspecting UI hierarchy for ${bundleId}`);

  // Validate bundle ID
  if (!bundleId || bundleId.trim() === '') {
    return {
      success: false,
      error: 'Bundle ID is required for XCUITest inspection',
      errorCode: 'COMMAND_FAILED',
    };
  }

  // Get UDID
  let udid = providedUdid;
  if (!udid) {
    const bootedResult = await getBootedSimulators();
    if (!bootedResult.success || !bootedResult.data || bootedResult.data.length === 0) {
      return {
        success: false,
        error: 'No booted simulator found. Please specify --simulator or boot a simulator.',
        errorCode: 'SIMULATOR_NOT_BOOTED',
      };
    }
    udid = bootedResult.data[0].udid;
    logger.info(`${LOG_CONTEXT} Using first booted simulator: ${udid}`);
  }

  // Get simulator info
  const simResult = await getSimulator(udid);
  if (!simResult.success || !simResult.data) {
    return {
      success: false,
      error: simResult.error || 'Failed to get simulator info',
      errorCode: simResult.errorCode || 'SIMULATOR_NOT_FOUND',
    };
  }

  if (simResult.data.state !== 'Booted') {
    return {
      success: false,
      error: `Simulator is not booted (state: ${simResult.data.state})`,
      errorCode: 'SIMULATOR_NOT_BOOTED',
    };
  }

  // Create artifact directory
  let artifactDir: string;
  try {
    artifactDir = await getSnapshotDirectory(sessionId, snapshotId);
  } catch (error) {
    return {
      success: false,
      error: `Failed to create artifact directory: ${error}`,
      errorCode: 'COMMAND_FAILED',
    };
  }

  // Run XCUITest inspector
  const inspectorResult = await runXCUITestInspector({
    udid,
    bundleId,
    maxDepth,
    includeHidden,
    includeFrames,
    timeout,
  });

  if (!inspectorResult.success || !inspectorResult.data) {
    // Use enhanced error detection
    const inspectError = detectInspectError(
      inspectorResult.error || 'Failed to run XCUITest inspector',
      inspectorResult.stdout,
      inspectorResult.stderr,
      inspectorResult.exitCode
    );
    logger.warn(`${LOG_CONTEXT} Inspection failed: ${inspectError.code} - ${inspectError.message}`);
    return {
      success: false,
      error: formatInspectError(inspectError),
      errorCode: inspectError.code,
    };
  }

  const rawResult = inspectorResult.data;

  // Handle empty UI tree (potential loading state)
  if (!rawResult.success || !rawResult.rootElement) {
    let inspectError: InspectError;

    if (rawResult.error) {
      // Detect specific error type from the error message
      inspectError = detectInspectError(rawResult.error);
    } else {
      // No elements - check if this might be a loading state
      inspectError = createEmptyUITreeError('Inspection returned no elements');
    }

    logger.warn(`${LOG_CONTEXT} Inspection issue: ${inspectError.code}`);
    return {
      success: false,
      error: formatInspectError(inspectError),
      errorCode: inspectError.code,
    };
  }

  // Check for effectively empty tree (only root element with no real children)
  const hasRealContent = rawResult.stats &&
    (rawResult.stats.totalElements > 1 ||
     rawResult.stats.buttons > 0 ||
     rawResult.stats.textFields > 0 ||
     rawResult.stats.textElements > 0);

  if (!hasRealContent && !includeHidden) {
    // Check if there are loading indicators (still allow the result but add warning)
    const hasLoadingIndicator = checkForLoadingIndicators(rawResult.rootElement);
    if (hasLoadingIndicator) {
      logger.info(`${LOG_CONTEXT} App appears to be in loading state - UI may be incomplete`);
      // Add warning to stats
      rawResult.stats = rawResult.stats || {
        totalElements: 0,
        interactableElements: 0,
        identifiedElements: 0,
        labeledElements: 0,
        buttons: 0,
        textFields: 0,
        textElements: 0,
        images: 0,
        scrollViews: 0,
        tables: 0,
        alerts: 0,
        warnings: [],
      };
      rawResult.stats.warnings.push({
        type: 'loading_state',
        elementType: 'application',
        description: 'App appears to be in a loading state. UI elements may be incomplete.',
        suggestedFix: 'Wait for the app to finish loading and retry inspection.',
      });
    }
  }

  // Save UI tree JSON
  const treeJsonPath = path.join(artifactDir, 'ui-tree.json');
  try {
    const fs = await import('fs/promises');
    await fs.writeFile(treeJsonPath, JSON.stringify(rawResult, null, 2));
    logger.info(`${LOG_CONTEXT} Saved UI tree to ${treeJsonPath}`);
  } catch (error) {
    logger.warn(`${LOG_CONTEXT} Failed to save UI tree: ${error}`);
  }

  // Capture screenshot if requested
  let screenshotPath: string | undefined;
  if (shouldCapture) {
    const screenshotFilePath = path.join(artifactDir, 'screenshot.png');
    const screenshotResult = await screenshot({
      udid,
      outputPath: screenshotFilePath,
    });

    if (screenshotResult.success && screenshotResult.data) {
      screenshotPath = screenshotFilePath;
    } else {
      logger.warn(`${LOG_CONTEXT} Failed to capture paired screenshot: ${screenshotResult.error}`);
    }
  }

  const result: XCUITestInspectResult = {
    id: snapshotId,
    timestamp: startTime,
    bundleId,
    simulator: {
      udid,
      name: simResult.data.name,
      iosVersion: simResult.data.iosVersion,
    },
    rootElement: rawResult.rootElement,
    summary: {
      totalElements: rawResult.stats?.totalElements || 0,
      interactableElements: rawResult.stats?.interactableElements || 0,
      identifiedElements: rawResult.stats?.identifiedElements || 0,
      labeledElements: rawResult.stats?.labeledElements || 0,
      textInputs: rawResult.stats?.textFields || 0,
      buttons: rawResult.stats?.buttons || 0,
      textElements: rawResult.stats?.textElements || 0,
      images: rawResult.stats?.images || 0,
      scrollViews: rawResult.stats?.scrollViews || 0,
      tables: rawResult.stats?.tables || 0,
      alerts: rawResult.stats?.alerts || 0,
      warnings: rawResult.stats?.warnings || [],
    },
    screenshotPath,
    artifactDir,
  };

  logger.info(
    `${LOG_CONTEXT} Inspection complete: ${result.summary.totalElements} elements, ` +
    `${result.summary.interactableElements} interactable`
  );

  return {
    success: true,
    data: result,
  };
}

// =============================================================================
// XCUITest Runner
// =============================================================================

interface RunInspectorOptions {
  udid: string;
  bundleId: string;
  maxDepth?: number;
  includeHidden: boolean;
  includeFrames: boolean;
  timeout: number;
}

/**
 * Run the XCUITest inspector.
 *
 * Note: This is a placeholder implementation. The full implementation
 * requires building and running an XCUITest bundle, which is complex:
 *
 * 1. Create a temporary Xcode project with the XCUITest target
 * 2. Build the test bundle for the simulator
 * 3. Run with xcodebuild test-without-building
 * 4. Parse the output
 *
 * For now, this falls back to simctl ui describe which provides
 * similar (though less detailed) information.
 */
async function runXCUITestInspector(
  options: RunInspectorOptions
): Promise<ExtendedIOSResult<RawInspectorResult>> {
  const { udid, bundleId, includeHidden, includeFrames, timeout } = options;

  logger.info(`${LOG_CONTEXT} Running XCUITest inspector for ${bundleId}`);

  // TODO: Full XCUITest implementation would:
  // 1. Check for cached built inspector bundle
  // 2. Build if needed using Swift files in xcuitest-runner/
  // 3. Run with xcodebuild test-without-building
  // 4. Parse stdout for JSON between OUTPUT_START_MARKER and OUTPUT_END_MARKER

  // For now, fall back to simctl approach with type conversion
  const simctlResult = await runSimctlInspector(udid, bundleId, timeout);

  if (!simctlResult.success || !simctlResult.data) {
    return {
      success: false,
      error: simctlResult.error || 'Failed to run simctl inspector',
      errorCode: simctlResult.errorCode || 'COMMAND_FAILED',
      stdout: simctlResult.stdout,
      stderr: simctlResult.stderr,
      exitCode: simctlResult.exitCode,
    };
  }

  // Convert simctl result to expected format
  const result = convertToInspectorResult(simctlResult.data, bundleId, includeHidden, includeFrames);

  return {
    success: true,
    data: result,
    stdout: simctlResult.stdout,
    stderr: simctlResult.stderr,
    exitCode: simctlResult.exitCode,
  };
}

interface ExtendedSimctlResult extends ExtendedIOSResult<RawSimctlOutput> {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
}

/**
 * Normalize an exit code from ExecResult (string | number) to number | undefined.
 * String exit codes (like 'ENOENT') are converted to -1.
 */
function normalizeExitCode(exitCode: string | number | undefined): number | undefined {
  if (exitCode === undefined) return undefined;
  if (typeof exitCode === 'number') return exitCode;
  // String exit codes (error codes like 'ENOENT') are treated as -1
  return -1;
}

/**
 * Run simctl ui describe as fallback
 */
async function runSimctlInspector(
  udid: string,
  bundleId: string,
  timeout: number = 30000
): Promise<ExtendedSimctlResult> {
  const { runSimctl } = await import('./utils');

  // Try simctl ui describe (Xcode 15+)
  // Note: runSimctl uses execFileNoThrow which has default timeout
  const result = await runSimctl(['ui', udid, 'describe', '--format', 'json']);

  if (result.exitCode === 0 && result.stdout) {
    try {
      const parsed = JSON.parse(result.stdout);
      return {
        success: true,
        data: {
          format: 'json',
          output: parsed,
          bundleId,
        },
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: normalizeExitCode(result.exitCode),
      };
    } catch {
      // JSON parse failed, return raw
      return {
        success: true,
        data: {
          format: 'text',
          output: result.stdout,
          bundleId,
        },
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: normalizeExitCode(result.exitCode),
      };
    }
  }

  // Check for specific error conditions
  const combinedOutput = `${result.stdout || ''}\n${result.stderr || ''}`;

  // Check for "app not running" in the output
  if (
    combinedOutput.includes('Application is not running') ||
    combinedOutput.includes('Target application is not running') ||
    combinedOutput.includes('Unable to find bundle')
  ) {
    return {
      success: false,
      error: 'Target application is not running. Launch the app first.',
      errorCode: 'APP_NOT_RUNNING',
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: normalizeExitCode(result.exitCode),
    };
  }

  // Check for timeout
  if (
    combinedOutput.includes('timed out') ||
    combinedOutput.includes('timeout')
  ) {
    return {
      success: false,
      error: `UI inspection timed out after ${timeout}ms`,
      errorCode: 'TIMEOUT',
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: normalizeExitCode(result.exitCode),
    };
  }

  // Try alternate approach - get accessibility hierarchy for specific app
  // This uses accessibility inspector via spawn
  const launchResult = await runSimctl(['spawn', udid, 'launchctl', 'list']);
  if (launchResult.exitCode !== 0) {
    return {
      success: false,
      error: 'Failed to access simulator. Ensure app is running.',
      errorCode: 'COMMAND_FAILED',
      stdout: launchResult.stdout,
      stderr: launchResult.stderr,
      exitCode: normalizeExitCode(launchResult.exitCode),
    };
  }

  // Return a minimal result indicating the app should be inspected
  return {
    success: true,
    data: {
      format: 'minimal',
      output: null,
      bundleId,
    },
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: normalizeExitCode(result.exitCode),
  };
}

interface RawSimctlOutput {
  format: 'json' | 'text' | 'minimal';
  output: unknown;
  bundleId: string;
}

/**
 * Convert simctl output to inspector result format
 */
function convertToInspectorResult(
  simctlOutput: RawSimctlOutput,
  bundleId: string,
  includeHidden: boolean,
  includeFrames: boolean
): RawInspectorResult {
  const timestamp = new Date().toISOString();

  if (simctlOutput.format === 'json' && simctlOutput.output) {
    // Parse JSON hierarchy from simctl ui describe
    const rootElement = parseJsonHierarchy(simctlOutput.output, includeHidden, includeFrames);
    const stats = calculateStats(rootElement);

    return {
      success: true,
      bundleId,
      rootElement,
      stats,
      timestamp,
    };
  }

  if (simctlOutput.format === 'text' && typeof simctlOutput.output === 'string') {
    // Parse text hierarchy
    const rootElement = parseTextHierarchy(simctlOutput.output, includeFrames);
    const stats = calculateStats(rootElement);

    return {
      success: true,
      bundleId,
      rootElement,
      stats,
      timestamp,
    };
  }

  // Minimal fallback - return empty tree
  const emptyRoot: ElementNode = {
    type: 'application',
    identifier: bundleId,
    label: 'Application',
    frame: { x: 0, y: 0, width: 0, height: 0 },
    isEnabled: true,
    isSelected: false,
    isFocused: false,
    exists: true,
    isHittable: false,
    isVisible: true,
    traits: [],
    children: [],
  };

  return {
    success: true,
    bundleId,
    rootElement: emptyRoot,
    stats: {
      totalElements: 1,
      interactableElements: 0,
      identifiedElements: 1,
      labeledElements: 1,
      buttons: 0,
      textFields: 0,
      textElements: 0,
      images: 0,
      scrollViews: 0,
      tables: 0,
      alerts: 0,
      warnings: [{
        type: 'minimal_inspection',
        elementType: 'application',
        description: 'UI hierarchy could not be fully inspected. Consider using XCUITest runner.',
        suggestedFix: 'Ensure the app is running and Xcode 15+ is installed.',
      }],
    },
    timestamp,
  };
}

// =============================================================================
// Parsing Functions
// =============================================================================

/**
 * Parse JSON hierarchy from simctl ui describe
 */
function parseJsonHierarchy(
  json: unknown,
  includeHidden: boolean,
  includeFrames: boolean
): ElementNode {
  if (!json || typeof json !== 'object') {
    return createEmptyRootElement();
  }

  const obj = json as Record<string, unknown>;

  // Extract frame
  const frame = extractFrame(obj);

  // Skip hidden elements if configured
  if (!includeHidden && frame.width === 0 && frame.height === 0) {
    return createEmptyRootElement();
  }

  const element: ElementNode = {
    type: extractString(obj, 'type') || extractString(obj, 'elementType') || 'other',
    identifier: extractString(obj, 'identifier') || extractString(obj, 'accessibilityIdentifier'),
    label: extractString(obj, 'label') || extractString(obj, 'accessibilityLabel'),
    value: extractString(obj, 'value') || extractString(obj, 'accessibilityValue'),
    placeholderValue: extractString(obj, 'placeholderValue'),
    hint: extractString(obj, 'hint') || extractString(obj, 'accessibilityHint'),
    title: extractString(obj, 'title'),
    frame: includeFrames ? frame : { x: 0, y: 0, width: 0, height: 0 },
    isEnabled: extractBoolean(obj, 'enabled', true) && extractBoolean(obj, 'isEnabled', true),
    isSelected: extractBoolean(obj, 'selected', false) || extractBoolean(obj, 'isSelected', false),
    isFocused: extractBoolean(obj, 'focused', false) || extractBoolean(obj, 'isFocused', false),
    exists: true,
    isHittable: extractBoolean(obj, 'hittable', true) && extractBoolean(obj, 'isHittable', true),
    isVisible: frame.width > 0 && frame.height > 0,
    traits: extractTraits(obj),
    children: [],
  };

  // Add suggested action and best target
  element.suggestedAction = suggestAction(element);
  element.bestTargetId = getBestTargetId(element);

  // Parse children recursively
  const children = obj['children'] || obj['elements'] || obj['subviews'];
  if (Array.isArray(children)) {
    element.children = children
      .map((child) => parseJsonHierarchy(child, includeHidden, includeFrames))
      .filter((child) => child.type !== 'other' || child.children.length > 0);
  }

  return element;
}

/**
 * Parse text-based accessibility description
 */
function parseTextHierarchy(text: string, includeFrames: boolean): ElementNode {
  const lines = text.split('\n').filter((line) => line.trim());

  if (lines.length === 0) {
    return createEmptyRootElement();
  }

  const root = createEmptyRootElement();
  const stack: { element: ElementNode; indent: number }[] = [{ element: root, indent: -1 }];

  for (const line of lines) {
    const indent = line.search(/\S/);
    const content = line.trim();

    if (!content) continue;

    const element = parseTextElement(content, includeFrames);

    // Find parent based on indentation
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1].element;
    parent.children.push(element);
    stack.push({ element, indent });
  }

  return root;
}

/**
 * Parse a single text line into an ElementNode
 */
function parseTextElement(text: string, includeFrames: boolean): ElementNode {
  const element: ElementNode = {
    type: 'other',
    frame: { x: 0, y: 0, width: 0, height: 0 },
    isEnabled: true,
    isSelected: false,
    isFocused: false,
    exists: true,
    isHittable: true,
    isVisible: true,
    traits: [],
    children: [],
  };

  // Extract element type
  const typeMatch = text.match(/^(\w+)(?:,|:|<|$)/);
  if (typeMatch) {
    element.type = typeMatch[1].toLowerCase();
  }

  // Extract XCUIElementType format
  const xcuiMatch = text.match(/XCUIElementType\.(\w+)/i);
  if (xcuiMatch) {
    element.type = xcuiMatch[1].toLowerCase();
  }

  // Extract identifier
  const idMatch = text.match(/identifier:\s*['"]([^'"]+)['"]/i);
  if (idMatch) {
    element.identifier = idMatch[1];
  }

  // Extract label
  const labelMatch = text.match(/label:\s*['"]([^'"]+)['"]/i);
  if (labelMatch) {
    element.label = labelMatch[1];
  }

  // Extract value
  const valueMatch = text.match(/value:\s*['"]([^'"]+)['"]/i);
  if (valueMatch) {
    element.value = valueMatch[1];
  }

  // Extract frame if present and requested
  if (includeFrames) {
    const frameMatch = text.match(/\{\{(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)\},\s*\{(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)\}\}/);
    if (frameMatch) {
      element.frame = {
        x: parseFloat(frameMatch[1]),
        y: parseFloat(frameMatch[2]),
        width: parseFloat(frameMatch[3]),
        height: parseFloat(frameMatch[4]),
      };
      element.isVisible = element.frame.width > 0 && element.frame.height > 0;
    }
  }

  // Check enabled state
  if (text.includes('disabled') || text.includes('enabled: false') || text.includes('isEnabled: false')) {
    element.isEnabled = false;
  }

  // Check visibility
  if (text.includes('hidden') || text.includes('visible: false') || text.includes('isVisible: false')) {
    element.isVisible = false;
  }

  // Add suggested action and best target
  element.suggestedAction = suggestAction(element);
  element.bestTargetId = getBestTargetId(element);

  return element;
}

// =============================================================================
// Helper Functions
// =============================================================================

function createEmptyRootElement(): ElementNode {
  return {
    type: 'application',
    label: 'Root',
    frame: { x: 0, y: 0, width: 0, height: 0 },
    isEnabled: true,
    isSelected: false,
    isFocused: false,
    exists: true,
    isHittable: false,
    isVisible: true,
    traits: [],
    children: [],
  };
}

function extractString(obj: Record<string, unknown>, key: string): string | undefined {
  const value = obj[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function extractBoolean(obj: Record<string, unknown>, key: string, defaultValue: boolean): boolean {
  const value = obj[key];
  return typeof value === 'boolean' ? value : defaultValue;
}

function extractFrame(obj: Record<string, unknown>): ElementFrame {
  const frame = obj['frame'] || obj['rect'] || obj['bounds'];

  if (frame && typeof frame === 'object') {
    const f = frame as Record<string, unknown>;
    return {
      x: Number(f['x'] || f['X'] || 0),
      y: Number(f['y'] || f['Y'] || 0),
      width: Number(f['width'] || f['Width'] || 0),
      height: Number(f['height'] || f['Height'] || 0),
    };
  }

  return { x: 0, y: 0, width: 0, height: 0 };
}

function extractTraits(obj: Record<string, unknown>): string[] {
  const traits = obj['traits'] || obj['accessibilityTraits'];

  if (Array.isArray(traits)) {
    return traits.map((t) => String(t));
  }

  if (typeof traits === 'string') {
    return traits.split(',').map((t) => t.trim()).filter((t) => t.length > 0);
  }

  return [];
}

/**
 * Suggest an action for an element based on its type
 */
function suggestAction(element: ElementNode): string | undefined {
  if (!element.isEnabled || !element.isHittable) {
    return undefined;
  }

  const type = element.type.toLowerCase();

  switch (type) {
    case 'button':
    case 'link':
    case 'menuitem':
    case 'tab':
    case 'cell':
      return 'tap';
    case 'textfield':
    case 'securetextfield':
    case 'searchfield':
    case 'textview':
      return 'inputText';
    case 'switch':
    case 'toggle':
    case 'checkbox':
      return 'tap (toggle)';
    case 'slider':
      return 'adjustSlider';
    case 'picker':
    case 'pickerwheel':
    case 'datepicker':
      return 'adjustPicker';
    case 'scrollview':
    case 'table':
    case 'collectionview':
      return 'scroll';
    case 'segmentedcontrol':
      return 'tap (segment)';
    case 'stepper':
      return 'tap (increment/decrement)';
    default:
      if (element.traits.includes('button')) {
        return 'tap';
      }
      if (element.traits.includes('adjustable')) {
        return 'adjust';
      }
      return undefined;
  }
}

/**
 * Get the best identifier for targeting an element
 */
function getBestTargetId(element: ElementNode): string | undefined {
  // Prefer identifier (most stable)
  if (element.identifier && element.identifier.length > 0) {
    return `id:${element.identifier}`;
  }

  // Then label
  if (element.label && element.label.length > 0) {
    return `label:${element.label}`;
  }

  // Then title
  if (element.title && element.title.length > 0) {
    return `title:${element.title}`;
  }

  // Then value for text elements
  if (element.value && element.value.length > 0) {
    return `text:${element.value}`;
  }

  // Fall back to coordinates if visible
  if (element.isVisible && element.frame.width > 0 && element.frame.height > 0) {
    const centerX = Math.round(element.frame.x + element.frame.width / 2);
    const centerY = Math.round(element.frame.y + element.frame.height / 2);
    return `point:${centerX},${centerY}`;
  }

  return undefined;
}

/**
 * Calculate statistics from element tree
 */
function calculateStats(root: ElementNode): RawInspectorResult['stats'] {
  const stats = {
    totalElements: 0,
    interactableElements: 0,
    identifiedElements: 0,
    labeledElements: 0,
    buttons: 0,
    textFields: 0,
    textElements: 0,
    images: 0,
    scrollViews: 0,
    tables: 0,
    alerts: 0,
    warnings: [] as AccessibilityWarning[],
  };

  function traverse(element: ElementNode) {
    stats.totalElements++;

    if (element.identifier && element.identifier.length > 0) {
      stats.identifiedElements++;
    }

    if (element.label && element.label.length > 0) {
      stats.labeledElements++;
    }

    if (element.isEnabled && element.isHittable) {
      stats.interactableElements++;
    }

    const type = element.type.toLowerCase();

    switch (type) {
      case 'button':
      case 'link':
        stats.buttons++;
        break;
      case 'textfield':
      case 'securetextfield':
      case 'searchfield':
        stats.textFields++;
        break;
      case 'statictext':
      case 'textview':
      case 'text':
        stats.textElements++;
        break;
      case 'image':
      case 'icon':
        stats.images++;
        break;
      case 'scrollview':
        stats.scrollViews++;
        break;
      case 'table':
      case 'collectionview':
        stats.tables++;
        break;
      case 'alert':
        stats.alerts++;
        break;
    }

    // Check for accessibility issues
    if (isInteractableType(type) && element.isEnabled) {
      if (!element.identifier || element.identifier.length === 0) {
        stats.warnings.push({
          type: 'missing_identifier',
          elementType: element.type,
          description: `Interactive ${element.type} without accessibility identifier`,
          frame: element.frame,
          suggestedFix: 'Add accessibilityIdentifier to this element',
        });
      }

      if (type === 'button' && (!element.label || element.label.length === 0)) {
        stats.warnings.push({
          type: 'missing_label',
          elementType: element.type,
          description: 'Button without accessibility label',
          frame: element.frame,
          suggestedFix: 'Add accessibilityLabel for VoiceOver users',
        });
      }
    }

    for (const child of element.children) {
      traverse(child);
    }
  }

  traverse(root);

  return stats;
}

/**
 * Check if an element type is typically interactable
 */
function isInteractableType(type: string): boolean {
  const interactableTypes = [
    'button', 'link', 'textfield', 'securetextfield', 'searchfield',
    'switch', 'toggle', 'slider', 'stepper', 'picker', 'datepicker',
    'segmentedcontrol', 'menuitem', 'tab', 'cell',
  ];
  return interactableTypes.includes(type.toLowerCase());
}

// =============================================================================
// Loading State Detection
// =============================================================================

/**
 * Loading indicator element types and patterns
 */
const LOADING_INDICATOR_TYPES = [
  'activityindicator',
  'progressindicator',
  'progressview',
  'progressbar',
  'spinner',
];

const LOADING_INDICATOR_LABELS = [
  'loading',
  'please wait',
  'spinner',
  'progress',
];

/**
 * Check if the element tree contains loading indicators.
 * Used to detect if the app is in a loading state.
 */
function checkForLoadingIndicators(root: ElementNode): boolean {
  let hasLoadingIndicator = false;

  function checkElement(element: ElementNode): void {
    if (hasLoadingIndicator) return; // Early exit if found

    const type = element.type.toLowerCase();
    const label = (element.label || '').toLowerCase();
    const identifier = (element.identifier || '').toLowerCase();

    // Check element type
    if (LOADING_INDICATOR_TYPES.some((t) => type.includes(t))) {
      hasLoadingIndicator = true;
      return;
    }

    // Check label and identifier for loading patterns
    if (LOADING_INDICATOR_LABELS.some((l) => label.includes(l) || identifier.includes(l))) {
      hasLoadingIndicator = true;
      return;
    }

    // Recurse into children
    for (const child of element.children) {
      checkElement(child);
      if (hasLoadingIndicator) return;
    }
  }

  checkElement(root);
  return hasLoadingIndicator;
}

// =============================================================================
// Exports
// =============================================================================

export {
  OUTPUT_START_MARKER,
  OUTPUT_END_MARKER,
};
