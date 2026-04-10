import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { BrowserTabView } from '../../../../renderer/components/MainPanel/BrowserTabView';
import type { BrowserTab, Theme } from '../../../../renderer/types';

const mockTheme = {
	colors: {
		bgMain: '#101010',
		bgSidebar: '#181818',
		border: '#303030',
		textMain: '#ffffff',
		textDim: '#8a8a8a',
	},
} as Theme;

const mockTab: BrowserTab = {
	id: 'browser-1',
	url: 'https://example.com',
	title: 'Example',
	createdAt: Date.now(),
	partition: 'persist:maestro-browser-session-session-1',
	canGoBack: false,
	canGoForward: false,
	isLoading: false,
};

class MockResizeObserver {
	observe() {}
	disconnect() {}
}

describe('BrowserTabView', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal('ResizeObserver', MockResizeObserver);
	});

	it('waits for dom-ready before reading webview navigation state', async () => {
		const onUpdateTab = vi.fn();

		render(<BrowserTabView tab={mockTab} theme={mockTheme} onUpdateTab={onUpdateTab} />);

		const webview = screen
			.getByTestId('browser-tab-host')
			.querySelector('webview') as HTMLElement & {
			canGoBack: () => boolean;
			canGoForward: () => boolean;
			getURL: () => string;
			getTitle: () => string;
			isLoading: () => boolean;
			getWebContentsId: () => number;
		};

		expect(webview).toBeTruthy();

		const getterError = new Error('dom-ready not emitted');
		webview.canGoBack = vi.fn(() => {
			throw getterError;
		});
		webview.canGoForward = vi.fn(() => {
			throw getterError;
		});
		webview.getURL = vi.fn(() => {
			throw getterError;
		});
		webview.getTitle = vi.fn(() => {
			throw getterError;
		});
		webview.isLoading = vi.fn(() => {
			throw getterError;
		});
		webview.getWebContentsId = vi.fn(() => 77);

		await waitFor(() => {
			expect(onUpdateTab).not.toHaveBeenCalled();
		});

		webview.canGoBack = vi.fn(() => true);
		webview.canGoForward = vi.fn(() => false);
		webview.getURL = vi.fn(() => 'https://example.com/docs');
		webview.getTitle = vi.fn(() => 'Example Docs');
		webview.isLoading = vi.fn(() => false);

		await act(async () => {
			webview.dispatchEvent(new Event('dom-ready'));
		});

		await waitFor(() => {
			expect(onUpdateTab).toHaveBeenCalledWith(
				'browser-1',
				expect.objectContaining({
					url: 'https://example.com/docs',
					title: 'Example Docs',
					canGoBack: true,
					canGoForward: false,
					isLoading: false,
					webContentsId: 77,
				})
			);
		});
	});
});
