import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { EmptyState } from '../../../../renderer/components/ui/EmptyState';
import { createMockTheme } from '../../../helpers/mockTheme';

const theme = createMockTheme();

describe('EmptyState', () => {
	describe('message-only rendering', () => {
		it('should render the message text', () => {
			render(<EmptyState theme={theme} message="No items found" />);
			expect(screen.getByText('No items found')).toBeInTheDocument();
		});

		it('should apply textDim color to message', () => {
			render(<EmptyState theme={theme} message="No items found" />);
			const msg = screen.getByText('No items found');
			expect(msg).toHaveStyle({ color: theme.colors.textDim });
		});

		it('should render with default test ID', () => {
			render(<EmptyState theme={theme} message="No items" />);
			expect(screen.getByTestId('empty-state')).toBeInTheDocument();
		});

		it('should not render icon, description, or action when not provided', () => {
			const { container } = render(<EmptyState theme={theme} message="Empty" />);
			const wrapper = screen.getByTestId('empty-state');
			// Only the message <p> should be a direct child
			expect(wrapper.querySelectorAll('button')).toHaveLength(0);
			expect(container.querySelectorAll('.opacity-30')).toHaveLength(0);
		});
	});

	describe('icon + message rendering', () => {
		it('should render the icon when provided', () => {
			render(
				<EmptyState theme={theme} message="No files" icon={<svg data-testid="test-icon" />} />
			);
			expect(screen.getByTestId('test-icon')).toBeInTheDocument();
		});

		it('should apply opacity-30 to the icon wrapper', () => {
			const { container } = render(
				<EmptyState theme={theme} message="No files" icon={<svg data-testid="test-icon" />} />
			);
			const iconWrapper = container.querySelector('.opacity-30');
			expect(iconWrapper).toBeInTheDocument();
			expect(iconWrapper!.querySelector('[data-testid="test-icon"]')).toBeInTheDocument();
		});
	});

	describe('icon + message + description rendering', () => {
		it('should render the description when provided', () => {
			render(
				<EmptyState
					theme={theme}
					message="No results"
					icon={<svg data-testid="test-icon" />}
					description="Try adjusting your search"
				/>
			);
			expect(screen.getByText('No results')).toBeInTheDocument();
			expect(screen.getByText('Try adjusting your search')).toBeInTheDocument();
			expect(screen.getByTestId('test-icon')).toBeInTheDocument();
		});

		it('should render description with smaller text', () => {
			render(<EmptyState theme={theme} message="No items" description="Check back later" />);
			const desc = screen.getByText('Check back later');
			expect(desc.className).toContain('text-xs');
		});
	});

	describe('full props: icon + message + description + action', () => {
		it('should render all elements', () => {
			const onClick = vi.fn();
			render(
				<EmptyState
					theme={theme}
					message="No data"
					icon={<svg data-testid="test-icon" />}
					description="Start using the app"
					action={{ label: 'Get started', onClick }}
				/>
			);
			expect(screen.getByTestId('test-icon')).toBeInTheDocument();
			expect(screen.getByText('No data')).toBeInTheDocument();
			expect(screen.getByText('Start using the app')).toBeInTheDocument();
			expect(screen.getByText('Get started')).toBeInTheDocument();
		});
	});

	describe('action button onClick', () => {
		it('should fire onClick when action button is clicked', () => {
			const onClick = vi.fn();
			render(<EmptyState theme={theme} message="Empty" action={{ label: 'Retry', onClick }} />);
			fireEvent.click(screen.getByText('Retry'));
			expect(onClick).toHaveBeenCalledTimes(1);
		});

		it('should style the action button with accent color', () => {
			const onClick = vi.fn();
			render(<EmptyState theme={theme} message="Empty" action={{ label: 'Retry', onClick }} />);
			const btn = screen.getByText('Retry');
			expect(btn).toHaveStyle({ color: theme.colors.accent });
		});
	});

	describe('className passthrough', () => {
		it('should apply additional className to the container', () => {
			render(<EmptyState theme={theme} message="Test" className="py-8 h-full" />);
			const container = screen.getByTestId('empty-state');
			expect(container.className).toContain('py-8');
			expect(container.className).toContain('h-full');
		});

		it('should always include flex centering classes', () => {
			render(<EmptyState theme={theme} message="Test" className="extra" />);
			const container = screen.getByTestId('empty-state');
			expect(container.className).toContain('flex');
			expect(container.className).toContain('items-center');
			expect(container.className).toContain('justify-center');
		});
	});

	describe('custom testId', () => {
		it('should use custom testId when provided', () => {
			render(<EmptyState theme={theme} message="Test" testId="custom-empty" />);
			expect(screen.getByTestId('custom-empty')).toBeInTheDocument();
		});
	});
});
