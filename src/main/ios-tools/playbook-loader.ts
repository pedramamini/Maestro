/**
 * iOS Playbook Loader
 *
 * Loads, validates, and manages iOS-specific playbook configurations.
 * Playbooks are YAML-based automation workflows for iOS development.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const yaml = require('js-yaml');

// =============================================================================
// Types
// =============================================================================

/**
 * Playbook input parameter definition
 */
export interface PlaybookInputDef {
  /** Human-readable description */
  description?: string;
  /** Parameter type */
  type?: 'string' | 'number' | 'boolean' | 'array' | 'object';
  /** Whether the parameter is required */
  required?: boolean;
  /** Default value if not provided */
  default?: unknown;
}

/**
 * Playbook step definition
 */
export interface PlaybookStepDef {
  /** Human-readable step name */
  name?: string;
  /** Action to execute (e.g., 'ios.build', 'ios.launch'). Optional for loop steps. */
  action?: string;
  /** Input values for the action */
  inputs?: Record<string, unknown>;
  /** Variable name to store action output */
  store_as?: string;
  /** Condition expression for conditional execution */
  condition?: string;
  /** Steps to execute if this step fails */
  on_failure?: PlaybookStepDef[];
  /** Continue execution even if this step fails */
  continue_on_error?: boolean;
  /** Next step to jump to (for loops) */
  next?: string;
  /** Looping construct */
  loop?: string;
  /** Loop variable name */
  as?: string;
  /** Nested steps (for loops) */
  steps?: PlaybookStepDef[];
  /** Loop termination condition */
  loop_until?: {
    timeout?: string;
    or?: string;
  };
  /** Message for report actions */
  message?: string;
  /** Reason for exit actions */
  reason?: string;
}

/**
 * Variable definitions in a playbook
 */
export interface PlaybookVariables {
  [key: string]: unknown;
}

/**
 * Complete iOS playbook configuration
 */
export interface IOSPlaybookConfig {
  /** Playbook name */
  name: string;
  /** Playbook description */
  description?: string;
  /** Playbook version */
  version?: string;
  /** Input parameter definitions */
  inputs?: Record<string, PlaybookInputDef>;
  /** Initial variable values */
  variables?: PlaybookVariables;
  /** Playbook steps */
  steps: PlaybookStepDef[];
}

/**
 * Playbook metadata (loaded from directory)
 */
export interface PlaybookInfo {
  /** Playbook ID (directory name) */
  id: string;
  /** Playbook name */
  name: string;
  /** Playbook description */
  description?: string;
  /** Playbook version */
  version?: string;
  /** Path to playbook.yaml */
  configPath: string;
  /** Path to playbook directory */
  directory: string;
  /** Whether this is a built-in playbook */
  builtIn: boolean;
}

/**
 * Result of playbook validation
 */
