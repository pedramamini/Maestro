/**
 * iOS Tools - Screenshot & Recording Capture
 *
 * Functions for capturing screenshots and video recordings from simulators.
 */

import fs from 'fs/promises';
import path from 'path';
import {
  ScreenshotOptions,
  ScreenshotResult,
  RecordingOptions,
  IOSResult,
} from './types';
import { runSimctl } from './utils';
import { getSimulator } from './simulator';
import { logger } from '../utils/logger';

const LOG_CONTEXT = '[iOS-Capture]';

// Track active recordings by UDID
const activeRecordings = new Map<string, { outputPath: string }>();

// =============================================================================
// Screenshot Capture
// =============================================================================

/**
 * Capture a screenshot from a simulator.
 *
 * @param options - Screenshot options including UDID and output path
 * @returns Screenshot result with path and metadata
 */
export async function screenshot(options: ScreenshotOptions): Promise<IOSResult<ScreenshotResult>> {
  const {
    udid,
    outputPath,
    type = 'display',
    display = 'internal',
    mask = 'ignored',
  } = options;

  // Verify simulator is booted
  const simResult = await getSimulator(udid);
  if (!simResult.success) {
    return {
      success: false,
      error: simResult.error,
      errorCode: simResult.errorCode,
    };
  }

  if (simResult.data!.state !== 'Booted') {
    return {
      success: false,
      error: 'Simulator must be booted to capture screenshot',
      errorCode: 'SIMULATOR_NOT_BOOTED',
    };
  }

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  try {
    await fs.mkdir(outputDir, { recursive: true });
  } catch (e) {
    // Directory might already exist
  }

  // Build capture command
  const captureArgs: string[] = ['io', udid, 'screenshot'];

  // Add display option
  captureArgs.push('--display', display);

  // Add mask option
  captureArgs.push('--mask', mask);

  // Add type option
  captureArgs.push('--type', type);

  // Add output path
  captureArgs.push(outputPath);

  logger.info(`${LOG_CONTEXT} Capturing screenshot from ${udid} to ${outputPath}`, LOG_CONTEXT);
  const result = await runSimctl(captureArgs);

  if (result.exitCode !== 0) {
    return {
      success: false,
      error: `Failed to capture screenshot: ${result.stderr || 'Unknown error'}`,
      errorCode: 'SCREENSHOT_FAILED',
    };
  }

  // Get file info
  let size = 0;
  try {
    const stat = await fs.stat(outputPath);
    size = stat.size;
  } catch (e) {
    logger.warn(`${LOG_CONTEXT} Could not stat screenshot file: ${outputPath}`, LOG_CONTEXT);
  }

  const screenshotResult: ScreenshotResult = {
    path: outputPath,
    size,
    timestamp: new Date(),
  };

  logger.info(`${LOG_CONTEXT} Screenshot captured: ${outputPath} (${size} bytes)`, LOG_CONTEXT);
  return {
    success: true,
    data: screenshotResult,
  };
}

/**
 * Capture a screenshot with automatic file naming.
 * Creates timestamped PNG file in the specified directory.
 *
 * @param udid - Simulator UDID
 * @param directory - Directory to save screenshot
 * @param prefix - Optional filename prefix (default: 'screenshot')
 * @returns Screenshot result or error
 */
