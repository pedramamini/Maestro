import { execFile as execFileCallback } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AiWikiService } from '../service';

const execFile = promisify(execFileCallback);

async function git(repoPath: string, args: string[]): Promise<string> {
	const result = await execFile('git', args, { cwd: repoPath });
	return result.stdout.trim();
}

describe('AiWikiService', () => {
	let tempDir: string;
	let repoPath: string;
	let userDataPath: string;

	beforeEach(async () => {
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-wiki-service-'));
		repoPath = path.join(tempDir, 'repo');
		userDataPath = path.join(tempDir, 'userData');

		await fs.mkdir(path.join(repoPath, 'src'), { recursive: true });
		await fs.writeFile(path.join(repoPath, 'README.md'), '# Test Project\n', 'utf8');
		await fs.writeFile(path.join(repoPath, 'src', 'index.ts'), 'export const value = 1;\n', 'utf8');
		await fs.writeFile(path.join(repoPath, 'package.json'), '{"name":"test"}\n', 'utf8');

		await git(repoPath, ['init']);
		await git(repoPath, ['add', '.']);
		await git(repoPath, [
			'-c',
			'user.name=Test User',
			'-c',
			'user.email=test@example.com',
			'commit',
			'-m',
			'init',
		]);
	});

	afterEach(async () => {
		await fs.rm(tempDir, { recursive: true, force: true });
	});

	it('refresh writes state and deterministic markdown wiki pages', async () => {
		const service = new AiWikiService({ userDataPath });
		const snapshot = await service.refresh({ projectRoot: repoPath });
		const wikiPath = service.resolveWikiPath(snapshot.projectId);

		const [stateRaw, indexMd, changedFilesMd, summaryMd] = await Promise.all([
			fs.readFile(path.join(wikiPath, 'state.json'), 'utf8'),
			fs.readFile(path.join(wikiPath, 'index.md'), 'utf8'),
			fs.readFile(path.join(wikiPath, 'changed-files.md'), 'utf8'),
			fs.readFile(path.join(wikiPath, 'summary.md'), 'utf8'),
		]);
		const state = JSON.parse(stateRaw);

		expect(state.lastIndexedSha).toBe(snapshot.headSha);
		expect(state.projectRoot).toBe(repoPath);
		expect(indexMd).toContain(`# AI Wiki Index`);
		expect(indexMd).toContain(`- Project ID: ${snapshot.projectId}`);
		expect(indexMd).toContain(`- Source mode: local`);
		expect(indexMd).toContain(`- Project root: ${repoPath}`);
		expect(indexMd).toContain('- SSH remote: None');
		expect(indexMd).toContain('- [Changed Files](changed-files.md)');
		expect(indexMd).toContain('- [Summary](summary.md)');

		expect(changedFilesMd).toContain('# Changed Files');
		expect(changedFilesMd).toContain('## Tracked');
		expect(changedFilesMd).toContain('- README.md');
		expect(changedFilesMd).toContain('- package.json');
		expect(changedFilesMd).toContain('- src/index.ts');
		expect(changedFilesMd).toContain('## Uncommitted');

		expect(summaryMd).toContain('# Summary');
		expect(summaryMd).toContain('Summary source: changed files');
		expect(summaryMd).toContain('| .md | 1 |');
		expect(summaryMd).toContain('| .json | 1 |');
		expect(summaryMd).toContain('| .ts | 1 |');
		expect(summaryMd).toContain('| [root] | 2 |');
		expect(summaryMd).toContain('| src | 1 |');
	});

	it('getContextPacket reads generated markdown instead of returning the Slice 1 stub', async () => {
		const service = new AiWikiService({ userDataPath });
		await service.refresh({ projectRoot: repoPath });

		const packet = await service.getContextPacket({ projectRoot: repoPath });

		expect(packet.summary).toContain('## summary.md');
		expect(packet.summary).toContain('# Summary');
		expect(packet.summary).toContain('## changed-files.md');
		expect(packet.summary).toContain('# Changed Files');
		expect(packet.summary).toContain('## index.md');
		expect(packet.summary).not.toContain('context packet stub');
	});
});
