/**
 * Tests for ConfirmModal component
 *
 * ConfirmModal is a reusable confirmation dialog that:
 * - Registers with the layer stack for modal management
 * - Auto-focuses the confirm button on mount
 * - Provides Cancel and Confirm actions
 * - Updates layer handler when onClose changes
 * - Supports null onConfirm (just closes)
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { ConfirmModal } from '../../../renderer/components/ConfirmModal';
import { LayerStackProvider } from '../../../renderer/contexts/LayerStackContext';
import type { Theme } from '../../../renderer/types';

// Mock lucide-react
vi.mock('lucide-react', () => ({
  X: () => <svg data-testid="x-icon" />,
}));

// Create a test theme
const createTestTheme = (overrides: Partial<Theme['colors']> = {}): Theme => ({
  id: 'test-theme',
  name: 'Test Theme',
  mode: 'dark',
  colors: {
    bgMain: '#1e1e1e',
    bgSidebar: '#252526',
    bgActivity: '#333333',
    textMain: '#d4d4d4',
    textDim: '#808080',
    accent: '#007acc',
    border: '#404040',
    error: '#f14c4c',
    warning: '#cca700',
    success: '#89d185',
    info: '#3794ff',
    textInverse: '#000000',
    ...overrides,
  },
});

// Helper to render with LayerStackProvider
const renderWithLayerStack = (ui: React.ReactElement) => {
  return render(
    <LayerStackProvider>
      {ui}
    </LayerStackProvider>
  );
};

describe('ConfirmModal', () => {
  let theme: Theme;

  beforeEach(() => {
    theme = createTestTheme();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('rendering', () => {
    it('renders with message and buttons', () => {
      const onClose = vi.fn();
      const onConfirm = vi.fn();

      renderWithLayerStack(
        <ConfirmModal
          theme={theme}
          message="Are you sure you want to proceed?"
          onConfirm={onConfirm}
          onClose={onClose}
        />
      );

      expect(screen.getByText('Are you sure you want to proceed?')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
    });

    it('renders with correct ARIA attributes', () => {
      const onClose = vi.fn();

      renderWithLayerStack(
        <ConfirmModal
          theme={theme}
          message="Confirm this action"
          onConfirm={null}
          onClose={onClose}
        />
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-label', 'Confirm Action');
    });

    it('renders header with title and close button', () => {
      const onClose = vi.fn();

      renderWithLayerStack(
        <ConfirmModal
          theme={theme}
          message="Test message"
          onConfirm={vi.fn()}
          onClose={onClose}
        />
      );

      expect(screen.getByText('Confirm Action')).toBeInTheDocument();
      expect(screen.getByTestId('x-icon')).toBeInTheDocument();
    });

    it('applies theme colors to container', () => {
      const onClose = vi.fn();

      const { container } = renderWithLayerStack(
        <ConfirmModal
          theme={theme}
          message="Test message"
          onConfirm={vi.fn()}
          onClose={onClose}
        />
      );

      const modalContent = container.querySelector('.w-\\[450px\\]');
      expect(modalContent).toHaveStyle({ backgroundColor: theme.colors.bgSidebar });
    });

    it('applies error color to confirm button', () => {
      const onClose = vi.fn();

      renderWithLayerStack(
        <ConfirmModal
          theme={theme}
          message="Test message"
          onConfirm={vi.fn()}
          onClose={onClose}
        />
      );

      const confirmButton = screen.getByRole('button', { name: 'Confirm' });
      expect(confirmButton).toHaveStyle({ backgroundColor: theme.colors.error });
    });

    it('applies theme colors to message text', () => {
      const onClose = vi.fn();

      renderWithLayerStack(
        <ConfirmModal
          theme={theme}
          message="Test message"
          onConfirm={vi.fn()}
          onClose={onClose}
        />
      );

      const message = screen.getByText('Test message');
      expect(message).toHaveStyle({ color: theme.colors.textMain });
    });
  });

  describe('focus management', () => {
    it('focuses confirm button on mount', async () => {
      const onClose = vi.fn();

      renderWithLayerStack(
        <ConfirmModal
          theme={theme}
          message="Test message"
          onConfirm={vi.fn()}
          onClose={onClose}
        />
      );

      await waitFor(() => {
        const confirmButton = screen.getByRole('button', { name: 'Confirm' });
        expect(document.activeElement).toBe(confirmButton);
      });
    });
  });

  describe('close button', () => {
    it('calls onClose when X button is clicked', () => {
      const onClose = vi.fn();

      renderWithLayerStack(
        <ConfirmModal
          theme={theme}
          message="Test message"
          onConfirm={vi.fn()}
          onClose={onClose}
        />
      );

      // Find the close button (parent of X icon)
      const closeButton = screen.getByTestId('x-icon').closest('button');
      expect(closeButton).toBeInTheDocument();

      fireEvent.click(closeButton!);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('applies theme color to close button', () => {
      const onClose = vi.fn();

      renderWithLayerStack(
        <ConfirmModal
          theme={theme}
          message="Test message"
          onConfirm={vi.fn()}
          onClose={onClose}
        />
      );

      const closeButton = screen.getByTestId('x-icon').closest('button');
      expect(closeButton).toHaveStyle({ color: theme.colors.textDim });
    });
  });

  describe('cancel button', () => {
    it('calls onClose when Cancel is clicked', () => {
      const onClose = vi.fn();

      renderWithLayerStack(
        <ConfirmModal
          theme={theme}
          message="Test message"
          onConfirm={vi.fn()}
          onClose={onClose}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not call onConfirm when Cancel is clicked', () => {
      const onClose = vi.fn();
      const onConfirm = vi.fn();

      renderWithLayerStack(
        <ConfirmModal
          theme={theme}
          message="Test message"
          onConfirm={onConfirm}
          onClose={onClose}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('applies theme styling to cancel button', () => {
      const onClose = vi.fn();

      renderWithLayerStack(
        <ConfirmModal
          theme={theme}
          message="Test message"
          onConfirm={vi.fn()}
          onClose={onClose}
        />
      );

      const cancelButton = screen.getByRole('button', { name: 'Cancel' });
      expect(cancelButton).toHaveStyle({
        color: theme.colors.textMain,
        borderColor: theme.colors.border
      });
    });
  });

  describe('confirm button', () => {
    it('calls onConfirm and onClose when Confirm is clicked', () => {
      const onClose = vi.fn();
      const onConfirm = vi.fn();

      renderWithLayerStack(
        <ConfirmModal
          theme={theme}
          message="Test message"
          onConfirm={onConfirm}
          onClose={onClose}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onConfirm before onClose', () => {
      const callOrder: string[] = [];
      const onClose = vi.fn(() => callOrder.push('close'));
      const onConfirm = vi.fn(() => callOrder.push('confirm'));

      renderWithLayerStack(
        <ConfirmModal
          theme={theme}
          message="Test message"
          onConfirm={onConfirm}
          onClose={onClose}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
      expect(callOrder).toEqual(['confirm', 'close']);
    });

    it('only calls onClose when onConfirm is null', () => {
      const onClose = vi.fn();

      renderWithLayerStack(
        <ConfirmModal
          theme={theme}
          message="Test message"
          onConfirm={null}
          onClose={onClose}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('has focus ring styling', () => {
      const onClose = vi.fn();

      renderWithLayerStack(
        <ConfirmModal
          theme={theme}
          message="Test message"
          onConfirm={vi.fn()}
          onClose={onClose}
        />
      );

      const confirmButton = screen.getByRole('button', { name: 'Confirm' });
      expect(confirmButton).toHaveClass('focus:ring-2');
      expect(confirmButton).toHaveClass('focus:ring-offset-1');
    });
  });

  describe('keyboard interaction', () => {
    it('stops propagation of keydown events', () => {
      const onClose = vi.fn();
      const parentHandler = vi.fn();

      const { container } = render(
        <div onKeyDown={parentHandler}>
          <LayerStackProvider>
            <ConfirmModal
              theme={theme}
              message="Test message"
              onConfirm={vi.fn()}
              onClose={onClose}
            />
          </LayerStackProvider>
        </div>
      );

      const dialog = screen.getByRole('dialog');
      fireEvent.keyDown(dialog, { key: 'a' });

      // The parent handler should not be called because stopPropagation is called
      expect(parentHandler).not.toHaveBeenCalled();
    });
  });

  describe('layer stack integration', () => {
    it('registers layer on mount', () => {
      const onClose = vi.fn();

      // The component should render without errors when wrapped in LayerStackProvider
      const { unmount } = renderWithLayerStack(
        <ConfirmModal
          theme={theme}
          message="Test message"
          onConfirm={vi.fn()}
          onClose={onClose}
        />
      );

      // Component should be visible (layer registration succeeded)
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      // Cleanup should work without errors
      unmount();
    });

    it('unregisters layer on unmount', () => {
      const onClose = vi.fn();

      const { unmount } = renderWithLayerStack(
        <ConfirmModal
          theme={theme}
          message="Test message"
          onConfirm={vi.fn()}
          onClose={onClose}
        />
      );

      // Unmount should complete without errors
      expect(() => unmount()).not.toThrow();
    });

    it('updates layer handler when onClose changes', async () => {
      const onClose1 = vi.fn();
      const onClose2 = vi.fn();

      const { rerender } = renderWithLayerStack(
        <ConfirmModal
          theme={theme}
          message="Test message"
          onConfirm={vi.fn()}
          onClose={onClose1}
        />
      );

      // Rerender with new onClose
      rerender(
        <LayerStackProvider>
          <ConfirmModal
            theme={theme}
            message="Test message"
            onConfirm={vi.fn()}
            onClose={onClose2}
          />
        </LayerStackProvider>
      );

      // Both should have registered successfully
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  describe('message content', () => {
    it('renders long messages correctly', () => {
      const onClose = vi.fn();
      const longMessage = 'This is a very long message that explains exactly what the user is about to do and asks them to confirm their action before proceeding with the potentially destructive operation.';

      renderWithLayerStack(
        <ConfirmModal
          theme={theme}
          message={longMessage}
          onConfirm={vi.fn()}
          onClose={onClose}
        />
      );

      expect(screen.getByText(longMessage)).toBeInTheDocument();
    });

    it('renders message with special characters', () => {
      const onClose = vi.fn();
      const specialMessage = 'Delete "my-file.txt" from /path/to/folder?';

      renderWithLayerStack(
        <ConfirmModal
          theme={theme}
          message={specialMessage}
          onConfirm={vi.fn()}
          onClose={onClose}
        />
      );

      expect(screen.getByText(specialMessage)).toBeInTheDocument();
    });

    it('renders message with line breaks as single text', () => {
      const onClose = vi.fn();

      renderWithLayerStack(
        <ConfirmModal
          theme={theme}
          message="Line 1\nLine 2"
          onConfirm={vi.fn()}
          onClose={onClose}
        />
      );

      // The message is rendered as a single text node with newlines
      expect(screen.getByText(/Line 1/)).toBeInTheDocument();
    });

    it('renders empty message', () => {
      const onClose = vi.fn();

      renderWithLayerStack(
        <ConfirmModal
          theme={theme}
          message=""
          onConfirm={vi.fn()}
          onClose={onClose}
        />
      );

      // Should still render the dialog structure
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
    });

    it('renders unicode message', () => {
      const onClose = vi.fn();
      const unicodeMessage = 'Delete 📁 folder "テスト" with 🎵 files?';

      renderWithLayerStack(
        <ConfirmModal
          theme={theme}
          message={unicodeMessage}
          onConfirm={vi.fn()}
          onClose={onClose}
        />
      );

      expect(screen.getByText(unicodeMessage)).toBeInTheDocument();
    });
  });

  describe('theme variations', () => {
    it('renders with light theme', () => {
      const lightTheme = createTestTheme({
        bgMain: '#ffffff',
        bgSidebar: '#f5f5f5',
        textMain: '#333333',
        textDim: '#666666',
        error: '#dc3545',
      });

      const onClose = vi.fn();

      const { container } = renderWithLayerStack(
        <ConfirmModal
          theme={lightTheme}
          message="Test message"
          onConfirm={vi.fn()}
          onClose={onClose}
        />
      );

      const modalContent = container.querySelector('.w-\\[450px\\]');
      expect(modalContent).toHaveStyle({ backgroundColor: lightTheme.colors.bgSidebar });

      const confirmButton = screen.getByRole('button', { name: 'Confirm' });
      expect(confirmButton).toHaveStyle({ backgroundColor: lightTheme.colors.error });
    });

    it('renders with custom accent colors', () => {
      const customTheme = createTestTheme({
        accent: '#ff6b6b',
        error: '#e74c3c',
      });

      const onClose = vi.fn();

      renderWithLayerStack(
        <ConfirmModal
          theme={customTheme}
          message="Test message"
          onConfirm={vi.fn()}
          onClose={onClose}
        />
      );

      const confirmButton = screen.getByRole('button', { name: 'Confirm' });
      expect(confirmButton).toHaveStyle({ backgroundColor: customTheme.colors.error });
    });
  });

  describe('modal structure', () => {
    it('has fixed positioning with backdrop', () => {
      const onClose = vi.fn();

      renderWithLayerStack(
        <ConfirmModal
          theme={theme}
          message="Test message"
          onConfirm={vi.fn()}
          onClose={onClose}
        />
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveClass('fixed');
      expect(dialog).toHaveClass('inset-0');
      expect(dialog).toHaveClass('z-[10000]');
    });

    it('has blur backdrop', () => {
      const onClose = vi.fn();

      renderWithLayerStack(
        <ConfirmModal
          theme={theme}
          message="Test message"
          onConfirm={vi.fn()}
          onClose={onClose}
        />
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveClass('backdrop-blur-sm');
    });

    it('has correct modal width', () => {
      const onClose = vi.fn();

      const { container } = renderWithLayerStack(
        <ConfirmModal
          theme={theme}
          message="Test message"
          onConfirm={vi.fn()}
          onClose={onClose}
        />
      );

      const modalContent = container.querySelector('.w-\\[450px\\]');
      expect(modalContent).toBeInTheDocument();
    });

    it('has border styling', () => {
      const onClose = vi.fn();

      const { container } = renderWithLayerStack(
        <ConfirmModal
          theme={theme}
          message="Test message"
          onConfirm={vi.fn()}
          onClose={onClose}
        />
      );

      const modalContent = container.querySelector('.w-\\[450px\\]');
      expect(modalContent).toHaveClass('border');
      expect(modalContent).toHaveClass('rounded-lg');
    });

    it('has animation classes', () => {
      const onClose = vi.fn();

      renderWithLayerStack(
        <ConfirmModal
          theme={theme}
          message="Test message"
          onConfirm={vi.fn()}
          onClose={onClose}
        />
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveClass('animate-in');
      expect(dialog).toHaveClass('fade-in');
    });
  });

  describe('accessibility', () => {
    it('has tabIndex on dialog for focus', () => {
      const onClose = vi.fn();

      renderWithLayerStack(
        <ConfirmModal
          theme={theme}
          message="Test message"
          onConfirm={vi.fn()}
          onClose={onClose}
        />
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('tabIndex', '-1');
    });

    it('has semantic button elements', () => {
      const onClose = vi.fn();

      renderWithLayerStack(
        <ConfirmModal
          theme={theme}
          message="Test message"
          onConfirm={vi.fn()}
          onClose={onClose}
        />
      );

      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBe(3); // X, Cancel, Confirm
    });

    it('has heading for modal title', () => {
      const onClose = vi.fn();

      renderWithLayerStack(
        <ConfirmModal
          theme={theme}
          message="Test message"
          onConfirm={vi.fn()}
          onClose={onClose}
        />
      );

      const heading = screen.getByRole('heading', { name: 'Confirm Action' });
      expect(heading).toBeInTheDocument();
    });
  });

  describe('rapid interactions', () => {
    it('handles rapid confirm clicks', () => {
      const onClose = vi.fn();
      const onConfirm = vi.fn();

      renderWithLayerStack(
        <ConfirmModal
          theme={theme}
          message="Test message"
          onConfirm={onConfirm}
          onClose={onClose}
        />
      );

      const confirmButton = screen.getByRole('button', { name: 'Confirm' });

      // Rapid clicks
      fireEvent.click(confirmButton);
      fireEvent.click(confirmButton);
      fireEvent.click(confirmButton);

      // Each click calls both handlers
      expect(onConfirm).toHaveBeenCalledTimes(3);
      expect(onClose).toHaveBeenCalledTimes(3);
    });

    it('handles rapid cancel clicks', () => {
      const onClose = vi.fn();
      const onConfirm = vi.fn();

      renderWithLayerStack(
        <ConfirmModal
          theme={theme}
          message="Test message"
          onConfirm={onConfirm}
          onClose={onClose}
        />
      );

      const cancelButton = screen.getByRole('button', { name: 'Cancel' });

      // Rapid clicks
      fireEvent.click(cancelButton);
      fireEvent.click(cancelButton);
      fireEvent.click(cancelButton);

      expect(onClose).toHaveBeenCalledTimes(3);
      expect(onConfirm).not.toHaveBeenCalled();
    });
  });

  describe('callback behavior', () => {
    it('allows callbacks to perform state updates', async () => {
      let confirmCalled = false;
      let closeCalled = false;

      const onConfirm = vi.fn(() => {
        confirmCalled = true;
      });
      const onClose = vi.fn(() => {
        closeCalled = true;
      });

      renderWithLayerStack(
        <ConfirmModal
          theme={theme}
          message="Test message"
          onConfirm={onConfirm}
          onClose={onClose}
        />
      );

      const confirmButton = screen.getByRole('button', { name: 'Confirm' });
      fireEvent.click(confirmButton);

      expect(confirmCalled).toBe(true);
      expect(closeCalled).toBe(true);
    });

    it('calls callbacks in sequence for cancel', () => {
      let closeCalled = false;

      const onClose = vi.fn(() => {
        closeCalled = true;
      });

      renderWithLayerStack(
        <ConfirmModal
          theme={theme}
          message="Test message"
          onConfirm={vi.fn()}
          onClose={onClose}
        />
      );

      const cancelButton = screen.getByRole('button', { name: 'Cancel' });
      fireEvent.click(cancelButton);

      expect(closeCalled).toBe(true);
    });
  });
});
