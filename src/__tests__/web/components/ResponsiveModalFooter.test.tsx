/**
 * Tests for ResponsiveModalFooter component (Phase 4 Task 4.3).
 *
 * jsdom doesn't load the Tailwind stylesheet, so layout checks assert on the
 * className substrings produced by the underlying `Button` / `fullWidth` path
 * rather than computed styles. The useBreakpoint mock flips `isPhone` per
 * describe block to cover both responsive branches.
 *
 * @vitest-environment jsdom
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

import { ResponsiveModalFooter } from '../../../web/components/ResponsiveModalFooter';

// Breakpoint mock — controlled per test via `setIsPhone`.
let isPhone = false;
function setIsPhone(next: boolean) {
	isPhone = next;
}
vi.mock('../../../web/hooks/useBreakpoint', () => ({
	useBreakpoint: () => ({
		isPhone,
		isTablet: !isPhone,
		isDesktop: false,
		tier: isPhone ? 'phone' : 'tablet',
		width: isPhone ? 320 : 1024,
		height: 800,
		isShortViewport: false,
	}),
}));

describe('ResponsiveModalFooter', () => {
	beforeEach(() => {
		setIsPhone(false);
	});

	afterEach(() => {
		cleanup();
	});

	describe('default rendering', () => {
		it('renders Cancel and Confirm labels by default', () => {
			render(<ResponsiveModalFooter onCancel={vi.fn()} onConfirm={vi.fn()} />);
			expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
		});

		it('renders custom labels when provided', () => {
			render(
				<ResponsiveModalFooter
					onCancel={vi.fn()}
					onConfirm={vi.fn()}
					cancelLabel="Dismiss"
					confirmLabel="Save Changes"
				/>
			);
			expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument();
		});

		it('renders cancel first and confirm second in DOM order', () => {
			render(<ResponsiveModalFooter onCancel={vi.fn()} onConfirm={vi.fn()} />);
			const buttons = screen.getAllByRole('button');
			expect(buttons).toHaveLength(2);
			expect(buttons[0]).toHaveTextContent('Cancel');
			expect(buttons[1]).toHaveTextContent('Confirm');
		});
	});

	describe('click behaviour', () => {
		it('invokes onCancel when the cancel button is clicked', () => {
			const onCancel = vi.fn();
			const onConfirm = vi.fn();
			render(<ResponsiveModalFooter onCancel={onCancel} onConfirm={onConfirm} />);
			fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
			expect(onCancel).toHaveBeenCalledTimes(1);
			expect(onConfirm).not.toHaveBeenCalled();
		});

		it('invokes onConfirm when the confirm button is clicked', () => {
			const onCancel = vi.fn();
			const onConfirm = vi.fn();
			render(<ResponsiveModalFooter onCancel={onCancel} onConfirm={onConfirm} />);
			fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
			expect(onConfirm).toHaveBeenCalledTimes(1);
			expect(onCancel).not.toHaveBeenCalled();
		});
	});

	describe('Enter key behaviour', () => {
		it('invokes onCancel and stops propagation on Enter on the cancel button', () => {
			const onCancel = vi.fn();
			const parentHandler = vi.fn();
			render(
				<div onKeyDown={parentHandler}>
					<ResponsiveModalFooter onCancel={onCancel} onConfirm={vi.fn()} />
				</div>
			);
			fireEvent.keyDown(screen.getByRole('button', { name: 'Cancel' }), { key: 'Enter' });
			expect(onCancel).toHaveBeenCalledTimes(1);
			expect(parentHandler).not.toHaveBeenCalled();
		});

		it('invokes onConfirm and stops propagation on Enter on the confirm button', () => {
			const onConfirm = vi.fn();
			const parentHandler = vi.fn();
			render(
				<div onKeyDown={parentHandler}>
					<ResponsiveModalFooter onCancel={vi.fn()} onConfirm={onConfirm} />
				</div>
			);
			fireEvent.keyDown(screen.getByRole('button', { name: 'Confirm' }), { key: 'Enter' });
			expect(onConfirm).toHaveBeenCalledTimes(1);
			expect(parentHandler).not.toHaveBeenCalled();
		});

		it('ignores non-Enter keys', () => {
			const onCancel = vi.fn();
			const onConfirm = vi.fn();
			render(<ResponsiveModalFooter onCancel={onCancel} onConfirm={onConfirm} />);
			fireEvent.keyDown(screen.getByRole('button', { name: 'Cancel' }), { key: 'Space' });
			fireEvent.keyDown(screen.getByRole('button', { name: 'Confirm' }), { key: 'ArrowDown' });
			expect(onCancel).not.toHaveBeenCalled();
			expect(onConfirm).not.toHaveBeenCalled();
		});
	});

	describe('destructive variant', () => {
		it('uses the primary variant by default (accent background)', () => {
			render(<ResponsiveModalFooter onCancel={vi.fn()} onConfirm={vi.fn()} />);
			const confirm = screen.getByRole('button', { name: 'Confirm' });
			expect(confirm.className).toContain('bg-accent');
			expect(confirm.className).not.toContain('bg-error');
		});

		it('uses the danger variant when destructive is true', () => {
			render(<ResponsiveModalFooter onCancel={vi.fn()} onConfirm={vi.fn()} destructive />);
			const confirm = screen.getByRole('button', { name: 'Confirm' });
			expect(confirm.className).toContain('bg-error');
			expect(confirm.className).not.toContain('bg-accent');
		});

		it('cancel keeps the secondary variant regardless of destructive', () => {
			render(<ResponsiveModalFooter onCancel={vi.fn()} onConfirm={vi.fn()} destructive />);
			const cancel = screen.getByRole('button', { name: 'Cancel' });
			expect(cancel.className).toContain('bg-bg-activity');
			expect(cancel.className).toContain('border-border');
		});
	});

	describe('confirmButtonRef', () => {
		it('forwards the confirm button ref to the underlying element', () => {
			const ref = React.createRef<HTMLButtonElement>();
			render(
				<ResponsiveModalFooter onCancel={vi.fn()} onConfirm={vi.fn()} confirmButtonRef={ref} />
			);
			expect(ref.current).toBeInstanceOf(HTMLButtonElement);
			expect(ref.current?.textContent).toContain('Confirm');
		});
	});

	describe('phone branch', () => {
		beforeEach(() => {
			setIsPhone(true);
		});

		it('widens both buttons to full width at phone tier', () => {
			render(<ResponsiveModalFooter onCancel={vi.fn()} onConfirm={vi.fn()} />);
			const cancel = screen.getByRole('button', { name: 'Cancel' });
			const confirm = screen.getByRole('button', { name: 'Confirm' });
			expect(cancel.className).toContain('w-full');
			expect(confirm.className).toContain('w-full');
		});
	});

	describe('tablet+ branch', () => {
		beforeEach(() => {
			setIsPhone(false);
		});

		it('does not apply full-width at tablet+ (parent handles right-align)', () => {
			render(<ResponsiveModalFooter onCancel={vi.fn()} onConfirm={vi.fn()} />);
			const cancel = screen.getByRole('button', { name: 'Cancel' });
			const confirm = screen.getByRole('button', { name: 'Confirm' });
			expect(cancel.className).not.toContain('w-full');
			expect(confirm.className).not.toContain('w-full');
		});
	});
});
