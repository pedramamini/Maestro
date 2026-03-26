/**
 * In-memory ring buffer of completed Cue run results.
 *
 * Keeps the most recent N results for the activity log view
 * in the Cue Modal dashboard.
 */

import type { CueRunResult } from './cue-types';

const ACTIVITY_LOG_MAX = 500;

export interface CueActivityLog {
	push(result: CueRunResult): void;
	getAll(limit?: number): CueRunResult[];
	clear(): void;
}

export function createCueActivityLog(maxSize: number = ACTIVITY_LOG_MAX): CueActivityLog {
	let log: CueRunResult[] = [];

	return {
		push(result: CueRunResult): void {
			log.push(result);
			if (log.length > maxSize) {
				log = log.slice(-maxSize);
			}
		},

		getAll(limit?: number): CueRunResult[] {
			if (limit !== undefined) {
				return log.slice(-limit);
			}
			return [...log];
		},

		clear(): void {
			log = [];
		},
	};
}
