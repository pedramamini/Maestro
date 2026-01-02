/**
 * iOS Type Action
 *
 * Types text into an element on the iOS simulator.
 * Uses the native XCUITest driver for text input.
 *
 * Example YAML usage:
 * ```yaml
 * - action: ios.type
 *   inputs:
 *     text: "user@example.com"
 *     app: com.example.myapp
 *
 * - action: ios.type
 *   inputs:
 *     into: "#email_field"
 *     text: "user@example.com"
 *     app: com.example.myapp
 *     clear: true
 * ```
 */

import { defineAction } from '../action-registry';
import type { ActionResult } from '../types';
import * as iosTools from '../../../../main/ios-tools';
import type { Simulator } from '../../../../main/ios-tools';

/**
 * Input parameters for the ios.type action
 */
export interface IosTypeInputs {
  /** Text to type (required) */
  text: string;
  /** Bundle ID of the app (required) */
  app: string;
  /** Target element to type into: #identifier or "label" (optional - types into focused element if not specified) */
  into?: string;
  /** Simulator name or UDID (default: first booted simulator) */
  simulator?: string;
  /** Clear existing text before typing (default: false) */
  clear?: boolean;
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
  // Identifier: #email_field
  if (target.startsWith('#')) {
    return iosTools.byId(target.slice(1));
  }

  // Quoted label: "Email"
  if (target.startsWith('"') && target.endsWith('"')) {
    return iosTools.byLabel(target.slice(1, -1));
  }

  // Default: treat as label
  return iosTools.byLabel(target);
}

/**
 * iOS Type action definition
 */
export const iosTypeAction = defineAction<IosTypeInputs>({
  name: 'ios.type',
  description: 'Type text into an element or the focused element on iOS simulator',

  inputs: {
    text: {
      type: 'string',
      required: true,
      description: 'Text to type',
    },
    app: {
      type: 'string',
      required: true,
      description: 'Bundle ID of the app',
    },
    into: {
      type: 'string',
      required: false,
      description: 'Target element: #identifier or "label" (optional)',
    },
    simulator: {
      type: 'string',
      required: false,
      description: 'Simulator name or UDID (default: first booted simulator)',
    },
    clear: {
      type: 'boolean',
      required: false,
      default: false,
      description: 'Clear existing text before typing',
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
      description: 'Whether the type action was successful',
    },
    text: {
      type: 'string',
      description: 'Text that was typed',
    },
    target: {
      type: 'string',
      description: 'Target element (if specified)',
    },
    cleared: {
      type: 'boolean',
      description: 'Whether text was cleared first',
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
      if (inputs.text === undefined || inputs.text === null) {
        return {
          success: false,
          message: 'Text is required',
          error: 'The "text" input is required. Specify the text to type.',
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

      // Parse target if provided
      let target: iosTools.NativeActionTarget | undefined;
      if (inputs.into) {
        target = parseTarget(inputs.into);
        if (inputs.timeout) {
          target.timeout = inputs.timeout;
        }
      }

      // Create native driver
      const driver = iosTools.createNativeDriver({
        bundleId: inputs.app,
        udid,
        timeout: inputs.timeout ?? 10000,
      });

      // Create type action request
      const actionRequest = iosTools.nativeTypeText(inputs.text, {
        target,
        clearFirst: inputs.clear ?? false,
      });

      // Execute the action
      const result = await driver.execute(actionRequest);

      if (!result.success) {
        // Provide helpful error message
        const errorMessage = result.error || 'Failed to type text';

        let suggestions: string[] = [];
        if (result.error?.includes('not found') || result.error?.includes('not yet implemented')) {
          suggestions.push(
            'Use /ios.run_flow with a Maestro flow for more reliable text input',
            'Verify the element exists and is focused using /ios.inspect',
            'Try tapping the field first with /ios.tap'
          );
        }

        return {
          success: false,
          message: `Failed to type text${inputs.into ? ` into ${inputs.into}` : ''}`,
          error: errorMessage,
          data: {
            text: inputs.text,
            into: inputs.into,
            suggestions,
          },
          elapsedMs: Date.now() - startTime,
        };
      }

      // Build output
      const outputData = {
        success: true,
        text: inputs.text,
        target: inputs.into,
        cleared: inputs.clear ?? false,
        duration: result.data?.duration ?? Date.now() - startTime,
        element: result.data?.details?.element,
      };

      const targetDesc = inputs.into ? ` into ${inputs.into}` : '';
      return {
        success: true,
        message: `Typed "${inputs.text}"${targetDesc}`,
        data: outputData,
        elapsedMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to type text',
        error: error instanceof Error ? error.message : String(error),
        elapsedMs: Date.now() - startTime,
      };
    }
  },
});
