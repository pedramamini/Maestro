import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { GhostIconButton } from '../../../../renderer/components/ui/GhostIconButton';

describe('GhostIconButton', () => {
	describe('rendering', () => {
		it('should render with default props', () => {
			render(
				<GhostIconButton aria-label="test button">
					<span data-testid="icon">X</span>
				</GhostIconButton>
			);

			const button = screen.getByRole('button', { name: 'test button' });
			expect(button).toBeInTheDocument();
			expect(button).toHaveAttribute('type', 'button');
			expect(screen.getByTestId('icon')).toBeInTheDocument();
		});

		it('should render icon prop when no children provided', () => {
			render(
				<GhostIconButton icon={<span data-testid="icon-prop">I</span>} aria-label="icon button" />
			);

			expect(screen.getByTestId('icon-prop')).toBeInTheDocument();
		});

		it('should prefer children over icon prop', () => {
			render(
				<GhostIconButton
					icon={<span data-testid="icon-prop">I</span>}
					aria-label="both"
				>
					<span data-testid="child">C</span>
				</GhostIconButton>
			);

			expect(screen.getByTestId('child')).toBeInTheDocument();
			expect(screen.queryByTestId('icon-prop')).not.toBeInTheDocument();
		});
	});

	describe('size', () => {
		it('should apply p-1 for size sm (default)', () => {
			render(
				<GhostIconButton aria-label="sm button">
					<span>X</span>
				</GhostIconButton>
			);

			const button = screen.getByRole('button');
			expect(button.className).toContain('p-1');
			expect(button.className).not.toContain('p-1.5');
		});

		it('should apply p-1.5 for size md', () => {
			render(
				<GhostIconButton size="md" aria-label="md button">
					<span>X</span>
				</GhostIconButton>
			);

			const button = screen.getByRole('button');
			expect(button.className).toContain('p-1.5');
		});
	});

	describe('showOnHover', () => {
		it('should not apply hover opacity classes by default', () => {
			render(
				<GhostIconButton aria-label="no hover">
					<span>X</span>
				</GhostIconButton>
			);

			const button = screen.getByRole('button');
			expect(button.className).not.toContain('opacity-0');
			expect(button.className).not.toContain('group-hover:opacity-100');
		});

		it('should apply opacity-0 group-hover:opacity-100 when showOnHover is true', () => {
			render(
				<GhostIconButton showOnHover aria-label="hover button">
					<span>X</span>
				</GhostIconButton>
			);

			const button = screen.getByRole('button');
			expect(button.className).toContain('opacity-0');
			expect(button.className).toContain('group-hover:opacity-100');
		});
	});

	describe('button props passthrough', () => {
		it('should handle onClick', () => {
			const onClick = vi.fn();
			render(
				<GhostIconButton onClick={onClick} aria-label="click me">
					<span>X</span>
				</GhostIconButton>
			);

			fireEvent.click(screen.getByRole('button'));
			expect(onClick).toHaveBeenCalledTimes(1);
		});

		it('should support disabled state', () => {
			const onClick = vi.fn();
			render(
				<GhostIconButton disabled onClick={onClick} aria-label="disabled">
					<span>X</span>
				</GhostIconButton>
			);

			const button = screen.getByRole('button');
			expect(button).toBeDisabled();
			fireEvent.click(button);
			expect(onClick).not.toHaveBeenCalled();
		});

		it('should pass through aria-label', () => {
			render(
				<GhostIconButton aria-label="Close panel">
					<span>X</span>
				</GhostIconButton>
			);

			expect(screen.getByRole('button', { name: 'Close panel' })).toBeInTheDocument();
		});
	});

	describe('tooltip', () => {
		it('should set title attribute when tooltip prop provided', () => {
			render(
				<GhostIconButton tooltip="Refresh data" aria-label="refresh">
					<span>R</span>
				</GhostIconButton>
			);

			const button = screen.getByRole('button');
			expect(button).toHaveAttribute('title', 'Refresh data');
		});

		it('should not set title when tooltip not provided', () => {
			render(
				<GhostIconButton aria-label="no tooltip">
					<span>X</span>
				</GhostIconButton>
			);

			const button = screen.getByRole('button');
			expect(button).not.toHaveAttribute('title');
		});
	});

	describe('className', () => {
		it('should merge additional className with base classes', () => {
			render(
				<GhostIconButton className="ml-2 shrink-0" aria-label="custom">
					<span>X</span>
				</GhostIconButton>
			);

			const button = screen.getByRole('button');
			expect(button.className).toContain('ml-2');
			expect(button.className).toContain('shrink-0');
			expect(button.className).toContain('hover:bg-white/10');
		});

		it('should always include base classes', () => {
			render(
				<GhostIconButton aria-label="base">
					<span>X</span>
				</GhostIconButton>
			);

			const button = screen.getByRole('button');
			expect(button.className).toContain('rounded');
			expect(button.className).toContain('hover:bg-white/10');
			expect(button.className).toContain('transition-colors');
		});
	});
});
