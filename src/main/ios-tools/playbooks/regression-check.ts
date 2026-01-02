/**
 * iOS Playbook - Regression Check Executor
 *
 * Executes the Regression Check playbook for iOS visual regression testing.
 * Runs UI flows, captures screenshots, and compares against baselines.
 */

import * as path from 'path';
import * as fs from 'fs';
import { mkdir, writeFile, copyFile, readFile } from 'fs/promises';
import { IOSResult, IOSErrorCode } from '../types';
import {
  loadPlaybook,
  IOSPlaybookConfig,
  PlaybookInputDef,
  PlaybookVariables,
} from '../playbook-loader';
import { build, BuildResult, detectProject } from '../build';
import {
  launchApp,
  terminateApp,
  getBootedSimulators,
  getSimulator,
  bootSimulator,
  listSimulators,
  installApp,
} from '../simulator';
import { screenshot } from '../capture';
import { runFlow, FlowRunResult } from '../flow-runner';
import { getArtifactDirectory } from '../artifacts';
import { logger } from '../../utils/logger';

const LOG_CONTEXT = '[iOS-RegressionCheck]';

// =============================================================================
// Types
// =============================================================================

/**
 * Flow definition for regression check
 */
export interface RegressionFlow {
  /** Flow name (used for folder naming) */
  name: string;
  /** Path to the flow YAML file */
  path: string;
  /** Optional description */
  description?: string;
}

/**
 * Input values for running the Regression Check
 */
export interface RegressionCheckInputs {
  /** Path to built .app bundle (alternative to project_path) */
  app_path?: string;
  /** Path to Xcode project or workspace (alternative to app_path) */
  project_path?: string;
  /** Build scheme name (required with project_path) */
  scheme?: string;
  /** Simulator name or UDID (default: "iPhone 15 Pro") */
  simulator?: string;
  /** List of flow files to run */
  flows: RegressionFlow[];
  /** Directory containing baseline screenshots */
  baseline_dir: string;
  /** Pixel difference threshold (0-1, lower is stricter, default: 0.01) */
  threshold?: number;
  /** Update baselines instead of comparing */
  update_baselines?: boolean;
  /** Capture screenshot after each flow step */
  screenshot_after_each?: boolean;
  /** Stop on first regression detected */
  fail_fast?: boolean;
}

/**
 * Options for the Regression Check execution
 */
export interface RegressionCheckOptions {
  /** Input values matching playbook inputs */
  inputs: RegressionCheckInputs;
  /** Session ID for artifact storage */
  sessionId: string;
  /** Path to playbook YAML (uses built-in if not specified) */
  playbookPath?: string;
  /** Working directory for relative paths */
  cwd?: string;
  /** Build configuration (default: Debug) */
  configuration?: 'Debug' | 'Release' | string;
  /** Timeout per build in ms (default: 600000 = 10 min) */
  buildTimeout?: number;
  /** Timeout per flow in ms (default: 300000 = 5 min) */
  flowTimeout?: number;
  /** Progress callback */
  onProgress?: (update: RegressionCheckProgress) => void;
  /** Dry run - validate without executing */
  dryRun?: boolean;
}

/**
 * Progress update during execution
 */
export interface RegressionCheckProgress {
  /** Current execution phase */
  phase:
    | 'initializing'
    | 'building'
    | 'installing'
    | 'running_flow'
    | 'capturing'
    | 'comparing'
    | 'updating_baseline'
    | 'generating_report'
    | 'complete'
    | 'failed';
  /** Current flow index (1-based) */
  currentFlow: number;
  /** Total flows */
  totalFlows: number;
  /** Current flow name */
  flowName?: string;
  /** Human-readable message */
  message: string;
  /** Percentage complete (0-100) */
  percentComplete: number;
  /** Time elapsed in ms */
  elapsed?: number;
}

/**
 * Result of comparing a single screenshot
 */
export interface ScreenshotComparisonResult {
  /** Flow name */
  flowName: string;
  /** Whether the comparison passed (within threshold) */
  passed: boolean;
  /** Pixel difference percentage (0-1) */
  diffPercentage: number;
  /** Threshold used */
  threshold: number;
  /** Path to current screenshot */
  currentPath: string;
  /** Path to baseline screenshot */
  baselinePath: string;
  /** Path to diff image (if generated) */
  diffPath?: string;
  /** Whether baseline was missing */
  baselineMissing?: boolean;
  /** Error if comparison failed */
  error?: string;
}

/**
 * Result of running a single flow
 */
export interface RegressionFlowResult {
  /** Flow definition */
  flow: RegressionFlow;
  /** Flow run result */
  flowResult?: FlowRunResult;
  /** Screenshot comparison result */
  comparison?: ScreenshotComparisonResult;
  /** Whether baseline was updated */
  baselineUpdated?: boolean;
  /** Duration in ms */
  duration: number;
  /** Error if flow failed */
  error?: string;
}

