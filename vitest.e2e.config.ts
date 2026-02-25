/**
 * @file vitest.e2e.config.ts
 * @description Vitest configuration for e2e tests.
 *
 * E2E tests use real WebSocket connections and actual server instances.
 * These tests are meant to be run manually or in dedicated CI jobs.
 *
 * Run with: npx vitest run --config vitest.e2e.config.ts
 */

import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
	test: {
		include: ['src/__tests__/e2e/**/*.test.ts'],
		environment: 'node',
		testTimeout: 30000,
		hookTimeout: 10000,
		globals: true,
		reporters: ['verbose'],
		sequence: {
			shuffle: false, // Run tests in order
		},
	},
	resolve: {
		alias: {
			'@': path.resolve(__dirname, './src'),
		},
	},
});
