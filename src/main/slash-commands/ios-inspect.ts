/**
 * iOS Inspect Slash Command Handler
 *
 * Handles the /ios.inspect command which extracts the UI hierarchy
 * from an iOS simulator for structured element inspection.
 *
 * Usage:
 *   /ios.inspect --app <bundleId> [--simulator <name|udid>] [--element <query>]
 *
 * Options:
 *   --app, -a        Bundle ID of the app to inspect (required)
 *   --simulator, -s  Target simulator name or UDID (default: first booted)
 *   --element, -e    Query for specific element(s)
 *   --depth, -d      Maximum tree depth to display (default: unlimited)
 *   --format, -f     Output format: "full", "compact", "json" (default: full)
 *   --no-screenshot  Skip paired screenshot capture
 */

import * as iosTools from '../ios-tools';
import { logger } from '../utils/logger';

const LOG_CONTEXT = '[SlashCmd-ios.inspect]';

// =============================================================================
// Types
// =============================================================================

/**
 * Parsed arguments from /ios.inspect command
 */
export interface InspectCommandArgs {
  /** App bundle ID to inspect (required) */
  app?: string;
  /** Simulator name or UDID */
  simulator?: string;
  /** Element query string */
  element?: string;
  /** Maximum tree depth */
  depth?: number;
  /** Output format */
  format?: 'full' | 'compact' | 'json';
  /** Skip screenshot capture */
  noScreenshot?: boolean;
  /** Raw input (unparsed portion) */
  raw?: string;
}

/**
 * Result of executing the inspect command
 */
export interface InspectCommandResult {
  success: boolean;
  /** Formatted output for display in AI terminal */
  output: string;
  /** Raw inspect result (for programmatic use) */
  data?: iosTools.InspectResult;
  /** Error message if failed */
  error?: string;
}

// =============================================================================
// Argument Parsing
// =============================================================================

/**
 * Parse command line arguments from /ios.inspect command text.
 *
 * Supports:
 *   --app <value> or -a <value>
 *   --simulator <value> or -s <value>
 *   --element <value> or -e <value>
 *   --depth <value> or -d <value>
 *   --format <value> or -f <value>
 *   --no-screenshot (flag, no value)
 *
 * @param commandText - Full command text including /ios.inspect
 * @returns Parsed arguments
 */
