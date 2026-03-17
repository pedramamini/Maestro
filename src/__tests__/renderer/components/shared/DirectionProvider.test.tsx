/**
 * @fileoverview Tests for DirectionProvider component
 * Tests: dir/data-dir attribute setting, CSS custom properties, RTL detection
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import {
	DirectionProvider,
	isRtlLanguage,
} from '../../../../renderer/components/shared/DirectionProvider';

// Mock settingsStore
const mockState = { language: 'en', settingsLoaded: true };
vi.mock('../../../../renderer/stores/settingsStore', () => ({
	useSettingsStore: (selector: (s: typeof mockState) => unknown) => selector(mockState),
}));

// Mock i18n config
vi.mock('../../../../shared/i18n/config', () => ({
	RTL_LANGUAGES: ['ar'] as string[],
}));

describe('isRtlLanguage', () => {
	it('returns true for Arabic', () => {
		expect(isRtlLanguage('ar')).toBe(true);
	});

	it('returns false for English', () => {
		expect(isRtlLanguage('en')).toBe(false);
	});

	it('returns false for unknown language codes', () => {
		expect(isRtlLanguage('xx')).toBe(false);
	});
});

describe('DirectionProvider', () => {
	beforeEach(() => {
		// Reset document root attributes
		const root = document.documentElement;
		root.removeAttribute('dir');
		root.removeAttribute('data-dir');
		root.removeAttribute('lang');
		root.style.removeProperty('--dir-start');
		root.style.removeProperty('--dir-end');
		// Reset mock state
		mockState.language = 'en';
		mockState.settingsLoaded = true;
	});

	it('renders children', () => {
		const { getByText } = render(
			<DirectionProvider>
				<span>Hello</span>
			</DirectionProvider>
		);
		expect(getByText('Hello')).toBeTruthy();
	});

	it('sets LTR attributes for English', () => {
		render(
			<DirectionProvider>
				<div />
			</DirectionProvider>
		);
		const root = document.documentElement;
		expect(root.dir).toBe('ltr');
		expect(root.getAttribute('data-dir')).toBe('ltr');
		expect(root.lang).toBe('en');
	});

	it('sets CSS custom properties for LTR', () => {
		render(
			<DirectionProvider>
				<div />
			</DirectionProvider>
		);
		const root = document.documentElement;
		expect(root.style.getPropertyValue('--dir-start')).toBe('left');
		expect(root.style.getPropertyValue('--dir-end')).toBe('right');
	});

	it('sets RTL attributes for Arabic', () => {
		mockState.language = 'ar';
		render(
			<DirectionProvider>
				<div />
			</DirectionProvider>
		);
		const root = document.documentElement;
		expect(root.dir).toBe('rtl');
		expect(root.getAttribute('data-dir')).toBe('rtl');
		expect(root.lang).toBe('ar');
	});

	it('sets CSS custom properties for RTL', () => {
		mockState.language = 'ar';
		render(
			<DirectionProvider>
				<div />
			</DirectionProvider>
		);
		const root = document.documentElement;
		expect(root.style.getPropertyValue('--dir-start')).toBe('right');
		expect(root.style.getPropertyValue('--dir-end')).toBe('left');
	});

	it('does not set attributes when settings not yet loaded', () => {
		mockState.settingsLoaded = false;
		render(
			<DirectionProvider>
				<div />
			</DirectionProvider>
		);
		const root = document.documentElement;
		// Should not have been set since settingsLoaded is false
		expect(root.dir).toBe('');
	});
});
