/**
 * iOS Playbook - Design Review Executor
 *
 * Executes the Design Review playbook for capturing screenshots
 * across multiple device sizes for design comparison.
 */

import * as path from 'path';
import * as fs from 'fs';
import { mkdir, writeFile } from 'fs/promises';
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
  bootSimulator,
  listSimulators,
  installApp,
  shutdownSimulator,
} from '../simulator';
import { screenshot } from '../capture';
import { inspectWithXCUITest } from '../inspect';
import { logger } from '../../utils/logger';

const LOG_CONTEXT = '[iOS-DesignReview]';

// =============================================================================
// Types
// =============================================================================

/**
 * Screen definition for design review
 */
export interface DesignScreen {
  /** Screen name (used for file naming) */
  name: string;
  /** Human-readable description */
  description?: string;
  /** Navigation steps to reach this screen */
  navigation?: unknown[];
}

/**
 * Input values for running the Design Review
 */
export interface DesignReviewInputs {
  /** Path to built .app bundle (alternative to project_path) */
  app_path?: string;
  /** Path to Xcode project or workspace (alternative to app_path) */
  project_path?: string;
  /** Build scheme name (required with project_path) */
  scheme?: string;
  /** Bundle ID of the app (auto-detected if not provided) */
  bundle_id?: string;
  /** Map of screens with navigation steps */
  navigation_map: DesignScreen[];
  /** List of simulator names to capture on */
  device_sizes?: string[];
  /** Output directory for screenshots */
  output_dir: string;
  /** Also capture UI hierarchy JSON for each screen */
  capture_ui_tree?: boolean;
  /** Generate HTML comparison sheet */
  generate_comparison_sheet?: boolean;
  /** Seconds to wait after navigation before capture */
  wait_after_navigation?: number;
  /** Reset app state between screen captures */
  reset_between_screens?: boolean;
}

/**
 * Options for the Design Review execution
 */
export interface DesignReviewOptions {
  /** Input values matching playbook inputs */
  inputs: DesignReviewInputs;
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
  onProgress?: (update: DesignReviewProgress) => void;
  /** Dry run - validate without executing */
  dryRun?: boolean;
}

/**
 * Progress update during execution
 */
export interface DesignReviewProgress {
  /** Current execution phase */
  phase:
    | 'initializing'
    | 'building'
    | 'booting'
    | 'installing'
    | 'capturing'
    | 'navigating'
    | 'generating_sheet'
    | 'complete'
    | 'failed';
  /** Current device index (1-based) */
  currentDevice: number;
  /** Total devices */
  totalDevices: number;
  /** Current screen index (1-based) */
  currentScreen: number;
  /** Total screens */
  totalScreens: number;
  /** Current device name */
  deviceName?: string;
  /** Current screen name */
  screenName?: string;
  /** Human-readable message */
  message: string;
  /** Percentage complete (0-100) */
  percentComplete: number;
  /** Time elapsed in ms */
  elapsed?: number;
}

/**
 * Result of capturing a single screen
 */
export interface ScreenCaptureResult {
  /** Device name */
  device: string;
  /** Device slug (file-safe) */
  deviceSlug: string;
  /** Screen name */
  screen: string;
  /** Screen slug (file-safe) */
  screenSlug: string;
  /** Screen description */
  description?: string;
  /** Path to captured screenshot */
  screenshotPath?: string;
  /** Path to UI hierarchy JSON */
  uiTreePath?: string;
  /** Whether capture was successful */
  success: boolean;
  /** Error if capture failed */
  error?: string;
  /** Capture timestamp */
  timestamp: Date;
  /** Duration in ms */
  duration: number;
}

/**
 * Result of processing a single device
 */
export interface DeviceResult {
  /** Device name */
  device: string;
  /** Device slug */
  deviceSlug: string;
  /** Whether device was processed successfully */
  success: boolean;
  /** Error if device processing failed */
  error?: string;
  /** Screen captures for this device */
  captures: ScreenCaptureResult[];
  /** Duration in ms */
  duration: number;
}

/**
 * Final result of the Design Review execution
 */
