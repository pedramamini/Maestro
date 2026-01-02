/**
 * iOS Tools - Maestro Flow Runner
 *
 * Executes Maestro YAML flow files and captures results.
 * Parses pass/fail status and captures failure screenshots.
 * https://maestro.mobile.dev/reference/yaml-syntax
 */

import * as path from 'path';
import { readFile, mkdir, access } from 'fs/promises';
import { logger } from '../utils/logger';
import { IOSResult } from './types';
import { runMaestro as runMaestroCli, isMaestroAvailable, detectMaestroCli } from './maestro-cli';
import { getArtifactDirectory } from './artifacts';
import { captureScreenshot } from './capture';
import { getBootedSimulators } from './simulator';

const LOG_CONTEXT = '[iOS-FlowRunner]';

// =============================================================================
// Types
// =============================================================================

/**
 * Options for running a Maestro flow
 */
export interface FlowRunOptions {
  /** Path to the YAML flow file */
  flowPath: string;
  /** Optional simulator UDID (auto-detects if not provided) */
  udid?: string;
  /** Optional app bundle ID (overrides flow config) */
  bundleId?: string;
  /** Session ID for artifact storage */
  sessionId: string;
  /** Environment variables to pass to the flow */
  env?: Record<string, string>;
  /** Timeout for the entire flow execution (ms, default: 300000 = 5 min) */
  timeout?: number;
  /** Capture screenshot on failure */
  captureOnFailure?: boolean;
  /** Working directory for relative paths */
  cwd?: string;
  /** Whether to continue on error (default: false) */
  continueOnError?: boolean;
  /** Output format for maestro (default: 'junit') */
  outputFormat?: 'junit' | 'html';
  /** Debug mode - capture more detailed output */
  debug?: boolean;
}

/**
 * Individual step result from flow execution
 */
export interface FlowStepResult {
  /** Step index (0-based) */
  index: number;
  /** Step name/description from the YAML */
  name?: string;
  /** Step action type */
  action?: string;
  /** Whether this step passed */
  passed: boolean;
  /** Duration in milliseconds */
  duration?: number;
  /** Error message if failed */
  error?: string;
  /** Screenshot captured at this step */
  screenshotPath?: string;
}

/**
 * Result of a flow execution
 */
export interface FlowRunResult {
  /** Whether the entire flow passed */
  passed: boolean;
  /** Total duration in milliseconds */
  duration: number;
  /** Flow file that was executed */
  flowPath: string;
  /** Simulator UDID used */
  udid: string;
  /** Total number of steps */
  totalSteps: number;
  /** Number of steps that passed */
  passedSteps: number;
  /** Number of steps that failed */
  failedSteps: number;
  /** Number of steps that were skipped */
  skippedSteps: number;
  /** Individual step results */
  steps: FlowStepResult[];
  /** Path to failure screenshot (if captured) */
  failureScreenshotPath?: string;
  /** Path to JUnit XML report (if generated) */
  reportPath?: string;
  /** Raw console output from maestro */
  rawOutput: string;
  /** Error message if flow failed to start */
  error?: string;
  /** Exit code from maestro */
  exitCode: number | string;
}

// =============================================================================
// Flow Runner
// =============================================================================

/**
 * Run a Maestro flow file and capture results.
 *
 * @param options - Flow run options
 * @returns FlowRunResult with pass/fail status and step details
 */
