/**
 * iOS Tools - Action Formatter
 *
 * Formats Maestro flow execution results for agent consumption.
 * Provides multiple output formats: markdown, JSON, and compact.
 */

import { FlowRunResult, FlowStepResult, BatchFlowResult } from './flow-runner';

// =============================================================================
// Types
// =============================================================================

/**
 * Options for formatting flow results
 */
export interface FlowFormatOptions {
  /** Include raw output in the formatted result */
  includeRawOutput?: boolean;
  /** Include step-by-step details */
  includeSteps?: boolean;
  /** Maximum length of error messages (default: 500) */
  maxErrorLength?: number;
  /** Include paths to artifacts */
  includeArtifactPaths?: boolean;
  /** Verbose mode - include all available information */
  verbose?: boolean;
}

/**
 * Formatted flow result for agent consumption
 */
export interface FormattedFlowResult {
  /** Markdown-formatted summary */
  markdown: string;
  /** Single-line summary */
  summary: string;
  /** Status indicator (PASSED/FAILED) */
  status: 'PASSED' | 'FAILED';
  /** Brief description of result */
  description: string;
}

// =============================================================================
// Main Formatter
// =============================================================================

/**
 * Format flow execution result for agent output.
 *
 * @param result - FlowRunResult from runFlow
 * @param options - Formatting options
 * @returns Formatted result with markdown and summary
 */
export function formatFlowResult(
  result: FlowRunResult,
  options: FlowFormatOptions = {}
): FormattedFlowResult {
  const {
    includeRawOutput = false,
    includeSteps = true,
    maxErrorLength = 500,
    includeArtifactPaths = true,
    verbose = false,
  } = options;

  const status: 'PASSED' | 'FAILED' = result.passed ? 'PASSED' : 'FAILED';
  const statusEmoji = result.passed ? '✓' : '✗';
  const durationSec = (result.duration / 1000).toFixed(1);

  // Build summary line
  const summary = `Flow ${status}: ${result.passedSteps}/${result.totalSteps} steps passed (${durationSec}s)`;

  // Build description
  let description = result.passed
    ? `Flow completed successfully with ${result.passedSteps} passing steps.`
    : `Flow failed: ${result.error || `${result.failedSteps} step(s) failed`}`;

  // Build markdown output
  const markdownParts: string[] = [];

  // Header
  markdownParts.push(`## ${statusEmoji} Flow Execution ${status}`);
  markdownParts.push('');

  // Summary table
  markdownParts.push('| Metric | Value |');
  markdownParts.push('|--------|-------|');
  markdownParts.push(`| Status | ${status} |`);
  markdownParts.push(`| Duration | ${durationSec}s |`);
  markdownParts.push(`| Steps Passed | ${result.passedSteps}/${result.totalSteps} |`);
  if (result.failedSteps > 0) {
    markdownParts.push(`| Steps Failed | ${result.failedSteps} |`);
  }
  markdownParts.push('');

  // Error message if failed
  if (!result.passed && result.error) {
    markdownParts.push('### Error');
    markdownParts.push('');
    markdownParts.push('```');
    const truncatedError =
      result.error.length > maxErrorLength
        ? result.error.slice(0, maxErrorLength) + '...'
        : result.error;
    markdownParts.push(truncatedError);
    markdownParts.push('```');
    markdownParts.push('');
  }

  // Step details
  if (includeSteps && result.steps.length > 0) {
    markdownParts.push('### Steps');
    markdownParts.push('');

    for (const step of result.steps) {
      const stepEmoji = step.passed ? '✓' : '✗';
      const stepName = step.name || `Step ${step.index + 1}`;
      const durationStr = step.duration ? ` (${step.duration}ms)` : '';
      markdownParts.push(`- ${stepEmoji} ${stepName}${durationStr}`);

      if (!step.passed && step.error && verbose) {
        markdownParts.push(`  - Error: ${step.error}`);
      }
    }
    markdownParts.push('');
  }

  // Artifact paths
  if (includeArtifactPaths) {
    const artifacts: string[] = [];

    if (result.failureScreenshotPath) {
      artifacts.push(`- Failure screenshot: \`${result.failureScreenshotPath}\``);
    }
    if (result.reportPath) {
      artifacts.push(`- Report: \`${result.reportPath}\``);
    }

    if (artifacts.length > 0) {
      markdownParts.push('### Artifacts');
      markdownParts.push('');
      markdownParts.push(...artifacts);
      markdownParts.push('');
    }
  }

  // Raw output (if requested and verbose)
  if (includeRawOutput && result.rawOutput && verbose) {
    markdownParts.push('<details>');
    markdownParts.push('<summary>Raw Output</summary>');
    markdownParts.push('');
    markdownParts.push('```');
    markdownParts.push(result.rawOutput);
    markdownParts.push('```');
    markdownParts.push('</details>');
  }

  return {
    markdown: markdownParts.join('\n'),
    summary,
    status,
    description,
  };
}

