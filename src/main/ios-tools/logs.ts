/**
 * iOS Tools - Log Collection
 *
 * Functions for collecting system logs and crash reports from simulators.
 */

import fs from 'fs/promises';
import path from 'path';
import { execFileNoThrow } from '../utils/execFile';
import {
  LogEntry,
  SystemLogOptions,
  CrashReport,
  CrashLogOptions,
  IOSResult,
} from './types';
import { runSimctl } from './utils';
import { getSimulator } from './simulator';
import { logger } from '../utils/logger';

const LOG_CONTEXT = '[iOS-Logs]';

// =============================================================================
// System Log Collection
// =============================================================================

/**
 * Get system logs from a simulator.
 * Uses the unified logging system via simctl spawn.
 *
 * @param options - Log options
 * @returns Array of log entries or error
 */
export async function getSystemLog(options: SystemLogOptions): Promise<IOSResult<LogEntry[]>> {
  const {
    udid,
    since,
    until,
    level,
    process: processFilter,
    predicate,
    limit = 1000,
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
      error: 'Simulator must be booted to get logs',
      errorCode: 'SIMULATOR_NOT_BOOTED',
    };
  }

  // Build log command using simctl spawn
  // We use 'log show' to get recent logs
  const logArgs: string[] = ['spawn', udid, 'log', 'show', '--style', 'json'];

  // Add time filters
  if (since) {
    const sinceDate = since instanceof Date ? since : new Date(since);
    logArgs.push('--start', sinceDate.toISOString());
  } else {
    // Default to last 60 seconds if no since provided
    const defaultSince = new Date(Date.now() - 60 * 1000);
    logArgs.push('--start', defaultSince.toISOString());
  }

  if (until) {
    const untilDate = until instanceof Date ? until : new Date(until);
    logArgs.push('--end', untilDate.toISOString());
  }

  // Add level filter
  if (level) {
    logArgs.push('--level', level);
  }

  // Add predicate filter
  if (predicate) {
    logArgs.push('--predicate', predicate);
  } else if (processFilter) {
    // Build simple predicate for process filter
    logArgs.push('--predicate', `processImagePath CONTAINS "${processFilter}"`);
  }

  logger.info(`${LOG_CONTEXT} Getting system logs from ${udid}`, LOG_CONTEXT);
  const result = await runSimctl(logArgs);

  if (result.exitCode !== 0) {
    return {
      success: false,
      error: `Failed to get logs: ${result.stderr || 'Unknown error'}`,
      errorCode: 'LOG_COLLECTION_FAILED',
    };
  }

  // Parse JSON log entries
  const entries: LogEntry[] = [];

  try {
    // Log output is line-delimited JSON
    const lines = result.stdout.split('\n').filter((line) => line.trim());

    for (const line of lines) {
      if (entries.length >= limit) break;

      try {
        const entry = JSON.parse(line);
        entries.push({
          timestamp: new Date(entry.timestamp),
          process: entry.processImagePath?.split('/').pop() || entry.process || 'unknown',
          pid: entry.processID,
          level: mapLogLevel(entry.messageType || entry.level),
          message: entry.eventMessage || entry.message || '',
          subsystem: entry.subsystem,
          category: entry.category,
        });
      } catch (e) {
        // Skip malformed JSON lines
        continue;
      }
    }
  } catch (e) {
    logger.warn(`${LOG_CONTEXT} Error parsing log output: ${e}`, LOG_CONTEXT);
  }

  logger.info(`${LOG_CONTEXT} Retrieved ${entries.length} log entries`, LOG_CONTEXT);
  return {
    success: true,
    data: entries,
  };
}

/**
 * Get simple text-based log output (easier to read).
 *
 * @param udid - Simulator UDID
 * @param since - Start time (Date or ISO string)
 * @returns Raw log text or error
 */
export async function getSystemLogText(
  udid: string,
  since?: Date | string
): Promise<IOSResult<string>> {
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
      error: 'Simulator must be booted to get logs',
      errorCode: 'SIMULATOR_NOT_BOOTED',
    };
  }

  // Build log command
  const logArgs: string[] = ['spawn', udid, 'log', 'show'];

  // Add time filter
  if (since) {
    const sinceDate = since instanceof Date ? since : new Date(since);
    logArgs.push('--start', sinceDate.toISOString());
  } else {
    // Default to last 60 seconds
    const defaultSince = new Date(Date.now() - 60 * 1000);
    logArgs.push('--start', defaultSince.toISOString());
  }

  logger.info(`${LOG_CONTEXT} Getting text logs from ${udid}`, LOG_CONTEXT);
  const result = await runSimctl(logArgs);

  if (result.exitCode !== 0) {
    return {
      success: false,
      error: `Failed to get logs: ${result.stderr || 'Unknown error'}`,
      errorCode: 'LOG_COLLECTION_FAILED',
    };
  }

  return {
    success: true,
    data: result.stdout,
  };
}

// =============================================================================
// Crash Log Collection
// =============================================================================

/**
 * Get crash logs from a simulator.
 *
 * @param options - Crash log options
 * @returns Array of crash reports or error
 */
