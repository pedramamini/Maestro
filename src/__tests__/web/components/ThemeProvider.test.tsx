/**
 * Tests for ThemeProvider component
 *
 * Tests cover:
 * - ThemeProvider component (context provision, theme override, device preference, CSS injection)
 * - useTheme hook (context access, error boundary)
 * - useThemeColors hook (colors access, error boundary)
 * - ThemeContext export
 * - Default themes (defaultDarkTheme, defaultLightTheme)
 * - getDefaultThemeForScheme function behavior
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import {
  ThemeProvider,
  useTheme,
  useThemeColors,
  ThemeContext,
  type ThemeContextValue,
  type ThemeProviderProps,
} from '../../../web/components/ThemeProvider';
import type { Theme } from '../../../shared/theme-types';
import * as cssCustomProperties from '../../../web/utils/cssCustomProperties';
import * as useDeviceColorSchemeModule from '../../../web/hooks/useDeviceColorScheme';

// Mock CSS custom properties module
vi.mock('../../../web/utils/cssCustomProperties', () => ({
  injectCSSProperties: vi.fn(),
  removeCSSProperties: vi.fn(),
}));

// Mock useDeviceColorScheme hook
vi.mock('../../../web/hooks/useDeviceColorScheme', () => ({
  useDeviceColorScheme: vi.fn(() => ({
    colorScheme: 'dark',
    prefersDark: true,
    prefersLight: false,
  })),
}));

const mockedCssCustomProperties = vi.mocked(cssCustomProperties);
const mockedUseDeviceColorScheme = vi.mocked(useDeviceColorSchemeModule.useDeviceColorScheme);

// Custom dark theme for testing
const customDarkTheme: Theme = {
  id: 'custom-dark',
  name: 'Custom Dark',
  mode: 'dark',
  colors: {
    bgMain: '#1a1a1a',
    bgSidebar: '#2a2a2a',
    bgActivity: '#3a3a3a',
    border: '#4a4a4a',
    textMain: '#ffffff',
    textDim: '#cccccc',
    accent: '#ff5500',
    accentDim: 'rgba(255, 85, 0, 0.2)',
    accentText: '#ffaa77',
    success: '#00ff00',
    warning: '#ffff00',
    error: '#ff0000',
  },
};

// Custom light theme for testing
const customLightTheme: Theme = {
  id: 'custom-light',
  name: 'Custom Light',
  mode: 'light',
  colors: {
    bgMain: '#ffffff',
    bgSidebar: '#f0f0f0',
    bgActivity: '#e0e0e0',
    border: '#cccccc',
    textMain: '#000000',
    textDim: '#666666',
    accent: '#0066cc',
    accentDim: 'rgba(0, 102, 204, 0.1)',
    accentText: '#0066cc',
    success: '#008800',
    warning: '#886600',
    error: '#cc0000',
  },
};

// Custom vibe theme for testing
const customVibeTheme: Theme = {
  id: 'custom-vibe',
  name: 'Custom Vibe',
  mode: 'vibe',
  colors: {
    bgMain: '#1a0a2e',
    bgSidebar: '#2a1a4e',
    bgActivity: '#3a2a6e',
    border: '#5a4a8e',
    textMain: '#e0d0ff',
    textDim: '#a090cc',
    accent: '#ff00ff',
    accentDim: 'rgba(255, 0, 255, 0.2)',
    accentText: '#ff88ff',
    success: '#00ff88',
    warning: '#ffaa00',
    error: '#ff0088',
  },
};

// Expected default dark theme (Dracula)
const expectedDefaultDarkTheme: Theme = {
  id: 'dracula',
  name: 'Dracula',
  mode: 'dark',
  colors: {
    bgMain: '#0b0b0d',
    bgSidebar: '#111113',
    bgActivity: '#1c1c1f',
    border: '#27272a',
    textMain: '#e4e4e7',
    textDim: '#a1a1aa',
    accent: '#6366f1',
    accentDim: 'rgba(99, 102, 241, 0.2)',
    accentText: '#a5b4fc',
    success: '#22c55e',
    warning: '#eab308',
    error: '#ef4444',
  },
};

// Expected default light theme (GitHub Light)
const expectedDefaultLightTheme: Theme = {
  id: 'github-light',
  name: 'GitHub',
  mode: 'light',
  colors: {
    bgMain: '#ffffff',
    bgSidebar: '#f6f8fa',
    bgActivity: '#eff2f5',
    border: '#d0d7de',
    textMain: '#24292f',
    textDim: '#57606a',
    accent: '#0969da',
    accentDim: 'rgba(9, 105, 218, 0.1)',
    accentText: '#0969da',
    success: '#1a7f37',
    warning: '#9a6700',
    error: '#cf222e',
  },
};

describe('ThemeProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default to dark color scheme
    mockedUseDeviceColorScheme.mockReturnValue({
      colorScheme: 'dark',
      prefersDark: true,
      prefersLight: false,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ============================================
  // ThemeProvider Component Tests
  // ============================================

  describe('ThemeProvider component', () => {
    describe('rendering', () => {
      it('renders children correctly', () => {
        render(
          <ThemeProvider>
            <div data-testid="child">Child content</div>
          </ThemeProvider>
        );

        expect(screen.getByTestId('child')).toBeInTheDocument();
        expect(screen.getByText('Child content')).toBeInTheDocument();
      });

      it('renders multiple children', () => {
        render(
          <ThemeProvider>
            <div data-testid="child1">First</div>
            <div data-testid="child2">Second</div>
          </ThemeProvider>
        );

        expect(screen.getByTestId('child1')).toBeInTheDocument();
        expect(screen.getByTestId('child2')).toBeInTheDocument();
      });

      it('renders nested providers correctly', () => {
        render(
          <ThemeProvider theme={customDarkTheme}>
            <ThemeProvider theme={customLightTheme}>
              <div data-testid="nested">Nested content</div>
            </ThemeProvider>
          </ThemeProvider>
        );

        expect(screen.getByTestId('nested')).toBeInTheDocument();
      });

      it('renders with no children', () => {
        // Should not throw
        const { container } = render(<ThemeProvider>{null}</ThemeProvider>);
        expect(container).toBeInTheDocument();
      });

      it('renders with fragment children', () => {
        render(
          <ThemeProvider>
            <>
              <span>Fragment item 1</span>
              <span>Fragment item 2</span>
            </>
          </ThemeProvider>
        );

        expect(screen.getByText('Fragment item 1')).toBeInTheDocument();
        expect(screen.getByText('Fragment item 2')).toBeInTheDocument();
      });
    });

    describe('theme prop (override mode)', () => {
      it('uses provided theme when theme prop is given', () => {
        let capturedTheme: Theme | null = null;

        function ThemeCapture() {
          const { theme } = useTheme();
          capturedTheme = theme;
          return null;
        }

        render(
          <ThemeProvider theme={customDarkTheme}>
            <ThemeCapture />
          </ThemeProvider>
        );

        expect(capturedTheme).toEqual(customDarkTheme);
      });

      it('sets isDevicePreference to false when theme prop is provided', () => {
        let capturedValue: ThemeContextValue | null = null;

        function ThemeCapture() {
          const value = useTheme();
          capturedValue = value;
          return null;
        }

        render(
          <ThemeProvider theme={customDarkTheme}>
            <ThemeCapture />
          </ThemeProvider>
        );

        expect(capturedValue?.isDevicePreference).toBe(false);
      });

      it('theme prop overrides device preference even when useDevicePreference is true', () => {
        mockedUseDeviceColorScheme.mockReturnValue({
          colorScheme: 'light',
          prefersDark: false,
          prefersLight: true,
        });

        let capturedTheme: Theme | null = null;

        function ThemeCapture() {
          const { theme } = useTheme();
          capturedTheme = theme;
          return null;
        }

        render(
          <ThemeProvider theme={customDarkTheme} useDevicePreference>
            <ThemeCapture />
          </ThemeProvider>
        );

        // Should use the provided theme, not the device-based light theme
        expect(capturedTheme?.id).toBe('custom-dark');
        expect(capturedTheme?.mode).toBe('dark');
      });
    });

    describe('useDevicePreference prop', () => {
      it('uses dark theme when device prefers dark and useDevicePreference is true', () => {
        mockedUseDeviceColorScheme.mockReturnValue({
          colorScheme: 'dark',
          prefersDark: true,
          prefersLight: false,
        });

        let capturedTheme: Theme | null = null;
        let isDevicePref = false;

        function ThemeCapture() {
          const { theme, isDevicePreference } = useTheme();
          capturedTheme = theme;
          isDevicePref = isDevicePreference;
          return null;
        }

        render(
          <ThemeProvider useDevicePreference>
            <ThemeCapture />
          </ThemeProvider>
        );

        expect(capturedTheme).toEqual(expectedDefaultDarkTheme);
        expect(isDevicePref).toBe(true);
      });

      it('uses light theme when device prefers light and useDevicePreference is true', () => {
        mockedUseDeviceColorScheme.mockReturnValue({
          colorScheme: 'light',
          prefersDark: false,
          prefersLight: true,
        });

        let capturedTheme: Theme | null = null;
        let isDevicePref = false;

        function ThemeCapture() {
          const { theme, isDevicePreference } = useTheme();
          capturedTheme = theme;
          isDevicePref = isDevicePreference;
          return null;
        }

        render(
          <ThemeProvider useDevicePreference>
            <ThemeCapture />
          </ThemeProvider>
        );

        expect(capturedTheme).toEqual(expectedDefaultLightTheme);
        expect(isDevicePref).toBe(true);
      });

      it('defaults useDevicePreference to false', () => {
        // With useDevicePreference defaulting to false, should use default dark theme
        let capturedTheme: Theme | null = null;
        let isDevicePref = true;

        function ThemeCapture() {
          const { theme, isDevicePreference } = useTheme();
          capturedTheme = theme;
          isDevicePref = isDevicePreference;
          return null;
        }

        render(
          <ThemeProvider>
            <ThemeCapture />
          </ThemeProvider>
        );

        expect(capturedTheme).toEqual(expectedDefaultDarkTheme);
        expect(isDevicePref).toBe(false);
      });

      it('uses default dark theme when useDevicePreference is explicitly false', () => {
        // Even if device prefers light, should use dark when useDevicePreference=false
        mockedUseDeviceColorScheme.mockReturnValue({
          colorScheme: 'light',
          prefersDark: false,
          prefersLight: true,
        });

        let capturedTheme: Theme | null = null;

        function ThemeCapture() {
          const { theme } = useTheme();
          capturedTheme = theme;
          return null;
        }

        render(
          <ThemeProvider useDevicePreference={false}>
            <ThemeCapture />
          </ThemeProvider>
        );

        // Should still be default dark, not light
        expect(capturedTheme).toEqual(expectedDefaultDarkTheme);
      });
    });

    describe('context value calculation', () => {
      it('sets isLight to true for light mode themes', () => {
        let capturedValue: ThemeContextValue | null = null;

        function ThemeCapture() {
          const value = useTheme();
          capturedValue = value;
          return null;
        }

        render(
          <ThemeProvider theme={customLightTheme}>
            <ThemeCapture />
          </ThemeProvider>
        );

        expect(capturedValue?.isLight).toBe(true);
        expect(capturedValue?.isDark).toBe(false);
        expect(capturedValue?.isVibe).toBe(false);
      });

      it('sets isDark to true for dark mode themes', () => {
        let capturedValue: ThemeContextValue | null = null;

        function ThemeCapture() {
          const value = useTheme();
          capturedValue = value;
          return null;
        }

        render(
          <ThemeProvider theme={customDarkTheme}>
            <ThemeCapture />
          </ThemeProvider>
        );

        expect(capturedValue?.isLight).toBe(false);
        expect(capturedValue?.isDark).toBe(true);
        expect(capturedValue?.isVibe).toBe(false);
      });

      it('sets isVibe to true for vibe mode themes', () => {
        let capturedValue: ThemeContextValue | null = null;

        function ThemeCapture() {
          const value = useTheme();
          capturedValue = value;
          return null;
        }

        render(
          <ThemeProvider theme={customVibeTheme}>
            <ThemeCapture />
          </ThemeProvider>
        );

        expect(capturedValue?.isLight).toBe(false);
        expect(capturedValue?.isDark).toBe(false);
        expect(capturedValue?.isVibe).toBe(true);
      });

      it('includes full theme object in context', () => {
        let capturedValue: ThemeContextValue | null = null;

        function ThemeCapture() {
          const value = useTheme();
          capturedValue = value;
          return null;
        }

        render(
          <ThemeProvider theme={customDarkTheme}>
            <ThemeCapture />
          </ThemeProvider>
        );

        expect(capturedValue?.theme).toEqual(customDarkTheme);
        expect(capturedValue?.theme.id).toBe('custom-dark');
        expect(capturedValue?.theme.name).toBe('Custom Dark');
        expect(capturedValue?.theme.mode).toBe('dark');
        expect(capturedValue?.theme.colors).toEqual(customDarkTheme.colors);
      });
    });

    describe('CSS injection', () => {
      it('injects CSS properties on mount', () => {
        render(
          <ThemeProvider theme={customDarkTheme}>
            <div>Content</div>
          </ThemeProvider>
        );

        expect(mockedCssCustomProperties.injectCSSProperties).toHaveBeenCalledWith(
          customDarkTheme
        );
      });

      it('removes CSS properties on unmount', () => {
        const { unmount } = render(
          <ThemeProvider theme={customDarkTheme}>
            <div>Content</div>
          </ThemeProvider>
        );

        expect(mockedCssCustomProperties.removeCSSProperties).not.toHaveBeenCalled();

        unmount();

        expect(mockedCssCustomProperties.removeCSSProperties).toHaveBeenCalled();
      });

      it('updates CSS properties when theme changes', () => {
        const { rerender } = render(
          <ThemeProvider theme={customDarkTheme}>
            <div>Content</div>
          </ThemeProvider>
        );

        expect(mockedCssCustomProperties.injectCSSProperties).toHaveBeenCalledTimes(1);
        expect(mockedCssCustomProperties.injectCSSProperties).toHaveBeenLastCalledWith(
          customDarkTheme
        );

        rerender(
          <ThemeProvider theme={customLightTheme}>
            <div>Content</div>
          </ThemeProvider>
        );

        // Should be called again with the new theme
        expect(mockedCssCustomProperties.injectCSSProperties).toHaveBeenCalledTimes(2);
        expect(mockedCssCustomProperties.injectCSSProperties).toHaveBeenLastCalledWith(
          customLightTheme
        );
      });

      it('does not re-inject CSS when theme is the same', () => {
        const { rerender } = render(
          <ThemeProvider theme={customDarkTheme}>
            <div>Content</div>
          </ThemeProvider>
        );

        expect(mockedCssCustomProperties.injectCSSProperties).toHaveBeenCalledTimes(1);

        // Rerender with same theme reference
        rerender(
          <ThemeProvider theme={customDarkTheme}>
            <div>Content</div>
          </ThemeProvider>
        );

        // Should not inject again because theme reference is the same
        expect(mockedCssCustomProperties.injectCSSProperties).toHaveBeenCalledTimes(1);
      });

      it('injects default dark theme CSS when no theme provided', () => {
        render(
          <ThemeProvider>
            <div>Content</div>
          </ThemeProvider>
        );

        expect(mockedCssCustomProperties.injectCSSProperties).toHaveBeenCalledWith(
          expectedDefaultDarkTheme
        );
      });

      it('handles multiple mount/unmount cycles', () => {
        const { unmount: unmount1 } = render(
          <ThemeProvider theme={customDarkTheme}>
            <div>Content</div>
          </ThemeProvider>
        );

        unmount1();

        const { unmount: unmount2 } = render(
          <ThemeProvider theme={customLightTheme}>
            <div>Content</div>
          </ThemeProvider>
        );

        unmount2();

        expect(mockedCssCustomProperties.injectCSSProperties).toHaveBeenCalledTimes(2);
        expect(mockedCssCustomProperties.removeCSSProperties).toHaveBeenCalledTimes(2);
      });
    });

    describe('theme switching scenarios', () => {
      it('switches from dark to light theme', () => {
        let capturedTheme: Theme | null = null;

        function ThemeCapture() {
          const { theme } = useTheme();
          capturedTheme = theme;
          return null;
        }

        const { rerender } = render(
          <ThemeProvider theme={customDarkTheme}>
            <ThemeCapture />
          </ThemeProvider>
        );

        expect(capturedTheme?.mode).toBe('dark');

        rerender(
          <ThemeProvider theme={customLightTheme}>
            <ThemeCapture />
          </ThemeProvider>
        );

        expect(capturedTheme?.mode).toBe('light');
      });

      it('switches from explicit theme to device preference', () => {
        let capturedTheme: Theme | null = null;
        let isDevicePref = false;

        function ThemeCapture() {
          const { theme, isDevicePreference } = useTheme();
          capturedTheme = theme;
          isDevicePref = isDevicePreference;
          return null;
        }

        const { rerender } = render(
          <ThemeProvider theme={customDarkTheme}>
            <ThemeCapture />
          </ThemeProvider>
        );

        expect(capturedTheme?.id).toBe('custom-dark');
        expect(isDevicePref).toBe(false);

        rerender(
          <ThemeProvider useDevicePreference>
            <ThemeCapture />
          </ThemeProvider>
        );

        expect(capturedTheme?.id).toBe('dracula'); // Default dark
        expect(isDevicePref).toBe(true);
      });

      it('responds to device color scheme changes', () => {
        let capturedTheme: Theme | null = null;

        function ThemeCapture() {
          const { theme } = useTheme();
          capturedTheme = theme;
          return null;
        }

        // Start with dark
        mockedUseDeviceColorScheme.mockReturnValue({
          colorScheme: 'dark',
          prefersDark: true,
          prefersLight: false,
        });

        const { rerender } = render(
          <ThemeProvider useDevicePreference>
            <ThemeCapture />
          </ThemeProvider>
        );

        expect(capturedTheme?.id).toBe('dracula');

        // Change to light
        mockedUseDeviceColorScheme.mockReturnValue({
          colorScheme: 'light',
          prefersDark: false,
          prefersLight: true,
        });

        rerender(
          <ThemeProvider useDevicePreference>
            <ThemeCapture />
          </ThemeProvider>
        );

        expect(capturedTheme?.id).toBe('github-light');
      });
    });

    describe('memoization behavior', () => {
      it('memoizes context value when theme does not change', () => {
        const capturedValues: ThemeContextValue[] = [];

        function ThemeCapture() {
          const value = useTheme();
          capturedValues.push(value);
          return <div>{capturedValues.length}</div>;
        }

        const { rerender } = render(
          <ThemeProvider theme={customDarkTheme}>
            <ThemeCapture />
          </ThemeProvider>
        );

        rerender(
          <ThemeProvider theme={customDarkTheme}>
            <ThemeCapture />
          </ThemeProvider>
        );

        // Context value should be the same reference
        expect(capturedValues[0]).toBe(capturedValues[1]);
      });

      it('creates new context value when theme changes', () => {
        const capturedValues: ThemeContextValue[] = [];

        function ThemeCapture() {
          const value = useTheme();
          capturedValues.push(value);
          return <div>{capturedValues.length}</div>;
        }

        const { rerender } = render(
          <ThemeProvider theme={customDarkTheme}>
            <ThemeCapture />
          </ThemeProvider>
        );

        rerender(
          <ThemeProvider theme={customLightTheme}>
            <ThemeCapture />
          </ThemeProvider>
        );

        // Context values should be different references
        expect(capturedValues[0]).not.toBe(capturedValues[1]);
      });
    });
  });

  // ============================================
  // useTheme Hook Tests
  // ============================================

  describe('useTheme hook', () => {
    it('returns theme context value when used within provider', () => {
      const { result } = renderHook(() => useTheme(), {
        wrapper: ({ children }) => (
          <ThemeProvider theme={customDarkTheme}>{children}</ThemeProvider>
        ),
      });

      expect(result.current.theme).toEqual(customDarkTheme);
      expect(result.current.isDark).toBe(true);
      expect(result.current.isLight).toBe(false);
      expect(result.current.isVibe).toBe(false);
      expect(result.current.isDevicePreference).toBe(false);
    });

    it('throws error when used outside of provider', () => {
      // Suppress console.error for this test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        renderHook(() => useTheme());
      }).toThrow('useTheme must be used within a ThemeProvider');

      consoleSpy.mockRestore();
    });

    it('returns correct mode flags for light theme', () => {
      const { result } = renderHook(() => useTheme(), {
        wrapper: ({ children }) => (
          <ThemeProvider theme={customLightTheme}>{children}</ThemeProvider>
        ),
      });

      expect(result.current.isLight).toBe(true);
      expect(result.current.isDark).toBe(false);
      expect(result.current.isVibe).toBe(false);
    });

    it('returns correct mode flags for vibe theme', () => {
      const { result } = renderHook(() => useTheme(), {
        wrapper: ({ children }) => (
          <ThemeProvider theme={customVibeTheme}>{children}</ThemeProvider>
        ),
      });

      expect(result.current.isLight).toBe(false);
      expect(result.current.isDark).toBe(false);
      expect(result.current.isVibe).toBe(true);
    });

    it('returns stable reference when theme does not change', () => {
      const { result, rerender } = renderHook(() => useTheme(), {
        wrapper: ({ children }) => (
          <ThemeProvider theme={customDarkTheme}>{children}</ThemeProvider>
        ),
      });

      const firstResult = result.current;
      rerender();
      const secondResult = result.current;

      expect(firstResult).toBe(secondResult);
    });
  });

  // ============================================
  // useThemeColors Hook Tests
  // ============================================

  describe('useThemeColors hook', () => {
    it('returns theme colors when used within provider', () => {
      const { result } = renderHook(() => useThemeColors(), {
        wrapper: ({ children }) => (
          <ThemeProvider theme={customDarkTheme}>{children}</ThemeProvider>
        ),
      });

      expect(result.current).toEqual(customDarkTheme.colors);
      expect(result.current.bgMain).toBe('#1a1a1a');
      expect(result.current.accent).toBe('#ff5500');
    });

    it('throws error when used outside of provider', () => {
      // Suppress console.error for this test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        renderHook(() => useThemeColors());
      }).toThrow('useTheme must be used within a ThemeProvider');

      consoleSpy.mockRestore();
    });

    it('returns updated colors when theme changes', () => {
      // Use a stateful test component that can change its theme
      let currentTheme = customDarkTheme;

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ThemeProvider theme={currentTheme}>{children}</ThemeProvider>
      );

      const { result, rerender } = renderHook(() => useThemeColors(), {
        wrapper,
      });

      expect(result.current.bgMain).toBe('#1a1a1a');

      // Change the theme and rerender
      currentTheme = customLightTheme;
      rerender();

      expect(result.current.bgMain).toBe('#ffffff');
    });

    it('returns all expected color properties', () => {
      const { result } = renderHook(() => useThemeColors(), {
        wrapper: ({ children }) => (
          <ThemeProvider theme={customDarkTheme}>{children}</ThemeProvider>
        ),
      });

      // Verify all expected color keys exist
      const expectedColorKeys = [
        'bgMain',
        'bgSidebar',
        'bgActivity',
        'border',
        'textMain',
        'textDim',
        'accent',
        'accentDim',
        'accentText',
        'success',
        'warning',
        'error',
      ];

      expectedColorKeys.forEach((key) => {
        expect(result.current).toHaveProperty(key);
      });
    });
  });

  // ============================================
  // ThemeContext Export Tests
  // ============================================

  describe('ThemeContext export', () => {
    it('is a valid React context', () => {
      expect(ThemeContext).toBeDefined();
      expect(ThemeContext.Provider).toBeDefined();
      expect(ThemeContext.Consumer).toBeDefined();
    });

    it('can be used with useContext directly', () => {
      function DirectContextConsumer() {
        const context = React.useContext(ThemeContext);
        return <div data-testid="context-value">{context?.theme.id || 'null'}</div>;
      }

      render(
        <ThemeProvider theme={customDarkTheme}>
          <DirectContextConsumer />
        </ThemeProvider>
      );

      expect(screen.getByTestId('context-value')).toHaveTextContent('custom-dark');
    });

    it('returns null when used outside provider', () => {
      function DirectContextConsumer() {
        const context = React.useContext(ThemeContext);
        return <div data-testid="context-value">{context === null ? 'null' : 'has value'}</div>;
      }

      render(<DirectContextConsumer />);

      expect(screen.getByTestId('context-value')).toHaveTextContent('null');
    });
  });

  // ============================================
  // Default Theme Tests
  // ============================================

  describe('default themes', () => {
    describe('default dark theme (Dracula)', () => {
      it('has correct id', () => {
        let capturedTheme: Theme | null = null;

        function ThemeCapture() {
          const { theme } = useTheme();
          capturedTheme = theme;
          return null;
        }

        render(
          <ThemeProvider>
            <ThemeCapture />
          </ThemeProvider>
        );

        expect(capturedTheme?.id).toBe('dracula');
      });

      it('has correct name', () => {
        let capturedTheme: Theme | null = null;

        function ThemeCapture() {
          const { theme } = useTheme();
          capturedTheme = theme;
          return null;
        }

        render(
          <ThemeProvider>
            <ThemeCapture />
          </ThemeProvider>
        );

        expect(capturedTheme?.name).toBe('Dracula');
      });

      it('has dark mode', () => {
        let capturedTheme: Theme | null = null;

        function ThemeCapture() {
          const { theme } = useTheme();
          capturedTheme = theme;
          return null;
        }

        render(
          <ThemeProvider>
            <ThemeCapture />
          </ThemeProvider>
        );

        expect(capturedTheme?.mode).toBe('dark');
      });

      it('has all expected color properties', () => {
        let capturedTheme: Theme | null = null;

        function ThemeCapture() {
          const { theme } = useTheme();
          capturedTheme = theme;
          return null;
        }

        render(
          <ThemeProvider>
            <ThemeCapture />
          </ThemeProvider>
        );

        expect(capturedTheme?.colors.bgMain).toBe('#0b0b0d');
        expect(capturedTheme?.colors.bgSidebar).toBe('#111113');
        expect(capturedTheme?.colors.bgActivity).toBe('#1c1c1f');
        expect(capturedTheme?.colors.border).toBe('#27272a');
        expect(capturedTheme?.colors.textMain).toBe('#e4e4e7');
        expect(capturedTheme?.colors.textDim).toBe('#a1a1aa');
        expect(capturedTheme?.colors.accent).toBe('#6366f1');
        expect(capturedTheme?.colors.accentDim).toBe('rgba(99, 102, 241, 0.2)');
        expect(capturedTheme?.colors.accentText).toBe('#a5b4fc');
        expect(capturedTheme?.colors.success).toBe('#22c55e');
        expect(capturedTheme?.colors.warning).toBe('#eab308');
        expect(capturedTheme?.colors.error).toBe('#ef4444');
      });
    });

    describe('default light theme (GitHub Light)', () => {
      it('has correct id when device prefers light', () => {
        mockedUseDeviceColorScheme.mockReturnValue({
          colorScheme: 'light',
          prefersDark: false,
          prefersLight: true,
        });

        let capturedTheme: Theme | null = null;

        function ThemeCapture() {
          const { theme } = useTheme();
          capturedTheme = theme;
          return null;
        }

        render(
          <ThemeProvider useDevicePreference>
            <ThemeCapture />
          </ThemeProvider>
        );

        expect(capturedTheme?.id).toBe('github-light');
      });

      it('has correct name when device prefers light', () => {
        mockedUseDeviceColorScheme.mockReturnValue({
          colorScheme: 'light',
          prefersDark: false,
          prefersLight: true,
        });

        let capturedTheme: Theme | null = null;

        function ThemeCapture() {
          const { theme } = useTheme();
          capturedTheme = theme;
          return null;
        }

        render(
          <ThemeProvider useDevicePreference>
            <ThemeCapture />
          </ThemeProvider>
        );

        expect(capturedTheme?.name).toBe('GitHub');
      });

      it('has light mode when device prefers light', () => {
        mockedUseDeviceColorScheme.mockReturnValue({
          colorScheme: 'light',
          prefersDark: false,
          prefersLight: true,
        });

        let capturedTheme: Theme | null = null;

        function ThemeCapture() {
          const { theme } = useTheme();
          capturedTheme = theme;
          return null;
        }

        render(
          <ThemeProvider useDevicePreference>
            <ThemeCapture />
          </ThemeProvider>
        );

        expect(capturedTheme?.mode).toBe('light');
      });

      it('has all expected color properties for light theme', () => {
        mockedUseDeviceColorScheme.mockReturnValue({
          colorScheme: 'light',
          prefersDark: false,
          prefersLight: true,
        });

        let capturedTheme: Theme | null = null;

        function ThemeCapture() {
          const { theme } = useTheme();
          capturedTheme = theme;
          return null;
        }

        render(
          <ThemeProvider useDevicePreference>
            <ThemeCapture />
          </ThemeProvider>
        );

        expect(capturedTheme?.colors.bgMain).toBe('#ffffff');
        expect(capturedTheme?.colors.bgSidebar).toBe('#f6f8fa');
        expect(capturedTheme?.colors.bgActivity).toBe('#eff2f5');
        expect(capturedTheme?.colors.border).toBe('#d0d7de');
        expect(capturedTheme?.colors.textMain).toBe('#24292f');
        expect(capturedTheme?.colors.textDim).toBe('#57606a');
        expect(capturedTheme?.colors.accent).toBe('#0969da');
        expect(capturedTheme?.colors.accentDim).toBe('rgba(9, 105, 218, 0.1)');
        expect(capturedTheme?.colors.accentText).toBe('#0969da');
        expect(capturedTheme?.colors.success).toBe('#1a7f37');
        expect(capturedTheme?.colors.warning).toBe('#9a6700');
        expect(capturedTheme?.colors.error).toBe('#cf222e');
      });
    });
  });

  // ============================================
  // getDefaultThemeForScheme Function Tests
  // ============================================

  describe('getDefaultThemeForScheme behavior', () => {
    it('returns light theme for light color scheme', () => {
      mockedUseDeviceColorScheme.mockReturnValue({
        colorScheme: 'light',
        prefersDark: false,
        prefersLight: true,
      });

      let capturedTheme: Theme | null = null;

      function ThemeCapture() {
        const { theme } = useTheme();
        capturedTheme = theme;
        return null;
      }

      render(
        <ThemeProvider useDevicePreference>
          <ThemeCapture />
        </ThemeProvider>
      );

      expect(capturedTheme?.mode).toBe('light');
      expect(capturedTheme?.id).toBe('github-light');
    });

    it('returns dark theme for dark color scheme', () => {
      mockedUseDeviceColorScheme.mockReturnValue({
        colorScheme: 'dark',
        prefersDark: true,
        prefersLight: false,
      });

      let capturedTheme: Theme | null = null;

      function ThemeCapture() {
        const { theme } = useTheme();
        capturedTheme = theme;
        return null;
      }

      render(
        <ThemeProvider useDevicePreference>
          <ThemeCapture />
        </ThemeProvider>
      );

      expect(capturedTheme?.mode).toBe('dark');
      expect(capturedTheme?.id).toBe('dracula');
    });
  });

  // ============================================
  // Edge Cases and Integration Tests
  // ============================================

  describe('edge cases', () => {
    it('handles theme with empty string id', () => {
      const themeWithEmptyId: Theme = {
        id: '' as any,
        name: 'Empty ID Theme',
        mode: 'dark',
        colors: customDarkTheme.colors,
      };

      let capturedTheme: Theme | null = null;

      function ThemeCapture() {
        const { theme } = useTheme();
        capturedTheme = theme;
        return null;
      }

      render(
        <ThemeProvider theme={themeWithEmptyId}>
          <ThemeCapture />
        </ThemeProvider>
      );

      expect(capturedTheme?.id).toBe('');
    });

    it('handles theme with unicode characters in name', () => {
      const unicodeTheme: Theme = {
        id: 'unicode-theme',
        name: '🌙 Dark Theme 🌙',
        mode: 'dark',
        colors: customDarkTheme.colors,
      };

      let capturedTheme: Theme | null = null;

      function ThemeCapture() {
        const { theme } = useTheme();
        capturedTheme = theme;
        return null;
      }

      render(
        <ThemeProvider theme={unicodeTheme}>
          <ThemeCapture />
        </ThemeProvider>
      );

      expect(capturedTheme?.name).toBe('🌙 Dark Theme 🌙');
    });

    it('handles theme with very long color values', () => {
      const longColorTheme: Theme = {
        id: 'long-color',
        name: 'Long Color Theme',
        mode: 'dark',
        colors: {
          ...customDarkTheme.colors,
          accentDim: 'rgba(255, 255, 255, 0.123456789012345678901234567890)',
        },
      };

      let capturedTheme: Theme | null = null;

      function ThemeCapture() {
        const { theme } = useTheme();
        capturedTheme = theme;
        return null;
      }

      render(
        <ThemeProvider theme={longColorTheme}>
          <ThemeCapture />
        </ThemeProvider>
      );

      expect(capturedTheme?.colors.accentDim).toBe(
        'rgba(255, 255, 255, 0.123456789012345678901234567890)'
      );
    });

    it('handles rapid theme changes', () => {
      let capturedTheme: Theme | null = null;

      function ThemeCapture() {
        const { theme } = useTheme();
        capturedTheme = theme;
        return null;
      }

      const { rerender } = render(
        <ThemeProvider theme={customDarkTheme}>
          <ThemeCapture />
        </ThemeProvider>
      );

      // Rapid changes
      for (let i = 0; i < 10; i++) {
        rerender(
          <ThemeProvider theme={i % 2 === 0 ? customLightTheme : customDarkTheme}>
            <ThemeCapture />
          </ThemeProvider>
        );
      }

      // Last one should be customDarkTheme (9 % 2 === 1)
      expect(capturedTheme?.mode).toBe('dark');
    });

    it('handles deeply nested providers', () => {
      let innerTheme: Theme | null = null;

      function ThemeCapture() {
        const { theme } = useTheme();
        innerTheme = theme;
        return null;
      }

      render(
        <ThemeProvider theme={customDarkTheme}>
          <ThemeProvider theme={customLightTheme}>
            <ThemeProvider theme={customVibeTheme}>
              <ThemeCapture />
            </ThemeProvider>
          </ThemeProvider>
        </ThemeProvider>
      );

      // Innermost provider wins
      expect(innerTheme?.mode).toBe('vibe');
    });
  });

  describe('integration scenarios', () => {
    it('simulates WebSocket theme update flow', () => {
      let capturedTheme: Theme | null = null;
      let isDevicePref = true;

      function ThemeCapture() {
        const { theme, isDevicePreference } = useTheme();
        capturedTheme = theme;
        isDevicePref = isDevicePreference;
        return null;
      }

      // Start with device preference (no theme from server yet)
      mockedUseDeviceColorScheme.mockReturnValue({
        colorScheme: 'light',
        prefersDark: false,
        prefersLight: true,
      });

      const { rerender } = render(
        <ThemeProvider useDevicePreference>
          <ThemeCapture />
        </ThemeProvider>
      );

      expect(capturedTheme?.id).toBe('github-light');
      expect(isDevicePref).toBe(true);

      // Server sends theme update
      rerender(
        <ThemeProvider theme={customDarkTheme} useDevicePreference>
          <ThemeCapture />
        </ThemeProvider>
      );

      // Should use server theme, not device preference
      expect(capturedTheme?.id).toBe('custom-dark');
      expect(isDevicePref).toBe(false);
    });

    it('simulates mobile app with system theme switching', () => {
      let capturedTheme: Theme | null = null;

      function ThemeCapture() {
        const { theme } = useTheme();
        capturedTheme = theme;
        return null;
      }

      // User has dark mode enabled
      mockedUseDeviceColorScheme.mockReturnValue({
        colorScheme: 'dark',
        prefersDark: true,
        prefersLight: false,
      });

      const { rerender } = render(
        <ThemeProvider useDevicePreference>
          <ThemeCapture />
        </ThemeProvider>
      );

      expect(capturedTheme?.mode).toBe('dark');

      // User switches to light mode in system settings
      mockedUseDeviceColorScheme.mockReturnValue({
        colorScheme: 'light',
        prefersDark: false,
        prefersLight: true,
      });

      rerender(
        <ThemeProvider useDevicePreference>
          <ThemeCapture />
        </ThemeProvider>
      );

      expect(capturedTheme?.mode).toBe('light');
    });

    it('provides correct colors to styled component', () => {
      function StyledComponent() {
        const { theme, isDark } = useTheme();
        return (
          <div
            data-testid="styled"
            style={{
              backgroundColor: theme.colors.bgMain,
              color: theme.colors.textMain,
            }}
          >
            {isDark ? 'Dark Mode' : 'Light Mode'}
          </div>
        );
      }

      render(
        <ThemeProvider theme={customDarkTheme}>
          <StyledComponent />
        </ThemeProvider>
      );

      const element = screen.getByTestId('styled');
      expect(element).toHaveStyle({
        backgroundColor: '#1a1a1a',
        color: '#ffffff',
      });
      expect(element).toHaveTextContent('Dark Mode');
    });

    it('allows conditional rendering based on theme mode', () => {
      function ConditionalComponent() {
        const { isDark, isLight, isVibe } = useTheme();
        return (
          <div>
            {isDark && <span data-testid="dark-only">Dark content</span>}
            {isLight && <span data-testid="light-only">Light content</span>}
            {isVibe && <span data-testid="vibe-only">Vibe content</span>}
          </div>
        );
      }

      const { rerender } = render(
        <ThemeProvider theme={customDarkTheme}>
          <ConditionalComponent />
        </ThemeProvider>
      );

      expect(screen.getByTestId('dark-only')).toBeInTheDocument();
      expect(screen.queryByTestId('light-only')).not.toBeInTheDocument();
      expect(screen.queryByTestId('vibe-only')).not.toBeInTheDocument();

      rerender(
        <ThemeProvider theme={customLightTheme}>
          <ConditionalComponent />
        </ThemeProvider>
      );

      expect(screen.queryByTestId('dark-only')).not.toBeInTheDocument();
      expect(screen.getByTestId('light-only')).toBeInTheDocument();
      expect(screen.queryByTestId('vibe-only')).not.toBeInTheDocument();

      rerender(
        <ThemeProvider theme={customVibeTheme}>
          <ConditionalComponent />
        </ThemeProvider>
      );

      expect(screen.queryByTestId('dark-only')).not.toBeInTheDocument();
      expect(screen.queryByTestId('light-only')).not.toBeInTheDocument();
      expect(screen.getByTestId('vibe-only')).toBeInTheDocument();
    });
  });

  // ============================================
  // Type Export Tests
  // ============================================

  describe('type exports', () => {
    it('ThemeContextValue type is usable', () => {
      // This is a compile-time check - if types are wrong, this wouldn't compile
      const testValue: ThemeContextValue = {
        theme: customDarkTheme,
        isLight: false,
        isDark: true,
        isVibe: false,
        isDevicePreference: false,
      };

      expect(testValue.theme).toBeDefined();
      expect(typeof testValue.isLight).toBe('boolean');
      expect(typeof testValue.isDark).toBe('boolean');
      expect(typeof testValue.isVibe).toBe('boolean');
      expect(typeof testValue.isDevicePreference).toBe('boolean');
    });

    it('ThemeProviderProps type is usable', () => {
      // This is a compile-time check
      const testProps: ThemeProviderProps = {
        theme: customDarkTheme,
        useDevicePreference: true,
        children: null,
      };

      expect(testProps.theme).toBeDefined();
      expect(testProps.useDevicePreference).toBe(true);
    });

    it('ThemeProviderProps allows optional theme', () => {
      const testProps: ThemeProviderProps = {
        children: null,
      };

      expect(testProps.theme).toBeUndefined();
      expect(testProps.useDevicePreference).toBeUndefined();
    });
  });
});