/**
 * Final result of the Regression Check execution
 */
export interface RegressionCheckResult {
  /** Whether all comparisons passed (no regressions) */
  passed: boolean;
  /** Total flows run */
  totalFlows: number;
  /** Flows that passed */
  passedFlows: number;
  /** Flows that failed (regressions detected) */
  failedFlows: number;
  /** Flows that were skipped */
  skippedFlows: number;
  /** Baselines updated (if update_baselines was true) */
  baselinesUpdated: number;
  /** Total duration in ms */
  totalDuration: number;
  /** Start timestamp */
  startTime: Date;
  /** End timestamp */
  endTime: Date;
  /** Individual flow results */
  flowResults: RegressionFlowResult[];
  /** Playbook configuration used */
  playbook: {
    name: string;
    version?: string;
    path?: string;
  };
  /** Simulator used */
  simulator: {
    udid: string;
    name: string;
    iosVersion: string;
  };
  /** Built app path (if built) */
  appPath?: string;
  /** Bundle ID */
  bundleId?: string;
  /** Artifacts directory */
  artifactsDir: string;
  /** HTML report path */
  htmlReportPath?: string;
  /** JSON report path */
  jsonReportPath?: string;
  /** Threshold used */
  threshold: number;
  /** Final error message (if any) */
  error?: string;
  /** Variables at end of execution */
  finalVariables: PlaybookVariables;
}

/**
 * Execution context for the playbook
 */
interface ExecutionContext {
  /** Resolved simulator UDID */
  udid: string;
  /** Simulator info */
  simulator: { udid: string; name: string; iosVersion: string };
  /** Session ID */
  sessionId: string;
  /** Artifacts directory */
  artifactsDir: string;
  /** App path */
  appPath?: string;
  /** Bundle ID */
  bundleId?: string;
  /** Current variables */
  variables: PlaybookVariables;
  /** Flow results */
  flowResults: RegressionFlowResult[];
  /** Progress callback */
  onProgress?: (update: RegressionCheckProgress) => void;
}

// =============================================================================
// Main Executor
// =============================================================================

/**
 * Execute the Regression Check playbook.
 *
 * This runs visual regression testing:
 * 1. Build app (if needed) or use provided app path
 * 2. Boot simulator and install app
 * 3. For each flow:
 *    a. Reset app state
 *    b. Execute flow
 *    c. Capture screenshot
 *    d. Compare against baseline (or update baseline)
 * 4. Generate regression report
 *
 * @param options - Execution options
 * @returns Execution result with all comparison details
 */
