/**
 * iOS Scroll Action
 *
 * Scrolls within the iOS simulator in a direction or to a specific element.
 * Uses the native XCUITest driver for scroll gestures.
 *
 * Example YAML usage:
 * ```yaml
 * - action: ios.scroll
 *   inputs:
 *     direction: down
 *     app: com.example.myapp
 *
 * - action: ios.scroll
 *   inputs:
 *     to: "#footer_element"
 *     app: com.example.myapp
 *
 * - action: ios.scroll
 *   inputs:
 *     direction: up
 *     in: "#scroll_view"
 *     distance: 0.8
 *     app: com.example.myapp
 * ```
 */

import { defineAction } from '../action-registry';
import type { ActionResult } from '../types';
import * as iosTools from '../../../../main/ios-tools';
import type { Simulator } from '../../../../main/ios-tools';

/**
 * Input parameters for the ios.scroll action
 */
export interface IosScrollInputs {
  /** Bundle ID of the app (required) */
  app: string;
  /** Scroll direction: up, down, left, right */
  direction?: 'up' | 'down' | 'left' | 'right';
  /** Target element to scroll to: #identifier or "label" */
  to?: string;
  /** Container element to scroll within: #identifier or "label" */
  in?: string;
  /** Simulator name or UDID (default: first booted simulator) */
  simulator?: string;
  /** Scroll distance (0.0-1.0, default: 0.5) */
  distance?: number;
  /** Max scroll attempts when targeting an element (default: 10) */
  attempts?: number;
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
 * iOS Scroll action definition
 */
export const iosScrollAction = defineAction<IosScrollInputs>({
  name: 'ios.scroll',
  description: 'Scroll within the iOS simulator in a direction or to an element',

  inputs: {
    app: {
      type: 'string',
      required: true,
      description: 'Bundle ID of the app',
    },
    direction: {
      type: 'string',
      required: false,
      description: 'Scroll direction: up, down, left, right',
    },
    to: {
      type: 'string',
      required: false,
      description: 'Target element to scroll to: #identifier or "label"',
    },
    in: {
      type: 'string',
      required: false,
      description: 'Container element to scroll within: #identifier or "label"',
    },
    simulator: {
      type: 'string',
      required: false,
      description: 'Simulator name or UDID (default: first booted simulator)',
    },
    distance: {
      type: 'number',
      required: false,
      default: 0.5,
      description: 'Scroll distance (0.0-1.0)',
    },
    attempts: {
      type: 'number',
      required: false,
      default: 10,
      description: 'Max scroll attempts when targeting an element',
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
      description: 'Whether the scroll was successful',
    },
    direction: {
      type: 'string',
      description: 'Scroll direction used',
    },
    scrolledTo: {
      type: 'string',
      description: 'Target element scrolled to (if specified)',
    },
    scrolledIn: {
      type: 'string',
      description: 'Container scrolled within (if specified)',
    },
    attempts: {
      type: 'number',
      description: 'Number of scroll attempts made',
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
      if (!inputs.app || inputs.app.trim() === '') {
        return {
          success: false,
          message: 'App bundle ID is required',
          error: 'The "app" input is required. Specify the bundle ID of the app.',
          elapsedMs: Date.now() - startTime,
        };
      }

      // Must specify either direction or target
      if (!inputs.direction && !inputs.to) {
        return {
          success: false,
          message: 'Direction or target is required',
          error: 'Specify either "direction" (up/down/left/right) or "to" (target element).',
          elapsedMs: Date.now() - startTime,
        };
      }

      // Validate direction if specified
      const validDirections = ['up', 'down', 'left', 'right'];
      if (inputs.direction && !validDirections.includes(inputs.direction)) {
        return {
          success: false,
          message: 'Invalid direction',
          error: `Direction must be one of: ${validDirections.join(', ')}. Got: ${inputs.direction}`,
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

      // Create action request based on whether we're scrolling to an element or in a direction
      let actionRequest: iosTools.NativeActionRequest;
      let actionDescription: string;

      if (inputs.to) {
        // Scroll to a specific element
        const target = parseTarget(inputs.to);
        if (inputs.timeout) {
          target.timeout = inputs.timeout;
        }

        actionRequest = iosTools.nativeScrollTo(target, {
          direction: inputs.direction as iosTools.NativeSwipeDirection || 'down',
          maxAttempts: inputs.attempts ?? 10,
        });
        actionDescription = `scroll to ${inputs.to}`;
      } else {
        // Scroll in a direction
        const direction = inputs.direction as iosTools.NativeSwipeDirection;

        // Parse container if specified
        let containerTarget: iosTools.NativeActionTarget | undefined;
        if (inputs.in) {
          containerTarget = parseTarget(inputs.in);
          if (inputs.timeout) {
            containerTarget.timeout = inputs.timeout;
          }
        }

        actionRequest = iosTools.nativeScroll(direction, {
          target: containerTarget,
          distance: inputs.distance ?? 0.5,
        });
        actionDescription = `scroll ${direction}${inputs.in ? ` in ${inputs.in}` : ''}`;
      }

      // Execute the action
      const result = await driver.execute(actionRequest);

      if (!result.success) {
        // Provide helpful error message
        const errorMessage = result.error || 'Failed to scroll';

        let suggestions: string[] = [];
        if (result.error?.includes('not found') || result.error?.includes('not yet implemented')) {
          suggestions.push(
            'Use /ios.run_flow with a Maestro flow for more reliable scrolling',
            'Verify the element exists using /ios.inspect',
            'Check that a scrollable view is present'
          );
        }

        return {
          success: false,
          message: `Failed to ${actionDescription}`,
          error: errorMessage,
          data: {
            direction: inputs.direction,
            to: inputs.to,
            in: inputs.in,
            suggestions,
          },
          elapsedMs: Date.now() - startTime,
        };
      }

      // Build output
      const outputData = {
        success: true,
        direction: inputs.direction || 'down',
        scrolledTo: inputs.to,
        scrolledIn: inputs.in,
        distance: inputs.distance ?? 0.5,
        attempts: result.data?.details?.scrollAttempts,
        duration: result.data?.duration ?? Date.now() - startTime,
        element: result.data?.details?.element,
      };

      return {
        success: true,
        message: `Successfully ${actionDescription}`,
        data: outputData,
        elapsedMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to scroll',
        error: error instanceof Error ? error.message : String(error),
        elapsedMs: Date.now() - startTime,
      };
    }
  },
});
