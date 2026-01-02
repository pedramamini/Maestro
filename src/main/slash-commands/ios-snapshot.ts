/**
 * iOS Snapshot Slash Command Handler
 *
 * Handles the /ios.snapshot command which captures screenshot, logs,
 * and crash data from an iOS simulator.
 *
 * Usage:
 *   /ios.snapshot [--simulator <name|udid>] [--app <bundleId>] [--output <path>]
 *
 * Options:
 *   --simulator, -s  Target simulator name or UDID (default: first booted)
 *   --app, -a        Bundle ID to filter logs to specific app
 *   --output, -o     Custom output directory for artifacts
 *   --duration, -d   Seconds of recent logs to capture (default: 60)
 *   --include-crash  Include full crash log content (default: false)
 */

import * as iosTools from '../ios-tools';
import { logger } from '../utils/logger';

const LOG_CONTEXT = '[SlashCmd-ios.snapshot]';

// =============================================================================
// Types
// =============================================================================

/**
 * Parsed arguments from /ios.snapshot command
 */
export interface SnapshotCommandArgs {
  /** Simulator name or UDID */
  simulator?: string;
  /** App bundle ID to filter logs */
  app?: string;
  /** Custom output directory */
  output?: string;
  /** Log duration in seconds */
  duration?: number;
  /** Include full crash log content */
  includeCrash?: boolean;
  /** Raw input (unparsed portion) */
  raw?: string;
}

/**
 * Result of executing the snapshot command
 */
export interface SnapshotCommandResult {
  success: boolean;
  /** Formatted output for display in AI terminal */
  output: string;
  /** Raw snapshot result (for programmatic use) */
  data?: iosTools.SnapshotResult;
  /** Error message if failed */
  error?: string;
}

// =============================================================================
// Argument Parsing
// =============================================================================

/**
 * Parse command line arguments from /ios.snapshot command text.
 *
 * Supports:
 *   --simulator <value> or -s <value>
 *   --app <value> or -a <value>
 *   --output <value> or -o <value>
 *   --duration <value> or -d <value>
 *   --include-crash (flag, no value)
 *
 * @param commandText - Full command text including /ios.snapshot
 * @returns Parsed arguments
 */
export function parseSnapshotArgs(commandText: string): SnapshotCommandArgs {
  const args: SnapshotCommandArgs = {};

  // Remove the command prefix
  const argsText = commandText.replace(/^\/ios\.snapshot\s*/, '').trim();
  if (!argsText) {
    return args;
  }

  // Tokenize respecting quoted strings
  const tokens = tokenize(argsText);

  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];

    // Handle --simulator or -s
    if (token === '--simulator' || token === '-s') {
      if (i + 1 < tokens.length) {
        args.simulator = tokens[++i];
      }
    }
    // Handle --app or -a
    else if (token === '--app' || token === '-a') {
      if (i + 1 < tokens.length) {
        args.app = tokens[++i];
      }
    }
    // Handle --output or -o
    else if (token === '--output' || token === '-o') {
      if (i + 1 < tokens.length) {
        args.output = tokens[++i];
      }
    }
    // Handle --duration or -d
    else if (token === '--duration' || token === '-d') {
      if (i + 1 < tokens.length) {
        const durationStr = tokens[++i];
        const duration = parseInt(durationStr, 10);
        if (!isNaN(duration) && duration > 0) {
          args.duration = duration;
        }
      }
    }
    // Handle --include-crash flag
    else if (token === '--include-crash') {
      args.includeCrash = true;
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
// Command Execution
// =============================================================================

/**
 * Execute the /ios.snapshot command.
 *
 * @param commandText - Full command text
 * @param sessionId - Session ID for artifact storage
 * @returns Command result with formatted output
 */
export async function executeSnapshotCommand(
  commandText: string,
  sessionId: string
): Promise<SnapshotCommandResult> {
  logger.info(`${LOG_CONTEXT} Executing snapshot command: ${commandText}`);

  // Parse arguments
  const args = parseSnapshotArgs(commandText);
  logger.debug(`${LOG_CONTEXT} Parsed args`, LOG_CONTEXT, args);

  // Resolve simulator UDID if name was provided
  let udid = args.simulator;
  if (udid && !isUdid(udid)) {
    // Try to find simulator by name
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

  // Capture snapshot
  const snapshotResult = await iosTools.captureSnapshot({
    udid,
    bundleId: args.app,
    sessionId,
    logDuration: args.duration,
    includeCrashContent: args.includeCrash,
  });

  if (!snapshotResult.success || !snapshotResult.data) {
    return {
      success: false,
      output: formatError(snapshotResult.error || 'Snapshot capture failed'),
      error: snapshotResult.error,
    };
  }

  // Format for agent output
  const formatted = iosTools.formatSnapshotForAgent(snapshotResult.data);

  return {
    success: true,
    output: formatted.fullOutput,
    data: snapshotResult.data,
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
  return `## iOS Snapshot Failed

**Error**: ${error}

### Troubleshooting
- Ensure a simulator is booted: \`xcrun simctl list devices booted\`
- Check Xcode is installed: \`xcode-select -p\`
- Try specifying a simulator: \`/ios.snapshot --simulator "iPhone 15 Pro"\`
`;
}

// =============================================================================
// Command Metadata
// =============================================================================

/**
 * Metadata for the /ios.snapshot command.
 * Used for autocomplete and help.
 */
export const snapshotCommandMetadata = {
  command: '/ios.snapshot',
  description: 'Capture screenshot, logs, and crash info from iOS simulator',
  usage: '/ios.snapshot [--simulator <name|udid>] [--app <bundleId>] [--output <path>]',
  options: [
    {
      name: '--simulator, -s',
      description: 'Target simulator name or UDID (default: first booted)',
      valueHint: '<name|udid>',
    },
    {
      name: '--app, -a',
      description: 'Bundle ID to filter logs to specific app',
      valueHint: '<bundleId>',
    },
    {
      name: '--output, -o',
      description: 'Custom output directory for artifacts',
      valueHint: '<path>',
    },
    {
      name: '--duration, -d',
      description: 'Seconds of recent logs to capture (default: 60)',
      valueHint: '<seconds>',
    },
    {
      name: '--include-crash',
      description: 'Include full crash log content',
      valueHint: null,
    },
  ],
  examples: [
    '/ios.snapshot',
    '/ios.snapshot --simulator "iPhone 15 Pro"',
    '/ios.snapshot --app com.example.myapp',
    '/ios.snapshot -s "iPhone 15" -a com.example.app -d 120',
  ],
};
