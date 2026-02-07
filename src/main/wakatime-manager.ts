/**
 * WakaTime heartbeat manager.
 * Detects wakatime-cli on the user's PATH and sends heartbeats
 * when AI agent activity (query-complete events) occurs.
 *
 * Heartbeats are debounced per session (max 1 per 2 minutes) to match
 * WakaTime's own deduplication window.
 */

import { execFileNoThrow } from './utils/execFile';
import { logger } from './utils/logger';
import type Store from 'electron-store';
import type { MaestroSettings } from './stores/types';

const LOG_CONTEXT = '[WakaTime]';
const HEARTBEAT_DEBOUNCE_MS = 120_000; // 2 minutes - WakaTime deduplicates within this window

export class WakaTimeManager {
	private settingsStore: Store<MaestroSettings>;
	private lastHeartbeatPerSession: Map<string, number> = new Map();
	private cliPath: string | null = null;
	private cliDetected = false;

	constructor(settingsStore: Store<MaestroSettings>) {
		this.settingsStore = settingsStore;
	}

	/** Detect wakatime-cli on PATH */
	async detectCli(): Promise<boolean> {
		if (this.cliDetected) return this.cliPath !== null;
		this.cliDetected = true;

		// Try common binary names
		for (const cmd of ['wakatime-cli', 'wakatime']) {
			const result = await execFileNoThrow(cmd, ['--version']);
			if (result.exitCode === 0) {
				this.cliPath = cmd;
				logger.info(`Found WakaTime CLI: ${cmd} (${result.stdout.trim()})`, LOG_CONTEXT);
				return true;
			}
		}
		logger.debug('WakaTime CLI not found on PATH', LOG_CONTEXT);
		return false;
	}

	/** Send a heartbeat for a session's activity */
	async sendHeartbeat(sessionId: string, projectPath: string, projectName: string): Promise<void> {
		// Check if enabled
		const enabled = this.settingsStore.get('wakatimeEnabled', false);
		if (!enabled) return;

		const apiKey = this.settingsStore.get('wakatimeApiKey', '') as string;
		if (!apiKey) return;

		// Debounce per session
		const now = Date.now();
		const lastBeat = this.lastHeartbeatPerSession.get(sessionId) || 0;
		if (now - lastBeat < HEARTBEAT_DEBOUNCE_MS) return;

		// Ensure CLI is available
		if (!await this.detectCli()) {
			logger.warn('WakaTime CLI not installed — skipping heartbeat', LOG_CONTEXT);
			return;
		}

		this.lastHeartbeatPerSession.set(sessionId, now);

		const args = [
			'--key', apiKey,
			'--entity', projectPath,
			'--entity-type', 'app',
			'--project', projectName,
			'--plugin', 'maestro-wakatime',
			'--category', 'coding',
		];

		const result = await execFileNoThrow(this.cliPath!, args);
		if (result.exitCode === 0) {
			logger.debug(`Heartbeat sent for session ${sessionId} (${projectName})`, LOG_CONTEXT);
		} else {
			logger.warn(`Heartbeat failed for ${sessionId}: ${result.stderr}`, LOG_CONTEXT);
		}
	}

	/** Clean up stale session entries */
	removeSession(sessionId: string): void {
		this.lastHeartbeatPerSession.delete(sessionId);
	}
}