export async function captureScreenshot(
  udid: string,
  directory: string,
  prefix: string = 'screenshot'
): Promise<IOSResult<ScreenshotResult>> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${prefix}-${timestamp}.png`;
  const outputPath = path.join(directory, filename);

  return screenshot({
    udid,
    outputPath,
  });
}

// =============================================================================
// Video Recording
// =============================================================================

/**
 * Start video recording on a simulator.
 * Note: Only one recording per simulator can be active at a time.
 *
 * @param options - Recording options
 * @returns Success or error
 */
export async function startRecording(options: RecordingOptions): Promise<IOSResult<void>> {
  const {
    udid,
    outputPath,
    codec = 'h264',
    display = 'internal',
    mask = 'ignored',
  } = options;

  // Check if already recording
  if (activeRecordings.has(udid)) {
    return {
      success: false,
      error: 'Recording already in progress for this simulator',
      errorCode: 'RECORDING_FAILED',
    };
  }

  // Verify simulator is booted
  const simResult = await getSimulator(udid);
  if (!simResult.success) {
    return {
      success: false,
      error: simResult.error,
      errorCode: simResult.errorCode,
    };
  }

  if (simResult.data!.state !== 'Booted') {
    return {
      success: false,
      error: 'Simulator must be booted to record video',
      errorCode: 'SIMULATOR_NOT_BOOTED',
    };
  }

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  try {
    await fs.mkdir(outputDir, { recursive: true });
  } catch (e) {
    // Directory might already exist
  }

  // Build record command
  const recordArgs: string[] = ['io', udid, 'recordVideo'];

  // Add codec option
  recordArgs.push('--codec', codec);

  // Add display option
  recordArgs.push('--display', display);

  // Add mask option
  recordArgs.push('--mask', mask);

  // Add output path
  recordArgs.push(outputPath);

  // Note: startRecording is async - the command runs until stopRecording is called
  // We use a detached process approach here

  logger.info(`${LOG_CONTEXT} Starting video recording from ${udid} to ${outputPath}`, LOG_CONTEXT);

  // Track the recording
  activeRecordings.set(udid, { outputPath });

  // Start recording in background (non-blocking)
  // The recording will be stopped by stopRecording() which sends SIGINT
  runSimctl(recordArgs).then((result) => {
    // Recording finished (either by stopRecording or error)
    activeRecordings.delete(udid);
    if (result.exitCode !== 0 && result.exitCode !== 'SIGINT') {
      logger.warn(`${LOG_CONTEXT} Recording ended with error: ${result.stderr}`, LOG_CONTEXT);
    }
  });

  return { success: true };
}

/**
 * Stop video recording on a simulator.
 *
 * @param udid - Simulator UDID
 * @returns Path to recorded video or error
 */
export async function stopRecording(udid: string): Promise<IOSResult<string>> {
  const recording = activeRecordings.get(udid);

  if (!recording) {
    return {
      success: false,
      error: 'No active recording for this simulator',
      errorCode: 'RECORDING_FAILED',
    };
  }

  logger.info(`${LOG_CONTEXT} Stopping video recording for ${udid}`, LOG_CONTEXT);

  // Send SIGINT to stop recording gracefully
  // The simctl recordVideo command handles SIGINT by finishing the video file
  const result = await runSimctl(['io', udid, 'recordVideo', '--stop']);

  // Clean up tracking regardless of result
  activeRecordings.delete(udid);

  if (result.exitCode !== 0) {
    // Recording might have already stopped
    logger.warn(`${LOG_CONTEXT} Stop recording command returned: ${result.stderr}`, LOG_CONTEXT);
  }

  // Give a moment for the file to be finalized
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Verify the file exists
  try {
    await fs.access(recording.outputPath);
    logger.info(`${LOG_CONTEXT} Recording saved: ${recording.outputPath}`, LOG_CONTEXT);
    return {
      success: true,
      data: recording.outputPath,
    };
  } catch (e) {
    return {
      success: false,
      error: `Recording file not found: ${recording.outputPath}`,
      errorCode: 'RECORDING_FAILED',
    };
  }
}

/**
 * Check if a recording is currently active for a simulator.
 *
 * @param udid - Simulator UDID
 * @returns True if recording is active
 */
export function isRecording(udid: string): boolean {
  return activeRecordings.has(udid);
}

// =============================================================================
// Screen Information
// =============================================================================

/**
 * Get screen dimensions of a simulator.
 * Note: This is a rough approximation based on device type.
 *
 * @param udid - Simulator UDID
 * @returns Screen dimensions or error
 */
export async function getScreenSize(udid: string): Promise<IOSResult<{ width: number; height: number }>> {
  // Capture a small screenshot to get actual dimensions
  // This is more reliable than parsing device types

  const tempPath = path.join('/tmp', `maestro-screen-size-${udid}.png`);

  const result = await screenshot({
    udid,
    outputPath: tempPath,
  });

  if (!result.success) {
    // Fallback to common dimensions
    return {
      success: true,
      data: { width: 1170, height: 2532 }, // iPhone 14 Pro dimensions
    };
  }

  // Parse PNG header for dimensions
  try {
    const buffer = await fs.readFile(tempPath);

    // PNG dimensions are at bytes 16-23 (width) and 20-23 (height) after header
    if (buffer.length >= 24) {
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);

      // Clean up temp file
      await fs.unlink(tempPath).catch(() => {});

      return {
        success: true,
        data: { width, height },
      };
    }
  } catch (e) {
    logger.warn(`${LOG_CONTEXT} Could not parse screenshot for dimensions`, LOG_CONTEXT);
  }

  // Clean up temp file
  await fs.unlink(tempPath).catch(() => {});

  // Fallback
  return {
    success: true,
    data: { width: 1170, height: 2532 },
  };
}
