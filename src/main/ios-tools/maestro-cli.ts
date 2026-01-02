/**
 * iOS Tools - Maestro CLI Integration
 *
 * Functions for detecting and interacting with the Maestro mobile testing CLI.
 * Maestro is an open-source UI automation framework for mobile apps.
 * https://maestro.mobile.dev/
 */

import { execFileNoThrow, ExecResult } from '../utils/execFile';
import { logger } from '../utils/logger';
import { IOSResult } from './types';

const LOG_CONTEXT = '[iOS-MaestroCLI]';

// =============================================================================
// Types
// =============================================================================

/**
 * Maestro CLI installation information
 */
export interface MaestroInfo {
  /** Path to maestro binary */
  path: string;
  /** Maestro version (e.g., "1.36.0") */
  version: string;
  /** Whether CLI is properly installed and working */
  isWorking: boolean;
}

/**
 * Result of Maestro CLI detection
 */
export interface MaestroDetectResult {
  /** Whether Maestro CLI is available */
  available: boolean;
  /** Path to maestro binary if found */
  path?: string;
  /** Maestro version if available */
  version?: string;
  /** Installation instructions if not available */
  installInstructions?: string;
}

// =============================================================================
// Maestro CLI Detection
// =============================================================================

/**
 * Common locations where Maestro CLI might be installed
 */
const MAESTRO_SEARCH_PATHS = [
  // Default installation via curl | bash
  `${process.env.HOME}/.maestro/bin/maestro`,
  // Homebrew installation
  '/opt/homebrew/bin/maestro',
  '/usr/local/bin/maestro',
  // Manual installations
  '/usr/bin/maestro',
];

/**
 * Run the maestro CLI command.
 *
 * @param args - Arguments to pass to maestro
 * @param cwd - Optional working directory
 * @returns ExecResult with stdout, stderr, and exitCode
 */
export async function runMaestro(args: string[], cwd?: string): Promise<ExecResult> {
  // First try to find the maestro binary
  const maestroPath = await findMaestroBinary();

  if (!maestroPath) {
    return {
      stdout: '',
      stderr: 'Maestro CLI not found. Install from https://maestro.mobile.dev/',
      exitCode: 'ENOENT',
    };
  }

  logger.debug(`${LOG_CONTEXT} Running: maestro ${args.join(' ')}`, LOG_CONTEXT);

  const result = await execFileNoThrow(maestroPath, args, cwd);

  if (result.exitCode !== 0) {
    logger.warn(
      `${LOG_CONTEXT} maestro command failed: maestro ${args.join(' ')} (exit: ${result.exitCode})`,
      LOG_CONTEXT
    );
    if (result.stderr) {
      logger.debug(`${LOG_CONTEXT} stderr: ${result.stderr}`, LOG_CONTEXT);
    }
  }

  return result;
}

/**
 * Find the maestro binary location.
 *
 * @returns Path to maestro binary or null if not found
 */
async function findMaestroBinary(): Promise<string | null> {
  // First try 'which' to find maestro in PATH
  const whichResult = await execFileNoThrow('which', ['maestro']);
  if (whichResult.exitCode === 0 && whichResult.stdout.trim()) {
    const path = whichResult.stdout.trim();
    logger.debug(`${LOG_CONTEXT} Found maestro via which: ${path}`, LOG_CONTEXT);
    return path;
  }

  // Try known installation paths
  for (const searchPath of MAESTRO_SEARCH_PATHS) {
    const checkResult = await execFileNoThrow('test', ['-x', searchPath]);
    if (checkResult.exitCode === 0) {
      logger.debug(`${LOG_CONTEXT} Found maestro at: ${searchPath}`, LOG_CONTEXT);
      return searchPath;
    }
  }

  logger.debug(`${LOG_CONTEXT} Maestro binary not found`, LOG_CONTEXT);
  return null;
}

/**
 * Detect Maestro CLI installation.
 *
 * @returns Full detection result with path, version, and instructions
 */
