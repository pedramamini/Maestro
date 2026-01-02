/**
 * iOS Tools - Simulator Management
 *
 * Functions for managing iOS simulators via xcrun simctl.
 * Includes listing, booting, installing apps, and app lifecycle.
 */

import {
  Simulator,
  SimulatorsByRuntime,
  BootSimulatorOptions,
  LaunchAppOptions,
  InstallAppOptions,
  AppContainer,
  ContainerType,
  IOSResult,
  SimulatorState,
} from './types';
import {
  runSimctl,
  parseSimctlJson,
  parseIOSVersionFromRuntime,
  waitFor,
  createFailure,
} from './utils';
import { logger } from '../utils/logger';

const LOG_CONTEXT = '[iOS-Simulator]';

// =============================================================================
// Simulator Listing
// =============================================================================

/**
 * List all available simulators.
 *
 * @returns Array of simulators or error
 */
export async function listSimulators(): Promise<IOSResult<Simulator[]>> {
  const result = await runSimctl(['list', 'devices', '--json']);

  if (result.exitCode !== 0) {
    return createFailure(result, 'COMMAND_FAILED', 'Failed to list simulators');
  }

  const parsed = parseSimctlJson(result.stdout);
  if (!parsed.success || !parsed.data) {
    return {
      success: false,
      error: parsed.error || 'Failed to parse simulator list',
      errorCode: 'PARSE_ERROR',
    };
  }

  const simulators: Simulator[] = [];

  for (const [runtimeId, devices] of Object.entries(parsed.data.devices)) {
    const iosVersion = parseIOSVersionFromRuntime(runtimeId);

    for (const device of devices) {
      simulators.push({
        udid: device.udid,
        name: device.name,
        state: device.state as SimulatorState,
        isAvailable: device.isAvailable,
        runtime: runtimeId,
        iosVersion,
        deviceType: device.deviceTypeIdentifier,
        availabilityError: device.availabilityError,
      });
    }
  }

  logger.info(`${LOG_CONTEXT} Found ${simulators.length} simulators`, LOG_CONTEXT);
  return {
    success: true,
    data: simulators,
  };
}

/**
 * List simulators grouped by runtime.
 *
 * @returns Simulators organized by runtime or error
 */
export async function listSimulatorsByRuntime(): Promise<IOSResult<SimulatorsByRuntime>> {
  const result = await listSimulators();

  if (!result.success || !result.data) {
    return {
      success: false,
      error: result.error,
      errorCode: result.errorCode,
    };
  }

  const byRuntime: SimulatorsByRuntime = {};

  for (const sim of result.data) {
    if (!byRuntime[sim.runtime]) {
      byRuntime[sim.runtime] = [];
    }
    byRuntime[sim.runtime].push(sim);
  }

  return {
    success: true,
    data: byRuntime,
  };
}

/**
 * Get all currently booted simulators.
 *
 * @returns Array of booted simulators or error
 */
export async function getBootedSimulators(): Promise<IOSResult<Simulator[]>> {
  const result = await listSimulators();

  if (!result.success || !result.data) {
    return {
      success: false,
      error: result.error,
      errorCode: result.errorCode,
    };
  }

  const booted = result.data.filter((sim) => sim.state === 'Booted');

  logger.info(`${LOG_CONTEXT} Found ${booted.length} booted simulators`, LOG_CONTEXT);
  return {
    success: true,
    data: booted,
  };
}

/**
 * Get a specific simulator by UDID.
 *
 * @param udid - Simulator UDID
 * @returns Simulator info or error if not found
 */
export async function getSimulator(udid: string): Promise<IOSResult<Simulator>> {
  const result = await listSimulators();

  if (!result.success || !result.data) {
    return {
      success: false,
      error: result.error,
      errorCode: result.errorCode,
    };
  }

  const simulator = result.data.find((sim) => sim.udid === udid);

  if (!simulator) {
    return {
      success: false,
      error: `Simulator not found: ${udid}`,
      errorCode: 'SIMULATOR_NOT_FOUND',
    };
  }

  return {
    success: true,
    data: simulator,
  };
}

// =============================================================================
// Simulator Lifecycle
// =============================================================================

/**
 * Boot a simulator.
 *
 * @param options - Boot options including UDID and timeout
 * @returns Success or error
 */
