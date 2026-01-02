/**
 * iOS Run Flow Action
 *
 * Executes a Maestro flow YAML file on an iOS simulator.
 * Exposes the flow-runner functionality as a playbook action.
 *
 * Example YAML usage:
 * ```yaml
 * - action: ios.run_flow
 *   inputs:
 *     flow: flows/login_flow.yaml
 *     app: com.example.myapp
 *   store_as: login_result
 *
 * - action: assert
 *   inputs:
 *     condition: "{{ variables.login_result.passed }}"
 *     message: "Login flow should complete successfully"
 * ```
 */

import { defineAction } from '../action-registry';
import type { ActionResult } from '../types';
import * as iosTools from '../../../../main/ios-tools';
import type { Simulator } from '../../../../main/ios-tools';
import * as path from 'path';

/**
 * Input parameters for the ios.run_flow action
 */
export interface IosRunFlowInputs {
  /** Path to the Maestro flow YAML file (required) */
  flow: string;
  /** Bundle ID to target (optional, overrides flow config) */
  app?: string;
  /** Simulator name or UDID (default: first booted simulator) */
  simulator?: string;
  /** Environment variables to pass to the flow */
  env?: Record<string, string>;
  /** Timeout in seconds (default: 300 = 5 minutes) */
  timeout?: number;
  /** Number of retry attempts on failure (default: 1 = no retry) */
  retry?: number;
  /** Delay between retries in seconds (default: 2) */
  retry_delay?: number;
  /** Continue execution on step failure (default: false) */
  continue_on_error?: boolean;
  /** Enable debug mode (default: false) */
  debug?: boolean;
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

  // Look up by name
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
  const bootedResult = await iosTools.getBootedSimulators();
  if (!bootedResult.success || !bootedResult.data) {
    return undefined;
  }
  const booted: Simulator[] = bootedResult.data;
  return booted.length > 0 ? booted[0].udid : undefined;
}

/**
 * iOS Run Flow action definition
 */
export const iosRunFlowAction = defineAction<IosRunFlowInputs>({
  name: 'ios.run_flow',
  description: 'Execute a Maestro flow YAML file on an iOS simulator',

  inputs: {
    flow: {
      type: 'string',
      required: true,
      description: 'Path to the Maestro flow YAML file',
    },
    app: {
      type: 'string',
      required: false,
      description: 'Bundle ID to target (overrides flow config)',
    },
    simulator: {
      type: 'string',
      required: false,
      description: 'Simulator name or UDID (default: first booted simulator)',
    },
    env: {
      type: 'object',
      required: false,
      description: 'Environment variables to pass to the flow',
    },
    timeout: {
      type: 'number',
      required: false,
      default: 300,
      description: 'Timeout in seconds',
    },
    retry: {
      type: 'number',
      required: false,
      default: 1,
      description: 'Number of retry attempts on failure',
    },
    retry_delay: {
      type: 'number',
      required: false,
      default: 2,
      description: 'Delay between retries in seconds',
    },
    continue_on_error: {
      type: 'boolean',
      required: false,
      default: false,
      description: 'Continue execution on step failure',
    },
    debug: {
      type: 'boolean',
      required: false,
      default: false,
      description: 'Enable debug mode',
    },
  },

  outputs: {
    passed: {
      type: 'boolean',
      description: 'Whether the entire flow passed',
    },
    duration: {
      type: 'number',
      description: 'Total duration in milliseconds',
    },
    flowPath: {
      type: 'string',
      description: 'Resolved path to the flow file',
    },
    totalSteps: {
      type: 'number',
      description: 'Total number of steps in the flow',
    },
    passedSteps: {
      type: 'number',
      description: 'Number of steps that passed',
    },
    failedSteps: {
      type: 'number',
      description: 'Number of steps that failed',
    },
    steps: {
      type: 'array',
      description: 'Individual step results',
    },
    failureScreenshotPath: {
      type: 'string',
      description: 'Path to failure screenshot (if captured)',
    },
    reportPath: {
      type: 'string',
      description: 'Path to JUnit XML report',
    },
    formattedOutput: {
      type: 'string',
      description: 'Human-readable formatted output for agent display',
    },
  },

  async handler(inputs, context): Promise<ActionResult> {
    const startTime = Date.now();

    try {
      // Validate required flow path
      if (!inputs.flow || inputs.flow.trim() === '') {
        return {
          success: false,
          message: 'Flow path is required',
          error: 'The "flow" input is required. Specify the path to a Maestro flow YAML file.',
          elapsedMs: Date.now() - startTime,
        };
      }

      // Check if Maestro is available
      const available = await iosTools.isMaestroAvailable();
      if (!available) {
        const detectResult = await iosTools.detectMaestroCli();
        const instructions =
          detectResult.data?.installInstructions ||
          'Install from https://maestro.mobile.dev/';
        return {
          success: false,
          message: 'Maestro CLI is not installed',
          error: `Maestro CLI is required to run flows. ${instructions}`,
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

      // Resolve flow path (relative to cwd if not absolute)
      const flowPath = path.isAbsolute(inputs.flow)
        ? inputs.flow
        : path.resolve(context.cwd, inputs.flow);

      // Build flow run options
      const runOptions: iosTools.FlowRunWithRetryOptions = {
        flowPath,
        sessionId: context.sessionId,
        udid,
        bundleId: inputs.app,
        env: inputs.env,
        timeout: (inputs.timeout ?? 300) * 1000, // Convert to ms
        maxRetries: inputs.retry ?? 1,
        retryDelay: (inputs.retry_delay ?? 2) * 1000, // Convert to ms
        continueOnError: inputs.continue_on_error ?? false,
        debug: inputs.debug ?? false,
        captureOnFailure: true,
      };

      // Run the flow (with retry support if configured)
      const runResult =
        inputs.retry && inputs.retry > 1
          ? await iosTools.runFlowWithRetry(runOptions)
          : await iosTools.runFlow(runOptions);

      // Check for execution failure
      if (!runResult.success || !runResult.data) {
        return {
          success: false,
          message: 'Failed to execute flow',
          error: runResult.error || 'Unknown error',
          elapsedMs: Date.now() - startTime,
        };
      }

      const result = runResult.data;

      // Format for agent consumption
      const formatted = iosTools.formatFlowResult(result, {
        includeSteps: true,
        includeArtifactPaths: true,
      });

      // Build output data structure
      const outputData = {
        passed: result.passed,
        duration: result.duration,
        flowPath: result.flowPath,
        udid: result.udid,
        totalSteps: result.totalSteps,
        passedSteps: result.passedSteps,
        failedSteps: result.failedSteps,
        skippedSteps: result.skippedSteps,
        steps: result.steps,
        failureScreenshotPath: result.failureScreenshotPath,
        reportPath: result.reportPath,
        exitCode: result.exitCode,
        formattedOutput: formatted.markdown,
      };

      // Build message
      let message = result.passed
        ? `Flow passed: ${result.passedSteps}/${result.totalSteps} steps in ${result.duration}ms`
        : `Flow failed: ${result.failedSteps} step(s) failed`;

      if (result.error) {
        message += ` - ${result.error}`;
      }

      return {
        success: result.passed,
        message,
        data: outputData,
        error: result.passed ? undefined : result.error,
        elapsedMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to run flow',
        error: error instanceof Error ? error.message : String(error),
        elapsedMs: Date.now() - startTime,
      };
    }
  },
});