export async function detectMaestroCli(): Promise<IOSResult<MaestroDetectResult>> {
  const maestroPath = await findMaestroBinary();

  if (!maestroPath) {
    return {
      success: true,
      data: {
        available: false,
        installInstructions: getMaestroInstallInstructions(),
      },
    };
  }

  // Get version info
  const versionResult = await execFileNoThrow(maestroPath, ['--version']);

  let version: string | undefined;
  if (versionResult.exitCode === 0) {
    // Parse version from output like "maestro version: 1.36.0"
    const versionMatch = versionResult.stdout.match(/(\d+\.\d+\.\d+)/);
    if (versionMatch) {
      version = versionMatch[1];
    }
  }

  logger.info(`${LOG_CONTEXT} Maestro CLI detected: ${maestroPath} (v${version || 'unknown'})`, LOG_CONTEXT);

  return {
    success: true,
    data: {
      available: true,
      path: maestroPath,
      version,
    },
  };
}

/**
 * Quick check if Maestro CLI is available.
 *
 * @returns true if maestro CLI is installed and executable
 */
export async function isMaestroAvailable(): Promise<boolean> {
  const maestroPath = await findMaestroBinary();
  return maestroPath !== null;
}

/**
 * Get full Maestro CLI information.
 *
 * @returns MaestroInfo with path, version, and working status
 */
export async function getMaestroInfo(): Promise<IOSResult<MaestroInfo>> {
  const detectResult = await detectMaestroCli();

  if (!detectResult.success) {
    return {
      success: false,
      error: detectResult.error,
      errorCode: detectResult.errorCode,
    };
  }

  const detection = detectResult.data!;

  if (!detection.available) {
    return {
      success: false,
      error: 'Maestro CLI is not installed',
      errorCode: 'COMMAND_FAILED',
    };
  }

  // Verify it's working by running a simple command
  const helpResult = await execFileNoThrow(detection.path!, ['--help']);
  const isWorking = helpResult.exitCode === 0;

  return {
    success: true,
    data: {
      path: detection.path!,
      version: detection.version || 'unknown',
      isWorking,
    },
  };
}

/**
 * Validate Maestro CLI meets minimum version requirements.
 *
 * @param minVersion - Minimum required version (e.g., "1.30.0")
 * @returns Success if version is adequate, error otherwise
 */
export async function validateMaestroVersion(minVersion: string): Promise<IOSResult<void>> {
  const detectResult = await detectMaestroCli();

  if (!detectResult.success) {
    return {
      success: false,
      error: detectResult.error,
      errorCode: detectResult.errorCode,
    };
  }

  const detection = detectResult.data!;

  if (!detection.available) {
    return {
      success: false,
      error: `Maestro CLI is not installed. ${detection.installInstructions}`,
      errorCode: 'COMMAND_FAILED',
    };
  }

  if (!detection.version) {
    // Can't determine version, assume it's fine
    logger.warn(`${LOG_CONTEXT} Could not determine Maestro version, proceeding anyway`, LOG_CONTEXT);
    return { success: true };
  }

  // Compare versions
  const installedParts = detection.version.split('.').map(Number);
  const requiredParts = minVersion.split('.').map(Number);

  for (let i = 0; i < Math.max(installedParts.length, requiredParts.length); i++) {
    const installed = installedParts[i] || 0;
    const required = requiredParts[i] || 0;

    if (installed > required) {
      return { success: true };
    }
    if (installed < required) {
      return {
        success: false,
        error: `Maestro CLI version ${detection.version} is below minimum required ${minVersion}. Please update Maestro.`,
        errorCode: 'COMMAND_FAILED',
      };
    }
  }

  return { success: true };
}

// =============================================================================
// Installation Instructions
// =============================================================================

/**
 * Get installation instructions for Maestro CLI.
 *
 * @returns Human-readable installation instructions
 */
function getMaestroInstallInstructions(): string {
  return `Install Maestro CLI:

  macOS/Linux:
    curl -Ls "https://get.maestro.mobile.dev" | bash

  Or with Homebrew:
    brew tap mobile-dev-inc/tap
    brew install maestro

  After installation, restart your terminal or run:
    source ~/.zshrc

  More info: https://maestro.mobile.dev/getting-started/installing-maestro`;
}

/**
 * Get installation instructions as structured data.
 *
 * @returns Installation instructions object
 */
export function getInstallInstructions(): {
  message: string;
  methods: {
    name: string;
    command: string;
  }[];
  documentation: string;
} {
  return {
    message: 'Maestro CLI is not installed',
    methods: [
      {
        name: 'curl (recommended)',
        command: 'curl -Ls "https://get.maestro.mobile.dev" | bash',
      },
      {
        name: 'Homebrew',
        command: 'brew tap mobile-dev-inc/tap && brew install maestro',
      },
    ],
    documentation: 'https://maestro.mobile.dev/getting-started/installing-maestro',
  };
}
