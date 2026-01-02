/**
 * iOS Playbook Runner
 *
 * Generic execution engine for iOS playbooks.
 * Handles step execution, variable resolution, loops, conditions, and artifact collection.
 */

import * as path from 'path';
import { mkdir, writeFile } from 'fs/promises';
import { IOSResult, IOSErrorCode } from './types';
import {
  loadPlaybook,
  IOSPlaybookConfig,
  PlaybookStepDef,
  PlaybookInputDef,
  PlaybookVariables,
} from './playbook-loader';
import { getArtifactDirectory } from './artifacts';
import { logger } from '../utils/logger';

const LOG_CONTEXT = '[iOS-PlaybookRunner]';

// =============================================================================
// Types
// =============================================================================

/**
 * Action handler function signature
 */
export type ActionHandler = (
  context: ExecutionContext,
  inputs: Record<string, unknown>,
  stepDef: PlaybookStepDef
) => Promise<IOSResult<unknown>>;

/**
 * Registry of available action handlers
 */
export interface ActionRegistry {
  [actionName: string]: ActionHandler;
}

/**
 * Options for running a playbook
 */
export interface RunPlaybookOptions {
  /** Playbook name or path to playbook YAML */
  playbook: string;
  /** Input values for the playbook */
  inputs: Record<string, unknown>;
  /** Session ID for artifact storage */
  sessionId: string;
  /** Working directory for relative paths */
  cwd?: string;
  /** Base directory for playbooks (default: ~/.maestro/playbooks/iOS) */
  playbooksDir?: string;
  /** Custom action handlers */
  customActions?: ActionRegistry;
  /** Progress callback */
  onProgress?: (update: PlaybookProgress) => void;
  /** Step execution callback (for debugging) */
  onStep?: (step: StepExecutionEvent) => void;
  /** Dry run - validate without executing */
  dryRun?: boolean;
  /** Maximum step execution time in ms (default: 300000 = 5 min) */
  stepTimeout?: number;
  /** Continue execution on step failure (default: false) */
  continueOnError?: boolean;
}

/**
 * Progress update during playbook execution
 */
export interface PlaybookProgress {
  /** Current execution phase */
  phase: 'initializing' | 'validating' | 'executing' | 'complete' | 'failed';
  /** Current step index (0-based) */
  stepIndex: number;
  /** Total steps */
  totalSteps: number;
  /** Current step name */
  stepName?: string;
  /** Human-readable message */
  message: string;
  /** Percentage complete (0-100) */
  percentComplete: number;
  /** Time elapsed in ms */
  elapsed?: number;
  /** Loop information (if in a loop) */
  loop?: {
    /** Loop variable name */
    as: string;
    /** Current loop index (0-based) */
    index: number;
    /** Total loop items */
    total: number;
  };
}

/**
 * Step execution event for debugging
 */
export interface StepExecutionEvent {
  /** Step definition */
  step: PlaybookStepDef;
  /** Step index */
  index: number;
  /** Event type */
  type: 'start' | 'complete' | 'skip' | 'error';
  /** Resolved inputs (after variable substitution) */
  resolvedInputs?: Record<string, unknown>;
  /** Step result (for complete event) */
  result?: unknown;
  /** Error message (for error event) */
  error?: string;
  /** Why the step was skipped (for skip event) */
  skipReason?: string;
  /** Duration in ms (for complete event) */
  duration?: number;
}

/**
 * Execution context maintained during playbook execution
 */
export interface ExecutionContext {
  /** Playbook configuration */
  playbook: IOSPlaybookConfig;
  /** User-provided inputs */
  inputs: Record<string, unknown>;
  /** Current variables */
  variables: PlaybookVariables;
  /** Step outputs (keyed by store_as name) */
  outputs: Record<string, unknown>;
  /** Collected data (for loops with collection) */
  collected: Record<string, unknown[]>;
  /** Session ID */
  sessionId: string;
  /** Artifacts directory */
  artifactsDir: string;
  /** Working directory */
  cwd: string;
  /** Action registry */
  actions: ActionRegistry;
  /** Progress callback */
  onProgress?: (update: PlaybookProgress) => void;
  /** Step callback */
  onStep?: (event: StepExecutionEvent) => void;
  /** Dry run mode */
  dryRun: boolean;
  /** Step timeout */
  stepTimeout: number;
  /** Continue on error */
  continueOnError: boolean;
  /** Loop context stack (for nested loops) */
  loopStack: LoopContext[];
  /** Start time */
  startTime: Date;
  /** Current step index */
  currentStepIndex: number;
  /** Total steps (including nested) */
  totalSteps: number;
}

