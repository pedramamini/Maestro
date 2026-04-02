import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { CopyNotificationToast } from '../../../../renderer/components/MainPanel/CopyNotificationToast';
import type { Theme } from '../../../../renderer/types';

const mockTheme = {
	colors: {
		accent: '#3b82f6',
		accentForeground: '#ffffff',
	},
} as Theme;

describe('CopyNotificationToast', () => {
	it('renders nothing when message is null', () => {
		const { container } = render(<CopyNotificationToast message={null} theme={mockTheme} />);
		expect(container.firstChild).toBeNull();
	});

	it('renders message when provided', () => {
		render(<CopyNotificationToast message="Copied to Clipboard" theme={mockTheme} />);
		expect(screen.getByText('Copied to Clipboard')).toBeInTheDocument();
	});

	it('renders custom message', () => {
		render(<CopyNotificationToast message="Branch name copied" theme={mockTheme} />);
		expect(screen.getByText('Branch name copied')).toBeInTheDocument();
	});

	it('applies theme accent color styling', () => {
		const { container } = render(<CopyNotificationToast message="Copied" theme={mockTheme} />);
		const toast = container.firstChild as HTMLElement;
		// jsdom normalizes hex to rgb — verify computed values match our theme
		expect(toast.style.backgroundColor).toBe('rgb(59, 130, 246)'); // #3b82f6
		expect(toast.style.color).toBe('rgb(255, 255, 255)'); // #ffffff
	});
});
