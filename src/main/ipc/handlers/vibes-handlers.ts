/**
 * VIBES IPC Handlers
 *
 * Provides IPC handlers for VIBES integration:
 * - isInitialized: Check if VIBES is initialized in a project
 * - init: Initialize a VIBES audit directory
 * - build: Rebuild audit manifest from annotations
 * - getStats: Get project statistics
 * - getBlame: Get per-line provenance data
 * - getLog: Get annotation log with filters
 * - getCoverage: Get VIBES coverage statistics
 * - getReport: Generate a VIBES report
 * - getSessions: List all sessions
 * - getModels: List all models used
 * - findBinary: Find the vibescheck binary
 */

import { ipcMain } from 'electron';
import type Store from 'electron-store';
import { logger } from '../../utils/logger';
import {
	findVibesCheckBinary,
	isVibesInitialized,
	vibesInit,
	vibesBuild,
	vibesStats,
	vibesBlame,
	vibesLog,
	vibesCoverage,
	vibesReport,
	vibesSessions,
	vibesModels,
} from '../../vibes/vibes-bridge';
import type { VibesAssuranceLevel } from '../../../shared/vibes-types';

const LOG_CONTEXT = '[VIBES]';

/**
 * Dependencies required for VIBES handler registration.
 */
export interface VibesHandlerDependencies {
	settingsStore: Store<{ [key: string]: unknown }>;
}

/**
 * Get the custom binary path from the settings store.
 */
function getCustomBinaryPath(settingsStore: Store<{ [key: string]: unknown }>): string | undefined {
	const path = settingsStore.get('vibesCheckBinaryPath', '') as string;
	return path || undefined;
}

/**
 * Register all VIBES IPC handlers.
 */
export function registerVibesHandlers(deps: VibesHandlerDependencies): void {
	const { settingsStore } = deps;

	// Check if VIBES is initialized in a project
	ipcMain.handle('vibes:isInitialized', async (_event, projectPath: string) => {
		try {
			return await isVibesInitialized(projectPath);
		} catch (error) {
			logger.error('isInitialized error', LOG_CONTEXT, { error: String(error) });
			return false;
		}
	});

	// Initialize a VIBES audit directory
	ipcMain.handle(
		'vibes:init',
		async (
			_event,
			projectPath: string,
			config: {
				projectName: string;
				assuranceLevel: VibesAssuranceLevel;
				extensions?: string[];
			},
		) => {
			try {
				const customPath = getCustomBinaryPath(settingsStore);
				return await vibesInit(projectPath, config, customPath);
			} catch (error) {
				logger.error('init error', LOG_CONTEXT, { error: String(error) });
				return { success: false, error: String(error) };
			}
		},
	);

	// Get project statistics
	ipcMain.handle('vibes:getStats', async (_event, projectPath: string, file?: string) => {
		try {
			const customPath = getCustomBinaryPath(settingsStore);
			return await vibesStats(projectPath, file, customPath);
		} catch (error) {
			logger.error('getStats error', LOG_CONTEXT, { error: String(error) });
			return { success: false, error: String(error) };
		}
	});

	// Get per-line provenance data
	ipcMain.handle('vibes:getBlame', async (_event, projectPath: string, file: string) => {
		try {
			const customPath = getCustomBinaryPath(settingsStore);
			return await vibesBlame(projectPath, file, customPath);
		} catch (error) {
			logger.error('getBlame error', LOG_CONTEXT, { error: String(error) });
			return { success: false, error: String(error) };
		}
	});

	// Get annotation log with filters
	ipcMain.handle(
		'vibes:getLog',
		async (
			_event,
			projectPath: string,
			options?: {
				file?: string;
				model?: string;
				session?: string;
				limit?: number;
				json?: boolean;
			},
		) => {
			try {
				const customPath = getCustomBinaryPath(settingsStore);
				return await vibesLog(projectPath, options, customPath);
			} catch (error) {
				logger.error('getLog error', LOG_CONTEXT, { error: String(error) });
				return { success: false, error: String(error) };
			}
		},
	);

	// Get VIBES coverage statistics
	ipcMain.handle('vibes:getCoverage', async (_event, projectPath: string) => {
		try {
			const customPath = getCustomBinaryPath(settingsStore);
			return await vibesCoverage(projectPath, true, customPath);
		} catch (error) {
			logger.error('getCoverage error', LOG_CONTEXT, { error: String(error) });
			return { success: false, error: String(error) };
		}
	});

	// Generate a VIBES report
	ipcMain.handle(
		'vibes:getReport',
		async (_event, projectPath: string, format?: 'markdown' | 'html' | 'json') => {
			try {
				const customPath = getCustomBinaryPath(settingsStore);
				return await vibesReport(projectPath, format, customPath);
			} catch (error) {
				logger.error('getReport error', LOG_CONTEXT, { error: String(error) });
				return { success: false, error: String(error) };
			}
		},
	);

	// List all sessions
	ipcMain.handle('vibes:getSessions', async (_event, projectPath: string) => {
		try {
			const customPath = getCustomBinaryPath(settingsStore);
			return await vibesSessions(projectPath, customPath);
		} catch (error) {
			logger.error('getSessions error', LOG_CONTEXT, { error: String(error) });
			return { success: false, error: String(error) };
		}
	});

	// List all models used
	ipcMain.handle('vibes:getModels', async (_event, projectPath: string) => {
		try {
			const customPath = getCustomBinaryPath(settingsStore);
			return await vibesModels(projectPath, customPath);
		} catch (error) {
			logger.error('getModels error', LOG_CONTEXT, { error: String(error) });
			return { success: false, error: String(error) };
		}
	});

	// Rebuild audit manifest from annotations
	ipcMain.handle('vibes:build', async (_event, projectPath: string) => {
		try {
			const customPath = getCustomBinaryPath(settingsStore);
			return await vibesBuild(projectPath, customPath);
		} catch (error) {
			logger.error('build error', LOG_CONTEXT, { error: String(error) });
			return { success: false, error: String(error) };
		}
	});

	// Find the vibescheck binary
	ipcMain.handle('vibes:findBinary', async (_event, customPath?: string) => {
		try {
			return await findVibesCheckBinary(customPath);
		} catch (error) {
			logger.error('findBinary error', LOG_CONTEXT, { error: String(error) });
			return null;
		}
	});
}
