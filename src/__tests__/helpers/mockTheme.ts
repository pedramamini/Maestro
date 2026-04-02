import type { Theme, ThemeColors } from '../../shared/theme-types';

/**
 * Default mock theme colors for testing.
 * Covers all 13 required ThemeColors fields.
 */
export const mockThemeColors: ThemeColors = {
	bgMain: '#1a1a2e',
	bgSidebar: '#16213e',
	bgActivity: '#0f3460',
	border: '#555555',
	textMain: '#e0e0e0',
	textDim: '#888888',
	accent: '#8b5cf6',
	accentDim: '#8b5cf640',
	accentText: '#a78bfa',
	accentForeground: '#ffffff',
	success: '#10b981',
	warning: '#f59e0b',
	error: '#ef4444',
};

/**
 * Default mock theme for testing.
 * Uses 'dracula' as id to satisfy ThemeId union type.
 */
export const mockTheme: Theme = {
	id: 'dracula',
	name: 'Test Theme',
	mode: 'dark',
	colors: mockThemeColors,
};

/**
 * Create a mock theme with optional overrides.
 * Supports deep merging of the colors object.
 */
export function createMockTheme(overrides: Partial<Theme> = {}): Theme {
	return {
		...mockTheme,
		...overrides,
		colors: {
			...mockTheme.colors,
			...(overrides.colors ?? {}),
		},
	};
}
