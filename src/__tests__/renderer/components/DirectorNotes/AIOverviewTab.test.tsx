import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { AIOverviewTab } from '../../../../renderer/components/DirectorNotes/AIOverviewTab';
import type { Theme } from '../../../../renderer/types';

// Mock useSettings hook
vi.mock('../../../../renderer/hooks/settings/useSettings', () => ({
	useSettings: () => ({
		directorNotesSettings: {
			provider: 'claude-code',
			defaultLookbackDays: 7,
		},
	}),
}));

// Mock MarkdownRenderer
vi.mock('../../../../renderer/components/MarkdownRenderer', () => ({
	MarkdownRenderer: ({ content }: { content: string }) => (
		<div data-testid="markdown-renderer">{content}</div>
	),
}));

// Mock SaveMarkdownModal
vi.mock('../../../../renderer/components/SaveMarkdownModal', () => ({
	SaveMarkdownModal: ({ onClose }: { onClose: () => void }) => (
		<div data-testid="save-markdown-modal">
			<button onClick={onClose} data-testid="save-modal-close">Close</button>
		</div>
	),
}));

// Mock markdownConfig
vi.mock('../../../../renderer/utils/markdownConfig', () => ({
	generateTerminalProseStyles: () => '.director-notes-content { color: inherit; }',
}));

// Mock navigator.clipboard
const mockWriteText = vi.fn().mockResolvedValue(undefined);
Object.defineProperty(navigator, 'clipboard', {
	value: { writeText: mockWriteText },
	writable: true,
});

// Mock theme
const mockTheme: Theme = {
	id: 'dracula',
	name: 'Dracula',
	mode: 'dark',
	colors: {
		bgMain: '#282a36',
		bgSidebar: '#21222c',
		bgActivity: '#343746',
		textMain: '#f8f8f2',
		textDim: '#6272a4',
		accent: '#bd93f9',
		accentForeground: '#f8f8f2',
		border: '#44475a',
		success: '#50fa7b',
		warning: '#ffb86c',
		error: '#ff5555',
		scrollbar: '#44475a',
		scrollbarHover: '#6272a4',
	},
};

// Mock IPC APIs
const mockGetUnifiedHistory = vi.fn();
const mockEstimateTokens = vi.fn();
const mockGenerateSynopsis = vi.fn();

beforeEach(() => {
	(window as any).maestro = {
		directorNotes: {
			getUnifiedHistory: mockGetUnifiedHistory,
			estimateTokens: mockEstimateTokens,
			generateSynopsis: mockGenerateSynopsis,
		},
	};

	mockGetUnifiedHistory.mockResolvedValue([]);
	mockEstimateTokens.mockResolvedValue(1000);
	mockGenerateSynopsis.mockResolvedValue({
		success: true,
		synopsis: '# Test Synopsis\n\n## Accomplishments\n\n- Test item',
	});
});

afterEach(() => {
	vi.clearAllMocks();
});

