import fs from 'fs/promises';
import path from 'path';
import type { SshRemoteConfig } from '../../shared/types';
import type {
	AiWikiChangedFile,
	AiWikiContextPacket,
	AiWikiProjectRequest,
	AiWikiSourceSnapshot,
	AiWikiState,
} from '../../shared/ai-wiki-types';
import { execGit } from '../utils/remote-git';
import { getSshRemoteById } from '../stores/getters';
import {
	countAiWikiPathsByExtension,
	countAiWikiPathsByTopDirectory,
	mergeAiWikiChangedFiles,
	parseGitNameOnlyOutput,
	parseGitPorcelainChangedFiles,
	resolveAiWikiPath,
	resolveAiWikiProjectId,
	shouldIgnoreAiWikiSourcePath,
} from './helpers';

const STATE_FILE = 'state.json';
const INDEX_FILE = 'index.md';
const CHANGED_FILES_FILE = 'changed-files.md';
const SUMMARY_FILE = 'summary.md';
const CONTEXT_PACKET_MAX_CHARS = 12000;

export interface AiWikiServiceOptions {
	userDataPath: string;
}

interface GitCommandContext {
	projectRoot: string;
	sshRemote?: SshRemoteConfig;
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
	try {
		const raw = await fs.readFile(filePath, 'utf8');
		return JSON.parse(raw) as T;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
		throw error;
	}
}

async function runGit(args: string[], context: GitCommandContext) {
	return execGit(args, context.projectRoot, context.sshRemote, context.projectRoot);
}

async function readOptionalGitStdout(
	args: string[],
	context: GitCommandContext
): Promise<string | null> {
	const result = await runGit(args, context);
	if (result.exitCode !== 0) return null;
	return result.stdout.trim();
}

async function assertGitRepository(context: GitCommandContext): Promise<void> {
	const result = await runGit(['rev-parse', '--is-inside-work-tree'], context);
	if (result.exitCode !== 0 || result.stdout.trim() !== 'true') {
		throw new Error(`Not a git repository: ${context.projectRoot}`);
	}
}

async function readOptionalTextFile(filePath: string): Promise<string | null> {
	try {
		return await fs.readFile(filePath, 'utf8');
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
		throw error;
	}
}

function markdownList(items: string[]): string {
	if (items.length === 0) return '- None\n';
	return items.map((item) => `- ${item}`).join('\n') + '\n';
}

function markdownCountTable(rows: Array<[string, number]>, emptyLabel: string): string {
	if (rows.length === 0) return `${emptyLabel}\n`;
	return (
		[
			'| Name | Count |',
			'| --- | ---: |',
			...rows.map(([name, count]) => `| ${escapeMarkdownTableCell(name)} | ${count} |`),
		].join('\n') + '\n'
	);
}

function escapeMarkdownTableCell(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
}

function compactMarkdownFiles(files: Array<{ name: string; content: string | null }>): string {
	const sections = files
		.filter((file): file is { name: string; content: string } => Boolean(file.content?.trim()))
		.map((file) => `## ${file.name}\n\n${file.content.trim()}`);

	if (sections.length === 0) {
		return 'AI Wiki has not been refreshed yet. Run aiWiki.refresh to generate project context.';
	}

	const combined = sections.join('\n\n');
	if (combined.length <= CONTEXT_PACKET_MAX_CHARS) return combined;
	return `${combined.slice(0, CONTEXT_PACKET_MAX_CHARS - 120).trimEnd()}\n\n[Truncated to ${CONTEXT_PACKET_MAX_CHARS} characters]`;
}

export class AiWikiService {
	private userDataPath: string;

	constructor(options: AiWikiServiceOptions) {
		this.userDataPath = options.userDataPath;
	}

	resolveProjectId(request: AiWikiProjectRequest): string {
		return resolveAiWikiProjectId(request);
	}

	resolveWikiPath(projectId: string): string {
		return resolveAiWikiPath(this.userDataPath, projectId);
	}

	async readState(projectId: string): Promise<AiWikiState | null> {
		return readJsonFile<AiWikiState>(path.join(this.resolveWikiPath(projectId), STATE_FILE));
	}

	async writeState(projectId: string, state: AiWikiState): Promise<AiWikiState> {
		const wikiPath = this.resolveWikiPath(projectId);
		await fs.mkdir(wikiPath, { recursive: true });
		await fs.writeFile(path.join(wikiPath, STATE_FILE), JSON.stringify(state, null, 2), 'utf8');
		return state;
	}

