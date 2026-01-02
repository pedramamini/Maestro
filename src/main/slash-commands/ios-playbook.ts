/**
 * iOS Playbook Slash Command Handler
 *
 * Handles the /ios.playbook command which manages and executes iOS playbooks.
 *
 * Usage:
 *   /ios.playbook list                     - List available playbooks
 *   /ios.playbook run <name>               - Run a playbook
 *   /ios.playbook info <name>              - Show playbook details
 *
 * Options:
 *   --inputs <json>       JSON object of playbook inputs
 *   --dry-run             Validate without executing
 *   --simulator, -s       Target simulator name or UDID
 *   --timeout, -t         Maximum execution time in seconds (default: 600)
 *   --continue            Continue on error (don't stop at first failure)
 */

import * as path from 'path';
import * as iosTools from '../ios-tools';
import {
  listPlaybooks,
  loadPlaybook,
  validatePlaybook,
  getPlaybookInfo,
  playbookExists,
  BUILTIN_PLAYBOOKS,
  IOSPlaybookConfig,
  PlaybookInfo,
} from '../ios-tools/playbook-loader';
import {
  runPlaybook,
  formatPlaybookResult,
  formatPlaybookResultAsJson,
  PlaybookRunResult,
} from '../ios-tools/playbook-runner';
import { logger } from '../utils/logger';

const LOG_CONTEXT = '[SlashCmd-ios.playbook]';

// =============================================================================
// Types
// =============================================================================

/**
 * Subcommand type
 */
export type PlaybookSubcommand = 'list' | 'run' | 'info';

/**
 * Parsed arguments from /ios.playbook command
 */
export interface PlaybookCommandArgs {
  /** Subcommand: list, run, or info */
  subcommand?: PlaybookSubcommand;
  /** Playbook name (for run/info) */
  playbookName?: string;
  /** Playbook inputs as JSON */
  inputs?: Record<string, unknown>;
  /** Dry run - validate without executing */
  dryRun?: boolean;
  /** Simulator name or UDID */
  simulator?: string;
  /** Timeout in seconds */
  timeout?: number;
  /** Continue on error */
  continueOnError?: boolean;
  /** Raw unparsed input */
  raw?: string;
}

/**
 * Result of executing the playbook command
 */
export interface PlaybookCommandResult {
  success: boolean;
  /** Formatted output for display in AI terminal */
  output: string;
  /** Raw data (for programmatic use) */
  data?:
    | PlaybookInfo[]
    | PlaybookInfo
    | IOSPlaybookConfig
    | PlaybookRunResult;
  /** Error message if failed */
  error?: string;
}

// =============================================================================
// Argument Parsing
// =============================================================================

/**
 * Parse command line arguments from /ios.playbook command text.
 *
 * @param commandText - Full command text including /ios.playbook
 * @returns Parsed arguments
 */
