// AI Wiki commands.
//
// These commands communicate with the running Maestro app over the local HTTP API.
//
// Sub-command tree:
//   maestro-cli ai-wiki status --project <path> [--ssh-remote <id>] [--project-id <id>] [--json]
//   maestro-cli ai-wiki refresh --project <path> [--ssh-remote <id>] [--project-id <id>] [--json]
//   maestro-cli ai-wiki context --project <path> [--ssh-remote <id>] [--project-id <id>] [--json]

import path from 'path';
import { readCliServerInfo, isCliServerRunning } from '../../shared/cli-server-discovery';
import type {
	AiWikiContextPacket,
	AiWikiProjectRequest,
	AiWikiSourceSnapshot,
} from '../../shared/ai-wiki-types';

interface AiWikiApiError {
	success: false;
	code?: string;
	error?: string;
}

interface AiWikiApiOk<T> {
	success: true;
	data: T;
	timestamp?: number;
}

type AiWikiApiResult<T> = AiWikiApiOk<T> | AiWikiApiError;

export interface AiWikiCommandOptions {
	project?: string;
	sshRemote?: string;
	projectId?: string;
	json?: boolean;
}

export function getAiWikiBaseUrl(): string {
	const envBaseUrl = process.env.MAESTRO_CLI_BASE_URL?.trim();
	if (envBaseUrl) {
		return `${envBaseUrl.replace(/\/+$/, '')}/api/ai-wiki`;
	}

	const info = readCliServerInfo();
	if (!info) {
		throw new Error(
			'Maestro desktop app is not running. For remote/SSH agents, set MAESTRO_CLI_BASE_URL to the running Maestro web URL including its security token.'
		);
	}
	if (!isCliServerRunning()) {
		throw new Error('Maestro discovery file is stale (app may have crashed)');
	}
	return `http://127.0.0.1:${info.port}/${info.token}/api/ai-wiki`;
}

export function buildAiWikiProjectRequest(options: AiWikiCommandOptions): AiWikiProjectRequest {
	if (!options.project?.trim()) {
		throw new Error('--project is required');
	}

	return {
		projectRoot: path.resolve(options.project),
		...(options.projectId?.trim() ? { projectId: options.projectId.trim() } : {}),
		...(options.sshRemote?.trim() ? { sshRemoteId: options.sshRemote.trim() } : {}),
	};
}

export async function aiWikiStatus(options: AiWikiCommandOptions): Promise<void> {
	await runAiWikiSnapshotCommand('status', options);
}

export async function aiWikiRefresh(options: AiWikiCommandOptions): Promise<void> {
	await runAiWikiSnapshotCommand('refresh', options);
}

export async function aiWikiContext(options: AiWikiCommandOptions): Promise<void> {
	const request = buildRequestOrExit(options);
	const result = await fetchOrExit<AiWikiContextPacket>('context', request, options.json);

	if (options.json) {
		console.log(JSON.stringify(result, null, 2));
		return;
	}

	console.log(`AI Wiki context: ${result.projectId}`);
	console.log(`  Project: ${result.projectRoot}`);
	console.log(`  Source:  ${result.sourceMode}`);
	console.log(`  Branch:  ${result.branch ?? 'Unknown'}`);
	console.log(`  Indexed: ${result.lastIndexedSha ?? 'Unknown'}`);
	console.log(`  Changed files: ${result.changedFiles.length}`);
	console.log('');
	console.log(result.summary);
}

async function runAiWikiSnapshotCommand(
	operation: 'status' | 'refresh',
	options: AiWikiCommandOptions
): Promise<void> {
	const request = buildRequestOrExit(options);
	const result = await fetchOrExit<AiWikiSourceSnapshot>(operation, request, options.json);

	if (options.json) {
		console.log(JSON.stringify(result, null, 2));
		return;
	}

	console.log(`AI Wiki ${operation}: ${result.projectId}`);
	console.log(`  Wiki path: ${result.wikiPath}`);
	console.log(`  Project:   ${result.state.projectRoot}`);
	console.log(`  Source:    ${result.state.sourceMode}`);
	console.log(`  Branch:    ${result.state.branch ?? 'Unknown'}`);
	console.log(`  Head:      ${result.headSha ?? 'Unknown'}`);
	console.log(`  Indexed:   ${result.state.lastIndexedSha ?? 'Unknown'}`);
	console.log(`  Changed files: ${result.changedFiles.length}`);
}

function buildRequestOrExit(options: AiWikiCommandOptions): AiWikiProjectRequest {
	try {
		return buildAiWikiProjectRequest(options);
	} catch (err) {
		exitWithError(err instanceof Error ? err.message : String(err), options.json);
	}
}

async function fetchOrExit<T>(
	operation: 'status' | 'refresh' | 'context',
	body: AiWikiProjectRequest,
	json?: boolean
): Promise<T> {
	let result: AiWikiApiResult<T>;
	try {
		result = await aiWikiFetch<T>(operation, {
			method: 'POST',
			body: JSON.stringify(body),
		});
	} catch (err) {
		exitWithError(err instanceof Error ? err.message : String(err), json);
	}

	if (!result.success) {
		exitWithError(result.error ?? `Failed to run AI Wiki ${operation}`, json, {
			code: result.code,
		});
	}

	return result.data;
}

async function aiWikiFetch<T>(
	pathName: 'status' | 'refresh' | 'context',
	options: RequestInit
): Promise<AiWikiApiResult<T>> {
	const url = `${getAiWikiBaseUrl()}/${pathName}`;

	let res: Response;
	try {
		res = await fetch(url, {
			headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
			...options,
		});
	} catch (err) {
		throw new Error(`Could not reach Maestro: ${err instanceof Error ? err.message : String(err)}`);
	}

	return (await res.json()) as AiWikiApiResult<T>;
}

function exitWithError(message: string, json?: boolean, extra?: Record<string, unknown>): never {
	if (json) {
		console.log(JSON.stringify({ success: false, error: message, ...extra }, null, 2));
	} else {
		console.error(`Error: ${message}`);
	}
	process.exit(1);
}
