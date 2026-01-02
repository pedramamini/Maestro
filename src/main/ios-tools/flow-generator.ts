/**
 * iOS Tools - Maestro Flow Generator
 *
 * Generates Maestro YAML flow files from structured step definitions.
 * Supports common actions: tap, inputText, scroll, screenshot, and more.
 * https://maestro.mobile.dev/reference/yaml-syntax
 */

import { writeFile, mkdir } from 'fs/promises';
import * as path from 'path';
import { logger } from '../utils/logger';
import { IOSResult } from './types';

const LOG_CONTEXT = '[iOS-FlowGenerator]';

// =============================================================================
// Types
// =============================================================================

/**
 * Base interface for all flow steps
 */
export interface FlowStepBase {
  /** Optional description/comment for this step */
  description?: string;
  /** Optional label for referencing in conditions */
  label?: string;
}

/**
 * Tap action - tap on an element
 */
export interface TapStep extends FlowStepBase {
  action: 'tap';
  /** Element identifier (accessibility id) */
  id?: string;
  /** Element text content */
  text?: string;
  /** Point coordinates */
  point?: { x: number; y: number };
  /** Tap within element containing text */
  containsText?: string;
  /** Number of taps (1=single, 2=double) */
  tapCount?: number;
  /** Wait for element to appear (default: true) */
  wait?: boolean;
  /** Index when multiple matches (0-based) */
  index?: number;
}

/**
 * Input text action - type text into a field
 */
export interface InputTextStep extends FlowStepBase {
  action: 'inputText';
  /** Text to input */
  text: string;
  /** Target element id (optional - uses focused element) */
  id?: string;
  /** Clear existing text before input */
  clearBefore?: boolean;
}

/**
 * Scroll action - scroll the screen
 */
export interface ScrollStep extends FlowStepBase {
  action: 'scroll';
  /** Scroll direction */
  direction: 'up' | 'down' | 'left' | 'right';
  /** Distance in pixels (optional) */
  distance?: number;
  /** Scroll within specific element */
  id?: string;
  /** Scroll until element with text is visible */
  untilVisible?: string;
}

/**
 * Screenshot action - take a screenshot
 */
export interface ScreenshotStep extends FlowStepBase {
  action: 'screenshot';
  /** Optional filename (without extension) */
  filename?: string;
}

/**
 * Assert visible action - verify element is visible
 */
export interface AssertVisibleStep extends FlowStepBase {
  action: 'assertVisible';
  /** Element identifier */
  id?: string;
  /** Element text content */
  text?: string;
  /** Contains text (partial match) */
  containsText?: string;
  /** Timeout in milliseconds */
  timeout?: number;
}

/**
 * Assert not visible action - verify element is not visible
 */
export interface AssertNotVisibleStep extends FlowStepBase {
  action: 'assertNotVisible';
  /** Element identifier */
  id?: string;
  /** Element text content */
  text?: string;
  /** Contains text (partial match) */
  containsText?: string;
}

/**
 * Wait for element action
 */
export interface WaitForStep extends FlowStepBase {
  action: 'waitFor';
  /** Element identifier */
  id?: string;
  /** Element text content */
  text?: string;
  /** Contains text (partial match) */
  containsText?: string;
  /** Timeout in milliseconds */
  timeout?: number;
}

/**
 * Swipe action
 */
export interface SwipeStep extends FlowStepBase {
  action: 'swipe';
  /** Start point */
  start: { x: number | string; y: number | string };
  /** End point */
  end: { x: number | string; y: number | string };
  /** Duration in milliseconds */
  duration?: number;
}

/**
 * Launch app action
 */
export interface LaunchAppStep extends FlowStepBase {
  action: 'launchApp';
  /** Bundle ID (optional - uses appId from flow config) */
  bundleId?: string;
  /** Clear app state before launch */
  clearState?: boolean;
  /** Clear keychain */
  clearKeychain?: boolean;
  /** Stop the app if running */
  stopApp?: boolean;
}

/**
 * Stop app action
 */
export interface StopAppStep extends FlowStepBase {
  action: 'stopApp';
  /** Bundle ID (optional - uses appId from flow config) */
  bundleId?: string;
}

/**
 * Open link action
 */