/**
 * Loop context for tracking nested loops
 */
export interface LoopContext {
  /** Loop variable name (from 'as' field) */
  as: string;
  /** Current item */
  item: unknown;
  /** Current index (0-based) */
  index: number;
  /** Total items */
  total: number;
  /** Start time of loop iteration */
  startTime: Date;
}

/**
 * Result of running a playbook
 */
export interface PlaybookRunResult {
  /** Whether the playbook completed successfully */
  passed: boolean;
  /** Playbook that was run */
  playbook: {
    name: string;
    version?: string;
    path?: string;
  };
  /** Total steps executed */
  stepsExecuted: number;
  /** Steps that passed */
  stepsPassed: number;
  /** Steps that failed */
  stepsFailed: number;
  /** Steps that were skipped */
  stepsSkipped: number;
  /** Total duration in ms */
  totalDuration: number;
  /** Start timestamp */
  startTime: Date;
  /** End timestamp */
  endTime: Date;
  /** Step execution results */
  stepResults: StepResult[];
  /** Final variables */
  finalVariables: PlaybookVariables;
  /** Final outputs */
  finalOutputs: Record<string, unknown>;
  /** Artifacts directory */
  artifactsDir: string;
  /** Error message (if failed) */
  error?: string;
  /** Collected data from loops */
  collected: Record<string, unknown[]>;
}

/**
 * Result of a single step execution
 */
export interface StepResult {
  /** Step name */
  name: string;
  /** Step action */
  action?: string;
  /** Whether the step succeeded */
  success: boolean;
  /** Step result data */
  result?: unknown;
  /** Error message (if failed) */
  error?: string;
  /** Duration in ms */
  duration: number;
  /** Whether the step was skipped */
  skipped: boolean;
  /** Skip reason */
  skipReason?: string;
  /** Loop context (if in a loop) */
  loopContext?: {
    as: string;
    index: number;
    total: number;
  };
}

// =============================================================================
// Built-in Actions
// =============================================================================

/**
 * Built-in action registry with placeholder implementations
 */
const builtInActions: ActionRegistry = {
  // Control flow actions
  'complete_loop': async () => {
    logger.debug(`${LOG_CONTEXT} complete_loop action called`);
    return { success: true, data: { action: 'complete_loop' } };
  },
  'exit_loop': async (_context, inputs) => {
    logger.debug(`${LOG_CONTEXT} exit_loop action called: ${inputs.reason || 'No reason'}`);
    return { success: true, data: { action: 'exit_loop', reason: inputs.reason } };
  },
  'increment_iteration': async (context) => {
    const iteration = (context.variables.iteration as number) || 0;
    context.variables.iteration = iteration + 1;
    return { success: true, data: { iteration: context.variables.iteration } };
  },
  'wait': async (context, inputs) => {
    const seconds = (inputs.seconds as number) || 1;
    if (!context.dryRun) {
      await sleep(seconds * 1000);
    }
    return { success: true, data: { waited: seconds } };
  },

  // Reporting actions
  'report_status': async (_context, inputs) => {
    logger.info(`${LOG_CONTEXT} Status: passed=${inputs.passed}, failed=${inputs.failed}`);
    return { success: true, data: { reported: true } };
  },
  'report_build_errors': async () => {
    logger.info(`${LOG_CONTEXT} Build errors reported`);
    return { success: true, data: { reported: true } };
  },

  // Collection actions
  'record_diff': async (context, inputs) => {
    const key = 'diffs';
    if (!context.collected[key]) {
      context.collected[key] = [];
    }
    context.collected[key].push({ flow: inputs.flow, diffs: inputs.diffs });
    return { success: true, data: { recorded: true } };
  },
  'record_crash': async (context, inputs) => {
    const key = 'crashes';
    if (!context.collected[key]) {
      context.collected[key] = [];
    }
    context.collected[key].push(inputs);
    return { success: true, data: { recorded: true } };
  },

  // Report generation actions
  'generate_regression_report': async (_context, inputs) => {
    logger.info(`${LOG_CONTEXT} Generating regression report to ${inputs.output}`);
    return { success: true, data: { path: inputs.output } };
  },
  'generate_crash_report': async () => {
    logger.info(`${LOG_CONTEXT} Generating crash report`);
    return { success: true, data: { generated: true } };
  },
  'generate_design_sheet': async (_context, inputs) => {
    logger.info(`${LOG_CONTEXT} Generating design sheet to ${inputs.output}`);
    return { success: true, data: { path: inputs.output } };
  },
  'generate_performance_report': async () => {
    logger.info(`${LOG_CONTEXT} Generating performance report`);
    return { success: true, data: { generated: true } };
  },

  // Crash hunt actions
  'choose_action': async () => {
    return { success: true, data: { action: 'tap', target: 'random' } };
  },
  'execute_action': async () => {
    return { success: true, data: { executed: true } };
  },
  'check_for_crash': async () => {
    return { success: true, data: { crashed: false } };
  },

  // Performance actions
  'measure_launch_time': async () => {
    return { success: true, data: { launchTime: 0 } };
  },
  'start_measurements': async () => {
    return { success: true, data: { started: true } };
  },
  'stop_measurements': async () => {
    return { success: true, data: { stopped: true } };
  },
};

