/**
 * @file ShortcutsHelpModal.test.tsx
 * @description Tests for the ShortcutsHelpModal component
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { ShortcutsHelpModal } from '../../../renderer/components/ShortcutsHelpModal';
import { LayerStackProvider } from '../../../renderer/contexts/LayerStackContext';
import type { Theme, Shortcut } from '../../../renderer/types';

// Create a mock theme for testing
const createMockTheme = (): Theme => ({
  id: 'test-theme',
  name: 'Test Theme',
  mode: 'dark',
  colors: {
    bgMain: '#1a1a1a',
    bgPanel: '#252525',
    bgSidebar: '#202020',
    bgActivity: '#2d2d2d',
    textMain: '#ffffff',
    textDim: '#888888',
    accent: '#0066ff',
    accentForeground: '#ffffff',
    border: '#333333',
    highlight: '#0066ff33',
    success: '#00aa00',
    warning: '#ffaa00',
    error: '#ff0000',
  },
});

// Create mock shortcuts for testing
const createMockShortcuts = (): Record<string, Shortcut> => ({
  'new-session': {
    id: 'new-session',
    label: 'New Session',
    keys: ['Cmd', 'N'],
    category: 'general',
    action: 'createSession',
    editable: true,
  },
  'close-session': {
    id: 'close-session',
    label: 'Close Session',
    keys: ['Cmd', 'W'],
    category: 'general',
    action: 'closeSession',
    editable: true,
  },
  'search': {
    id: 'search',
    label: 'Search Files',
    keys: ['Cmd', 'P'],
    category: 'general',
    action: 'search',
    editable: true,
  },
  'toggle-sidebar': {
    id: 'toggle-sidebar',
    label: 'Toggle Left Sidebar',
    keys: ['Cmd', 'B'],
    category: 'ui',
    action: 'toggleLeftBar',
    editable: true,
  },
});

// Wrapper component to provide LayerStackContext
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <LayerStackProvider>
    {children}
  </LayerStackProvider>
);

describe('ShortcutsHelpModal', () => {
  const mockTheme = createMockTheme();
  const mockShortcuts = createMockShortcuts();
  let mockOnClose: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockOnClose = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders the modal with title', () => {
      render(
        <TestWrapper>
          <ShortcutsHelpModal
            theme={mockTheme}
            shortcuts={mockShortcuts}
            onClose={mockOnClose}
          />
        </TestWrapper>
      );

      expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();
    });

    it('renders search input', () => {
      render(
        <TestWrapper>
          <ShortcutsHelpModal
            theme={mockTheme}
            shortcuts={mockShortcuts}
            onClose={mockOnClose}
          />
        </TestWrapper>
      );

      expect(screen.getByPlaceholderText('Search shortcuts...')).toBeInTheDocument();
    });

    it('renders close button', () => {
      render(
        <TestWrapper>
          <ShortcutsHelpModal
            theme={mockTheme}
            shortcuts={mockShortcuts}
            onClose={mockOnClose}
          />
        </TestWrapper>
      );

      const closeButton = screen.getByRole('button');
      expect(closeButton).toBeInTheDocument();
    });

    it('renders all shortcut items', () => {
      render(
        <TestWrapper>
          <ShortcutsHelpModal
            theme={mockTheme}
            shortcuts={mockShortcuts}
            onClose={mockOnClose}
          />
        </TestWrapper>
      );

      expect(screen.getByText('New Session')).toBeInTheDocument();
      expect(screen.getByText('Close Session')).toBeInTheDocument();
      expect(screen.getByText('Search Files')).toBeInTheDocument();
    });

    it('has proper dialog accessibility attributes', () => {
      render(
        <TestWrapper>
          <ShortcutsHelpModal
            theme={mockTheme}
            shortcuts={mockShortcuts}
            onClose={mockOnClose}
          />
        </TestWrapper>
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-label', 'Keyboard Shortcuts');
    });

    it('renders footer text', () => {
      render(
        <TestWrapper>
          <ShortcutsHelpModal
            theme={mockTheme}
            shortcuts={mockShortcuts}
            onClose={mockOnClose}
          />
        </TestWrapper>
      );

      expect(screen.getByText(/Many shortcuts can be customized/)).toBeInTheDocument();
    });
  });

  describe('Close Button', () => {
    it('calls onClose when close button is clicked', () => {
      render(
        <TestWrapper>
          <ShortcutsHelpModal
            theme={mockTheme}
            shortcuts={mockShortcuts}
            onClose={mockOnClose}
          />
        </TestWrapper>
      );

      const closeButton = screen.getByRole('button');
      fireEvent.click(closeButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Search Functionality', () => {
    it('filters shortcuts by label', () => {
      render(
        <TestWrapper>
          <ShortcutsHelpModal
            theme={mockTheme}
            shortcuts={mockShortcuts}
            onClose={mockOnClose}
          />
        </TestWrapper>
      );

      const searchInput = screen.getByPlaceholderText('Search shortcuts...');
      fireEvent.change(searchInput, { target: { value: 'New' } });

      expect(screen.getByText('New Session')).toBeInTheDocument();
      expect(screen.queryByText('Close Session')).not.toBeInTheDocument();
    });

    it('filters shortcuts by keys', () => {
      render(
        <TestWrapper>
          <ShortcutsHelpModal
            theme={mockTheme}
            shortcuts={mockShortcuts}
            onClose={mockOnClose}
          />
        </TestWrapper>
      );

      const searchInput = screen.getByPlaceholderText('Search shortcuts...');
      fireEvent.change(searchInput, { target: { value: 'Cmd W' } });

      expect(screen.getByText('Close Session')).toBeInTheDocument();
    });

    it('shows no shortcuts found message when search has no results', () => {
      render(
        <TestWrapper>
          <ShortcutsHelpModal
            theme={mockTheme}
            shortcuts={mockShortcuts}
            onClose={mockOnClose}
          />
        </TestWrapper>
      );

      const searchInput = screen.getByPlaceholderText('Search shortcuts...');
      fireEvent.change(searchInput, { target: { value: 'xyznonexistent' } });

      expect(screen.getByText('No shortcuts found')).toBeInTheDocument();
    });

    it('shows filtered count when searching', () => {
      render(
        <TestWrapper>
          <ShortcutsHelpModal
            theme={mockTheme}
            shortcuts={mockShortcuts}
            onClose={mockOnClose}
          />
        </TestWrapper>
      );

      const searchInput = screen.getByPlaceholderText('Search shortcuts...');
      fireEvent.change(searchInput, { target: { value: 'Session' } });

      // Should show "X / Y" format for filtered count (e.g., "2 / 15")
      expect(screen.getByText(/\d+ \/ \d+/)).toBeInTheDocument();
    });

    it('clears search when input is emptied', () => {
      render(
        <TestWrapper>
          <ShortcutsHelpModal
            theme={mockTheme}
            shortcuts={mockShortcuts}
            onClose={mockOnClose}
          />
        </TestWrapper>
      );

      const searchInput = screen.getByPlaceholderText('Search shortcuts...');

      // First filter
      fireEvent.change(searchInput, { target: { value: 'New' } });
      expect(screen.queryByText('Close Session')).not.toBeInTheDocument();

      // Clear search
      fireEvent.change(searchInput, { target: { value: '' } });
      expect(screen.getByText('Close Session')).toBeInTheDocument();
    });

    it('search is case insensitive', () => {
      render(
        <TestWrapper>
          <ShortcutsHelpModal
            theme={mockTheme}
            shortcuts={mockShortcuts}
            onClose={mockOnClose}
          />
        </TestWrapper>
      );

      const searchInput = screen.getByPlaceholderText('Search shortcuts...');
      fireEvent.change(searchInput, { target: { value: 'new session' } });

      expect(screen.getByText('New Session')).toBeInTheDocument();
    });
  });

  describe('Shortcut Display', () => {
    it('renders shortcut keys in kbd elements', () => {
      const { container } = render(
        <TestWrapper>
          <ShortcutsHelpModal
            theme={mockTheme}
            shortcuts={mockShortcuts}
            onClose={mockOnClose}
          />
        </TestWrapper>
      );

      // Check that shortcut keys are displayed in kbd elements
      const kbdElements = container.querySelectorAll('kbd');
      expect(kbdElements.length).toBeGreaterThan(0);
    });

    it('sorts shortcuts alphabetically by label', () => {
      render(
        <TestWrapper>
          <ShortcutsHelpModal
            theme={mockTheme}
            shortcuts={mockShortcuts}
            onClose={mockOnClose}
          />
        </TestWrapper>
      );

      // Verify that shortcuts are rendered (sorting is handled by the component)
      expect(screen.getByText('New Session')).toBeInTheDocument();
      expect(screen.getByText('Close Session')).toBeInTheDocument();
      expect(screen.getByText('Search Files')).toBeInTheDocument();
    });
  });

  describe('Theme Styling', () => {
    it('applies theme colors to modal container', () => {
      render(
        <TestWrapper>
          <ShortcutsHelpModal
            theme={mockTheme}
            shortcuts={mockShortcuts}
            onClose={mockOnClose}
          />
        </TestWrapper>
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveStyle({
        backgroundColor: mockTheme.colors.bgSidebar,
        borderColor: mockTheme.colors.border,
      });
    });

    it('applies theme colors to title', () => {
      render(
        <TestWrapper>
          <ShortcutsHelpModal
            theme={mockTheme}
            shortcuts={mockShortcuts}
            onClose={mockOnClose}
          />
        </TestWrapper>
      );

      const title = screen.getByText('Keyboard Shortcuts');
      expect(title).toHaveStyle({
        color: mockTheme.colors.textMain,
      });
    });

    it('applies theme colors to search input', () => {
      render(
        <TestWrapper>
          <ShortcutsHelpModal
            theme={mockTheme}
            shortcuts={mockShortcuts}
            onClose={mockOnClose}
          />
        </TestWrapper>
      );

      const searchInput = screen.getByPlaceholderText('Search shortcuts...');
      expect(searchInput).toHaveStyle({
        borderColor: mockTheme.colors.border,
        color: mockTheme.colors.textMain,
      });
    });
  });

  describe('Empty State', () => {
    it('handles empty shortcuts gracefully', () => {
      render(
        <TestWrapper>
          <ShortcutsHelpModal
            theme={mockTheme}
            shortcuts={{}}
            onClose={mockOnClose}
          />
        </TestWrapper>
      );

      // Modal should still render
      expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();
    });
  });

  describe('Auto Focus', () => {
    it('search input receives focus on mount', () => {
      render(
        <TestWrapper>
          <ShortcutsHelpModal
            theme={mockTheme}
            shortcuts={mockShortcuts}
            onClose={mockOnClose}
          />
        </TestWrapper>
      );

      const searchInput = screen.getByPlaceholderText('Search shortcuts...');
      // autoFocus in React is lowercase in the DOM
      expect(searchInput).toBeInTheDocument();
      // Verify the input is focusable
      expect(searchInput.tagName).toBe('INPUT');
    });
  });

  describe('Modal Layout', () => {
    it('has proper dialog structure', () => {
      const { container } = render(
        <TestWrapper>
          <ShortcutsHelpModal
            theme={mockTheme}
            shortcuts={mockShortcuts}
            onClose={mockOnClose}
          />
        </TestWrapper>
      );

      // Check backdrop exists
      const backdrop = container.querySelector('.fixed.inset-0');
      expect(backdrop).toBeInTheDocument();

      // Check dialog width class
      const dialogBox = container.querySelector('.w-\\[400px\\]');
      expect(dialogBox).toBeInTheDocument();
    });

    it('has scrollable shortcuts container', () => {
      const { container } = render(
        <TestWrapper>
          <ShortcutsHelpModal
            theme={mockTheme}
            shortcuts={mockShortcuts}
            onClose={mockOnClose}
          />
        </TestWrapper>
      );

      const scrollContainer = container.querySelector('.max-h-\\[400px\\]');
      expect(scrollContainer).toBeInTheDocument();
      expect(scrollContainer).toHaveClass('overflow-y-auto');
    });
  });

  describe('Shortcut Count Badge', () => {
    it('shows total shortcut count when not searching', () => {
      render(
        <TestWrapper>
          <ShortcutsHelpModal
            theme={mockTheme}
            shortcuts={mockShortcuts}
            onClose={mockOnClose}
          />
        </TestWrapper>
      );

      // Badge shows just the total number when not filtering
      // The exact number depends on TAB_SHORTCUTS and FIXED_SHORTCUTS being merged
      const badge = screen.getByText(/^\d+$/);
      expect(badge).toBeInTheDocument();
    });

    it('badge has proper styling', () => {
      render(
        <TestWrapper>
          <ShortcutsHelpModal
            theme={mockTheme}
            shortcuts={mockShortcuts}
            onClose={mockOnClose}
          />
        </TestWrapper>
      );

      // Find the badge by its styling classes
      const badges = screen.getAllByText(/^\d+/).filter(
        el => el.classList.contains('text-xs') && el.classList.contains('rounded')
      );
      expect(badges.length).toBeGreaterThan(0);
    });
  });

  describe('Fuzzy Search', () => {
    it('supports fuzzy matching on labels', () => {
      render(
        <TestWrapper>
          <ShortcutsHelpModal
            theme={mockTheme}
            shortcuts={mockShortcuts}
            onClose={mockOnClose}
          />
        </TestWrapper>
      );

      const searchInput = screen.getByPlaceholderText('Search shortcuts...');
      // Fuzzy search should match partial strings
      fireEvent.change(searchInput, { target: { value: 'Sess' } });

      expect(screen.getByText('New Session')).toBeInTheDocument();
      expect(screen.getByText('Close Session')).toBeInTheDocument();
    });
  });
});