export async function runFlow(options: FlowRunOptions): Promise<IOSResult<FlowRunResult>> {
  const startTime = Date.now();
  const {
    flowPath,
    sessionId,
    env = {},
    timeout = 300000,
    captureOnFailure = true,
    cwd,
    continueOnError = false,
    outputFormat = 'junit',
    debug = false,
  } = options;

  logger.info(`${LOG_CONTEXT} Running flow: ${flowPath}`, LOG_CONTEXT);

  // Validate Maestro is available
  const available = await isMaestroAvailable();
  if (!available) {
    const detectResult = await detectMaestroCli();
    const instructions = detectResult.data?.installInstructions || 'Install from https://maestro.mobile.dev/';
    return {
      success: false,
      error: `Maestro CLI is not installed. ${instructions}`,
      errorCode: 'COMMAND_FAILED',
    };
  }

  // Validate flow file exists
  const resolvedFlowPath = cwd ? path.resolve(cwd, flowPath) : path.resolve(flowPath);
  try {
    await access(resolvedFlowPath);
  } catch {
    return {
      success: false,
      error: `Flow file not found: ${resolvedFlowPath}`,
      errorCode: 'COMMAND_FAILED',
    };
  }

  // Determine simulator UDID
  let udid = options.udid;
  if (!udid) {
    const bootedResult = await getBootedSimulators();
    if (!bootedResult.success || !bootedResult.data || bootedResult.data.length === 0) {
      return {
        success: false,
        error: 'No booted simulators found. Please boot a simulator first.',
        errorCode: 'SIMULATOR_NOT_BOOTED',
      };
    }
    udid = bootedResult.data[0].udid;
    logger.debug(`${LOG_CONTEXT} Auto-selected simulator: ${udid}`, LOG_CONTEXT);
  }

  // Prepare artifact directory for outputs
  const artifactDir = await getArtifactDirectory(sessionId);
  const runId = `flow-${Date.now()}`;
  const runDir = path.join(artifactDir, runId);
  await mkdir(runDir, { recursive: true });

  // Build maestro command arguments
  const args = buildMaestroArgs({
    flowPath: resolvedFlowPath,
    udid,
    bundleId: options.bundleId,
    env,
    continueOnError,
    outputFormat,
    outputDir: runDir,
    debug,
  });

  // Execute maestro
  logger.debug(`${LOG_CONTEXT} Executing: maestro ${args.join(' ')}`, LOG_CONTEXT);
  const result = await runMaestroWithTimeout(args, cwd, timeout);

  const duration = Date.now() - startTime;
  const rawOutput = result.stdout + (result.stderr ? '\n' + result.stderr : '');

  // Parse the output to extract step results
  const parseResult = parseFlowOutput(rawOutput);
  const passed = result.exitCode === 0;

  // Capture failure screenshot if requested
  let failureScreenshotPath: string | undefined;
  if (!passed && captureOnFailure) {
    try {
      const screenshotResult = await captureScreenshot(udid, runDir, 'failure');
      if (screenshotResult.success && screenshotResult.data) {
        failureScreenshotPath = screenshotResult.data.path;
        logger.debug(`${LOG_CONTEXT} Captured failure screenshot: ${failureScreenshotPath}`, LOG_CONTEXT);
      }
    } catch (e) {
      logger.warn(`${LOG_CONTEXT} Failed to capture failure screenshot: ${e}`, LOG_CONTEXT);
    }
  }

  // Determine report path
  let reportPath: string | undefined;
  const expectedReportPath = path.join(runDir, 'report.xml');
  try {
    await access(expectedReportPath);
    reportPath = expectedReportPath;
  } catch {
    // Report wasn't generated
  }

  const flowResult: FlowRunResult = {
    passed,
    duration,
    flowPath: resolvedFlowPath,
    udid,
    totalSteps: parseResult.totalSteps,
    passedSteps: parseResult.passedSteps,
    failedSteps: parseResult.failedSteps,
    skippedSteps: parseResult.skippedSteps,
    steps: parseResult.steps,
    failureScreenshotPath,
    reportPath,
    rawOutput,
    exitCode: result.exitCode,
  };

  if (!passed) {
    flowResult.error = parseResult.errorMessage || 'Flow execution failed';
    logger.warn(
      `${LOG_CONTEXT} Flow failed: ${parseResult.errorMessage || 'Unknown error'}`,
      LOG_CONTEXT
    );
  } else {
    logger.info(
      `${LOG_CONTEXT} Flow passed: ${parseResult.passedSteps}/${parseResult.totalSteps} steps in ${duration}ms`,
      LOG_CONTEXT
    );
  }

  return {
    success: true,
    data: flowResult,
  };
}

