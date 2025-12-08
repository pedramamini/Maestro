/**
 * Tests for Toast.tsx
 *
 * Tests the ToastContainer and ToastItem components, including:
 * - formatDuration helper function
 * - Toast type icons and colors
 * - Animation states (entering/exiting)
 * - Click handling for session navigation
 * - Close button functionality
 * - Progress bar rendering
 * - Group/project/tab display
 * - Duration badge
 * - Empty state handling
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { ToastContainer } from '../../../renderer/components/Toast';
import type { Theme } from '../../../renderer/types';
import * as ToastContext from '../../../renderer/contexts/ToastContext';

// Mock the ToastContext
vi.mock('../../../renderer/contexts/ToastContext', () => ({
  useToast: vi.fn(),
}));

// Sample theme for testing
const mockTheme: Theme = {
  id: 'dracula',
  name: 'Dracula',
  mode: 'dark',
  colors: {
    bgMain: '#282a36',
    bgSidebar: '#21222c',
    bgActivity: '#343746',
    border: '#44475a',
    textMain: '#f8f8f2',
    textDim: '#6272a4',
    accent: '#bd93f9',
    accentDim: '#bd93f920',
    accentText: '#f8f8f2',
    success: '#50fa7b',
    warning: '#ffb86c',
    error: '#ff5555',
  },
};

// Helper to create mock toasts
const createMockToast = (overrides = {}): ToastContext.Toast => ({
  id: 'toast-1',
  type: 'info',
  title: 'Test Toast',
  message: 'This is a test message',
  timestamp: Date.now(),
  duration: 5000,
  ...overrides,
});

describe('Toast', () => {
  let mockUseToast: ReturnType<typeof vi.fn>;
  let mockRemoveToast: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockRemoveToast = vi.fn();
    mockUseToast = vi.mocked(ToastContext.useToast);
    mockUseToast.mockReturnValue({
      toasts: [],
      addToast: vi.fn(),
      removeToast: mockRemoveToast,
      clearToasts: vi.fn(),
      setDefaultDuration: vi.fn(),
      setAudioFeedback: vi.fn(),
      setOsNotifications: vi.fn(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('ToastContainer', () => {
    describe('empty state', () => {
      it('should return null when no toasts', () => {
        const { container } = render(<ToastContainer theme={mockTheme} />);
        expect(container.firstChild).toBeNull();
      });
    });

    describe('rendering toasts', () => {
      it('should render toast container when toasts exist', () => {
        mockUseToast.mockReturnValue({
          toasts: [createMockToast()],
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        render(<ToastContainer theme={mockTheme} />);
        expect(screen.getByText('Test Toast')).toBeInTheDocument();
        expect(screen.getByText('This is a test message')).toBeInTheDocument();
      });

      it('should render multiple toasts', () => {
        mockUseToast.mockReturnValue({
          toasts: [
            createMockToast({ id: 'toast-1', title: 'First Toast' }),
            createMockToast({ id: 'toast-2', title: 'Second Toast' }),
            createMockToast({ id: 'toast-3', title: 'Third Toast' }),
          ],
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        render(<ToastContainer theme={mockTheme} />);
        expect(screen.getByText('First Toast')).toBeInTheDocument();
        expect(screen.getByText('Second Toast')).toBeInTheDocument();
        expect(screen.getByText('Third Toast')).toBeInTheDocument();
      });

      it('should have correct container positioning', () => {
        mockUseToast.mockReturnValue({
          toasts: [createMockToast()],
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        const { container } = render(<ToastContainer theme={mockTheme} />);
        const outerDiv = container.firstChild as HTMLElement;
        expect(outerDiv).toHaveClass('fixed', 'bottom-4', 'right-4', 'z-50');
      });
    });

    describe('toast types and icons', () => {
      it('should render success toast with checkmark icon', () => {
        mockUseToast.mockReturnValue({
          toasts: [createMockToast({ type: 'success' })],
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        const { container } = render(<ToastContainer theme={mockTheme} />);
        // Success icon has checkmark path
        const svg = container.querySelector('svg path[d="M5 13l4 4L19 7"]');
        expect(svg).toBeInTheDocument();
      });

      it('should render error toast with X icon', () => {
        mockUseToast.mockReturnValue({
          toasts: [createMockToast({ type: 'error' })],
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        const { container } = render(<ToastContainer theme={mockTheme} />);
        // Error icon has X paths
        const svg = container.querySelector('svg path[d="M6 18L18 6M6 6l12 12"]');
        expect(svg).toBeInTheDocument();
      });

      it('should render warning toast with triangle icon', () => {
        mockUseToast.mockReturnValue({
          toasts: [createMockToast({ type: 'warning' })],
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        const { container } = render(<ToastContainer theme={mockTheme} />);
        // Warning icon has triangle path
        const svg = container.querySelector('svg path[d*="M12 9v2m0 4h.01"]');
        expect(svg).toBeInTheDocument();
      });

      it('should render info toast with info circle icon', () => {
        mockUseToast.mockReturnValue({
          toasts: [createMockToast({ type: 'info' })],
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        const { container } = render(<ToastContainer theme={mockTheme} />);
        // Info icon has info circle path
        const svg = container.querySelector('svg path[d*="M13 16h-1v-4h-1m1-4h.01"]');
        expect(svg).toBeInTheDocument();
      });

      it('should apply success color for success type', () => {
        mockUseToast.mockReturnValue({
          toasts: [createMockToast({ type: 'success' })],
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        const { container } = render(<ToastContainer theme={mockTheme} />);
        const iconContainer = container.querySelector('.flex-shrink-0.p-1.rounded');
        expect(iconContainer).toHaveStyle({ color: mockTheme.colors.success });
      });

      it('should apply error color for error type', () => {
        mockUseToast.mockReturnValue({
          toasts: [createMockToast({ type: 'error' })],
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        const { container } = render(<ToastContainer theme={mockTheme} />);
        const iconContainer = container.querySelector('.flex-shrink-0.p-1.rounded');
        expect(iconContainer).toHaveStyle({ color: mockTheme.colors.error });
      });

      it('should apply warning color for warning type', () => {
        mockUseToast.mockReturnValue({
          toasts: [createMockToast({ type: 'warning' })],
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        const { container } = render(<ToastContainer theme={mockTheme} />);
        const iconContainer = container.querySelector('.flex-shrink-0.p-1.rounded');
        expect(iconContainer).toHaveStyle({ color: mockTheme.colors.warning });
      });

      it('should apply accent color for info type', () => {
        mockUseToast.mockReturnValue({
          toasts: [createMockToast({ type: 'info' })],
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        const { container } = render(<ToastContainer theme={mockTheme} />);
        const iconContainer = container.querySelector('.flex-shrink-0.p-1.rounded');
        expect(iconContainer).toHaveStyle({ color: mockTheme.colors.accent });
      });
    });

    describe('toast metadata display', () => {
      it('should display group badge when provided', () => {
        mockUseToast.mockReturnValue({
          toasts: [createMockToast({ group: 'Test Group' })],
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        render(<ToastContainer theme={mockTheme} />);
        expect(screen.getByText('Test Group')).toBeInTheDocument();
      });

      it('should display project name when provided', () => {
        mockUseToast.mockReturnValue({
          toasts: [createMockToast({ project: 'My Project' })],
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        render(<ToastContainer theme={mockTheme} />);
        expect(screen.getByText('My Project')).toBeInTheDocument();
      });

      it('should display tab name when provided', () => {
        mockUseToast.mockReturnValue({
          toasts: [createMockToast({ tabName: 'Tab 1' })],
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        render(<ToastContainer theme={mockTheme} />);
        expect(screen.getByText('Tab 1')).toBeInTheDocument();
      });

      it('should display all metadata together', () => {
        mockUseToast.mockReturnValue({
          toasts: [createMockToast({
            group: 'Test Group',
            project: 'My Project',
            tabName: 'Tab 1',
          })],
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        render(<ToastContainer theme={mockTheme} />);
        expect(screen.getByText('Test Group')).toBeInTheDocument();
        expect(screen.getByText('My Project')).toBeInTheDocument();
        expect(screen.getByText('Tab 1')).toBeInTheDocument();
      });

      it('should show claudeSessionId as title attribute on tab name', () => {
        mockUseToast.mockReturnValue({
          toasts: [createMockToast({
            tabName: 'Tab 1',
            claudeSessionId: 'abc-123-def',
          })],
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        render(<ToastContainer theme={mockTheme} />);
        const tabNameElement = screen.getByText('Tab 1');
        expect(tabNameElement).toHaveAttribute('title', 'Claude Session: abc-123-def');
      });

      it('should not show title attribute when claudeSessionId is not provided', () => {
        mockUseToast.mockReturnValue({
          toasts: [createMockToast({ tabName: 'Tab 1' })],
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        render(<ToastContainer theme={mockTheme} />);
        const tabNameElement = screen.getByText('Tab 1');
        expect(tabNameElement).not.toHaveAttribute('title');
      });
    });

    describe('duration badge', () => {
      it('should display duration badge when taskDuration is provided', () => {
        mockUseToast.mockReturnValue({
          toasts: [createMockToast({ taskDuration: 5000 })],
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        render(<ToastContainer theme={mockTheme} />);
        expect(screen.getByText(/Completed in 5s/)).toBeInTheDocument();
      });

      it('should format duration in milliseconds for very short tasks', () => {
        mockUseToast.mockReturnValue({
          toasts: [createMockToast({ taskDuration: 500 })],
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        render(<ToastContainer theme={mockTheme} />);
        expect(screen.getByText(/Completed in 500ms/)).toBeInTheDocument();
      });

      it('should format duration in minutes and seconds for longer tasks', () => {
        mockUseToast.mockReturnValue({
          toasts: [createMockToast({ taskDuration: 125000 })], // 2m 5s
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        render(<ToastContainer theme={mockTheme} />);
        expect(screen.getByText(/Completed in 2m 5s/)).toBeInTheDocument();
      });

      it('should format duration in minutes only when seconds are 0', () => {
        mockUseToast.mockReturnValue({
          toasts: [createMockToast({ taskDuration: 120000 })], // 2m exactly
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        render(<ToastContainer theme={mockTheme} />);
        expect(screen.getByText(/Completed in 2m$/)).toBeInTheDocument();
      });

      it('should not display duration badge when taskDuration is 0', () => {
        mockUseToast.mockReturnValue({
          toasts: [createMockToast({ taskDuration: 0 })],
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        render(<ToastContainer theme={mockTheme} />);
        expect(screen.queryByText(/Completed in/)).not.toBeInTheDocument();
      });

      it('should not display duration badge when taskDuration is not provided', () => {
        mockUseToast.mockReturnValue({
          toasts: [createMockToast()],
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        render(<ToastContainer theme={mockTheme} />);
        expect(screen.queryByText(/Completed in/)).not.toBeInTheDocument();
      });
    });

    describe('close button', () => {
      it('should call removeToast when close button is clicked', async () => {
        mockUseToast.mockReturnValue({
          toasts: [createMockToast()],
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        render(<ToastContainer theme={mockTheme} />);

        // Find close button (the one with the X path inside the toast)
        const closeButtons = screen.getAllByRole('button');
        const closeButton = closeButtons[0]; // First button in the toast

        fireEvent.click(closeButton);

        // Wait for exit animation (300ms)
        act(() => {
          vi.advanceTimersByTime(300);
        });

        expect(mockRemoveToast).toHaveBeenCalledWith('toast-1');
      });

      it('should stop propagation when close button is clicked', () => {
        const onSessionClick = vi.fn();
        mockUseToast.mockReturnValue({
          toasts: [createMockToast({ sessionId: 'session-1' })],
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        render(<ToastContainer theme={mockTheme} onSessionClick={onSessionClick} />);

        const closeButtons = screen.getAllByRole('button');
        const closeButton = closeButtons[0];

        fireEvent.click(closeButton);

        // Session click should not be called because propagation was stopped
        expect(onSessionClick).not.toHaveBeenCalled();
      });
    });

    describe('session navigation (clickable toasts)', () => {
      it('should be clickable when sessionId is provided and onSessionClick is passed', () => {
        const onSessionClick = vi.fn();
        mockUseToast.mockReturnValue({
          toasts: [createMockToast({ sessionId: 'session-1' })],
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        const { container } = render(<ToastContainer theme={mockTheme} onSessionClick={onSessionClick} />);

        // Clickable toast should have cursor-pointer class
        const toastContent = container.querySelector('.cursor-pointer');
        expect(toastContent).toBeInTheDocument();
      });

      it('should not be clickable when sessionId is not provided', () => {
        const onSessionClick = vi.fn();
        mockUseToast.mockReturnValue({
          toasts: [createMockToast()], // No sessionId
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        const { container } = render(<ToastContainer theme={mockTheme} onSessionClick={onSessionClick} />);

        // Non-clickable toast should not have cursor-pointer class
        const toastContent = container.querySelector('.cursor-pointer');
        expect(toastContent).not.toBeInTheDocument();
      });

      it('should not be clickable when onSessionClick is not provided', () => {
        mockUseToast.mockReturnValue({
          toasts: [createMockToast({ sessionId: 'session-1' })],
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        const { container } = render(<ToastContainer theme={mockTheme} />);

        // Non-clickable toast should not have cursor-pointer class
        const toastContent = container.querySelector('.cursor-pointer');
        expect(toastContent).not.toBeInTheDocument();
      });

      it('should call onSessionClick with sessionId when clicked', () => {
        const onSessionClick = vi.fn();
        mockUseToast.mockReturnValue({
          toasts: [createMockToast({ sessionId: 'session-1' })],
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        const { container } = render(<ToastContainer theme={mockTheme} onSessionClick={onSessionClick} />);

        const clickableToast = container.querySelector('.cursor-pointer');
        fireEvent.click(clickableToast!);

        expect(onSessionClick).toHaveBeenCalledWith('session-1', undefined);
      });

      it('should call onSessionClick with sessionId and tabId when clicked', () => {
        const onSessionClick = vi.fn();
        mockUseToast.mockReturnValue({
          toasts: [createMockToast({ sessionId: 'session-1', tabId: 'tab-1' })],
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        const { container } = render(<ToastContainer theme={mockTheme} onSessionClick={onSessionClick} />);

        const clickableToast = container.querySelector('.cursor-pointer');
        fireEvent.click(clickableToast!);

        expect(onSessionClick).toHaveBeenCalledWith('session-1', 'tab-1');
      });

      it('should close toast after navigation', () => {
        const onSessionClick = vi.fn();
        mockUseToast.mockReturnValue({
          toasts: [createMockToast({ sessionId: 'session-1' })],
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        const { container } = render(<ToastContainer theme={mockTheme} onSessionClick={onSessionClick} />);

        const clickableToast = container.querySelector('.cursor-pointer');
        fireEvent.click(clickableToast!);

        // Wait for exit animation (300ms)
        act(() => {
          vi.advanceTimersByTime(300);
        });

        expect(mockRemoveToast).toHaveBeenCalledWith('toast-1');
      });
    });

    describe('animation states', () => {
      it('should start with entering animation', () => {
        mockUseToast.mockReturnValue({
          toasts: [createMockToast()],
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        const { container } = render(<ToastContainer theme={mockTheme} />);

        // Initially should have entering state (translateX 100%)
        const toastOuter = container.querySelector('.relative.overflow-hidden');
        expect(toastOuter).toHaveStyle({ transform: 'translateX(100%)' });
      });

      it('should transition to normal state after enter animation', () => {
        mockUseToast.mockReturnValue({
          toasts: [createMockToast()],
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        const { container } = render(<ToastContainer theme={mockTheme} />);

        // Advance timer past enter animation (50ms)
        act(() => {
          vi.advanceTimersByTime(50);
        });

        const toastOuter = container.querySelector('.relative.overflow-hidden');
        expect(toastOuter).toHaveStyle({ transform: 'translateX(0)' });
      });

      it('should start exit animation before removal', () => {
        mockUseToast.mockReturnValue({
          toasts: [createMockToast({ duration: 5000 })],
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        const { container } = render(<ToastContainer theme={mockTheme} />);

        // Advance past enter animation
        act(() => {
          vi.advanceTimersByTime(50);
        });

        // Advance to 300ms before duration ends (exit animation starts)
        act(() => {
          vi.advanceTimersByTime(5000 - 300 - 50);
        });

        const toastOuter = container.querySelector('.relative.overflow-hidden');
        expect(toastOuter).toHaveStyle({ transform: 'translateX(100%)' });
      });
    });

    describe('progress bar', () => {
      it('should render progress bar when duration is provided', () => {
        mockUseToast.mockReturnValue({
          toasts: [createMockToast({ duration: 5000 })],
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        const { container } = render(<ToastContainer theme={mockTheme} />);

        // Progress bar has h-1 class and shrink animation
        const progressBar = container.querySelector('.h-1.rounded-b-lg');
        expect(progressBar).toBeInTheDocument();
      });

      it('should not render progress bar when duration is 0', () => {
        mockUseToast.mockReturnValue({
          toasts: [createMockToast({ duration: 0 })],
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        const { container } = render(<ToastContainer theme={mockTheme} />);

        const progressBar = container.querySelector('.h-1.rounded-b-lg');
        expect(progressBar).not.toBeInTheDocument();
      });

      it('should apply correct color based on toast type', () => {
        mockUseToast.mockReturnValue({
          toasts: [createMockToast({ type: 'success', duration: 5000 })],
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        const { container } = render(<ToastContainer theme={mockTheme} />);

        const progressBar = container.querySelector('.h-1.rounded-b-lg');
        expect(progressBar).toHaveStyle({ backgroundColor: mockTheme.colors.success });
      });

      it('should include shrink animation keyframes', () => {
        mockUseToast.mockReturnValue({
          toasts: [createMockToast({ duration: 5000 })],
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        const { container } = render(<ToastContainer theme={mockTheme} />);

        // Check for style element with keyframes
        const styleElement = container.querySelector('style');
        expect(styleElement?.textContent).toContain('@keyframes shrink');
        expect(styleElement?.textContent).toContain('width: 100%');
        expect(styleElement?.textContent).toContain('width: 0%');
      });
    });

    describe('styling', () => {
      it('should apply theme colors to toast container', () => {
        mockUseToast.mockReturnValue({
          toasts: [createMockToast()],
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        const { container } = render(<ToastContainer theme={mockTheme} />);

        const toastContent = container.querySelector('.flex.items-start.gap-3');
        expect(toastContent).toHaveStyle({
          backgroundColor: mockTheme.colors.bgSidebar,
        });
      });

      it('should apply theme border color', () => {
        mockUseToast.mockReturnValue({
          toasts: [createMockToast()],
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        const { container } = render(<ToastContainer theme={mockTheme} />);

        const toastContent = container.querySelector('.flex.items-start.gap-3');
        // Border is set via inline style, verify the element has border styling
        expect(toastContent).toHaveAttribute('style');
        const style = toastContent?.getAttribute('style') || '';
        expect(style).toContain('border:');
        expect(style).toContain('1px solid');
      });

      it('should apply correct text colors for title', () => {
        mockUseToast.mockReturnValue({
          toasts: [createMockToast()],
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        render(<ToastContainer theme={mockTheme} />);

        const title = screen.getByText('Test Toast');
        expect(title).toHaveStyle({ color: mockTheme.colors.textMain });
      });

      it('should apply correct text colors for message', () => {
        mockUseToast.mockReturnValue({
          toasts: [createMockToast()],
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        render(<ToastContainer theme={mockTheme} />);

        const message = screen.getByText('This is a test message');
        expect(message).toHaveStyle({ color: mockTheme.colors.textDim });
      });

      it('should have min and max width constraints', () => {
        mockUseToast.mockReturnValue({
          toasts: [createMockToast()],
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        const { container } = render(<ToastContainer theme={mockTheme} />);

        const toastContent = container.querySelector('.flex.items-start.gap-3');
        expect(toastContent).toHaveStyle({
          minWidth: '320px',
          maxWidth: '400px',
        });
      });
    });

    describe('edge cases', () => {
      it('should handle toast with XSS characters in title', () => {
        mockUseToast.mockReturnValue({
          toasts: [createMockToast({ title: '<script>alert("xss")</script>' })],
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        render(<ToastContainer theme={mockTheme} />);
        // Should render as text, not execute
        expect(screen.getByText('<script>alert("xss")</script>')).toBeInTheDocument();
      });

      it('should handle toast with unicode characters', () => {
        mockUseToast.mockReturnValue({
          toasts: [createMockToast({
            title: 'Hello \u{1F44B}',
            message: 'Unicode test: \u{1F30D}',
          })],
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        render(<ToastContainer theme={mockTheme} />);
        // Use a function matcher for unicode content
        expect(screen.getByText((content) => content.includes('Hello'))).toBeInTheDocument();
        expect(screen.getByText((content) => content.includes('Unicode test'))).toBeInTheDocument();
      });

      it('should handle toast with very long message', () => {
        const longMessage = 'A'.repeat(500);
        mockUseToast.mockReturnValue({
          toasts: [createMockToast({ message: longMessage })],
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        render(<ToastContainer theme={mockTheme} />);
        expect(screen.getByText(longMessage)).toBeInTheDocument();
      });

      it('should handle toast with empty title', () => {
        mockUseToast.mockReturnValue({
          toasts: [createMockToast({ title: '' })],
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        const { container } = render(<ToastContainer theme={mockTheme} />);
        // Should still render the toast structure
        expect(container.querySelector('.flex.items-start.gap-3')).toBeInTheDocument();
      });

      it('should handle toast with empty message', () => {
        mockUseToast.mockReturnValue({
          toasts: [createMockToast({ message: '' })],
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        render(<ToastContainer theme={mockTheme} />);
        // Should still render the toast title
        expect(screen.getByText('Test Toast')).toBeInTheDocument();
      });

      it('should handle rapid toast removal', () => {
        mockUseToast.mockReturnValue({
          toasts: [
            createMockToast({ id: 'toast-1' }),
            createMockToast({ id: 'toast-2' }),
          ],
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        const { container } = render(<ToastContainer theme={mockTheme} />);

        const closeButtons = container.querySelectorAll('button');

        // Click both close buttons rapidly
        fireEvent.click(closeButtons[0]);
        fireEvent.click(closeButtons[1]);

        act(() => {
          vi.advanceTimersByTime(300);
        });

        // Both toasts should trigger removeToast
        expect(mockRemoveToast).toHaveBeenCalledTimes(2);
      });

      it('should handle undefined duration gracefully', () => {
        mockUseToast.mockReturnValue({
          toasts: [createMockToast({ duration: undefined })],
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        const { container } = render(<ToastContainer theme={mockTheme} />);

        // Should render without progress bar
        const progressBar = container.querySelector('.h-1.rounded-b-lg');
        expect(progressBar).not.toBeInTheDocument();
      });
    });

    describe('formatDuration helper', () => {
      // Testing formatDuration through the component
      it('should format 0ms correctly', () => {
        mockUseToast.mockReturnValue({
          toasts: [createMockToast({ taskDuration: 1 })],
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        render(<ToastContainer theme={mockTheme} />);
        expect(screen.getByText(/Completed in 1ms/)).toBeInTheDocument();
      });

      it('should format 999ms correctly', () => {
        mockUseToast.mockReturnValue({
          toasts: [createMockToast({ taskDuration: 999 })],
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        render(<ToastContainer theme={mockTheme} />);
        expect(screen.getByText(/Completed in 999ms/)).toBeInTheDocument();
      });

      it('should format 1000ms as 1s', () => {
        mockUseToast.mockReturnValue({
          toasts: [createMockToast({ taskDuration: 1000 })],
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        render(<ToastContainer theme={mockTheme} />);
        expect(screen.getByText(/Completed in 1s/)).toBeInTheDocument();
      });

      it('should format 59s correctly', () => {
        mockUseToast.mockReturnValue({
          toasts: [createMockToast({ taskDuration: 59000 })],
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        render(<ToastContainer theme={mockTheme} />);
        expect(screen.getByText(/Completed in 59s/)).toBeInTheDocument();
      });

      it('should format 60s as 1m', () => {
        mockUseToast.mockReturnValue({
          toasts: [createMockToast({ taskDuration: 60000 })],
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        render(<ToastContainer theme={mockTheme} />);
        expect(screen.getByText(/Completed in 1m$/)).toBeInTheDocument();
      });

      it('should format 61s as 1m 1s', () => {
        mockUseToast.mockReturnValue({
          toasts: [createMockToast({ taskDuration: 61000 })],
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        render(<ToastContainer theme={mockTheme} />);
        expect(screen.getByText(/Completed in 1m 1s/)).toBeInTheDocument();
      });

      it('should format 3661s (1h 1m 1s) correctly', () => {
        mockUseToast.mockReturnValue({
          toasts: [createMockToast({ taskDuration: 3661000 })], // 1h 1m 1s
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        render(<ToastContainer theme={mockTheme} />);
        // formatDuration only goes to minutes, so this should be 61m 1s
        expect(screen.getByText(/Completed in 61m 1s/)).toBeInTheDocument();
      });
    });

    describe('toast without duration', () => {
      it('should not trigger exit animation for toasts without duration', () => {
        mockUseToast.mockReturnValue({
          toasts: [createMockToast({ duration: undefined })],
          addToast: vi.fn(),
          removeToast: mockRemoveToast,
          clearToasts: vi.fn(),
          setDefaultDuration: vi.fn(),
          setAudioFeedback: vi.fn(),
          setOsNotifications: vi.fn(),
        });

        const { container } = render(<ToastContainer theme={mockTheme} />);

        // Advance timer past enter animation
        act(() => {
          vi.advanceTimersByTime(50);
        });

        // Advance timer well beyond any duration
        act(() => {
          vi.advanceTimersByTime(10000);
        });

        // Toast should still be visible (not in exit state)
        const toastOuter = container.querySelector('.relative.overflow-hidden');
        expect(toastOuter).toHaveStyle({ transform: 'translateX(0)' });
      });
    });
  });
});