export function parsePlaybookArgs(commandText: string): PlaybookCommandArgs {
  const args: PlaybookCommandArgs = {};

  // Remove the command prefix
  const argsText = commandText.replace(/^\/ios\.playbook\s*/, '').trim();
  if (!argsText) {
    return args;
  }

  // Tokenize respecting quoted strings
  const tokens = tokenize(argsText);

  let i = 0;

  while (i < tokens.length) {
    const token = tokens[i];

    // Handle flags first
    if (token === '--dry-run') {
      args.dryRun = true;
      i++;
      continue;
    }

    if (token === '--continue') {
      args.continueOnError = true;
      i++;
      continue;
    }

    if (token === '--simulator' || token === '-s') {
      if (i + 1 < tokens.length) {
        args.simulator = tokens[++i];
      }
      i++;
      continue;
    }

    if (token === '--timeout' || token === '-t') {
      if (i + 1 < tokens.length) {
        const timeoutStr = tokens[++i];
        const timeout = parseInt(timeoutStr, 10);
        if (!isNaN(timeout) && timeout > 0) {
          args.timeout = timeout;
        }
      }
      i++;
      continue;
    }

    if (token === '--inputs') {
      if (i + 1 < tokens.length) {
        const inputsStr = tokens[++i];
        try {
          args.inputs = JSON.parse(inputsStr);
        } catch {
          // Try parsing without quotes if it was a raw JSON object
          try {
            args.inputs = JSON.parse(inputsStr.replace(/'/g, '"'));
          } catch {
            logger.warn(
              `${LOG_CONTEXT} Failed to parse inputs JSON: ${inputsStr}`
            );
          }
        }
      }
      i++;
      continue;
    }

    // Handle subcommands and positional arguments
    if (!token.startsWith('-')) {
      if (!args.subcommand) {
        // First non-flag argument is the subcommand
        const subcommand = token.toLowerCase();
        if (subcommand === 'list' || subcommand === 'run' || subcommand === 'info') {
          args.subcommand = subcommand;
        } else {
          // Assume it's a playbook name with implicit 'run' command
          args.subcommand = 'run';
          args.playbookName = token;
        }
      } else if (!args.playbookName) {
        // Second non-flag argument is the playbook name
        args.playbookName = token;
      } else {
        // Additional positional args go to raw
        args.raw = args.raw ? `${args.raw} ${token}` : token;
      }
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
 * Execute the /ios.playbook command.
 *
 * @param commandText - Full command text
 * @param sessionId - Session ID for artifact storage
 * @param cwd - Current working directory for resolving relative paths
 * @returns Command result with formatted output
 */
export async function executePlaybookCommand(
  commandText: string,
  sessionId: string,
  cwd?: string
): Promise<PlaybookCommandResult> {
  logger.info(`${LOG_CONTEXT} Executing playbook command: ${commandText}`);

  // Parse arguments
  const args = parsePlaybookArgs(commandText);
  logger.debug(`${LOG_CONTEXT} Parsed args`, LOG_CONTEXT, args);

  // Default to list if no subcommand
  const subcommand = args.subcommand || 'list';

  switch (subcommand) {
    case 'list':
      return executeListCommand();

    case 'info':
      if (!args.playbookName) {
        return {
          success: false,
          output: formatError('Playbook name required. Usage: /ios.playbook info <name>'),
          error: 'Missing playbook name',
        };
      }
      return executeInfoCommand(args.playbookName);

    case 'run':
      if (!args.playbookName) {
        return {
          success: false,
          output: formatError('Playbook name required. Usage: /ios.playbook run <name>'),
          error: 'Missing playbook name',
        };
      }
      return executeRunCommand(args, sessionId, cwd);

    default:
      return {
        success: false,
        output: formatError(`Unknown subcommand: ${subcommand}`),
        error: `Unknown subcommand: ${subcommand}`,
      };
  }
}

/**
 * Execute the 'list' subcommand.
 */
async function executeListCommand(): Promise<PlaybookCommandResult> {
  logger.info(`${LOG_CONTEXT} Listing available playbooks`);

  try {
    const playbooks = listPlaybooks();

    if (playbooks.length === 0) {
      return {
        success: true,
        output: formatNoPlaybooks(),
        data: [],
      };
    }

    return {
      success: true,
      output: formatPlaybookList(playbooks),
      data: playbooks,
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return {
      success: false,
      output: formatError(`Failed to list playbooks: ${error}`),
      error,
    };
  }
}

/**
 * Execute the 'info' subcommand.
 */
async function executeInfoCommand(
  playbookName: string
): Promise<PlaybookCommandResult> {
  logger.info(`${LOG_CONTEXT} Getting info for playbook: ${playbookName}`);

  try {
    // Check if playbook exists
    if (!playbookExists(playbookName)) {
      return {
        success: false,
        output: formatPlaybookNotFound(playbookName),
        error: `Playbook not found: ${playbookName}`,
      };
    }

    // Load full playbook config
    const config = loadPlaybook(playbookName);
    const info = getPlaybookInfo(playbookName);

    // Validate playbook
    const validation = validatePlaybook(config);

    return {
      success: true,
      output: formatPlaybookInfo(config, info, validation),
      data: config,
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return {
      success: false,
      output: formatError(`Failed to get playbook info: ${error}`),
      error,
    };
  }
}

/**
 * Execute the 'run' subcommand.
 */
async function executeRunCommand(
  args: PlaybookCommandArgs,
  sessionId: string,
  cwd?: string
): Promise<PlaybookCommandResult> {
  const playbookName = args.playbookName!;
  logger.info(`${LOG_CONTEXT} Running playbook: ${playbookName}`);

  // Check if playbook exists
  if (!playbookExists(playbookName)) {
    return {
      success: false,
      output: formatPlaybookNotFound(playbookName),
      error: `Playbook not found: ${playbookName}`,
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

  // Build inputs, adding simulator if provided
  const inputs: Record<string, unknown> = {
    ...(args.inputs || {}),
  };

  if (udid) {
    inputs.simulator = udid;
  }

  // Add common inputs
  if (cwd) {
    inputs.cwd = cwd;
    // If project_path not set, use cwd
    if (!inputs.project_path) {
      inputs.project_path = cwd;
    }
  }

  try {
    const result = await runPlaybook({
      playbook: playbookName,
      inputs,
      sessionId,
      cwd,
      dryRun: args.dryRun,
      stepTimeout: args.timeout ? args.timeout * 1000 : undefined,
      continueOnError: args.continueOnError,
      onProgress: (progress) => {
        logger.debug(
          `${LOG_CONTEXT} Progress: ${progress.phase} - ${progress.message}`
        );
      },
    });

    if (!result.success) {
      return {
        success: false,
        output: formatError(result.error || 'Playbook execution failed'),
        error: result.error,
      };
    }

    const runResult = result.data!;

    // Format output based on result
    let output = formatPlaybookResult(runResult);

    // Add dry-run indicator
    if (args.dryRun) {
      output = `*Dry run - validation only, no execution*\n\n${output}`;
    }

    return {
      success: runResult.passed,
      output,
      data: runResult,
      error: runResult.error,
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return {
      success: false,
      output: formatError(`Playbook execution error: ${error}`),
      error,
    };
  }
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
  // First try to get booted simulators
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

// =============================================================================
// Formatters
// =============================================================================

/**
 * Format error message for display.
 */
function formatError(error: string): string {
  return `## iOS Playbook Error

**Error**: ${error}

### Usage

\`\`\`
/ios.playbook list                     # List available playbooks
/ios.playbook run <name>               # Run a playbook
/ios.playbook info <name>              # Show playbook details
/ios.playbook <name>                   # Shorthand for run
\`\`\`

### Options

| Option | Description |
|--------|-------------|
| \`--inputs <json>\` | JSON object of playbook inputs |
| \`--dry-run\` | Validate without executing |
| \`--simulator, -s\` | Target simulator name or UDID |
| \`--timeout, -t\` | Maximum time in seconds |
| \`--continue\` | Continue on error |

### Available Playbooks

${BUILTIN_PLAYBOOKS.map((p) => `- \`${p}\``).join('\n')}

### Examples

\`\`\`
/ios.playbook list
/ios.playbook info Feature-Ship-Loop
/ios.playbook run Crash-Hunt --inputs '{"duration": 120}'
/ios.playbook Design-Review -s "iPhone 15 Pro"
\`\`\`
`;
}

/**
 * Format no playbooks found message.
 */
function formatNoPlaybooks(): string {
  return `## iOS Playbooks

No playbooks found in \`~/.maestro/playbooks/iOS/\`.

### Built-in Playbooks

The following playbooks are available when configured:

${BUILTIN_PLAYBOOKS.map((p) => `- **${p}**`).join('\n')}

### Creating a Playbook

Create a playbook directory with a \`playbook.yaml\` file:

\`\`\`yaml
name: My Playbook
description: Description of what this playbook does
version: 1.0.0

inputs:
  app_path:
    description: Path to .app bundle
    required: true

steps:
  - name: Build App
    action: ios.build
    inputs:
      project: "{{ inputs.project_path }}"
\`\`\`
`;
}

/**
 * Format playbook list.
 */
function formatPlaybookList(playbooks: PlaybookInfo[]): string {
  const lines: string[] = [];

  lines.push('## Available iOS Playbooks');
  lines.push('');
  lines.push('| Playbook | Description | Version | Type |');
  lines.push('|----------|-------------|---------|------|');

  for (const pb of playbooks) {
    const type = pb.builtIn ? 'Built-in' : 'Custom';
    const desc = pb.description || '*No description*';
    const ver = pb.version || '1.0.0';
    lines.push(`| **${pb.id}** | ${desc.substring(0, 50)} | ${ver} | ${type} |`);
  }

  lines.push('');
  lines.push('### Usage');
  lines.push('');
  lines.push('```');
  lines.push('/ios.playbook run <name>    # Run a playbook');
  lines.push('/ios.playbook info <name>   # Show playbook details');
  lines.push('/ios.playbook <name>        # Shorthand for run');
  lines.push('```');
  lines.push('');

  return lines.join('\n');
}

/**
 * Format playbook not found message.
 */
function formatPlaybookNotFound(name: string): string {
  const playbooks = listPlaybooks();
  const suggestions = playbooks.filter(
    (p) =>
      p.id.toLowerCase().includes(name.toLowerCase()) ||
      p.name.toLowerCase().includes(name.toLowerCase())
  );

  let suggestionsText = '';
  if (suggestions.length > 0) {
    suggestionsText = `

### Did you mean?

${suggestions.map((s) => `- \`${s.id}\``).join('\n')}`;
  }

  return `## Playbook Not Found

Playbook \`${name}\` was not found.
${suggestionsText}

### Available Playbooks

${BUILTIN_PLAYBOOKS.map((p) => `- \`${p}\``).join('\n')}

Use \`/ios.playbook list\` to see all available playbooks.
`;
}

/**
 * Format playbook info.
 */
function formatPlaybookInfo(
  config: IOSPlaybookConfig,
  info: PlaybookInfo | undefined,
  validation: { valid: boolean; errors: string[]; warnings: string[] }
): string {
  const lines: string[] = [];

  // Header
  const statusIcon = validation.valid ? '✅' : '❌';
  lines.push(`## ${statusIcon} Playbook: ${config.name}`);
  lines.push('');

  // Description
  if (config.description) {
    lines.push(`*${config.description}*`);
    lines.push('');
  }

  // Metadata table
  lines.push('| Property | Value |');
  lines.push('|----------|-------|');
  lines.push(`| Version | ${config.version || '1.0.0'} |`);
  lines.push(`| Type | ${info?.builtIn ? 'Built-in' : 'Custom'} |`);
  lines.push(`| Steps | ${config.steps.length} |`);
  if (info?.configPath) {
    lines.push(`| Path | \`${info.configPath}\` |`);
  }
  lines.push('');

  // Validation status
  if (!validation.valid) {
    lines.push('### ⚠️ Validation Errors');
    lines.push('');
    for (const error of validation.errors) {
      lines.push(`- ❌ ${error}`);
    }
    lines.push('');
  }

  if (validation.warnings.length > 0) {
    lines.push('### ⚠️ Warnings');
    lines.push('');
    for (const warning of validation.warnings) {
      lines.push(`- ⚠️ ${warning}`);
    }
    lines.push('');
  }

  // Inputs
  if (config.inputs && Object.keys(config.inputs).length > 0) {
    lines.push('### Inputs');
    lines.push('');
    lines.push('| Name | Type | Required | Default | Description |');
    lines.push('|------|------|----------|---------|-------------|');

    for (const [name, def] of Object.entries(config.inputs)) {
      const type = def.type || 'any';
      const required = def.required ? '✓' : '';
      const defaultVal = def.default !== undefined ? `\`${JSON.stringify(def.default)}\`` : '';
      const desc = def.description || '';
      lines.push(`| \`${name}\` | ${type} | ${required} | ${defaultVal} | ${desc} |`);
    }
    lines.push('');
  }

  // Variables
  if (config.variables && Object.keys(config.variables).length > 0) {
    lines.push('### Variables');
    lines.push('');
    lines.push('| Name | Initial Value |');
    lines.push('|------|---------------|');

    for (const [name, value] of Object.entries(config.variables)) {
      lines.push(`| \`${name}\` | \`${JSON.stringify(value)}\` |`);
    }
    lines.push('');
  }

  // Steps overview
  lines.push('### Steps');
  lines.push('');

  for (let i = 0; i < config.steps.length; i++) {
    const step = config.steps[i];
    const stepName = step.name || `Step ${i + 1}`;
    const action = step.action || (step.loop ? 'loop' : step.loop_until ? 'loop_until' : 'unknown');
    const condition = step.condition ? ` (if ${step.condition})` : '';
    lines.push(`${i + 1}. **${stepName}** - \`${action}\`${condition}`);
  }
  lines.push('');

  // Usage example
  lines.push('### Usage');
  lines.push('');
  lines.push('```');
  lines.push(`/ios.playbook run ${info?.id || config.name}`);

  // Build example inputs
  if (config.inputs) {
    const requiredInputs = Object.entries(config.inputs)
      .filter(([, def]) => def.required && def.default === undefined)
      .map(([name, def]) => {
        if (def.type === 'array') return `"${name}": []`;
        if (def.type === 'object') return `"${name}": {}`;
        if (def.type === 'number') return `"${name}": 0`;
        if (def.type === 'boolean') return `"${name}": true`;
        return `"${name}": "value"`;
      });

    if (requiredInputs.length > 0) {
      lines.push(`/ios.playbook run ${info?.id || config.name} --inputs '{${requiredInputs.join(', ')}}'`);
    }
  }
  lines.push('```');
  lines.push('');

  return lines.join('\n');
}

// =============================================================================
// Command Metadata
// =============================================================================

/**
 * Metadata for the /ios.playbook command.
 * Used for autocomplete and help.
 */
export const playbookCommandMetadata = {
  command: '/ios.playbook',
  description: 'Manage and run iOS playbooks for automated workflows',
  usage: '/ios.playbook <subcommand> [name] [options]',
  options: [
    {
      name: 'list',
      description: 'List all available iOS playbooks',
      valueHint: null,
    },
    {
      name: 'run <name>',
      description: 'Run a playbook by name',
      valueHint: '<playbook-name>',
    },
    {
      name: 'info <name>',
      description: 'Show detailed playbook information',
      valueHint: '<playbook-name>',
    },
    {
      name: '--inputs',
      description: 'JSON object of playbook inputs',
      valueHint: '<json>',
    },
    {
      name: '--dry-run',
      description: 'Validate without executing',
      valueHint: null,
    },
    {
      name: '--simulator, -s',
      description: 'Target simulator name or UDID',
      valueHint: '<name|udid>',
    },
    {
      name: '--timeout, -t',
      description: 'Maximum execution time in seconds (default: 600)',
      valueHint: '<seconds>',
    },
    {
      name: '--continue',
      description: 'Continue on error (don\'t stop at first failure)',
      valueHint: null,
    },
  ],
  examples: [
    '/ios.playbook list',
    '/ios.playbook info Feature-Ship-Loop',
    '/ios.playbook run Crash-Hunt',
    '/ios.playbook run Design-Review --simulator "iPhone 15 Pro"',
    '/ios.playbook run Regression-Check --inputs \'{"flows": ["login.yaml"], "baseline_dir": "./baselines"}\'',
    '/ios.playbook Performance-Check --dry-run',
    '/ios.playbook Feature-Ship-Loop --timeout 300 --continue',
  ],
};
