/**
 * iOS Tap Slash Command Handler
 *
 * Handles the /ios.tap command which taps an element on the iOS simulator.
 * Uses the native XCUITest driver for reliable element interaction.
 *
 * Usage:
 *   /ios.tap <target>
 *   /ios.tap #identifier       - tap by accessibility identifier
 *   /ios.tap "label text"      - tap by accessibility label
 *   /ios.tap 100,200           - tap at coordinates
 *
 * Options:
 *   --simulator, -s   Target simulator name or UDID (default: first booted)
 *   --app, -a         App bundle ID (required for native driver)
 *   --double          Perform double tap instead of single tap
 *   --long <seconds>  Perform long press (default: 1.0 seconds)
 *   --offset <x,y>    Offset from element center (for tap by element)
 *   --timeout <ms>    Element wait timeout in milliseconds (default: 10000)
 *   --debug           Enable debug output
 */

import * as iosTools from '../ios-tools';
import {
  NativeDriver,
  byId,
  byLabel,
  byCoordinates,
  tap,
  doubleTap,
  longPress,
  ActionResult,
} from '../ios-tools/native-driver';
import { logger } from '../utils/logger';

const LOG_CONTEXT = '[SlashCmd-ios.tap]';

// =============================================================================
// Types
// =============================================================================

/**
 * Target type for tap command
 */
export type TapTargetType = 'identifier' | 'label' | 'coordinates';

/**
 * Parsed tap target
 */
export interface TapTarget {
  type: TapTargetType;
  value: string;
  x?: number;
  y?: number;
}

/**
 * Parsed arguments from /ios.tap command
 */
export interface TapCommandArgs {
  /** The target to tap */
  target?: TapTarget;
  /** Simulator name or UDID */
  simulator?: string;
  /** App bundle ID */
  app?: string;
  /** Perform double tap */
  doubleTap?: boolean;
  /** Perform long press (duration in seconds) */
  longPress?: number;
  /** Offset from element center */
  offset?: { x: number; y: number };
  /** Element wait timeout in milliseconds */
  timeout?: number;
  /** Debug mode */
  debug?: boolean;
  /** Raw input (unparsed portion) */
  raw?: string;
}

/**
 * Result of executing the tap command
 */
export interface TapCommandResult {
  success: boolean;
  /** Formatted output for display in AI terminal */
  output: string;
  /** Raw action result (for programmatic use) */
  data?: ActionResult;
  /** Error message if failed */
  error?: string;
}

// =============================================================================
// Target Parsing
// =============================================================================

/**
 * Parse a target string into a TapTarget.
 *
 * Supported formats:
 *   #identifier     - accessibility identifier (e.g., #login_button)
 *   "label text"    - accessibility label (e.g., "Sign In")
 *   'label text'    - accessibility label with single quotes
 *   100,200         - screen coordinates (x,y)
 *
 * @param targetString - The raw target string
 * @returns Parsed target or null if invalid
 */
export function parseTarget(targetString: string): TapTarget | null {
  if (!targetString || targetString.trim().length === 0) {
    return null;
  }

  const target = targetString.trim();

  // Check for identifier format: #identifier
  if (target.startsWith('#')) {
    const identifier = target.slice(1);
    if (identifier.length === 0) {
      return null;
    }
    return { type: 'identifier', value: identifier };
  }

  // Check for quoted label format: "label" or 'label'
  if ((target.startsWith('"') && target.endsWith('"')) ||
      (target.startsWith("'") && target.endsWith("'"))) {
    const label = target.slice(1, -1);
    if (label.length === 0) {
      return null;
    }
    return { type: 'label', value: label };
  }

  // Check for coordinates format: x,y
  const coordMatch = target.match(/^(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)$/);
  if (coordMatch) {
    const x = parseFloat(coordMatch[1]);
    const y = parseFloat(coordMatch[2]);
    return { type: 'coordinates', value: target, x, y };
  }

  // If not matching any known format, treat as identifier without #
  // This provides a more lenient parsing
  return { type: 'identifier', value: target };
}

// =============================================================================
// Argument Parsing
// =============================================================================

/**
 * Parse command line arguments from /ios.tap command text.
 *
 * @param commandText - Full command text including /ios.tap
 * @returns Parsed arguments
 */