export function parseInspectArgs(commandText: string): InspectCommandArgs {
  const args: InspectCommandArgs = {};

  // Remove the command prefix
  const argsText = commandText.replace(/^\/ios\.inspect\s*/, '').trim();
  if (!argsText) {
    return args;
  }

  // Tokenize respecting quoted strings
  const tokens = tokenize(argsText);

  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];

    // Handle --app or -a
    if (token === '--app' || token === '-a') {
      if (i + 1 < tokens.length) {
        args.app = tokens[++i];
      }
    }
    // Handle --simulator or -s
    else if (token === '--simulator' || token === '-s') {
      if (i + 1 < tokens.length) {
        args.simulator = tokens[++i];
      }
    }
    // Handle --element or -e
    else if (token === '--element' || token === '-e') {
      if (i + 1 < tokens.length) {
        args.element = tokens[++i];
      }
    }
    // Handle --depth or -d
    else if (token === '--depth' || token === '-d') {
      if (i + 1 < tokens.length) {
        const depthStr = tokens[++i];
        const depth = parseInt(depthStr, 10);
        if (!isNaN(depth) && depth > 0) {
          args.depth = depth;
        }
      }
    }
    // Handle --format or -f
    else if (token === '--format' || token === '-f') {
      if (i + 1 < tokens.length) {
        const format = tokens[++i].toLowerCase();
        if (format === 'full' || format === 'compact' || format === 'json') {
          args.format = format;
        }
      }
    }
    // Handle --no-screenshot flag
    else if (token === '--no-screenshot') {
      args.noScreenshot = true;
    }
    // Unknown token - store as raw
    else if (!token.startsWith('-')) {
      args.raw = args.raw ? `${args.raw} ${token}` : token;
    }

    i++;
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
    } else if (char === quoteChar && inQuotes) {
      inQuotes = false;
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

// =============================================================================
// Element Query Parsing
// =============================================================================

/**
 * Parse element query syntax into a query object.
 *
 * Supported syntax:
 *   #identifier      - Match by accessibility identifier
 *   "label text"     - Match by accessibility label
 *   Button           - Match by element type
 *   Button#login     - Match type and identifier
 *   *submit*         - Match identifier or label containing "submit"
 *   #btn1, #btn2     - Multiple queries (returns all matches)
 *
 * @param queryString - Query string from --element argument
 * @returns Parsed element query object
 */
export function parseElementQuery(queryString: string): iosTools.ElementQuery {
  const query: iosTools.ElementQuery = {};

  // Handle multiple queries (comma-separated)
  if (queryString.includes(',')) {
    // For multiple queries, we use containsText with pattern
    // The actual multi-query handling happens in executeInspectCommand
    query.containsText = queryString;
    return query;
  }

  // Handle combined type#identifier
  const combinedMatch = queryString.match(/^(\w+)#([\w-]+)$/);
  if (combinedMatch) {
    query.type = combinedMatch[1];
    query.identifier = combinedMatch[2];
    return query;
  }

  // Handle identifier: #identifier
  if (queryString.startsWith('#')) {
    query.identifier = queryString.slice(1);
    return query;
  }

  // Handle quoted label: "label text"
  const labelMatch = queryString.match(/^["'](.+)["']$/);
  if (labelMatch) {
    query.label = labelMatch[1];
    return query;
  }

  // Handle contains: *text*
  const containsMatch = queryString.match(/^\*(.+)\*$/);
  if (containsMatch) {
    query.containsText = containsMatch[1];
    return query;
  }

  // Handle type by itself (capitalized word)
  if (/^[A-Z][a-zA-Z]*$/.test(queryString)) {
    query.type = queryString;
    return query;
  }

  // Default to text search
  query.containsText = queryString;
  return query;
}

// =============================================================================
// Command Execution
// =============================================================================

/**
 * Execute the /ios.inspect command.
 *
 * @param commandText - Full command text
 * @param sessionId - Session ID for artifact storage
 * @returns Command result with formatted output
 */
export async function executeInspectCommand(
  commandText: string,
  sessionId: string
): Promise<InspectCommandResult> {
  logger.info(`${LOG_CONTEXT} Executing inspect command: ${commandText}`);

  // Parse arguments
  const args = parseInspectArgs(commandText);
  logger.debug(`${LOG_CONTEXT} Parsed args`, LOG_CONTEXT, args);

  // Validate required arguments
  if (!args.app) {
    return {
      success: false,
      output: formatError('Missing required argument: --app <bundleId>'),
      error: 'Bundle ID is required. Use --app <bundleId> to specify the app.',
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

  // Run inspection using simple inspect (more compatible)
  const inspectResult = await iosTools.inspect({
    udid,
    bundleId: args.app,
    sessionId,
    captureScreenshot: !args.noScreenshot,
  });

  if (!inspectResult.success || !inspectResult.data) {
    return {
      success: false,
      output: formatError(inspectResult.error || 'Inspection failed'),
      error: inspectResult.error,
    };
  }

  const result = inspectResult.data;

  // Handle element query if provided
  if (args.element) {
    return handleElementQuery(args.element, result, args.format);
  }

  // Format output based on requested format
  let formatted: string;
  switch (args.format) {
    case 'json':
      formatted = iosTools.formatInspectAsJson(result);
      break;
    case 'compact':
      formatted = iosTools.formatInspectCompact(result);
      break;
    default:
      const formattedResult = iosTools.formatInspectForAgent(result, {
        maxElements: 50,
        showFrames: false,
        includeHidden: false,
      });
      formatted = formattedResult.fullOutput;
  }

  return {
    success: true,
    output: formatted,
    data: result,
  };
}

/**
 * Handle element query and format results.
 */
function handleElementQuery(
  queryString: string,
  result: iosTools.InspectResult,
  format?: string
): InspectCommandResult {
  // Handle multiple queries (comma-separated)
  if (queryString.includes(',')) {
    const queries = queryString.split(',').map((q) => q.trim());
    const allElements: iosTools.UIElement[] = [];

    for (const q of queries) {
      const query = parseElementQuery(q);
      const queryResult = iosTools.findElements(result.tree, query);
      allElements.push(...queryResult.elements);
    }

    // Remove duplicates
    const uniqueElements = allElements.filter(
      (el, idx, arr) =>
        arr.findIndex((e) => e.identifier === el.identifier && e.label === el.label) === idx
    );

    const combinedResult: iosTools.QueryResult = {
      query: { containsText: queryString },
      elements: uniqueElements,
      totalSearched: result.elements.length,
    };

    if (format === 'json') {
      return {
        success: true,
        output: JSON.stringify(combinedResult, null, 2),
        data: result,
      };
    }

    return {
      success: true,
      output: iosTools.formatElementQuery(combinedResult, result.elements),
      data: result,
    };
  }

  // Single query
  const query = parseElementQuery(queryString);
  const queryResult = iosTools.findElements(result.tree, query);

  if (format === 'json') {
    return {
      success: true,
      output: JSON.stringify(queryResult, null, 2),
      data: result,
    };
  }

  // If single element found, also show action suggestions
  if (queryResult.elements.length === 1) {
    const element = queryResult.elements[0];
    const queryOutput = iosTools.formatElementQuery(queryResult, result.elements);
    const actionOutput = iosTools.formatActionSuggestions(element, result.elements);

    return {
      success: true,
      output: `${queryOutput}\n\n---\n\n${actionOutput}`,
      data: result,
    };
  }

  return {
    success: true,
    output: iosTools.formatElementQuery(queryResult, result.elements),
    data: result,
  };
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Check if a string looks like a simulator UDID.
 * UDIDs are UUIDs like: 12345678-1234-1234-1234-123456789012
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
  return `## iOS Inspect Failed

**Error**: ${error}

### Usage
\`\`\`
/ios.inspect --app <bundleId> [options]
\`\`\`

### Options
- \`--app, -a <bundleId>\` - App bundle ID (required)
- \`--simulator, -s <name|udid>\` - Target simulator (default: first booted)
- \`--element, -e <query>\` - Query for specific element(s)
- \`--format, -f <format>\` - Output: "full", "compact", "json"
- \`--no-screenshot\` - Skip screenshot capture

### Element Query Syntax
- \`#identifier\` - Match by accessibility identifier
- \`"label text"\` - Match by accessibility label
- \`Button\` - Match by element type
- \`Button#login\` - Match type and identifier
- \`*submit*\` - Match containing "submit"
- \`#btn1, #btn2\` - Multiple queries

### Examples
\`\`\`
/ios.inspect --app com.example.myapp
/ios.inspect -a com.example.myapp --element #login_button
/ios.inspect -a com.example.myapp -e Button --format compact
/ios.inspect -a com.example.myapp -e "*submit*"
\`\`\`

### Troubleshooting
- Ensure a simulator is booted: \`xcrun simctl list devices booted\`
- Ensure the app is installed and running
- Check Xcode is installed: \`xcode-select -p\`
`;
}

// =============================================================================
// Command Metadata
// =============================================================================

/**
 * Metadata for the /ios.inspect command.
 * Used for autocomplete and help.
 */
export const inspectCommandMetadata = {
  command: '/ios.inspect',
  description: 'Inspect UI hierarchy and elements from iOS simulator',
  usage: '/ios.inspect --app <bundleId> [--simulator <name|udid>] [--element <query>]',
  options: [
    {
      name: '--app, -a',
      description: 'Bundle ID of the app to inspect (required)',
      valueHint: '<bundleId>',
    },
    {
      name: '--simulator, -s',
      description: 'Target simulator name or UDID (default: first booted)',
      valueHint: '<name|udid>',
    },
    {
      name: '--element, -e',
      description: 'Query for specific element(s)',
      valueHint: '<query>',
    },
    {
      name: '--depth, -d',
      description: 'Maximum tree depth to display',
      valueHint: '<number>',
    },
    {
      name: '--format, -f',
      description: 'Output format: "full", "compact", "json" (default: full)',
      valueHint: '<format>',
    },
    {
      name: '--no-screenshot',
      description: 'Skip paired screenshot capture',
      valueHint: null,
    },
  ],
  examples: [
    '/ios.inspect --app com.example.myapp',
    '/ios.inspect -a com.example.myapp --simulator "iPhone 15 Pro"',
    '/ios.inspect -a com.example.myapp --element #login_button',
    '/ios.inspect -a com.example.myapp -e Button --format compact',
    '/ios.inspect -a com.example.myapp -e "*submit*"',
    '/ios.inspect -a com.example.myapp -e "#btn1, #btn2"',
  ],
};
