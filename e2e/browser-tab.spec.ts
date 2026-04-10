import http from 'http';
import {
	_electron as electron,
	type ElectronApplication,
	type Locator,
	type Page,
} from '@playwright/test';
import { test, expect } from './fixtures/electron-app';

const LOCAL_TEST_PORT = 7101;
const LOCAL_TEST_TITLE = 'Browser Tab Local Test';
const EXTERNAL_TEST_TITLE = 'Example Domain';

function createLocalTestServer(): Promise<http.Server> {
	return new Promise((resolve, reject) => {
		const server = http.createServer((_req, res) => {
			res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
			res.end(
				`<!doctype html><html><head><title>${LOCAL_TEST_TITLE}</title></head><body><main>${LOCAL_TEST_TITLE}</main></body></html>`
			);
		});

		server.once('error', reject);
		server.listen(LOCAL_TEST_PORT, '127.0.0.1', () => resolve(server));
	});
}

async function launchApp(
	appPath: string,
	testDataDir: string
): Promise<{
	app: ElectronApplication;
	window: Page;
}> {
	const app = await electron.launch({
		args: [appPath],
		env: {
			...process.env,
			MAESTRO_DATA_DIR: testDataDir,
			ELECTRON_DISABLE_GPU: '1',
			NODE_ENV: 'test',
			MAESTRO_E2E_TEST: 'true',
		},
		timeout: 30000,
	});

	const window = await app.firstWindow();
	await window.waitForLoadState('domcontentloaded');
	await window.waitForTimeout(1500);

	return { app, window };
}

async function createBrowserTab(window: Page): Promise<void> {
	await window.getByTitle('New tab…').click();
	await window.getByRole('button', { name: 'New Browser Tab' }).click();
	await expect(getVisibleAddressInput(window)).toBeVisible();
}

async function navigateBrowser(window: Page, value: string): Promise<void> {
	const address = getVisibleAddressInput(window);
	await address.fill(value);
	await address.press('Enter');
}

function getVisibleAddressInput(window: Page): Locator {
	return window.locator('input[placeholder="Enter a URL"]:visible').first();
}

function getBrowserTabByTitle(window: Page, title: string) {
	return window.locator('div[data-tab-id]').filter({ hasText: title }).first();
}

async function selectBrowserTab(window: Page, title: string): Promise<void> {
	await getBrowserTabByTitle(window, title).evaluate((element) => {
		(element as HTMLElement).click();
	});
}

test.describe('Browser Tab Prototype', () => {
	test('creates, navigates, persists, reselects, reloads, and closes browser tabs', async ({
		appPath,
		testDataDir,
	}) => {
		const server = await createLocalTestServer();
		let firstApp: ElectronApplication | null = null;
		let secondApp: ElectronApplication | null = null;

		try {
			const firstLaunch = await launchApp(appPath, testDataDir);
			firstApp = firstLaunch.app;
			let window = firstLaunch.window;

			await expect(window.getByText('Something went wrong')).toHaveCount(0);

			await createBrowserTab(window);
			await expect(getBrowserTabByTitle(window, 'New Tab')).toBeVisible();

			await navigateBrowser(window, `127.0.0.1:${LOCAL_TEST_PORT}`);
			await expect(window.locator('body')).toContainText(LOCAL_TEST_TITLE, { timeout: 15000 });
			await expect(getVisibleAddressInput(window)).toHaveValue(
				`http://127.0.0.1:${LOCAL_TEST_PORT}/`
			);

			await createBrowserTab(window);
			await navigateBrowser(window, 'example.com');
			await expect(getBrowserTabByTitle(window, EXTERNAL_TEST_TITLE)).toBeVisible({
				timeout: 20000,
			});
			await selectBrowserTab(window, EXTERNAL_TEST_TITLE);
			await expect(getVisibleAddressInput(window)).toHaveValue('https://example.com/');

			await window.getByText('Seed Tab', { exact: true }).click();
			await expect(getVisibleAddressInput(window)).toHaveCount(0);

			await selectBrowserTab(window, EXTERNAL_TEST_TITLE);
			await expect(getVisibleAddressInput(window)).toHaveValue('https://example.com/');

			await window.getByTitle(/Reload|Stop/).click({ force: true });
			await expect(getVisibleAddressInput(window)).toHaveValue('https://example.com/');

			await firstApp.close();
			firstApp = null;

			const secondLaunch = await launchApp(appPath, testDataDir);
			secondApp = secondLaunch.app;
			window = secondLaunch.window;

			await expect(window.getByText('Something went wrong')).toHaveCount(0);
			await expect(getBrowserTabByTitle(window, EXTERNAL_TEST_TITLE)).toBeVisible({
				timeout: 15000,
			});
			await selectBrowserTab(window, EXTERNAL_TEST_TITLE);
			await expect(getVisibleAddressInput(window)).toHaveValue('https://example.com/');

			const allTabs = window.locator('div[data-tab-id]');
			const tabCountBeforeClose = await allTabs.count();
			await window.keyboard.press('Meta+W');
			await expect(allTabs).toHaveCount(tabCountBeforeClose - 1);
			await expect(window.getByText('Seed Tab', { exact: true })).toBeVisible();
		} finally {
			server.close();
			if (firstApp) {
				await firstApp.close().catch(() => {});
			}
			if (secondApp) {
				await secondApp.close().catch(() => {});
			}
		}
	});
});
