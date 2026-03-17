/**
 * i18n Extraction Audit Script
 *
 * Scans .tsx files under src/renderer/components/ and src/web/ to identify
 * hardcoded user-facing strings that have not yet been wrapped with i18n
 * translation helpers (t(), <T>, tNotify()).
 *
 * Usage:
 *   npx tsx scripts/i18n-audit.ts
 *   npx tsx scripts/i18n-audit.ts --json          # JSON output
 *   npx tsx scripts/i18n-audit.ts --summary-only   # Only show directory counts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Configuration ──────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const SCAN_DIRS = ['src/renderer/components', 'src/web'];

/** JSX/HTML attributes that commonly contain user-facing strings */
const USER_FACING_ATTRS = [
	'title',
	'placeholder',
	'aria-label',
	'aria-description',
	'aria-placeholder',
	'aria-roledescription',
	'aria-valuetext',
	'label',
	'confirmLabel',
	'cancelLabel',
	'alt',
	'description',
	'tooltip',
	'helperText',
	'errorMessage',
	'successMessage',
	'emptyText',
	'loadingText',
];

/** Minimum string length to consider (skip single chars and empty) */
const MIN_STRING_LENGTH = 2;

// ── Types ──────────────────────────────────────────────────────────────────

export interface Finding {
	file: string;
	line: number;
	type: 'jsx-text' | 'attribute' | 'prop-value';
	attribute?: string;
	text: string;
}

interface DirectorySummary {
	dir: string;
	fileCount: number;
	findingCount: number;
}

// ── File discovery ─────────────────────────────────────────────────────────

export function collectTsxFiles(dir: string): string[] {
	const results: string[] = [];
	if (!fs.existsSync(dir)) return results;

	const entries = fs.readdirSync(dir, { withFileTypes: true });
	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			results.push(...collectTsxFiles(fullPath));
		} else if (entry.name.endsWith('.tsx')) {
			results.push(fullPath);
		}
	}
	return results;
}

// ── Skip-list helpers ──────────────────────────────────────────────────────

/**
 * Returns true if the string looks like a non-user-facing value:
 * CSS class, code identifier, URL, hex colour, file path, etc.
 */
export function isNonUserFacing(s: string): boolean {
	const trimmed = s.trim();

	// Too short
	if (trimmed.length < MIN_STRING_LENGTH) return true;

	// Purely numeric / whitespace
	if (/^\s*[\d.,]+\s*$/.test(trimmed)) return true;

	// CSS class names (space-separated tokens that look like Tailwind/utility classes)
	if (
		/^[a-z0-9[\]/:._-]+(\s+[a-z0-9[\]/:._-]+)*$/i.test(trimmed) &&
		/[-_/[\]]/.test(trimmed) &&
		!/\s[A-Z]/.test(trimmed)
	)
		return true;

	// Single camelCase / PascalCase identifier without spaces (likely a code reference)
	if (/^[a-zA-Z][a-zA-Z0-9]*$/.test(trimmed) && trimmed.length < 20) return true;

	// snake_case identifiers without spaces
	if (/^[a-z][a-z0-9_]*$/.test(trimmed)) return true;

	// kebab-case identifiers (CSS vars, data attrs, etc.)
	if (/^[a-z][a-z0-9-]*$/.test(trimmed)) return true;

	// Dot-delimited keys (object paths, config keys) like "settings.general"
	if (/^[a-z][a-z0-9_.]*$/i.test(trimmed) && trimmed.includes('.') && !trimmed.includes(' '))
		return true;

	// URLs and paths
	if (/^(https?:\/\/|\.\/|\.\.\/|\/)/.test(trimmed)) return true;

	// Hex colours
	if (/^#[0-9a-fA-F]{3,8}$/.test(trimmed)) return true;

	// Pure interpolation placeholder: "{{foo}}"
	if (/^\{\{[^}]+\}\}$/.test(trimmed)) return true;

	// Single emoji
	if (/^[\p{Emoji_Presentation}\p{Extended_Pictographic}]{1,2}$/u.test(trimmed)) return true;

	// MIME types
	if (/^[a-z]+\/[a-z0-9.+-]+$/i.test(trimmed)) return true;

	// i18n namespace:key patterns (already using i18n)
	if (/^[a-z]+:[a-z_]+(\.[a-z_]+)*$/i.test(trimmed)) return true;

	return false;
}