/**
 * Build Maestro CLI arguments for flow execution.
 */
function buildMaestroArgs(options: {
  flowPath: string;
  udid: string;
  bundleId?: string;
  env: Record<string, string>;
  continueOnError: boolean;
  outputFormat: 'junit' | 'html';
  outputDir: string;
  debug: boolean;
}): string[] {
  const args: string[] = ['test'];

  // Device selection
  args.push('--device', options.udid);

  // Output format and location
  args.push('--format', options.outputFormat);
  args.push('--output', path.join(options.outputDir, 'report.xml'));

  // Environment variables
  for (const [key, value] of Object.entries(options.env)) {
    args.push('-e', `${key}=${value}`);
  }

  // Continue on error
  if (options.continueOnError) {
    args.push('--continue-on-failure');
  }

  // Debug mode
  if (options.debug) {
    args.push('--debug-output', options.outputDir);
  }

  // Flow file (must be last)
  args.push(options.flowPath);

  return args;
}

/**
 * Run Maestro CLI with timeout support.
 */
async function runMaestroWithTimeout(
  args: string[],
  cwd?: string,
  timeout?: number
): Promise<{ stdout: string; stderr: string; exitCode: number | string }> {
  // Maestro CLI's runMaestro doesn't support timeout directly,
  // so we use Promise.race with a timeout
  if (timeout) {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Flow execution timed out after ${timeout}ms`)), timeout);
    });

    try {
      const result = await Promise.race([runMaestroCli(args, cwd), timeoutPromise]);
      return result;
    } catch (e) {
      return {
        stdout: '',
        stderr: e instanceof Error ? e.message : String(e),
        exitCode: 'TIMEOUT',
      };
    }
  }

  return runMaestroCli(args, cwd);
}

// =============================================================================
// Output Parsing
// =============================================================================

interface ParsedFlowOutput {
  steps: FlowStepResult[];
  totalSteps: number;
  passedSteps: number;
  failedSteps: number;
  skippedSteps: number;
  errorMessage?: string;
}

/**
 * Parse Maestro console output to extract step results.
 *
 * Maestro output format varies, but generally includes:
 * - Step status indicators (✓ for pass, ✗ for fail)
 * - Step descriptions
 * - Error messages
 * - Summary lines
 */
function parseFlowOutput(output: string): ParsedFlowOutput {
  const steps: FlowStepResult[] = [];
  let errorMessage: string | undefined;
  let stepIndex = 0;

  const lines = output.split('\n');

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    // Check for passed step
    const passMatch = trimmedLine.match(/^[✓✔☑️]\s*(.+)$/);
    if (passMatch) {
      steps.push({
        index: stepIndex++,
        name: passMatch[1].trim(),
        passed: true,
      });
      continue;
    }

    // Check for failed step
    const failMatch = trimmedLine.match(/^[✗✘☒❌]\s*(.+)$/);
    if (failMatch) {
      steps.push({
        index: stepIndex++,
        name: failMatch[1].trim(),
        passed: false,
        error: 'Step failed',
      });
      continue;
    }

    // Check for error message
    const errorMatch = trimmedLine.match(/^(?:Error|FAILED|Exception)[:\s]+(.+)$/i);
    if (errorMatch && !errorMessage) {
      errorMessage = errorMatch[1].trim();
    }

    // Check for assertion failures
    if (trimmedLine.toLowerCase().includes('assertion failed')) {
      errorMessage = errorMessage || trimmedLine;
    }

    // Check for timeout
    if (trimmedLine.toLowerCase().includes('timed out')) {
      errorMessage = errorMessage || trimmedLine;
    }
  }

  // Calculate statistics
  const passedSteps = steps.filter((s) => s.passed).length;
  const failedSteps = steps.filter((s) => !s.passed).length;
  const totalSteps = steps.length;

  // If no steps parsed, try to extract from summary line
  if (totalSteps === 0) {
    const summaryMatch = output.match(/(\d+)\s+(?:steps?|tests?)\s+(?:passed|completed)/i);
    if (summaryMatch) {
      // Create a synthetic step
      steps.push({
        index: 0,
        name: 'Flow execution',
        passed: !output.toLowerCase().includes('failed'),
      });
    }
  }

  return {
    steps,
    totalSteps: Math.max(totalSteps, passedSteps + failedSteps),
    passedSteps,
    failedSteps,
    skippedSteps: 0, // Maestro doesn't typically skip steps
    errorMessage,
  };
}

// =============================================================================
// Flow Validation
// =============================================================================

/**
 * Validate a flow file before running.
 *
 * @param flowPath - Path to the YAML flow file
 * @returns Validation result with any errors
 */
export async function validateFlow(flowPath: string): Promise<IOSResult<{ valid: boolean; errors: string[] }>> {
  try {
    await access(flowPath);
  } catch {
    return {
      success: false,
      error: `Flow file not found: ${flowPath}`,
      errorCode: 'COMMAND_FAILED',
    };
  }

  // Read and do basic YAML validation
  try {
    const content = await readFile(flowPath, 'utf-8');
    const errors: string[] = [];

    // Basic validation checks
    if (!content.trim()) {
      errors.push('Flow file is empty');
    }

    // Check for common required elements
    if (!content.includes('- ')) {
      errors.push('Flow file appears to have no steps (no YAML list items found)');
    }

    // Check for known action types
    const knownActions = [
      'launchApp',
      'stopApp',
      'tapOn',
      'tap',
      'inputText',
      'scroll',
      'scrollUntilVisible',
      'assertVisible',
      'assertNotVisible',
      'takeScreenshot',
      'swipe',
      'waitFor',
      'extendedWaitUntil',
      'openLink',
      'pressKey',
      'hideKeyboard',
      'eraseText',
      'wait',
      'copyTextFrom',
    ];

    const hasKnownAction = knownActions.some((action) =>
      content.includes(`- ${action}`) || content.includes(`${action}:`)
    );

    if (!hasKnownAction && content.includes('- ')) {
      errors.push('Flow file may contain unrecognized actions');
    }

    return {
      success: true,
      data: {
        valid: errors.length === 0,
        errors,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to read flow file: ${error instanceof Error ? error.message : String(error)}`,
      errorCode: 'COMMAND_FAILED',
    };
  }
}

