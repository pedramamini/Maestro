/**
 * @fileoverview Tests for the i18n extraction audit script.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
	isNonUserFacing,
	isAlreadyTranslated,
	scanFile,
	collectTsxFiles,
} from '../../../scripts/i18n-audit';

// ── Temp directory for scanFile / collectTsxFiles tests ────────────────────

let tmpDir: string;

beforeAll(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-audit-test-'));
});

afterAll(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeTmpTsx(name: string, content: string): string {
	const filePath = path.join(tmpDir, name);
	const dir = path.dirname(filePath);
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(filePath, content, 'utf-8');
	return filePath;
}

// ── isNonUserFacing ────────────────────────────────────────────────────────

describe('isNonUserFacing', () => {
	it('rejects empty and single-char strings', () => {
		expect(isNonUserFacing('')).toBe(true);
		expect(isNonUserFacing('x')).toBe(true);
	});

	it('rejects purely numeric strings', () => {
		expect(isNonUserFacing('42')).toBe(true);
		expect(isNonUserFacing('1,234.56')).toBe(true);
	});

	it('rejects CSS class names / Tailwind utilities', () => {
		expect(isNonUserFacing('flex items-center gap-2')).toBe(true);
		expect(isNonUserFacing('text-sm font-bold')).toBe(true);
		expect(isNonUserFacing('p-4 rounded-lg')).toBe(true);
	});

	it('rejects short camelCase identifiers', () => {
		expect(isNonUserFacing('onClick')).toBe(true);
		expect(isNonUserFacing('useState')).toBe(true);
	});

	it('rejects snake_case identifiers', () => {
		expect(isNonUserFacing('user_name')).toBe(true);
		expect(isNonUserFacing('max_retries')).toBe(true);
	});

	it('rejects kebab-case identifiers', () => {
		expect(isNonUserFacing('my-component')).toBe(true);
		expect(isNonUserFacing('data-testid')).toBe(true);
	});

	it('rejects dot-delimited keys', () => {
		expect(isNonUserFacing('settings.general')).toBe(true);
		expect(isNonUserFacing('app.config.name')).toBe(true);
	});

	it('rejects URLs and paths', () => {
		expect(isNonUserFacing('https://example.com')).toBe(true);
		expect(isNonUserFacing('./relative/path')).toBe(true);
		expect(isNonUserFacing('/absolute/path')).toBe(true);
	});

	it('rejects hex colours', () => {
		expect(isNonUserFacing('#fff')).toBe(true);
		expect(isNonUserFacing('#1a2b3c')).toBe(true);
	});

	it('rejects interpolation placeholders', () => {
		expect(isNonUserFacing('{{name}}')).toBe(true);
	});

	it('rejects MIME types', () => {
		expect(isNonUserFacing('application/json')).toBe(true);
		expect(isNonUserFacing('text/html')).toBe(true);
	});

	it('rejects i18n namespace:key patterns', () => {
		expect(isNonUserFacing('common:save_button')).toBe(true);
		expect(isNonUserFacing('settings:general.title')).toBe(true);
	});

	it('accepts real user-facing strings', () => {
		expect(isNonUserFacing('Create New Group')).toBe(false);
		expect(isNonUserFacing('Enter group name...')).toBe(false);
		expect(isNonUserFacing('Are you sure?')).toBe(false);
		expect(isNonUserFacing('Error Details (JSON)')).toBe(false);
		expect(isNonUserFacing('No compatible AI agents detected.')).toBe(false);
		expect(isNonUserFacing('Successfully connected!')).toBe(false);
	});
});

// ── isAlreadyTranslated ────────────────────────────────────────────────────

describe('isAlreadyTranslated', () => {
	it('detects t() calls', () => {
		const line = 'const label = t("common:save");';
		const idx = line.indexOf('"common:save"');
		expect(isAlreadyTranslated(line, idx)).toBe(true);
	});

	it('detects i18n.t() calls', () => {
		const line = 'i18n.t("notifications:title");';
		const idx = line.indexOf('"notifications:title"');
		expect(isAlreadyTranslated(line, idx)).toBe(true);
	});

	it('detects <T k="..." />', () => {
		const line = '<T k="common:save" />';
		const idx = line.indexOf('"common:save"');
		expect(isAlreadyTranslated(line, idx)).toBe(true);
	});

	it('detects tNotify key props', () => {
		const line = '  titleKey: "notifications:task.done",';
		const idx = line.indexOf('"notifications:task.done"');
		expect(isAlreadyTranslated(line, idx)).toBe(true);
	});

	it('detects import statements', () => {
		const line = 'import { Modal } from "./ui";';
		expect(isAlreadyTranslated(line, 10)).toBe(true);
	});

	it('detects className attributes', () => {
		const line = 'className="flex items-center gap-2"';
		const idx = line.indexOf('"flex');
		expect(isAlreadyTranslated(line, idx)).toBe(true);
	});

	it('detects console.log', () => {
		const line = 'console.log("Loading component");';
		expect(isAlreadyTranslated(line, 12)).toBe(true);
	});

	it('detects type definitions', () => {
		const line = 'type ButtonLabel = "save" | "cancel";';
		expect(isAlreadyTranslated(line, 20)).toBe(true);
	});

	it('returns false for untranslated JSX', () => {
		const line = '<span>Save Changes</span>';
		const idx = line.indexOf('Save');
		expect(isAlreadyTranslated(line, idx)).toBe(false);
	});

	it('returns false for untranslated attribute', () => {
		const line = 'title="Create New Group"';
		const idx = line.indexOf('"Create');
		expect(isAlreadyTranslated(line, idx)).toBe(false);
	});
});

// ── scanFile ───────────────────────────────────────────────────────────────

describe('scanFile', () => {
	it('detects hardcoded JSX text content', () => {
		const file = writeTmpTsx(
			'JsxText.tsx',
			[
				'export function Comp() {',
				'  return <div>',
				'    <span>Save Changes</span>',
				'  </div>;',
				'}',
			].join('\n')
		);

		const findings = scanFile(file);
		expect(findings.some((f) => f.text === 'Save Changes' && f.type === 'jsx-text')).toBe(true);
	});

	it('detects hardcoded title attributes', () => {
		const file = writeTmpTsx(
			'TitleAttr.tsx',
			['export function Comp() {', '  return <button title="Delete item">X</button>;', '}'].join(
				'\n'
			)
		);

		const findings = scanFile(file);
		expect(findings.some((f) => f.text === 'Delete item' && f.attribute === 'title')).toBe(true);
	});

	it('detects hardcoded placeholder attributes', () => {
		const file = writeTmpTsx(
			'Placeholder.tsx',
			[
				'export function Comp() {',
				'  return <input placeholder="Enter your name..." />;',
				'}',
			].join('\n')
		);

		const findings = scanFile(file);
		expect(
			findings.some((f) => f.text === 'Enter your name...' && f.attribute === 'placeholder')
		).toBe(true);
	});

	it('detects hardcoded aria-label attributes', () => {
		const file = writeTmpTsx(
			'AriaLabel.tsx',
			[
				'export function Comp() {',
				'  return <button aria-label="Close modal">X</button>;',
				'}',
			].join('\n')
		);

		const findings = scanFile(file);
		expect(findings.some((f) => f.text === 'Close modal' && f.attribute === 'aria-label')).toBe(
			true
		);
	});

	it('detects toast message prop values', () => {
		const file = writeTmpTsx(
			'Toast.tsx',
			[
				'export function notify() {',
				"  notifyToast({ title: 'Connection lost', message: 'Please reconnect', type: 'error' });",
				'}',
			].join('\n')
		);

		const findings = scanFile(file);
		expect(findings.some((f) => f.text === 'Connection lost' && f.type === 'prop-value')).toBe(
			true
		);
		expect(findings.some((f) => f.text === 'Please reconnect' && f.type === 'prop-value')).toBe(
			true
		);
	});

	it('skips strings wrapped in t()', () => {
		const file = writeTmpTsx(
			'Translated.tsx',
			[
				'export function Comp() {',
				'  const { t } = useTranslation();',
				'  return <span>{t("common:save")}</span>;',
				'}',
			].join('\n')
		);

		const findings = scanFile(file);
		expect(findings.some((f) => f.text === 'common:save')).toBe(false);
	});

	it('skips className values', () => {
		const file = writeTmpTsx(
			'ClassName.tsx',
			[
				'export function Comp() {',
				'  return <div className="flex items-center gap-2">Text</div>;',
				'}',
			].join('\n')
		);

		const findings = scanFile(file);
		expect(findings.some((f) => f.text === 'flex items-center gap-2')).toBe(false);
	});

	it('skips comment-only lines', () => {
		const file = writeTmpTsx(
			'Comment.tsx',
			[
				'export function Comp() {',
				'  // title="Not a real attribute"',
				'  /* placeholder="Also not real" */',
				'  return <div />;',
				'}',
			].join('\n')
		);

		const findings = scanFile(file);
		expect(findings.length).toBe(0);
	});

	it('skips console.log strings', () => {
		const file = writeTmpTsx(
			'Console.tsx',
			[
				'export function Comp() {',
				"  console.log('Loading component');",
				'  return <div />;',
				'}',
			].join('\n')
		);

		const findings = scanFile(file);
		expect(findings.some((f) => f.text === 'Loading component')).toBe(false);
	});

	it('handles curly-brace attribute syntax', () => {
		const file = writeTmpTsx(
			'CurlyAttr.tsx',
			[
				'export function Comp() {',
				"  return <input placeholder={'Type something here...'} />;",
				'}',
			].join('\n')
		);

		const findings = scanFile(file);
		expect(
			findings.some((f) => f.text === 'Type something here...' && f.attribute === 'placeholder')
		).toBe(true);
	});
});

// ── collectTsxFiles ────────────────────────────────────────────────────────

describe('collectTsxFiles', () => {
	it('finds .tsx files recursively', () => {
		writeTmpTsx('collect/A.tsx', '<div />');
		writeTmpTsx('collect/sub/B.tsx', '<div />');
		writeTmpTsx('collect/sub/deep/C.tsx', '<div />');
		writeTmpTsx('collect/not-tsx.ts', 'export const x = 1;');

		const files = collectTsxFiles(path.join(tmpDir, 'collect'));
		const names = files.map((f) => path.basename(f));

		expect(names).toContain('A.tsx');
		expect(names).toContain('B.tsx');
		expect(names).toContain('C.tsx');
		expect(names).not.toContain('not-tsx.ts');
	});

	it('returns empty array for non-existent directory', () => {
		const files = collectTsxFiles('/tmp/non-existent-dir-12345');
		expect(files).toEqual([]);
	});
});
