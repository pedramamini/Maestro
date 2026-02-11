import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SessionItem } from '../../../renderer/components/SessionItem';
import type { Session, Theme } from '../../../renderer/types';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('lucide-react', () => ({
	Activity: () => <span data-testid="icon-activity">Activity</span>,
	GitBranch: () => <span data-testid="icon-gitbranch">GitBranch</span>,
	Bot: () => <span data-testid="icon-bot">Bot</span>,
	Bookmark: ({ fill }: { fill?: string }) => (
		<span data-testid="icon-bookmark" data-fill={fill}>Bookmark</span>
	),
	AlertCircle: () => <span data-testid="icon-alert">AlertCircle</span>,
	Server: () => <span data-testid="icon-server">Server</span>,
	Shield: () => <span data-testid="icon-shield">Shield</span>,
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

function makeSession(overrides: Partial<Session> = {}): Session {
	return {
		id: 'test-session',
		name: 'Test Session',
		toolType: 'claude-code',
		state: 'idle',
		cwd: '/project/test',
		fullPath: '/project/test',
		projectRoot: '/project/test',
		aiLogs: [],
		shellLogs: [],
		workLog: [],
		contextUsage: 0,
		inputMode: 'ai',
		aiPid: 0,
		terminalPid: 0,
		port: 0,
		isLive: false,
		changedFiles: [],
		isGitRepo: false,
		fileTree: [],
		fileExplorerExpanded: [],
		fileExplorerScrollPos: 0,
		...overrides,
	} as Session;
}

const baseProps = {
	session: makeSession(),
	variant: 'flat' as const,
	theme: mockTheme,
	isActive: false,
	isKeyboardSelected: false,
	isDragging: false,
	isEditing: false,
	leftSidebarOpen: true,
	onSelect: vi.fn(),
	onDragStart: vi.fn(),
	onContextMenu: vi.fn(),
	onFinishRename: vi.fn(),
	onStartRename: vi.fn(),
	onToggleBookmark: vi.fn(),
};

// ============================================================================
// Tests
// ============================================================================

describe('SessionItem VIBES Badge', () => {
	it('should not show VIBES badge when vibesEnabled is false', () => {
		render(
			<SessionItem
				{...baseProps}
				vibesEnabled={false}
				vibesActive={true}
				vibesAssuranceLevel="medium"
				vibesAnnotationCount={42}
			/>
		);

		expect(screen.queryByTestId('icon-shield')).not.toBeInTheDocument();
	});

	it('should not show VIBES badge when vibesActive is false', () => {
		render(
			<SessionItem
				{...baseProps}
				vibesEnabled={true}
				vibesActive={false}
				vibesAssuranceLevel="medium"
				vibesAnnotationCount={42}
			/>
		);

		expect(screen.queryByTestId('icon-shield')).not.toBeInTheDocument();
	});

	it('should show VIBES badge when both vibesEnabled and vibesActive are true', () => {
		render(
			<SessionItem
				{...baseProps}
				vibesEnabled={true}
				vibesActive={true}
				vibesAssuranceLevel="medium"
				vibesAnnotationCount={10}
			/>
		);

		expect(screen.getByTestId('icon-shield')).toBeInTheDocument();
	});

	it('should show "M" for medium assurance level', () => {
		render(
			<SessionItem
				{...baseProps}
				vibesEnabled={true}
				vibesActive={true}
				vibesAssuranceLevel="medium"
				vibesAnnotationCount={5}
			/>
		);

		expect(screen.getByText('M')).toBeInTheDocument();
	});

	it('should show "H" for high assurance level', () => {
		render(
			<SessionItem
				{...baseProps}
				vibesEnabled={true}
				vibesActive={true}
				vibesAssuranceLevel="high"
				vibesAnnotationCount={5}
			/>
		);

		expect(screen.getByText('H')).toBeInTheDocument();
	});

	it('should show "L" for low assurance level', () => {
		render(
			<SessionItem
				{...baseProps}
				vibesEnabled={true}
				vibesActive={true}
				vibesAssuranceLevel="low"
				vibesAnnotationCount={5}
			/>
		);

		expect(screen.getByText('L')).toBeInTheDocument();
	});

	it('should show annotation count when greater than 0', () => {
		render(
			<SessionItem
				{...baseProps}
				vibesEnabled={true}
				vibesActive={true}
				vibesAssuranceLevel="medium"
				vibesAnnotationCount={42}
			/>
		);

		expect(screen.getByText('42')).toBeInTheDocument();
	});

	it('should not show annotation count when 0', () => {
		render(
			<SessionItem
				{...baseProps}
				vibesEnabled={true}
				vibesActive={true}
				vibesAssuranceLevel="medium"
				vibesAnnotationCount={0}
			/>
		);

		// Should show "M" but not "0"
		expect(screen.getByText('M')).toBeInTheDocument();
		expect(screen.queryByText('0')).not.toBeInTheDocument();
	});

	it('should use success color for high assurance level', () => {
		render(
			<SessionItem
				{...baseProps}
				vibesEnabled={true}
				vibesActive={true}
				vibesAssuranceLevel="high"
				vibesAnnotationCount={5}
			/>
		);

		// Find the VIBES badge div (contains Shield icon)
		const shieldIcon = screen.getByTestId('icon-shield');
		const badgeDiv = shieldIcon.closest('div');
		expect(badgeDiv).toBeTruthy();
		// jsdom converts hex to rgb, so compare as rgb(80, 250, 123) for #50fa7b
		expect(badgeDiv!.style.color).toBe('rgb(80, 250, 123)');
	});

	it('should use warning color for low assurance level', () => {
		render(
			<SessionItem
				{...baseProps}
				vibesEnabled={true}
				vibesActive={true}
				vibesAssuranceLevel="low"
				vibesAnnotationCount={5}
			/>
		);

		const shieldIcon = screen.getByTestId('icon-shield');
		const badgeDiv = shieldIcon.closest('div');
		expect(badgeDiv).toBeTruthy();
		// jsdom converts hex to rgb, so compare as rgb(241, 250, 140) for #f1fa8c
		expect(badgeDiv!.style.color).toBe('rgb(241, 250, 140)');
	});

	it('should use accent color for medium assurance level', () => {
		render(
			<SessionItem
				{...baseProps}
				vibesEnabled={true}
				vibesActive={true}
				vibesAssuranceLevel="medium"
				vibesAnnotationCount={5}
			/>
		);

		const shieldIcon = screen.getByTestId('icon-shield');
		const badgeDiv = shieldIcon.closest('div');
		expect(badgeDiv).toBeTruthy();
		// jsdom converts hex to rgb, so compare as rgb(189, 147, 249) for #bd93f9
		expect(badgeDiv!.style.color).toBe('rgb(189, 147, 249)');
	});

	it('should include tooltip with assurance level and annotation count', () => {
		render(
			<SessionItem
				{...baseProps}
				vibesEnabled={true}
				vibesActive={true}
				vibesAssuranceLevel="high"
				vibesAnnotationCount={100}
			/>
		);

		const shieldIcon = screen.getByTestId('icon-shield');
		const badgeDiv = shieldIcon.closest('div');
		expect(badgeDiv!.title).toContain('HIGH');
		expect(badgeDiv!.title).toContain('100');
	});

	it('should not show VIBES badge without vibes props', () => {
		render(<SessionItem {...baseProps} />);

		expect(screen.queryByTestId('icon-shield')).not.toBeInTheDocument();
	});
});