// =============================================================================
// Main Runner
// =============================================================================

/**
 * Run a playbook by name or path.
 *
 * @param options - Execution options
 * @returns Execution result
 */
export async function runPlaybook(
  options: RunPlaybookOptions
): Promise<IOSResult<PlaybookRunResult>> {
  const startTime = new Date();

  logger.info(`${LOG_CONTEXT} Starting playbook: ${options.playbook}`);

  // Load playbook
  let playbook: IOSPlaybookConfig;
  let playbookPath: string | undefined;

  try {
    playbook = loadPlaybook(options.playbook, options.playbooksDir);
    playbookPath = options.playbook;
    logger.info(`${LOG_CONTEXT} Loaded playbook: ${playbook.name} v${playbook.version || '1.0.0'}`);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    logger.error(`${LOG_CONTEXT} Failed to load playbook: ${error}`);
    return {
      success: false,
      error: `Failed to load playbook: ${error}`,
      errorCode: 'COMMAND_FAILED' as IOSErrorCode,
    };
  }

  // Validate inputs
  const validationResult = validateInputs(options.inputs, playbook.inputs);
  if (!validationResult.valid) {
    return {
      success: false,
      error: `Invalid inputs: ${validationResult.errors.join(', ')}`,
      errorCode: 'COMMAND_FAILED' as IOSErrorCode,
    };
  }

  // Apply defaults to inputs
  const resolvedInputs = applyInputDefaults(options.inputs, playbook.inputs);

  // Prepare artifacts directory
  const artifactsDir = await getArtifactDirectory(options.sessionId);
  const runDir = path.join(artifactsDir, `playbook-${sanitizeFilename(playbook.name)}-${Date.now()}`);
  await mkdir(runDir, { recursive: true });

  // Build action registry
  const actions: ActionRegistry = {
    ...builtInActions,
    ...options.customActions,
  };

  // Count total steps (including nested)
  const totalSteps = countSteps(playbook.steps);

  // Create execution context
  const context: ExecutionContext = {
    playbook,
    inputs: resolvedInputs,
    variables: { ...playbook.variables },
    outputs: {},
    collected: {},
    sessionId: options.sessionId,
    artifactsDir: runDir,
    cwd: options.cwd || process.cwd(),
    actions,
    onProgress: options.onProgress,
    onStep: options.onStep,
    dryRun: options.dryRun || false,
    stepTimeout: options.stepTimeout || 300000,
    continueOnError: options.continueOnError || false,
    loopStack: [],
    startTime,
    currentStepIndex: 0,
    totalSteps,
  };

  // Report initialization
  reportProgress(context, {
    phase: 'initializing',
    stepIndex: 0,
    totalSteps,
    message: `Initializing playbook: ${playbook.name}`,
    percentComplete: 0,
  });

  // Dry run check
  if (options.dryRun) {
    logger.info(`${LOG_CONTEXT} Dry run - validation complete, not executing`);
    return {
      success: true,
      data: createDryRunResult(playbook, playbookPath, runDir, startTime, context),
    };
  }

  // Execute steps
  const stepResults: StepResult[] = [];
  let passed = true;
  let errorMessage: string | undefined;

  reportProgress(context, {
    phase: 'executing',
    stepIndex: 0,
    totalSteps,
    message: 'Executing playbook steps',
    percentComplete: 5,
  });

  try {
    const result = await executeSteps(context, playbook.steps, stepResults);
    passed = result.success;
    errorMessage = result.error;
  } catch (e) {
    passed = false;
    errorMessage = e instanceof Error ? e.message : String(e);
    logger.error(`${LOG_CONTEXT} Playbook execution error: ${errorMessage}`);
  }

  // Build final result
  const endTime = new Date();
  const totalDuration = endTime.getTime() - startTime.getTime();

  const runResult: PlaybookRunResult = {
    passed,
    playbook: {
      name: playbook.name,
      version: playbook.version,
      path: playbookPath,
    },
    stepsExecuted: stepResults.filter((s) => !s.skipped).length,
    stepsPassed: stepResults.filter((s) => s.success && !s.skipped).length,
    stepsFailed: stepResults.filter((s) => !s.success && !s.skipped).length,
    stepsSkipped: stepResults.filter((s) => s.skipped).length,
    totalDuration,
    startTime,
    endTime,
    stepResults,
    finalVariables: context.variables,
    finalOutputs: context.outputs,
    artifactsDir: runDir,
    error: errorMessage,
    collected: context.collected,
  };

  // Write result to artifacts
  await writePlaybookResult(runDir, runResult);

  // Final progress report
  reportProgress(context, {
    phase: passed ? 'complete' : 'failed',
    stepIndex: totalSteps,
    totalSteps,
    message: passed
      ? `Playbook completed successfully in ${formatDuration(totalDuration)}`
      : `Playbook failed: ${errorMessage || 'See step results'}`,
    percentComplete: 100,
    elapsed: totalDuration,
  });

  logger.info(
    `${LOG_CONTEXT} Playbook ${passed ? 'PASSED' : 'FAILED'}: ${runResult.stepsExecuted} steps in ${formatDuration(totalDuration)}`
  );

  return {
    success: true,
    data: runResult,
  };
}

