/**
 * Playbook Actions Type Definitions
 *
 * Types for action-based playbook execution.
 * This system allows YAML-based playbooks with declarative actions.
 */

/**
 * Variable store for passing data between actions
 */
export interface ActionVariables {
  [key: string]: unknown;
}

/**
 * Context available to all action handlers
 */
export interface ActionContext {
  /** Project working directory */
  cwd: string;
  /** Session ID */
  sessionId: string;
  /** Variable store for passing data between steps */
  variables: ActionVariables;
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal;
}

/**
 * Result returned by an action handler
 */
export interface ActionResult {
  /** Whether the action succeeded */
  success: boolean;
  /** Human-readable message */
  message: string;
  /** Structured output data (stored in variables if store_as specified) */
  data?: unknown;
  /** Error message if failed */
  error?: string;
  /** Elapsed time in milliseconds */
  elapsedMs?: number;
}

/**
 * Definition of an action that can be executed
 */
export interface ActionDefinition<TInputs = Record<string, unknown>> {
  /** Unique action name (e.g., 'ios.snapshot') */
  name: string;
  /** Human-readable description */
  description: string;
  /** Input parameter definitions */
  inputs: {
    [K in keyof TInputs]: {
      type: 'string' | 'number' | 'boolean' | 'object' | 'array';
      required?: boolean;
      default?: TInputs[K];
      description?: string;
    };
  };
  /** Output field descriptions */
  outputs?: {
    [key: string]: {
      type: 'string' | 'number' | 'boolean' | 'object' | 'array';
      description?: string;
    };
  };
  /** Handler function that executes the action */
  handler: (inputs: TInputs, context: ActionContext) => Promise<ActionResult>;
}

/**
 * A step in a YAML playbook
 */
export interface PlaybookStep {
  /** Human-readable step name */
  name?: string;
  /** Action to execute (e.g., 'ios.snapshot') */
  action: string;
  /** Input values for the action */
  inputs?: Record<string, unknown>;
  /** Variable name to store action output */
  store_as?: string;
  /** Condition expression (e.g., '{{ variables.build_result.success }}') */
  condition?: string;
  /** Steps to execute if this step fails */
  on_failure?: PlaybookStep[];
  /** Continue execution even if this step fails */
  continue_on_error?: boolean;
}

/**
 * YAML-based playbook definition
 */
export interface YamlPlaybook {
  /** Playbook name */
  name: string;
  /** Optional description */
  description?: string;
  /** Input parameters for the playbook */
  inputs?: {
    [key: string]: {
      type: 'string' | 'number' | 'boolean';
      required?: boolean;
      default?: unknown;
      description?: string;
    };
  };
  /** Playbook steps */
  steps: PlaybookStep[];
}

/**
 * Result of executing a single step
 */
export interface StepExecutionResult {
  /** Step name or action */
  step: string;
  /** Action that was executed */
  action: string;
  /** Whether the step succeeded */
  success: boolean;
  /** Human-readable message */
  message: string;
  /** Step output data */
  data?: unknown;
  /** Error message if failed */
  error?: string;
  /** Whether the step was skipped due to condition */
  skipped?: boolean;
  /** Elapsed time in milliseconds */
  elapsedMs: number;
}

/**
 * Result of executing an entire playbook
 */
export interface PlaybookExecutionResult {
  /** Playbook name */
  playbook: string;
  /** Whether all steps succeeded */
  success: boolean;
  /** Total number of steps */
  totalSteps: number;
  /** Number of successful steps */
  successfulSteps: number;
  /** Number of failed steps */
  failedSteps: number;
  /** Number of skipped steps */
  skippedSteps: number;
  /** Per-step results */
  stepResults: StepExecutionResult[];
  /** Final variable state */
  variables: ActionVariables;
  /** Total elapsed time in milliseconds */
  elapsedMs: number;
  /** Error message if failed */
  error?: string;
}
