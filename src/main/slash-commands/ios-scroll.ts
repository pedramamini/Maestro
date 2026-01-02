/**
 * iOS Scroll Slash Command Handler
 *
 * Handles the /ios.scroll command which scrolls in the iOS simulator.
 * Uses the native XCUITest driver for reliable scroll/gesture interactions.
 *
 * Usage:
 *   /ios.scroll <direction>           - scroll up/down/left/right
 *   /ios.scroll --to <target>         - scroll until element is visible
 *   /ios.scroll --to #identifier      - scroll to element by ID
 *   /ios.scroll --to "label"          - scroll to element by label
 *
 * Options:
 *   --to, -t          Target element to scroll to (identifier or label)
 *   --simulator, -s   Target simulator name or UDID (default: first booted)
 *   --app, -a         App bundle ID (required for native driver)
 *   --distance <n>    Scroll distance as fraction of screen (0.0-1.0, default: 0.5)
 *   --attempts <n>    Max attempts when scrolling to element (default: 10)
 *   --in <target>     Scroll within a specific container element
 *   --timeout <ms>    Element wait timeout in milliseconds (default: 10000)
 *   --debug           Enable debug output
 */

import * as iosTools from '../ios-tools';
import {
  NativeDriver,
  byId,
  byLabel,
  scroll,
  scrollTo,
  ActionResult,
  ActionTarget,
  SwipeDirection,
} from '../ios-tools/native-driver';
import { logger } from '../utils/logger';

const LOG_CONTEXT = '[SlashCmd-ios.scroll]';

// =============================================================================
// Types
// =============================================================================

/**
 * Scroll direction
 */
export type ScrollDirection = 'up' | 'down' | 'left' | 'right';

/**
 * Target type for scroll-to command
 */
export type ScrollTargetType = 'identifier' | 'label';

/**
 * Parsed scroll target
 */
export interface ScrollTarget {
  type: ScrollTargetType;
  value: string;
}

/**
 * Parsed arguments from /ios.scroll command
 */
export interface ScrollCommandArgs {
  /** Scroll direction (up/down/left/right) */
  direction?: ScrollDirection;
  /** Target element to scroll to (optional) */
  target?: ScrollTarget;
  /** Container element to scroll within (optional) */
  container?: ScrollTarget;
  /** Simulator name or UDID */
  simulator?: string;
  /** App bundle ID */
  app?: string;
  /** Scroll distance as fraction (0.0-1.0) */
  distance?: number;
  /** Max attempts when scrolling to element */
  attempts?: number;
  /** Element wait timeout in milliseconds */
  timeout?: number;
  /** Debug mode */
  debug?: boolean;
  /** Raw input (unparsed portion) */
  raw?: string;
}

/**
 * Result of executing the scroll command
 */