export interface OpenLinkStep extends FlowStepBase {
  action: 'openLink';
  /** URL to open */
  url: string;
}

/**
 * Press key action
 */
export interface PressKeyStep extends FlowStepBase {
  action: 'pressKey';
  /** Key to press */
  key: 'home' | 'back' | 'volume_up' | 'volume_down' | 'enter' | 'backspace';
}

/**
 * Hide keyboard action
 */
export interface HideKeyboardStep extends FlowStepBase {
  action: 'hideKeyboard';
}

/**
 * Erase text action
 */
export interface EraseTextStep extends FlowStepBase {
  action: 'eraseText';
  /** Number of characters to erase (optional - clears all) */
  characters?: number;
}

/**
 * Wait action - pause execution
 */
export interface WaitStep extends FlowStepBase {
  action: 'wait';
  /** Duration in milliseconds */
  duration: number;
}

/**
 * Copy text from element
 */
export interface CopyTextStep extends FlowStepBase {
  action: 'copyTextFrom';
  /** Element identifier */
  id?: string;
  /** Element text */
  text?: string;
}

/**
 * Union of all step types
 */
export type FlowStep =
  | TapStep
  | InputTextStep
  | ScrollStep
  | ScreenshotStep
  | AssertVisibleStep
  | AssertNotVisibleStep
  | WaitForStep
  | SwipeStep
  | LaunchAppStep
  | StopAppStep
  | OpenLinkStep
  | PressKeyStep
  | HideKeyboardStep
  | EraseTextStep
  | WaitStep
  | CopyTextStep;

/**
 * Flow configuration
 */
export interface FlowConfig {
  /** App bundle ID */
  appId?: string;
  /** Flow name/description */
  name?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Tags for filtering */
  tags?: string[];
}

/**
 * Complete flow definition
 */
export interface FlowDefinition {
  /** Flow configuration */
  config?: FlowConfig;
  /** Steps to execute */
  steps: FlowStep[];
}

/**
 * Generated flow result
 */
export interface GeneratedFlow {
  /** YAML content */
  yaml: string;
  /** Path to saved file (if saved) */
  path?: string;
  /** Number of steps in the flow */
  stepCount: number;
}

// =============================================================================
// Flow Generation
// =============================================================================

/**
 * Convert a flow step to Maestro YAML format.
 *
 * @param step - The step to convert
 * @returns YAML string for the step
 */
function stepToYaml(step: FlowStep): string {
  const lines: string[] = [];

  // Add description as comment if present
  if (step.description) {
    lines.push(`# ${step.description}`);
  }

  switch (step.action) {
    case 'tap':
      lines.push(formatTapStep(step));
      break;

    case 'inputText':
      lines.push(formatInputTextStep(step));
      break;

    case 'scroll':
      lines.push(formatScrollStep(step));
      break;

    case 'screenshot':
      lines.push(formatScreenshotStep(step));
      break;

    case 'assertVisible':
      lines.push(formatAssertVisibleStep(step));
      break;

    case 'assertNotVisible':
      lines.push(formatAssertNotVisibleStep(step));
      break;

    case 'waitFor':
      lines.push(formatWaitForStep(step));
      break;

    case 'swipe':
      lines.push(formatSwipeStep(step));
      break;

    case 'launchApp':
      lines.push(formatLaunchAppStep(step));
      break;

    case 'stopApp':
      lines.push(formatStopAppStep(step));
      break;

    case 'openLink':
      lines.push(`- openLink: "${step.url}"`);
      break;

    case 'pressKey':
      lines.push(`- pressKey: ${step.key}`);
      break;

    case 'hideKeyboard':
      lines.push('- hideKeyboard');
      break;

    case 'eraseText':
      if (step.characters !== undefined) {
        lines.push(`- eraseText: ${step.characters}`);
      } else {
        lines.push('- eraseText');
      }
      break;

    case 'wait':
      lines.push(`- wait: ${step.duration}`);
      break;

    case 'copyTextFrom':
      lines.push(formatCopyTextStep(step));
      break;
  }

  return lines.join('\n');
}

/**
 * Format tap step to YAML
 */
