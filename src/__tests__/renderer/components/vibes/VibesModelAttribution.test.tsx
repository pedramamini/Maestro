import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VibesModelAttribution } from '../../../../renderer/components/vibes/VibesModelAttribution';
import type { Theme } from '../../../../renderer/types';
import type { VibesModelInfo } from '../../../../renderer/hooks';

// Mock lucide-react
vi.mock('lucide-react', () => ({
	Cpu: () => <span data-testid="icon-cpu">Cpu</span>,
	Award: () => <span data-testid="icon-award">Award</span>,
	BarChart3: () => <span data-testid="icon-barchart">BarChart3</span>,
	Clock: () => <span data-testid="icon-clock">Clock</span>,
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

const mockModels: VibesModelInfo[] = [
	{
		modelName: 'claude-sonnet-4-5-20250929',
		modelVersion: '1.0',
		toolName: 'claude-code',
		annotationCount: 150,
		percentage: 60.0,
	},
	{
		modelName: 'gpt-4o',
		modelVersion: '2024-11-20',
		toolName: 'codex',
		annotationCount: 75,
		percentage: 30.0,
	},
	{
		modelName: 'claude-haiku-4-5-20251001',
		toolName: 'maestro',
		annotationCount: 25,
		percentage: 10.0,
	},
];

describe('VibesModelAttribution', () => {
	it('renders loading state', () => {
		render(
			<VibesModelAttribution
				theme={mockTheme}
				models={[]}
				isLoading={true}
			/>,
		);
		expect(screen.getByText('Loading model data...')).toBeTruthy();
	});

	it('renders empty state when no models', () => {
		render(
			<VibesModelAttribution
				theme={mockTheme}
				models={[]}
				isLoading={false}
			/>,
		);
		expect(screen.getByText('No models recorded')).toBeTruthy();
		expect(screen.getByText(/Model attribution data will appear/)).toBeTruthy();
	});

	it('renders model list with all models', () => {
		render(
			<VibesModelAttribution
				theme={mockTheme}
				models={mockModels}
				isLoading={false}
			/>,
		);

		// Primary model appears in summary card + model list, others appear once
		const sonnetElements = screen.getAllByText('claude-sonnet-4-5-20250929');
		expect(sonnetElements.length).toBe(2); // Primary card + list row
		expect(screen.getByText('gpt-4o')).toBeTruthy();
		expect(screen.getByText('claude-haiku-4-5-20251001')).toBeTruthy();
	});

	it('shows total models count in summary', () => {
		render(
			<VibesModelAttribution
				theme={mockTheme}
				models={mockModels}
				isLoading={false}
			/>,
		);

		expect(screen.getByText('Total Models')).toBeTruthy();
		expect(screen.getByText('3')).toBeTruthy();
	});

	it('shows total annotations in summary', () => {
		render(
			<VibesModelAttribution
				theme={mockTheme}
				models={mockModels}
				isLoading={false}
			/>,
		);

		expect(screen.getByText('Total Annotations')).toBeTruthy();
		expect(screen.getByText('250')).toBeTruthy();
	});

	it('shows primary model with highest annotation count', () => {
		render(
			<VibesModelAttribution
				theme={mockTheme}
				models={mockModels}
				isLoading={false}
			/>,
		);

		expect(screen.getByText('Primary Model')).toBeTruthy();
		// Primary model percentage shown in summary card + model row
		const sixtyPercent = screen.getAllByText('60.0%');
		expect(sixtyPercent.length).toBe(2);
	});

	it('shows model version when available', () => {
		render(
			<VibesModelAttribution
				theme={mockTheme}
				models={mockModels}
				isLoading={false}
			/>,
		);

		// v1.0 appears in primary model card + model row for the top model
		const v10 = screen.getAllByText('v1.0');
		expect(v10.length).toBeGreaterThanOrEqual(1);
		expect(screen.getByText('v2024-11-20')).toBeTruthy();
	});

	it('formats tool names correctly', () => {
		render(
			<VibesModelAttribution
				theme={mockTheme}
				models={mockModels}
				isLoading={false}
			/>,
		);

		expect(screen.getByText('Claude Code')).toBeTruthy();
		expect(screen.getByText('Codex')).toBeTruthy();
		expect(screen.getByText('Maestro')).toBeTruthy();
	});

	it('shows annotation counts for each model', () => {
		render(
			<VibesModelAttribution
				theme={mockTheme}
				models={mockModels}
				isLoading={false}
			/>,
		);

		expect(screen.getByText('150 ann')).toBeTruthy();
		expect(screen.getByText('75 ann')).toBeTruthy();
		expect(screen.getByText('25 ann')).toBeTruthy();
	});

	it('shows percentages for each model', () => {
		render(
			<VibesModelAttribution
				theme={mockTheme}
				models={mockModels}
				isLoading={false}
			/>,
		);

		// The primary model card has "60.0%" and the model row also has "60.0%"
		const sixtyPercent = screen.getAllByText('60.0%');
		expect(sixtyPercent.length).toBeGreaterThanOrEqual(1);
		expect(screen.getByText('30.0%')).toBeTruthy();
		expect(screen.getByText('10.0%')).toBeTruthy();
	});

	it('shows model contributions header with count', () => {
		render(
			<VibesModelAttribution
				theme={mockTheme}
				models={mockModels}
				isLoading={false}
			/>,
		);

		expect(screen.getByText('Model Contributions')).toBeTruthy();
		expect(screen.getByText('(3)')).toBeTruthy();
	});

	it('sorts models by annotation count descending', () => {
		const unsortedModels: VibesModelInfo[] = [
			{
				modelName: 'small-model',
				annotationCount: 10,
				percentage: 10,
			},
			{
				modelName: 'big-model',
				annotationCount: 90,
				percentage: 90,
			},
		];

		render(
			<VibesModelAttribution
				theme={mockTheme}
				models={unsortedModels}
				isLoading={false}
			/>,
		);

		// Primary model should be the one with most annotations
		expect(screen.getByText('Primary Model')).toBeTruthy();
		// big-model appears in primary card + model list
		const bigModelElements = screen.getAllByText('big-model');
		expect(bigModelElements.length).toBe(2);
	});

	it('handles single model correctly', () => {
		const singleModel: VibesModelInfo[] = [
			{
				modelName: 'only-model',
				modelVersion: '2.0',
				toolName: 'claude-code',
				annotationCount: 42,
				percentage: 100,
			},
		];

		render(
			<VibesModelAttribution
				theme={mockTheme}
				models={singleModel}
				isLoading={false}
			/>,
		);

		// Model name appears in primary card + list row
		const modelElements = screen.getAllByText('only-model');
		expect(modelElements.length).toBe(2);
		expect(screen.getByText('Total Models')).toBeTruthy();
		expect(screen.getByText('1')).toBeTruthy(); // Total Models = 1
		expect(screen.getByText('Total Annotations')).toBeTruthy();
		expect(screen.getByText('42')).toBeTruthy(); // Total Annotations = 42
		// 100.0% appears in primary card + model row
		const percentElements = screen.getAllByText('100.0%');
		expect(percentElements.length).toBe(2);
	});

	it('shows "Unknown" for models without tool name', () => {
		const noToolModel: VibesModelInfo[] = [
			{
				modelName: 'mystery-model',
				annotationCount: 5,
				percentage: 100,
			},
		];

		render(
			<VibesModelAttribution
				theme={mockTheme}
				models={noToolModel}
				isLoading={false}
			/>,
		);

		expect(screen.getByText('Unknown')).toBeTruthy();
	});
});
