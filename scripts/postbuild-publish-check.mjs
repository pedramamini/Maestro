#!/usr/bin/env node
/**
 * postbuild-publish-check.mjs — Post-package publish target hygiene check.
 *
 * Reads the bundled app-update.yml written by electron-builder into each
 * platform's unpacked release directory and asserts that the `owner` and
 * `repo` fields match the configured publish target (EXPECTED_OWNER /
 * EXPECTED_REPO below).  A stale owner would cause the auto-updater to pull
 * from the wrong repository.
 *
 * Configure the expected owner/repo to match your package.json
 * build.publish.owner / build.publish.repo fields.
 *
 * Run automatically as the final step of `npm run package:linux` (and
 * package:mac / package:win if wired).  Can also be invoked directly:
 *   node scripts/postbuild-publish-check.mjs
 *
 * Exit 0 = all found app-update.yml files pass, or none exist yet.
 * Exit 1 = at least one file has wrong owner / repo.
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

// Configure these to match your package.json build.publish.owner / repo.
// Override via env vars for CI pipelines that build for multiple targets.
const EXPECTED_OWNER = process.env.PUBLISH_OWNER ?? 'RunMaestro';
const EXPECTED_REPO = process.env.PUBLISH_REPO ?? 'Maestro';

// All platform unpacked paths that electron-builder may produce.
// Each entry is [label, relative path to app-update.yml].
const CANDIDATES = [
	['Linux', 'release/linux-unpacked/resources/app-update.yml'],
	['macOS', 'release/mac/Maestro.app/Contents/Resources/app-update.yml'],
	['Windows', 'release/win-unpacked/resources/app-update.yml'],
];

/**
 * Minimal YAML scalar extraction — good enough for the flat key: value
 * pairs in app-update.yml without pulling in a YAML parser dependency.
 *
 * @param {string} text  Raw file contents.
 * @param {string} key   Key to find (e.g. "owner").
 * @returns {string | undefined}
 */
function extractYamlScalar(text, key) {
	const regex = new RegExp(`^${key}:\\s*(.+)$`, 'm');
	const match = text.match(regex);
	return match ? match[1].trim() : undefined;
}

let found = 0;
let failed = 0;

for (const [label, relPath] of CANDIDATES) {
	const filePath = resolve(ROOT, relPath);

	if (!existsSync(filePath)) {
		// Not built for this platform on this run — that's fine.
		continue;
	}

	found++;
	console.log(`Checking publish target in: ${filePath}`);

	const text = readFileSync(filePath, 'utf8');
	const owner = extractYamlScalar(text, 'owner');
	const repo = extractYamlScalar(text, 'repo');

	let ok = true;

	if (owner !== EXPECTED_OWNER) {
		console.error(
			`✗ PUBLISH TARGET MISMATCH (${label}): owner is "${owner}", expected "${EXPECTED_OWNER}".`
		);
		console.error(
			`  The auto-updater would pull from ${owner}/${repo} instead of ${EXPECTED_OWNER}/${EXPECTED_REPO}.`
		);
		console.error(
			`  Fix: ensure package.json build.publish.owner === "${EXPECTED_OWNER}" (or set PUBLISH_OWNER env var) and rebuild.`
		);
		ok = false;
	}

	if (repo !== EXPECTED_REPO) {
		console.error(
			`✗ PUBLISH TARGET MISMATCH (${label}): repo is "${repo}", expected "${EXPECTED_REPO}".`
		);
		console.error(
			`  Fix: ensure package.json build.publish.repo === "${EXPECTED_REPO}" and rebuild.`
		);
		ok = false;
	}

	if (ok) {
		console.log(`✓ Publish target OK (${label}): ${owner}/${repo}`);
	} else {
		failed++;
	}
}

if (found === 0) {
	console.warn('⚠ WARNING: No app-update.yml found in any platform release directory.');
	console.warn(
		'  Run `npm run package:linux` (or equivalent) first to generate release artifacts.'
	);
	process.exit(0);
}

if (failed > 0) {
	console.error(`\n✗ ${failed} of ${found} app-update.yml file(s) failed publish target check.`);
	process.exit(1);
}

console.log(`\n✓ All ${found} app-update.yml file(s) passed publish target check.`);
process.exit(0);