function formatTapStep(step: TapStep): string {
  // Simple tap by text
  if (step.text && !step.id && !step.point && !step.containsText) {
    if (step.index !== undefined) {
      return `- tapOn:\n    text: "${escapeYamlString(step.text)}"\n    index: ${step.index}`;
    }
    return `- tapOn: "${escapeYamlString(step.text)}"`;
  }

  // Simple tap by id
  if (step.id && !step.text && !step.point && !step.containsText) {
    if (step.index !== undefined) {
      return `- tapOn:\n    id: "${step.id}"\n    index: ${step.index}`;
    }
    return `- tapOn:\n    id: "${step.id}"`;
  }

  // Tap by point
  if (step.point) {
    return `- tapOn:\n    point: "${step.point.x},${step.point.y}"`;
  }

  // Complex tap with multiple selectors
  const tapLines: string[] = ['- tapOn:'];
  if (step.id) tapLines.push(`    id: "${step.id}"`);
  if (step.text) tapLines.push(`    text: "${escapeYamlString(step.text)}"`);
  if (step.containsText) tapLines.push(`    containsText: "${escapeYamlString(step.containsText)}"`);
  if (step.index !== undefined) tapLines.push(`    index: ${step.index}`);
  if (step.wait === false) tapLines.push('    waitToSettle: false');

  return tapLines.join('\n');
}

/**
 * Format inputText step to YAML
 */
function formatInputTextStep(step: InputTextStep): string {
  if (step.id) {
    const lines = [`- tapOn:\n    id: "${step.id}"`];
    if (step.clearBefore) {
      lines.push('- eraseText');
    }
    lines.push(`- inputText: "${escapeYamlString(step.text)}"`);
    return lines.join('\n');
  }

  if (step.clearBefore) {
    return `- eraseText\n- inputText: "${escapeYamlString(step.text)}"`;
  }

  return `- inputText: "${escapeYamlString(step.text)}"`;
}

/**
 * Format scroll step to YAML
 */
function formatScrollStep(step: ScrollStep): string {
  // Scroll until visible
  if (step.untilVisible) {
    return `- scrollUntilVisible:\n    element:\n      text: "${escapeYamlString(step.untilVisible)}"\n    direction: ${step.direction.toUpperCase()}`;
  }

  // Simple scroll
  if (step.id) {
    return `- scroll:\n    elementId: "${step.id}"\n    direction: ${step.direction.toUpperCase()}`;
  }

  return `- scroll:\n    direction: ${step.direction.toUpperCase()}`;
}

/**
 * Format screenshot step to YAML
 */
function formatScreenshotStep(step: ScreenshotStep): string {
  if (step.filename) {
    return `- takeScreenshot: "${step.filename}"`;
  }
  return '- takeScreenshot';
}

/**
 * Format assertVisible step to YAML
 */
function formatAssertVisibleStep(step: AssertVisibleStep): string {
  if (step.text && !step.id && !step.containsText) {
    return `- assertVisible: "${escapeYamlString(step.text)}"`;
  }

  if (step.id && !step.text && !step.containsText) {
    return `- assertVisible:\n    id: "${step.id}"`;
  }

  const lines: string[] = ['- assertVisible:'];
  if (step.id) lines.push(`    id: "${step.id}"`);
  if (step.text) lines.push(`    text: "${escapeYamlString(step.text)}"`);
  if (step.containsText) lines.push(`    containsText: "${escapeYamlString(step.containsText)}"`);
  if (step.timeout !== undefined) lines.push(`    timeout: ${step.timeout}`);

  return lines.join('\n');
}

/**
 * Format assertNotVisible step to YAML
 */
function formatAssertNotVisibleStep(step: AssertNotVisibleStep): string {
  if (step.text && !step.id && !step.containsText) {
    return `- assertNotVisible: "${escapeYamlString(step.text)}"`;
  }

  if (step.id && !step.text && !step.containsText) {
    return `- assertNotVisible:\n    id: "${step.id}"`;
  }

  const lines: string[] = ['- assertNotVisible:'];
  if (step.id) lines.push(`    id: "${step.id}"`);
  if (step.text) lines.push(`    text: "${escapeYamlString(step.text)}"`);
  if (step.containsText) lines.push(`    containsText: "${escapeYamlString(step.containsText)}"`);

  return lines.join('\n');
}

/**
 * Format waitFor step to YAML
 */
