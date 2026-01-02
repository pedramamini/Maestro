/**
 * @file vitest.integration.config.ts
 * @description Vitest configuration for integration tests.
 *
 * Includes:
 * - Group Chat integration tests (require real agents)
 * - iOS Tools integration tests (require macOS + Xcode)
 *
 * These tests exercise real system components and are meant to be
 * run manually or in dedicated CI jobs with appropriate environment.
 *
 * Run with: npm run test:integration
 */

import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: [
      'src/__tests__/integration/**/*.integration.test.ts',
      'src/__tests__/integration/**/provider-integration.test.ts',
    ],
    testTimeout: 180000, // 3 minutes per test
    hookTimeout: 60000, // 1 minute for setup/teardown
    pool: 'forks', // Use forks instead of threads for process isolation
    poolOptions: {
      forks: {
        singleFork: true, // Run tests sequentially to avoid agent conflicts
      },
    },
    bail: 1, // Stop on first failure
    globals: true,
    reporters: ['verbose'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
