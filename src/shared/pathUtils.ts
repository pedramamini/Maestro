/**
 * Shared path and version utility functions
 *
 * This module provides utilities used across multiple parts of the application.
 *
 * Consolidates duplicated logic from:
 * - agent-detector.ts (expandTilde)
 * - ssh-command-builder.ts (expandPath)
 * - ssh-config-parser.ts (expandPath)
 * - ssh-remote-manager.ts (expandPath)
 * - process-manager.ts (inline tilde expansion)
 * - update-checker.ts (version comparison)
 */

import * as os from 'os';
import * as path from 'path';

/**
 * Expand tilde (~) to home directory in paths.
 *
 * Node.js fs functions don't understand shell tilde expansion,
 * so this function provides consistent tilde handling across the codebase.
 *
 * @param filePath - Path that may start with ~ or ~/
 * @param homeDir - Optional custom home directory (for testing/dependency injection)
 * @returns Expanded absolute path with ~ replaced by home directory
 *
 * @example
 * ```typescript
 * expandTilde('~/.ssh/id_rsa')   // '/Users/username/.ssh/id_rsa'
 * expandTilde('~')               // '/Users/username'
 * expandTilde('/absolute/path') // '/absolute/path' (unchanged)
 * expandTilde('~/config', '/custom/home') // '/custom/home/config'
 * ```
 */
export function expandTilde(filePath: string, homeDir?: string): string {
  if (!filePath) {
    return filePath;
  }

  const home = homeDir ?? os.homedir();

  if (filePath === '~') {
    return home;
  }

  if (filePath.startsWith('~/')) {
    return path.join(home, filePath.slice(2));
  }

  return filePath;
}

/**
 * Parse version string to comparable array of numbers.
 *
 * @param version - Version string (e.g., "v22.10.0" or "0.14.0")
 * @returns Array of version numbers (e.g., [22, 10, 0])
 *
 * @example
 * ```typescript
 * parseVersion('v22.10.0')  // [22, 10, 0]
 * parseVersion('0.14.0')    // [0, 14, 0]
 * ```
 */
export function parseVersion(version: string): number[] {
  const cleaned = version.replace(/^v/, '');
  return cleaned.split('.').map(n => parseInt(n, 10) || 0);
}

/**
 * Compare two version strings.
 *
 * Returns: 1 if a > b, -1 if a < b, 0 if equal.
 * Handles versions with or without 'v' prefix.
 *
 * @param a - First version string
 * @param b - Second version string
 * @returns 1 if a > b, -1 if a < b, 0 if equal
 *
 * @example
 * ```typescript
 * compareVersions('v22.0.0', 'v20.0.0')  // 1 (a > b)
 * compareVersions('v18.0.0', 'v20.0.0')  // -1 (a < b)
 * compareVersions('v20.0.0', 'v20.0.0')  // 0 (equal)
 *
 * // For descending sort (highest first):
 * versions.sort((a, b) => compareVersions(b, a))
 *
 * // For ascending sort (lowest first):
 * versions.sort(compareVersions)
 * ```
 */
export function compareVersions(a: string, b: string): number {
  const partsA = parseVersion(a);
  const partsB = parseVersion(b);

  const maxLength = Math.max(partsA.length, partsB.length);

  for (let i = 0; i < maxLength; i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;

    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }

  return 0;
}