function formatWaitForStep(step: WaitForStep): string {
  if (step.text && !step.id && !step.containsText && step.timeout === undefined) {
    return `- waitForAnimationToEnd:\n    timeout: ${step.timeout || 5000}\n- assertVisible: "${escapeYamlString(step.text)}"`;
  }

  const lines: string[] = ['- extendedWaitUntil:'];
  lines.push('    visible:');
  if (step.id) lines.push(`      id: "${step.id}"`);
  if (step.text) lines.push(`      text: "${escapeYamlString(step.text)}"`);
  if (step.containsText) lines.push(`      containsText: "${escapeYamlString(step.containsText)}"`);
  if (step.timeout !== undefined) lines.push(`    timeout: ${step.timeout}`);

  return lines.join('\n');
}

/**
 * Format swipe step to YAML
 */
function formatSwipeStep(step: SwipeStep): string {
  const lines: string[] = ['- swipe:'];
  lines.push(`    start: "${step.start.x}, ${step.start.y}"`);
  lines.push(`    end: "${step.end.x}, ${step.end.y}"`);
  if (step.duration !== undefined) {
    lines.push(`    duration: ${step.duration}`);
  }
  return lines.join('\n');
}

/**
 * Format launchApp step to YAML
 */
function formatLaunchAppStep(step: LaunchAppStep): string {
  const hasOptions = step.clearState || step.clearKeychain || step.stopApp;

  if (!hasOptions && !step.bundleId) {
    return '- launchApp';
  }

  const lines: string[] = ['- launchApp:'];
  if (step.bundleId) lines.push(`    appId: "${step.bundleId}"`);
  if (step.clearState) lines.push('    clearState: true');
  if (step.clearKeychain) lines.push('    clearKeychain: true');
  if (step.stopApp) lines.push('    stopApp: true');

  return lines.join('\n');
}

/**
 * Format stopApp step to YAML
 */
function formatStopAppStep(step: StopAppStep): string {
  if (step.bundleId) {
    return `- stopApp: "${step.bundleId}"`;
  }
  return '- stopApp';
}

/**
 * Format copyTextFrom step to YAML
 */
function formatCopyTextStep(step: CopyTextStep): string {
  if (step.id) {
    return `- copyTextFrom:\n    id: "${step.id}"`;
  }
  if (step.text) {
    return `- copyTextFrom: "${escapeYamlString(step.text)}"`;
  }
  return '- copyTextFrom';
}

/**
 * Escape special characters for YAML strings
 */
function escapeYamlString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

/**
 * Generate YAML content from flow definition.
 *
 * @param definition - The flow definition
 * @returns YAML string
 */
