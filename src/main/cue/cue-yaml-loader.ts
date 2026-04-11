/**
 * YAML loader façade for Maestro Cue configuration files.
 *
 * Public entrypoints stay here for compatibility while parsing/validation/watching
 * are implemented in responsibility-focused config modules.
 */

import * as yaml from 'js-yaml';
import type { CueConfig } from './cue-types';
import { readCueConfigFile, watchCueConfigFile } from './config/cue-config-repository';
import { materializeCueConfig, parseCueConfigDocument } from './config/cue-config-normalizer';
import { validateCueConfigDocument } from './config/cue-config-validator';

export { resolveCueConfigPath } from './config/cue-config-repository';

/**
 * Structured result of {@link loadCueConfigDetailed}. Distinguishes the four
 * outcomes (missing file / unparseable YAML / schema-invalid / valid) and
 * carries non-fatal warnings (e.g. unresolved prompt_file references) so the
 * caller can surface them to the user.
 */
export type LoadCueConfigDetailedResult =
	| { ok: true; config: CueConfig; warnings: string[] }
	| { ok: false; reason: 'missing' }
	| { ok: false; reason: 'parse-error'; message: string }
	| { ok: false; reason: 'invalid'; errors: string[] };

/**
 * Loads, validates, and materializes the Cue config for a project root.
 *
 * Returns a structured result so callers can distinguish "no config", a YAML
 * parse error, a schema-invalid config, and a valid config (with optional
 * non-fatal warnings such as unresolved prompt_file references).
 *
 * Prefer this over the legacy {@link loadCueConfig} when you need to surface
 * load failures to the user.
 */
export function loadCueConfigDetailed(projectRoot: string): LoadCueConfigDetailedResult {
	const file = readCueConfigFile(projectRoot);
	if (!file) {
		return { ok: false, reason: 'missing' };
	}

	let parsed: unknown;
	try {
		parsed = yaml.load(file.raw);
	} catch (err) {
		return {
			ok: false,
			reason: 'parse-error',
			message: err instanceof Error ? err.message : String(err),
		};
	}

	if (!parsed || typeof parsed !== 'object') {
		return {
			ok: false,
			reason: 'parse-error',
			message: 'Cue config root must be a YAML mapping',
		};
	}

	const validation = validateCueConfigDocument(parsed);
	if (!validation.valid) {
		return { ok: false, reason: 'invalid', errors: validation.errors };
	}

	const document = parseCueConfigDocument(file.raw, projectRoot);
	if (!document) {
		// Should be unreachable since validation passed, but guard defensively.
		return {
			ok: false,
			reason: 'parse-error',
			message: 'Cue config could not be normalized after validation',
		};
	}

	const materialized = materializeCueConfig(document);
	return { ok: true, config: materialized.config, warnings: materialized.warnings };
}

/**
 * Loads and parses a cue config file from the given project root.
 * Checks .maestro/cue.yaml first, then falls back to maestro-cue.yaml.
 * Returns null if neither file exists, or on parse / validation failure.
 *
 * Legacy entry point: prefer {@link loadCueConfigDetailed} when you need
 * to know *why* a config failed to load (parse error vs invalid vs missing)
 * or when you need to surface materialization warnings.
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

	return materializeCueConfig(document).config;
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
