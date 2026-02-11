/**
 * Preload API for VIBES integration
 *
 * Provides the window.maestro.vibes namespace for:
 * - Checking VIBES initialization status
 * - Initializing VIBES audit directories
 * - Getting stats, blame, log, coverage, and report data
 * - Listing sessions and models
 * - Building audit manifests
 * - Finding the vibescheck binary
 */

import { ipcRenderer } from 'electron';

import type { VibesAssuranceLevel } from '../../shared/vibes-types';

/**
 * Standard result type for VIBES CLI commands.
 */
export interface VibesCommandResult {
	success: boolean;
	data?: string;
	error?: string;
}

/**
 * Result from the vibes:findBinary IPC call.
 */
export interface VibesBinaryInfo {
	path: string | null;
	version: string | null;
}

/**
 * Configuration for vibescheck init.
 */
export interface VibesInitConfig {
	projectName: string;
	assuranceLevel: VibesAssuranceLevel;
	extensions?: string[];
}

/**
 * Options for vibescheck log filtering.
 */
export interface VibesLogOptions {
	file?: string;
	model?: string;
	session?: string;
	limit?: number;
	json?: boolean;
}

/**
 * Payload for the `vibes:annotation-update` event emitted by the main process
 * whenever annotations are written. Used by the renderer for live counts.
 */
export interface VibesAnnotationUpdatePayload {
	sessionId: string;
	annotationCount: number;
	lastAnnotation: {
		type: string;
		filePath?: string;
		action?: string;
		timestamp: string;
	};
}

/**
 * Creates the VIBES API object for preload exposure.
 */
export function createVibesApi() {
	return {
		isInitialized: (projectPath: string): Promise<boolean> =>
			ipcRenderer.invoke('vibes:isInitialized', projectPath),

		init: (
			projectPath: string,
			config: VibesInitConfig,
		): Promise<{ success: boolean; error?: string }> =>
			ipcRenderer.invoke('vibes:init', projectPath, config),

		getStats: (projectPath: string, file?: string): Promise<VibesCommandResult> =>
			ipcRenderer.invoke('vibes:getStats', projectPath, file),

		getBlame: (projectPath: string, file: string): Promise<VibesCommandResult> =>
			ipcRenderer.invoke('vibes:getBlame', projectPath, file),

		getLog: (projectPath: string, options?: VibesLogOptions): Promise<VibesCommandResult> =>
			ipcRenderer.invoke('vibes:getLog', projectPath, options),

		getCoverage: (projectPath: string): Promise<VibesCommandResult> =>
			ipcRenderer.invoke('vibes:getCoverage', projectPath),

		getReport: (
			projectPath: string,
			format?: 'markdown' | 'html' | 'json',
		): Promise<VibesCommandResult> =>
			ipcRenderer.invoke('vibes:getReport', projectPath, format),

		getSessions: (projectPath: string): Promise<VibesCommandResult> =>
			ipcRenderer.invoke('vibes:getSessions', projectPath),

		getModels: (projectPath: string): Promise<VibesCommandResult> =>
			ipcRenderer.invoke('vibes:getModels', projectPath),

		build: (projectPath: string): Promise<{ success: boolean; error?: string }> =>
			ipcRenderer.invoke('vibes:build', projectPath),

		findBinary: (customPath?: string): Promise<VibesBinaryInfo> =>
			ipcRenderer.invoke('vibes:findBinary', customPath),

		clearBinaryCache: (): Promise<void> =>
			ipcRenderer.invoke('vibes:clearBinaryCache'),

		/**
		 * Subscribe to live annotation update events from the main process.
		 * Emitted whenever the VibesCoordinator records an annotation.
		 * Returns a cleanup function to unsubscribe.
		 */
		onAnnotationUpdate: (
			callback: (payload: VibesAnnotationUpdatePayload) => void,
		): (() => void) => {
			const handler = (_: unknown, payload: VibesAnnotationUpdatePayload) =>
				callback(payload);
			ipcRenderer.on('vibes:annotation-update', handler);
			return () => ipcRenderer.removeListener('vibes:annotation-update', handler);
		},
	};
}

export type VibesApi = ReturnType<typeof createVibesApi>;