/**
 * Returns true if the surrounding line context indicates the string
 * is already translated or is non-user-facing code.
 */
export function isAlreadyTranslated(line: string, matchStart: number): boolean {
	const before = line.slice(0, matchStart);

	// t('...')  or  t("...")  or  i18n.t(...)
	if (/\bt\(\s*$/.test(before) || /i18n\.t\(\s*$/.test(before)) return true;

	// <T k="..." />
	if (/<T\s[^>]*k\s*=\s*$/.test(before)) return true;

	// tNotify({ titleKey: / messageKey: )
	if (/(?:titleKey|messageKey)\s*:\s*$/.test(before)) return true;

	// import/require statements
	if (/^\s*(import |require\()/.test(line)) return true;

	// className / class / style / data- attributes
	if (/(?:className|class|style|data-[a-z]+)\s*=\s*(?:\{[^}]*)?$/.test(before)) return true;

	// console.log / console.error / console.warn
	if (/console\.(log|error|warn|info|debug)\(/.test(line)) return true;

	// TypeScript type annotations and interface definitions
	if (/^\s*(type |interface |export type |export interface )/.test(line)) return true;

	return false;
}

// ── Scanning engine ────────────────────────────────────────────────────────

export function scanFile(filePath: string): Finding[] {
	const findings: Finding[] = [];
	const content = fs.readFileSync(filePath, 'utf-8');
	const lines = content.split('\n');
	const relPath = path.relative(ROOT, filePath);

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const lineNum = i + 1;

		// Skip comment-only lines
		if (/^\s*(\/\/|\/\*|\*)/.test(line)) continue;

		// ── 1. Attribute strings: attr="..." or attr={'...'} ───────────
		const attrPattern = new RegExp(
			`(?:${USER_FACING_ATTRS.join('|')})\\s*=\\s*(?:"([^"]+)"|\\{'([^']+)'\\}|\\{"([^"]+)"\\})`,
			'g'
		);
		let attrMatch: RegExpExecArray | null;
		while ((attrMatch = attrPattern.exec(line)) !== null) {
			const text = attrMatch[1] ?? attrMatch[2] ?? attrMatch[3];
			if (!text) continue;
			if (isNonUserFacing(text)) continue;
			if (isAlreadyTranslated(line, attrMatch.index)) continue;

			// Determine which attribute name matched
			const attrNameMatch = attrMatch[0].match(/^([a-zA-Z-]+)\s*=/);
			const attrName = attrNameMatch?.[1] ?? 'unknown';

			findings.push({
				file: relPath,
				line: lineNum,
				type: 'attribute',
				attribute: attrName,
				text,
			});
		}

		// ── 2. JSX text content: >Some text here< ─────────────────────
		// Matches text between > and < that contains word characters
		const jsxTextPattern = />\s*([A-Z][^<>{]*?)\s*</g;
		let jsxMatch: RegExpExecArray | null;
		while ((jsxMatch = jsxTextPattern.exec(line)) !== null) {
			const text = jsxMatch[1].trim();
			if (!text || text.length < MIN_STRING_LENGTH) continue;
			if (isNonUserFacing(text)) continue;
			if (isAlreadyTranslated(line, jsxMatch.index)) continue;
			// Skip if it looks like a JSX component tag
			if (/^[A-Z][a-zA-Z]*\s*$/.test(text)) continue;
			// Skip if it's inside a component self-closing tag
			if (/^[A-Z][a-zA-Z]*\s*\//.test(text)) continue;

			findings.push({
				file: relPath,
				line: lineNum,
				type: 'jsx-text',
				text,
			});
		}

		// ── 3. Common prop patterns with string values ─────────────────
		// notifyToast({ title: '...', message: '...' })
		const toastPropPattern = /(?:title|message)\s*:\s*(?:'([^']{2,})'|"([^"]{2,})")/g;
		let toastMatch: RegExpExecArray | null;
		while ((toastMatch = toastPropPattern.exec(line)) !== null) {
			const text = toastMatch[1] ?? toastMatch[2];
			if (!text) continue;
			if (isNonUserFacing(text)) continue;
			if (isAlreadyTranslated(line, toastMatch.index)) continue;
			// Skip if this was already caught as an attribute
			if (findings.some((f) => f.line === lineNum && f.text === text)) continue;

			findings.push({
				file: relPath,
				line: lineNum,
				type: 'prop-value',
				attribute: toastMatch[0].match(/^(\w+)/)?.[1],
				text,
			});
		}
	}

	return findings;
}

// ── Output formatting ──────────────────────────────────────────────────────

function printFindings(findings: Finding[]): void {
	let currentFile = '';
	for (const f of findings) {
		if (f.file !== currentFile) {
			currentFile = f.file;
			console.log(`\n\x1b[36m${currentFile}\x1b[0m`);
		}
		const attr = f.attribute ? ` [${f.attribute}]` : '';
		const typeLabel = f.type === 'jsx-text' ? 'text' : f.type === 'attribute' ? 'attr' : 'prop';
		console.log(`  \x1b[33mL${f.line}\x1b[0m  \x1b[2m${typeLabel}${attr}\x1b[0m  ${f.text}`);
	}
}

function printSummary(findings: Finding[], scanDirs: string[]): void {
	// Group by top-level directory within the scan dirs
	const dirCounts = new Map<string, { files: Set<string>; count: number }>();

	for (const f of findings) {
		// Get the component directory (2 levels deep from scan root)
		const parts = f.file.split('/');
		// Find which scan dir this belongs to
		let dirKey = '';
		for (const sd of scanDirs) {
			if (f.file.startsWith(sd)) {
				const relative = f.file.slice(sd.length + 1);
				const subDir = relative.split('/')[0];
				dirKey = subDir ? `${sd}/${subDir}` : sd;
				break;
			}
		}
		if (!dirKey) dirKey = path.dirname(f.file);

		if (!dirCounts.has(dirKey)) {
			dirCounts.set(dirKey, { files: new Set(), count: 0 });
		}
		const entry = dirCounts.get(dirKey)!;
		entry.files.add(f.file);
		entry.count++;
	}

	console.log('\n\x1b[1m── Summary by Directory ──\x1b[0m\n');

	const sorted = [...dirCounts.entries()].sort((a, b) => b[1].count - a[1].count);
	for (const [dir, { files, count }] of sorted) {
		console.log(`  \x1b[36m${dir}\x1b[0m — ${count} strings in ${files.size} files`);
	}

	const totalFiles = new Set(findings.map((f) => f.file)).size;
	console.log(
		`\n\x1b[1mTotal: ${findings.length} untranslated strings across ${totalFiles} files\x1b[0m`
	);
}

// ── Main ───────────────────────────────────────────────────────────────────

function main(): void {
	const args = process.argv.slice(2);
	const jsonMode = args.includes('--json');
	const summaryOnly = args.includes('--summary-only');

	console.log('\x1b[1mi18n Extraction Audit\x1b[0m');
	console.log(`Scanning directories: ${SCAN_DIRS.join(', ')}\n`);

	const allFindings: Finding[] = [];
	let totalFiles = 0;

	for (const scanDir of SCAN_DIRS) {
		const absDir = path.resolve(ROOT, scanDir);
		const files = collectTsxFiles(absDir);
		totalFiles += files.length;

		for (const file of files) {
			const findings = scanFile(file);
			allFindings.push(...findings);
		}
	}

	console.log(`Scanned ${totalFiles} .tsx files`);

	if (jsonMode) {
		console.log(JSON.stringify({ findings: allFindings, total: allFindings.length }, null, 2));
		return;
	}

	if (!summaryOnly) {
		printFindings(allFindings);
	}

	printSummary(allFindings, SCAN_DIRS);
}

// Run main() only when executed directly (not imported for testing)
const isDirectRun =
	process.argv[1]?.endsWith('i18n-audit.ts') || process.argv[1]?.includes('i18n-audit');
if (isDirectRun) {
	main();
}
