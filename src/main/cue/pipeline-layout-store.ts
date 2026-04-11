/**
 * Persistent storage for the Cue pipeline editor layout (node positions,
 * viewport, selected pipeline). Stored as a single JSON file under the user
 * data directory so layout survives across app launches.
 *
 * The IPC handler delegates to this module so that the file location and the
 * read/write semantics live in exactly one place — see Phase 6 cleanup.
 */

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import type { PipelineLayoutState } from '../../shared/cue-pipeline-types';
import { captureException } from '../utils/sentry';

let cachedLayoutFilePath: string | null = null;

function getLayoutFilePath(): string {
	if (!cachedLayoutFilePath) {
		cachedLayoutFilePath = path.join(app.getPath('userData'), 'cue-pipeline-layout.json');
	}
	return cachedLayoutFilePath;
}

export function savePipelineLayout(layout: PipelineLayoutState): void {
	const filePath = getLayoutFilePath();
	fs.writeFileSync(filePath, JSON.stringify(layout, null, 2), 'utf-8');
}

export function loadPipelineLayout(): PipelineLayoutState | null {
	const filePath = getLayoutFilePath();
	if (!fs.existsSync(filePath)) {
		return null;
	}
	try {
		const content = fs.readFileSync(filePath, 'utf-8');
		return JSON.parse(content) as PipelineLayoutState;
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		captureException(err, { extra: { filePath, operation: 'cue.loadPipelineLayout' } });
		return null;
	}
}
