/**
 * @fileoverview Tests for GitStatusWidget component
 *
 * GitStatusWidget displays git change statistics (additions, deletions, modifications)
 * with a hover tooltip showing per-file changes with GitHub-style diff bars.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GitStatusWidget } from '../../../renderer/components/GitStatusWidget';
import type { Theme } from '../../../renderer/types';
import { gitService } from '../../../renderer/services/git';

// Mock gitService
vi.mock('../../../renderer/services/git', () => ({
  gitService: {
    getStatus: vi.fn(),
    getNumstat: vi.fn(),
  },
}));

// Create a mock theme
const mockTheme: Theme = {
  id: 'test-theme',
  name: 'Test Theme',
  colors: {
    bgMain: '#1a1a2e',
    bgSidebar: '#16213e',
    bgInput: '#0f3460',
    textMain: '#eaeaea',
    textDim: '#a0a0a0',
    border: '#2a2a4a',
    accent: '#e94560',
    scrollbarThumb: '#444',
    scrollbarTrack: '#222',
    syntax1: '#ff6b6b',
    syntax2: '#4ecdc4',
    syntax3: '#45b7d1',
    syntax4: '#96ceb4',
  },
};

describe('GitStatusWidget', () => {
  const mockOnViewDiff = vi.fn();

  const defaultProps = {
    cwd: '/test/project',
    isGitRepo: true,
    theme: mockTheme,
    onViewDiff: mockOnViewDiff,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock implementations
    vi.mocked(gitService.getStatus).mockResolvedValue({ files: [] });
    vi.mocked(gitService.getNumstat).mockResolvedValue({ files: [] });
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('Rendering Conditions', () => {
    it('should return null when isGitRepo is false', () => {
      const { container } = render(
        <GitStatusWidget {...defaultProps} isGitRepo={false} />
      );

      expect(container.firstChild).toBeNull();
    });

    it('should return null when there are no file changes', async () => {
      vi.mocked(gitService.getStatus).mockResolvedValue({ files: [] });
      vi.mocked(gitService.getNumstat).mockResolvedValue({ files: [] });

      const { container } = render(<GitStatusWidget {...defaultProps} />);

      // Wait for async operation to complete
      await waitFor(() => {
        expect(gitService.getStatus).toHaveBeenCalled();
      });

      expect(container.firstChild).toBeNull();
    });

    it('should render the widget when there are file changes', async () => {
      vi.mocked(gitService.getStatus).mockResolvedValue({
        files: [{ path: 'file.ts', status: 'M ' }],
      });
      vi.mocked(gitService.getNumstat).mockResolvedValue({
        files: [{ path: 'file.ts', additions: 10, deletions: 5 }],
      });

      render(<GitStatusWidget {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button')).toBeInTheDocument();
      });
    });

    it('should reset state when isGitRepo changes to false', async () => {
      vi.mocked(gitService.getStatus).mockResolvedValue({
        files: [{ path: 'file.ts', status: 'M ' }],
      });
      vi.mocked(gitService.getNumstat).mockResolvedValue({
        files: [{ path: 'file.ts', additions: 10, deletions: 5 }],
      });

      const { rerender, container } = render(<GitStatusWidget {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button')).toBeInTheDocument();
      });

      // Change isGitRepo to false
      rerender(<GitStatusWidget {...defaultProps} isGitRepo={false} />);

      // Widget should no longer render
      expect(container.firstChild).toBeNull();
    });
  });

  describe('Git Data Loading', () => {
    it('should call gitService.getStatus and gitService.getNumstat on mount', async () => {
      render(<GitStatusWidget {...defaultProps} />);

      await waitFor(() => {
        expect(gitService.getStatus).toHaveBeenCalledWith('/test/project');
        expect(gitService.getNumstat).toHaveBeenCalledWith('/test/project');
      });
    });

    it('should reload git status on cwd change', async () => {
      const { rerender } = render(<GitStatusWidget {...defaultProps} />);

      await waitFor(() => {
        expect(gitService.getStatus).toHaveBeenCalledWith('/test/project');
      });

      // Change cwd
      rerender(<GitStatusWidget {...defaultProps} cwd="/another/project" />);

      await waitFor(() => {
        expect(gitService.getStatus).toHaveBeenCalledWith('/another/project');
      });
    });

    it('should handle git service errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(gitService.getStatus).mockRejectedValue(new Error('Git error'));
      vi.mocked(gitService.getNumstat).mockResolvedValue({ files: [] });

      const { container } = render(<GitStatusWidget {...defaultProps} />);

      // Wait for error to be logged
      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to load git status:', expect.any(Error));
      });

      // Widget should still not crash
      expect(container.firstChild).toBeNull(); // No changes loaded

      consoleSpy.mockRestore();
    });
  });

  describe('Statistics Calculation', () => {
    it('should display additions count correctly', async () => {
      vi.mocked(gitService.getStatus).mockResolvedValue({
        files: [{ path: 'file.ts', status: 'A ' }],
      });
      vi.mocked(gitService.getNumstat).mockResolvedValue({
        files: [{ path: 'file.ts', additions: 42, deletions: 0 }],
      });

      render(<GitStatusWidget {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('42')).toBeInTheDocument();
      });
    });

    it('should display deletions count correctly', async () => {
      vi.mocked(gitService.getStatus).mockResolvedValue({
        files: [{ path: 'file.ts', status: 'D ' }],
      });
      vi.mocked(gitService.getNumstat).mockResolvedValue({
        files: [{ path: 'file.ts', additions: 0, deletions: 17 }],
      });

      render(<GitStatusWidget {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('17')).toBeInTheDocument();
      });
    });

    it('should display modified count correctly', async () => {
      vi.mocked(gitService.getStatus).mockResolvedValue({
        files: [
          { path: 'file1.ts', status: 'M ' },
          { path: 'file2.ts', status: ' M' },
        ],
      });
      vi.mocked(gitService.getNumstat).mockResolvedValue({
        files: [
          { path: 'file1.ts', additions: 5, deletions: 3 },
          { path: 'file2.ts', additions: 2, deletions: 1 },
        ],
      });

      render(<GitStatusWidget {...defaultProps} />);

      await waitFor(() => {
        // Should show 2 modified files
        expect(screen.getByText('2')).toBeInTheDocument();
      });
    });

    it('should calculate totals from multiple files', async () => {
      vi.mocked(gitService.getStatus).mockResolvedValue({
        files: [
          { path: 'file1.ts', status: 'M ' },
          { path: 'file2.ts', status: 'A ' },
          { path: 'file3.ts', status: 'D ' },
        ],
      });
      vi.mocked(gitService.getNumstat).mockResolvedValue({
        files: [
          { path: 'file1.ts', additions: 10, deletions: 5 },
          { path: 'file2.ts', additions: 20, deletions: 0 },
          { path: 'file3.ts', additions: 0, deletions: 15 },
        ],
      });

      render(<GitStatusWidget {...defaultProps} />);

      await waitFor(() => {
        // Total additions: 10 + 20 + 0 = 30
        expect(screen.getByText('30')).toBeInTheDocument();
        // Total deletions: 5 + 0 + 15 = 20
        expect(screen.getByText('20')).toBeInTheDocument();
      });
    });

    it('should handle files with rename status (R)', async () => {
      vi.mocked(gitService.getStatus).mockResolvedValue({
        files: [{ path: 'newfile.ts', status: 'R ' }],
      });
      vi.mocked(gitService.getNumstat).mockResolvedValue({
        files: [{ path: 'newfile.ts', additions: 5, deletions: 2 }],
      });

      render(<GitStatusWidget {...defaultProps} />);

      await waitFor(() => {
        // Renamed file should be counted as modified
        expect(screen.getByText('1')).toBeInTheDocument(); // 1 modified
      });
    });

    it('should handle untracked files (?)', async () => {
      vi.mocked(gitService.getStatus).mockResolvedValue({
        files: [{ path: 'newfile.ts', status: '??' }],
      });
      vi.mocked(gitService.getNumstat).mockResolvedValue({
        files: [{ path: 'newfile.ts', additions: 100, deletions: 0 }],
      });

      render(<GitStatusWidget {...defaultProps} />);

      await waitFor(() => {
        // Additions should be counted
        expect(screen.getByText('100')).toBeInTheDocument();
      });
    });

    it('should handle files not in numstat map', async () => {
      vi.mocked(gitService.getStatus).mockResolvedValue({
        files: [{ path: 'file.ts', status: 'M ' }],
      });
      vi.mocked(gitService.getNumstat).mockResolvedValue({
        files: [], // No numstat data
      });

      render(<GitStatusWidget {...defaultProps} />);

      await waitFor(() => {
        // Should still render with 0 additions/deletions but 1 modified
        expect(screen.getByRole('button')).toBeInTheDocument();
      });
    });
  });

  describe('Click Handlers', () => {
    it('should call onViewDiff when button is clicked', async () => {
      vi.mocked(gitService.getStatus).mockResolvedValue({
        files: [{ path: 'file.ts', status: 'M ' }],
      });
      vi.mocked(gitService.getNumstat).mockResolvedValue({
        files: [{ path: 'file.ts', additions: 10, deletions: 5 }],
      });

      render(<GitStatusWidget {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button')).toBeInTheDocument();
      });

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(mockOnViewDiff).toHaveBeenCalled();
    });

    it('should call onViewDiff when "View Full Diff" link is clicked in tooltip', async () => {
      vi.mocked(gitService.getStatus).mockResolvedValue({
        files: [{ path: 'file.ts', status: 'M ' }],
      });
      vi.mocked(gitService.getNumstat).mockResolvedValue({
        files: [{ path: 'file.ts', additions: 10, deletions: 5 }],
      });

      render(<GitStatusWidget {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button')).toBeInTheDocument();
      });

      // Hover to open tooltip
      const container = screen.getByRole('button').parentElement!;
      fireEvent.mouseEnter(container);

      // Click "View Full Diff" button
      const viewDiffButton = screen.getByText('View Full Diff');
      fireEvent.click(viewDiffButton);

      expect(mockOnViewDiff).toHaveBeenCalled();
    });
  });

  describe('Tooltip Behavior', () => {
    it('should show tooltip on mouse enter', async () => {
      vi.mocked(gitService.getStatus).mockResolvedValue({
        files: [{ path: 'file.ts', status: 'M ' }],
      });
      vi.mocked(gitService.getNumstat).mockResolvedValue({
        files: [{ path: 'file.ts', additions: 10, deletions: 5 }],
      });

      render(<GitStatusWidget {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button')).toBeInTheDocument();
      });

      const container = screen.getByRole('button').parentElement!;
      fireEvent.mouseEnter(container);

      expect(screen.getByText('View Full Diff')).toBeInTheDocument();
    });

    it('should hide tooltip on mouse leave after delay', async () => {
      vi.useFakeTimers();

      vi.mocked(gitService.getStatus).mockResolvedValue({
        files: [{ path: 'file.ts', status: 'M ' }],
      });
      vi.mocked(gitService.getNumstat).mockResolvedValue({
        files: [{ path: 'file.ts', additions: 10, deletions: 5 }],
      });

      render(<GitStatusWidget {...defaultProps} />);

      // Allow promises to resolve
      await vi.runOnlyPendingTimersAsync();

      const button = screen.getByRole('button');
      const container = button.parentElement!;

      // Open tooltip
      fireEvent.mouseEnter(container);
      expect(screen.getByText('View Full Diff')).toBeInTheDocument();

      // Leave and wait for timeout
      fireEvent.mouseLeave(container);

      // Advance only the tooltip timeout
      await vi.advanceTimersByTimeAsync(150);

      expect(screen.queryByText('View Full Diff')).not.toBeInTheDocument();

      vi.useRealTimers();
    });

    it('should keep tooltip open when moving to tooltip content', async () => {
      vi.useFakeTimers();

      vi.mocked(gitService.getStatus).mockResolvedValue({
        files: [{ path: 'file.ts', status: 'M ' }],
      });
      vi.mocked(gitService.getNumstat).mockResolvedValue({
        files: [{ path: 'file.ts', additions: 10, deletions: 5 }],
      });

      render(<GitStatusWidget {...defaultProps} />);

      await vi.runOnlyPendingTimersAsync();

      const button = screen.getByRole('button');
      const container = button.parentElement!;

      // Open tooltip
      fireEvent.mouseEnter(container);

      // Leave button
      fireEvent.mouseLeave(container);

      // Enter the tooltip content
      const tooltip = screen.getByText('View Full Diff').closest('[class*="z-[100]"]')!;
      fireEvent.mouseEnter(tooltip);

      // Advance time but tooltip should stay open
      await vi.advanceTimersByTimeAsync(200);

      expect(screen.getByText('View Full Diff')).toBeInTheDocument();

      vi.useRealTimers();
    });

    it('should close tooltip when leaving tooltip content', async () => {
      vi.useFakeTimers();

      vi.mocked(gitService.getStatus).mockResolvedValue({
        files: [{ path: 'file.ts', status: 'M ' }],
      });
      vi.mocked(gitService.getNumstat).mockResolvedValue({
        files: [{ path: 'file.ts', additions: 10, deletions: 5 }],
      });

      render(<GitStatusWidget {...defaultProps} />);

      await vi.runOnlyPendingTimersAsync();

      const button = screen.getByRole('button');
      const container = button.parentElement!;

      // Open tooltip
      fireEvent.mouseEnter(container);

      // Enter then leave the tooltip content
      const tooltip = screen.getByText('View Full Diff').closest('[class*="z-[100]"]')!;
      fireEvent.mouseEnter(tooltip);
      fireEvent.mouseLeave(tooltip);

      // Wait for delay
      await vi.advanceTimersByTimeAsync(150);

      expect(screen.queryByText('View Full Diff')).not.toBeInTheDocument();

      vi.useRealTimers();
    });

    it('should clear timeout when mouse re-enters container', async () => {
      vi.useFakeTimers();

      vi.mocked(gitService.getStatus).mockResolvedValue({
        files: [{ path: 'file.ts', status: 'M ' }],
      });
      vi.mocked(gitService.getNumstat).mockResolvedValue({
        files: [{ path: 'file.ts', additions: 10, deletions: 5 }],
      });

      render(<GitStatusWidget {...defaultProps} />);

      await vi.runOnlyPendingTimersAsync();

      const button = screen.getByRole('button');
      const container = button.parentElement!;

      // Open tooltip
      fireEvent.mouseEnter(container);

      // Leave
      fireEvent.mouseLeave(container);

      // Re-enter before timeout
      await vi.advanceTimersByTimeAsync(50);
      fireEvent.mouseEnter(container);

      // Wait past the original timeout
      await vi.advanceTimersByTimeAsync(200);

      // Tooltip should still be visible
      expect(screen.getByText('View Full Diff')).toBeInTheDocument();

      vi.useRealTimers();
    });
  });

  describe('File Changes Display', () => {
    it('should display file path in tooltip', async () => {
      vi.mocked(gitService.getStatus).mockResolvedValue({
        files: [{ path: 'src/components/Widget.tsx', status: 'M ' }],
      });
      vi.mocked(gitService.getNumstat).mockResolvedValue({
        files: [{ path: 'src/components/Widget.tsx', additions: 10, deletions: 5 }],
      });

      render(<GitStatusWidget {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button')).toBeInTheDocument();
      });

      // Open tooltip
      const container = screen.getByRole('button').parentElement!;
      fireEvent.mouseEnter(container);

      expect(screen.getByText('src/components/Widget.tsx')).toBeInTheDocument();
    });

    it('should display per-file additions and deletions', async () => {
      vi.mocked(gitService.getStatus).mockResolvedValue({
        files: [{ path: 'file.ts', status: 'M ' }],
      });
      vi.mocked(gitService.getNumstat).mockResolvedValue({
        files: [{ path: 'file.ts', additions: 25, deletions: 12 }],
      });

      render(<GitStatusWidget {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button')).toBeInTheDocument();
      });

      // Open tooltip
      const container = screen.getByRole('button').parentElement!;
      fireEvent.mouseEnter(container);

      expect(screen.getByText('+25')).toBeInTheDocument();
      expect(screen.getByText('−12')).toBeInTheDocument();
    });

    it('should display summary in tooltip header', async () => {
      vi.mocked(gitService.getStatus).mockResolvedValue({
        files: [
          { path: 'file1.ts', status: 'M ' },
          { path: 'file2.ts', status: 'A ' },
        ],
      });
      vi.mocked(gitService.getNumstat).mockResolvedValue({
        files: [
          { path: 'file1.ts', additions: 10, deletions: 5 },
          { path: 'file2.ts', additions: 20, deletions: 0 },
        ],
      });

      render(<GitStatusWidget {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button')).toBeInTheDocument();
      });

      // Open tooltip
      const container = screen.getByRole('button').parentElement!;
      fireEvent.mouseEnter(container);

      // Header format: "Changed Files (N) • +X −Y"
      expect(screen.getByText(/Changed Files.*• \+30 −5/)).toBeInTheDocument();
    });

    it('should display multiple files in tooltip', async () => {
      vi.mocked(gitService.getStatus).mockResolvedValue({
        files: [
          { path: 'file1.ts', status: 'M ' },
          { path: 'file2.ts', status: 'A ' },
          { path: 'file3.ts', status: 'D ' },
        ],
      });
      vi.mocked(gitService.getNumstat).mockResolvedValue({
        files: [
          { path: 'file1.ts', additions: 10, deletions: 5 },
          { path: 'file2.ts', additions: 20, deletions: 0 },
          { path: 'file3.ts', additions: 0, deletions: 15 },
        ],
      });

      render(<GitStatusWidget {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button')).toBeInTheDocument();
      });

      // Open tooltip
      const container = screen.getByRole('button').parentElement!;
      fireEvent.mouseEnter(container);

      expect(screen.getByText('file1.ts')).toBeInTheDocument();
      expect(screen.getByText('file2.ts')).toBeInTheDocument();
      expect(screen.getByText('file3.ts')).toBeInTheDocument();
    });

    it('should not display addition count when 0 for a file', async () => {
      vi.mocked(gitService.getStatus).mockResolvedValue({
        files: [{ path: 'deleted.ts', status: 'D ' }],
      });
      vi.mocked(gitService.getNumstat).mockResolvedValue({
        files: [{ path: 'deleted.ts', additions: 0, deletions: 50 }],
      });

      render(<GitStatusWidget {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button')).toBeInTheDocument();
      });

      // Open tooltip
      const container = screen.getByRole('button').parentElement!;
      fireEvent.mouseEnter(container);

      // Should show deletion but no addition with +0
      expect(screen.getByText('−50')).toBeInTheDocument();
      expect(screen.queryByText('+0')).not.toBeInTheDocument();
    });

    it('should not display deletion count when 0 for a file', async () => {
      vi.mocked(gitService.getStatus).mockResolvedValue({
        files: [{ path: 'new.ts', status: 'A ' }],
      });
      vi.mocked(gitService.getNumstat).mockResolvedValue({
        files: [{ path: 'new.ts', additions: 100, deletions: 0 }],
      });

      render(<GitStatusWidget {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button')).toBeInTheDocument();
      });

      // Open tooltip
      const container = screen.getByRole('button').parentElement!;
      fireEvent.mouseEnter(container);

      // Should show addition but no deletion with −0
      expect(screen.getByText('+100')).toBeInTheDocument();
      expect(screen.queryByText('−0')).not.toBeInTheDocument();
    });
  });

  describe('GitHub-style Diff Bars', () => {
    it('should render diff bars for files with changes', async () => {
      vi.mocked(gitService.getStatus).mockResolvedValue({
        files: [{ path: 'file.ts', status: 'M ' }],
      });
      vi.mocked(gitService.getNumstat).mockResolvedValue({
        files: [{ path: 'file.ts', additions: 30, deletions: 10 }],
      });

      render(<GitStatusWidget {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button')).toBeInTheDocument();
      });

      // Open tooltip
      const container = screen.getByRole('button').parentElement!;
      fireEvent.mouseEnter(container);

      // Diff bar container should exist
      const fileElement = screen.getByText('file.ts').closest('div[class*="border-b"]');
      expect(fileElement).toBeInTheDocument();

      // There should be colored bars (green for additions, red for deletions)
      const bars = fileElement?.querySelectorAll('[class*="bg-green-500"], [class*="bg-red-500"]');
      expect(bars?.length).toBe(2);
    });

    it('should not render diff bars when file has no changes', async () => {
      vi.mocked(gitService.getStatus).mockResolvedValue({
        files: [{ path: 'file.ts', status: 'M ' }],
      });
      vi.mocked(gitService.getNumstat).mockResolvedValue({
        files: [{ path: 'file.ts', additions: 0, deletions: 0 }],
      });

      render(<GitStatusWidget {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button')).toBeInTheDocument();
      });

      // Open tooltip
      const container = screen.getByRole('button').parentElement!;
      fireEvent.mouseEnter(container);

      // File element should exist
      const fileElement = screen.getByText('file.ts').closest('div[class*="border-b"]');
      expect(fileElement).toBeInTheDocument();

      // No diff bars should be rendered
      const bars = fileElement?.querySelectorAll('[class*="bg-green-500"], [class*="bg-red-500"]');
      expect(bars?.length).toBe(0);
    });

    it('should only render green bar when there are only additions', async () => {
      vi.mocked(gitService.getStatus).mockResolvedValue({
        files: [{ path: 'file.ts', status: 'A ' }],
      });
      vi.mocked(gitService.getNumstat).mockResolvedValue({
        files: [{ path: 'file.ts', additions: 100, deletions: 0 }],
      });

      render(<GitStatusWidget {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button')).toBeInTheDocument();
      });

      // Open tooltip
      const container = screen.getByRole('button').parentElement!;
      fireEvent.mouseEnter(container);

      const fileElement = screen.getByText('file.ts').closest('div[class*="border-b"]');
      const greenBars = fileElement?.querySelectorAll('[class*="bg-green-500"]');
      const redBars = fileElement?.querySelectorAll('[class*="bg-red-500"]');

      expect(greenBars?.length).toBe(1);
      expect(redBars?.length).toBe(0);
    });

    it('should only render red bar when there are only deletions', async () => {
      vi.mocked(gitService.getStatus).mockResolvedValue({
        files: [{ path: 'file.ts', status: 'D ' }],
      });
      vi.mocked(gitService.getNumstat).mockResolvedValue({
        files: [{ path: 'file.ts', additions: 0, deletions: 50 }],
      });

      render(<GitStatusWidget {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button')).toBeInTheDocument();
      });

      // Open tooltip
      const container = screen.getByRole('button').parentElement!;
      fireEvent.mouseEnter(container);

      const fileElement = screen.getByText('file.ts').closest('div[class*="border-b"]');
      const greenBars = fileElement?.querySelectorAll('[class*="bg-green-500"]');
      const redBars = fileElement?.querySelectorAll('[class*="bg-red-500"]');

      expect(greenBars?.length).toBe(0);
      expect(redBars?.length).toBe(1);
    });
  });

  describe('Theme Styling', () => {
    it('should apply theme colors to the main button', async () => {
      vi.mocked(gitService.getStatus).mockResolvedValue({
        files: [{ path: 'file.ts', status: 'M ' }],
      });
      vi.mocked(gitService.getNumstat).mockResolvedValue({
        files: [{ path: 'file.ts', additions: 10, deletions: 5 }],
      });

      render(<GitStatusWidget {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button')).toBeInTheDocument();
      });

      const button = screen.getByRole('button');
      expect(button).toHaveStyle({ color: mockTheme.colors.textMain });
    });

    it('should apply theme colors to tooltip background', async () => {
      vi.mocked(gitService.getStatus).mockResolvedValue({
        files: [{ path: 'file.ts', status: 'M ' }],
      });
      vi.mocked(gitService.getNumstat).mockResolvedValue({
        files: [{ path: 'file.ts', additions: 10, deletions: 5 }],
      });

      render(<GitStatusWidget {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button')).toBeInTheDocument();
      });

      // Open tooltip
      const container = screen.getByRole('button').parentElement!;
      fireEvent.mouseEnter(container);

      const tooltip = screen.getByText('View Full Diff').closest('[class*="z-[100]"]');
      expect(tooltip).toHaveStyle({ backgroundColor: mockTheme.colors.bgSidebar });
    });

    it('should apply theme border colors', async () => {
      vi.mocked(gitService.getStatus).mockResolvedValue({
        files: [{ path: 'file.ts', status: 'M ' }],
      });
      vi.mocked(gitService.getNumstat).mockResolvedValue({
        files: [{ path: 'file.ts', additions: 10, deletions: 5 }],
      });

      render(<GitStatusWidget {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button')).toBeInTheDocument();
      });

      // Open tooltip
      const container = screen.getByRole('button').parentElement!;
      fireEvent.mouseEnter(container);

      const tooltip = screen.getByText('View Full Diff').closest('[class*="z-[100]"]');
      // Check that the border contains the color (style is set via template literal)
      expect(tooltip).toHaveStyle({ borderColor: mockTheme.colors.border });
    });
  });

  describe('Icon Display', () => {
    it('should render GitBranch icon', async () => {
      vi.mocked(gitService.getStatus).mockResolvedValue({
        files: [{ path: 'file.ts', status: 'M ' }],
      });
      vi.mocked(gitService.getNumstat).mockResolvedValue({
        files: [{ path: 'file.ts', additions: 10, deletions: 5 }],
      });

      render(<GitStatusWidget {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button')).toBeInTheDocument();
      });

      const button = screen.getByRole('button');
      // GitBranch icon has specific classes
      const icon = button.querySelector('svg');
      expect(icon).toBeInTheDocument();
    });

    it('should not show Plus icon when no additions', async () => {
      vi.mocked(gitService.getStatus).mockResolvedValue({
        files: [{ path: 'file.ts', status: 'D ' }],
      });
      vi.mocked(gitService.getNumstat).mockResolvedValue({
        files: [{ path: 'file.ts', additions: 0, deletions: 10 }],
      });

      render(<GitStatusWidget {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button')).toBeInTheDocument();
      });

      const button = screen.getByRole('button');
      // Should only have 1 SVG (GitBranch) not the Plus icon
      const greenSpan = button.querySelector('.text-green-500');
      expect(greenSpan).not.toBeInTheDocument();
    });

    it('should not show Minus icon when no deletions', async () => {
      vi.mocked(gitService.getStatus).mockResolvedValue({
        files: [{ path: 'file.ts', status: 'A ' }],
      });
      vi.mocked(gitService.getNumstat).mockResolvedValue({
        files: [{ path: 'file.ts', additions: 50, deletions: 0 }],
      });

      render(<GitStatusWidget {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button')).toBeInTheDocument();
      });

      const button = screen.getByRole('button');
      const redSpan = button.querySelector('.text-red-500');
      expect(redSpan).not.toBeInTheDocument();
    });

    it('should not show FileEdit icon when no modified files', async () => {
      vi.mocked(gitService.getStatus).mockResolvedValue({
        files: [{ path: 'file.ts', status: 'A ' }],
      });
      vi.mocked(gitService.getNumstat).mockResolvedValue({
        files: [{ path: 'file.ts', additions: 50, deletions: 0 }],
      });

      render(<GitStatusWidget {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button')).toBeInTheDocument();
      });

      const button = screen.getByRole('button');
      const orangeSpan = button.querySelector('.text-orange-500');
      expect(orangeSpan).not.toBeInTheDocument();
    });
  });

  describe('Status Code Parsing', () => {
    it('should handle single character status codes', async () => {
      vi.mocked(gitService.getStatus).mockResolvedValue({
        files: [{ path: 'file.ts', status: 'M' }], // Single char status
      });
      vi.mocked(gitService.getNumstat).mockResolvedValue({
        files: [{ path: 'file.ts', additions: 10, deletions: 5 }],
      });

      render(<GitStatusWidget {...defaultProps} />);

      await waitFor(() => {
        // Should still render and count as modified
        expect(screen.getByRole('button')).toBeInTheDocument();
      });
    });

    it('should handle working tree modifications (space + M)', async () => {
      vi.mocked(gitService.getStatus).mockResolvedValue({
        files: [{ path: 'file.ts', status: ' M' }],
      });
      vi.mocked(gitService.getNumstat).mockResolvedValue({
        files: [{ path: 'file.ts', additions: 10, deletions: 5 }],
      });

      render(<GitStatusWidget {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button')).toBeInTheDocument();
      });

      // Should count as 1 modified
      const button = screen.getByRole('button');
      const orangeSpan = button.querySelector('.text-orange-500');
      expect(orangeSpan).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument();
    });

    it('should handle working tree renames (space + R)', async () => {
      vi.mocked(gitService.getStatus).mockResolvedValue({
        files: [{ path: 'file.ts', status: ' R' }],
      });
      vi.mocked(gitService.getNumstat).mockResolvedValue({
        files: [{ path: 'file.ts', additions: 0, deletions: 0 }],
      });

      render(<GitStatusWidget {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button')).toBeInTheDocument();
      });

      // Should count as 1 modified (rename)
      const button = screen.getByRole('button');
      const orangeSpan = button.querySelector('.text-orange-500');
      expect(orangeSpan).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty status string', async () => {
      vi.mocked(gitService.getStatus).mockResolvedValue({
        files: [{ path: 'file.ts', status: '' }],
      });
      vi.mocked(gitService.getNumstat).mockResolvedValue({
        files: [{ path: 'file.ts', additions: 10, deletions: 5 }],
      });

      render(<GitStatusWidget {...defaultProps} />);

      await waitFor(() => {
        // Should still render without crashing
        expect(screen.getByRole('button')).toBeInTheDocument();
      });
    });

    it('should handle special characters in file paths', async () => {
      const specialPath = 'src/[test]/file with spaces.ts';
      vi.mocked(gitService.getStatus).mockResolvedValue({
        files: [{ path: specialPath, status: 'M ' }],
      });
      vi.mocked(gitService.getNumstat).mockResolvedValue({
        files: [{ path: specialPath, additions: 10, deletions: 5 }],
      });

      render(<GitStatusWidget {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button')).toBeInTheDocument();
      });

      // Open tooltip
      const container = screen.getByRole('button').parentElement!;
      fireEvent.mouseEnter(container);

      expect(screen.getByText(specialPath)).toBeInTheDocument();
    });

    it('should handle very large numbers', async () => {
      vi.mocked(gitService.getStatus).mockResolvedValue({
        files: [{ path: 'file.ts', status: 'M ' }],
      });
      vi.mocked(gitService.getNumstat).mockResolvedValue({
        files: [{ path: 'file.ts', additions: 10000, deletions: 5000 }],
      });

      render(<GitStatusWidget {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('10000')).toBeInTheDocument();
        expect(screen.getByText('5000')).toBeInTheDocument();
      });
    });

    it('should handle many files', async () => {
      const manyFiles = Array.from({ length: 100 }, (_, i) => ({
        path: `file${i}.ts`,
        status: 'M ',
      }));
      const manyNumstat = Array.from({ length: 100 }, (_, i) => ({
        path: `file${i}.ts`,
        additions: i + 1,
        deletions: i,
      }));

      vi.mocked(gitService.getStatus).mockResolvedValue({
        files: manyFiles,
      });
      vi.mocked(gitService.getNumstat).mockResolvedValue({
        files: manyNumstat,
      });

      render(<GitStatusWidget {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button')).toBeInTheDocument();
      });

      // Open tooltip
      const container = screen.getByRole('button').parentElement!;
      fireEvent.mouseEnter(container);

      // Should render all files in tooltip
      expect(screen.getByText('file0.ts')).toBeInTheDocument();
      expect(screen.getByText('file99.ts')).toBeInTheDocument();
    });

    it('should have proper accessibility with title attribute on file paths', async () => {
      vi.mocked(gitService.getStatus).mockResolvedValue({
        files: [{ path: 'very/long/path/to/file.ts', status: 'M ' }],
      });
      vi.mocked(gitService.getNumstat).mockResolvedValue({
        files: [{ path: 'very/long/path/to/file.ts', additions: 10, deletions: 5 }],
      });

      render(<GitStatusWidget {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button')).toBeInTheDocument();
      });

      // Open tooltip
      const container = screen.getByRole('button').parentElement!;
      fireEvent.mouseEnter(container);

      const pathElement = screen.getByText('very/long/path/to/file.ts');
      expect(pathElement).toHaveAttribute('title', 'very/long/path/to/file.ts');
    });
  });
});