export interface PlaybookValidationResult {
  /** Whether the playbook is valid */
  valid: boolean;
  /** Validation errors */
  errors: string[];
  /** Validation warnings */
  warnings: string[];
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Default iOS playbooks directory
 */
function getDefaultPlaybooksDir(): string {
  return path.join(os.homedir(), '.maestro', 'playbooks', 'iOS');
}

/**
 * Built-in playbook IDs
 */
export const BUILTIN_PLAYBOOKS = [
  'Feature-Ship-Loop',
  'Regression-Check',
  'Crash-Hunt',
  'Design-Review',
  'Performance-Check',
] as const;

export type BuiltInPlaybookId = (typeof BUILTIN_PLAYBOOKS)[number];

// =============================================================================
// Playbook Loader Functions
// =============================================================================

/**
 * Ensure the iOS playbooks directory structure exists
 */
export function ensurePlaybooksDirectory(baseDir?: string): string {
  const dir = baseDir ?? getDefaultPlaybooksDir();

  // Create main directory
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Create subdirectories for built-in playbooks
  for (const playbookId of BUILTIN_PLAYBOOKS) {
    const playbookDir = path.join(dir, playbookId);
    if (!fs.existsSync(playbookDir)) {
      fs.mkdirSync(playbookDir, { recursive: true });
    }
  }

  // Create Common directory
  const commonDir = path.join(dir, 'Common');
  if (!fs.existsSync(commonDir)) {
    fs.mkdirSync(commonDir, { recursive: true });
  }

  // Create Common subdirectories
  const commonSubdirs = ['flows', 'screens', 'assertions'];
  for (const subdir of commonSubdirs) {
    const subdirPath = path.join(commonDir, subdir);
    if (!fs.existsSync(subdirPath)) {
      fs.mkdirSync(subdirPath, { recursive: true });
    }
  }

  return dir;
}

/**
 * Load a playbook configuration from a YAML file
 */
export function loadPlaybook(nameOrPath: string, baseDir?: string): IOSPlaybookConfig {
  const dir = baseDir ?? getDefaultPlaybooksDir();

  // Determine the config file path
  let configPath: string;
  if (path.isAbsolute(nameOrPath) && nameOrPath.endsWith('.yaml')) {
    configPath = nameOrPath;
  } else if (nameOrPath.endsWith('.yaml')) {
    configPath = path.resolve(nameOrPath);
  } else {
    // Assume it's a playbook name, look for playbook.yaml in that directory
    configPath = path.join(dir, nameOrPath, 'playbook.yaml');
  }

  if (!fs.existsSync(configPath)) {
    throw new Error(`Playbook not found: ${configPath}`);
  }

  const content = fs.readFileSync(configPath, 'utf-8');
  const parsed = yaml.load(content) as unknown;

  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Invalid playbook format in ${configPath}`);
  }

  const config = parsed as Record<string, unknown>;

  // Validate required fields
  if (typeof config.name !== 'string' || !config.name) {
    throw new Error(`Playbook must have a 'name' field: ${configPath}`);
  }

  if (!Array.isArray(config.steps)) {
    throw new Error(`Playbook must have a 'steps' array: ${configPath}`);
  }

  return {
    name: config.name,
    description: typeof config.description === 'string' ? config.description : undefined,
    version: typeof config.version === 'string' ? config.version : undefined,
    inputs: config.inputs as Record<string, PlaybookInputDef> | undefined,
    variables: config.variables as PlaybookVariables | undefined,
    steps: config.steps as PlaybookStepDef[],
  };
}

/**
 * List all available iOS playbooks
 */
export function listPlaybooks(baseDir?: string): PlaybookInfo[] {
  const dir = baseDir ?? getDefaultPlaybooksDir();
  const playbooks: PlaybookInfo[] = [];

  if (!fs.existsSync(dir)) {
    return playbooks;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'Common') continue; // Skip Common directory
    if (entry.name.startsWith('.')) continue; // Skip hidden directories

    const playbookDir = path.join(dir, entry.name);
    const configPath = path.join(playbookDir, 'playbook.yaml');

    if (!fs.existsSync(configPath)) continue;

    try {
      const config = loadPlaybook(entry.name, dir);
      playbooks.push({
        id: entry.name,
        name: config.name,
        description: config.description,
        version: config.version,
        configPath,
        directory: playbookDir,
        builtIn: BUILTIN_PLAYBOOKS.includes(entry.name as BuiltInPlaybookId),
      });
    } catch {
      // Skip invalid playbooks
    }
  }

  return playbooks;
}

/**
 * Validate a playbook configuration
 */
export function validatePlaybook(config: IOSPlaybookConfig): PlaybookValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate name
  if (!config.name || typeof config.name !== 'string') {
    errors.push("Playbook must have a 'name' field");
  }

  // Validate steps
  if (!config.steps || !Array.isArray(config.steps)) {
    errors.push("Playbook must have a 'steps' array");
  } else if (config.steps.length === 0) {
    errors.push('Playbook must have at least one step');
  } else {
    // Validate each step
    config.steps.forEach((step, index) => {
      const stepId = step.name || `Step ${index + 1}`;
      validateStep(step, stepId, errors, warnings);
    });
  }

  // Validate inputs
  if (config.inputs) {
    for (const [key, inputDef] of Object.entries(config.inputs)) {
      if (inputDef.required && inputDef.default !== undefined) {
        warnings.push(`Input '${key}' is marked required but has a default value`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate a single step
 */
function validateStep(
  step: PlaybookStepDef,
  stepId: string,
  errors: string[],
  warnings: string[]
): void {
  // Must have action or loop or loop_until
  if (!step.action && !step.loop && !step.loop_until) {
    errors.push(`${stepId}: Step must have an 'action', 'loop', or 'loop_until' field`);
  }

  // If action is present, validate it
  if (step.action) {
    if (typeof step.action !== 'string') {
      errors.push(`${stepId}: 'action' must be a string`);
    }
  }

  // Validate nested steps
  if (step.steps && Array.isArray(step.steps)) {
    step.steps.forEach((nestedStep, nestedIndex) => {
      const nestedId = nestedStep.name || `${stepId} > Nested Step ${nestedIndex + 1}`;
      validateStep(nestedStep, nestedId, errors, warnings);
    });
  }

  // Validate on_failure steps
  if (step.on_failure && Array.isArray(step.on_failure)) {
    step.on_failure.forEach((failureStep, failureIndex) => {
      const failureId = failureStep.name || `${stepId} > Failure Step ${failureIndex + 1}`;
      validateStep(failureStep, failureId, errors, warnings);
    });
  }

  // Warn about missing name
  if (!step.name && step.action) {
    warnings.push(`${stepId}: Consider adding a 'name' field for better readability`);
  }
}

/**
 * Get playbook info by ID
 */
export function getPlaybookInfo(id: string, baseDir?: string): PlaybookInfo | undefined {
  const playbooks = listPlaybooks(baseDir);
  return playbooks.find((p) => p.id === id);
}

/**
 * Check if a playbook exists
 */
export function playbookExists(id: string, baseDir?: string): boolean {
  const dir = baseDir ?? getDefaultPlaybooksDir();
  const configPath = path.join(dir, id, 'playbook.yaml');
  return fs.existsSync(configPath);
}

/**
 * Get the path to a playbook's templates directory
 */
export function getPlaybookTemplatesDir(id: string, baseDir?: string): string {
  const dir = baseDir ?? getDefaultPlaybooksDir();
  return path.join(dir, id, 'templates');
}

/**
 * Get the path to a playbook's baselines directory (for Regression-Check)
 */
export function getPlaybookBaselinesDir(id: string, baseDir?: string): string {
  const dir = baseDir ?? getDefaultPlaybooksDir();
  return path.join(dir, id, 'baselines');
}

/**
 * Get common flows directory
 */
export function getCommonFlowsDir(baseDir?: string): string {
  const dir = baseDir ?? getDefaultPlaybooksDir();
  return path.join(dir, 'Common', 'flows');
}

/**
 * Get common screens directory
 */
export function getCommonScreensDir(baseDir?: string): string {
  const dir = baseDir ?? getDefaultPlaybooksDir();
  return path.join(dir, 'Common', 'screens');
}

/**
 * Get common assertions directory
 */
export function getCommonAssertionsDir(baseDir?: string): string {
  const dir = baseDir ?? getDefaultPlaybooksDir();
  return path.join(dir, 'Common', 'assertions');
}
