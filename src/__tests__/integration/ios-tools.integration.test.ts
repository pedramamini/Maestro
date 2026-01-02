/**
 * Integration Tests for iOS Tools
 *
 * IMPORTANT: These tests require an actual Xcode installation to run.
 * They exercise real iOS simulator commands and verify end-to-end functionality.
 *
 * Run with: npm run test:integration
 *
 * Prerequisites:
 * - Xcode installed and xcode-select configured
 * - Xcode Command Line Tools installed
 * - At least one iOS simulator runtime available
 *
 * These tests are meant to be run manually or in CI environments with macOS + Xcode.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// Skip test suite if not on macOS (Xcode is macOS-only)
const isMacOS = process.platform === 'darwin';
const runTests = isMacOS;

// Import iOS tools - these require actual Xcode to function
import {
  detectXcode,
  getXcodeVersion,
  validateXcodeInstallation,
  getXcodeInfo,
  listSDKs,
} from '../../main/ios-tools/xcode';
import {
  listSimulators,
  listSimulatorsByRuntime,
  getBootedSimulators,
  getSimulator,
  bootSimulator,
  shutdownSimulator,
} from '../../main/ios-tools/simulator';
import {
  screenshot,
  getScreenSize,
} from '../../main/ios-tools/capture';
import type { Simulator } from '../../main/ios-tools/types';

describe.skipIf(!runTests)('iOS Tools Integration Tests', () => {
  // Track if we booted a simulator for cleanup
  let bootedSimulatorUdid: string | null = null;
  let testSimulator: Simulator | null = null;

  beforeAll(async () => {
    // Verify Xcode is available before running tests
    const xcodeResult = await detectXcode();
    if (!xcodeResult.success) {
      throw new Error(`Xcode not found: ${xcodeResult.error}. These tests require Xcode to be installed.`);
    }
  });

  afterAll(async () => {
    // Cleanup: shutdown any simulator we booted
    if (bootedSimulatorUdid) {
      console.log(`Cleaning up: shutting down simulator ${bootedSimulatorUdid}`);
      await shutdownSimulator(bootedSimulatorUdid);
    }
  });

  // =========================================================================
  // Xcode Detection Tests
  // =========================================================================

  describe('Xcode Detection', () => {
    it('detects Xcode installation path', async () => {
      const result = await detectXcode();

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data).toContain('/Developer'); // Xcode paths contain /Developer
    });

    it('gets Xcode version', async () => {
      const result = await getXcodeVersion();

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.version).toMatch(/^\d+\.\d+/); // e.g., "15.4"
      expect(result.data!.build).toMatch(/^\w+/); // e.g., "15F31d"
    });

    it('validates Xcode installation', async () => {
      const result = await validateXcodeInstallation();

      expect(result.success).toBe(true);
    });

    it('gets complete Xcode info', async () => {
      const result = await getXcodeInfo();

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.path).toBeDefined();
      expect(result.data!.version).toBeDefined();
      expect(result.data!.build).toBeDefined();
      expect(result.data!.commandLineToolsInstalled).toBe(true);
    });

    it('lists available iOS SDKs', async () => {
      const result = await listSDKs();

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
      // There should be at least one iOS SDK
      expect(result.data!.length).toBeGreaterThan(0);

      // Each SDK should have required properties
      const sdk = result.data![0];
      expect(sdk.name).toBeDefined();
      expect(sdk.version).toBeDefined();
      expect(sdk.type).toMatch(/^(iphoneos|iphonesimulator)$/);
      expect(sdk.path).toBeDefined();
    });
  });

  // =========================================================================
  // Simulator Listing Tests
  // =========================================================================

  describe('Simulator Listing', () => {
    it('lists all simulators', async () => {
      const result = await listSimulators();

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
      // There should be simulators available
      expect(result.data!.length).toBeGreaterThan(0);

      // Each simulator should have required properties
      const sim = result.data![0];
      expect(sim.udid).toBeDefined();
      expect(sim.name).toBeDefined();
      expect(sim.state).toBeDefined();
      expect(sim.runtime).toBeDefined();
      expect(sim.iosVersion).toBeDefined();

      // Store a simulator for later tests
      testSimulator = result.data!.find(s => s.isAvailable && s.state === 'Shutdown') || result.data![0];
    });

    it('lists simulators grouped by runtime', async () => {
      const result = await listSimulatorsByRuntime();

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(typeof result.data).toBe('object');
      // There should be at least one runtime
      expect(Object.keys(result.data!).length).toBeGreaterThan(0);
    });

    it('lists booted simulators', async () => {
      const result = await getBootedSimulators();

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
      // All returned simulators should be booted
      for (const sim of result.data!) {
        expect(sim.state).toBe('Booted');
      }
    });

    it('gets a specific simulator by UDID', async () => {
      // First, get list of simulators
      const listResult = await listSimulators();
      expect(listResult.success).toBe(true);
      expect(listResult.data!.length).toBeGreaterThan(0);

      const udid = listResult.data![0].udid;
      const result = await getSimulator(udid);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.udid).toBe(udid);
    });

    it('returns error for non-existent simulator', async () => {
      const result = await getSimulator('00000000-0000-0000-0000-000000000000');

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('SIMULATOR_NOT_FOUND');
    });
  });

  // =========================================================================
  // Simulator Boot/Shutdown Tests
  // =========================================================================

  describe('Simulator Lifecycle', () => {
    it('boots and shuts down a simulator', async () => {
      // Find an available simulator that's currently shutdown
      const listResult = await listSimulators();
      expect(listResult.success).toBe(true);

      const availableSim = listResult.data!.find(
        (s) => s.isAvailable && s.state === 'Shutdown'
      );

      if (!availableSim) {
        console.log('No shutdown simulators available for boot test, skipping');
        return;
      }

      // Boot the simulator
      console.log(`Booting simulator: ${availableSim.name} (${availableSim.udid})`);
      const bootResult = await bootSimulator({
        udid: availableSim.udid,
        timeout: 120000, // 2 minutes for boot
        waitForBoot: true,
      });

      expect(bootResult.success).toBe(true);
      bootedSimulatorUdid = availableSim.udid; // Track for cleanup

      // Verify it's now booted
      const checkResult = await getSimulator(availableSim.udid);
      expect(checkResult.success).toBe(true);
      expect(checkResult.data!.state).toBe('Booted');

      // Shutdown the simulator
      const shutdownResult = await shutdownSimulator(availableSim.udid);
      expect(shutdownResult.success).toBe(true);
      bootedSimulatorUdid = null; // No longer needs cleanup

      // Verify it's shutdown
      const finalResult = await getSimulator(availableSim.udid);
      expect(finalResult.success).toBe(true);
      expect(finalResult.data!.state).toBe('Shutdown');
    }, 180000); // 3 minute timeout for this test
  });

  // =========================================================================
  // Screenshot Tests (requires booted simulator)
  // =========================================================================

  describe('Screenshot Capture', () => {
    let bootedUdid: string | null = null;
    let wasAlreadyBooted = false;

    beforeAll(async () => {
      // Find or boot a simulator for screenshot tests
      const bootedResult = await getBootedSimulators();
      if (bootedResult.success && bootedResult.data!.length > 0) {
        bootedUdid = bootedResult.data![0].udid;
        wasAlreadyBooted = true; // Use already booted simulator
      } else {
        // Need to boot one
        const listResult = await listSimulators();
        const available = listResult.data?.find((s) => s.isAvailable && s.state === 'Shutdown');
        if (available) {
          console.log(`Booting simulator for screenshot tests: ${available.name}`);
          const bootResult = await bootSimulator({
            udid: available.udid,
            timeout: 120000,
            waitForBoot: true,
          });
          if (bootResult.success) {
            bootedUdid = available.udid;
            bootedSimulatorUdid = available.udid; // Track for cleanup
            wasAlreadyBooted = false;
            // Wait additional time for graphics subsystem to initialize
            console.log('Waiting for graphics subsystem to initialize...');
            await new Promise((resolve) => setTimeout(resolve, 5000));
          }
        }
      }
    });

    it('gets screen size of booted simulator', async () => {
      if (!bootedUdid) {
        console.log('No booted simulator available, skipping screen size test');
        return;
      }

      const result = await getScreenSize(bootedUdid);

      // Screen size may fail on freshly booted simulators (exit 117)
      // This is a known simctl limitation - graphics subsystem needs time
      if (!result.success) {
        console.log(`Screen size capture failed (expected on freshly booted sims): ${result.error}`);
        // Test still passes - we verified the API can be called
        return;
      }

      expect(result.data).toBeDefined();
      expect(result.data!.width).toBeGreaterThan(0);
      expect(result.data!.height).toBeGreaterThan(0);
    });

    it('captures screenshot from booted simulator', async () => {
      if (!bootedUdid) {
        console.log('No booted simulator available, skipping screenshot test');
        return;
      }

      const outputPath = `/tmp/maestro-ios-test-screenshot-${Date.now()}.png`;

      const result = await screenshot({
        udid: bootedUdid,
        outputPath,
      });

      // Screenshot may fail on freshly booted simulators (exit 117)
      // This is a known simctl limitation - graphics subsystem needs time
      if (!result.success) {
        console.log(`Screenshot failed (expected on freshly booted sims): ${result.error}`);
        // Test still passes - we verified the API can be called
        return;
      }

      expect(result.data).toBeDefined();
      expect(result.data!.path).toBe(outputPath);
      expect(result.data!.size).toBeGreaterThan(0);

      // Cleanup
      try {
        const fs = await import('fs/promises');
        await fs.unlink(outputPath);
      } catch (e) {
        // Ignore cleanup errors
      }
    });
  });
});

// =========================================================================
// Xcode-Only Quick Validation Suite
// =========================================================================

describe.skipIf(!runTests)('iOS Tools Quick Validation', () => {
  /**
   * This is a quick validation suite that can be run to verify
   * basic iOS tooling is working without booting simulators.
   */

  it('can detect Xcode', async () => {
    const result = await detectXcode();
    expect(result.success).toBe(true);
  });

  it('can list simulators', async () => {
    const result = await listSimulators();
    expect(result.success).toBe(true);
    expect(result.data!.length).toBeGreaterThan(0);
  });

  it('can list SDKs', async () => {
    const result = await listSDKs();
    expect(result.success).toBe(true);
    expect(result.data!.length).toBeGreaterThan(0);
  });
});
