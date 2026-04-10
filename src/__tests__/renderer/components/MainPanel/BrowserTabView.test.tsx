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

type MockWebview = HTMLElement & {
	canGoBack: ReturnType<typeof vi.fn>;
	canGoForward: ReturnType<typeof vi.fn>;
	getURL: ReturnType<typeof vi.fn>;
	getTitle: ReturnType<typeof vi.fn>;
	isLoading: ReturnType<typeof vi.fn>;
	getWebContentsId: ReturnType<typeof vi.fn>;
};

describe('BrowserTabView', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal('ResizeObserver', MockResizeObserver);
	});

	function getWebview(): MockWebview {
		return screen.getByTestId('browser-tab-host').querySelector('webview') as MockWebview;
	}

	it('waits for dom-ready before reading webview navigation state', async () => {
		const onUpdateTab = vi.fn();

		render(<BrowserTabView tab={mockTab} theme={mockTheme} onUpdateTab={onUpdateTab} />);

		const webview = getWebview();

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

	it('updates loading, url, and favicon state across redirects', async () => {
		const onUpdateTab = vi.fn();

		render(<BrowserTabView tab={mockTab} theme={mockTheme} onUpdateTab={onUpdateTab} />);

		const webview = getWebview();
		webview.canGoBack = vi.fn(() => false);
		webview.canGoForward = vi.fn(() => false);
		webview.getURL = vi.fn(() => 'https://redirected.example.com/docs');
		webview.getTitle = vi.fn(() => 'Redirected Docs');
		webview.isLoading = vi.fn(() => false);
		webview.getWebContentsId = vi.fn(() => 91);

		await act(async () => {
			webview.dispatchEvent(new Event('dom-ready'));
		});

		onUpdateTab.mockClear();

		await act(async () => {
			webview.dispatchEvent(
				Object.assign(new Event('did-start-navigation'), {
					url: 'https://example.com/start',
					isMainFrame: true,
				})
			);
			webview.dispatchEvent(
				Object.assign(new Event('did-redirect-navigation'), {
					url: 'https://redirected.example.com/docs',
					isMainFrame: true,
				})
			);
			webview.dispatchEvent(
				Object.assign(new Event('page-favicon-updated'), {
					favicons: ['https://redirected.example.com/favicon.ico'],
				})
			);
			webview.dispatchEvent(new Event('did-stop-loading'));
		});

		await waitFor(() => {
			expect(onUpdateTab).toHaveBeenCalledWith(
				'browser-1',
				expect.objectContaining({
					url: 'https://example.com/start',
					title: 'example.com',
					isLoading: true,
					favicon: null,
				})
			);
			expect(onUpdateTab).toHaveBeenCalledWith(
				'browser-1',
				expect.objectContaining({
					url: 'https://redirected.example.com/docs',
					title: 'redirected.example.com',
					isLoading: true,
					favicon: null,
				})
			);
			expect(onUpdateTab).toHaveBeenCalledWith('browser-1', {
				favicon: 'https://redirected.example.com/favicon.ico',
			});
			expect(onUpdateTab).toHaveBeenCalledWith(
				'browser-1',
				expect.objectContaining({
					url: 'https://redirected.example.com/docs',
					title: 'Redirected Docs',
					canGoBack: false,
					canGoForward: false,
					isLoading: false,
					webContentsId: 91,
				})
			);
		});
	});

	it('clears loading state after failed navigations', async () => {
		const onUpdateTab = vi.fn();

		render(<BrowserTabView tab={mockTab} theme={mockTheme} onUpdateTab={onUpdateTab} />);

		const webview = getWebview();
		webview.canGoBack = vi.fn(() => true);
		webview.canGoForward = vi.fn(() => false);
		webview.getURL = vi.fn(() => 'https://failed.example.com/');
		webview.getTitle = vi.fn(() => '');
		webview.isLoading = vi.fn(() => false);
		webview.getWebContentsId = vi.fn(() => 103);

		await act(async () => {
			webview.dispatchEvent(new Event('dom-ready'));
		});

		onUpdateTab.mockClear();

		await act(async () => {
			webview.dispatchEvent(
				Object.assign(new Event('did-fail-load'), {
					validatedURL: 'https://failed.example.com/',
					isMainFrame: true,
				})
			);
		});

		await waitFor(() => {
			expect(onUpdateTab).toHaveBeenCalledWith(
				'browser-1',
				expect.objectContaining({
					url: 'https://failed.example.com/',
					title: 'failed.example.com',
					canGoBack: true,
					canGoForward: false,
					isLoading: false,
					webContentsId: 103,
				})
			);
		});
	});
});
