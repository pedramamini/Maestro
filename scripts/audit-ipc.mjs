#!/usr/bin/env node
/**
 * scripts/audit-ipc.mjs
 *
 * IPC Channel Registry Audit — Wiring Audit 001
 *
 * Walks three sources and emits a manifest JSON to stdout (or a file):
 *
 *   handlers  – every channel registered via ipcMain.handle() in
 *               src/main/ipc/handlers/** and the handful of non-handler
 *               files that also call ipcMain.handle().
 *
 *   preload   – every channel invoked via ipcRenderer.invoke() in
 *               src/main/preload/**
 *
 *   typed     – every "namespace:method" pair surfaced as a Promise-
 *               returning method inside the MaestroAPI interface in
 *               src/renderer/global.d.ts
 *
 * Outputs: { handlers: string[], preload: string[], typed: string[] }
 *
 * Usage:
 *   node scripts/audit-ipc.mjs                  # prints JSON to stdout
 *   node scripts/audit-ipc.mjs --out manifest.json
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../../');

// ---------------------------------------------------------------------------
// File walking
// ---------------------------------------------------------------------------

function walk(dir, results = []) {
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) {
			walk(full, results);
		} else if (full.endsWith('.ts') || full.endsWith('.tsx') || full.endsWith('.mts')) {
			results.push(full);
		}
	}
	return results;
}

function readFile(p) {
	return readFileSync(p, 'utf8');
}

// ---------------------------------------------------------------------------
// Handler extraction  (src/main/ipc/handlers/**  +  a few extra files)
// ---------------------------------------------------------------------------
//
// Supported patterns:
//
//   ipcMain.handle('ns:op', ...)
//   ipcMain.handle("ns:op", ...)
//   ipcMain.handle(
//     'ns:op',
//     ...
//   )
//   ipcMain.handle(`ns:op`, ...)        <- template literal (no placeholders)
//
// NOTE: template literals with ${...} placeholders cannot be statically
// resolved and are intentionally excluded from the manifest.  If any are
// found we emit a warning to stderr.

const IPC_HANDLE_PATTERN = /ipcMain\.handle\s*\(\s*(['"`])([\w:.-]+)\1/g;

// Some template literals span across a newline after ipcMain.handle(
const IPC_HANDLE_MULTILINE_PATTERN = /ipcMain\.handle\s*\(\s*\n\s*(['"`])([\w:.-]+)\1/g;

function extractHandlers(src) {
	const channels = new Set();

	for (const pattern of [IPC_HANDLE_PATTERN, IPC_HANDLE_MULTILINE_PATTERN]) {
		let m;
		pattern.lastIndex = 0;
		while ((m = pattern.exec(src)) !== null) {
			channels.add(m[2]);
		}
	}

	// Warn about dynamic template literals we cannot resolve
	const dynamicPattern = /ipcMain\.handle\s*\(\s*`[^`]*\$\{/g;
	let dm;
	dynamicPattern.lastIndex = 0;
	while ((dm = dynamicPattern.exec(src)) !== null) {
		process.stderr.write(
			`[audit-ipc] WARNING: dynamic template literal channel found – cannot statically resolve.\n`
		);
	}

	return channels;
}

const HANDLER_DIRS = [join(ROOT, 'src/main/ipc/handlers')];

// Additional files outside handlers/ that also call ipcMain.handle
const EXTRA_HANDLER_FILES = [
	join(ROOT, 'src/main/auto-updater.ts'),
	join(ROOT, 'src/main/app-lifecycle/window-manager.ts'),
];

function collectHandlers() {
	const all = new Set();
	const files = [...walk(HANDLER_DIRS[0]), ...EXTRA_HANDLER_FILES];
	for (const f of files) {
		try {
			for (const ch of extractHandlers(readFile(f))) {
				all.add(ch);
			}
		} catch {
			// skip unreadable files
		}
	}
	return [...all].sort();
}

// ---------------------------------------------------------------------------
// Preload extraction  (src/main/preload/**)
// ---------------------------------------------------------------------------
//
// Supported patterns:
//
//   ipcRenderer.invoke('ns:op', ...)
//   ipcRenderer.invoke("ns:op", ...)
//   ipcRenderer.invoke(`ns:op`, ...)

const IPC_INVOKE_PATTERN = /ipcRenderer\.invoke\s*\(\s*(['"`])([\w:.-]+)\1/g;

function extractInvocations(src) {
	const channels = new Set();
	let m;
	IPC_INVOKE_PATTERN.lastIndex = 0;
	while ((m = IPC_INVOKE_PATTERN.exec(src)) !== null) {
		channels.add(m[2]);
	}
	return channels;
}

function collectPreload() {
	const all = new Set();
	for (const f of walk(join(ROOT, 'src/main/preload'))) {
		try {
			for (const ch of extractInvocations(readFile(f))) {
				all.add(ch);
			}
		} catch {
			// skip
		}
	}
	return [...all].sort();
}

// ---------------------------------------------------------------------------
// Typed extraction  (src/renderer/global.d.ts  →  MaestroAPI interface)
// ---------------------------------------------------------------------------
//
// Strategy: parse the MaestroAPI interface block from global.d.ts.
//
// The interface is structured as:
//
//   interface MaestroAPI {
//     namespace: {          ← 1-tab indent
//       methodName: ...;    ← 2-tab indent
//     };
//   }
//
// We track:
//   - entering a top-level namespace (1-tab property + " {")
//   - method names at 2-tab depth that end with a colon
//   - we only collect methods that return Promise (fire-and-forget too)
//
// Note: We deliberately collect ALL method names at 2-tab depth inside
// MaestroAPI namespaces, not just Promise-returning ones. The `on*` event
// listener helpers return `() => void` and are intentionally excluded from
// the handler/preload sets, but we include them here so the typed list is
// a superset. The test then checks handlers ⊆ (preload ∪ typed), which is
// the binding contract — a handler without a preload exposure or type is the
// real drift signal.

const GLOBAL_DTS = join(ROOT, 'src/renderer/global.d.ts');

function collectTyped() {
	const src = readFile(GLOBAL_DTS);
	const lines = src.split('\n');

	const channels = new Set();

	let insideMaestroAPI = false;
	let currentNamespace = null;
	// Track brace depth relative to the MaestroAPI interface opening
	let braceDepth = 0;

	for (const line of lines) {
		// Detect start of MaestroAPI
		if (!insideMaestroAPI) {
			if (/^interface MaestroAPI\s*\{/.test(line)) {
				insideMaestroAPI = true;
				braceDepth = 1; // we're inside the outer brace
			}
			continue;
		}

		// Count braces to know when we exit MaestroAPI
		const opens = (line.match(/\{/g) || []).length;
		const closes = (line.match(/\}/g) || []).length;

		// Detect top-level namespace (depth 1 → 2): single tab + identifier + ": {"
		// e.g.: \tcontext: {
		if (braceDepth === 1) {
			const nsMatch = line.match(/^\t([a-zA-Z][a-zA-Z0-9_]*)\s*:\s*\{/);
			if (nsMatch) {
				currentNamespace = nsMatch[1];
			}
		}

		// Detect method names at depth 2: two tabs + identifier + ":"
		// e.g.: \t\tgetBoard: (
		if (braceDepth === 2 && currentNamespace) {
			const methodMatch = line.match(/^\t\t([a-zA-Z][a-zA-Z0-9_]*)\s*:/);
			if (methodMatch) {
				const method = methodMatch[1];
				channels.add(`${currentNamespace}:${method}`);
			}
		}

		// Update depth AFTER namespace detection (so the namespace line itself
		// transitions us from depth 1 to depth 2 on the NEXT iteration)
		braceDepth += opens - closes;

		if (braceDepth <= 0) {
			// Exited MaestroAPI
			break;
		}

		// If we dropped back to depth 1, we left the namespace block
		if (braceDepth === 1) {
			currentNamespace = null;
		}
	}

	return [...channels].sort();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
	const handlers = collectHandlers();
	const preload = collectPreload();
	const typed = collectTyped();

	const manifest = { handlers, preload, typed };

	const args = process.argv.slice(2);
	const outIdx = args.indexOf('--out');
	if (outIdx !== -1 && args[outIdx + 1]) {
		const outPath = resolve(args[outIdx + 1]);
		writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n');
		process.stderr.write(`[audit-ipc] Manifest written to ${outPath}\n`);
		process.stderr.write(
			`[audit-ipc] handlers=${handlers.length}, preload=${preload.length}, typed=${typed.length}\n`
		);
	} else {
		process.stdout.write(JSON.stringify(manifest, null, 2) + '\n');
	}
}

main();