export function parseTapArgs(commandText: string): TapCommandArgs {
  const args: TapCommandArgs = {};

  // Remove the command prefix
  const argsText = commandText.replace(/^\/ios\.tap\s*/, '').trim();
  if (!argsText) {
    return args;
  }

  // Tokenize respecting quoted strings
  const tokens = tokenize(argsText);

  let i = 0;
  let targetTokens: string[] = [];

  while (i < tokens.length) {
    const token = tokens[i];

    // Handle --simulator or -s
    if (token === '--simulator' || token === '-s') {
      if (i + 1 < tokens.length) {
        args.simulator = stripQuotes(tokens[++i]);
      }
    }
    // Handle --app or -a
    else if (token === '--app' || token === '-a') {
      if (i + 1 < tokens.length) {
        args.app = stripQuotes(tokens[++i]);
      }
    }
    // Handle --double flag
    else if (token === '--double') {
      args.doubleTap = true;
    }
    // Handle --long with optional duration
    else if (token === '--long') {
      args.longPress = 1.0; // Default duration
      // Check if next token is a number (optional duration)
      if (i + 1 < tokens.length && !tokens[i + 1].startsWith('-')) {
        const duration = parseFloat(tokens[i + 1]);
        if (!isNaN(duration) && duration > 0) {
          args.longPress = duration;
          i++;
        }
      }
    }
    // Handle --offset
    else if (token === '--offset') {
      if (i + 1 < tokens.length) {
        const offsetStr = tokens[++i];
        const offsetMatch = offsetStr.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
        if (offsetMatch) {
          args.offset = {
            x: parseFloat(offsetMatch[1]),
            y: parseFloat(offsetMatch[2]),
          };
        }
      }
    }
    // Handle --timeout
    else if (token === '--timeout') {
      if (i + 1 < tokens.length) {
        const timeoutStr = tokens[++i];
        const timeout = parseInt(timeoutStr, 10);
        if (!isNaN(timeout) && timeout > 0) {
          args.timeout = timeout;
        }
      }
    }
    // Handle --debug flag
    else if (token === '--debug') {
      args.debug = true;
    }
    // Non-flag tokens are part of the target
    else if (!token.startsWith('-')) {
      targetTokens.push(token);
    }

    i++;
  }

  // Parse target from collected tokens
  if (targetTokens.length > 0) {
    const targetString = targetTokens.join(' ');
    const target = parseTarget(targetString);
    if (target) {
      args.target = target;
    } else {
      args.raw = targetString;
    }
  }

  return args;
}