/**
 * Run Maestro's validate command on a flow file.
 *
 * @param flowPath - Path to the YAML flow file
 * @returns Validation result from Maestro
 */
export async function validateFlowWithMaestro(flowPath: string): Promise<IOSResult<string>> {
  const available = await isMaestroAvailable();
  if (!available) {
    return {
      success: false,
      error: 'Maestro CLI is not installed',
      errorCode: 'COMMAND_FAILED',
    };
  }

  // Use runMaestro from maestro-cli module
  const { runMaestro: runMaestroCli } = await import('./maestro-cli');
  const result = await runMaestroCli(['validate', flowPath]);

  if (result.exitCode !== 0) {
    return {
      success: false,
      error: result.stderr || 'Validation failed',
      errorCode: 'COMMAND_FAILED',
    };
  }

  return {
    success: true,
    data: result.stdout,
  };
}

// =============================================================================
// Retry Support
// =============================================================================

/**
 * Options for running a flow with retry support
 */
export interface FlowRunWithRetryOptions extends FlowRunOptions {
  /** Maximum number of retry attempts (default: 1, meaning no retries) */
  maxRetries?: number;
  /** Delay between retries in milliseconds (default: 2000) */
  retryDelay?: number;
  /** Only retry on specific error patterns */
  retryOnErrors?: string[];
}

/**
 * Run a flow with automatic retry support.
 *
 * @param options - Flow run options with retry settings
 * @returns FlowRunResult from the successful run or last attempt
 */
