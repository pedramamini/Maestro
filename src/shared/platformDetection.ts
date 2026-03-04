/**
 * Centralized platform detection utilities.
 *
 * All functions read process.platform at call time so that tests can
 * override it via Object.defineProperty(process, 'platform', { value: '...', configurable: true })
 * without module-level caching defeating the mock.
 *
 * Do NOT convert these to module-level constants.
 */

/** Returns true when running on Windows (win32). */
export function isWindows(): boolean {
	return process.platform === 'win32';
}

/** Returns true when running on macOS (darwin). */
export function isMacOS(): boolean {
	return process.platform === 'darwin';
}

/** Returns true when running on Linux. */
export function isLinux(): boolean {
	return process.platform === 'linux';
}

/**
 * Returns the platform-appropriate command for locating binaries.
 * 'where' on Windows, 'which' on Unix-like systems.
 */
export function getWhichCommand(): string {
	return isWindows() ? 'where' : 'which';
}
