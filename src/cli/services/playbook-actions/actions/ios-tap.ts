/**
 * iOS Tap Action
 *
 * Taps an element on the iOS simulator screen.
 * Uses the native XCUITest driver for element interaction.
 *
 * Example YAML usage:
 * ```yaml
 * - action: ios.tap
 *   inputs:
 *     target: "#login_button"
 *     app: com.example.myapp
 *
 * - action: ios.tap
 *   inputs:
 *     target: "Sign In"
 *     app: com.example.myapp
 *     double: true
 *
 * - action: ios.tap
 *   inputs:
 *     target: "100,200"
 *     app: com.example.myapp
 * ```
 */

import { defineAction } from '../action-registry';
import type { ActionResult } from '../types';
import * as iosTools from '../../../../main/ios-tools';
import type { Simulator } from '../../../../main/ios-tools';

/**
 * Input parameters for the ios.tap action
 */
export interface IosTapInputs {
  /** Target element: #identifier, "label", or x,y coordinates (required) */
  target: string;
  /** Bundle ID of the app (required) */
  app: string;
  /** Simulator name or UDID (default: first booted simulator) */
  simulator?: string;
  /** Perform double tap instead of single tap (default: false) */
  double?: boolean;
  /** Perform long press instead of tap (default: false) */
  long?: boolean;
  /** Long press duration in seconds (default: 1.0) */
  duration?: number;
  /** X offset from element center */
  offset_x?: number;
  /** Y offset from element center */
  offset_y?: number;
  /** Timeout for finding element in ms (default: 10000) */
  timeout?: number;
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
 * Parse target string into ActionTarget
 */
function parseTarget(target: string): iosTools.NativeActionTarget {
  // Identifier: #login_button
  if (target.startsWith('#')) {
    return iosTools.byId(target.slice(1));
  }

  // Coordinates: 100,200
  const coordMatch = target.match(/^(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)$/);
  if (coordMatch) {
    const x = parseFloat(coordMatch[1]);
    const y = parseFloat(coordMatch[2]);
    return iosTools.byCoordinates(x, y);
  }

  // Quoted label: "Sign In"
  if (target.startsWith('"') && target.endsWith('"')) {
    return iosTools.byLabel(target.slice(1, -1));
  }

  // Default: treat as label
  return iosTools.byLabel(target);
}

/**
 * iOS Tap action definition
 */
export const iosTapAction = defineAction<IosTapInputs>({
  name: 'ios.tap',
  description: 'Tap an element on the iOS simulator screen',

  inputs: {
    target: {
      type: 'string',
      required: true,
      description: 'Target element: #identifier, "label", or x,y coordinates',
    },
    app: {
      type: 'string',
      required: true,
      description: 'Bundle ID of the app',
    },
    simulator: {
      type: 'string',
      required: false,
      description: 'Simulator name or UDID (default: first booted simulator)',
    },
    double: {
      type: 'boolean',
      required: false,
      default: false,
      description: 'Perform double tap instead of single tap',
    },
    long: {
      type: 'boolean',
      required: false,
      default: false,
      description: 'Perform long press instead of tap',
    },
    duration: {
      type: 'number',
      required: false,
      default: 1.0,
      description: 'Long press duration in seconds',
    },
    offset_x: {
      type: 'number',
      required: false,
      description: 'X offset from element center',
    },
    offset_y: {
      type: 'number',
      required: false,
      description: 'Y offset from element center',
    },
    timeout: {
      type: 'number',
      required: false,
      default: 10000,
      description: 'Timeout for finding element in ms',
    },
  },

  outputs: {
    success: {
      type: 'boolean',
      description: 'Whether the tap was successful',
    },
    actionType: {
      type: 'string',
      description: 'Type of tap performed (tap, doubleTap, longPress)',
    },
    target: {
      type: 'object',
      description: 'Target that was tapped',
    },
    duration: {
      type: 'number',
      description: 'Duration of the action in ms',
    },
    element: {
      type: 'object',
      description: 'Element information (if found)',
    },
  },

  async handler(inputs, _context): Promise<ActionResult> {
    const startTime = Date.now();

    try {
      // Validate required inputs
      if (!inputs.target || inputs.target.trim() === '') {
        return {
          success: false,
          message: 'Target is required',
          error: 'The "target" input is required. Specify an element (#id, "label", or x,y).',
          elapsedMs: Date.now() - startTime,
        };
      }

      if (!inputs.app || inputs.app.trim() === '') {
        return {
          success: false,
          message: 'App bundle ID is required',
          error: 'The "app" input is required. Specify the bundle ID of the app.',
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

      // Parse target
      const target = parseTarget(inputs.target);
      if (inputs.timeout) {
        target.timeout = inputs.timeout;
      }

      // Create native driver
      const driver = iosTools.createNativeDriver({
        bundleId: inputs.app,
        udid,
        timeout: inputs.timeout ?? 10000,
      });

      // Determine action type and create request
      let actionType: string;
      let actionRequest: iosTools.NativeActionRequest;

      if (inputs.long) {
        actionType = 'longPress';
        actionRequest = iosTools.nativeLongPress(target, inputs.duration ?? 1.0);
      } else if (inputs.double) {
        actionType = 'doubleTap';
        actionRequest = iosTools.nativeDoubleTap(target);
      } else {
        actionType = 'tap';
        actionRequest = iosTools.nativeTap(target, {
          offsetX: inputs.offset_x,
          offsetY: inputs.offset_y,
        });
      }

      // Execute the action
      const result = await driver.execute(actionRequest);

      if (!result.success) {
        // Provide helpful error message
        const errorMessage = result.error || 'Failed to tap element';

        // Try to suggest alternatives if element not found
        let suggestions: string[] = [];
        if (result.error?.includes('not found') || result.error?.includes('not yet implemented')) {
          suggestions.push(
            'Use /ios.run_flow with a Maestro flow for more reliable interactions',
            'Verify the element exists using /ios.inspect',
            'Check that the correct app is in the foreground'
          );
        }

        return {
          success: false,
          message: `Failed to ${actionType} on ${inputs.target}`,
          error: errorMessage,
          data: {
            actionType,
            target: inputs.target,
            suggestions,
          },
          elapsedMs: Date.now() - startTime,
        };
      }

      // Build output
      const outputData = {
        success: true,
        actionType,
        target: inputs.target,
        targetParsed: target,
        duration: result.data?.duration ?? Date.now() - startTime,
        element: result.data?.details?.element,
      };

      return {
        success: true,
        message: `${actionType} on ${inputs.target} succeeded`,
        data: outputData,
        elapsedMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to tap element',
        error: error instanceof Error ? error.message : String(error),
        elapsedMs: Date.now() - startTime,
      };
    }
  },
});
