#!/usr/bin/env node
/**
 * scripts/audit-web-routes.mjs
 *
 * Web Route Registry Audit — Wiring Audit 002
 *
 * Walks two sources and emits a manifest JSON to stdout (or a file):
 *
 *   server  – every HTTP route registered via server.[get|post|put|delete]()
 *             in src/main/web-server/routes/*.ts.
 *             Template literals like `/${token}${WEB_API_PREFIXES.foo}/bar`
 *             are resolved to canonical /api/<feature>/bar paths by stripping
 *             the leading /${<token-var>} segment.
 *
 *   client  – every fetch/buildApiUrl call site in src/web/hooks/use*.ts
 *             and src/web/mobile/*.tsx that targets a /api/* path.
 *             Paths constructed via WEB_API_PREFIXES constants are resolved
 *             to their canonical /api/<feature>/... forms.
 *
 * Dynamic segments (e.g. ${encodeURIComponent(id)}, ${sessionId}) are
 * normalised to a :param placeholder so server and client paths can be
 * compared structurally.
 *
 * Outputs: { server: string[], client: string[] }
 *
 * Usage:
 *   node scripts/audit-web-routes.mjs                  # prints JSON to stdout
 *   node scripts/audit-web-routes.mjs --out manifest.json
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../../');

// ---------------------------------------------------------------------------
// WEB_API_PREFIXES — kept in sync with src/shared/web-routes.ts
// ---------------------------------------------------------------------------
// We duplicate the values here so the script has no TypeScript dependency.

const WEB_API_PREFIXES = {
	deliveryPlanner: '/api/delivery-planner',
	livingWiki: '/api/living-wiki',
	workGraph: '/api/work-graph',
	agentDispatch: '/api/agent-dispatch',
};

// ---------------------------------------------------------------------------
// File walking
// ---------------------------------------------------------------------------

function walk(dir, results = []) {
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		const stat = statSync(full);
		if (stat.isDirectory()) {
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
// Path normalisation helpers
// ---------------------------------------------------------------------------

/**
 * Expand known WEB_API_PREFIXES constant references in a path string.
 * e.g. "${WEB_API_PREFIXES.agentDispatch}/board" -> "/api/agent-dispatch/board"
 */
function expandPrefixes(raw) {
	let out = raw;
	for (const [key, value] of Object.entries(WEB_API_PREFIXES)) {
		// Template-literal style: ${WEB_API_PREFIXES.key}
		out = out.replaceAll(`\${WEB_API_PREFIXES.${key}}`, value);
		// Direct string style: WEB_API_PREFIXES.key
		out = out.replaceAll(`WEB_API_PREFIXES.${key}`, value);
	}
	return out;
}

/**
 * Strip the leading /${<anything>} token segment from a server route path.
 * e.g. "/${token}/api/sessions" -> "/api/sessions"
 */
function stripTokenPrefix(raw) {
	const expanded = expandPrefixes(raw);
	return expanded.replace(/^\/\$\{[^}]+\}/, '');
}

/**
 * Normalise dynamic segments to :param placeholders.
 */
function normaliseDynamicSegments(path) {
	// Truncate at any conditional ternary expression like ${x ? '...' : ''}.
	// These appear as query-string suffixes, never in path segments.
	let out = path
		.replace(/\$\{[^}]*\?[^}]*\}.*$/, '') // fully closed ternary
		.replace(/\$\{[^?}]*\?.*$/, ''); // truncated ternary (inner backtick hit first)
	// Strip a trailing ${identifier} that looks like a query-string variable
	// (e.g. ${tabParam} after /session/${activeSessionId}${tabParam})
	out = out.replace(/\$\{(?:\w*[Pp]aram\w*|\w*[Ss]tr(?:ing)?\w*|\w*[Qq]uery\w*)\}$/, '');
	// Replace remaining ${...} interpolations with :param
	out = out.replace(/\$\{[^}]+\}/g, ':param');
	// Trim trailing query-string-looking parts (e.g. ?tabId=...)
	out = out.replace(/\?.*$/, '');
	// Normalise Fastify-style path params (:paramName) to :param for structural comparison
	out = out.replace(/:[\w]+/g, ':param');
	// Collapse consecutive :param segments
	out = out.replace(/(:param)+/g, ':param');
	// Collapse double slashes
	out = out.replace(/\/+/g, '/');
	// Ensure leading slash, no trailing slash
	if (!out.startsWith('/')) out = '/' + out;
	out = out.replace(/\/$/, '');
	return out;
}

/**
 * Full normalisation pipeline: expand prefixes -> strip token -> normalise segments.
 */
function canonicalisePath(raw) {
	const stripped = stripTokenPrefix(raw);
	return normaliseDynamicSegments(stripped);
}

// ---------------------------------------------------------------------------
// Server route extraction
// ---------------------------------------------------------------------------

