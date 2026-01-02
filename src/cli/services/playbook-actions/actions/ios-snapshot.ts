/**
 * iOS Snapshot Action
 *
 * Captures screenshot, logs, and crash data from an iOS simulator.
 * Exposes the ios-tools snapshot functionality as a playbook action.
 */

import { defineAction } from '../action-registry';
import type { ActionResult } from '../types';
import * as iosTools from '../../../../main/ios-tools';
import type { Simulator, SnapshotResult } from '../../../../main/ios-tools';

/**
 * Input parameters for the ios.snapshot action
 */
export interface IosSnapshotInputs {
  /** Simulator name or UDID (default: first booted simulator) */
  simulator?: string;
  /** Bundle ID to filter logs to specific app */
  app?: string;
  /** Duration of logs to capture in seconds (default: 60) */
  duration?: number;
  /** Include full crash log content (default: false) */
  include_crash?: boolean;
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
 * iOS Snapshot action definition
 */
export const iosSnapshotAction = defineAction<IosSnapshotInputs>({
  name: 'ios.snapshot',
  description: 'Capture screenshot, logs, and crash data from an iOS simulator',

  inputs: {
    simulator: {
      type: 'string',
      required: false,
      description: 'Simulator name or UDID (default: first booted simulator)',
    },
    app: {
      type: 'string',
      required: false,
      description: 'Bundle ID to filter logs to specific app',
    },
    duration: {
      type: 'number',
      required: false,
      default: 60,
      description: 'Duration of logs to capture in seconds',
    },
    include_crash: {
      type: 'boolean',
      required: false,
      default: false,
      description: 'Include full crash log content in output',
    },
  },

  outputs: {
    screenshotPath: {
      type: 'string',
      description: 'Path to the captured screenshot',
    },
    logsPath: {
      type: 'string',
      description: 'Path to the captured logs file',
    },
    hasCrashes: {
      type: 'boolean',
      description: 'Whether crash logs were found',
    },
    crashPaths: {
      type: 'array',
      description: 'Paths to crash log files',
    },
    artifactDir: {
      type: 'string',
      description: 'Directory containing all artifacts',
    },
    summary: {
      type: 'object',
      description: 'Summary of logs (error count, warning count, etc.)',
    },
  },

  async handler(inputs, context): Promise<ActionResult> {
    const startTime = Date.now();

    try {
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

      // Build snapshot options
      const snapshotOptions: iosTools.SnapshotOptions = {
        udid,
        sessionId: context.sessionId,
        bundleId: inputs.app,
        logDuration: inputs.duration ?? 60,
        includeCrashContent: inputs.include_crash ?? false,
      };

      // Capture the snapshot - returns IOSResult<SnapshotResult>
      const snapshotResult = await iosTools.captureSnapshot(snapshotOptions);

      // Check for failure
      if (!snapshotResult.success || !snapshotResult.data) {
        return {
          success: false,
          message: 'Failed to capture snapshot',
          error: snapshotResult.error || 'Unknown error',
          elapsedMs: Date.now() - startTime,
        };
      }

      const result: SnapshotResult = snapshotResult.data;

      // Format for agent consumption
      const formatted = iosTools.formatSnapshotForAgent(result);

      // Build output data structure
      const outputData = {
        screenshotPath: result.screenshot.path,
        logsPath: result.logs.filePath,
        hasCrashes: result.crashes.hasCrashes,
        crashPaths: result.crashes.reports.map((c) => c.path),
        artifactDir: result.artifactDir,
        snapshotId: result.id,
        summary: {
          totalEntries: result.logs.entries.length,
          errorCount: result.logs.counts.error,
          faultCount: result.logs.counts.fault,
          warningCount: result.logs.counts.warning,
          infoCount: result.logs.counts.info,
          debugCount: result.logs.counts.debug,
        },
        simulator: {
          name: result.simulator.name,
          udid: result.simulator.udid,
          iosVersion: result.simulator.iosVersion,
        },
        // Include the formatted output for agent display
        formattedOutput: formatted.fullOutput,
      };

      // Determine message based on findings
      let message = `Snapshot captured for ${result.simulator.name}`;
      const errorCount = result.logs.counts.error + result.logs.counts.fault;
      if (errorCount > 0) {
        message += ` (${errorCount} errors in logs)`;
      }
      if (result.crashes.hasCrashes) {
        message += ' - CRASH LOGS FOUND';
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
        message: 'Failed to capture snapshot',
        error: error instanceof Error ? error.message : String(error),
        elapsedMs: Date.now() - startTime,
      };
    }
  },
});
