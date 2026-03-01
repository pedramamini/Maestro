/**
 * Playwright configuration for Electron E2E testing
 *
 * This configuration is designed to test the Maestro Electron application.
 * E2E tests launch the actual packaged/built application and interact with
 * the UI through Playwright's browser automation.
 */
import { defineConfig, devices } from '@playwright/test';
import path from 'path';

/**
 * See https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
	// Test directory
	testDir: './e2e',

	// Test file patterns
	testMatch: '**/*.spec.ts',

	// Run tests in files in parallel
	fullyParallel: false, // Electron tests should run sequentially to avoid conflicts

	// Fail the build on CI if you accidentally left test.only in the source code
	forbidOnly: !!process.env.CI,

	// Retry on CI only
	retries: process.env.CI ? 2 : 0,

	// Opt out of parallel tests for Electron
	workers: 1,

	// Reporter to use
	reporter: process.env.CI
		? [['github'], ['html', { open: 'never' }]]
		: [['list'], ['html', { open: 'on-failure' }]],

	// Shared settings for all the projects below
	use: {
		// Base URL to use in actions like `await page.goto('/')`
		// For Electron, this is handled differently - we use app.evaluate()

		// Collect trace when retrying the failed test
		trace: 'on-first-retry',

		// Capture screenshot on failure
		screenshot: 'only-on-failure',

		// Record video on failure
		video: 'on-first-retry',

		// Timeout for each action
		actionTimeout: 10000,
	},

	// Configure projects for major browsers
	projects: [
		{
			name: 'electron',
			testDir: './e2e',
			use: {
				// Electron-specific settings will be configured in test fixtures
			},
		},
	],

	// Global test timeout
	timeout: 60000,

	// Expect timeout
	expect: {
		timeout: 10000,
	},

	// Output directory for test artifacts
	outputDir: 'e2e-results/',

	// Run local dev server before starting the tests
	// For Electron, we build and launch the app in the test fixtures
	// webServer: undefined,
});