/**
 * Format flow result as JSON for programmatic use.
 *
 * @param result - FlowRunResult from runFlow
 * @returns JSON string representation
 */
export function formatFlowResultAsJson(result: FlowRunResult): string {
  const jsonResult = {
    passed: result.passed,
    status: result.passed ? 'PASSED' : 'FAILED',
    duration: result.duration,
    durationSeconds: (result.duration / 1000).toFixed(1),
    flowPath: result.flowPath,
    simulator: result.udid,
    steps: {
      total: result.totalSteps,
      passed: result.passedSteps,
      failed: result.failedSteps,
      skipped: result.skippedSteps,
    },
    error: result.error,
    artifacts: {
      failureScreenshot: result.failureScreenshotPath,
      report: result.reportPath,
    },
    stepDetails: result.steps.map((s) => ({
      index: s.index,
      name: s.name,
      passed: s.passed,
      duration: s.duration,
      error: s.error,
    })),
  };

  return JSON.stringify(jsonResult, null, 2);
}

/**
 * Format flow result as a compact single-line summary.
 *
 * @param result - FlowRunResult from runFlow
 * @returns Single-line summary string
 */
export function formatFlowResultCompact(result: FlowRunResult): string {
  const status = result.passed ? 'PASSED' : 'FAILED';
  const durationSec = (result.duration / 1000).toFixed(1);
  const stepsInfo = `${result.passedSteps}/${result.totalSteps}`;

  if (result.passed) {
    return `${status} ${stepsInfo} steps (${durationSec}s)`;
  } else {
    const errorBrief = result.error ? `: ${result.error.slice(0, 50)}` : '';
    return `${status} ${stepsInfo} steps (${durationSec}s)${errorBrief}`;
  }
}

// =============================================================================
// Batch Result Formatting
// =============================================================================

/**
 * Format batch flow execution results.
 *
 * @param batchResult - BatchFlowResult from runFlows
 * @param options - Formatting options
 * @returns Formatted result with markdown and summary
 */
