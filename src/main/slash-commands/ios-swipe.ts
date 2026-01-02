/**
 * iOS Swipe Slash Command Handler
 *
 * Handles the /ios.swipe command which performs swipe gestures on the iOS simulator.
 * Uses the native XCUITest driver for reliable swipe/gesture interactions.
 *
 * Usage:
 *   /ios.swipe <direction>          - swipe up/down/left/right
 *   /ios.swipe left                 - swipe left (e.g., to navigate forward)
 *   /ios.swipe right                - swipe right (e.g., to navigate back)
 *
 * Options:
 *   --simulator, -s   Target simulator name or UDID (default: first booted)
 *   --app, -a         App bundle ID (required for native driver)
 *   --velocity <v>    Swipe velocity: slow, normal, fast (default: normal)
 *   --from <target>   Start swipe from specific element (identifier or label)
 *   --timeout <ms>    Element wait timeout in milliseconds (default: 10000)
 *   --debug           Enable debug output
 */

import * as iosTools from '../ios-tools';
import {
  NativeDriver,
  byId,
  byLabel,
  swipe,
  ActionResult,
  ActionTarget,
  SwipeDirection,
  SwipeVelocity,
} from '../ios-tools/native-driver';
import { logger } from '../utils/logger';

const LOG_CONTEXT = '[SlashCmd-ios.swipe]';

// =============================================================================
// Types
// =============================================================================

/**
 * Swipe direction (re-exported for external use)
 */
export type { SwipeDirection };

/**
 * Target type for swipe starting point
 */
export type SwipeTargetType = 'identifier' | 'label';

/**
 * Parsed swipe target (element to start swipe from)
 */
export interface SwipeTarget {
  type: SwipeTargetType;
  value: string;
}

/**
 * Parsed arguments from /ios.swipe command
 */
export interface SwipeCommandArgs {
  /** Swipe direction (up/down/left/right) */
  direction?: SwipeDirection;
  /** Element to start swipe from (optional) */
  from?: SwipeTarget;
  /** Simulator name or UDID */
  simulator?: string;
  /** App bundle ID */
  app?: string;
  /** Swipe velocity */
  velocity?: SwipeVelocity;
  /** Element wait timeout in milliseconds */
  timeout?: number;
  /** Debug mode */
  debug?: boolean;
  /** Raw input (unparsed portion) */
  raw?: string;
}

/**
 * Result of executing the swipe command
 */
export interface SwipeCommandResult {
  success: boolean;
  /** Formatted output for display in AI terminal */
  output: string;
  /** Raw action result (for programmatic use) */
  data?: ActionResult;
  /** Error message if failed */
  error?: string;
}

// =============================================================================
// Direction Parsing
// =============================================================================

/**
 * Parse a direction string into a SwipeDirection.
 *
 * @param directionString - The raw direction string
 * @returns Parsed direction or null if invalid
 */
export function parseSwipeDirection(directionString: string): SwipeDirection | null {
  if (!directionString || directionString.trim().length === 0) {
    return null;
  }

  const dir = directionString.trim().toLowerCase();

  switch (dir) {
    case 'up':
    case 'u':
      return 'up';
    case 'down':
    case 'd':
      return 'down';
    case 'left':
    case 'l':
      return 'left';
    case 'right':
    case 'r':
      return 'right';
    default:
      return null;
  }
}

// =============================================================================
// Target Parsing
// =============================================================================

/**
 * Parse a target string into a SwipeTarget.
 *
 * Supported formats:
 *   #identifier     - accessibility identifier (e.g., #carousel)
 *   "label text"    - accessibility label (e.g., "Image Gallery")
 *   'label text'    - accessibility label with single quotes
 *
 * @param targetString - The raw target string
 * @returns Parsed target or null if invalid
 */
export function parseSwipeTarget(targetString: string): SwipeTarget | null {
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

  // If not matching any known format, treat as identifier without #
  // This provides a more lenient parsing
  return { type: 'identifier', value: target };
}

/**
 * Parse velocity string into SwipeVelocity.
 *
 * @param velocityString - The raw velocity string
 * @returns Parsed velocity or null if invalid
 */
