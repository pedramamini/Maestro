#!/usr/bin/env node
/**
 * scripts/audit-test-imports.mjs
 *
 * Test-vs-canonical-API drift detector — Wiring Audit 007
 *
 * Walks src/__tests__/**\/*.test.ts and src/__tests__/**\/*.test.tsx.
 * For each named import from a relative path (e.g. import { Foo } from '../../path'),
 * resolves the source module, parses its exported names, and flags any import
 * that references an export that does not exist in the module.
 *
 * Handles:
 *   - Multi-line import { A, B, C } from '...' blocks
 *   - import type { ... } from '...'
 *   - Aliased imports:  import { Foo as Bar } — checks that 'Foo' is exported
 *   - @-alias: '@/...' resolved to src/
 *   - export * from '...' re-exports (one level deep)
 *   - export { X } from '...' named re-exports
 *   - export const/function/class/interface/type/enum/let/var declarations
 *
 * Outputs JSON: { valid: [...], drifts: [{ test, importPath, missing }] }
 * Exit 0 if no drift; exit 1 if drift detected.
 *
 * Usage:
 *   node scripts/audit-test-imports.mjs
 *   node scripts/audit-test-imports.mjs --out report.json
 *   node scripts/audit-test-imports.mjs --json   # only print JSON, no prose
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, resolve, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync } from 'fs';

const ROOT = resolve(fileURLToPath(import.meta.url), '../../');
const TESTS_DIR = join(ROOT, 'src', '__tests__');
const SRC_DIR = join(ROOT, 'src');

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const outFlag = args.indexOf('--out');
const outFile = outFlag !== -1 ? args[outFlag + 1] : null;
const jsonOnly = args.includes('--json');

// ---------------------------------------------------------------------------
// Known-drift allowlist
//
// These are confirmed API gaps found during wiring audit.
// Each entry is keyed by "<test>|<importPath>|<name>" and includes a TODO
// pointing at the issue that should fix the upstream module or test.
//
// DO NOT expand this list without a corresponding GitHub issue.
// Remove entries once the upstream export (or the test) is fixed.
// ---------------------------------------------------------------------------

const ALLOWLIST = new Set([
	// KeyboardMasteryStats lives in renderer/types/index.ts, not shared/types.
	// Test imports from wrong module.  TODO: fix test to import from renderer/types.
	'src/__tests__/renderer/components/LeaderboardRegistrationModal.test.tsx|../../../shared/types|KeyboardMasteryStats',

	// AtMentionSuggestion and UseAtMentionCompletionReturn are defined in
	// renderer/hooks/input/useAtMentionCompletion.ts but not re-exported from
	// the hooks barrel.  TODO: add to input/index.ts and hooks/index.ts.
	'src/__tests__/renderer/hooks/useAtMentionCompletion.test.ts|../../../renderer/hooks|AtMentionSuggestion',
	'src/__tests__/renderer/hooks/useAtMentionCompletion.test.ts|../../../renderer/hooks|UseAtMentionCompletionReturn',

	// __resetMergeInProgress is a test-only helper in useMergeSession.ts but
	// is not re-exported from the agent hooks barrel.
	// TODO: either export it or import directly from the hook file in the test.
	'src/__tests__/renderer/hooks/useMergeSession.test.ts|../../../renderer/hooks|__resetMergeInProgress',

	// resetToastIdCounter, getNotificationState, getNotificationActions,
	// selectToasts, selectToastCount — test-only helpers that do not yet exist
	// in notificationStore.ts.  TODO: add exports or update tests.
	'src/__tests__/renderer/hooks/useSubsystemInitFailures.test.ts|../../../renderer/stores/notificationStore|resetToastIdCounter',
	'src/__tests__/renderer/stores/notificationStore.test.ts|../../../renderer/stores/notificationStore|resetToastIdCounter',
	'src/__tests__/renderer/stores/notificationStore.test.ts|../../../renderer/stores/notificationStore|getNotificationState',
	'src/__tests__/renderer/stores/notificationStore.test.ts|../../../renderer/stores/notificationStore|getNotificationActions',
	'src/__tests__/renderer/stores/notificationStore.test.ts|../../../renderer/stores/notificationStore|selectToasts',
	'src/__tests__/renderer/stores/notificationStore.test.ts|../../../renderer/stores/notificationStore|selectToastCount',
]);

// ---------------------------------------------------------------------------
// File walking
// ---------------------------------------------------------------------------

function walk(dir, results = []) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			walk(full, results);
		} else if (entry.isFile() && (full.endsWith('.test.ts') || full.endsWith('.test.tsx'))) {
			results.push(full);
		}
	}
	return results;
}

// ---------------------------------------------------------------------------
// Import block extraction
//
// Handles single-line and multi-line named imports from relative or @-alias paths.
// Returns: Array<{ names: string[], importPath: string }>
// ---------------------------------------------------------------------------

const IMPORT_RE = /import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g;

function extractImports(src) {
	// Collapse line continuations so multi-line imports are single-match
	const collapsed = src.replace(/\r?\n/g, ' ');
	const results = [];
	let m;
	IMPORT_RE.lastIndex = 0;
	while ((m = IMPORT_RE.exec(collapsed)) !== null) {
		const namesBlock = m[1];
		const importPath = m[2];

		// Only care about relative paths or @-alias paths
		if (!importPath.startsWith('.') && !importPath.startsWith('@/')) {
			continue;
		}

		// Parse names, stripping aliases: "Foo as Bar" -> "Foo"
		const names = namesBlock
			.split(',')
			.map((part) => {
				const trimmed = part.trim();
				// Handle "type Foo" (inline type modifier in mixed import)
				const withoutType = trimmed.replace(/^type\s+/, '');
				// Handle "Foo as Bar" — we care about the exported name 'Foo'
				const asParts = withoutType.split(/\s+as\s+/);
				return asParts[0].trim();
			})
			.filter(Boolean);

		if (names.length > 0) {
			results.push({ names, importPath });
		}
	}
	return results;
}

// ---------------------------------------------------------------------------
// Module resolution
//
// Tries to resolve an import path (relative or @-alias) to a real .ts/.tsx file.
// Returns null if the file cannot be found (e.g., .js, .css, external module).
// ---------------------------------------------------------------------------

const TS_EXTENSIONS = ['.ts', '.tsx', '.d.ts'];

function resolveModule(importPath, fromFile) {
	let base;

	if (importPath.startsWith('@/')) {
		// @-alias maps to src/
		base = join(SRC_DIR, importPath.slice(2));
	} else {
		base = resolve(dirname(fromFile), importPath);
	}

	// Try exact path with common extensions
	for (const ext of TS_EXTENSIONS) {
		const candidate = base + ext;
		if (existsSync(candidate)) return candidate;
	}

	// Try as directory index
	for (const ext of TS_EXTENSIONS) {
		const candidate = join(base, 'index' + ext);
		if (existsSync(candidate)) return candidate;
	}

	// Already has extension (e.g. '../foo.ts')
	if (existsSync(base) && TS_EXTENSIONS.includes(extname(base))) {
		return base;
	}

	return null;
}

// ---------------------------------------------------------------------------
// Export name extraction
//
// Parses a TypeScript source file and returns the Set of names it exports.
// Handles:
//   export const/let/var/function/class/interface/type/enum <Name>
//   export { A, B, C }           (local re-export without source)
//   export { A, B } from '...'  (named re-export from another module)
//   export * from '...'         (star re-export — resolved one level deep)
//   export default              (recorded as 'default')
//   export type { ... }
// ---------------------------------------------------------------------------

// Cache to avoid re-parsing the same file multiple times
const exportCache = new Map();

function parseExports(filePath, depth = 0) {
	if (exportCache.has(filePath)) return exportCache.get(filePath);

	const exports = new Set();
	// Prevent infinite recursion on circular re-exports
	exportCache.set(filePath, exports);

	if (!existsSync(filePath)) return exports;

	const src = readFileSync(filePath, 'utf8');
	const collapsed = src.replace(/\r?\n/g, ' ');

	// export default
	if (/\bexport\s+default\b/.test(collapsed)) {
		exports.add('default');
	}

	// export [declare] [async] [abstract] const/let/var/function/class/interface/type/enum Name
	const DECL_RE =
		/\bexport\s+(?:declare\s+)?(?:async\s+)?(?:type\s+|abstract\s+)?(?:const|let|var|function\*?|class|interface|type|enum)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
	let m;
	while ((m = DECL_RE.exec(collapsed)) !== null) {
		exports.add(m[1]);
	}

	// export { A, B as C } — local re-exports (no 'from')
	// export type { A, B } — same
	// We need to distinguish from 'export { X } from ...' handled below
	const NAMED_BLOCK_RE = /\bexport\s+(?:type\s+)?\{([^}]+)\}(?:\s+from\s+['"]([^'"]+)['"])?/g;
	while ((m = NAMED_BLOCK_RE.exec(collapsed)) !== null) {
		const namesBlock = m[1];
		const fromPath = m[2]; // may be undefined

		const names = namesBlock
			.split(',')
			.map((part) => {
				const trimmed = part.trim().replace(/^type\s+/, '');
				// "A as B" -> export 'B' (the alias is what callers see)
				const asParts = trimmed.split(/\s+as\s+/);
				return (asParts[1] || asParts[0]).trim();
			})
			.filter(Boolean);

		if (fromPath) {
			// Named re-export: export { Foo } from './other' — we just record the alias names
			// We don't need to recurse because we're recording what THIS module exports
			for (const name of names) exports.add(name);
		} else {
			// Local re-export: export { localFoo }
			for (const name of names) exports.add(name);
		}
	}

	// export * from './other' — star re-export, resolve one additional level
	if (depth < 2) {
		const STAR_RE =
			/\bexport\s+\*\s+(?:as\s+([A-Za-z_$][A-Za-z0-9_$]*)\s+)?from\s+['"]([^'"]+)['"]/g;
		while ((m = STAR_RE.exec(collapsed)) !== null) {
			const nsAlias = m[1]; // 'as Namespace' form
			const fromPath = m[2];

			if (nsAlias) {
				// export * as Ns from '...' — exports 'Ns'
				exports.add(nsAlias);
			} else {
				// export * from '...' — merge all exports from target
				const target = resolveModule(fromPath, filePath);
				if (target) {
					const sub = parseExports(target, depth + 1);
					for (const name of sub) exports.add(name);
				}
			}
		}
	}

	return exports;
}

// ---------------------------------------------------------------------------
// Main audit
// ---------------------------------------------------------------------------

const testFiles = walk(TESTS_DIR);

const valid = [];
const drifts = [];
const warnings = [];

for (const testFile of testFiles) {
	const src = readFileSync(testFile, 'utf8');
	const imports = extractImports(src);

	for (const { names, importPath } of imports) {
		const resolved = resolveModule(importPath, testFile);

		if (!resolved) {
			// Module couldn't be found — could be a .js, .json, or external dep
			// that slipped past our relative-path filter. Log as warning but skip.
			warnings.push({ test: testFile, importPath, reason: 'module not found' });
			continue;
		}

		const exports = parseExports(resolved);
		const relTest = testFile.replace(ROOT + '/', '');
		const allMissing = names.filter((n) => !exports.has(n));

		// Partition missing names into allowlisted (known, tracked) vs new drift
		const allowlisted = allMissing.filter((n) => ALLOWLIST.has(`${relTest}|${importPath}|${n}`));
		const missing = allMissing.filter((n) => !ALLOWLIST.has(`${relTest}|${importPath}|${n}`));

		if (missing.length > 0) {
			drifts.push({
				test: relTest,
				importPath,
				resolvedModule: resolved.replace(ROOT + '/', ''),
				missing,
			});
		} else {
			valid.push({
				test: relTest,
				importPath,
				names,
				...(allowlisted.length > 0 ? { allowlisted } : {}),
			});
		}
	}
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const report = { valid, drifts, warnings };

if (outFile) {
	writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf8');
	if (!jsonOnly) {
		process.stderr.write(`Report written to ${outFile}\n`);
	}
} else if (jsonOnly) {
	process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}

if (!jsonOnly) {
	const validCount = valid.length;
	const driftCount = drifts.length;
	const warnCount = warnings.length;

	const allowlistedCount = ALLOWLIST.size;

	if (driftCount === 0) {
		process.stdout.write(
			`[audit-test-imports] OK — ${validCount} import block(s) checked, 0 drift(s) found` +
				(allowlistedCount > 0 ? `, ${allowlistedCount} known drift(s) in allowlist` : '') +
				(warnCount > 0 ? `, ${warnCount} warning(s) (unresolved modules)` : '') +
				'\n'
		);
	} else {
		process.stderr.write(
			`[audit-test-imports] FAIL — ${driftCount} drift(s) found across ${testFiles.length} test file(s)\n\n`
		);
		for (const d of drifts) {
			process.stderr.write(`  TEST:    ${d.test}\n`);
			process.stderr.write(`  IMPORT:  ${d.importPath}\n`);
			process.stderr.write(`  MODULE:  ${d.resolvedModule}\n`);
			process.stderr.write(`  MISSING: ${d.missing.join(', ')}\n\n`);
		}
	}
}

process.exit(drifts.length > 0 ? 1 : 0);
