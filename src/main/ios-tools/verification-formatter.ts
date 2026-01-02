/**
 * iOS Tools - Verification Result Formatter
 *
 * Formats verification results for agent consumption.
 * Provides multiple output formats: markdown, JSON, compact.
 */

import { VerificationResult, VerificationStatus } from './verification';
import { VisibleAssertionData } from './assertions/visible';
import { NoCrashAssertionData } from './assertions/no-crash';

// =============================================================================
// Types
// =============================================================================

/**
 * Options for formatting verification results
 */
export interface VerificationFormatOptions {
  /** Whether to include attempt details (default: true) */
  includeAttempts?: boolean;
  /** Whether to include artifact paths (default: true) */
  includeArtifacts?: boolean;
  /** Whether to include timing details (default: true) */
  includeTiming?: boolean;
  /** Whether to include simulator info (default: true) */
  includeSimulator?: boolean;
  /** Whether to include extra data (default: true) */
  includeData?: boolean;
  /** Maximum attempts to show (default: 5) */
  maxAttempts?: number;
}

/**
 * Formatted verification result
 */
export interface FormattedVerification {
  /** Markdown formatted string */
  markdown: string;
  /** Brief single-line summary */
  summary: string;
  /** Status emoji */
  emoji: string;
}

// =============================================================================
// Main Formatters
// =============================================================================

/**
 * Format a verification result for agent output (markdown).
 */
export function formatVerificationResult<T = unknown>(
  result: VerificationResult<T>,
  options?: VerificationFormatOptions
): FormattedVerification {
  const opts: Required<VerificationFormatOptions> = {
    includeAttempts: true,
    includeArtifacts: true,
    includeTiming: true,
    includeSimulator: true,
    includeData: true,
    maxAttempts: 5,
    ...options,
  };

  const emoji = getStatusEmoji(result.status);
  const statusLabel = getStatusLabel(result.status);
  const summary = `${emoji} ${result.type.toUpperCase()}: ${result.passed ? 'PASSED' : 'FAILED'} - ${result.target}`;

  const lines: string[] = [];

  // Header
  lines.push(`## ${emoji} Verification: ${result.type}`);
  lines.push('');
  lines.push(`**Status:** ${statusLabel}`);
  lines.push(`**Target:** \`${result.target}\``);
  lines.push(`**Message:** ${result.message}`);
  lines.push('');

  // Timing
  if (opts.includeTiming) {
    lines.push('### Timing');
    lines.push(`- **Duration:** ${formatDuration(result.duration)}`);
    lines.push(`- **Started:** ${result.startTime.toISOString()}`);
    lines.push(`- **Ended:** ${result.endTime.toISOString()}`);
    lines.push(`- **Attempts:** ${result.attempts.length}`);
    lines.push('');
  }

  // Simulator
  if (opts.includeSimulator && result.simulator) {
    lines.push('### Simulator');
    lines.push(`- **Name:** ${result.simulator.name}`);
    lines.push(`- **iOS:** ${result.simulator.iosVersion}`);
    lines.push(`- **UDID:** \`${result.simulator.udid}\``);
    lines.push('');
  }

  // Attempts
  if (opts.includeAttempts && result.attempts.length > 0) {
    lines.push('### Attempts');
    const attemptsToShow = result.attempts.slice(-opts.maxAttempts);

    if (result.attempts.length > opts.maxAttempts) {
      lines.push(`*Showing last ${opts.maxAttempts} of ${result.attempts.length} attempts*`);
      lines.push('');
    }

    lines.push('| # | Time | Duration | Status | Details |');
    lines.push('|---|------|----------|--------|---------|');

    for (const attempt of attemptsToShow) {
      const time = attempt.timestamp.toISOString().split('T')[1]?.split('.')[0] || '';
      const dur = formatDuration(attempt.duration);
      const status = attempt.success ? ':white_check_mark:' : ':x:';
      const details = attempt.error || (attempt.success ? 'OK' : '-');
      lines.push(`| ${attempt.attempt} | ${time} | ${dur} | ${status} | ${truncate(details, 40)} |`);
    }
    lines.push('');
  }

  // Artifacts
  if (opts.includeArtifacts && result.artifacts) {
    lines.push('### Artifacts');

    if (result.artifacts.screenshots && result.artifacts.screenshots.length > 0) {
      lines.push('**Screenshots:**');
      for (const path of result.artifacts.screenshots) {
        lines.push(`- \`${path}\``);
      }
    }

    if (result.artifacts.logs && result.artifacts.logs.length > 0) {
      lines.push('**Logs:**');
      for (const path of result.artifacts.logs) {
        lines.push(`- \`${path}\``);
      }
    }
    lines.push('');
  }

  // Type-specific data
  if (opts.includeData && result.data) {
    const dataSection = formatTypeSpecificData(result.type, result.data);
    if (dataSection) {
      lines.push('### Details');
      lines.push(dataSection);
      lines.push('');
    }
  }

  return {
    markdown: lines.join('\n'),
    summary,
    emoji,
  };
}