export async function getCrashLogs(options: CrashLogOptions): Promise<IOSResult<CrashReport[]>> {
  const {
    udid,
    bundleId,
    since,
    limit = 10,
    includeContent = false,
  } = options;

  // Get the simulator's data directory
  const devicePath = path.join(
    process.env.HOME || '~',
    'Library/Developer/CoreSimulator/Devices',
    udid
  );

  // Crash logs are in the device's diagnostics
  const crashDirs = [
    path.join(devicePath, 'data/Library/Logs/DiagnosticReports'),
    path.join(devicePath, 'data/Library/Logs/CrashReporter'),
  ];

  const crashes: CrashReport[] = [];

  for (const crashDir of crashDirs) {
    try {
      const files = await fs.readdir(crashDir);

      for (const file of files) {
        if (crashes.length >= limit) break;

        // Filter by extension
        if (!file.endsWith('.crash') && !file.endsWith('.ips')) {
          continue;
        }

        const filePath = path.join(crashDir, file);
        const stat = await fs.stat(filePath);

        // Filter by time
        if (since && stat.mtime < since) {
          continue;
        }

        // Read crash content
        let content: string | undefined;
        try {
          content = await fs.readFile(filePath, 'utf-8');
        } catch (e) {
          logger.warn(`${LOG_CONTEXT} Could not read crash file: ${filePath}`, LOG_CONTEXT);
          continue;
        }

        // Parse crash info
        const crashInfo = parseCrashReport(content, file, filePath);

        // Filter by bundle ID if specified
        if (bundleId && crashInfo.bundleId !== bundleId) {
          continue;
        }

        // Include content if requested
        if (includeContent) {
          crashInfo.content = content;
        }

        crashes.push(crashInfo);
      }
    } catch (e) {
      // Directory might not exist
      logger.debug(`${LOG_CONTEXT} Crash directory not found: ${crashDir}`, LOG_CONTEXT);
    }
  }

  // Sort by timestamp (newest first)
  crashes.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  logger.info(`${LOG_CONTEXT} Found ${crashes.length} crash reports`, LOG_CONTEXT);
  return {
    success: true,
    data: crashes.slice(0, limit),
  };
}

/**
 * Get diagnostics dump from simulator.
 *
 * @param udid - Simulator UDID
 * @param outputPath - Path to save diagnostic archive
 * @returns Path to diagnostic archive or error
 */
export async function getDiagnostics(udid: string, outputPath: string): Promise<IOSResult<string>> {
  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  try {
    await fs.mkdir(outputDir, { recursive: true });
  } catch (e) {
    // Directory might already exist
  }

  logger.info(`${LOG_CONTEXT} Collecting diagnostics from ${udid}`, LOG_CONTEXT);
  const result = await runSimctl(['diagnose', '-b', '--output', outputPath, udid]);

  if (result.exitCode !== 0) {
    return {
      success: false,
      error: `Failed to collect diagnostics: ${result.stderr || 'Unknown error'}`,
      errorCode: 'LOG_COLLECTION_FAILED',
    };
  }

  return {
    success: true,
    data: outputPath,
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Map log message type to our level enum.
 */
function mapLogLevel(type: string): 'default' | 'info' | 'debug' | 'error' | 'fault' {
  switch (type?.toLowerCase()) {
    case 'error':
    case 'err':
      return 'error';
    case 'fault':
    case 'critical':
      return 'fault';
    case 'debug':
    case 'trace':
      return 'debug';
    case 'info':
      return 'info';
    default:
      return 'default';
  }
}

/**
 * Parse crash report file content.
 */
function parseCrashReport(content: string, filename: string, filePath: string): CrashReport {
  const report: CrashReport = {
    id: filename.replace(/\.(crash|ips)$/, ''),
    process: 'Unknown',
    timestamp: new Date(),
    path: filePath,
  };

  // Try to parse as JSON (newer .ips format)
  try {
    const json = JSON.parse(content);
    report.process = json.procName || json.name || 'Unknown';
    report.bundleId = json.bundleID || json.CFBundleIdentifier;
    report.timestamp = new Date(json.timestamp || json.captureTime);
    report.exceptionType = json.exception?.type;
    report.exceptionMessage = json.exception?.message;
    return report;
  } catch (e) {
    // Not JSON, try to parse legacy crash format
  }

  // Parse legacy .crash format
  const lines = content.split('\n');

  for (const line of lines) {
    // Process name
    const processMatch = line.match(/^Process:\s+(.+?)\s*\[/);
    if (processMatch) {
      report.process = processMatch[1];
    }

    // Bundle ID
    const bundleMatch = line.match(/^Identifier:\s+(.+)/);
    if (bundleMatch) {
      report.bundleId = bundleMatch[1].trim();
    }

    // Timestamp
    const dateMatch = line.match(/^Date\/Time:\s+(.+)/);
    if (dateMatch) {
      try {
        report.timestamp = new Date(dateMatch[1].trim());
      } catch (e) {
        // Keep default
      }
    }

    // Exception type
    const exceptionMatch = line.match(/^Exception Type:\s+(.+)/);
    if (exceptionMatch) {
      report.exceptionType = exceptionMatch[1].trim();
    }

    // Exception message (reason)
    const reasonMatch = line.match(/^Exception Note:\s+(.+)/);
    if (reasonMatch) {
      report.exceptionMessage = reasonMatch[1].trim();
    }
  }

  return report;
}

/**
 * Check if there are any recent crashes for an app.
 * Useful for quick verification that an app didn't crash.
 *
 * @param udid - Simulator UDID
 * @param bundleId - App bundle identifier
 * @param since - Check for crashes since this time
 * @returns True if crashes found, false otherwise
 */
export async function hasRecentCrashes(
  udid: string,
  bundleId: string,
  since: Date
): Promise<IOSResult<boolean>> {
  const result = await getCrashLogs({
    udid,
    bundleId,
    since,
    limit: 1,
    includeContent: false,
  });

  if (!result.success) {
    return {
      success: false,
      error: result.error,
      errorCode: result.errorCode,
    };
  }

  return {
    success: true,
    data: result.data!.length > 0,
  };
}