export async function runRegressionCheck(
  options: RegressionCheckOptions
): Promise<IOSResult<RegressionCheckResult>> {
  const startTime = new Date();

  logger.info(`${LOG_CONTEXT} Starting Regression Check`);
  logger.info(`${LOG_CONTEXT} Flows: ${options.inputs.flows.length}`);
  logger.info(`${LOG_CONTEXT} Baseline dir: ${options.inputs.baseline_dir}`);
  logger.info(`${LOG_CONTEXT} Threshold: ${options.inputs.threshold ?? 0.01}`);

  // Load playbook configuration
  let playbook: IOSPlaybookConfig;
  try {
    if (options.playbookPath) {
      playbook = loadPlaybook(options.playbookPath);
    } else {
      playbook = loadPlaybook('Regression-Check');
    }
    logger.info(`${LOG_CONTEXT} Loaded playbook: ${playbook.name} v${playbook.version || '1.0.0'}`);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    logger.error(`${LOG_CONTEXT} Failed to load playbook: ${error}`);
    return {
      success: false,
      error: `Failed to load playbook: ${error}`,
      errorCode: 'COMMAND_FAILED' as IOSErrorCode,
    };
  }

  // Validate inputs
  const validationResult = validateInputs(options.inputs, playbook.inputs);
  if (!validationResult.valid) {
    return {
      success: false,
      error: `Invalid inputs: ${validationResult.errors.join(', ')}`,
      errorCode: 'COMMAND_FAILED' as IOSErrorCode,
    };
  }

  // Initialize variables from playbook
  const threshold = options.inputs.threshold ?? 0.01;
  const variables: PlaybookVariables = {
    ...playbook.variables,
    total_flows: options.inputs.flows.length,
    flows_run: 0,
    regressions_found: 0,
    screenshots_compared: 0,
    baseline_updates: 0,
  };

  // Resolve simulator
  const simulatorResult = await resolveSimulator(options.inputs.simulator);
  if (!simulatorResult.success || !simulatorResult.data) {
    return {
      success: false,
      error: simulatorResult.error || 'Failed to resolve simulator',
      errorCode: simulatorResult.errorCode || ('SIMULATOR_NOT_FOUND' as IOSErrorCode),
    };
  }

  const { udid, simulator } = simulatorResult.data;
  logger.info(`${LOG_CONTEXT} Using simulator: ${simulator.name} (${udid})`);

  // Prepare artifacts directory
  const artifactDir = await getArtifactDirectory(options.sessionId);
  const checkDir = path.join(artifactDir, `regression-check-${Date.now()}`);
  await mkdir(checkDir, { recursive: true });
  await mkdir(path.join(checkDir, 'current'), { recursive: true });
  await mkdir(path.join(checkDir, 'diffs'), { recursive: true });

  // Create execution context
  const context: ExecutionContext = {
    udid,
    simulator,
    sessionId: options.sessionId,
    artifactsDir: checkDir,
    variables,
    flowResults: [],
    onProgress: options.onProgress,
  };

  // Report initialization
  reportProgress(context, {
    phase: 'initializing',
    currentFlow: 0,
    totalFlows: options.inputs.flows.length,
    message: 'Initializing Regression Check',
    percentComplete: 0,
  });

  // Dry run check
  if (options.dryRun) {
    logger.info(`${LOG_CONTEXT} Dry run - validation complete, not executing`);
    return {
      success: true,
      data: createDryRunResult(options, playbook, simulator, checkDir, startTime, variables, threshold),
    };
  }

  // Build or use provided app
  let appPath = options.inputs.app_path;
  let bundleId: string | undefined;

  if (!appPath && options.inputs.project_path) {
    reportProgress(context, {
      phase: 'building',
      currentFlow: 0,
      totalFlows: options.inputs.flows.length,
      message: 'Building project',
      percentComplete: 5,
    });

    const buildResult = await performBuild(options, context);
    if (!buildResult.success || !buildResult.data) {
      return createErrorResult(
        options,
        playbook,
        context,
        buildResult.error || 'Build failed',
        startTime,
        threshold
      );
    }

    appPath = buildResult.data.appPath;
    bundleId = await detectBundleId(appPath, options.inputs.scheme);
    context.appPath = appPath;
    context.bundleId = bundleId;
    logger.info(`${LOG_CONTEXT} Build successful. App: ${appPath}`);
  } else if (appPath) {
    bundleId = await detectBundleId(appPath);
    context.appPath = appPath;
    context.bundleId = bundleId;
  }

  // Install app
  if (appPath) {
    reportProgress(context, {
      phase: 'installing',
      currentFlow: 0,
      totalFlows: options.inputs.flows.length,
      message: 'Installing app',
      percentComplete: 10,
    });

    const installResult = await installApp({ udid, appPath });
    if (!installResult.success) {
      logger.warn(`${LOG_CONTEXT} Install warning: ${installResult.error}`);
    }
  }

  // Launch app for initial state
  if (bundleId) {
    const launchResult = await launchApp({ udid, bundleId });
    if (!launchResult.success) {
      logger.warn(`${LOG_CONTEXT} Launch warning: ${launchResult.error}`);
    }
    await sleep(1000);
  }

  // Ensure baseline directory exists
  const baselineDir = options.cwd
    ? path.resolve(options.cwd, options.inputs.baseline_dir)
    : path.resolve(options.inputs.baseline_dir);

  if (!fs.existsSync(baselineDir)) {
    await mkdir(baselineDir, { recursive: true });
  }

  // Run each flow
  let regressionsFound = 0;
  let baselinesUpdated = 0;
  const failFast = options.inputs.fail_fast ?? false;
  const updateBaselines = options.inputs.update_baselines ?? false;

  for (let i = 0; i < options.inputs.flows.length; i++) {
    const flow = options.inputs.flows[i];
    const flowStartTime = Date.now();

    logger.info(`${LOG_CONTEXT} === Flow ${i + 1}/${options.inputs.flows.length}: ${flow.name} ===`);

    reportProgress(context, {
      phase: 'running_flow',
      currentFlow: i + 1,
      totalFlows: options.inputs.flows.length,
      flowName: flow.name,
      message: `Running flow: ${flow.name}`,
      percentComplete: calculateProgress(i, options.inputs.flows.length, 'running_flow'),
    });

    const flowResult: RegressionFlowResult = {
      flow,
      duration: 0,
    };

    try {
      // Reset app state
      if (bundleId) {
        await terminateApp(udid, bundleId);
        await sleep(500);
        await launchApp({ udid, bundleId });
        await sleep(1000);
      }

      // Execute flow
      const resolvedFlowPath = options.cwd
        ? path.resolve(options.cwd, flow.path)
        : path.resolve(flow.path);

      const runResult = await runFlow({
        flowPath: resolvedFlowPath,
        udid,
        sessionId: options.sessionId,
        bundleId,
        timeout: options.flowTimeout ?? 300000,
        captureOnFailure: true,
        cwd: options.cwd,
        continueOnError: false,
      });

      if (runResult.success && runResult.data) {
        flowResult.flowResult = runResult.data;
      } else {
        flowResult.error = runResult.error || 'Flow execution failed';
        logger.warn(`${LOG_CONTEXT} Flow ${flow.name} failed: ${flowResult.error}`);
      }

      // Capture screenshot
      reportProgress(context, {
        phase: 'capturing',
        currentFlow: i + 1,
        totalFlows: options.inputs.flows.length,
        flowName: flow.name,
        message: `Capturing screenshot: ${flow.name}`,
        percentComplete: calculateProgress(i, options.inputs.flows.length, 'capturing'),
      });

      const currentDir = path.join(checkDir, 'current', flow.name);
      await mkdir(currentDir, { recursive: true });
      const currentScreenshotPath = path.join(currentDir, 'final.png');

      const screenshotResult = await screenshot({
        udid,
        outputPath: currentScreenshotPath,
      });

      if (!screenshotResult.success) {
        flowResult.error = flowResult.error || `Screenshot failed: ${screenshotResult.error}`;
        logger.warn(`${LOG_CONTEXT} Screenshot capture failed: ${screenshotResult.error}`);
      }

      // Update baseline or compare
      const flowBaselineDir = path.join(baselineDir, flow.name);
      const baselineScreenshotPath = path.join(flowBaselineDir, 'final.png');

      if (updateBaselines) {
        // Update baseline mode
        reportProgress(context, {
          phase: 'updating_baseline',
          currentFlow: i + 1,
          totalFlows: options.inputs.flows.length,
          flowName: flow.name,
          message: `Updating baseline: ${flow.name}`,
          percentComplete: calculateProgress(i, options.inputs.flows.length, 'updating_baseline'),
        });

        await mkdir(flowBaselineDir, { recursive: true });

        if (fs.existsSync(currentScreenshotPath)) {
          await copyFile(currentScreenshotPath, baselineScreenshotPath);
          flowResult.baselineUpdated = true;
          baselinesUpdated++;
          logger.info(`${LOG_CONTEXT} Updated baseline for ${flow.name}`);
        }
      } else {
        // Compare mode
        reportProgress(context, {
          phase: 'comparing',
          currentFlow: i + 1,
          totalFlows: options.inputs.flows.length,
          flowName: flow.name,
          message: `Comparing screenshot: ${flow.name}`,
          percentComplete: calculateProgress(i, options.inputs.flows.length, 'comparing'),
        });

        const comparisonResult = await compareScreenshots(
          currentScreenshotPath,
          baselineScreenshotPath,
          path.join(checkDir, 'diffs', flow.name),
          flow.name,
          threshold
        );

        flowResult.comparison = comparisonResult;
        context.variables.screenshots_compared = (context.variables.screenshots_compared as number) + 1;

        if (!comparisonResult.passed) {
          regressionsFound++;
          context.variables.regressions_found = regressionsFound;
          logger.warn(
            `${LOG_CONTEXT} Regression detected in ${flow.name}: ${(comparisonResult.diffPercentage * 100).toFixed(2)}% diff`
          );

          if (failFast) {
            logger.info(`${LOG_CONTEXT} Fail fast enabled - stopping after regression`);
            flowResult.duration = Date.now() - flowStartTime;
            context.flowResults.push(flowResult);
            context.variables.flows_run = i + 1;
            break;
          }
        }
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      flowResult.error = error;
      logger.error(`${LOG_CONTEXT} Flow ${flow.name} error: ${error}`);
    }

    flowResult.duration = Date.now() - flowStartTime;
    context.flowResults.push(flowResult);
    context.variables.flows_run = i + 1;
  }

  // Generate report
  reportProgress(context, {
    phase: 'generating_report',
    currentFlow: options.inputs.flows.length,
    totalFlows: options.inputs.flows.length,
    message: 'Generating regression report',
    percentComplete: 95,
  });

  const htmlReportPath = path.join(checkDir, 'regression_report.html');
  const jsonReportPath = path.join(checkDir, 'regression_report.json');

  await generateReports(context, htmlReportPath, jsonReportPath, threshold, updateBaselines);

  // Build final result
  const endTime = new Date();
  const totalDuration = endTime.getTime() - startTime.getTime();

  const passedFlows = context.flowResults.filter(
    (r) => r.comparison?.passed || r.baselineUpdated
  ).length;
  const failedFlows = context.flowResults.filter(
    (r) => r.comparison && !r.comparison.passed
  ).length;
  const skippedFlows = options.inputs.flows.length - context.flowResults.length;

  const passed = updateBaselines ? true : failedFlows === 0;

  // Final progress report
  reportProgress(context, {
    phase: passed ? 'complete' : 'failed',
    currentFlow: options.inputs.flows.length,
    totalFlows: options.inputs.flows.length,
    message: updateBaselines
      ? `Updated ${baselinesUpdated} baselines`
      : passed
        ? `All ${passedFlows} flows passed`
        : `${failedFlows} regressions detected`,
    percentComplete: 100,
    elapsed: totalDuration,
  });

  const result: RegressionCheckResult = {
    passed,
    totalFlows: options.inputs.flows.length,
    passedFlows,
    failedFlows,
    skippedFlows,
    baselinesUpdated,
    totalDuration,
    startTime,
    endTime,
    flowResults: context.flowResults,
    playbook: {
      name: playbook.name,
      version: playbook.version,
      path: options.playbookPath,
    },
    simulator,
    appPath: context.appPath,
    bundleId: context.bundleId,
    artifactsDir: checkDir,
    htmlReportPath,
    jsonReportPath,
    threshold,
    finalVariables: context.variables,
  };

  logger.info(
    `${LOG_CONTEXT} Regression Check complete: ${passed ? 'PASSED' : 'FAILED'} - ${passedFlows}/${options.inputs.flows.length} flows in ${totalDuration}ms`
  );

  return {
    success: true,
    data: result,
  };
}

// =============================================================================
// Step Executors
// =============================================================================

/**
 * Perform the build step
 */
async function performBuild(
  options: RegressionCheckOptions,
  context: ExecutionContext
): Promise<IOSResult<BuildResult>> {
  const projectPath = options.inputs.project_path!;
  const scheme = options.inputs.scheme!;
  const configuration = options.configuration || 'Debug';

  // Detect project type if needed
  let resolvedProjectPath = projectPath;
  if (!projectPath.endsWith('.xcodeproj') && !projectPath.endsWith('.xcworkspace')) {
    const detectResult = await detectProject(projectPath);
    if (detectResult.success && detectResult.data) {
      resolvedProjectPath = detectResult.data.path;
    }
  }

  return build({
    projectPath: resolvedProjectPath,
    scheme,
    configuration,
    destination: `platform=iOS Simulator,id=${context.udid}`,
    cwd: options.cwd,
  });
}

/**
 * Compare two screenshots and generate diff image
 */
async function compareScreenshots(
  currentPath: string,
  baselinePath: string,
  diffDir: string,
  flowName: string,
  threshold: number
): Promise<ScreenshotComparisonResult> {
  const result: ScreenshotComparisonResult = {
    flowName,
    passed: false,
    diffPercentage: 1.0,
    threshold,
    currentPath,
    baselinePath,
  };

  // Check if current screenshot exists
  if (!fs.existsSync(currentPath)) {
    result.error = 'Current screenshot not found';
    return result;
  }

  // Check if baseline exists
  if (!fs.existsSync(baselinePath)) {
    result.baselineMissing = true;
    result.error = 'Baseline not found - run with update_baselines: true first';
    return result;
  }

  try {
    // Read both images
    const currentBuffer = await readFile(currentPath);
    const baselineBuffer = await readFile(baselinePath);

    // Simple byte comparison for now
    // In production, use a proper image comparison library like pixelmatch
    const diff = compareBuffers(currentBuffer, baselineBuffer);

    result.diffPercentage = diff;
    result.passed = diff <= threshold;

    // Generate diff image if there are differences
    if (!result.passed) {
      await mkdir(diffDir, { recursive: true });
      result.diffPath = path.join(diffDir, 'diff.png');

      // For now, just copy the current image as the "diff"
      // In production, use pixelmatch to generate a proper diff image
      await copyFile(currentPath, result.diffPath);

      logger.debug(
        `${LOG_CONTEXT} Diff: ${(diff * 100).toFixed(2)}% > threshold ${(threshold * 100).toFixed(2)}%`
      );
    }

    return result;
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
    return result;
  }
}

/**
 * Simple buffer comparison (placeholder for proper image comparison)
 * Returns difference percentage (0-1)
 */
function compareBuffers(a: Buffer, b: Buffer): number {
  if (a.length !== b.length) {
    // Different sizes = significant difference
    return 1.0;
  }

  let diffBytes = 0;
  const totalBytes = Math.max(a.length, b.length);

  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      diffBytes++;
    }
  }

  return diffBytes / totalBytes;
}

