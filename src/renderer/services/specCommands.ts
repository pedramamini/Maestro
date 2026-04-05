/**
 * Shared Spec Commands Service
 *
 * Factory for creating renderer services that access spec command systems
 * (SpecKit, OpenSpec, BMAD) via IPC. Each system shares identical logic
 * differing only in IPC namespace and log prefix.
 */

import type { SpecCommand, SpecCommandMetadata } from '../../main/spec-command-manager';

/** Minimal IPC shape required by the service (subset of the full preload namespace). */
export interface SpecCommandServiceIPC {
	getMetadata: () => Promise<{
		success: boolean;
		metadata?: SpecCommandMetadata;
		error?: string;
	}>;
	getPrompts: () => Promise<{
		success: boolean;
		commands?: SpecCommand[];
		error?: string;
	}>;
	getCommand: (slashCommand: string) => Promise<{
		success: boolean;
		command?: SpecCommand | null;
		error?: string;
	}>;
}

export interface SpecCommandServiceConfig {
	logPrefix: string;
	getIPC: () => SpecCommandServiceIPC | undefined;
}

export interface SpecCommandService {
	getCommands: () => Promise<SpecCommand[]>;
	getMetadata: () => Promise<SpecCommandMetadata | null>;
	getCommand: (slashCommand: string) => Promise<SpecCommand | null>;
}

/**
 * Creates a spec command service bound to a specific IPC namespace.
 * The `getIPC` callback is evaluated lazily so the service can be
 * created at module scope before `window.maestro` is available.
 */
export function createSpecCommandService(config: SpecCommandServiceConfig): SpecCommandService {
	const { logPrefix, getIPC } = config;

	return {
		async getCommands(): Promise<SpecCommand[]> {
			try {
				const api = getIPC();
				if (!api) {
					return [];
				}
				const result = await api.getPrompts();
				if (result.success && result.commands) {
					return result.commands;
				}
				return [];
			} catch (error) {
				console.error(`${logPrefix} Failed to get commands:`, error);
				return [];
			}
		},

		async getMetadata(): Promise<SpecCommandMetadata | null> {
			try {
				const api = getIPC();
				if (!api) {
					return null;
				}
				const result = await api.getMetadata();
				if (result.success && result.metadata) {
					return result.metadata;
				}
				return null;
			} catch (error) {
				console.error(`${logPrefix} Failed to get metadata:`, error);
				return null;
			}
		},

		async getCommand(slashCommand: string): Promise<SpecCommand | null> {
			try {
				const api = getIPC();
				if (!api) {
					return null;
				}
				const result = await api.getCommand(slashCommand);
				if (result.success && result.command) {
					return result.command;
				}
				return null;
			} catch (error) {
				console.error(`${logPrefix} Failed to get command:`, error);
				return null;
			}
		},
	};
}
