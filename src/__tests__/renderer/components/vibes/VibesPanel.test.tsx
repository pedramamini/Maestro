import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VibesPanel } from '../../../../renderer/components/vibes/VibesPanel';

// ============================================================================
// Mocks
// ============================================================================

const mockVibesData = {
	isInitialized: true,
	stats: null,
	annotations: [],
	sessions: [],
	models: [],
	isLoading: false,
	error: null,
	refresh: vi.fn(),
	initialize: vi.fn(),
};

let mockVibesEnabled = true;
const mockVibesAssuranceLevel = 'medium';

vi.mock('../../../../renderer/hooks', () => ({
	useSettings: () => ({
		vibesEnabled: mockVibesEnabled,
		vibesAssuranceLevel: mockVibesAssuranceLevel,
	}),
	useVibesData: () => mockVibesData,
}));

// Mock child components to test rendering without complex dependencies
vi.mock('../../../../renderer/components/vibes/VibesDashboard', () => ({
	VibesDashboard: (props: Record<string, unknown>) => (
		<div data-testid="vibes-dashboard">
			Dashboard: enabled={String(props.vibesEnabled)} level={String(props.vibesAssuranceLevel)}
		</div>
	),
}));

vi.mock('../../../../renderer/components/vibes/VibesAnnotationLog', () => ({
	VibesAnnotationLog: () => (
		<div data-testid="vibes-annotation-log">AnnotationLog</div>
	),
}));

vi.mock('../../../../renderer/components/vibes/VibesModelAttribution', () => ({
	VibesModelAttribution: () => (
		<div data-testid="vibes-model-attribution">ModelAttribution</div>
	),
}));

vi.mock('lucide-react', () => ({
	Shield: () => <span data-testid="icon-shield">Shield</span>,
	Settings: () => <span data-testid="icon-settings">Settings</span>,
}));

const mockTheme = {
	id: 'dracula',
	name: 'Dracula',
	mode: 'dark' as const,
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

// ============================================================================
// Tests
// ============================================================================

describe('VibesPanel', () => {
	beforeEach(() => {
		mockVibesEnabled = true;
		vi.clearAllMocks();
	});

	// ========================================================================
	// Disabled state
	// ========================================================================

	it('renders disabled state when vibesEnabled is false', () => {
		mockVibesEnabled = false;
		render(<VibesPanel theme={mockTheme} projectPath="/project" />);

		expect(screen.getByText('VIBES is disabled')).toBeTruthy();
		expect(screen.getByText(/Enable VIBES in Settings/)).toBeTruthy();
		expect(screen.getByText('Open Settings')).toBeTruthy();
	});

	it('dispatches tour:action event when Open Settings is clicked', () => {
		mockVibesEnabled = false;
		const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

		render(<VibesPanel theme={mockTheme} projectPath="/project" />);
		fireEvent.click(screen.getByText('Open Settings'));

		expect(dispatchSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'tour:action',
				detail: { type: 'openSettings' },
			}),
		);
		dispatchSpy.mockRestore();
	});

	// ========================================================================
	// Sub-tab navigation
	// ========================================================================

	it('renders sub-tab navigation with Overview, Log, Models', () => {
		render(<VibesPanel theme={mockTheme} projectPath="/project" />);

		expect(screen.getByText('Overview')).toBeTruthy();
		expect(screen.getByText('Log')).toBeTruthy();
		expect(screen.getByText('Models')).toBeTruthy();
	});

	it('defaults to Overview sub-tab', () => {
		render(<VibesPanel theme={mockTheme} projectPath="/project" />);

		expect(screen.getByTestId('vibes-dashboard')).toBeTruthy();
		expect(screen.queryByTestId('vibes-annotation-log')).toBeNull();
		expect(screen.queryByTestId('vibes-model-attribution')).toBeNull();
	});

	it('switches to Log sub-tab when clicked', () => {
		render(<VibesPanel theme={mockTheme} projectPath="/project" />);

		fireEvent.click(screen.getByText('Log'));

		expect(screen.queryByTestId('vibes-dashboard')).toBeNull();
		expect(screen.getByTestId('vibes-annotation-log')).toBeTruthy();
		expect(screen.queryByTestId('vibes-model-attribution')).toBeNull();
	});

	it('switches to Models sub-tab when clicked', () => {
		render(<VibesPanel theme={mockTheme} projectPath="/project" />);

		fireEvent.click(screen.getByText('Models'));

		expect(screen.queryByTestId('vibes-dashboard')).toBeNull();
		expect(screen.queryByTestId('vibes-annotation-log')).toBeNull();
		expect(screen.getByTestId('vibes-model-attribution')).toBeTruthy();
	});

	it('switches back to Overview from another tab', () => {
		render(<VibesPanel theme={mockTheme} projectPath="/project" />);

		// Go to Log
		fireEvent.click(screen.getByText('Log'));
		expect(screen.getByTestId('vibes-annotation-log')).toBeTruthy();

		// Back to Overview
		fireEvent.click(screen.getByText('Overview'));
		expect(screen.getByTestId('vibes-dashboard')).toBeTruthy();
		expect(screen.queryByTestId('vibes-annotation-log')).toBeNull();
	});

	// ========================================================================
	// Props passing
	// ========================================================================

	it('passes vibesEnabled and vibesAssuranceLevel to VibesDashboard', () => {
		render(<VibesPanel theme={mockTheme} projectPath="/project" />);

		const dashboard = screen.getByTestId('vibes-dashboard');
		expect(dashboard.textContent).toContain('enabled=true');
		expect(dashboard.textContent).toContain('level=medium');
	});

	it('renders with undefined projectPath', () => {
		render(<VibesPanel theme={mockTheme} projectPath={undefined} />);

		// Should still render the sub-tab navigation and dashboard
		expect(screen.getByText('Overview')).toBeTruthy();
		expect(screen.getByTestId('vibes-dashboard')).toBeTruthy();
	});

	// ========================================================================
	// Active tab styling
	// ========================================================================

	it('highlights the active sub-tab with accent color', () => {
		render(<VibesPanel theme={mockTheme} projectPath="/project" />);

		const overviewTab = screen.getByText('Overview');
		const logTab = screen.getByText('Log');

		// Overview should be active by default — borderColor may be hex or rgb
		expect(overviewTab.style.borderColor).not.toBe('transparent');
		expect(logTab.style.borderColor).toBe('transparent');

		// Switch to Log
		fireEvent.click(logTab);
		expect(logTab.style.borderColor).not.toBe('transparent');
		expect(overviewTab.style.borderColor).toBe('transparent');
	});
});
