/**
 * Tests for src/main/themes.ts
 *
 * Tests cover theme definitions and the getThemeById function.
 * This module mirrors the renderer themes for use in the main process.
 */

import { describe, it, expect } from 'vitest';
import { THEMES, getThemeById } from '../../main/themes';
import type { Theme, ThemeId } from '../../shared/theme-types';

describe('themes.ts', () => {
  describe('THEMES constant', () => {
    it('should export a Record of themes', () => {
      expect(THEMES).toBeDefined();
      expect(typeof THEMES).toBe('object');
    });

    it('should contain all expected theme IDs', () => {
      const expectedThemeIds: ThemeId[] = [
        'dracula',
        'monokai',
        'nord',
        'tokyo-night',
        'catppuccin-mocha',
        'gruvbox-dark',
        'github-light',
        'solarized-light',
        'one-light',
        'gruvbox-light',
        'catppuccin-latte',
        'ayu-light',
        'pedurple',
        'maestros-choice',
        'dre-synth',
        'inquest',
      ];

      expectedThemeIds.forEach((id) => {
        expect(THEMES[id]).toBeDefined();
      });
    });

    describe('dark themes', () => {
      const darkThemes = ['dracula', 'monokai', 'nord', 'tokyo-night', 'catppuccin-mocha', 'gruvbox-dark'];

      darkThemes.forEach((themeId) => {
        it(`${themeId} should have mode "dark"`, () => {
          expect(THEMES[themeId as ThemeId].mode).toBe('dark');
        });
      });
    });

    describe('light themes', () => {
      const lightThemes = ['github-light', 'solarized-light', 'one-light', 'gruvbox-light', 'catppuccin-latte', 'ayu-light'];

      lightThemes.forEach((themeId) => {
        it(`${themeId} should have mode "light"`, () => {
          expect(THEMES[themeId as ThemeId].mode).toBe('light');
        });
      });
    });

    describe('vibe themes', () => {
      const vibeThemes = ['pedurple', 'maestros-choice', 'dre-synth', 'inquest'];

      vibeThemes.forEach((themeId) => {
        it(`${themeId} should have mode "vibe"`, () => {
          expect(THEMES[themeId as ThemeId].mode).toBe('vibe');
        });
      });
    });

    describe('theme structure', () => {
      Object.entries(THEMES).forEach(([id, theme]) => {
        describe(`${id} theme`, () => {
          it('should have an id matching the key', () => {
            expect(theme.id).toBe(id);
          });

          it('should have a name', () => {
            expect(theme.name).toBeTruthy();
            expect(typeof theme.name).toBe('string');
          });

          it('should have a valid mode', () => {
            expect(['dark', 'light', 'vibe']).toContain(theme.mode);
          });

          it('should have all required color properties', () => {
            const requiredColors = [
              'bgMain',
              'bgSidebar',
              'bgActivity',
              'border',
              'textMain',
              'textDim',
              'accent',
              'accentDim',
              'accentText',
              'accentForeground',
              'success',
              'warning',
              'error',
            ];

            requiredColors.forEach((colorKey) => {
              expect(theme.colors).toHaveProperty(colorKey);
              expect(theme.colors[colorKey as keyof typeof theme.colors]).toBeTruthy();
            });
          });

          it('should have valid hex colors for main properties', () => {
            const hexColorPattern = /^#[0-9a-fA-F]{6}$/;
            const hexColors = ['bgMain', 'bgSidebar', 'bgActivity', 'border', 'textMain', 'textDim', 'success', 'warning', 'error'];

            hexColors.forEach((colorKey) => {
              const color = theme.colors[colorKey as keyof typeof theme.colors];
              expect(color).toMatch(hexColorPattern);
            });
          });

          it('should have valid colors for accent properties', () => {
            // Accent colors can be hex or rgba
            const hexOrRgbaPattern = /^(#[0-9a-fA-F]{6}|rgba?\([^)]+\))$/;
            const accentColors = ['accent', 'accentDim', 'accentText', 'accentForeground'];

            accentColors.forEach((colorKey) => {
              const color = theme.colors[colorKey as keyof typeof theme.colors];
              expect(color).toMatch(hexOrRgbaPattern);
            });
          });
        });
      });
    });
  });

  describe('getThemeById', () => {
    it('should return a theme for valid theme IDs', () => {
      const theme = getThemeById('dracula');

      expect(theme).not.toBeNull();
      expect(theme?.id).toBe('dracula');
      expect(theme?.name).toBe('Dracula');
    });

    it('should return null for unknown theme IDs', () => {
      const theme = getThemeById('nonexistent-theme');

      expect(theme).toBeNull();
    });

    it('should return null for empty string', () => {
      const theme = getThemeById('');

      expect(theme).toBeNull();
    });

    it('should return correct theme for all valid IDs', () => {
      Object.keys(THEMES).forEach((themeId) => {
        const theme = getThemeById(themeId);

        expect(theme).not.toBeNull();
        expect(theme?.id).toBe(themeId);
      });
    });

    it('should return the exact same object from THEMES', () => {
      const themeId = 'nord';
      const theme = getThemeById(themeId);

      expect(theme).toBe(THEMES[themeId]);
    });

    describe('specific theme properties', () => {
      it('should return correct dracula theme colors', () => {
        const theme = getThemeById('dracula');

        expect(theme?.colors.bgMain).toBe('#0b0b0d');
        expect(theme?.colors.accent).toBe('#6366f1');
      });

      it('should return correct github-light theme colors', () => {
        const theme = getThemeById('github-light');

        expect(theme?.colors.bgMain).toBe('#ffffff');
        expect(theme?.colors.accent).toBe('#0969da');
      });

      it('should return correct pedurple (vibe) theme colors', () => {
        const theme = getThemeById('pedurple');

        expect(theme?.colors.accent).toBe('#ff69b4');
        expect(theme?.mode).toBe('vibe');
      });
    });

    describe('type safety', () => {
      it('should accept string parameter', () => {
        const themeId: string = 'monokai';
        const theme = getThemeById(themeId);

        expect(theme).not.toBeNull();
      });

      it('should return Theme type or null', () => {
        const theme: Theme | null = getThemeById('nord');

        if (theme) {
          // TypeScript should know theme is Theme here
          expect(theme.id).toBe('nord');
          expect(theme.colors.bgMain).toBeDefined();
        }
      });
    });
  });

  describe('type exports', () => {
    it('should export Theme and ThemeId types', () => {
      // Type check - ensure the types are usable
      const theme: Theme = THEMES['dracula'];
      const themeId: ThemeId = 'dracula';

      expect(theme).toBeDefined();
      expect(themeId).toBe('dracula');
    });
  });
});