export function formatBatchFlowResult(
  batchResult: BatchFlowResult,
  options: FlowFormatOptions = {}
): FormattedFlowResult {
  const { includeSteps = true, verbose = false } = options;

  const allPassed = batchResult.failedFlows === 0;
  const status: 'PASSED' | 'FAILED' = allPassed ? 'PASSED' : 'FAILED';
  const statusEmoji = allPassed ? '✓' : '✗';
  const durationSec = (batchResult.totalDuration / 1000).toFixed(1);

  // Build summary
  const summary = `Batch ${status}: ${batchResult.passedFlows}/${batchResult.totalFlows} flows passed (${durationSec}s)`;

  // Build description
  const description = allPassed
    ? `All ${batchResult.totalFlows} flows completed successfully.`
    : `${batchResult.failedFlows} of ${batchResult.totalFlows} flows failed.`;

  // Build markdown
  const markdownParts: string[] = [];

  // Header
  markdownParts.push(`## ${statusEmoji} Batch Flow Execution ${status}`);
  markdownParts.push('');

  // Summary table
  markdownParts.push('| Metric | Value |');
  markdownParts.push('|--------|-------|');
  markdownParts.push(`| Status | ${status} |`);
  markdownParts.push(`| Total Duration | ${durationSec}s |`);
  markdownParts.push(`| Flows Passed | ${batchResult.passedFlows}/${batchResult.totalFlows} |`);
  if (batchResult.failedFlows > 0) {
    markdownParts.push(`| Flows Failed | ${batchResult.failedFlows} |`);
  }
  markdownParts.push('');

  // Individual flow results
  if (includeSteps) {
    markdownParts.push('### Flow Results');
    markdownParts.push('');

    for (const result of batchResult.results) {
      const flowEmoji = result.passed ? '✓' : '✗';
      const flowName = getFlowName(result.flowPath);
      const flowDuration = (result.duration / 1000).toFixed(1);
      markdownParts.push(
        `- ${flowEmoji} **${flowName}** - ${result.passedSteps}/${result.totalSteps} steps (${flowDuration}s)`
      );

      if (!result.passed && result.error && verbose) {
        markdownParts.push(`  - Error: ${result.error.slice(0, 100)}`);
      }
    }
    markdownParts.push('');
  }

  // Failed flows summary
  const failedFlows = batchResult.results.filter((r) => !r.passed);
  if (failedFlows.length > 0) {
    markdownParts.push('### Failed Flows');
    markdownParts.push('');

    for (const flow of failedFlows) {
      const flowName = getFlowName(flow.flowPath);
      markdownParts.push(`#### ${flowName}`);
      if (flow.error) {
        markdownParts.push('');
        markdownParts.push('```');
        markdownParts.push(flow.error.slice(0, 200));
        markdownParts.push('```');
      }
      if (flow.failureScreenshotPath) {
        markdownParts.push('');
        markdownParts.push(`Screenshot: \`${flow.failureScreenshotPath}\``);
      }
      markdownParts.push('');
    }
  }

  return {
    markdown: markdownParts.join('\n'),
    summary,
    status,
    description,
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Extract flow name from path.
 */
function getFlowName(flowPath: string): string {
  // Get filename without extension
  const parts = flowPath.split('/');
  const filename = parts[parts.length - 1] || flowPath;
  return filename.replace(/\.ya?ml$/i, '');
}

/**
 * Format step results as a table.
 *
 * @param steps - Array of step results
 * @returns Markdown table of steps
 */
export function formatStepsTable(steps: FlowStepResult[]): string {
  if (steps.length === 0) {
    return 'No steps recorded.';
  }

  const lines: string[] = [];
  lines.push('| # | Step | Status | Duration |');
  lines.push('|---|------|--------|----------|');

  for (const step of steps) {
    const status = step.passed ? '✓ Passed' : '✗ Failed';
    const duration = step.duration ? `${step.duration}ms` : '-';
    const name = step.name || `Step ${step.index + 1}`;
    lines.push(`| ${step.index + 1} | ${name} | ${status} | ${duration} |`);
  }

  return lines.join('\n');
}

/**
 * Format a quick status badge.
 *
 * @param result - FlowRunResult
 * @returns Status badge string
 */
export function formatStatusBadge(result: FlowRunResult): string {
  if (result.passed) {
    return '![Passed](https://img.shields.io/badge/flow-passed-green)';
  } else {
    return '![Failed](https://img.shields.io/badge/flow-failed-red)';
  }
}

/**
 * Format duration in a human-readable way.
 *
 * @param ms - Duration in milliseconds
 * @returns Human-readable duration string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  } else {
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
  }
}

/**
 * Create a progress bar representation.
 *
 * @param passed - Number of passed steps/flows
 * @param total - Total number of steps/flows
 * @param width - Width of the progress bar (default: 20)
 * @returns ASCII progress bar
 */
export function formatProgressBar(passed: number, total: number, width = 20): string {
  if (total === 0) return `[${'░'.repeat(width)}] 0%`;

  const percentage = Math.round((passed / total) * 100);
  const filledWidth = Math.round((passed / total) * width);
  const emptyWidth = width - filledWidth;

  const filled = '█'.repeat(filledWidth);
  const empty = '░'.repeat(emptyWidth);

  return `[${filled}${empty}] ${percentage}%`;
}
