/**
 * @fileoverview Tests for the <T> translation convenience component.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { T } from '../../../../renderer/components/shared/T';

// Mock react-i18next
const mockT = vi.fn();
vi.mock('react-i18next', () => ({
	useTranslation: (ns?: string) => ({
		t: (key: string, opts?: Record<string, unknown>) => mockT(key, opts, ns),
		i18n: { language: 'en' },
		ready: true,
	}),
}));

describe('T component', () => {
	beforeEach(() => {
		mockT.mockReset();
	});

	it('renders a simple translation key', () => {
		mockT.mockReturnValue('Save');
		render(<T k="common:save" />);
		expect(screen.getByText('Save')).toBeDefined();
		expect(mockT).toHaveBeenCalledWith('save', {}, 'common');
	});

	it('passes count for pluralization', () => {
		mockT.mockReturnValue('5 items');
		render(<T k="common:items_count" count={5} />);
		expect(screen.getByText('5 items')).toBeDefined();
		expect(mockT).toHaveBeenCalledWith('items_count', { count: 5 }, 'common');
	});

	it('passes interpolation values', () => {
		mockT.mockReturnValue('Hello, User');
		render(<T k="common:greeting" values={{ name: 'User' }} />);
		expect(screen.getByText('Hello, User')).toBeDefined();
		expect(mockT).toHaveBeenCalledWith('greeting', { name: 'User' }, 'common');
	});

	it('passes fallback as defaultValue', () => {
		mockT.mockReturnValue('Fallback Text');
		render(<T k="common:missing_key" fallback="Fallback Text" />);
		expect(screen.getByText('Fallback Text')).toBeDefined();
		expect(mockT).toHaveBeenCalledWith('missing_key', { defaultValue: 'Fallback Text' }, 'common');
	});

	it('handles keys without namespace prefix', () => {
		mockT.mockReturnValue('Plain key');
		render(<T k="plain_key" />);
		expect(screen.getByText('Plain key')).toBeDefined();
		expect(mockT).toHaveBeenCalledWith('plain_key', {}, undefined);
	});

	it('combines count and values', () => {
		mockT.mockReturnValue('5 items in Project');
		render(<T k="common:items_in_project" count={5} values={{ project: 'Project' }} />);
		expect(screen.getByText('5 items in Project')).toBeDefined();
		expect(mockT).toHaveBeenCalledWith(
			'items_in_project',
			{ project: 'Project', count: 5 },
			'common'
		);
	});

	it('uses correct namespace from key', () => {
		mockT.mockReturnValue('Theme');
		render(<T k="settings:general.theme_label" />);
		expect(mockT).toHaveBeenCalledWith('general.theme_label', {}, 'settings');
	});
});