describe('AIOverviewTab', () => {
	it('renders loading state initially', async () => {
		// Make generation hang to observe loading
		mockGetUnifiedHistory.mockReturnValue(new Promise(() => {}));

		render(<AIOverviewTab theme={mockTheme} />);

		// Should show generating state - text appears in both progress bar and spinner
		await waitFor(() => {
			const elements = screen.getAllByText(/Gathering history data/);
			expect(elements.length).toBeGreaterThan(0);
		});
	});

	it('shows empty message when no history entries found', async () => {
		mockGetUnifiedHistory.mockResolvedValue([]);

		render(<AIOverviewTab theme={mockTheme} />);

		await waitFor(() => {
			expect(screen.getByText(/No history entries found/)).toBeInTheDocument();
		});
	});

	it('generates and displays synopsis for non-empty history', async () => {
		const mockEntries = [
			{
				id: '1',
				type: 'USER',
				timestamp: Date.now(),
				summary: 'Test work',
				sourceSessionId: 'session-1',
				projectPath: '/test',
			},
		];

		mockGetUnifiedHistory.mockResolvedValue(mockEntries);
		mockEstimateTokens.mockResolvedValue(500);
		mockGenerateSynopsis.mockResolvedValue({
			success: true,
			synopsis: '# Synopsis\n\n## Accomplishments\n\n- Test work completed',
		});

		render(<AIOverviewTab theme={mockTheme} />);

		await waitFor(() => {
			expect(screen.getByTestId('markdown-renderer')).toBeInTheDocument();
		});

		expect(mockGetUnifiedHistory).toHaveBeenCalledWith({
			lookbackDays: 7,
			filter: null,
		});
		expect(mockEstimateTokens).toHaveBeenCalledWith(mockEntries);
		expect(mockGenerateSynopsis).toHaveBeenCalledWith({
			lookbackDays: 7,
			provider: 'claude-code',
		});
	});

	it('calls onSynopsisReady when synopsis is generated', async () => {
		const mockEntries = [
			{
				id: '1',
				type: 'USER',
				timestamp: Date.now(),
				summary: 'Test',
				sourceSessionId: 'session-1',
				projectPath: '/test',
			},
		];

		mockGetUnifiedHistory.mockResolvedValue(mockEntries);
		mockGenerateSynopsis.mockResolvedValue({
			success: true,
			synopsis: '# Synopsis',
		});

		const onSynopsisReady = vi.fn();
		render(<AIOverviewTab theme={mockTheme} onSynopsisReady={onSynopsisReady} />);

		await waitFor(() => {
			expect(onSynopsisReady).toHaveBeenCalled();
		});
	});

	it('calls onSynopsisReady for empty history', async () => {
		mockGetUnifiedHistory.mockResolvedValue([]);

		const onSynopsisReady = vi.fn();
		render(<AIOverviewTab theme={mockTheme} onSynopsisReady={onSynopsisReady} />);

		await waitFor(() => {
			expect(onSynopsisReady).toHaveBeenCalled();
		});
	});

	it('displays error when generation fails', async () => {
		const mockEntries = [
			{
				id: '1',
				type: 'USER',
				timestamp: Date.now(),
				summary: 'Test',
				sourceSessionId: 'session-1',
				projectPath: '/test',
			},
		];

		mockGetUnifiedHistory.mockResolvedValue(mockEntries);
		mockGenerateSynopsis.mockResolvedValue({
			success: false,
			synopsis: '',
			error: 'Provider unavailable',
		});

		render(<AIOverviewTab theme={mockTheme} />);

		await waitFor(() => {
			expect(screen.getByText('Provider unavailable')).toBeInTheDocument();
		});
	});

	it('displays error on exception', async () => {
		mockGetUnifiedHistory.mockRejectedValue(new Error('Network error'));

		render(<AIOverviewTab theme={mockTheme} />);

		await waitFor(() => {
			expect(screen.getByText('Network error')).toBeInTheDocument();
		});
	});

	it('renders lookback slider with default value', async () => {
		mockGetUnifiedHistory.mockResolvedValue([]);

		render(<AIOverviewTab theme={mockTheme} />);

		await waitFor(() => {
			expect(screen.getByText(/Lookback: 7 days/)).toBeInTheDocument();
		});

		const slider = screen.getByRole('slider');
		expect(slider).toHaveValue('7');
	});

	it('renders Refresh button', async () => {
		mockGetUnifiedHistory.mockResolvedValue([]);

		render(<AIOverviewTab theme={mockTheme} />);

		await waitFor(() => {
			expect(screen.getByText('Refresh')).toBeInTheDocument();
		});
	});

	it('renders Save button', async () => {
		mockGetUnifiedHistory.mockResolvedValue([]);

		render(<AIOverviewTab theme={mockTheme} />);

		await waitFor(() => {
			expect(screen.getByText('Save')).toBeInTheDocument();
		});
	});

	it('refreshes synopsis when Refresh button is clicked', async () => {
		const mockEntries = [
			{
				id: '1',
				type: 'USER',
				timestamp: Date.now(),
				summary: 'Test',
				sourceSessionId: 'session-1',
				projectPath: '/test',
			},
		];

		mockGetUnifiedHistory.mockResolvedValue(mockEntries);
		mockGenerateSynopsis.mockResolvedValue({
			success: true,
			synopsis: '# Synopsis',
		});

		render(<AIOverviewTab theme={mockTheme} />);

		// Wait for initial generation
		await waitFor(() => {
			expect(screen.getByTestId('markdown-renderer')).toBeInTheDocument();
		});

		expect(mockGenerateSynopsis).toHaveBeenCalledTimes(1);

		// Click refresh
		await act(async () => {
			fireEvent.click(screen.getByText('Refresh'));
		});

		await waitFor(() => {
			expect(mockGenerateSynopsis).toHaveBeenCalledTimes(2);
		});
	});

	it('opens save modal when Save button is clicked with synopsis', async () => {
		const mockEntries = [
			{
				id: '1',
				type: 'USER',
				timestamp: Date.now(),
				summary: 'Test',
				sourceSessionId: 'session-1',
				projectPath: '/test',
			},
		];

		mockGetUnifiedHistory.mockResolvedValue(mockEntries);
		mockGenerateSynopsis.mockResolvedValue({
			success: true,
			synopsis: '# Synopsis',
		});

		render(<AIOverviewTab theme={mockTheme} />);

		// Wait for synopsis to be ready
		await waitFor(() => {
			expect(screen.getByTestId('markdown-renderer')).toBeInTheDocument();
		});

		// Click save
		fireEvent.click(screen.getByText('Save'));

		expect(screen.getByTestId('save-markdown-modal')).toBeInTheDocument();
	});

	it('closes save modal when close button is clicked', async () => {
		const mockEntries = [
			{
				id: '1',
				type: 'USER',
				timestamp: Date.now(),
				summary: 'Test',
				sourceSessionId: 'session-1',
				projectPath: '/test',
			},
		];

		mockGetUnifiedHistory.mockResolvedValue(mockEntries);
		mockGenerateSynopsis.mockResolvedValue({
			success: true,
			synopsis: '# Synopsis',
		});

		render(<AIOverviewTab theme={mockTheme} />);

		await waitFor(() => {
			expect(screen.getByTestId('markdown-renderer')).toBeInTheDocument();
		});

		// Open save modal
		fireEvent.click(screen.getByText('Save'));
		expect(screen.getByTestId('save-markdown-modal')).toBeInTheDocument();

		// Close save modal
		fireEvent.click(screen.getByTestId('save-modal-close'));
		expect(screen.queryByTestId('save-markdown-modal')).not.toBeInTheDocument();
	});

	it('estimates tokens and proceeds with generation for large datasets', async () => {
		const mockEntries = [
			{
				id: '1',
				type: 'USER',
				timestamp: Date.now(),
				summary: 'Test',
				sourceSessionId: 'session-1',
				projectPath: '/test',
			},
		];

		mockGetUnifiedHistory.mockResolvedValue(mockEntries);
		// Return high token count to trigger hierarchical analysis path
		mockEstimateTokens.mockResolvedValue(200000);
		mockGenerateSynopsis.mockResolvedValue({
			success: true,
			synopsis: '# Large Synopsis',
		});

		render(<AIOverviewTab theme={mockTheme} />);

		await waitFor(() => {
			expect(screen.getByTestId('markdown-renderer')).toBeInTheDocument();
		});

		// Verify token estimation was called and generation still proceeded
		expect(mockEstimateTokens).toHaveBeenCalledWith(mockEntries);
		expect(mockGenerateSynopsis).toHaveBeenCalled();
	});
});