const SERVER_ROUTE_TPL_RE =
	/server\s*\.\s*(?:get|post|put|delete|patch)\s*\(\s*`((?:[^`\\]|\\.)*)`/g;
const SERVER_ROUTE_QUOTED_RE =
	/server\s*\.\s*(?:get|post|put|delete|patch)\s*\(\s*(['"])((?:(?!\1)[\s\S])*?)\1/g;

function extractServerRoutes(src) {
	const routes = new Set();

	let m;
	const tplRe = new RegExp(SERVER_ROUTE_TPL_RE.source, 'g');
	while ((m = tplRe.exec(src)) !== null) {
		const canonical = canonicalisePath(m[1]);
		if (canonical.startsWith('/api/')) {
			routes.add(canonical);
		}
	}

	const qRe = new RegExp(SERVER_ROUTE_QUOTED_RE.source, 'g');
	while ((m = qRe.exec(src)) !== null) {
		const canonical = canonicalisePath(m[2]);
		if (canonical.startsWith('/api/')) {
			routes.add(canonical);
		}
	}

	return routes;
}

// ---------------------------------------------------------------------------
// Client fetch-site extraction
// ---------------------------------------------------------------------------

// buildApiUrl with template literal (handle nested backticks by capturing up to
// the first inner backtick or end of outer template)
const BUILD_API_URL_TPL_RE = /buildApiUrl\s*\(\s*`((?:[^`\\]|\\.)*)`/g;
// buildApiUrl with quoted string
const BUILD_API_URL_QUOTED_RE = /buildApiUrl\s*\(\s*(['"])((?:(?!\1)[^])*?)\1\s*\)/g;
// fetch(`${getApiBaseUrl()}/api/...`) -- capture the /api/... part
const FETCH_BASE_URL_TPL_RE = /fetch\s*\(\s*`\$\{getApiBaseUrl\(\)\}(\/api\/[^`]+)`/g;
// postAction with template literal (first arg is an api-relative path passed to buildApiUrl)
const POST_ACTION_TPL_RE = /postAction\s*\(\s*`((?:[^`\\]|\\.)*)`/g;
// postAction with quoted string
const POST_ACTION_QUOTED_RE = /postAction\s*\(\s*(['"])((?:(?!\1)[^])*?)\1\s*[,)]/g;

/**
 * Convert a raw api-relative path to a /api/... canonical path.
 * buildApiUrl/postAction args may omit the /api prefix if they pass a full
 * WEB_API_PREFIXES expression. Short paths like /session/... need /api prepended.
 */
function apiRelativeToCanonical(raw) {
	const expanded = expandPrefixes(raw);
	const normalised = normaliseDynamicSegments(expanded);
	if (normalised.startsWith('/api/')) return normalised;
	if (normalised.startsWith('/')) return '/api' + normalised;
	return '/api/' + normalised;
}

function extractClientRoutes(src) {
	const routes = new Set();

	let m;

	// buildApiUrl template literals
	const buTpl = new RegExp(BUILD_API_URL_TPL_RE.source, 'g');
	while ((m = buTpl.exec(src)) !== null) {
		const canonical = apiRelativeToCanonical(m[1]);
		if (canonical.startsWith('/api/')) routes.add(canonical);
	}

	// buildApiUrl quoted strings
	const buQ = new RegExp(BUILD_API_URL_QUOTED_RE.source, 'g');
	while ((m = buQ.exec(src)) !== null) {
		const canonical = apiRelativeToCanonical(m[2]);
		if (canonical.startsWith('/api/')) routes.add(canonical);
	}

	// fetch(`${getApiBaseUrl()}/api/...`)
	const fetchTpl = new RegExp(FETCH_BASE_URL_TPL_RE.source, 'g');
	while ((m = fetchTpl.exec(src)) !== null) {
		const canonical = normaliseDynamicSegments(m[1]);
		if (canonical.startsWith('/api/')) routes.add(canonical);
	}

	// postAction template literals
	const paTpl = new RegExp(POST_ACTION_TPL_RE.source, 'g');
	while ((m = paTpl.exec(src)) !== null) {
		const canonical = apiRelativeToCanonical(m[1]);
		if (canonical.startsWith('/api/')) routes.add(canonical);
	}

	// postAction quoted strings
	const paQ = new RegExp(POST_ACTION_QUOTED_RE.source, 'g');
	while ((m = paQ.exec(src)) !== null) {
		const canonical = apiRelativeToCanonical(m[2]);
		if (canonical.startsWith('/api/')) routes.add(canonical);
	}

	return routes;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const serverRoutesDir = join(ROOT, 'src', 'main', 'web-server', 'routes');
const clientHooksDir = join(ROOT, 'src', 'web', 'hooks');
const clientMobileDir = join(ROOT, 'src', 'web', 'mobile');

// Collect server routes
const serverRoutes = new Set();
for (const file of walk(serverRoutesDir)) {
	const src = readFile(file);
	for (const route of extractServerRoutes(src)) {
		serverRoutes.add(route);
	}
}

// Collect client routes (hooks -- only use*.ts files)
const clientRoutes = new Set();
for (const file of walk(clientHooksDir)) {
	const base = file.split('/').pop() ?? '';
	if (!base.startsWith('use')) continue;
	const src = readFile(file);
	for (const route of extractClientRoutes(src)) {
		clientRoutes.add(route);
	}
}

// Collect client routes (mobile)
for (const file of walk(clientMobileDir)) {
	const src = readFile(file);
	for (const route of extractClientRoutes(src)) {
		clientRoutes.add(route);
	}
}

const manifest = {
	server: [...serverRoutes].sort(),
	client: [...clientRoutes].sort(),
};

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');

if (outIdx !== -1 && args[outIdx + 1]) {
	const outPath = resolve(args[outIdx + 1]);
	writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
	process.stderr.write(`Manifest written to ${outPath}\n`);
} else {
	process.stdout.write(JSON.stringify(manifest, null, 2) + '\n');
}