export interface DesignReviewResult {
  /** Whether all captures succeeded */
  passed: boolean;
  /** Total devices processed */
  totalDevices: number;
  /** Devices that completed successfully */
  devicesCompleted: number;
  /** Devices that failed */
  devicesFailed: number;
  /** Total screens to capture (devices * screens) */
  totalScreens: number;
  /** Screens successfully captured */
  screensCaptured: number;
  /** Capture failures */
  captureFailures: number;
  /** Total duration in ms */
  totalDuration: number;
  /** Start timestamp */
  startTime: Date;
  /** End timestamp */
  endTime: Date;
  /** Results per device */
  deviceResults: DeviceResult[];
  /** All captures (flattened) */
  allCaptures: ScreenCaptureResult[];
  /** Playbook configuration used */
  playbook: {
    name: string;
    version?: string;
    path?: string;
  };
  /** Output directory */
  outputDir: string;
  /** HTML comparison sheet path (if generated) */
  comparisonSheetPath?: string;
  /** JSON report path */
  jsonReportPath?: string;
  /** Built app path (if built) */
  appPath?: string;
  /** Bundle ID */
  bundleId?: string;
  /** Final error message (if any) */
  error?: string;
  /** Variables at end of execution */
  finalVariables: PlaybookVariables;
}

/**
 * Execution context for the playbook
 */
