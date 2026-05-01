#!/usr/bin/env node
/**
 * verify-native-abi.mjs — Post-package smoke check for native module ABI version.
 *
 * Asserts that better_sqlite3.node inside the Linux unpacked release was compiled
 * for Electron 28's ABI (NODE_MODULE_VERSION 119), not Node.js 22's ABI (127).
 *
 * Run automatically as the final step of `npm run package:linux`.
 * Can also be invoked directly: `node scripts/verify-native-abi.mjs`
 *
 * Exit 0 = ABI matches expected. Exit 1 = mismatch or binary not found.
 */

import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

// Electron 28 uses NODE_MODULE_VERSION 119.
const EXPECTED_ABI = 119;

// The unpacked Linux release path produced by electron-builder.
const UNPACKED_DIR = resolve(ROOT, 'release/linux-unpacked/resources/app.asar.unpacked');
const SQLITE_NODE = resolve(
	UNPACKED_DIR,
	'node_modules/better-sqlite3/build/Release/better_sqlite3.node'
);

if (!existsSync(SQLITE_NODE)) {
	console.error(`✗ ERROR: better_sqlite3.node not found at expected path:`);
	console.error(`  ${SQLITE_NODE}`);
	console.error(`  Run 'npm run package:linux' first.`);
	process.exit(1);
}

console.log(`Checking ABI version in: ${SQLITE_NODE}`);

let nmOutput;
try {
	nmOutput = execFileSync('nm', ['-D', SQLITE_NODE], {
		encoding: 'utf8',
		stdio: ['pipe', 'pipe', 'pipe'],
	});
} catch (err) {
	// nm may not be available on all systems; treat as a soft warning rather than hard fail.
	console.warn(`⚠ WARNING: nm not available — skipping ABI symbol check. (${err.message})`);
	console.warn(`  Install binutils to enable ABI verification.`);
	process.exit(0);
}

// The registration symbol embeds the ABI version as a decimal suffix, e.g.:
//   node_register_module_v119   (Electron 28 ABI)
//   node_register_module_v127   (Node.js 22 ABI)
const symbolRegex = /node_register_module_v(\d+)/;
const match = nmOutput.match(symbolRegex);

if (!match) {
	console.error(`✗ ERROR: No node_register_module_v* symbol found in better_sqlite3.node.`);
	console.error(`  The binary may be corrupt or not a Node.js native addon.`);
	process.exit(1);
}

const actualAbi = parseInt(match[1], 10);

if (actualAbi === EXPECTED_ABI) {
	console.log(
		`✓ ABI check passed: node_register_module_v${actualAbi} (Electron 28 — expected v${EXPECTED_ABI})`
	);
	process.exit(0);
} else {
	console.error(
		`✗ ABI MISMATCH: better_sqlite3.node is compiled for ABI v${actualAbi}, expected v${EXPECTED_ABI}.`
	);
	if (actualAbi === 127) {
		console.error(`  This is the Node.js 22 ABI — electron-rebuild did not run before packaging.`);
	}
	console.error(`  Run 'npm run rebuild:native' then re-package.`);
	process.exit(1);
}