/**
 * Format a verification result as JSON.
 */
export function formatVerificationAsJson<T = unknown>(
  result: VerificationResult<T>
): string {
  return JSON.stringify(result, (_key, value) => {
    // Convert Date objects to ISO strings
    if (value instanceof Date) {
      return value.toISOString();
    }
    return value;
  }, 2);
}

/**
 * Format a verification result in compact form (single line).
 */
export function formatVerificationCompact<T = unknown>(
  result: VerificationResult<T>
): string {
  const emoji = getStatusEmoji(result.status);
  const duration = formatDuration(result.duration);
  const attempts = result.attempts.length > 1 ? ` (${result.attempts.length} attempts)` : '';

  return `${emoji} ${result.type}: ${result.message} [${duration}${attempts}]`;
}

// =============================================================================
// Batch Formatting
// =============================================================================

/**
 * Format multiple verification results together.
 */
export function formatVerificationBatch(
  results: VerificationResult[],
  _options?: VerificationFormatOptions
): FormattedVerification {
  const passed = results.filter(r => r.passed).length;
  const failed = results.length - passed;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  const overallEmoji = failed === 0 ? ':white_check_mark:' : ':x:';
  const summary = `${overallEmoji} Verification: ${passed}/${results.length} passed, ${failed} failed`;

  const lines: string[] = [];
  lines.push(`## ${overallEmoji} Verification Batch Results`);
  lines.push('');
  lines.push(`**Total:** ${results.length} verifications`);
  lines.push(`**Passed:** ${passed}`);
  lines.push(`**Failed:** ${failed}`);
  lines.push(`**Total Duration:** ${formatDuration(totalDuration)}`);
  lines.push('');

  // Summary table
  lines.push('### Summary');
  lines.push('| Type | Target | Status | Duration |');
  lines.push('|------|--------|--------|----------|');

  for (const result of results) {
    const emoji = getStatusEmoji(result.status);
    const dur = formatDuration(result.duration);
    lines.push(`| ${result.type} | \`${truncate(result.target, 30)}\` | ${emoji} | ${dur} |`);
  }
  lines.push('');

  // Failure details
  const failures = results.filter(r => !r.passed);
  if (failures.length > 0) {
    lines.push('### Failures');
    lines.push('');

    for (const failure of failures) {
      lines.push(`#### ${getStatusEmoji(failure.status)} ${failure.type}: ${failure.target}`);
      lines.push('');
      lines.push(`**Message:** ${failure.message}`);

      if (failure.artifacts?.screenshots) {
        lines.push(`**Screenshot:** \`${failure.artifacts.screenshots[0]}\``);
      }
      lines.push('');
    }
  }

  return {
    markdown: lines.join('\n'),
    summary,
    emoji: overallEmoji,
  };
}

// =============================================================================
// Type-Specific Formatters
// =============================================================================

function formatTypeSpecificData(type: string, data: unknown): string | null {
  switch (type) {
    case 'visible':
    case 'not-visible':
      return formatVisibleData(data as VisibleAssertionData);
    case 'no-crash':
      return formatNoCrashData(data as NoCrashAssertionData);
    default:
      // Generic data formatting
      if (typeof data === 'object' && data !== null) {
        return formatGenericData(data as Record<string, unknown>);
      }
      return null;
  }
}