	async getStatus(request: AiWikiProjectRequest): Promise<AiWikiSourceSnapshot> {
		const projectId = this.resolveProjectId(request);
		const wikiPath = this.resolveWikiPath(projectId);
		const existingState = await this.readState(projectId);
		const sourceMode = request.sshRemoteId ? 'ssh' : 'local';
		const sshRemote = request.sshRemoteId ? getSshRemoteById(request.sshRemoteId) : undefined;
		if (request.sshRemoteId && !sshRemote) {
			throw new Error(`SSH remote not found: ${request.sshRemoteId}`);
		}

		const gitContext = { projectRoot: request.projectRoot, sshRemote };
		await assertGitRepository(gitContext);
		const [headSha, branch, remoteSha, trackedStdout, uncommittedStdout] = await Promise.all([
			readOptionalGitStdout(['rev-parse', 'HEAD'], gitContext),
			readOptionalGitStdout(['rev-parse', '--abbrev-ref', 'HEAD'], gitContext),
			readOptionalGitStdout(['rev-parse', '@{upstream}'], gitContext),
			this.readTrackedChanges(gitContext, existingState?.lastIndexedSha ?? null),
			readOptionalGitStdout(['status', '--porcelain'], gitContext),
		]);

		const changedFiles = mergeAiWikiChangedFiles(
			parseGitNameOnlyOutput(trackedStdout ?? ''),
			parseGitPorcelainChangedFiles(uncommittedStdout ?? '')
		);

		const state: AiWikiState = {
			sourceMode,
			projectRoot: request.projectRoot,
			sshRemoteId: request.sshRemoteId ?? undefined,
			branch: branch && branch !== 'HEAD' ? branch : null,
			lastIndexedSha: existingState?.lastIndexedSha ?? null,
			lastKnownRemoteSha: remoteSha,
			lastUpdatedAt: existingState?.lastUpdatedAt ?? new Date().toISOString(),
		};

		return {
			projectId,
			wikiPath,
			state,
			headSha,
			remoteSha,
			changedFiles,
		};
	}

	async refresh(request: AiWikiProjectRequest): Promise<AiWikiSourceSnapshot> {
		const snapshot = await this.getStatus(request);
		const now = new Date().toISOString();
		const gitContext = await this.resolveGitContext(request);
		const trackedFiles = await this.readTrackedFiles(gitContext);
		const nextState: AiWikiState = {
			...snapshot.state,
			lastIndexedSha: snapshot.headSha,
			lastKnownRemoteSha: snapshot.remoteSha,
			lastUpdatedAt: now,
		};
		await this.writeState(snapshot.projectId, nextState);
		await this.writeMarkdownFiles(snapshot.projectId, snapshot, nextState, trackedFiles, now);
		return { ...snapshot, state: nextState };
	}

	async getContextPacket(request: AiWikiProjectRequest): Promise<AiWikiContextPacket> {
		const snapshot = await this.getStatus(request);
		const wikiPath = this.resolveWikiPath(snapshot.projectId);
		const [summaryMd, changedFilesMd, indexMd] = await Promise.all([
			readOptionalTextFile(path.join(wikiPath, SUMMARY_FILE)),
			readOptionalTextFile(path.join(wikiPath, CHANGED_FILES_FILE)),
			readOptionalTextFile(path.join(wikiPath, INDEX_FILE)),
		]);

		return {
			projectId: snapshot.projectId,
			projectRoot: snapshot.state.projectRoot,
			sourceMode: snapshot.state.sourceMode,
			branch: snapshot.state.branch,
			lastIndexedSha: snapshot.state.lastIndexedSha,
			lastKnownRemoteSha: snapshot.state.lastKnownRemoteSha,
			changedFiles: snapshot.changedFiles,
			summary: compactMarkdownFiles([
				{ name: SUMMARY_FILE, content: summaryMd },
				{ name: CHANGED_FILES_FILE, content: changedFilesMd },
				{ name: INDEX_FILE, content: indexMd },
			]),
			generatedAt: new Date().toISOString(),
		};
	}

	private async resolveGitContext(request: AiWikiProjectRequest): Promise<GitCommandContext> {
		const sshRemote = request.sshRemoteId ? getSshRemoteById(request.sshRemoteId) : undefined;
		if (request.sshRemoteId && !sshRemote) {
			throw new Error(`SSH remote not found: ${request.sshRemoteId}`);
		}
		return { projectRoot: request.projectRoot, sshRemote };
	}