export function parseVelocity(velocityString: string): SwipeVelocity | null {
  if (!velocityString || velocityString.trim().length === 0) {
    return null;
  }

  const vel = velocityString.trim().toLowerCase();

  switch (vel) {
    case 'slow':
    case 's':
      return 'slow';
    case 'normal':
    case 'n':
      return 'normal';
    case 'fast':
    case 'f':
      return 'fast';
    default:
      return null;
  }
}

// =============================================================================
// Argument Parsing
// =============================================================================

/**
 * Parse command line arguments from /ios.swipe command text.
 *
 * @param commandText - Full command text including /ios.swipe
 * @returns Parsed arguments
 */
export function parseSwipeArgs(commandText: string): SwipeCommandArgs {
  const args: SwipeCommandArgs = {};

  // Remove the command prefix
  const argsText = commandText.replace(/^\/ios\.swipe\s*/, '').trim();
  if (!argsText) {
    return args;
  }

  // Tokenize respecting quoted strings
  const tokens = tokenize(argsText);

  let i = 0;
  let directionTokens: string[] = [];

  while (i < tokens.length) {
    const token = tokens[i];

    // Handle --from (element to start swipe from)
    if (token === '--from') {
      if (i + 1 < tokens.length) {
        const fromStr = tokens[++i];
        const from = parseSwipeTarget(fromStr);
        if (from) {
          args.from = from;
        }
      }
    }
    // Handle --simulator or -s
    else if (token === '--simulator' || token === '-s') {
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
    // Handle --velocity or -v
    else if (token === '--velocity' || token === '-v') {
      if (i + 1 < tokens.length) {
        const velocityStr = tokens[++i];
        const velocity = parseVelocity(velocityStr);
        if (velocity) {
          args.velocity = velocity;
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
    // Non-flag tokens might be direction
    else if (!token.startsWith('-')) {
      directionTokens.push(token);
    }

    i++;
  }

  // Parse direction from collected tokens
  if (directionTokens.length > 0) {
    const directionString = directionTokens.join(' ');
    const direction = parseSwipeDirection(directionString);
    if (direction) {
      args.direction = direction;
    } else {
      args.raw = directionString;
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
 * Execute the /ios.swipe command.
 *
 * @param commandText - Full command text
 * @param sessionId - Session ID for context
 * @param cwd - Current working directory (unused but kept for API consistency)
 * @returns Command result with formatted output
 */
export async function executeSwipeCommand(
  commandText: string,
  _sessionId: string,
  _cwd?: string
): Promise<SwipeCommandResult> {
  logger.info(`${LOG_CONTEXT} Executing swipe command: ${commandText}`);

  // Parse arguments
  const args = parseSwipeArgs(commandText);
  logger.debug(`${LOG_CONTEXT} Parsed args`, LOG_CONTEXT, args);

  // Validate: need direction
  if (!args.direction) {
    return {
      success: false,
      output: formatError('No direction specified. Use /ios.swipe up|down|left|right'),
      error: 'No direction specified',
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

  // Build target if specified
  let fromTarget: ActionTarget | undefined;
  if (args.from) {
    switch (args.from.type) {
      case 'identifier':
        fromTarget = byId(args.from.value);
        break;
      case 'label':
        fromTarget = byLabel(args.from.value);
        break;
    }
  }

  // Build swipe action
  const action = swipe(args.direction, {
    target: fromTarget,
    velocity: args.velocity,
  });

  // Execute action
  const result = await driver.execute(action);

  // Handle execution failure
  if (!result.success) {
    return {
      success: false,
      output: formatExecutionError(args, result.error || 'Swipe action failed'),
      error: result.error,
    };
  }

  const actionResult = result.data!;

  // Format success output
  const output = formatSuccess(args, actionResult);

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
  return `## iOS Swipe Failed

**Error**: ${error}

### Usage
\`\`\`
/ios.swipe <direction> --app <bundleId>
\`\`\`

### Directions
- \`up\` or \`u\` - swipe up (e.g., dismiss modal, pull to refresh)
- \`down\` or \`d\` - swipe down
- \`left\` or \`l\` - swipe left (e.g., delete, next page)
- \`right\` or \`r\` - swipe right (e.g., back navigation)

### Options
- \`--app, -a <bundleId>\` - App bundle ID (required)
- \`--simulator, -s <name|udid>\` - Target simulator
- \`--velocity, -v <slow|normal|fast>\` - Swipe velocity (default: normal)
- \`--from <target>\` - Start swipe from specific element
- \`--timeout <ms>\` - Element wait timeout (default: 10000)
- \`--debug\` - Enable debug output

### Target Formats (for --from)
- \`#identifier\` - swipe from element by accessibility ID (e.g., \`#carousel\`)
- \`"label text"\` - swipe from element by label (e.g., \`"Image Gallery"\`)

### Examples
\`\`\`
/ios.swipe left --app com.example.app
/ios.swipe right -a com.example.app
/ios.swipe up --velocity fast --app com.example.app
/ios.swipe down --from #scrollView --app com.example.app
/ios.swipe left --from "Card View" -a com.example.app
\`\`\`
`;
}

/**
 * Format an execution error with context.
 */
function formatExecutionError(args: SwipeCommandArgs, error: string): string {
  const directionDesc = args.direction
    ? args.direction.charAt(0).toUpperCase() + args.direction.slice(1)
    : 'Unknown';

  let fromDesc = '';
  if (args.from) {
    fromDesc = args.from.type === 'identifier'
      ? ` from \`#${args.from.value}\``
      : ` from \`"${args.from.value}"\``;
  }

  return `## iOS Swipe Failed

**Action**: Swipe ${directionDesc}${fromDesc}
**Error**: ${error}

### Troubleshooting
- Ensure the app is running and in foreground
- For --from targets, verify the element exists and is visible
- Use \`/ios.inspect\` to view the current UI hierarchy
- Check the accessibility identifier/label matches exactly
- Increase timeout if the element appears after a delay: \`--timeout 15000\`

### Note
The native XCUITest driver is not yet fully implemented.
For now, consider using Maestro Mobile flows: \`/ios.run_flow --inline "swipe:${args.direction || 'left'}"\`
`;
}

/**
 * Format a success message.
 */
function formatSuccess(args: SwipeCommandArgs, result: ActionResult): string {
  const directionCapitalized = args.direction
    ? args.direction.charAt(0).toUpperCase() + args.direction.slice(1)
    : 'Unknown';

  let fromDesc = '';
  if (args.from) {
    const targetDesc = args.from.type === 'identifier'
      ? `#${args.from.value}`
      : `"${args.from.value}"`;
    fromDesc = ` from \`${targetDesc}\``;
  }

  const statusIcon = result.success ? '✓' : '✗';
  const statusText = result.success ? 'Success' : 'Failed';

  let output = `## ${statusIcon} iOS Swipe ${directionCapitalized}${fromDesc}

**Status**: ${statusText}
**Duration**: ${result.duration}ms
`;

  if (args.velocity) {
    output += `**Velocity**: ${args.velocity}\n`;
  }

  if (result.details?.element) {
    output += `
### Element Info
- **Type**: ${result.details.element.type}
- **Enabled**: ${result.details.element.isEnabled}
`;
    if (result.details.element.frame) {
      const f = result.details.element.frame;
      output += `- **Frame**: (${f.x}, ${f.y}) ${f.width}x${f.height}\n`;
    }
  }

  if (result.details?.direction) {
    output += `
### Swipe Details
- **Direction**: ${result.details.direction}
`;
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
 * Metadata for the /ios.swipe command.
 * Used for autocomplete and help.
 */
export const swipeCommandMetadata = {
  command: '/ios.swipe',
  description: 'Perform a swipe gesture on the iOS simulator',
  usage: '/ios.swipe <direction> --app <bundleId> [--simulator <name|udid>]',
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
      name: '--velocity, -v',
      description: 'Swipe velocity: slow, normal, fast (default: normal)',
      valueHint: '<velocity>',
    },
    {
      name: '--from',
      description: 'Start swipe from specific element',
      valueHint: '<#identifier|"label">',
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
    '/ios.swipe left --app com.example.app',
    '/ios.swipe right -a com.example.app',
    '/ios.swipe up --velocity fast --app com.example.app',
    '/ios.swipe down -s "iPhone 15 Pro" --app com.example.app',
    '/ios.swipe left --from #carousel --app com.example.app',
    '/ios.swipe right --from "Image Gallery" -a com.example.app',
  ],
};
