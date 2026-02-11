import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { VibesBlameView } from '../../../../renderer/components/vibes/VibesBlameView';
import type { Theme } from '../../../../renderer/types';

// Mock lucide-react
vi.mock('lucide-react', () => ({
	FileCode: () => <span data-testid="icon-filecode">FileCode</span>,
	Search: () => <span data-testid="icon-search">Search</span>,
	Clock: () => <span data-testid="icon-clock">Clock</span>,
	AlertTriangle: () => <span data-testid="icon-alert">AlertTriangle</span>,
	Database: () => <span data-testid="icon-database">Database</span>,
	Cpu: () => <span data-testid="icon-cpu">Cpu</span>,
}));

const mockTheme: Theme = {
	id: 'dracula',
	name: 'Dracula',
	mode: 'dark',
	colors: {
		bgMain: '#282a36',
		bgSidebar: '#21222c',
		bgActivity: '#1e1f29',
		border: '#44475a',
		textMain: '#f8f8f2',
		textDim: '#6272a4',
		accent: '#bd93f9',
		accentDim: 'rgba(189, 147, 249, 0.2)',
		accentText: '#bd93f9',
		accentForeground: '#f8f8f2',
		success: '#50fa7b',
		warning: '#f1fa8c',
		error: '#ff5555',
	},
};

const mockBlameData = [
	{
		line_start: 1,
		line_end: 45,
		model_name: 'claude-sonnet-4-5-20250929',
		model_version: '1.0',
		tool_name: 'claude-code',
		action: 'create',
		timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
		session_id: 'abc12345-6789-0123-4567-890abcdef012',
	},
	{
		line_start: 46,
		line_end: 80,
		model_name: 'gpt-4o',
		model_version: '2024-11-20',
		tool_name: 'codex',
		action: 'modify',
		timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
		session_id: 'def12345-6789-0123-4567-890abcdef012',
	},
];

const mockCoverageData = {
	files: [
		{ file_path: 'src/main.ts' },
		{ file_path: 'src/utils/helpers.ts' },
		{ file_path: 'src/components/App.tsx' },
	],
};

// Setup window.maestro mock
const mockGetBlame = vi.fn();
const mockGetCoverage = vi.fn();
const mockBuild = vi.fn();

beforeEach(() => {
	vi.clearAllMocks();

	mockGetCoverage.mockResolvedValue({
		success: true,
		data: JSON.stringify(mockCoverageData),
	});

	mockGetBlame.mockResolvedValue({
		success: true,
		data: JSON.stringify(mockBlameData),
	});

	mockBuild.mockResolvedValue({ success: true });

	(window as any).maestro = {
		vibes: {
			getBlame: mockGetBlame,
			getCoverage: mockGetCoverage,
			build: mockBuild,
		},
	};
});

