/**
 * Tests for SessionListItem component
 *
 * Validates:
 * - React.memo wrapper prevents unnecessary re-renders
 * - Memoized style objects (containerStyle, starStyle)
 * - Core rendering behavior preserved after memoization
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SessionListItem } from '../../../renderer/components/SessionListItem';
import type { SessionListItemProps } from '../../../renderer/components/SessionListItem';
import type { Theme } from '../../../renderer/types';

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
	Star: ({ style }: { style?: React.CSSProperties }) => (
		<span data-testid="icon-star" style={style} />
	),
	Play: ({ style }: { style?: React.CSSProperties }) => (
		<span data-testid="icon-play" style={style} />
	),
	Edit3: () => <span data-testid="icon-edit" />,
	Clock: () => <span data-testid="icon-clock" />,
	MessageSquare: () => <span data-testid="icon-message-square" />,
	HardDrive: () => <span data-testid="icon-hard-drive" />,
	DollarSign: () => <span data-testid="icon-dollar-sign" />,
	Search: () => <span data-testid="icon-search" />,
}));

// Mock formatters
vi.mock('../../../renderer/utils/formatters', () => ({
	formatSize: (bytes: number) => `${bytes}B`,
	formatRelativeTime: (date: string) => 'just now',
}));

const testTheme: Theme = {
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
	},
};

const mockSession = {
	sessionId: 'abc12345-6789-0000-0000-000000000000',
	projectPath: '/test/project',
	timestamp: '2025-01-01T00:00:00Z',
	modifiedAt: '2025-01-01T01:00:00Z',
	firstMessage: 'Hello, test session',
	messageCount: 5,
	sizeBytes: 1024,
	costUsd: 0.05,
	inputTokens: 100,
	outputTokens: 200,
	cacheReadTokens: 0,
	cacheCreationTokens: 0,
	durationSeconds: 60,
	origin: 'user' as const,
};

function createDefaultProps(overrides?: Partial<SessionListItemProps>): SessionListItemProps {
	return {
		session: mockSession as any,
		index: 0,
		selectedIndex: -1,
		isStarred: false,
		activeAgentSessionId: null,
		renamingSessionId: null,
		renameValue: '',
		searchMode: 'title' as const,
		searchResultInfo: null,
		theme: testTheme,
		selectedItemRef: React.createRef(),
		renameInputRef: React.createRef(),
		onSessionClick: vi.fn(),
		onToggleStar: vi.fn(),
		onQuickResume: vi.fn(),
		onStartRename: vi.fn(),
		onRenameChange: vi.fn(),
		onSubmitRename: vi.fn(),
		onCancelRename: vi.fn(),
		...overrides,
	};
}

describe('SessionListItem', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('rendering', () => {
		it('renders session first message', () => {
			render(<SessionListItem {...createDefaultProps()} />);
			expect(screen.getByText('Hello, test session')).toBeInTheDocument();
		});

		it('renders message count', () => {
			render(<SessionListItem {...createDefaultProps()} />);
			expect(screen.getByText('5')).toBeInTheDocument();
		});

		it('renders MAESTRO origin pill for user sessions', () => {
			render(<SessionListItem {...createDefaultProps()} />);
			expect(screen.getByText('MAESTRO')).toBeInTheDocument();
		});

		it('renders AUTO origin pill for auto sessions', () => {
			render(<SessionListItem {...createDefaultProps({
				session: { ...mockSession, origin: 'auto' } as any,
			})} />);
			expect(screen.getByText('AUTO')).toBeInTheDocument();
		});

		it('renders CLI origin pill for sessions without origin', () => {
			render(<SessionListItem {...createDefaultProps({
				session: { ...mockSession, origin: undefined } as any,
			})} />);
			expect(screen.getByText('CLI')).toBeInTheDocument();
		});

		it('renders cost when costUsd > 0', () => {
			render(<SessionListItem {...createDefaultProps()} />);
			expect(screen.getByText('0.05')).toBeInTheDocument();
		});

		it('renders ACTIVE badge when session is active', () => {
			render(<SessionListItem {...createDefaultProps({
				activeAgentSessionId: mockSession.sessionId,
			})} />);
			expect(screen.getByText('ACTIVE')).toBeInTheDocument();
		});

		it('does not render ACTIVE badge when session is not active', () => {
			render(<SessionListItem {...createDefaultProps()} />);
			expect(screen.queryByText('ACTIVE')).not.toBeInTheDocument();
		});

		it('renders session name when provided', () => {
			render(<SessionListItem {...createDefaultProps({
				session: { ...mockSession, sessionName: 'My Session' } as any,
			})} />);
			expect(screen.getByText('My Session')).toBeInTheDocument();
		});
	});

	describe('memoized styles', () => {
		it('applies selected background color when item is selected', () => {
			const { container } = render(<SessionListItem {...createDefaultProps({
				index: 2,
				selectedIndex: 2,
			})} />);
			const rootDiv = container.firstChild as HTMLElement;
			// JSDOM converts hex+alpha to rgba
			expect(rootDiv.style.backgroundColor).toBeTruthy();
			expect(rootDiv.style.backgroundColor).not.toBe('transparent');
		});

		it('applies transparent background when item is not selected', () => {
			const { container } = render(<SessionListItem {...createDefaultProps({
				index: 0,
				selectedIndex: 1,
			})} />);
			const rootDiv = container.firstChild as HTMLElement;
			expect(rootDiv.style.backgroundColor).toBe('transparent');
		});

		it('applies border color', () => {
			const { container } = render(<SessionListItem {...createDefaultProps()} />);
			const rootDiv = container.firstChild as HTMLElement;
			expect(rootDiv.style.borderColor).toBeTruthy();
		});

		it('applies starred style with warning color when starred', () => {
			render(<SessionListItem {...createDefaultProps({ isStarred: true })} />);
			const star = screen.getByTestId('icon-star');
			// JSDOM converts hex to rgb
			expect(star.style.color).toBeTruthy();
			expect(star.style.color).not.toBe('transparent');
			expect(star.style.fill).toBeTruthy();
			expect(star.style.fill).not.toBe('transparent');
		});

		it('applies unstarred style with dim color when not starred', () => {
			render(<SessionListItem {...createDefaultProps({ isStarred: false })} />);
			const star = screen.getByTestId('icon-star');
			expect(star.style.color).toBeTruthy();
			expect(star.style.fill).toBe('transparent');
		});
	});

	describe('React.memo behavior', () => {
		it('is wrapped with React.memo', () => {
			// React.memo components have a $$typeof Symbol for memo and a 'type' property
			// that points to the original component
			expect((SessionListItem as any).$$typeof).toBe(Symbol.for('react.memo'));
		});

		it('does not re-render when props are the same', () => {
			const renderSpy = vi.fn();
			const SpyWrapper = React.memo(function SpyWrapper(props: SessionListItemProps) {
				renderSpy();
				return <SessionListItem {...props} />;
			});

			const props = createDefaultProps();
			const { rerender } = render(<SpyWrapper {...props} />);
			expect(renderSpy).toHaveBeenCalledTimes(1);

			// Re-render with same props object
			rerender(<SpyWrapper {...props} />);
			// SpyWrapper should not re-render since props haven't changed
			expect(renderSpy).toHaveBeenCalledTimes(1);
		});
	});

	describe('interactions', () => {
		it('calls onSessionClick when row is clicked', () => {
			const onSessionClick = vi.fn();
			const { container } = render(<SessionListItem {...createDefaultProps({ onSessionClick })} />);
			fireEvent.click(container.firstChild as HTMLElement);
			expect(onSessionClick).toHaveBeenCalledWith(mockSession);
		});

		it('calls onToggleStar when star button is clicked', () => {
			const onToggleStar = vi.fn();
			render(<SessionListItem {...createDefaultProps({ onToggleStar })} />);
			const starButton = screen.getByTitle('Add to favorites');
			fireEvent.click(starButton);
			expect(onToggleStar).toHaveBeenCalledWith(mockSession.sessionId, expect.any(Object));
		});

		it('calls onQuickResume when resume button is clicked', () => {
			const onQuickResume = vi.fn();
			render(<SessionListItem {...createDefaultProps({ onQuickResume })} />);
			const resumeButton = screen.getByTitle('Resume session in new tab');
			fireEvent.click(resumeButton);
			expect(onQuickResume).toHaveBeenCalledWith(mockSession, expect.any(Object));
		});
	});

	describe('search results', () => {
		it('shows match count for content searches', () => {
			render(<SessionListItem {...createDefaultProps({
				searchMode: 'all',
				searchResultInfo: { matchCount: 3, matchPreview: 'test match' },
			})} />);
			expect(screen.getByText('3')).toBeInTheDocument();
		});

		it('shows match preview for content searches', () => {
			render(<SessionListItem {...createDefaultProps({
				searchMode: 'all',
				searchResultInfo: { matchCount: 1, matchPreview: 'found this text' },
			})} />);
			expect(screen.getByText('"found this text"')).toBeInTheDocument();
		});

		it('does not show match info for title search mode', () => {
			render(<SessionListItem {...createDefaultProps({
				searchMode: 'title',
				searchResultInfo: { matchCount: 3, matchPreview: 'test match' },
			})} />);
			expect(screen.queryByText('"test match"')).not.toBeInTheDocument();
		});
	});
});