	private async writeMarkdownFiles(
		projectId: string,
		snapshot: AiWikiSourceSnapshot,
		state: AiWikiState,
		trackedFiles: string[],
		generatedAt: string
	): Promise<void> {
		const wikiPath = this.resolveWikiPath(projectId);
		await fs.mkdir(wikiPath, { recursive: true });

		const markdownFiles = new Map<string, string>([
			[INDEX_FILE, this.buildIndexMarkdown(projectId, snapshot.wikiPath, state, generatedAt)],
			[CHANGED_FILES_FILE, this.buildChangedFilesMarkdown(snapshot.changedFiles, generatedAt)],
			[SUMMARY_FILE, this.buildSummaryMarkdown(snapshot.changedFiles, trackedFiles, generatedAt)],
		]);

		await Promise.all(
			Array.from(markdownFiles.entries()).map(([filename, content]) =>
				fs.writeFile(path.join(wikiPath, filename), content, 'utf8')
			)
		);
	}

	private buildIndexMarkdown(
		projectId: string,
		wikiPath: string,
		state: AiWikiState,
		generatedAt: string
	): string {
		return [
			'# AI Wiki Index',
			'',
			`- Project ID: ${projectId}`,
			`- Source mode: ${state.sourceMode}`,
			`- Project root: ${state.projectRoot}`,
			`- SSH remote: ${state.sshRemoteId ?? 'None'}`,
			`- Branch: ${state.branch ?? 'Unknown'}`,
			`- Last indexed SHA: ${state.lastIndexedSha ?? 'Unknown'}`,
			`- Last known remote SHA: ${state.lastKnownRemoteSha ?? 'Unknown'}`,
			`- Generated at: ${generatedAt}`,
			`- Wiki path: ${wikiPath}`,
			'',
			'## Pages',
			'',
			'- [Changed Files](changed-files.md)',
			'- [Summary](summary.md)',
			'',
		].join('\n');
	}

	private buildChangedFilesMarkdown(
		changedFiles: AiWikiChangedFile[],
		generatedAt: string
	): string {
		const tracked = changedFiles
			.filter((file) => file.source === 'tracked')
			.map((file) => file.path);
		const uncommitted = changedFiles
			.filter((file) => file.source === 'uncommitted')
			.map((file) => file.path);

		return [
			'# Changed Files',
			'',
			`Generated at: ${generatedAt}`,
			'',
			`Total changed files: ${changedFiles.length}`,
			`Tracked changes: ${tracked.length}`,
			`Uncommitted changes: ${uncommitted.length}`,
			'',
			'## Tracked',
			'',
			markdownList(tracked).trimEnd(),
			'',
			'## Uncommitted',
			'',
			markdownList(uncommitted).trimEnd(),
			'',
		].join('\n');
	}

	private buildSummaryMarkdown(
		changedFiles: AiWikiChangedFile[],
		trackedFiles: string[],
		generatedAt: string
	): string {
		const changedPaths = changedFiles.map((file) => file.path);
		const summaryPaths = changedPaths.length > 0 ? changedPaths : trackedFiles;
		const sourceLabel = changedPaths.length > 0 ? 'changed files' : 'tracked files';

		return [
			'# Summary',
			'',
			`Generated at: ${generatedAt}`,
			'',
			`Summary source: ${sourceLabel}`,
			`Files summarized: ${summaryPaths.length}`,
			`Tracked repository files available: ${trackedFiles.length}`,
			'',
			'## By Extension',
			'',
			markdownCountTable(
				countAiWikiPathsByExtension(summaryPaths),
				'No files to summarize.'
			).trimEnd(),
			'',
			'## By Top Directory',
			'',
			markdownCountTable(
				countAiWikiPathsByTopDirectory(summaryPaths),
				'No files to summarize.'
			).trimEnd(),
			'',
		].join('\n');
	}

	private async readTrackedChanges(
		context: GitCommandContext,
		lastIndexedSha: string | null
	): Promise<string | null> {
		if (lastIndexedSha) {
			const result = await runGit(['diff', '--name-only', `${lastIndexedSha}..HEAD`], context);
			if (result.exitCode === 0) return result.stdout;
		}

		const result = await runGit(['ls-files'], context);
		if (result.exitCode !== 0) return null;
		return result.stdout;
	}

	private async readTrackedFiles(context: GitCommandContext): Promise<string[]> {
		const stdout = await readOptionalGitStdout(['ls-files'], context);
		return parseGitNameOnlyOutput(stdout ?? '').filter(
			(filePath) => !shouldIgnoreAiWikiSourcePath(filePath)
		);
	}
}
