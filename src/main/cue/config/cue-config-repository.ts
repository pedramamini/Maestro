import * as fs from 'fs';
import * as path from 'path';
import * as chokidar from 'chokidar';
import { CUE_CONFIG_PATH, LEGACY_CUE_CONFIG_PATH } from '../../../shared/maestro-paths';

/**
 * Resolve the cue config file path, preferring .maestro/cue.yaml
 * with fallback to legacy maestro-cue.yaml.
 */
export function resolveCueConfigPath(projectRoot: string): string | null {
	const canonical = path.join(projectRoot, CUE_CONFIG_PATH);
	if (fs.existsSync(canonical)) return canonical;
	const legacy = path.join(projectRoot, LEGACY_CUE_CONFIG_PATH);
	if (fs.existsSync(legacy)) return legacy;
	return null;
}

export function readCueConfigFile(projectRoot: string): { filePath: string; raw: string } | null {
	const filePath = resolveCueConfigPath(projectRoot);
	if (!filePath) {
		return null;
	}

	return {
		filePath,
		raw: fs.readFileSync(filePath, 'utf-8'),
	};
}

/**
 * Watches both canonical and legacy Cue config paths.
 * Debounces onChange by 1 second.
 */
export function watchCueConfigFile(projectRoot: string, onChange: () => void): () => void {
	const canonicalPath = path.join(projectRoot, CUE_CONFIG_PATH);
	const legacyPath = path.join(projectRoot, LEGACY_CUE_CONFIG_PATH);
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;

	const watcher = chokidar.watch([canonicalPath, legacyPath], {
		persistent: true,
		ignoreInitial: true,
	});

	const debouncedOnChange = () => {
		if (debounceTimer) {
			clearTimeout(debounceTimer);
		}
		debounceTimer = setTimeout(() => {
			debounceTimer = null;
			onChange();
		}, 1000);
	};

	watcher.on('add', debouncedOnChange);
	watcher.on('change', debouncedOnChange);
	watcher.on('unlink', debouncedOnChange);

	return () => {
		if (debounceTimer) {
			clearTimeout(debounceTimer);
		}
		watcher.close();
	};
}
