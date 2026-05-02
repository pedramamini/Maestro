import { describe, expect, it } from 'vitest';
import {
	countAiWikiPathsByExtension,
	countAiWikiPathsByTopDirectory,
	mergeAiWikiChangedFiles,
	parseGitNameOnlyOutput,
	parseGitPorcelainChangedFiles,
	resolveAiWikiPath,
	resolveAiWikiProjectId,
	sanitizeAiWikiProjectId,
	shouldIgnoreAiWikiSourcePath,
} from '../helpers';

describe('ai-wiki helpers', () => {
	it('sanitizes project ids for filesystem storage', () => {
		expect(sanitizeAiWikiProjectId(' ../My Project:main ')).toBe('..-My-Project-main');
		expect(sanitizeAiWikiProjectId('///')).toBe('project');
		expect(sanitizeAiWikiProjectId('..')).toBe('project');
	});

	it('resolves project ids from explicit id or project root', () => {
		expect(resolveAiWikiProjectId({ projectRoot: '/opt/Maestro-fork', projectId: 'pm/main' })).toBe(
			'pm-main'
		);
		expect(resolveAiWikiProjectId({ projectRoot: '/opt/Maestro-fork' })).toMatch(
			/^Maestro-fork-[a-f0-9]{10}$/
		);
		expect(resolveAiWikiProjectId({ projectRoot: '/srv/app', sshRemoteId: 'prod-1' })).toMatch(
			/^prod-1-app-[a-f0-9]{10}$/
		);
		expect(resolveAiWikiProjectId({ projectRoot: '/srv/app', sshRemoteId: 'prod-1' })).not.toBe(
			resolveAiWikiProjectId({ projectRoot: '/srv/app', sshRemoteId: 'prod-2' })
		);
	});

	it('resolves wiki paths under userData/project-wikis', () => {
		expect(resolveAiWikiPath('/tmp/userData', 'pm/main')).toBe(
			'/tmp/userData/project-wikis/pm-main'
		);
	});

	it('parses git changed-file outputs', () => {
		expect(parseGitNameOnlyOutput('src/a.ts\n\n src/b.ts \n')).toEqual(['src/a.ts', 'src/b.ts']);
		expect(
			parseGitPorcelainChangedFiles(' M src/a.ts\nR  old.ts -> src/new.ts\n?? notes.md\n')
		).toEqual(['src/a.ts', 'src/new.ts', 'notes.md']);
	});

	it('ignores obvious generated and vendor paths', () => {
		expect(shouldIgnoreAiWikiSourcePath('node_modules/pkg/index.js')).toBe(true);
		expect(shouldIgnoreAiWikiSourcePath('src/generated/client.ts')).toBe(false);
		expect(shouldIgnoreAiWikiSourcePath('packages/app/dist/index.js')).toBe(true);
		expect(shouldIgnoreAiWikiSourcePath('src/index.ts')).toBe(false);
	});

	it('merges and sorts changed files after filtering', () => {
		expect(
			mergeAiWikiChangedFiles(
				['src/b.ts', 'node_modules/pkg/index.js', 'src/a.ts'],
				['src/a.ts', 'dist/app.js', 'README.md']
			)
		).toEqual([
			{ path: 'README.md', source: 'uncommitted' },
			{ path: 'src/a.ts', source: 'uncommitted' },
			{ path: 'src/b.ts', source: 'tracked' },
		]);
	});

	it('counts paths by extension and top directory deterministically', () => {
		const paths = ['src/index.ts', 'README.md', 'src/App.tsx', 'package.json', 'LICENSE'];

		expect(countAiWikiPathsByExtension(paths)).toEqual([
			['.json', 1],
			['.md', 1],
			['.ts', 1],
			['.tsx', 1],
			['[none]', 1],
		]);
		expect(countAiWikiPathsByTopDirectory(paths)).toEqual([
			['[root]', 3],
			['src', 2],
		]);
	});
});