// =============================================================================
// Report Generation
// =============================================================================

/**
 * Generate HTML and JSON reports
 */
async function generateReports(
  context: ExecutionContext,
  htmlPath: string,
  jsonPath: string,
  threshold: number,
  updateMode: boolean
): Promise<void> {
  try {
    // JSON report
    const jsonReport = {
      timestamp: new Date().toISOString(),
      simulator: context.simulator,
      threshold,
      updateMode,
      totalFlows: context.flowResults.length,
      passedFlows: context.flowResults.filter((r) => r.comparison?.passed || r.baselineUpdated).length,
      failedFlows: context.flowResults.filter((r) => r.comparison && !r.comparison.passed).length,
      results: context.flowResults.map((r) => ({
        flowName: r.flow.name,
        passed: r.comparison?.passed ?? r.baselineUpdated ?? false,
        diffPercentage: r.comparison?.diffPercentage,
        baselineUpdated: r.baselineUpdated,
        error: r.error,
        duration: r.duration,
      })),
    };

    await writeFile(jsonPath, JSON.stringify(jsonReport, null, 2));

    // HTML report
    const html = generateHtmlReport(context.flowResults, threshold, updateMode, context.simulator);
    await writeFile(htmlPath, html);

    logger.debug(`${LOG_CONTEXT} Reports generated: ${htmlPath}, ${jsonPath}`);
  } catch (e) {
    logger.warn(`${LOG_CONTEXT} Failed to generate reports: ${e}`);
  }
}

