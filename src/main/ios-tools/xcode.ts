/**
 * iOS Tools - Xcode Detection & Configuration
 *
 * Functions for detecting Xcode installation and version information.
 */

import { XcodeInfo, IOSResult, IOSSDK } from './types';
import { runXcodeSelect, runXcodebuild, runXcrun } from './utils';
import { logger } from '../utils/logger';

const LOG_CONTEXT = '[iOS-Xcode]';

// =============================================================================
// Xcode Detection
// =============================================================================

/**
 * Detect Xcode installation path using xcode-select.
 *
 * @returns Path to Xcode developer directory or error
 */
export async function detectXcode(): Promise<IOSResult<string>> {
  const result = await runXcodeSelect(['-p']);

  if (result.exitCode !== 0) {
    // Check if Xcode is not installed at all
    if (result.stderr?.includes('error: unable to get active developer directory')) {
      return {
        success: false,
        error: 'Xcode is not installed. Please install Xcode from the App Store.',
        errorCode: 'XCODE_NOT_FOUND',
      };
    }

    return {
      success: false,
      error: `Failed to detect Xcode: ${result.stderr || 'Unknown error'}`,
      errorCode: 'XCODE_NOT_FOUND',
    };
  }

  const path = result.stdout.trim();

  if (!path) {
    return {
      success: false,
      error: 'Xcode path is empty',
      errorCode: 'XCODE_NOT_FOUND',
    };
  }

  logger.info(`${LOG_CONTEXT} Xcode detected at: ${path}`, LOG_CONTEXT);
  return {
    success: true,
    data: path,
  };
}

/**
 * Get Xcode version information.
 *
 * @returns Xcode version and build number or error
 */
export async function getXcodeVersion(): Promise<IOSResult<{ version: string; build: string }>> {
  const result = await runXcodebuild(['-version']);

  if (result.exitCode !== 0) {
    return {
      success: false,
      error: `Failed to get Xcode version: ${result.stderr || 'Unknown error'}`,
      errorCode: 'XCODE_NOT_FOUND',
    };
  }

  // Parse output like:
  // Xcode 15.4
  // Build version 15F31d
  const lines = result.stdout.trim().split('\n');

  let version = 'unknown';
  let build = 'unknown';

  for (const line of lines) {
    const versionMatch = line.match(/^Xcode\s+(\d+\.\d+(?:\.\d+)?)/);
    if (versionMatch) {
      version = versionMatch[1];
    }

    const buildMatch = line.match(/^Build version\s+(\w+)/);
    if (buildMatch) {
      build = buildMatch[1];
    }
  }

  if (version === 'unknown') {
    return {
      success: false,
      error: 'Could not parse Xcode version from output',
      errorCode: 'PARSE_ERROR',
    };
  }

  logger.info(`${LOG_CONTEXT} Xcode version: ${version} (${build})`, LOG_CONTEXT);
  return {
    success: true,
    data: { version, build },
  };
}

/**
 * Validate that Xcode command line tools are properly installed.
 *
 * @returns Success if tools are installed, error otherwise
 */
export async function validateXcodeInstallation(): Promise<IOSResult<void>> {
  // Check xcode-select
  const selectResult = await runXcodeSelect(['-p']);
  if (selectResult.exitCode !== 0) {
    return {
      success: false,
      error: 'Xcode command line tools are not installed. Run: xcode-select --install',
      errorCode: 'XCODE_NOT_FOUND',
    };
  }

  // Check that xcodebuild works
  const buildResult = await runXcodebuild(['-version']);
  if (buildResult.exitCode !== 0) {
    // Check if it's a license agreement issue
    if (buildResult.stderr?.includes('license')) {
      return {
        success: false,
        error: 'Xcode license has not been accepted. Run: sudo xcodebuild -license accept',
        errorCode: 'XCODE_NOT_FOUND',
      };
    }

    return {
      success: false,
      error: `xcodebuild is not working: ${buildResult.stderr || 'Unknown error'}`,
      errorCode: 'XCODE_NOT_FOUND',
    };
  }

  // Check that simctl works
  const simctlResult = await runXcrun(['simctl', 'help']);
  if (simctlResult.exitCode !== 0) {
    return {
      success: false,
      error: 'simctl is not available. Xcode may not be properly installed.',
      errorCode: 'XCODE_NOT_FOUND',
    };
  }

  logger.info(`${LOG_CONTEXT} Xcode installation validated`, LOG_CONTEXT);
  return { success: true };
}

/**
 * Get full Xcode information including path, version, and tools status.
 *
 * @returns Complete XcodeInfo or error
 */
export async function getXcodeInfo(): Promise<IOSResult<XcodeInfo>> {
  // Detect path
  const pathResult = await detectXcode();
  if (!pathResult.success) {
    return {
      success: false,
      error: pathResult.error,
      errorCode: pathResult.errorCode,
    };
  }

  // Get version
  const versionResult = await getXcodeVersion();
  if (!versionResult.success) {
    return {
      success: false,
      error: versionResult.error,
      errorCode: versionResult.errorCode,
    };
  }

  // Check command line tools
  const toolsResult = await validateXcodeInstallation();

  const info: XcodeInfo = {
    path: pathResult.data!,
    version: versionResult.data!.version,
    build: versionResult.data!.build,
    commandLineToolsInstalled: toolsResult.success,
  };

  return {
    success: true,
    data: info,
  };
}

/**
 * List available iOS SDKs.
 *
 * @returns Array of available SDKs or error
 */
export async function listSDKs(): Promise<IOSResult<IOSSDK[]>> {
  const result = await runXcodebuild(['-showsdks', '-json']);

  if (result.exitCode !== 0) {
    return {
      success: false,
      error: `Failed to list SDKs: ${result.stderr || 'Unknown error'}`,
      errorCode: 'COMMAND_FAILED',
    };
  }

  try {
    // Parse JSON output - skip non-JSON prefix if present
    const jsonStart = result.stdout.indexOf('[');
    if (jsonStart === -1) {
      return {
        success: false,
        error: 'No JSON array found in SDK output',
        errorCode: 'PARSE_ERROR',
      };
    }

    const jsonString = result.stdout.slice(jsonStart);
    const allSdks = JSON.parse(jsonString) as Array<{
      buildID: string;
      canonicalName: string;
      displayName: string;
      isBaseSdk: boolean;
      platform: string;
      platformPath: string;
      platformVersion: string;
      productBuildVersion: string;
      productCopyright: string;
      productName: string;
      productVersion: string;
      sdkPath: string;
      sdkVersion: string;
    }>;

    // Filter to iOS SDKs only
    const iosSdks: IOSSDK[] = allSdks
      .filter((sdk) => sdk.platform === 'iphonesimulator' || sdk.platform === 'iphoneos')
      .map((sdk) => ({
        name: sdk.canonicalName,
        version: sdk.sdkVersion,
        type: sdk.platform as 'iphoneos' | 'iphonesimulator',
        path: sdk.sdkPath,
      }));

    logger.info(`${LOG_CONTEXT} Found ${iosSdks.length} iOS SDKs`, LOG_CONTEXT);
    return {
      success: true,
      data: iosSdks,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return {
      success: false,
      error: `Failed to parse SDK list: ${message}`,
      errorCode: 'PARSE_ERROR',
    };
  }
}