describe('VibesBlameView', () => {
	it('renders empty state when no file selected', () => {
		render(
			<VibesBlameView
				theme={mockTheme}
				projectPath="/test/project"
			/>,
		);
		expect(screen.getByText('Select a file to view AI blame')).toBeTruthy();
		expect(screen.getByText(/Choose a file from the search above/)).toBeTruthy();
	});

	it('renders file search input', () => {
		render(
			<VibesBlameView
				theme={mockTheme}
				projectPath="/test/project"
			/>,
		);
		expect(screen.getByPlaceholderText('Type to filter files...')).toBeTruthy();
	});

	it('renders loading state when fetching blame data', async () => {
		// Make getBlame hang
		mockGetBlame.mockReturnValue(new Promise(() => {}));

		render(
			<VibesBlameView
				theme={mockTheme}
				projectPath="/test/project"
				initialFilePath="src/main.ts"
			/>,
		);

		await waitFor(() => {
			expect(screen.getByText('Loading blame data...')).toBeTruthy();
		});
	});

	it('renders blame entries after loading', async () => {
		render(
			<VibesBlameView
				theme={mockTheme}
				projectPath="/test/project"
				initialFilePath="src/main.ts"
			/>,
		);

		await waitFor(() => {
			expect(screen.getByText('L1-45')).toBeTruthy();
		});

		expect(screen.getByText('L46-80')).toBeTruthy();
		expect(screen.getByText('claude-sonnet-4-5-20250929')).toBeTruthy();
		expect(screen.getByText('gpt-4o')).toBeTruthy();
	});

	it('shows agent type badges', async () => {
		render(
			<VibesBlameView
				theme={mockTheme}
				projectPath="/test/project"
				initialFilePath="src/main.ts"
			/>,
		);

		await waitFor(() => {
			expect(screen.getByText('Claude Code')).toBeTruthy();
		});
		expect(screen.getByText('Codex')).toBeTruthy();
	});

	it('shows action badges', async () => {
		render(
			<VibesBlameView
				theme={mockTheme}
				projectPath="/test/project"
				initialFilePath="src/main.ts"
			/>,
		);

		await waitFor(() => {
			expect(screen.getByText('create')).toBeTruthy();
		});
		expect(screen.getByText('modify')).toBeTruthy();
	});

	it('shows shortened session IDs', async () => {
		render(
			<VibesBlameView
				theme={mockTheme}
				projectPath="/test/project"
				initialFilePath="src/main.ts"
			/>,
		);

		await waitFor(() => {
			expect(screen.getByText('abc12345')).toBeTruthy();
		});
		expect(screen.getByText('def12345')).toBeTruthy();
	});

	it('shows model versions', async () => {
		render(
			<VibesBlameView
				theme={mockTheme}
				projectPath="/test/project"
				initialFilePath="src/main.ts"
			/>,
		);

		await waitFor(() => {
			expect(screen.getByText('v1.0')).toBeTruthy();
		});
		expect(screen.getByText('v2024-11-20')).toBeTruthy();
	});

	it('shows footer with entry count and model count', async () => {
		render(
			<VibesBlameView
				theme={mockTheme}
				projectPath="/test/project"
				initialFilePath="src/main.ts"
			/>,
		);

		await waitFor(() => {
			expect(screen.getByText('2 blame entries')).toBeTruthy();
		});
		expect(screen.getByText('2 models')).toBeTruthy();
	});

	it('shows empty blame state when file has no blame data', async () => {
		mockGetBlame.mockResolvedValue({
			success: true,
			data: '[]',
		});

		render(
			<VibesBlameView
				theme={mockTheme}
				projectPath="/test/project"
				initialFilePath="src/empty.ts"
			/>,
		);

		await waitFor(() => {
			expect(screen.getByText('No blame data for this file')).toBeTruthy();
		});
	});

	it('shows Build Required notice when database not built', async () => {
		mockGetBlame.mockResolvedValue({
			success: false,
			error: 'audit.db not found. Run build first.',
		});

		render(
			<VibesBlameView
				theme={mockTheme}
				projectPath="/test/project"
				initialFilePath="src/main.ts"
			/>,
		);

		await waitFor(() => {
			expect(screen.getByText('Build Required')).toBeTruthy();
		});
		expect(screen.getByText('Build Now')).toBeTruthy();
	});

	it('calls build when Build Now button is clicked', async () => {
		mockGetBlame.mockResolvedValueOnce({
			success: false,
			error: 'audit.db not found. Run build first.',
		});

		render(
			<VibesBlameView
				theme={mockTheme}
				projectPath="/test/project"
				initialFilePath="src/main.ts"
			/>,
		);

		await waitFor(() => {
			expect(screen.getByText('Build Now')).toBeTruthy();
		});

		// After build, getBlame will succeed
		mockGetBlame.mockResolvedValueOnce({
			success: true,
			data: JSON.stringify(mockBlameData),
		});

		fireEvent.click(screen.getByText('Build Now'));

		await waitFor(() => {
			expect(mockBuild).toHaveBeenCalledWith('/test/project');
		});
	});

	it('shows error state on blame fetch failure', async () => {
		mockGetBlame.mockResolvedValue({
			success: false,
			error: 'Binary not found',
		});

		render(
			<VibesBlameView
				theme={mockTheme}
				projectPath="/test/project"
				initialFilePath="src/main.ts"
			/>,
		);

		await waitFor(() => {
			expect(screen.getByText('Binary not found')).toBeTruthy();
		});
	});

	it('fetches coverage files on mount', async () => {
		render(
			<VibesBlameView
				theme={mockTheme}
				projectPath="/test/project"
			/>,
		);

		await waitFor(() => {
			expect(mockGetCoverage).toHaveBeenCalledWith('/test/project');
		});
	});

	it('shows file dropdown on focus', async () => {
		render(
			<VibesBlameView
				theme={mockTheme}
				projectPath="/test/project"
			/>,
		);

		// Wait for coverage files to load
		await waitFor(() => {
			expect(mockGetCoverage).toHaveBeenCalled();
		});

		const input = screen.getByPlaceholderText('Type to filter files...');
		fireEvent.focus(input);

		await waitFor(() => {
			expect(screen.getByText('src/main.ts')).toBeTruthy();
			expect(screen.getByText('src/utils/helpers.ts')).toBeTruthy();
			expect(screen.getByText('src/components/App.tsx')).toBeTruthy();
		});
	});

	it('filters file dropdown based on search input', async () => {
		render(
			<VibesBlameView
				theme={mockTheme}
				projectPath="/test/project"
			/>,
		);

		await waitFor(() => {
			expect(mockGetCoverage).toHaveBeenCalled();
		});

		const input = screen.getByPlaceholderText('Type to filter files...');
		fireEvent.focus(input);
		fireEvent.change(input, { target: { value: 'utils' } });

		await waitFor(() => {
			expect(screen.getByText('src/utils/helpers.ts')).toBeTruthy();
		});

		// Other files should not be visible
		expect(screen.queryByText('src/main.ts')).toBeNull();
		expect(screen.queryByText('src/components/App.tsx')).toBeNull();
	});

	it('renders single-line range correctly', async () => {
		mockGetBlame.mockResolvedValue({
			success: true,
			data: JSON.stringify([
				{
					line_start: 10,
					line_end: 10,
					model_name: 'test-model',
					action: 'create',
					timestamp: new Date().toISOString(),
				},
			]),
		});

		render(
			<VibesBlameView
				theme={mockTheme}
				projectPath="/test/project"
				initialFilePath="src/single.ts"
			/>,
		);

		await waitFor(() => {
			expect(screen.getByText('L10')).toBeTruthy();
		});
	});
});