function formatVisibleData(data: VisibleAssertionData): string {
  const lines: string[] = [];

  if (data.totalElementsScanned !== undefined) {
    lines.push(`- **Elements scanned:** ${data.totalElementsScanned}`);
  }

  if (data.matchedBy) {
    lines.push(`- **Matched by:** ${data.matchedBy}`);
  }

  if (data.element) {
    lines.push(`- **Element type:** ${data.element.type}`);
    if (data.element.identifier) {
      lines.push(`- **Identifier:** \`${data.element.identifier}\``);
    }
    if (data.element.label) {
      lines.push(`- **Label:** "${data.element.label}"`);
    }
    lines.push(`- **Enabled:** ${data.wasEnabled ? 'Yes' : 'No'}`);
    lines.push(`- **Visible:** ${data.element.visible ? 'Yes' : 'No'}`);

    if (data.element.frame) {
      const f = data.element.frame;
      lines.push(`- **Frame:** (${f.x}, ${f.y}) ${f.width}x${f.height}`);
    }
  }

  if (data.enabledRequired) {
    lines.push(`- **Enabled required:** Yes`);
  }

  return lines.join('\n');
}

function formatNoCrashData(data: NoCrashAssertionData): string {
  const lines: string[] = [];

  lines.push(`- **Bundle ID:** \`${data.bundleId}\``);
  lines.push(`- **Monitoring period:** ${formatDuration(data.monitoringDuration)}`);
  lines.push(`- **From:** ${data.sinceTime.toISOString()}`);
  lines.push(`- **To:** ${data.untilTime.toISOString()}`);
  lines.push(`- **Crashes found:** ${data.crashesFound ? `Yes (${data.crashCount})` : 'None'}`);

  if (data.crashes && data.crashes.length > 0) {
    lines.push('');
    lines.push('**Crash Reports:**');
    for (const crash of data.crashes.slice(0, 3)) { // Show at most 3
      lines.push(`- ${crash.timestamp.toISOString()}: ${crash.exceptionType || 'Unknown'}`);
      if (crash.exceptionMessage) {
        lines.push(`  - ${truncate(crash.exceptionMessage, 80)}`);
      }
    }

    if (data.crashes.length > 3) {
      lines.push(`- *... and ${data.crashes.length - 3} more*`);
    }
  }

  return lines.join('\n');
}

function formatGenericData(data: Record<string, unknown>): string {
  const lines: string[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;

    const displayKey = key.replace(/([A-Z])/g, ' $1').toLowerCase().trim();
    let displayValue: string;

    if (typeof value === 'object') {
      displayValue = JSON.stringify(value);
    } else if (typeof value === 'boolean') {
      displayValue = value ? 'Yes' : 'No';
    } else {
      displayValue = String(value);
    }

    lines.push(`- **${displayKey}:** ${truncate(displayValue, 50)}`);
  }

  return lines.join('\n');
}

// =============================================================================
// Utility Functions
// =============================================================================

function getStatusEmoji(status: VerificationStatus): string {
  switch (status) {
    case 'passed':
      return ':white_check_mark:';
    case 'failed':
      return ':x:';
    case 'timeout':
      return ':hourglass:';
    case 'error':
      return ':warning:';
    default:
      return ':question:';
  }
}

function getStatusLabel(status: VerificationStatus): string {
  switch (status) {
    case 'passed':
      return ':white_check_mark: PASSED';
    case 'failed':
      return ':x: FAILED';
    case 'timeout':
      return ':hourglass: TIMEOUT';
    case 'error':
      return ':warning: ERROR';
    default:
      return ':question: UNKNOWN';
  }
}

/**
 * Format duration in human-readable form.
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength - 3) + '...';
}

// =============================================================================
// Progress Indicators
// =============================================================================

/**
 * Format a progress bar for verification attempts.
 */
export function formatProgressBar(current: number, total: number, width: number = 20): string {
  const filled = Math.round((current / total) * width);
  const empty = width - filled;
  return `[${'='.repeat(filled)}${'-'.repeat(empty)}] ${current}/${total}`;
}

/**
 * Format verification status badge.
 */
export function formatStatusBadge(status: VerificationStatus): string {
  const emoji = getStatusEmoji(status);
  return `${emoji} ${status.toUpperCase()}`;
}