/**
 * Generate HTML regression report
 */
function generateHtmlReport(
  results: RegressionFlowResult[],
  threshold: number,
  updateMode: boolean,
  simulator: { name: string; iosVersion: string }
): string {
  const passedFlows = results.filter((r) => r.comparison?.passed || r.baselineUpdated).length;
  const failedFlows = results.filter((r) => r.comparison && !r.comparison.passed).length;
  const totalFlows = results.length;

  const statusColor = failedFlows === 0 ? '#28a745' : '#dc3545';
  const statusText = updateMode
    ? 'Baselines Updated'
    : failedFlows === 0
      ? 'All Passed'
      : `${failedFlows} Regression${failedFlows > 1 ? 's' : ''} Detected`;

  const flowRows = results
    .map((r) => {
      const status = r.comparison?.passed
        ? '✅'
        : r.baselineUpdated
          ? '📝'
          : r.comparison?.baselineMissing
            ? '⚠️'
            : '❌';
      const diffPct = r.comparison?.diffPercentage
        ? `${(r.comparison.diffPercentage * 100).toFixed(2)}%`
        : '-';
      const statusClass = r.comparison?.passed || r.baselineUpdated ? 'passed' : 'failed';

      return `
        <tr class="${statusClass}">
          <td>${status}</td>
          <td>${r.flow.name}</td>
          <td>${diffPct}</td>
          <td>${(threshold * 100).toFixed(2)}%</td>
          <td>${r.error || (r.baselineUpdated ? 'Updated' : r.comparison?.passed ? 'Match' : 'Regression')}</td>
          <td>${r.duration}ms</td>
        </tr>
      `;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <title>iOS Regression Check Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 40px; background: #f5f5f5; }
    .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    h1 { color: #333; margin-bottom: 5px; }
    .subtitle { color: #666; margin-bottom: 30px; }
    .summary { display: flex; gap: 20px; margin-bottom: 30px; }
    .summary-card { padding: 20px; border-radius: 8px; flex: 1; text-align: center; }
    .summary-card.status { background: ${statusColor}; color: white; }
    .summary-card.info { background: #f8f9fa; border: 1px solid #dee2e6; }
    .summary-card h2 { margin: 0 0 5px 0; font-size: 24px; }
    .summary-card p { margin: 0; opacity: 0.9; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #dee2e6; }
    th { background: #f8f9fa; font-weight: 600; }
    tr.failed { background: #fff5f5; }
    tr.passed { background: #f5fff5; }
    tr:hover { background: #f0f0f0; }
    .footer { margin-top: 30px; text-align: center; color: #999; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>iOS Regression Check Report</h1>
    <p class="subtitle">Generated: ${new Date().toISOString()} | Simulator: ${simulator.name} (iOS ${simulator.iosVersion})</p>

    <div class="summary">
      <div class="summary-card status">
        <h2>${statusText}</h2>
        <p>${passedFlows}/${totalFlows} flows passed</p>
      </div>
      <div class="summary-card info">
        <h2>${(threshold * 100).toFixed(2)}%</h2>
        <p>Threshold</p>
      </div>
      <div class="summary-card info">
        <h2>${totalFlows}</h2>
        <p>Total Flows</p>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Status</th>
          <th>Flow</th>
          <th>Diff %</th>
          <th>Threshold</th>
          <th>Result</th>
          <th>Duration</th>
        </tr>
      </thead>
      <tbody>
        ${flowRows}
      </tbody>
    </table>

    <p class="footer">Generated by Maestro iOS Regression Check Playbook</p>
  </div>
</body>
</html>`;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Validate playbook inputs
 */
function validateInputs(
  inputs: RegressionCheckInputs,
  inputDefs?: Record<string, PlaybookInputDef>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check required inputs
  if (!inputs.app_path && !inputs.project_path) {
    errors.push('Either app_path or project_path is required');
  }

  if (inputs.project_path && !inputs.scheme) {
    errors.push('scheme is required when project_path is provided');
  }

  if (!inputs.flows || inputs.flows.length === 0) {
    errors.push('flows array is required and must not be empty');
  }

  if (!inputs.baseline_dir) {
    errors.push('baseline_dir is required');
  }

  // Validate threshold range
  if (inputs.threshold !== undefined && (inputs.threshold < 0 || inputs.threshold > 1)) {
    errors.push('threshold must be between 0 and 1');
  }

  // Validate against playbook input definitions
  if (inputDefs) {
    for (const [key, def] of Object.entries(inputDefs)) {
      if (def.required && !(key in inputs)) {
        errors.push(`Required input '${key}' is missing`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Resolve simulator by name or UDID
 */
async function resolveSimulator(
  simulatorSpec?: string
): Promise<IOSResult<{ udid: string; simulator: { udid: string; name: string; iosVersion: string } }>> {
  // If UDID provided, get that specific simulator
  if (simulatorSpec && simulatorSpec.includes('-')) {
    const simResult = await getSimulator(simulatorSpec);
    if (simResult.success && simResult.data) {
      return {
        success: true,
        data: {
          udid: simResult.data.udid,
          simulator: {
            udid: simResult.data.udid,
            name: simResult.data.name,
            iosVersion: simResult.data.iosVersion,
          },
        },
      };
    }
  }

  // Try to find by name
  if (simulatorSpec) {
    const listResult = await listSimulators();
    if (listResult.success && listResult.data) {
      const matching = listResult.data.find(
        (s) => s.name.toLowerCase() === simulatorSpec.toLowerCase()
      );
      if (matching) {
        // Boot if needed
        if (matching.state !== 'Booted') {
          await bootSimulator({ udid: matching.udid });
          await sleep(3000);
        }
        return {
          success: true,
          data: {
            udid: matching.udid,
            simulator: {
              udid: matching.udid,
              name: matching.name,
              iosVersion: matching.iosVersion,
            },
          },
        };
      }
    }
  }

  // Fall back to first booted simulator
  const bootedResult = await getBootedSimulators();
  if (!bootedResult.success || !bootedResult.data || bootedResult.data.length === 0) {
    return {
      success: false,
      error: 'No booted simulators found. Please boot a simulator first.',
      errorCode: 'SIMULATOR_NOT_BOOTED' as IOSErrorCode,
    };
  }

  const sim = bootedResult.data[0];
  return {
    success: true,
    data: {
      udid: sim.udid,
      simulator: {
        udid: sim.udid,
        name: sim.name,
        iosVersion: sim.iosVersion,
      },
    },
  };
}

/**
 * Detect bundle ID from built app
 */
async function detectBundleId(appPath?: string, scheme?: string): Promise<string | undefined> {
  if (!appPath) {
    return scheme ? `com.example.${scheme}` : undefined;
  }

  // Try to read Info.plist
  const plistPath = path.join(appPath, 'Info.plist');
  if (fs.existsSync(plistPath)) {
    try {
      const { execFileNoThrow } = await import('../../utils/execFile');
      const result = await execFileNoThrow('plutil', ['-convert', 'json', '-o', '-', plistPath]);
      if (result.exitCode === 0) {
        const plist = JSON.parse(result.stdout);
        return plist.CFBundleIdentifier;
      }
    } catch {
      // Fall through to default
    }
  }

  return scheme ? `com.example.${scheme}` : undefined;
}

/**
 * Calculate progress percentage
 */
function calculateProgress(currentIndex: number, totalFlows: number, phase: string): number {
  const baseProgress = 15; // After build/install
  const flowProgress = 80; // For all flows
  const reportProgress = 5; // For report generation

  const flowPercent = (currentIndex / totalFlows) * flowProgress;
  const phaseWeights: Record<string, number> = {
    running_flow: 0.4,
    capturing: 0.6,
    comparing: 0.8,
    updating_baseline: 0.9,
  };

  const phaseWeight = phaseWeights[phase] || 0.5;
  const withinFlowProgress = (1 / totalFlows) * flowProgress * phaseWeight;

  return Math.min(95, baseProgress + flowPercent + withinFlowProgress);
}

/**
 * Report progress
 */
function reportProgress(context: ExecutionContext, update: RegressionCheckProgress): void {
  logger.debug(`${LOG_CONTEXT} Progress: ${update.phase} - ${update.message}`);
  context.onProgress?.(update);
}

/**
 * Create dry run result
 */
function createDryRunResult(
  options: RegressionCheckOptions,
  playbook: IOSPlaybookConfig,
  simulator: { udid: string; name: string; iosVersion: string },
  artifactsDir: string,
  startTime: Date,
  variables: PlaybookVariables,
  threshold: number
): RegressionCheckResult {
  const endTime = new Date();
  return {
    passed: false,
    totalFlows: options.inputs.flows.length,
    passedFlows: 0,
    failedFlows: 0,
    skippedFlows: options.inputs.flows.length,
    baselinesUpdated: 0,
    totalDuration: endTime.getTime() - startTime.getTime(),
    startTime,
    endTime,
    flowResults: [],
    playbook: {
      name: playbook.name,
      version: playbook.version,
      path: options.playbookPath,
    },
    simulator,
    artifactsDir,
    threshold,
    finalVariables: variables,
  };
}

/**
 * Create error result
 */
function createErrorResult(
  options: RegressionCheckOptions,
  playbook: IOSPlaybookConfig,
  context: ExecutionContext,
  error: string,
  startTime: Date,
  threshold: number
): IOSResult<RegressionCheckResult> {
  const endTime = new Date();
  return {
    success: true,
    data: {
      passed: false,
      totalFlows: options.inputs.flows.length,
      passedFlows: 0,
      failedFlows: 0,
      skippedFlows: options.inputs.flows.length,
      baselinesUpdated: 0,
      totalDuration: endTime.getTime() - startTime.getTime(),
      startTime,
      endTime,
      flowResults: context.flowResults,
      playbook: {
        name: playbook.name,
        version: playbook.version,
        path: options.playbookPath,
      },
      simulator: context.simulator,
      appPath: context.appPath,
      bundleId: context.bundleId,
      artifactsDir: context.artifactsDir,
      threshold,
      error,
      finalVariables: context.variables,
    },
  };
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// Result Formatters
// =============================================================================

/**
 * Format result for agent output (markdown)
 */
export function formatRegressionCheckResult(result: RegressionCheckResult): string {
  const lines: string[] = [];

  const statusEmoji = result.passed ? '✅' : '❌';
  lines.push(`## ${statusEmoji} Regression Check ${result.passed ? 'Passed' : 'Failed'}`);
  lines.push('');

  // Summary table
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Status | ${result.passed ? 'PASSED' : 'FAILED'} |`);
  lines.push(`| Total Flows | ${result.totalFlows} |`);
  lines.push(`| Passed | ${result.passedFlows} |`);
  lines.push(`| Regressions | ${result.failedFlows} |`);
  lines.push(`| Threshold | ${(result.threshold * 100).toFixed(2)}% |`);
  lines.push(`| Duration | ${formatDuration(result.totalDuration)} |`);
  lines.push(`| Simulator | ${result.simulator.name} |`);
  lines.push('');

  // Flow results
  lines.push('### Flow Results');
  lines.push('');

  for (const fr of result.flowResults) {
    const status = fr.comparison?.passed
      ? '✅'
      : fr.baselineUpdated
        ? '📝'
        : fr.comparison?.baselineMissing
          ? '⚠️'
          : '❌';
    const diffInfo = fr.comparison?.diffPercentage
      ? ` (${(fr.comparison.diffPercentage * 100).toFixed(2)}% diff)`
      : '';
    const info = fr.baselineUpdated ? ' - baseline updated' : fr.error ? ` - ${fr.error}` : diffInfo;
    lines.push(`- ${status} ${fr.flow.name}${info}`);
  }
  lines.push('');

  // Reports
  if (result.htmlReportPath || result.jsonReportPath) {
    lines.push('### Reports');
    lines.push('');
    if (result.htmlReportPath) {
      lines.push(`- HTML: \`${result.htmlReportPath}\``);
    }
    if (result.jsonReportPath) {
      lines.push(`- JSON: \`${result.jsonReportPath}\``);
    }
    lines.push('');
  }

  // Error if present
  if (result.error) {
    lines.push('### Error');
    lines.push('');
    lines.push('```');
    lines.push(result.error);
    lines.push('```');
  }

  return lines.join('\n');
}

/**
 * Format result as JSON
 */
export function formatRegressionCheckResultAsJson(result: RegressionCheckResult): string {
  return JSON.stringify(result, null, 2);
}

/**
 * Format result in compact form
 */
export function formatRegressionCheckResultCompact(result: RegressionCheckResult): string {
  const status = result.passed ? 'PASS' : 'FAIL';
  return `[${status}] ${result.passedFlows}/${result.totalFlows} flows, ${result.failedFlows} regressions, ${formatDuration(result.totalDuration)}`;
}

/**
 * Format duration
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  } else {
    const mins = Math.floor(ms / 60000);
    const secs = ((ms % 60000) / 1000).toFixed(0);
    return `${mins}m ${secs}s`;
  }
}