function generateYamlContent(definition: FlowDefinition): string {
  const sections: string[] = [];

  // Add configuration section if present
  if (definition.config) {
    const configLines: string[] = [];

    if (definition.config.appId) {
      configLines.push(`appId: ${definition.config.appId}`);
    }

    if (definition.config.name) {
      configLines.push(`name: ${definition.config.name}`);
    }

    if (definition.config.tags && definition.config.tags.length > 0) {
      configLines.push(`tags:`);
      for (const tag of definition.config.tags) {
        configLines.push(`  - ${tag}`);
      }
    }

    if (definition.config.env && Object.keys(definition.config.env).length > 0) {
      configLines.push(`env:`);
      for (const [key, value] of Object.entries(definition.config.env)) {
        configLines.push(`  ${key}: "${escapeYamlString(value)}"`);
      }
    }

    if (configLines.length > 0) {
      sections.push(configLines.join('\n'));
    }
  }

  // Generate steps
  const stepLines: string[] = [];
  for (const step of definition.steps) {
    stepLines.push(stepToYaml(step));
  }
  sections.push(stepLines.join('\n'));

  // Combine with proper spacing
  return sections.join('\n---\n');
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Generate a Maestro flow YAML from step definitions.
 *
 * @param steps - Array of flow steps
 * @param config - Optional flow configuration
 * @returns Generated flow result with YAML content
 */
export function generateFlow(
  steps: FlowStep[],
  config?: FlowConfig
): IOSResult<GeneratedFlow> {
  logger.debug(`${LOG_CONTEXT} Generating flow with ${steps.length} steps`, LOG_CONTEXT);

  if (steps.length === 0) {
    return {
      success: false,
      error: 'No steps provided for flow generation',
      errorCode: 'PARSE_ERROR',
    };
  }

  try {
    const definition: FlowDefinition = {
      config,
      steps,
    };

    const yaml = generateYamlContent(definition);

    logger.info(`${LOG_CONTEXT} Generated flow with ${steps.length} steps`, LOG_CONTEXT);

    return {
      success: true,
      data: {
        yaml,
        stepCount: steps.length,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`${LOG_CONTEXT} Failed to generate flow: ${message}`, LOG_CONTEXT);

    return {
      success: false,
      error: `Failed to generate flow: ${message}`,
      errorCode: 'PARSE_ERROR',
    };
  }
}

/**
 * Generate and save a Maestro flow YAML file.
 *
 * @param steps - Array of flow steps
 * @param outputPath - Path to save the YAML file
 * @param config - Optional flow configuration
 * @returns Generated flow result with file path
 */
export async function generateFlowFile(
  steps: FlowStep[],
  outputPath: string,
  config?: FlowConfig
): Promise<IOSResult<GeneratedFlow>> {
  const generateResult = generateFlow(steps, config);

  if (!generateResult.success) {
    return generateResult;
  }

  const { yaml, stepCount } = generateResult.data!;

  try {
    // Ensure directory exists
    const dir = path.dirname(outputPath);
    await mkdir(dir, { recursive: true });

    // Ensure .yaml extension
    const finalPath = outputPath.endsWith('.yaml') || outputPath.endsWith('.yml')
      ? outputPath
      : `${outputPath}.yaml`;

    // Write file
    await writeFile(finalPath, yaml, 'utf-8');

    logger.info(`${LOG_CONTEXT} Saved flow to: ${finalPath}`, LOG_CONTEXT);

    return {
      success: true,
      data: {
        yaml,
        path: finalPath,
        stepCount,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`${LOG_CONTEXT} Failed to save flow: ${message}`, LOG_CONTEXT);

    return {
      success: false,
      error: `Failed to save flow file: ${message}`,
      errorCode: 'COMMAND_FAILED',
    };
  }
}

/**
 * Helper to create a tap step
 */
export function tap(options: Omit<TapStep, 'action'>): TapStep {
  return { action: 'tap', ...options };
}

/**
 * Helper to create an inputText step
 */
export function inputText(text: string, options?: Omit<InputTextStep, 'action' | 'text'>): InputTextStep {
  return { action: 'inputText', text, ...options };
}

/**
 * Helper to create a scroll step
 */
export function scroll(direction: ScrollStep['direction'], options?: Omit<ScrollStep, 'action' | 'direction'>): ScrollStep {
  return { action: 'scroll', direction, ...options };
}

/**
 * Helper to create a screenshot step for flow generation.
 * Named with "Step" suffix to avoid conflict with capture.screenshot.
 */
export function screenshotStep(filename?: string): ScreenshotStep {
  return { action: 'screenshot', filename };
}

/**
 * Helper to create an assertVisible step
 */
export function assertVisible(options: Omit<AssertVisibleStep, 'action'>): AssertVisibleStep {
  return { action: 'assertVisible', ...options };
}

/**
 * Helper to create an assertNotVisible step
 */
export function assertNotVisible(options: Omit<AssertNotVisibleStep, 'action'>): AssertNotVisibleStep {
  return { action: 'assertNotVisible', ...options };
}

/**
 * Helper to create a waitFor step for flow generation.
 * Named with "Step" suffix to avoid conflict with utils.waitFor.
 */
export function waitForStep(options: Omit<WaitForStep, 'action'>): WaitForStep {
  return { action: 'waitFor', ...options };
}

/**
 * Helper to create a swipe step
 */
export function swipe(
  start: SwipeStep['start'],
  end: SwipeStep['end'],
  options?: Omit<SwipeStep, 'action' | 'start' | 'end'>
): SwipeStep {
  return { action: 'swipe', start, end, ...options };
}

/**
 * Helper to create a launchApp step for flow generation.
 * Named with "Step" suffix to avoid conflict with simulator.launchApp.
 */
export function launchAppStep(options?: Omit<LaunchAppStep, 'action'>): LaunchAppStep {
  return { action: 'launchApp', ...options };
}

/**
 * Helper to create a stopApp step
 */
export function stopApp(bundleId?: string): StopAppStep {
  return { action: 'stopApp', bundleId };
}

/**
 * Helper to create an openLink step
 */
export function openLink(url: string): OpenLinkStep {
  return { action: 'openLink', url };
}

/**
 * Helper to create a pressKey step
 */
export function pressKey(key: PressKeyStep['key']): PressKeyStep {
  return { action: 'pressKey', key };
}

/**
 * Helper to create a hideKeyboard step
 */
export function hideKeyboard(): HideKeyboardStep {
  return { action: 'hideKeyboard' };
}

/**
 * Helper to create an eraseText step
 */
export function eraseText(characters?: number): EraseTextStep {
  return { action: 'eraseText', characters };
}

/**
 * Helper to create a wait step
 */
export function wait(duration: number): WaitStep {
  return { action: 'wait', duration };
}

/**
 * Helper to create a copyTextFrom step
 */
export function copyTextFrom(options: Omit<CopyTextStep, 'action'>): CopyTextStep {
  return { action: 'copyTextFrom', ...options };
}

/**
 * Parse a simple action string into a FlowStep.
 * Supports shorthand like "tap:Login" or "type:hello@example.com"
 *
 * @param actionString - Action string in format "action:target"
 * @returns Parsed FlowStep or null if invalid
 */
export function parseActionString(actionString: string): FlowStep | null {
  const colonIndex = actionString.indexOf(':');

  if (colonIndex === -1) {
    // Simple action without argument
    switch (actionString.toLowerCase()) {
      case 'screenshot':
        return screenshotStep();
      case 'hidekeyboard':
        return hideKeyboard();
      case 'launchapp':
        return launchAppStep();
      case 'stopapp':
        return stopApp();
      case 'erasetext':
        return eraseText();
      default:
        return null;
    }
  }

  const action = actionString.slice(0, colonIndex).toLowerCase();
  const arg = actionString.slice(colonIndex + 1);

  switch (action) {
    case 'tap':
      return tap({ text: arg });
    case 'tapid':
      return tap({ id: arg });
    case 'type':
    case 'input':
    case 'inputtext':
      return inputText(arg);
    case 'scroll':
      if (['up', 'down', 'left', 'right'].includes(arg.toLowerCase())) {
        return scroll(arg.toLowerCase() as ScrollStep['direction']);
      }
      return null;
    case 'screenshot':
      return screenshotStep(arg);
    case 'assertvisible':
    case 'visible':
      return assertVisible({ text: arg });
    case 'assertnotvisible':
    case 'notvisible':
      return assertNotVisible({ text: arg });
    case 'waitfor':
    case 'wait':
      // If arg is a number, it's a wait duration
      const num = parseInt(arg, 10);
      if (!isNaN(num)) {
        return wait(num);
      }
      return waitForStep({ text: arg });
    case 'openlink':
    case 'open':
      return openLink(arg);
    case 'presskey':
    case 'press':
      if (['home', 'back', 'volume_up', 'volume_down', 'enter', 'backspace'].includes(arg.toLowerCase())) {
        return pressKey(arg.toLowerCase() as PressKeyStep['key']);
      }
      return null;
    case 'launchapp':
      return launchAppStep({ bundleId: arg });
    case 'stopapp':
      return stopApp(arg);
    default:
      return null;
  }
}

/**
 * Generate flow from simple action strings.
 *
 * @param actions - Array of action strings (e.g., ["tap:Login", "type:password123"])
 * @param config - Optional flow configuration
 * @returns Generated flow result
 */
export function generateFlowFromStrings(
  actions: string[],
  config?: FlowConfig
): IOSResult<GeneratedFlow> {
  const steps: FlowStep[] = [];
  const errors: string[] = [];

  for (let i = 0; i < actions.length; i++) {
    const step = parseActionString(actions[i]);
    if (step) {
      steps.push(step);
    } else {
      errors.push(`Invalid action at index ${i}: ${actions[i]}`);
    }
  }

  if (errors.length > 0) {
    return {
      success: false,
      error: `Failed to parse actions: ${errors.join('; ')}`,
      errorCode: 'PARSE_ERROR',
    };
  }

  return generateFlow(steps, config);
}
