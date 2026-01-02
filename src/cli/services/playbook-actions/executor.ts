/**
 * Playbook Executor
 *
 * Executes YAML playbooks step by step, managing variables and control flow.
 */

import { getAction, hasAction } from './action-registry';
import type {
  ActionContext,
  ActionVariables,
  PlaybookStep,
  StepExecutionResult,
  PlaybookExecutionResult,
  YamlPlaybook,
} from './types';

/**
 * Options for playbook execution
 */
export interface ExecutorOptions {
  /** Project working directory */
  cwd: string;
  /** Session ID */
  sessionId: string;
  /** Initial variables */
  variables?: ActionVariables;
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal;
  /** Callback for step progress */
  onStepStart?: (step: PlaybookStep, index: number) => void;
  /** Callback for step completion */
  onStepComplete?: (result: StepExecutionResult, index: number) => void;
}

/**
 * Substitute template variables in a value
 * Supports {{ variables.name }} and {{ inputs.name }} syntax
 */
function substituteVariables(
  value: unknown,
  variables: ActionVariables
): unknown {
  if (typeof value === 'string') {
    // Match {{ ... }} patterns
    return value.replace(
      /\{\{\s*([^}]+)\s*\}\}/g,
      (match: string, expr: string) => {
        const trimmed = expr.trim();

        // Handle variables.xxx
        if (trimmed.startsWith('variables.')) {
          const path = trimmed.slice('variables.'.length);
          const result = getNestedValue(variables, path);
          return result !== undefined ? String(result) : match;
        }

        // Handle direct variable reference
        if (trimmed in variables) {
          const result = variables[trimmed];
          return result !== undefined ? String(result) : match;
        }

        return match;
      }
    );
  }

  if (Array.isArray(value)) {
    return value.map((v) => substituteVariables(v, variables));
  }

  if (typeof value === 'object' && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = substituteVariables(v, variables);
    }
    return result;
  }

  return value;
}

/**
 * Get a nested value from an object using dot notation
 */
function getNestedValue(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Evaluate a condition expression
 * Supports simple expressions like "{{ variables.name }}" and truthy checks
 */
function evaluateCondition(condition: string, variables: ActionVariables): boolean {
  // Substitute variables first
  const substituted = substituteVariables(condition, variables);

  if (typeof substituted !== 'string') {
    return Boolean(substituted);
  }

  // Handle common conditions
  const trimmed = substituted.trim().toLowerCase();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === '') return false;
  if (trimmed === 'null' || trimmed === 'undefined') return false;

  // For any other value, treat as truthy
  return true;
}

/**
 * Execute a single step
 */
async function executeStep(
  step: PlaybookStep,
  context: ActionContext
): Promise<StepExecutionResult> {
  const startTime = Date.now();
  const stepName = step.name || step.action;

  // Check condition
  if (step.condition) {
    const shouldRun = evaluateCondition(step.condition, context.variables);
    if (!shouldRun) {
      return {
        step: stepName,
        action: step.action,
        success: true,
        message: 'Step skipped due to condition',
        skipped: true,
        elapsedMs: Date.now() - startTime,
      };
    }
  }

  // Check if action exists
  if (!hasAction(step.action)) {
    return {
      step: stepName,
      action: step.action,
      success: false,
      message: `Unknown action: ${step.action}`,
      error: `Action '${step.action}' is not registered`,
      elapsedMs: Date.now() - startTime,
    };
  }

  const action = getAction(step.action)!;

  // Substitute variables in inputs
  const inputs = step.inputs
    ? (substituteVariables(step.inputs, context.variables) as Record<string, unknown>)
    : {};

  try {
    // Execute the action
    const result = await action.handler(inputs, context);

    // Store result if requested
    if (step.store_as && result.data !== undefined) {
      context.variables[step.store_as] = result.data;
    }

    return {
      step: stepName,
      action: step.action,
      success: result.success,
      message: result.message,
      data: result.data,
      error: result.error,
      elapsedMs: result.elapsedMs ?? Date.now() - startTime,
    };
  } catch (error) {
    return {
      step: stepName,
      action: step.action,
      success: false,
      message: 'Action threw an exception',
      error: error instanceof Error ? error.message : String(error),
      elapsedMs: Date.now() - startTime,
    };
  }
}

/**
 * Execute a list of steps
 */
async function executeSteps(
  steps: PlaybookStep[],
  context: ActionContext,
  options: {
    onStepStart?: (step: PlaybookStep, index: number) => void;
    onStepComplete?: (result: StepExecutionResult, index: number) => void;
  }
): Promise<StepExecutionResult[]> {
  const results: StepExecutionResult[] = [];

  for (let i = 0; i < steps.length; i++) {
    // Check for cancellation
    if (context.abortSignal?.aborted) {
      results.push({
        step: steps[i].name || steps[i].action,
        action: steps[i].action,
        success: false,
        message: 'Execution cancelled',
        error: 'Aborted',
        elapsedMs: 0,
      });
      break;
    }

    const step = steps[i];
    options.onStepStart?.(step, i);

    const result = await executeStep(step, context);
    results.push(result);
    options.onStepComplete?.(result, i);

    // Handle failure
    if (!result.success && !result.skipped) {
      // Execute on_failure steps if defined
      if (step.on_failure && step.on_failure.length > 0) {
        const failureResults = await executeSteps(step.on_failure, context, {});
        results.push(...failureResults);
      }

      // Stop execution unless continue_on_error is set
      if (!step.continue_on_error) {
        break;
      }
    }
  }

  return results;
}

/**
 * Execute a YAML playbook
 */
export async function executePlaybook(
  playbook: YamlPlaybook,
  options: ExecutorOptions
): Promise<PlaybookExecutionResult> {
  const startTime = Date.now();

  // Initialize context
  const context: ActionContext = {
    cwd: options.cwd,
    sessionId: options.sessionId,
    variables: { ...options.variables },
    abortSignal: options.abortSignal,
  };

  // Execute steps
  const stepResults = await executeSteps(playbook.steps, context, {
    onStepStart: options.onStepStart,
    onStepComplete: options.onStepComplete,
  });

  // Calculate stats
  const successfulSteps = stepResults.filter((r) => r.success && !r.skipped).length;
  const failedSteps = stepResults.filter((r) => !r.success && !r.skipped).length;
  const skippedSteps = stepResults.filter((r) => r.skipped).length;
  const success = failedSteps === 0;

  return {
    playbook: playbook.name,
    success,
    totalSteps: playbook.steps.length,
    successfulSteps,
    failedSteps,
    skippedSteps,
    stepResults,
    variables: context.variables,
    elapsedMs: Date.now() - startTime,
    error: success ? undefined : stepResults.find((r) => r.error)?.error,
  };
}

/**
 * Execute a single action step (convenience function)
 */
export async function executeAction(
  action: string,
  inputs: Record<string, unknown>,
  options: Omit<ExecutorOptions, 'variables'>
): Promise<StepExecutionResult> {
  const context: ActionContext = {
    cwd: options.cwd,
    sessionId: options.sessionId,
    variables: {},
    abortSignal: options.abortSignal,
  };

  return executeStep({ action, inputs }, context);
}
