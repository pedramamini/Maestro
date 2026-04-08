/**
 * YAML loader façade for Maestro Cue configuration files.
 *
 * Public entrypoints stay here for compatibility while parsing/validation/watching
 * are implemented in responsibility-focused config modules.
 */

import type { CueConfig } from './cue-types';
import { readCueConfigFile, watchCueConfigFile } from './config/cue-config-repository';
import { materializeCueConfig, parseCueConfigDocument } from './config/cue-config-normalizer';
import { validateCueConfigDocument } from './config/cue-config-validator';

export { resolveCueConfigPath } from './config/cue-config-repository';

/**
 * Loads and parses a cue config file from the given project root.
 * Checks .maestro/cue.yaml first, then falls back to maestro-cue.yaml.
 * Returns null if neither file exists. Throws on malformed YAML.
 */
export function loadCueConfig(projectRoot: string): CueConfig | null {
	const file = readCueConfigFile(projectRoot);
	if (!file) {
		return null;
	}

	const document = parseCueConfigDocument(file.raw, projectRoot);
	if (!document) {
		return null;
	}

	return materializeCueConfig(document);
}

/**
 * Watches a maestro-cue.yaml file for changes. Returns a cleanup function.
 * Calls onChange when the file is created, modified, or deleted.
 * Debounces by 1 second.
 */
export function watchCueYaml(projectRoot: string, onChange: () => void): () => void {
	return watchCueConfigFile(projectRoot, onChange);
}

/**
 * Validates a CueConfig-shaped object. Returns validation result with error messages.
 */
export function validateCueConfig(config: unknown): { valid: boolean; errors: string[] } {
	return validateCueConfigDocument(config);
}
