/**
 * iOS Swipe Action
 *
 * Performs a swipe gesture on the iOS simulator.
 * Uses the native XCUITest driver for swipe gestures.
 *
 * Example YAML usage:
 * ```yaml
 * - action: ios.swipe
 *   inputs:
 *     direction: left
 *     app: com.example.myapp
 *
 * - action: ios.swipe
 *   inputs:
 *     direction: up
 *     velocity: fast
 *     from: "#card_element"
 *     app: com.example.myapp
 * ```
 */

import { defineAction } from '../action-registry';
import type { ActionResult } from '../types';
import * as iosTools from '../../../../main/ios-tools';
import type { Simulator } from '../../../../main/ios-tools';

/**
 * Input parameters for the ios.swipe action
 */
export interface IosSwipeInputs {
  /** Swipe direction: up, down, left, right (required) */
  direction: 'up' | 'down' | 'left' | 'right';
  /** Bundle ID of the app (required) */
  app: string;
  /** Simulator name or UDID (default: first booted simulator) */
  simulator?: string;
  /** Swipe velocity: slow, normal, fast (default: normal) */
  velocity?: 'slow' | 'normal' | 'fast';
  /** Start swipe from specific element: #identifier or "label" */
  from?: string;
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
  // Identifier: #element_id
  if (target.startsWith('#')) {
    return iosTools.byId(target.slice(1));
  }

  // Quoted label: "Element Label"
  if (target.startsWith('"') && target.endsWith('"')) {
    return iosTools.byLabel(target.slice(1, -1));
  }

  // Default: treat as label
  return iosTools.byLabel(target);
}

/**
 * iOS Swipe action definition
 */
export const iosSwipeAction = defineAction<IosSwipeInputs>({
  name: 'ios.swipe',
  description: 'Perform a swipe gesture on the iOS simulator',

  inputs: {
    direction: {
      type: 'string',
      required: true,
      description: 'Swipe direction: up, down, left, right',
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
    velocity: {
      type: 'string',
      required: false,
      default: 'normal',
      description: 'Swipe velocity: slow, normal, fast',
    },
    from: {
      type: 'string',
      required: false,
      description: 'Start swipe from specific element: #identifier or "label"',
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
      description: 'Whether the swipe was successful',
    },
    direction: {
      type: 'string',
      description: 'Swipe direction used',
    },
    velocity: {
      type: 'string',
      description: 'Swipe velocity used',
    },
    from: {
      type: 'string',
      description: 'Starting element (if specified)',
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
      if (!inputs.direction) {
        return {
          success: false,
          message: 'Direction is required',
          error: 'The "direction" input is required. Specify up, down, left, or right.',
          elapsedMs: Date.now() - startTime,
        };
      }

      const validDirections = ['up', 'down', 'left', 'right'];
      if (!validDirections.includes(inputs.direction)) {
        return {
          success: false,
          message: 'Invalid direction',
          error: `Direction must be one of: ${validDirections.join(', ')}. Got: ${inputs.direction}`,
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

      // Validate velocity if specified
      const validVelocities = ['slow', 'normal', 'fast'];
      if (inputs.velocity && !validVelocities.includes(inputs.velocity)) {
        return {
          success: false,
          message: 'Invalid velocity',
          error: `Velocity must be one of: ${validVelocities.join(', ')}. Got: ${inputs.velocity}`,
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

      // Create native driver
      const driver = iosTools.createNativeDriver({
        bundleId: inputs.app,
        udid,
        timeout: inputs.timeout ?? 10000,
      });

      // Parse starting element if specified
      let startTarget: iosTools.NativeActionTarget | undefined;
      if (inputs.from) {
        startTarget = parseTarget(inputs.from);
        if (inputs.timeout) {
          startTarget.timeout = inputs.timeout;
        }
      }

      // Create swipe action request
      const actionRequest = iosTools.nativeSwipe(
        inputs.direction as iosTools.NativeSwipeDirection,
        {
          target: startTarget,
          velocity: inputs.velocity as iosTools.NativeSwipeVelocity,
        }
      );

      // Execute the action
      const result = await driver.execute(actionRequest);

      if (!result.success) {
        // Provide helpful error message
        const errorMessage = result.error || 'Failed to swipe';

        let suggestions: string[] = [];
        if (result.error?.includes('not found') || result.error?.includes('not yet implemented')) {
          suggestions.push(
            'Use /ios.run_flow with a Maestro flow for more reliable swiping',
            'Verify the starting element exists using /ios.inspect',
            'Try swiping without specifying a starting element'
          );
        }

        const fromDesc = inputs.from ? ` from ${inputs.from}` : '';
        return {
          success: false,
          message: `Failed to swipe ${inputs.direction}${fromDesc}`,
          error: errorMessage,
          data: {
            direction: inputs.direction,
            velocity: inputs.velocity || 'normal',
            from: inputs.from,
            suggestions,
          },
          elapsedMs: Date.now() - startTime,
        };
      }

      // Build output
      const outputData = {
        success: true,
        direction: inputs.direction,
        velocity: inputs.velocity || 'normal',
        from: inputs.from,
        duration: result.data?.duration ?? Date.now() - startTime,
        element: result.data?.details?.element,
      };

      const fromDesc = inputs.from ? ` from ${inputs.from}` : '';
      return {
        success: true,
        message: `Swiped ${inputs.direction}${fromDesc}`,
        data: outputData,
        elapsedMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to swipe',
        error: error instanceof Error ? error.message : String(error),
        elapsedMs: Date.now() - startTime,
      };
    }
  },
});