export async function bootSimulator(options: BootSimulatorOptions): Promise<IOSResult<void>> {
  const { udid, timeout = 60000, waitForBoot = true } = options;

  // Check if already booted
  const simResult = await getSimulator(udid);
  if (!simResult.success) {
    return {
      success: false,
      error: simResult.error,
      errorCode: simResult.errorCode,
    };
  }

  if (simResult.data!.state === 'Booted') {
    logger.info(`${LOG_CONTEXT} Simulator ${udid} is already booted`, LOG_CONTEXT);
    return { success: true };
  }

  // Boot the simulator
  logger.info(`${LOG_CONTEXT} Booting simulator: ${udid}`, LOG_CONTEXT);
  const bootResult = await runSimctl(['boot', udid]);

  if (bootResult.exitCode !== 0) {
    // Check for specific error conditions
    if (bootResult.stderr?.includes('Unable to boot device in current state')) {
      // Might be in process of booting
      if (simResult.data!.state === 'Booting') {
        logger.info(`${LOG_CONTEXT} Simulator ${udid} is already booting`, LOG_CONTEXT);
      } else {
        return {
          success: false,
          error: `Simulator cannot be booted: ${bootResult.stderr}`,
          errorCode: 'SIMULATOR_BOOT_FAILED',
        };
      }
    } else {
      return {
        success: false,
        error: `Failed to boot simulator: ${bootResult.stderr || 'Unknown error'}`,
        errorCode: 'SIMULATOR_BOOT_FAILED',
      };
    }
  }

  // Wait for boot if requested
  if (waitForBoot) {
    const waitResult = await waitForSimulatorBoot(udid, timeout);
    if (!waitResult.success) {
      return waitResult;
    }
  }

  logger.info(`${LOG_CONTEXT} Simulator ${udid} booted successfully`, LOG_CONTEXT);
  return { success: true };
}

/**
 * Wait for a simulator to finish booting.
 *
 * @param udid - Simulator UDID
 * @param timeout - Maximum time to wait in milliseconds
 * @returns Success when booted or timeout error
 */
export async function waitForSimulatorBoot(udid: string, timeout: number): Promise<IOSResult<void>> {
  logger.info(`${LOG_CONTEXT} Waiting for simulator ${udid} to boot (timeout: ${timeout}ms)`, LOG_CONTEXT);

  const result = await waitFor(
    async () => {
      const simResult = await getSimulator(udid);
      return simResult.success && simResult.data?.state === 'Booted';
    },
    timeout,
    1000 // Check every second
  );

  if (!result.success) {
    return {
      success: false,
      error: `Simulator failed to boot within ${timeout}ms`,
      errorCode: 'TIMEOUT',
    };
  }

  return { success: true };
}

/**
 * Shutdown a simulator.
 *
 * @param udid - Simulator UDID
 * @returns Success or error
 */
export async function shutdownSimulator(udid: string): Promise<IOSResult<void>> {
  // Check if already shutdown
  const simResult = await getSimulator(udid);
  if (simResult.success && simResult.data?.state === 'Shutdown') {
    logger.info(`${LOG_CONTEXT} Simulator ${udid} is already shutdown`, LOG_CONTEXT);
    return { success: true };
  }

  logger.info(`${LOG_CONTEXT} Shutting down simulator: ${udid}`, LOG_CONTEXT);
  const result = await runSimctl(['shutdown', udid]);

  if (result.exitCode !== 0) {
    return {
      success: false,
      error: `Failed to shutdown simulator: ${result.stderr || 'Unknown error'}`,
      errorCode: 'COMMAND_FAILED',
    };
  }

  return { success: true };
}

/**
 * Erase a simulator (reset to clean state).
 *
 * @param udid - Simulator UDID
 * @returns Success or error
 */
export async function eraseSimulator(udid: string): Promise<IOSResult<void>> {
  // Simulator must be shutdown to erase
  const shutdownResult = await shutdownSimulator(udid);
  if (!shutdownResult.success) {
    return shutdownResult;
  }

  logger.info(`${LOG_CONTEXT} Erasing simulator: ${udid}`, LOG_CONTEXT);
  const result = await runSimctl(['erase', udid]);

  if (result.exitCode !== 0) {
    return {
      success: false,
      error: `Failed to erase simulator: ${result.stderr || 'Unknown error'}`,
      errorCode: 'COMMAND_FAILED',
    };
  }

  return { success: true };
}

// =============================================================================
// App Installation
// =============================================================================

/**
 * Install an app on a simulator.
 *
 * @param options - Install options including UDID and app path
 * @returns Success or error
 */
export async function installApp(options: InstallAppOptions): Promise<IOSResult<void>> {
  const { udid, appPath } = options;

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
      error: 'Simulator must be booted to install an app',
      errorCode: 'SIMULATOR_NOT_BOOTED',
    };
  }

  logger.info(`${LOG_CONTEXT} Installing app: ${appPath} on ${udid}`, LOG_CONTEXT);
  const result = await runSimctl(['install', udid, appPath]);

  if (result.exitCode !== 0) {
    return {
      success: false,
      error: `Failed to install app: ${result.stderr || 'Unknown error'}`,
      errorCode: 'APP_INSTALL_FAILED',
    };
  }

  logger.info(`${LOG_CONTEXT} App installed successfully`, LOG_CONTEXT);
  return { success: true };
}

/**
 * Uninstall an app from a simulator.
 *
 * @param udid - Simulator UDID
 * @param bundleId - App bundle identifier
 * @returns Success or error
 */
