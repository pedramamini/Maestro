/**
 * Utility for formatting keyboard shortcuts for display.
 *
 * Converts internal key names (Meta, Alt, Shift, etc.) to platform-appropriate
 * symbols or text. On macOS, uses symbols (⌘, ⌥, ⇧, ⌃). On Windows/Linux,
 * uses readable text (Ctrl, Alt, Shift).
 */

import i18n from '../../shared/i18n/config';
import { SHORTCUT_LABELS } from '../../shared/i18n/constantKeys';
import { isMacOSPlatform } from './platformUtils';

// Detect if running on macOS — uses window.maestro.platform (Electron preload bridge)
function isMac(): boolean {
	return isMacOSPlatform();
}

// macOS key symbol mappings
const MAC_KEY_MAP: Record<string, string> = {
	Meta: '⌘',
	Alt: '⌥',
	Shift: '⇧',
	Control: '⌃',
	Ctrl: '⌃',
	ArrowUp: '↑',
	ArrowDown: '↓',
	ArrowLeft: '←',
	ArrowRight: '→',
	Backspace: '⌫',
	Delete: '⌦',
	Enter: '↩',
	Return: '↩',
	Escape: '⎋',
	Tab: '⇥',
	Space: '␣',
};

// Windows/Linux key mappings (more readable text)
const OTHER_KEY_MAP: Record<string, string> = {
	Meta: 'Ctrl',
	Alt: 'Alt',
	Shift: 'Shift',
	Control: 'Ctrl',
	Ctrl: 'Ctrl',
	ArrowUp: '↑',
	ArrowDown: '↓',
	ArrowLeft: '←',
	ArrowRight: '→',
	Backspace: 'Backspace',
	Delete: 'Delete',
	Enter: 'Enter',
	Return: 'Enter',
	Escape: 'Esc',
	Tab: 'Tab',
	Space: 'Space',
};

/**
 * Format a single key for display based on platform.
 */
export function formatKey(key: string): string {
	const keyMap = isMac() ? MAC_KEY_MAP : OTHER_KEY_MAP;

	// Check if there's a mapping for this key
	if (keyMap[key]) {
		return keyMap[key];
	}

	// For single character keys, uppercase them
	if (key.length === 1) {
		return key.toUpperCase();
	}

	// For other keys (like F1, F2, etc.), return as-is
	return key;
}

/**
 * Format an array of keys for display.
 *
 * @param keys - Array of key names (e.g., ['Meta', 'Shift', 'k'])
 * @param separator - Separator between keys (default: ' ' for macOS, '+' for others)
 * @returns Formatted string for display
 *
 * @example
 * // On macOS:
 * formatShortcutKeys(['Meta', 'Shift', 'k']) // '⌘ ⇧ K'
 * formatShortcutKeys(['Alt', 'Meta', 'ArrowRight']) // '⌥ ⌘ →'
 *
 * // On Windows/Linux:
 * formatShortcutKeys(['Meta', 'Shift', 'k']) // 'Ctrl+Shift+K'
 * formatShortcutKeys(['Alt', 'Meta', 'ArrowRight']) // 'Alt+Ctrl+→'
 */
export function formatShortcutKeys(keys: string[], separator?: string): string {
	const defaultSeparator = isMac() ? ' ' : '+';
	const sep = separator ?? defaultSeparator;

	return keys.map(formatKey).join(sep);
}

/**
 * Format the platform-appropriate meta/command key.
 * Returns '⌘' on macOS, 'Ctrl' on Windows/Linux.
 */
export function formatMetaKey(): string {
	return isMac() ? '⌘' : 'Ctrl';
}

/**
 * Format the enter-to-send display text.
 * Used by input areas that toggle between Enter and Cmd+Enter to send.
 *
 * @param enterToSend - Whether Enter sends (true) or Cmd/Ctrl+Enter sends (false)
 * @returns Display string like 'Enter' or '⌘ + Enter' / 'Ctrl + Enter'
 */
export function formatEnterToSend(enterToSend: boolean): string {
	if (enterToSend) return 'Enter';
	return isMac() ? '⌘ + Enter' : 'Ctrl + Enter';
}

/**
 * Format the enter-to-send tooltip text for the toggle button.
 *
 * @param enterToSend - Whether Enter sends (true) or Cmd/Ctrl+Enter sends (false)
 * @returns Tooltip like 'Switch to Cmd+Enter to send' or 'Switch to Enter to send'
 */
export function formatEnterToSendTooltip(enterToSend: boolean): string {
	if (enterToSend) {
		return `Switch to ${isMac() ? 'Cmd' : 'Ctrl'}+Enter to send`;
	}
	return 'Switch to Enter to send';
}

/**
 * Get the translated label for a shortcut.
 *
 * Resolves the shortcut's ID through the SHORTCUT_LABELS mapping to find the
 * i18n translation key, then calls i18n.t() to get the translated string.
 * Falls back to the shortcut's hardcoded label if no mapping exists.
 *
 * Uses the i18n singleton directly (not a React hook) so it can be called
 * from any context. The result is reactive when used inside components
 * that re-render on language change via react-i18next.
 *
 * @param shortcutId - The shortcut's ID (e.g., 'toggleSidebar')
 * @param fallbackLabel - The hardcoded label to use as fallback
 * @returns The translated label string
 */
export function getShortcutLabel(shortcutId: string, fallbackLabel: string): string {
	const key = SHORTCUT_LABELS[shortcutId as keyof typeof SHORTCUT_LABELS];
	return key ? i18n.t(key, { defaultValue: fallbackLabel }) : fallbackLabel;
}

/**
 * Check if running on macOS.
 * Useful for conditional rendering.
 */
export function isMacOS(): boolean {
	return isMac();
}