export interface ScrollCommandResult {
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
 * Parse a direction string into a ScrollDirection.
 *
 * @param directionString - The raw direction string
 * @returns Parsed direction or null if invalid
 */
export function parseDirection(directionString: string): ScrollDirection | null {
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
 * Parse a target string into a ScrollTarget.
 *
 * Supported formats:
 *   #identifier     - accessibility identifier (e.g., #settings_item)
 *   "label text"    - accessibility label (e.g., "Settings")
 *   'label text'    - accessibility label with single quotes
 *
 * @param targetString - The raw target string
 * @returns Parsed target or null if invalid
 */
export function parseScrollTarget(targetString: string): ScrollTarget | null {
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

// =============================================================================
// Argument Parsing
// =============================================================================

/**
 * Parse command line arguments from /ios.scroll command text.
 *
 * @param commandText - Full command text including /ios.scroll
 * @returns Parsed arguments
 */
export function parseScrollArgs(commandText: string): ScrollCommandArgs {
  const args: ScrollCommandArgs = {};

  // Remove the command prefix
  const argsText = commandText.replace(/^\/ios\.scroll\s*/, '').trim();
  if (!argsText) {
    return args;
  }

  // Tokenize respecting quoted strings
  const tokens = tokenize(argsText);

  let i = 0;
  let directionTokens: string[] = [];

  while (i < tokens.length) {
    const token = tokens[i];

    // Handle --to or -t (scroll to target)
    if (token === '--to' || token === '-t') {
      if (i + 1 < tokens.length) {
        const targetStr = tokens[++i];
        const target = parseScrollTarget(targetStr);
        if (target) {
          args.target = target;
        } else {
          args.raw = targetStr;
        }
      }
    }
    // Handle --in (scroll within container)
    else if (token === '--in') {
      if (i + 1 < tokens.length) {
        const containerStr = tokens[++i];
        const container = parseScrollTarget(containerStr);
        if (container) {
          args.container = container;
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
    // Handle --distance
    else if (token === '--distance') {
      if (i + 1 < tokens.length) {
        const distanceStr = tokens[++i];
        const distance = parseFloat(distanceStr);
        if (!isNaN(distance) && distance >= 0 && distance <= 1) {
          args.distance = distance;
        }
      }
    }
    // Handle --attempts
    else if (token === '--attempts') {
      if (i + 1 < tokens.length) {
        const attemptsStr = tokens[++i];
        const attempts = parseInt(attemptsStr, 10);
        if (!isNaN(attempts) && attempts > 0) {
          args.attempts = attempts;
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
    const direction = parseDirection(directionString);
    if (direction) {
      args.direction = direction;
    } else if (!args.target) {
      // If not a valid direction and no target, might be a target without --to
      const target = parseScrollTarget(directionString);
      if (target) {
        args.target = target;
      } else {
        args.raw = directionString;
      }
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
 * Execute the /ios.scroll command.
 *
 * @param commandText - Full command text
 * @param sessionId - Session ID for context
 * @param cwd - Current working directory (unused but kept for API consistency)
 * @returns Command result with formatted output
 */
export async function executeScrollCommand(
  commandText: string,
  _sessionId: string,
  _cwd?: string
): Promise<ScrollCommandResult> {
  logger.info(`${LOG_CONTEXT} Executing scroll command: ${commandText}`);

  // Parse arguments
  const args = parseScrollArgs(commandText);
  logger.debug(`${LOG_CONTEXT} Parsed args`, LOG_CONTEXT, args);

  // Validate: need either direction or target
  if (!args.direction && !args.target) {
    return {
      success: false,
      output: formatError('No direction or target specified. Use /ios.scroll up|down|left|right or /ios.scroll --to <target>'),
      error: 'No direction or target specified',
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

  // Build container target if specified
  let containerTarget: ActionTarget | undefined;
  if (args.container) {
    switch (args.container.type) {
      case 'identifier':
        containerTarget = byId(args.container.value);
        break;
      case 'label':
        containerTarget = byLabel(args.container.value);
        break;
    }
  }

  // Build action based on whether we're scrolling to target or in direction
  let action;
  if (args.target) {
    // Scroll to specific element
    let scrollTarget: ActionTarget;
    switch (args.target.type) {
      case 'identifier':
        scrollTarget = byId(args.target.value);
        break;
      case 'label':
        scrollTarget = byLabel(args.target.value);
        break;
    }

    action = scrollTo(scrollTarget, {
      direction: args.direction,
      maxAttempts: args.attempts,
    });
  } else {
    // Scroll in direction
    action = scroll(args.direction as SwipeDirection, {
      target: containerTarget,
      distance: args.distance,
    });
  }

  // Execute action
  const result = await driver.execute(action);

  // Handle execution failure
  if (!result.success) {
    return {
      success: false,
      output: formatExecutionError(args, result.error || 'Scroll action failed'),
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
  return `## iOS Scroll Failed

**Error**: ${error}

### Usage
\`\`\`
/ios.scroll <direction> --app <bundleId>
/ios.scroll --to <target> --app <bundleId>
\`\`\`

### Directions
- \`up\` or \`u\` - scroll up
- \`down\` or \`d\` - scroll down
- \`left\` or \`l\` - scroll left
- \`right\` or \`r\` - scroll right

### Target Formats (for --to)
- \`#identifier\` - scroll to element by accessibility ID (e.g., \`#settings_item\`)
- \`"label text"\` - scroll to element by label (e.g., \`"Settings"\`)

### Options
- \`--app, -a <bundleId>\` - App bundle ID (required)
- \`--to, -t <target>\` - Target element to scroll to
- \`--simulator, -s <name|udid>\` - Target simulator
- \`--distance <n>\` - Scroll distance (0.0-1.0, default: 0.5)
- \`--attempts <n>\` - Max scroll attempts when targeting element (default: 10)
- \`--in <target>\` - Scroll within a specific container
- \`--timeout <ms>\` - Element wait timeout (default: 10000)
- \`--debug\` - Enable debug output

### Examples
\`\`\`
/ios.scroll down --app com.example.app
/ios.scroll up --distance 0.8 --app com.example.app
/ios.scroll --to #footer_element --app com.example.app
/ios.scroll --to "Privacy Policy" -a com.example.app
/ios.scroll down --in #scroll_view --app com.example.app
\`\`\`
`;
}

/**
 * Format an execution error with context.
 */
function formatExecutionError(args: ScrollCommandArgs, error: string): string {
  let actionDesc: string;
  if (args.target) {
    const targetDesc = args.target.type === 'identifier'
      ? `\`#${args.target.value}\``
      : `\`"${args.target.value}"\``;
    actionDesc = `scroll to ${targetDesc}`;
  } else {
    actionDesc = `scroll ${args.direction}`;
  }

  return `## iOS Scroll Failed

**Action**: ${actionDesc}
**Error**: ${error}

### Troubleshooting
- Ensure the app is running and in foreground
- For scroll-to, verify the target element exists in the scrollable area
- Use \`/ios.inspect\` to view the current UI hierarchy
- Check the accessibility identifier/label matches exactly
- Try increasing attempts with \`--attempts 20\`
- Increase timeout if the element appears after a delay: \`--timeout 15000\`

### Note
The native XCUITest driver is not yet fully implemented.
For now, consider using Maestro Mobile flows: \`/ios.run_flow --inline "scroll:${args.direction || 'down'}"\`
`;
}

/**
 * Format a success message.
 */
function formatSuccess(args: ScrollCommandArgs, result: ActionResult): string {
  let actionDesc: string;
  if (args.target) {
    const targetDesc = args.target.type === 'identifier'
      ? `#${args.target.value}`
      : `"${args.target.value}"`;
    actionDesc = `Scroll To \`${targetDesc}\``;
  } else {
    const directionCapitalized = args.direction
      ? args.direction.charAt(0).toUpperCase() + args.direction.slice(1)
      : 'Unknown';
    actionDesc = `Scroll ${directionCapitalized}`;
  }

  const statusIcon = result.success ? '✓' : '✗';
  const statusText = result.success ? 'Success' : 'Failed';

  let output = `## ${statusIcon} iOS ${actionDesc}

**Status**: ${statusText}
**Duration**: ${result.duration}ms
`;

  if (args.distance !== undefined) {
    output += `**Distance**: ${args.distance}\n`;
  }

  if (args.container) {
    const containerDesc = args.container.type === 'identifier'
      ? `#${args.container.value}`
      : `"${args.container.value}"`;
    output += `**Container**: \`${containerDesc}\`\n`;
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

  if (result.details?.scrollAttempts) {
    output += `
### Scroll Details
- **Attempts**: ${result.details.scrollAttempts}
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
 * Metadata for the /ios.scroll command.
 * Used for autocomplete and help.
 */
export const scrollCommandMetadata = {
  command: '/ios.scroll',
  description: 'Scroll in a direction or scroll to an element on the iOS simulator',
  usage: '/ios.scroll <direction> --app <bundleId> or /ios.scroll --to <target> --app <bundleId>',
  options: [
    {
      name: '--app, -a',
      description: 'App bundle ID (required)',
      valueHint: '<bundleId>',
    },
    {
      name: '--to, -t',
      description: 'Target element to scroll to',
      valueHint: '<#identifier|"label">',
    },
    {
      name: '--simulator, -s',
      description: 'Target simulator name or UDID (default: first booted)',
      valueHint: '<name|udid>',
    },
    {
      name: '--distance',
      description: 'Scroll distance as fraction of screen (0.0-1.0, default: 0.5)',
      valueHint: '<n>',
    },
    {
      name: '--attempts',
      description: 'Max attempts when scrolling to element (default: 10)',
      valueHint: '<n>',
    },
    {
      name: '--in',
      description: 'Scroll within a specific container element',
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
    '/ios.scroll down --app com.example.app',
    '/ios.scroll up --distance 0.8 --app com.example.app',
    '/ios.scroll left -a com.example.app -s "iPhone 15 Pro"',
    '/ios.scroll --to #footer_element --app com.example.app',
    '/ios.scroll --to "Privacy Policy" -a com.example.app',
    '/ios.scroll down --in #scroll_view --app com.example.app',
    '/ios.scroll --to #item --attempts 20 --app com.example.app',
  ],
};