export async function uninstallApp(udid: string, bundleId: string): Promise<IOSResult<void>> {
  logger.info(`${LOG_CONTEXT} Uninstalling app: ${bundleId} from ${udid}`, LOG_CONTEXT);
  const result = await runSimctl(['uninstall', udid, bundleId]);

  if (result.exitCode !== 0) {
    // Check if app wasn't installed
    if (result.stderr?.includes('Unable to find')) {
      return {
        success: false,
        error: `App not installed: ${bundleId}`,
        errorCode: 'APP_NOT_INSTALLED',
      };
    }

    return {
      success: false,
      error: `Failed to uninstall app: ${result.stderr || 'Unknown error'}`,
      errorCode: 'COMMAND_FAILED',
    };
  }

  return { success: true };
}

// =============================================================================
// App Lifecycle
// =============================================================================

/**
 * Launch an app on a simulator.
 *
 * @param options - Launch options
 * @returns Success or error
 */
export async function launchApp(options: LaunchAppOptions): Promise<IOSResult<void>> {
  const { udid, bundleId, args = [], env = {}, waitForLaunch = true } = options;

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
      error: 'Simulator must be booted to launch an app',
      errorCode: 'SIMULATOR_NOT_BOOTED',
    };
  }

  // Build launch command
  const launchArgs: string[] = ['launch'];

  if (!waitForLaunch) {
    launchArgs.push('--terminate-running-process');
  }

  launchArgs.push(udid, bundleId);

  // Add app arguments if provided
  if (args.length > 0) {
    launchArgs.push('--');
    launchArgs.push(...args);
  }

  logger.info(`${LOG_CONTEXT} Launching app: ${bundleId} on ${udid}`, LOG_CONTEXT);
  const result = await runSimctl(launchArgs);

  if (result.exitCode !== 0) {
    // Check for specific errors
    if (result.stderr?.includes('Unable to find bundle') || result.stderr?.includes('The bundle identifier')) {
      return {
        success: false,
        error: `App not installed: ${bundleId}`,
        errorCode: 'APP_NOT_INSTALLED',
      };
    }

    return {
      success: false,
      error: `Failed to launch app: ${result.stderr || 'Unknown error'}`,
      errorCode: 'APP_LAUNCH_FAILED',
    };
  }

  logger.info(`${LOG_CONTEXT} App launched successfully`, LOG_CONTEXT);
  return { success: true };
}

/**
 * Terminate a running app.
 *
 * @param udid - Simulator UDID
 * @param bundleId - App bundle identifier
 * @returns Success or error
 */
export async function terminateApp(udid: string, bundleId: string): Promise<IOSResult<void>> {
  logger.info(`${LOG_CONTEXT} Terminating app: ${bundleId} on ${udid}`, LOG_CONTEXT);
  const result = await runSimctl(['terminate', udid, bundleId]);

  if (result.exitCode !== 0) {
    // Some errors are expected (app already terminated, not running, etc.)
    if (result.stderr?.includes('not running')) {
      logger.info(`${LOG_CONTEXT} App was not running: ${bundleId}`, LOG_CONTEXT);
      return { success: true };
    }

    return {
      success: false,
      error: `Failed to terminate app: ${result.stderr || 'Unknown error'}`,
      errorCode: 'COMMAND_FAILED',
    };
  }

  return { success: true };
}

// =============================================================================
// App Container / Data Access
// =============================================================================

/**
 * Get the container path for an app.
 *
 * @param udid - Simulator UDID
 * @param bundleId - App bundle identifier
 * @param containerType - Type of container (default: 'data')
 * @returns Container path or error
 */
export async function getAppContainer(
  udid: string,
  bundleId: string,
  containerType: ContainerType = 'data'
): Promise<IOSResult<AppContainer>> {
  logger.info(`${LOG_CONTEXT} Getting ${containerType} container for: ${bundleId}`, LOG_CONTEXT);
  const result = await runSimctl(['get_app_container', udid, bundleId, containerType]);

  if (result.exitCode !== 0) {
    if (result.stderr?.includes('Unable to find')) {
      return {
        success: false,
        error: `App not installed: ${bundleId}`,
        errorCode: 'APP_NOT_INSTALLED',
      };
    }

    return {
      success: false,
      error: `Failed to get container: ${result.stderr || 'Unknown error'}`,
      errorCode: 'COMMAND_FAILED',
    };
  }

  const path = result.stdout.trim();

  return {
    success: true,
    data: {
      type: containerType,
      path,
      bundleId,
    },
  };
}

// =============================================================================
// Deep Links / URL Opening
// =============================================================================

/**
 * Open a URL in the simulator (deep links, universal links).
 *
 * @param udid - Simulator UDID
 * @param url - URL to open
 * @returns Success or error
 */
export async function openURL(udid: string, url: string): Promise<IOSResult<void>> {
  logger.info(`${LOG_CONTEXT} Opening URL: ${url} on ${udid}`, LOG_CONTEXT);
  const result = await runSimctl(['openurl', udid, url]);

  if (result.exitCode !== 0) {
    return {
      success: false,
      error: `Failed to open URL: ${result.stderr || 'Unknown error'}`,
      errorCode: 'COMMAND_FAILED',
    };
  }

  return { success: true };
}