interface ExecutionContext {
  /** Session ID */
  sessionId: string;
  /** Output directory */
  outputDir: string;
  /** App path */
  appPath?: string;
  /** Bundle ID */
  bundleId?: string;
  /** Current variables */
  variables: PlaybookVariables;
  /** Device results */
  deviceResults: DeviceResult[];
  /** Progress callback */
  onProgress?: (update: DesignReviewProgress) => void;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_DEVICE_SIZES = [
  'iPhone SE (3rd generation)',
  'iPhone 15',
  'iPhone 15 Pro Max',
  'iPad Pro (12.9-inch) (6th generation)',
];

// =============================================================================
// Main Executor
// =============================================================================

/**
 * Execute the Design Review playbook.
 *
 * This captures screenshots across multiple device sizes:
 * 1. Build app (if needed) or use provided app path
 * 2. For each device size:
 *    a. Boot simulator
 *    b. Install app
 *    c. For each screen:
 *       i. Navigate to screen
 *       ii. Capture screenshot
 *       iii. Capture UI tree (optional)
 *    d. Shutdown simulator
 * 3. Generate comparison sheet
 *
 * @param options - Execution options
 * @returns Execution result with all capture details
 */
export async function runDesignReview(
  options: DesignReviewOptions
): Promise<IOSResult<DesignReviewResult>> {
  const startTime = new Date();

  logger.info(`${LOG_CONTEXT} Starting Design Review`);
  logger.info(`${LOG_CONTEXT} Screens: ${options.inputs.navigation_map.length}`);
  logger.info(`${LOG_CONTEXT} Devices: ${(options.inputs.device_sizes || DEFAULT_DEVICE_SIZES).length}`);
  logger.info(`${LOG_CONTEXT} Output: ${options.inputs.output_dir}`);

  // Load playbook configuration
  let playbook: IOSPlaybookConfig;
  try {
    if (options.playbookPath) {
      playbook = loadPlaybook(options.playbookPath);
    } else {
      playbook = loadPlaybook('Design-Review');
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

  const devices = options.inputs.device_sizes || DEFAULT_DEVICE_SIZES;
  const screens = options.inputs.navigation_map;

  // Initialize variables
  const variables: PlaybookVariables = {
    ...playbook.variables,
    total_devices: devices.length,
    total_screens: screens.length,
    devices_completed: 0,
    screens_captured: 0,
    capture_failures: 0,
    current_device: null,
    current_screen: null,
  };

  // Resolve output directory
  const outputDir = options.cwd
    ? path.resolve(options.cwd, options.inputs.output_dir)
    : path.resolve(options.inputs.output_dir);

  // Create execution context
  const context: ExecutionContext = {
    sessionId: options.sessionId,
    outputDir,
    variables,
    deviceResults: [],
    onProgress: options.onProgress,
  };

  // Report initialization
  reportProgress(context, {
    phase: 'initializing',
    currentDevice: 0,
    totalDevices: devices.length,
    currentScreen: 0,
    totalScreens: screens.length,
    message: 'Initializing Design Review',
    percentComplete: 0,
  });

  // Dry run check
  if (options.dryRun) {
    logger.info(`${LOG_CONTEXT} Dry run - validation complete, not executing`);
    return {
      success: true,
      data: createDryRunResult(options, playbook, outputDir, startTime, variables, devices, screens),
    };
  }

  // Create output directory
  await mkdir(outputDir, { recursive: true });

  // Build or use provided app
  let appPath = options.inputs.app_path;
  let bundleId = options.inputs.bundle_id;

  if (!appPath && options.inputs.project_path) {
    reportProgress(context, {
      phase: 'building',
      currentDevice: 0,
      totalDevices: devices.length,
      currentScreen: 0,
      totalScreens: screens.length,
      message: 'Building project',
      percentComplete: 2,
    });

    const buildResult = await performBuild(options);
    if (!buildResult.success || !buildResult.data) {
      return createErrorResult(
        options,
        playbook,
        context,
        buildResult.error || 'Build failed',
        startTime,
        devices,
        screens
      );
    }

    appPath = buildResult.data.appPath;
    bundleId = bundleId || (await detectBundleId(appPath, options.inputs.scheme));
    context.appPath = appPath;
    context.bundleId = bundleId;
    logger.info(`${LOG_CONTEXT} Build successful. App: ${appPath}`);
  } else if (appPath) {
    bundleId = bundleId || (await detectBundleId(appPath));
    context.appPath = appPath;
    context.bundleId = bundleId;
  } else if (bundleId) {
    // Only bundle_id provided - app is assumed to already be installed
    context.bundleId = bundleId;
  }

  if (!bundleId) {
    return {
      success: false,
      error: 'Could not determine bundle ID. Provide bundle_id in inputs.',
      errorCode: 'COMMAND_FAILED' as IOSErrorCode,
    };
  }

  // Process each device
  for (let deviceIdx = 0; deviceIdx < devices.length; deviceIdx++) {
    const device = devices[deviceIdx];
    const deviceSlug = slugify(device);
    const deviceStartTime = Date.now();

    logger.info(`${LOG_CONTEXT} === Device ${deviceIdx + 1}/${devices.length}: ${device} ===`);
    context.variables.current_device = device;

    const deviceResult: DeviceResult = {
      device,
      deviceSlug,
      success: false,
      captures: [],
      duration: 0,
    };

    try {
      // Boot simulator
      reportProgress(context, {
        phase: 'booting',
        currentDevice: deviceIdx + 1,
        totalDevices: devices.length,
        currentScreen: 0,
        totalScreens: screens.length,
        deviceName: device,
        message: `Booting simulator: ${device}`,
        percentComplete: calculateProgress(deviceIdx, devices.length, 0, screens.length, 'booting'),
      });

      const bootResult = await bootSimulatorByName(device);
      if (!bootResult.success || !bootResult.udid) {
        deviceResult.error = bootResult.error || `Failed to boot ${device}`;
        logger.warn(`${LOG_CONTEXT} ${deviceResult.error}, skipping`);
        deviceResult.duration = Date.now() - deviceStartTime;
        context.deviceResults.push(deviceResult);
        continue;
      }

      const udid = bootResult.udid;

      // Create device output directory
      const deviceDir = path.join(outputDir, deviceSlug);
      await mkdir(deviceDir, { recursive: true });

      // Install app
      reportProgress(context, {
        phase: 'installing',
        currentDevice: deviceIdx + 1,
        totalDevices: devices.length,
        currentScreen: 0,
        totalScreens: screens.length,
        deviceName: device,
        message: `Installing app on ${device}`,
        percentComplete: calculateProgress(deviceIdx, devices.length, 0, screens.length, 'installing'),
      });

      if (appPath) {
        const installResult = await installApp({ udid, appPath });
        if (!installResult.success) {
          deviceResult.error = installResult.error || `Failed to install on ${device}`;
          logger.warn(`${LOG_CONTEXT} ${deviceResult.error}, skipping`);
          await shutdownSimulator(udid);
          deviceResult.duration = Date.now() - deviceStartTime;
          context.deviceResults.push(deviceResult);
          continue;
        }
      }

      // Launch app initially
      await launchApp({ udid, bundleId });
      await sleep(1000);

      // Capture each screen
      for (let screenIdx = 0; screenIdx < screens.length; screenIdx++) {
        const screen = screens[screenIdx];
        const screenSlug = slugify(screen.name);
        const captureStartTime = Date.now();

        logger.info(`${LOG_CONTEXT}   Screen ${screenIdx + 1}/${screens.length}: ${screen.name}`);
        context.variables.current_screen = screen.name;

        const captureResult: ScreenCaptureResult = {
          device,
          deviceSlug,
          screen: screen.name,
          screenSlug,
          description: screen.description,
          success: false,
          timestamp: new Date(),
          duration: 0,
        };

        try {
          // Reset app if configured
          if (options.inputs.reset_between_screens && screenIdx > 0) {
            await terminateApp(udid, bundleId);
            await sleep(500);
            await launchApp({ udid, bundleId });
            await sleep(1000);
          }

          // Navigate to screen
          if (screen.navigation && screen.navigation.length > 0) {
            reportProgress(context, {
              phase: 'navigating',
              currentDevice: deviceIdx + 1,
              totalDevices: devices.length,
              currentScreen: screenIdx + 1,
              totalScreens: screens.length,
              deviceName: device,
              screenName: screen.name,
              message: `Navigating to ${screen.name}`,
              percentComplete: calculateProgress(deviceIdx, devices.length, screenIdx, screens.length, 'navigating'),
            });

            // TODO: Implement navigation execution
            // For now, we'll assume navigation steps are defined but not executed
            logger.debug(`${LOG_CONTEXT}   Navigation steps: ${screen.navigation.length}`);
          }

          // Wait for screen to stabilize
          const waitTime = options.inputs.wait_after_navigation ?? 1;
          await sleep(waitTime * 1000);

          // Capture screenshot
          reportProgress(context, {
            phase: 'capturing',
            currentDevice: deviceIdx + 1,
            totalDevices: devices.length,
            currentScreen: screenIdx + 1,
            totalScreens: screens.length,
            deviceName: device,
            screenName: screen.name,
            message: `Capturing ${screen.name} on ${device}`,
            percentComplete: calculateProgress(deviceIdx, devices.length, screenIdx, screens.length, 'capturing'),
          });

          const screenshotPath = path.join(deviceDir, `${screenSlug}.png`);
          const screenshotResult = await screenshot({
            udid,
            outputPath: screenshotPath,
          });

          if (screenshotResult.success) {
            captureResult.screenshotPath = screenshotPath;
            captureResult.success = true;
            context.variables.screens_captured = (context.variables.screens_captured as number) + 1;
            logger.debug(`${LOG_CONTEXT}   Screenshot saved: ${screenshotPath}`);
          } else {
            captureResult.error = screenshotResult.error || 'Screenshot capture failed';
            context.variables.capture_failures = (context.variables.capture_failures as number) + 1;
            logger.warn(`${LOG_CONTEXT}   Screenshot failed: ${captureResult.error}`);
          }

          // Capture UI tree if configured
          if (options.inputs.capture_ui_tree !== false && captureResult.success) {
            const uiTreePath = path.join(deviceDir, `${screenSlug}.json`);
            const inspectResult = await inspectWithXCUITest({
              simulatorUdid: udid,
              bundleId: bundleId,
              sessionId: options.sessionId,
              captureScreenshot: false, // We already captured separately
            });

            if (inspectResult.success && inspectResult.data) {
              await writeFile(uiTreePath, JSON.stringify(inspectResult.data, null, 2));
              captureResult.uiTreePath = uiTreePath;
              logger.debug(`${LOG_CONTEXT}   UI tree saved: ${uiTreePath}`);
            }
          }
        } catch (e) {
          captureResult.error = e instanceof Error ? e.message : String(e);
          context.variables.capture_failures = (context.variables.capture_failures as number) + 1;
          logger.error(`${LOG_CONTEXT}   Capture error: ${captureResult.error}`);
        }

        captureResult.duration = Date.now() - captureStartTime;
        deviceResult.captures.push(captureResult);
      }

      // Shutdown simulator
      await shutdownSimulator(udid);
      deviceResult.success = true;
      context.variables.devices_completed = (context.variables.devices_completed as number) + 1;
    } catch (e) {
      deviceResult.error = e instanceof Error ? e.message : String(e);
      logger.error(`${LOG_CONTEXT} Device ${device} error: ${deviceResult.error}`);
    }

    deviceResult.duration = Date.now() - deviceStartTime;
    context.deviceResults.push(deviceResult);
  }

  // Generate comparison sheet
  let comparisonSheetPath: string | undefined;
  let jsonReportPath: string | undefined;

  if (options.inputs.generate_comparison_sheet !== false) {
    reportProgress(context, {
      phase: 'generating_sheet',
      currentDevice: devices.length,
      totalDevices: devices.length,
      currentScreen: screens.length,
      totalScreens: screens.length,
      message: 'Generating comparison sheet',
      percentComplete: 95,
    });

    comparisonSheetPath = path.join(outputDir, 'design_review.html');
    jsonReportPath = path.join(outputDir, 'design_review.json');

    await generateReports(context, comparisonSheetPath, jsonReportPath, devices, screens);
  }

  // Build final result
  const endTime = new Date();
  const totalDuration = endTime.getTime() - startTime.getTime();

  const allCaptures = context.deviceResults.flatMap((d) => d.captures);
  const devicesCompleted = context.deviceResults.filter((d) => d.success).length;
  const devicesFailed = context.deviceResults.filter((d) => !d.success).length;
  const screensCaptured = allCaptures.filter((c) => c.success).length;
  const captureFailures = allCaptures.filter((c) => !c.success).length;

  const passed = captureFailures === 0 && devicesFailed === 0;

  // Final progress report
  reportProgress(context, {
    phase: passed ? 'complete' : 'failed',
    currentDevice: devices.length,
    totalDevices: devices.length,
    currentScreen: screens.length,
    totalScreens: screens.length,
    message: passed
      ? `Captured ${screensCaptured} screens across ${devicesCompleted} devices`
      : `Completed with ${captureFailures} failures`,
    percentComplete: 100,
    elapsed: totalDuration,
  });

  const result: DesignReviewResult = {
    passed,
    totalDevices: devices.length,
    devicesCompleted,
    devicesFailed,
    totalScreens: devices.length * screens.length,
    screensCaptured,
    captureFailures,
    totalDuration,
    startTime,
    endTime,
    deviceResults: context.deviceResults,
    allCaptures,
    playbook: {
      name: playbook.name,
      version: playbook.version,
      path: options.playbookPath,
    },
    outputDir,
    comparisonSheetPath,
    jsonReportPath,
    appPath: context.appPath,
    bundleId: context.bundleId,
    finalVariables: context.variables,
  };

  logger.info(
    `${LOG_CONTEXT} Design Review complete: ${passed ? 'SUCCESS' : 'PARTIAL'} - ${screensCaptured}/${devices.length * screens.length} captures in ${totalDuration}ms`
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
async function performBuild(options: DesignReviewOptions): Promise<IOSResult<BuildResult>> {
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
    destination: 'generic/platform=iOS Simulator',
    cwd: options.cwd,
  });
}

/**
 * Boot a simulator by name
 */
async function bootSimulatorByName(
  name: string
): Promise<{ success: boolean; udid?: string; error?: string }> {
  const listResult = await listSimulators();
  if (!listResult.success || !listResult.data) {
    return { success: false, error: 'Failed to list simulators' };
  }

  const matching = listResult.data.find(
    (s) => s.name.toLowerCase() === name.toLowerCase() && s.isAvailable
  );

  if (!matching) {
    return { success: false, error: `Simulator '${name}' not found or not available` };
  }

  // Boot if needed
  if (matching.state !== 'Booted') {
    const bootResult = await bootSimulator({ udid: matching.udid });
    if (!bootResult.success) {
      return { success: false, error: bootResult.error };
    }
    await sleep(3000);
  }

  return { success: true, udid: matching.udid };
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
  devices: string[],
  screens: DesignScreen[]
): Promise<void> {
  try {
    // JSON report
    const jsonReport = {
      timestamp: new Date().toISOString(),
      outputDir: context.outputDir,
      devices,
      screens: screens.map((s) => ({ name: s.name, description: s.description })),
      captures: context.deviceResults.flatMap((d) =>
        d.captures.map((c) => ({
          device: c.device,
          screen: c.screen,
          description: c.description,
          screenshotPath: c.screenshotPath,
          uiTreePath: c.uiTreePath,
          success: c.success,
          error: c.error,
          timestamp: c.timestamp.toISOString(),
        }))
      ),
      summary: {
        totalDevices: devices.length,
        devicesCompleted: context.deviceResults.filter((d) => d.success).length,
        totalCaptures: context.deviceResults.flatMap((d) => d.captures).length,
        successfulCaptures: context.deviceResults.flatMap((d) => d.captures).filter((c) => c.success)
          .length,
      },
    };

    await writeFile(jsonPath, JSON.stringify(jsonReport, null, 2));

    // HTML report
    const html = generateHtmlReport(context.deviceResults, devices, screens);
    await writeFile(htmlPath, html);

    logger.debug(`${LOG_CONTEXT} Reports generated: ${htmlPath}, ${jsonPath}`);
  } catch (e) {
    logger.warn(`${LOG_CONTEXT} Failed to generate reports: ${e}`);
  }
}

/**
 * Generate HTML comparison sheet
 */
function generateHtmlReport(
  deviceResults: DeviceResult[],
  devices: string[],
  screens: DesignScreen[]
): string {
  const totalCaptures = deviceResults.flatMap((d) => d.captures).length;
  const successfulCaptures = deviceResults.flatMap((d) => d.captures).filter((c) => c.success).length;
  const statusColor = successfulCaptures === totalCaptures ? '#28a745' : '#dc3545';
  const statusText =
    successfulCaptures === totalCaptures
      ? 'All Captures Successful'
      : `${totalCaptures - successfulCaptures} Capture${totalCaptures - successfulCaptures > 1 ? 's' : ''} Failed`;

  // Build screen comparison rows
  const screenRows = screens
    .map((screen) => {
      const screenSlug = slugify(screen.name);
      const deviceCells = devices
        .map((device) => {
          const deviceSlug = slugify(device);
          const deviceResult = deviceResults.find((d) => d.device === device);
          const capture = deviceResult?.captures.find((c) => c.screen === screen.name);

          if (!capture || !capture.success) {
            return `
              <td class="capture-cell failed">
                <div class="capture-placeholder">
                  <span class="status-icon">❌</span>
                  <span class="error-text">${capture?.error || 'Not captured'}</span>
                </div>
              </td>
            `;
          }

          const relativePath = `${deviceSlug}/${screenSlug}.png`;
          return `
            <td class="capture-cell">
              <a href="${relativePath}" target="_blank">
                <img src="${relativePath}" alt="${screen.name} on ${device}" loading="lazy" />
              </a>
            </td>
          `;
        })
        .join('');

      return `
        <tr>
          <td class="screen-name">
            <strong>${screen.name}</strong>
            ${screen.description ? `<br><span class="description">${screen.description}</span>` : ''}
          </td>
          ${deviceCells}
        </tr>
      `;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <title>iOS Design Review</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0;
      padding: 20px;
      background: #f5f5f5;
    }
    .container {
      max-width: 100%;
      margin: 0 auto;
      background: white;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    h1 { color: #333; margin-bottom: 5px; }
    .subtitle { color: #666; margin-bottom: 30px; }
    .summary {
      display: flex;
      gap: 20px;
      margin-bottom: 30px;
      flex-wrap: wrap;
    }
    .summary-card {
      padding: 20px;
      border-radius: 8px;
      flex: 1;
      min-width: 150px;
      text-align: center;
    }
    .summary-card.status { background: ${statusColor}; color: white; }
    .summary-card.info { background: #f8f9fa; border: 1px solid #dee2e6; }
    .summary-card h2 { margin: 0 0 5px 0; font-size: 24px; }
    .summary-card p { margin: 0; opacity: 0.9; }

    .comparison-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }
    .comparison-table th {
      background: #f8f9fa;
      padding: 15px 10px;
      text-align: center;
      border-bottom: 2px solid #dee2e6;
      position: sticky;
      top: 0;
      z-index: 10;
    }
    .comparison-table td {
      padding: 10px;
      border-bottom: 1px solid #dee2e6;
      vertical-align: top;
    }
    .screen-name {
      min-width: 150px;
      background: #fafafa;
    }
    .screen-name .description {
      font-size: 12px;
      color: #666;
    }
    .capture-cell {
      min-width: 200px;
      text-align: center;
    }
    .capture-cell img {
      max-width: 200px;
      max-height: 400px;
      border: 1px solid #ddd;
      border-radius: 8px;
      transition: transform 0.2s;
    }
    .capture-cell img:hover {
      transform: scale(1.05);
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    .capture-cell.failed {
      background: #fff5f5;
    }
    .capture-placeholder {
      padding: 40px 20px;
      color: #999;
    }
    .status-icon { font-size: 24px; display: block; margin-bottom: 10px; }
    .error-text { font-size: 12px; color: #dc3545; }

    .footer {
      margin-top: 30px;
      text-align: center;
      color: #999;
      font-size: 12px;
    }

    @media (max-width: 768px) {
      .comparison-table { display: block; overflow-x: auto; }
      .capture-cell img { max-width: 150px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>iOS Design Review</h1>
    <p class="subtitle">Generated: ${new Date().toISOString()}</p>

    <div class="summary">
      <div class="summary-card status">
        <h2>${statusText}</h2>
        <p>${successfulCaptures}/${totalCaptures} captures</p>
      </div>
      <div class="summary-card info">
        <h2>${devices.length}</h2>
        <p>Devices</p>
      </div>
      <div class="summary-card info">
        <h2>${screens.length}</h2>
        <p>Screens</p>
      </div>
    </div>

    <table class="comparison-table">
      <thead>
        <tr>
          <th>Screen</th>
          ${devices.map((d) => `<th>${d}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${screenRows}
      </tbody>
    </table>

    <p class="footer">Generated by Maestro iOS Design Review Playbook</p>
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
  inputs: DesignReviewInputs,
  inputDefs?: Record<string, PlaybookInputDef>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check required inputs - need either app_path, project_path, or bundle_id
  if (!inputs.app_path && !inputs.project_path && !inputs.bundle_id) {
    errors.push('Either app_path or project_path is required');
  }

  if (inputs.project_path && !inputs.scheme) {
    errors.push('scheme is required when project_path is provided');
  }

  if (!inputs.navigation_map || inputs.navigation_map.length === 0) {
    errors.push('navigation_map array is required and must not be empty');
  }

  if (!inputs.output_dir) {
    errors.push('output_dir is required');
  }

  // Validate navigation_map entries
  if (inputs.navigation_map) {
    for (let i = 0; i < inputs.navigation_map.length; i++) {
      const screen = inputs.navigation_map[i];
      if (!screen.name) {
        errors.push(`navigation_map[${i}] must have a 'name' field`);
      }
    }
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
 * Convert string to URL-safe slug
 */
function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Calculate progress percentage
 */
function calculateProgress(
  deviceIdx: number,
  totalDevices: number,
  screenIdx: number,
  totalScreens: number,
  phase: string
): number {
  const baseProgress = 5; // Build phase
  const deviceProgress = 90; // For all devices

  const devicePercent = (deviceIdx / totalDevices) * deviceProgress;
  const screenPercent = totalScreens > 0 ? ((screenIdx + 1) / totalScreens) * (deviceProgress / totalDevices) : 0;

  const phaseWeights: Record<string, number> = {
    booting: 0.1,
    installing: 0.2,
    navigating: 0.4,
    capturing: 0.8,
  };

  const phaseWeight = phaseWeights[phase] || 0.5;

  return Math.min(95, baseProgress + devicePercent + screenPercent * phaseWeight);
}

/**
 * Report progress
 */
function reportProgress(context: ExecutionContext, update: DesignReviewProgress): void {
  logger.debug(`${LOG_CONTEXT} Progress: ${update.phase} - ${update.message}`);
  context.onProgress?.(update);
}

/**
 * Create dry run result
 */
function createDryRunResult(
  options: DesignReviewOptions,
  playbook: IOSPlaybookConfig,
  outputDir: string,
  startTime: Date,
  variables: PlaybookVariables,
  devices: string[],
  screens: DesignScreen[]
): DesignReviewResult {
  const endTime = new Date();
  return {
    passed: false,
    totalDevices: devices.length,
    devicesCompleted: 0,
    devicesFailed: 0,
    totalScreens: devices.length * screens.length,
    screensCaptured: 0,
    captureFailures: 0,
    totalDuration: endTime.getTime() - startTime.getTime(),
    startTime,
    endTime,
    deviceResults: [],
    allCaptures: [],
    playbook: {
      name: playbook.name,
      version: playbook.version,
      path: options.playbookPath,
    },
    outputDir,
    finalVariables: variables,
  };
}

/**
 * Create error result
 */
function createErrorResult(
  options: DesignReviewOptions,
  playbook: IOSPlaybookConfig,
  context: ExecutionContext,
  error: string,
  startTime: Date,
  devices: string[],
  screens: DesignScreen[]
): IOSResult<DesignReviewResult> {
  const endTime = new Date();
  return {
    success: true,
    data: {
      passed: false,
      totalDevices: devices.length,
      devicesCompleted: 0,
      devicesFailed: devices.length,
      totalScreens: devices.length * screens.length,
      screensCaptured: 0,
      captureFailures: 0,
      totalDuration: endTime.getTime() - startTime.getTime(),
      startTime,
      endTime,
      deviceResults: context.deviceResults,
      allCaptures: [],
      playbook: {
        name: playbook.name,
        version: playbook.version,
        path: options.playbookPath,
      },
      outputDir: context.outputDir,
      appPath: context.appPath,
      bundleId: context.bundleId,
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
export function formatDesignReviewResult(result: DesignReviewResult): string {
  const lines: string[] = [];

  const statusEmoji = result.passed ? '✅' : '⚠️';
  lines.push(`## ${statusEmoji} Design Review ${result.passed ? 'Complete' : 'Completed with Issues'}`);
  lines.push('');

  // Summary table
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Status | ${result.passed ? 'SUCCESS' : 'PARTIAL'} |`);
  lines.push(`| Devices | ${result.devicesCompleted}/${result.totalDevices} |`);
  lines.push(`| Screens Captured | ${result.screensCaptured}/${result.totalScreens} |`);
  lines.push(`| Failures | ${result.captureFailures} |`);
  lines.push(`| Duration | ${formatDuration(result.totalDuration)} |`);
  lines.push(`| Output | \`${result.outputDir}\` |`);
  lines.push('');

  // Device results
  lines.push('### Device Results');
  lines.push('');

  for (const dr of result.deviceResults) {
    const status = dr.success ? '✅' : '❌';
    const captures = dr.captures.filter((c) => c.success).length;
    const total = dr.captures.length;
    lines.push(`- ${status} **${dr.device}**: ${captures}/${total} screens`);
    if (dr.error) {
      lines.push(`  - Error: ${dr.error}`);
    }
  }
  lines.push('');

  // Reports
  if (result.comparisonSheetPath) {
    lines.push('### Reports');
    lines.push('');
    lines.push(`- Comparison Sheet: \`${result.comparisonSheetPath}\``);
    if (result.jsonReportPath) {
      lines.push(`- JSON Report: \`${result.jsonReportPath}\``);
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
export function formatDesignReviewResultAsJson(result: DesignReviewResult): string {
  return JSON.stringify(result, null, 2);
}

/**
 * Format result in compact form
 */
export function formatDesignReviewResultCompact(result: DesignReviewResult): string {
  const status = result.passed ? 'SUCCESS' : 'PARTIAL';
  return `[${status}] ${result.screensCaptured}/${result.totalScreens} captures across ${result.devicesCompleted} devices, ${formatDuration(result.totalDuration)}`;
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
