/**
 * @file group-chat-config.ts
 * @description Shared configuration callbacks for Group Chat feature.
 *
 * These callbacks are set once during initialization and used by both
 * group-chat-router.ts and group-chat-agent.ts to avoid duplication.
 */

// Module-level callback for getting custom shell path from settings
let getCustomShellPathCallback: (() => string | undefined) | null = null;

/**
 * Sets the callback for getting the custom shell path from settings.
 * This is used on Windows to prefer PowerShell over cmd.exe to avoid command line length limits.
 * Called from index.ts during initialization.
 */
export function setGetCustomShellPathCallback(callback: () => string | undefined): void {
	getCustomShellPathCallback = callback;
}

/**
 * Gets the custom shell path using the registered callback.
 * Returns undefined if no callback is registered or if the callback returns undefined.
 */
export function getCustomShellPath(): string | undefined {
	return getCustomShellPathCallback?.();
}