// =============================================================================
// Step Execution
// =============================================================================

/**
 * Execute a list of steps
 */
async function executeSteps(
  context: ExecutionContext,
  steps: PlaybookStepDef[],
  results: StepResult[]
): Promise<{ success: boolean; error?: string }> {
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const stepName = step.name || `Step ${i + 1}`;

    // Check condition
    if (step.condition) {
      const conditionResult = evaluateCondition(context, step.condition);
      if (!conditionResult) {
        const skipResult: StepResult = {
          name: stepName,
          action: step.action,
          success: true,
          duration: 0,
          skipped: true,
          skipReason: `Condition not met: ${step.condition}`,
        };
        results.push(skipResult);

        context.onStep?.({
          step,
          index: context.currentStepIndex,
          type: 'skip',
          skipReason: skipResult.skipReason,
        });

        context.currentStepIndex++;
        continue;
      }
    }

    // Execute the step
    const stepResult = await executeStep(context, step, i);
    results.push(stepResult);

    // Handle failure
    if (!stepResult.success && !stepResult.skipped) {
      // Execute on_failure steps if defined
      if (step.on_failure && step.on_failure.length > 0) {
        logger.debug(`${LOG_CONTEXT} Executing on_failure handlers for ${stepName}`);
        const failureResults: StepResult[] = [];
        await executeSteps(context, step.on_failure, failureResults);
        results.push(...failureResults);
      }

      // Check if we should continue
      if (!context.continueOnError && !step.continue_on_error) {
        return { success: false, error: stepResult.error };
      }
    }

    // Handle 'next' jump
    if (step.next) {
      const jumpIndex = steps.findIndex((s) => s.name === step.next);
      if (jumpIndex >= 0) {
        i = jumpIndex - 1; // Will be incremented by loop
      }
    }
  }

  return { success: true };
}

/**
 * Execute a single step
 */