/**
 * Tokenize a string respecting quoted values.
 * Handles both single and double quotes.
 */
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if ((char === '"' || char === "'") && !inQuotes) {
      inQuotes = true;
      quoteChar = char;
      current += char; // Keep quote for target parsing
    } else if (char === quoteChar && inQuotes) {
      inQuotes = false;
      current += char; // Keep quote for target parsing
      quoteChar = '';
    } else if (char === ' ' && !inQuotes) {
      if (current) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

/**
 * Strip surrounding quotes from a string.
 * Used for option values (not targets).
 */
function stripQuotes(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

// =============================================================================
// Command Execution
// =============================================================================

/**
 * Execute the /ios.tap command.
 *
 * @param commandText - Full command text
 * @param sessionId - Session ID for context
 * @param cwd - Current working directory (unused but kept for API consistency)
 * @returns Command result with formatted output
 */
export async function executeTapCommand(
  commandText: string,
  _sessionId: string,
  _cwd?: string
): Promise<TapCommandResult> {
  logger.info(`${LOG_CONTEXT} Executing tap command: ${commandText}`);

  // Parse arguments
  const args = parseTapArgs(commandText);
  logger.debug(`${LOG_CONTEXT} Parsed args`, LOG_CONTEXT, args);

  // Validate target
  if (!args.target) {
    return {
      success: false,
      output: formatError('No target specified. Use /ios.tap #identifier, /ios.tap "label", or /ios.tap x,y'),
      error: 'No target specified',
    };
  }

  // App bundle ID is required for native driver
  if (!args.app) {
    return {
      success: false,
      output: formatError('App bundle ID required. Use --app <bundleId> or -a <bundleId>'),
      error: 'App bundle ID required',
    };
  }

  // Resolve simulator UDID if name was provided
  let udid = args.simulator;
  if (udid && !isUdid(udid)) {
    const resolveResult = await resolveSimulatorName(udid);
    if (!resolveResult.success) {
      return {
        success: false,
        output: formatError(resolveResult.error || 'Failed to find simulator'),
        error: resolveResult.error,
      };
    }
    udid = resolveResult.udid;
  }

  // Create native driver
  const driver = new NativeDriver({
    bundleId: args.app,
    udid,
    timeout: args.timeout,
    debug: args.debug,
  });

  // Build action target
  let actionTarget;
  switch (args.target.type) {
    case 'identifier':
      actionTarget = byId(args.target.value);
      break;
    case 'label':
      actionTarget = byLabel(args.target.value);
      break;
    case 'coordinates':
      actionTarget = byCoordinates(args.target.x!, args.target.y!);
      break;
  }

  // Build action
  let action;
  if (args.longPress !== undefined) {
    action = longPress(actionTarget, args.longPress);
  } else if (args.doubleTap) {
    action = doubleTap(actionTarget);
  } else {
    // Convert offset format to match tap function signature
    const tapOffset = args.offset
      ? { offsetX: args.offset.x, offsetY: args.offset.y }
      : undefined;
    action = tap(actionTarget, tapOffset);
  }

  // Execute action
  const result = await driver.execute(action);

  // Handle execution failure
  if (!result.success) {
    return {
      success: false,
      output: formatExecutionError(args.target, result.error || 'Tap action failed'),
      error: result.error,
    };
  }

  const actionResult = result.data!;

  // Format success output
  const output = formatSuccess(args.target, actionResult, {
    doubleTap: args.doubleTap,
    longPress: args.longPress,
  });

  return {
    success: actionResult.success,
    output,
    data: actionResult,
    error: actionResult.error,
  };
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Check if a string looks like a simulator UDID.
 */
function isUdid(value: string): boolean {
  return /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/.test(
    value
  );
}

/**
 * Resolve a simulator name to its UDID.
 */
async function resolveSimulatorName(
  name: string
): Promise<{ success: boolean; udid?: string; error?: string }> {
  // First try to get booted simulators (most common case)
  const bootedResult = await iosTools.getBootedSimulators();
  if (bootedResult.success && bootedResult.data) {
    const booted = bootedResult.data.find(
      (sim) => sim.name.toLowerCase() === name.toLowerCase()
    );
    if (booted) {
      return { success: true, udid: booted.udid };
    }
  }

  // Fall back to searching all simulators
  const allResult = await iosTools.listSimulators();
  if (!allResult.success || !allResult.data) {
    return {
      success: false,
      error: allResult.error || 'Failed to list simulators',
    };
  }

  // Search by exact name match first
  const exactMatch = allResult.data.find(
    (sim) => sim.name.toLowerCase() === name.toLowerCase()
  );
  if (exactMatch) {
    return { success: true, udid: exactMatch.udid };
  }

  // Search by partial match
  const partialMatch = allResult.data.find((sim) =>
    sim.name.toLowerCase().includes(name.toLowerCase())
  );
  if (partialMatch) {
    return { success: true, udid: partialMatch.udid };
  }

  return {
    success: false,
    error: `No simulator found matching "${name}"`,
  };
}

/**
 * Format an error message for display.
 */
function formatError(error: string): string {
  return `## iOS Tap Failed

**Error**: ${error}

### Usage
\`\`\`
/ios.tap <target> --app <bundleId>
\`\`\`

### Target Formats
- \`#identifier\` - tap by accessibility identifier (e.g., \`#login_button\`)
- \`"label text"\` - tap by accessibility label (e.g., \`"Sign In"\`)
- \`x,y\` - tap at coordinates (e.g., \`100,200\`)

### Options
- \`--app, -a <bundleId>\` - App bundle ID (required)
- \`--simulator, -s <name|udid>\` - Target simulator
- \`--double\` - Double tap instead of single tap
- \`--long [seconds]\` - Long press (default: 1.0s)
- \`--offset <x,y>\` - Offset from element center
- \`--timeout <ms>\` - Element wait timeout (default: 10000)
- \`--debug\` - Enable debug output

### Examples
\`\`\`
/ios.tap #login_button --app com.example.app
/ios.tap "Sign In" -a com.example.app
/ios.tap 100,200 --app com.example.app
/ios.tap #menu --double --app com.example.app
/ios.tap #delete --long 2 --app com.example.app
\`\`\`
`;
}

/**
 * Format an execution error with target context.
 */
function formatExecutionError(target: TapTarget, error: string): string {
  let targetDesc: string;
  switch (target.type) {
    case 'identifier':
      targetDesc = `identifier \`#${target.value}\``;
      break;
    case 'label':
      targetDesc = `label \`"${target.value}"\``;
      break;
    case 'coordinates':
      targetDesc = `coordinates \`(${target.x}, ${target.y})\``;
      break;
  }

  return `## iOS Tap Failed

**Target**: ${targetDesc}
**Error**: ${error}

### Troubleshooting
- Ensure the element exists and is visible on screen
- Use \`/ios.inspect\` to view the current UI hierarchy
- Check the accessibility identifier/label matches exactly
- For coordinates, ensure they are within the screen bounds
- Increase timeout if the element appears after a delay: \`--timeout 15000\`

### Note
The native XCUITest driver is not yet fully implemented.
For now, consider using Maestro Mobile flows: \`/ios.run_flow --inline "tap:${target.type === 'label' ? target.value : target.type === 'identifier' ? target.value : 'element'}"\`
`;
}

/**
 * Format a success message.
 */
function formatSuccess(
  target: TapTarget,
  result: ActionResult,
  options: { doubleTap?: boolean; longPress?: number }
): string {
  let targetDesc: string;
  switch (target.type) {
    case 'identifier':
      targetDesc = `#${target.value}`;
      break;
    case 'label':
      targetDesc = `"${target.value}"`;
      break;
    case 'coordinates':
      targetDesc = `(${target.x}, ${target.y})`;
      break;
  }

  let actionType = 'Tap';
  if (options.doubleTap) {
    actionType = 'Double Tap';
  } else if (options.longPress !== undefined) {
    actionType = `Long Press (${options.longPress}s)`;
  }

  const statusIcon = result.success ? '✓' : '✗';
  const statusText = result.success ? 'Success' : 'Failed';

  let output = `## ${statusIcon} iOS ${actionType}

**Target**: \`${targetDesc}\`
**Status**: ${statusText}
**Duration**: ${result.duration}ms
`;

  if (result.details?.element) {
    output += `
### Element Info
- **Type**: ${result.details.element.type}
- **Enabled**: ${result.details.element.isEnabled}
- **Hittable**: ${result.details.element.isHittable}
`;
    if (result.details.element.frame) {
      const f = result.details.element.frame;
      output += `- **Frame**: (${f.x}, ${f.y}) ${f.width}x${f.height}\n`;
    }
  }

  if (!result.success && result.error) {
    output += `
### Error
${result.error}
`;
  }

  if (result.details?.suggestions && result.details.suggestions.length > 0) {
    output += `
### Similar Elements
${result.details.suggestions.map((s) => `- \`${s}\``).join('\n')}
`;
  }

  if (result.details?.screenshotPath) {
    output += `
### Screenshot
\`${result.details.screenshotPath}\`
`;
  }

  return output;
}

// =============================================================================
// Command Metadata
// =============================================================================

/**
 * Metadata for the /ios.tap command.
 * Used for autocomplete and help.
 */
export const tapCommandMetadata = {
  command: '/ios.tap',
  description: 'Tap an element on the iOS simulator',
  usage: '/ios.tap <target> --app <bundleId> [--simulator <name|udid>]',
  options: [
    {
      name: '--app, -a',
      description: 'App bundle ID (required)',
      valueHint: '<bundleId>',
    },
    {
      name: '--simulator, -s',
      description: 'Target simulator name or UDID (default: first booted)',
      valueHint: '<name|udid>',
    },
    {
      name: '--double',
      description: 'Perform double tap instead of single tap',
      valueHint: null,
    },
    {
      name: '--long',
      description: 'Perform long press (default: 1.0 seconds)',
      valueHint: '<seconds>',
    },
    {
      name: '--offset',
      description: 'Offset from element center for tap',
      valueHint: '<x,y>',
    },
    {
      name: '--timeout',
      description: 'Element wait timeout in milliseconds (default: 10000)',
      valueHint: '<ms>',
    },
    {
      name: '--debug',
      description: 'Enable debug output',
      valueHint: null,
    },
  ],
  examples: [
    '/ios.tap #login_button --app com.example.app',
    '/ios.tap "Sign In" -a com.example.app',
    '/ios.tap 100,200 --app com.example.app',
    '/ios.tap #menu --double --app com.example.app',
    '/ios.tap #delete_button --long 2 --app com.example.app',
    '/ios.tap #cell -s "iPhone 15 Pro" --app com.example.app',
    '/ios.tap #element --offset -10,5 --app com.example.app',
  ],
};