export async function runFlowWithRetry(
  options: FlowRunWithRetryOptions
): Promise<IOSResult<FlowRunResult>> {
  const { maxRetries = 1, retryDelay = 2000, retryOnErrors, ...runOptions } = options;

  let lastResult: IOSResult<FlowRunResult> | undefined;
  let attempt = 0;

  while (attempt < maxRetries) {
    attempt++;
    logger.debug(`${LOG_CONTEXT} Flow attempt ${attempt}/${maxRetries}`, LOG_CONTEXT);

    lastResult = await runFlow(runOptions);

    // Success - return immediately
    if (lastResult.success && lastResult.data?.passed) {
      if (attempt > 1) {
        logger.info(`${LOG_CONTEXT} Flow passed on attempt ${attempt}`, LOG_CONTEXT);
      }
      return lastResult;
    }

    // Check if we should retry based on error patterns
    if (retryOnErrors && lastResult.data?.error) {
      const shouldRetry = retryOnErrors.some((pattern) =>
        lastResult!.data!.error!.toLowerCase().includes(pattern.toLowerCase())
      );
      if (!shouldRetry) {
        logger.debug(`${LOG_CONTEXT} Error does not match retry patterns, not retrying`, LOG_CONTEXT);
        break;
      }
    }

    // Not the last attempt - wait before retrying
    if (attempt < maxRetries) {
      logger.debug(`${LOG_CONTEXT} Waiting ${retryDelay}ms before retry`, LOG_CONTEXT);
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  }

  return lastResult!;
}

// =============================================================================
// Batch Flow Execution
// =============================================================================

/**
 * Result of running multiple flows
 */
export interface BatchFlowResult {
  /** Total number of flows */
  totalFlows: number;
  /** Number of passed flows */
  passedFlows: number;
  /** Number of failed flows */
  failedFlows: number;
  /** Individual flow results */
  results: FlowRunResult[];
  /** Total duration in milliseconds */
  totalDuration: number;
}

/**
 * Run multiple flows in sequence.
 *
 * @param flowPaths - Array of flow file paths
 * @param options - Common options for all flows
 * @returns Combined results from all flows
 */
export async function runFlows(
  flowPaths: string[],
  options: Omit<FlowRunOptions, 'flowPath'>
): Promise<IOSResult<BatchFlowResult>> {
  const startTime = Date.now();
  const results: FlowRunResult[] = [];

  logger.info(`${LOG_CONTEXT} Running ${flowPaths.length} flows`, LOG_CONTEXT);

  for (let i = 0; i < flowPaths.length; i++) {
    const flowPath = flowPaths[i];
    logger.debug(`${LOG_CONTEXT} Running flow ${i + 1}/${flowPaths.length}: ${flowPath}`, LOG_CONTEXT);

    const result = await runFlow({ ...options, flowPath });

    if (result.success && result.data) {
      results.push(result.data);

      // If this flow failed and we're not continuing on error, stop
      if (!result.data.passed && !options.continueOnError) {
        logger.warn(`${LOG_CONTEXT} Flow failed, stopping batch execution`, LOG_CONTEXT);
        break;
      }
    } else {
      // Create a failed result entry for the flow that couldn't run
      results.push({
        passed: false,
        duration: 0,
        flowPath,
        udid: options.udid || '',
        totalSteps: 0,
        passedSteps: 0,
        failedSteps: 0,
        skippedSteps: 0,
        steps: [],
        rawOutput: '',
        error: result.error || 'Failed to run flow',
        exitCode: 'ERROR',
      });

      if (!options.continueOnError) {
        break;
      }
    }
  }

  const totalDuration = Date.now() - startTime;
  const passedFlows = results.filter((r) => r.passed).length;
  const failedFlows = results.length - passedFlows;

  logger.info(
    `${LOG_CONTEXT} Batch complete: ${passedFlows}/${results.length} flows passed in ${totalDuration}ms`,
    LOG_CONTEXT
  );

  return {
    success: true,
    data: {
      totalFlows: flowPaths.length,
      passedFlows,
      failedFlows,
      results,
      totalDuration,
    },
  };
}