async function executeStep(
  context: ExecutionContext,
  step: PlaybookStepDef,
  index: number
): Promise<StepResult> {
  const stepName = step.name || `Step ${index + 1}`;
  const startTime = Date.now();

  // Report step start
  context.onStep?.({
    step,
    index: context.currentStepIndex,
    type: 'start',
  });

  // Update progress
  reportProgress(context, {
    phase: 'executing',
    stepIndex: context.currentStepIndex,
    totalSteps: context.totalSteps,
    stepName,
    message: `Executing: ${stepName}`,
    percentComplete: Math.min(95, 5 + (context.currentStepIndex / context.totalSteps) * 90),
    loop: context.loopStack.length > 0 ? {
      as: context.loopStack[context.loopStack.length - 1].as,
      index: context.loopStack[context.loopStack.length - 1].index,
      total: context.loopStack[context.loopStack.length - 1].total,
    } : undefined,
  });

  logger.debug(`${LOG_CONTEXT} Executing step: ${stepName}`);

  // Handle loop step
  if (step.loop || step.loop_until) {
    const result = await executeLoopStep(context, step, index);
    context.currentStepIndex++;
    return result;
  }

  // Regular action step
  if (!step.action) {
    context.currentStepIndex++;
    return {
      name: stepName,
      success: true,
      duration: Date.now() - startTime,
      skipped: true,
      skipReason: 'No action defined',
    };
  }

  // Resolve inputs
  const resolvedInputs = resolveObject(context, step.inputs || {});

  context.onStep?.({
    step,
    index: context.currentStepIndex,
    type: 'start',
    resolvedInputs,
  });

  // Find action handler
  const handler = context.actions[step.action];
  if (!handler) {
    // Try iOS-prefixed action
    const iosHandler = context.actions[`ios.${step.action}`];
    if (!iosHandler) {
      const error = `Unknown action: ${step.action}`;
      logger.warn(`${LOG_CONTEXT} ${error}`);

      context.currentStepIndex++;
      context.onStep?.({
        step,
        index: context.currentStepIndex - 1,
        type: 'error',
        error,
      });

      return {
        name: stepName,
        action: step.action,
        success: false,
        error,
        duration: Date.now() - startTime,
        skipped: false,
      };
    }
  }

  // Execute action with timeout
  try {
    const actionHandler = handler || context.actions[`ios.${step.action}`];
    const result = await withTimeout(
      actionHandler(context, resolvedInputs, step),
      context.stepTimeout,
      `Step '${stepName}' timed out after ${context.stepTimeout}ms`
    );

    const duration = Date.now() - startTime;

    // Store output if specified
    if (step.store_as && result.data !== undefined) {
      context.outputs[step.store_as] = result.data;
    }

    context.currentStepIndex++;
    context.onStep?.({
      step,
      index: context.currentStepIndex - 1,
      type: result.success ? 'complete' : 'error',
      resolvedInputs,
      result: result.data,
      error: result.error,
      duration,
    });

    return {
      name: stepName,
      action: step.action,
      success: result.success,
      result: result.data,
      error: result.error,
      duration,
      skipped: false,
      loopContext: context.loopStack.length > 0 ? {
        as: context.loopStack[context.loopStack.length - 1].as,
        index: context.loopStack[context.loopStack.length - 1].index,
        total: context.loopStack[context.loopStack.length - 1].total,
      } : undefined,
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    const duration = Date.now() - startTime;

    context.currentStepIndex++;
    context.onStep?.({
      step,
      index: context.currentStepIndex - 1,
      type: 'error',
      resolvedInputs,
      error,
      duration,
    });

    return {
      name: stepName,
      action: step.action,
      success: false,
      error,
      duration,
      skipped: false,
    };
  }
}

/**
 * Execute a loop step
 */
async function executeLoopStep(
  context: ExecutionContext,
  step: PlaybookStepDef,
  index: number
): Promise<StepResult> {
  const stepName = step.name || `Loop ${index + 1}`;
  const startTime = Date.now();
  const loopVar = step.as || 'item';

  logger.debug(`${LOG_CONTEXT} Starting loop: ${stepName}`);

  // Determine loop items or condition
  let items: unknown[] = [];
  let isConditionLoop = false;

  if (step.loop) {
    // Array loop
    const resolved = resolveValue(context, step.loop);
    if (Array.isArray(resolved)) {
      items = resolved;
    } else if (typeof resolved === 'string' && resolved.startsWith('range(')) {
      // Handle range(n) syntax
      const match = resolved.match(/range\((\d+)\)/);
      if (match) {
        const count = parseInt(match[1], 10);
        items = Array.from({ length: count }, (_, i) => i);
      }
    } else {
      items = [resolved];
    }
  } else if (step.loop_until) {
    // Condition-based loop
    isConditionLoop = true;
    items = []; // Will be populated dynamically
  }

  if (!step.steps || step.steps.length === 0) {
    return {
      name: stepName,
      success: true,
      duration: Date.now() - startTime,
      skipped: true,
      skipReason: 'No nested steps in loop',
    };
  }

  const nestedResults: StepResult[] = [];
  let success = true;
  let errorMessage: string | undefined;

  if (isConditionLoop && step.loop_until) {
    // Condition loop (loop_until)
    const timeout = step.loop_until.timeout
      ? parseTimeout(resolveValue(context, step.loop_until.timeout) as string)
      : 300000;
    const loopStart = Date.now();
    let iteration = 0;

    while (Date.now() - loopStart < timeout) {
      // Check 'or' condition
      if (step.loop_until.or) {
        const orCondition = evaluateCondition(context, step.loop_until.or);
        if (orCondition) {
          break;
        }
      }

      // Push loop context
      context.loopStack.push({
        as: loopVar,
        item: iteration,
        index: iteration,
        total: -1, // Unknown for condition loops
        startTime: new Date(),
      });
      context.variables[loopVar] = iteration;

      // Execute nested steps
      const iterResult = await executeSteps(context, step.steps, nestedResults);

      // Pop loop context
      context.loopStack.pop();
      delete context.variables[loopVar];

      if (!iterResult.success) {
        success = false;
        errorMessage = iterResult.error;
        break;
      }

      iteration++;
    }
  } else {
    // Array loop
    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      // Push loop context
      context.loopStack.push({
        as: loopVar,
        item,
        index: i,
        total: items.length,
        startTime: new Date(),
      });
      context.variables[loopVar] = item;

      // Execute nested steps
      const iterResult = await executeSteps(context, step.steps, nestedResults);

      // Pop loop context
      context.loopStack.pop();
      delete context.variables[loopVar];

      if (!iterResult.success) {
        success = false;
        errorMessage = iterResult.error;
        break;
      }
    }
  }

  return {
    name: stepName,
    action: 'loop',
    success,
    result: { iterations: items.length, nestedResults: nestedResults.length },
    error: errorMessage,
    duration: Date.now() - startTime,
    skipped: false,
  };
}

// =============================================================================
// Variable Resolution
// =============================================================================

/**
 * Resolve a single value, handling template expressions
 */
export function resolveValue(context: ExecutionContext, value: unknown): unknown {
  if (typeof value !== 'string') {
    if (Array.isArray(value)) {
      return value.map((v) => resolveValue(context, v));
    }
    if (value && typeof value === 'object') {
      return resolveObject(context, value as Record<string, unknown>);
    }
    return value;
  }

  // Check for template expression
  const templateMatch = value.match(/^\{\{\s*(.+?)\s*\}\}$/);
  if (templateMatch) {
    // Full template - return resolved value
    return evaluateExpression(context, templateMatch[1]);
  }

  // Check for embedded templates
  if (value.includes('{{')) {
    return value.replace(/\{\{\s*(.+?)\s*\}\}/g, (_, expr) => {
      const result = evaluateExpression(context, expr);
      return result === undefined ? '' : String(result);
    });
  }

  return value;
}

/**
 * Resolve an object, handling all template expressions in values
 */
export function resolveObject(
  context: ExecutionContext,
  obj: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    result[key] = resolveValue(context, value);
  }

  return result;
}

/**
 * Evaluate a template expression
 */
export function evaluateExpression(context: ExecutionContext, expr: string): unknown {
  const trimmed = expr.trim();

  // Handle pipe operators (e.g., "value | default('fallback')")
  if (trimmed.includes(' | ')) {
    const [baseExpr, ...filters] = trimmed.split(' | ').map((s) => s.trim());
    let value = evaluateExpression(context, baseExpr);

    for (const filter of filters) {
      value = applyFilter(value, filter);
    }

    return value;
  }

  // Handle property access (e.g., "inputs.project_path", "outputs.build.bundle_id")
  const parts = trimmed.split('.');
  let current: unknown = undefined;

  switch (parts[0]) {
    case 'inputs':
      current = context.inputs;
      parts.shift();
      break;
    case 'variables':
      current = context.variables;
      parts.shift();
      break;
    case 'outputs':
      current = context.outputs;
      parts.shift();
      break;
    case 'collected':
      current = context.collected;
      parts.shift();
      break;
    case 'artifacts_dir':
      return context.artifactsDir;
    case 'session_id':
      return context.sessionId;
    case 'cwd':
      return context.cwd;
    default:
      // Check if it's a direct variable
      if (trimmed in context.variables) {
        return context.variables[trimmed];
      }
      // Check loop variable
      if (context.loopStack.length > 0) {
        const loopCtx = context.loopStack[context.loopStack.length - 1];
        if (trimmed === loopCtx.as) {
          return loopCtx.item;
        }
      }
      // Check if it's a special function like range()
      if (trimmed.startsWith('range(')) {
        return trimmed; // Return as-is for loop handling
      }
      return undefined;
  }

  // Navigate through property path
  for (const part of parts) {
    if (current === undefined || current === null) {
      return undefined;
    }
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Apply a filter to a value
 */
function applyFilter(value: unknown, filter: string): unknown {
  // Handle default filter
  const defaultMatch = filter.match(/^default\(([^)]+)\)$/);
  if (defaultMatch) {
    if (value === undefined || value === null || value === '') {
      // Parse the default value
      const defaultValue = defaultMatch[1].trim();
      if (defaultValue.startsWith("'") && defaultValue.endsWith("'")) {
        return defaultValue.slice(1, -1);
      }
      if (defaultValue.startsWith('"') && defaultValue.endsWith('"')) {
        return defaultValue.slice(1, -1);
      }
      if (defaultValue === 'true') return true;
      if (defaultValue === 'false') return false;
      const num = parseFloat(defaultValue);
      if (!isNaN(num)) return num;
      return defaultValue;
    }
    return value;
  }

  // Handle length filter
  if (filter === 'length') {
    if (Array.isArray(value)) return value.length;
    if (typeof value === 'string') return value.length;
    return 0;
  }

  // Handle json filter
  if (filter === 'json') {
    return JSON.stringify(value);
  }

  return value;
}

/**
 * Evaluate a condition expression
 */
export function evaluateCondition(context: ExecutionContext, condition: string): boolean {
  const resolved = resolveValue(context, `{{ ${condition} }}`);

  // Truthy check
  if (resolved === undefined || resolved === null || resolved === false || resolved === 0 || resolved === '') {
    return false;
  }

  return true;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Validate inputs against playbook input definitions
 */
function validateInputs(
  inputs: Record<string, unknown>,
  inputDefs?: Record<string, PlaybookInputDef>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!inputDefs) {
    return { valid: true, errors: [] };
  }

  for (const [key, def] of Object.entries(inputDefs)) {
    if (def.required && !(key in inputs) && def.default === undefined) {
      errors.push(`Required input '${key}' is missing`);
    }

    if (key in inputs && def.type) {
      const value = inputs[key];
      switch (def.type) {
        case 'string':
          if (typeof value !== 'string') {
            errors.push(`Input '${key}' must be a string`);
          }
          break;
        case 'number':
          if (typeof value !== 'number') {
            errors.push(`Input '${key}' must be a number`);
          }
          break;
        case 'boolean':
          if (typeof value !== 'boolean') {
            errors.push(`Input '${key}' must be a boolean`);
          }
          break;
        case 'array':
          if (!Array.isArray(value)) {
            errors.push(`Input '${key}' must be an array`);
          }
          break;
        case 'object':
          if (typeof value !== 'object' || value === null || Array.isArray(value)) {
            errors.push(`Input '${key}' must be an object`);
          }
          break;
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Apply default values to inputs
 */
function applyInputDefaults(
  inputs: Record<string, unknown>,
  inputDefs?: Record<string, PlaybookInputDef>
): Record<string, unknown> {
  const result = { ...inputs };

  if (!inputDefs) {
    return result;
  }

  for (const [key, def] of Object.entries(inputDefs)) {
    if (!(key in result) && def.default !== undefined) {
      result[key] = def.default;
    }
  }

  return result;
}

/**
 * Count total steps including nested
 */
function countSteps(steps: PlaybookStepDef[]): number {
  let count = 0;

  for (const step of steps) {
    count++;

    if (step.steps) {
      count += countSteps(step.steps);
    }

    if (step.on_failure) {
      count += countSteps(step.on_failure);
    }
  }

  return count;
}

/**
 * Report progress
 */
function reportProgress(context: ExecutionContext, update: PlaybookProgress): void {
  const elapsed = Date.now() - context.startTime.getTime();
  update.elapsed = elapsed;
  logger.debug(`${LOG_CONTEXT} Progress: ${update.phase} - ${update.message}`);
  context.onProgress?.(update);
}

/**
 * Create dry run result
 */
function createDryRunResult(
  playbook: IOSPlaybookConfig,
  playbookPath: string | undefined,
  artifactsDir: string,
  startTime: Date,
  context: ExecutionContext
): PlaybookRunResult {
  const endTime = new Date();
  return {
    passed: true,
    playbook: {
      name: playbook.name,
      version: playbook.version,
      path: playbookPath,
    },
    stepsExecuted: 0,
    stepsPassed: 0,
    stepsFailed: 0,
    stepsSkipped: context.totalSteps,
    totalDuration: endTime.getTime() - startTime.getTime(),
    startTime,
    endTime,
    stepResults: [],
    finalVariables: context.variables,
    finalOutputs: context.outputs,
    artifactsDir,
    collected: {},
  };
}

/**
 * Write playbook result to artifacts directory
 */
async function writePlaybookResult(dir: string, result: PlaybookRunResult): Promise<void> {
  try {
    // Write JSON result
    await writeFile(
      path.join(dir, 'result.json'),
      JSON.stringify(result, null, 2)
    );

    // Write text summary
    const summary = formatPlaybookResultAsText(result);
    await writeFile(path.join(dir, 'summary.txt'), summary);
  } catch (e) {
    logger.warn(`${LOG_CONTEXT} Failed to write playbook result: ${e}`);
  }
}

/**
 * Parse timeout string (e.g., "300s", "5m") to milliseconds
 */
function parseTimeout(value: string): number {
  if (typeof value === 'number') return value;

  const match = value.match(/^(\d+)(s|m|ms)?$/);
  if (!match) return 300000;

  const num = parseInt(match[1], 10);
  const unit = match[2] || 's';

  switch (unit) {
    case 'ms':
      return num;
    case 's':
      return num * 1000;
    case 'm':
      return num * 60 * 1000;
    default:
      return num;
  }
}

/**
 * Sanitize a string for use as a filename
 */
function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
}

/**
 * Format duration in human-readable format
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  } else {
    const mins = Math.floor(ms / 60000);
    const secs = ((ms % 60000) / 1000).toFixed(0);
    return `${mins}m ${secs}s`;
  }
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute with timeout
 */
async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (e) {
    clearTimeout(timeoutId!);
    throw e;
  }
}

// =============================================================================
// Result Formatters
// =============================================================================

/**
 * Format playbook result as markdown
 */
export function formatPlaybookResult(result: PlaybookRunResult): string {
  const lines: string[] = [];

  const statusEmoji = result.passed ? '✅' : '❌';
  lines.push(`## ${statusEmoji} Playbook: ${result.playbook.name}`);
  lines.push('');

  // Summary table
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Status | ${result.passed ? 'PASSED' : 'FAILED'} |`);
  lines.push(`| Steps Executed | ${result.stepsExecuted} |`);
  lines.push(`| Steps Passed | ${result.stepsPassed} |`);
  lines.push(`| Steps Failed | ${result.stepsFailed} |`);
  lines.push(`| Steps Skipped | ${result.stepsSkipped} |`);
  lines.push(`| Duration | ${formatDuration(result.totalDuration)} |`);
  lines.push('');

  // Step results
  if (result.stepResults.length > 0) {
    lines.push('### Step Results');
    lines.push('');

    for (const step of result.stepResults) {
      const icon = step.skipped ? '⏭️' : step.success ? '✅' : '❌';
      const info = step.skipped
        ? `(skipped: ${step.skipReason})`
        : step.error
          ? `(${step.error})`
          : `(${formatDuration(step.duration)})`;
      lines.push(`- ${icon} **${step.name}** ${info}`);
    }
    lines.push('');
  }

  // Error
  if (result.error) {
    lines.push('### Error');
    lines.push('');
    lines.push('```');
    lines.push(result.error);
    lines.push('```');
    lines.push('');
  }

  // Artifacts
  lines.push('### Artifacts');
  lines.push('');
  lines.push(`- Directory: \`${result.artifactsDir}\``);
  lines.push('');

  return lines.join('\n');
}

/**
 * Format playbook result as JSON
 */
export function formatPlaybookResultAsJson(result: PlaybookRunResult): string {
  return JSON.stringify(result, null, 2);
}

/**
 * Format playbook result as text
 */
export function formatPlaybookResultAsText(result: PlaybookRunResult): string {
  const lines: string[] = [];

  lines.push('='.repeat(60));
  lines.push(`PLAYBOOK: ${result.playbook.name}`);
  lines.push('='.repeat(60));
  lines.push('');

  lines.push(`Status: ${result.passed ? 'PASSED' : 'FAILED'}`);
  lines.push(`Duration: ${formatDuration(result.totalDuration)}`);
  lines.push('');

  lines.push('-'.repeat(40));
  lines.push('STEPS');
  lines.push('-'.repeat(40));

  lines.push(`  Executed: ${result.stepsExecuted}`);
  lines.push(`  Passed: ${result.stepsPassed}`);
  lines.push(`  Failed: ${result.stepsFailed}`);
  lines.push(`  Skipped: ${result.stepsSkipped}`);
  lines.push('');

  if (result.stepResults.length > 0) {
    lines.push('-'.repeat(40));
    lines.push('STEP DETAILS');
    lines.push('-'.repeat(40));

    for (const step of result.stepResults) {
      const status = step.skipped ? 'SKIP' : step.success ? 'PASS' : 'FAIL';
      lines.push(`  [${status}] ${step.name}`);
      if (step.error) {
        lines.push(`         Error: ${step.error}`);
      }
      if (step.skipReason) {
        lines.push(`         Reason: ${step.skipReason}`);
      }
    }
    lines.push('');
  }

  if (result.error) {
    lines.push('-'.repeat(40));
    lines.push('ERROR');
    lines.push('-'.repeat(40));
    lines.push(result.error);
    lines.push('');
  }

  lines.push('='.repeat(60));

  return lines.join('\n');
}

/**
 * Format playbook result in compact form
 */
export function formatPlaybookResultCompact(result: PlaybookRunResult): string {
  const status = result.passed ? 'PASS' : 'FAIL';
  const steps = `${result.stepsPassed}/${result.stepsExecuted}`;
  return `[${status}] ${result.playbook.name}: ${steps} steps, ${formatDuration(result.totalDuration)}`;
}
