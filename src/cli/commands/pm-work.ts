// Local PM Work Graph commands.
//
// These commands communicate with the running Maestro app over the local HTTP API.
//
// Sub-command tree:
//   maestro-cli pm work list [--project <path>] [--json]
//   maestro-cli pm work create --title <title> [--project <path>] [--file <path>...] [--json]
//   maestro-cli pm work update <id> [--status <status>] [--file <path>...] [--json]

import path from 'path';
import { readCliServerInfo, isCliServerRunning } from '../../shared/cli-server-discovery';
import type {
	WorkGraphListResult,
	WorkItem,
	WorkItemCreateInput,
	WorkItemPatch,
	WorkItemSource,
	WorkItemStatus,
	WorkItemType,
	WorkItemUpdateInput,
} from '../../shared/work-graph-types';

interface PmWorkApiError {
	success: false;
	code?: string;
	error?: string;
}

interface PmWorkApiOk<T> {
	success: true;
	data: T;
	timestamp?: number;
}

type PmWorkApiResult<T> = PmWorkApiOk<T> | PmWorkApiError;

export interface PmWorkListOptions {
	project?: string;
	gitPath?: string;
	status?: string[];
	type?: string[];
	tag?: string[];
	source?: string[];
	limit?: string;
	json?: boolean;
}

export interface PmWorkCreateOptions {
	title: string;
	project?: string;
	gitPath?: string;
	type?: WorkItemType;
	status?: WorkItemStatus;
	source?: WorkItemSource;
	description?: string;
	tag?: string[];
	file?: string[];
	metadata?: string[];
	parent?: string;
	priority?: string;
	json?: boolean;
}

export interface PmWorkUpdateOptions {
	title?: string;
	description?: string;
	status?: WorkItemStatus;
	type?: WorkItemType;
	tag?: string[];
	file?: string[];
	metadata?: string[];
	parent?: string;
	priority?: string;
	expectedVersion?: string;
	json?: boolean;
}

function getBaseUrl(): string {
	const envBaseUrl = process.env.MAESTRO_CLI_BASE_URL?.trim();
	if (envBaseUrl) {
		return `${envBaseUrl.replace(/\/+$/, '')}/api/work-graph`;
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
	return `http://127.0.0.1:${info.port}/${info.token}/api/work-graph`;
}

async function pmWorkFetch<T>(
	pathName: string,
	options?: RequestInit
): Promise<PmWorkApiResult<T>> {
	const url = `${getBaseUrl()}${pathName}`;

	let res: Response;
	try {
		res = await fetch(url, {
			headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
			...options,
		});
	} catch (err) {
		throw new Error(`Could not reach Maestro: ${err instanceof Error ? err.message : String(err)}`);
	}

	return (await res.json()) as PmWorkApiResult<T>;
}

export async function pmWorkList(options: PmWorkListOptions): Promise<void> {
	const params = new URLSearchParams();
	if (options.project) params.set('projectPath', path.resolve(options.project));
	if (options.gitPath) params.set('gitPath', path.resolve(options.gitPath));
	appendRepeated(params, 'status', options.status);
	appendRepeated(params, 'type', options.type);
	appendRepeated(params, 'tag', options.tag);
	appendRepeated(params, 'source', options.source);
	if (options.limit) params.set('limit', options.limit);
	const qs = params.toString() ? `?${params.toString()}` : '';

	let result: PmWorkApiResult<WorkGraphListResult>;
	try {
		result = await pmWorkFetch<WorkGraphListResult>(`/items${qs}`);
	} catch (err) {
		exitWithError(err instanceof Error ? err.message : String(err), options.json);
	}

	if (!result.success) {
		exitWithError(result.error ?? 'Unknown error from Maestro', options.json, {
			code: result.code,
		});
	}

	const data = result.data;
	if (options.json) {
		console.log(JSON.stringify(data, null, 2));
		return;
	}

	console.log('\nMaestro Board Work Items\n');
	renderItems(data.items ?? []);
}

export async function pmWorkCreate(options: PmWorkCreateOptions): Promise<void> {
	if (!options.title) {
		exitWithError('--title is required', options.json);
	}

	const projectPath = path.resolve(options.project ?? process.cwd());
	const gitPath = path.resolve(options.gitPath ?? projectPath);
	let metadata: Record<string, unknown>;
	let priority: number | undefined;
	try {
		metadata = buildMetadata(options.metadata, options.file, projectPath);
		priority = parseOptionalInt(options.priority, '--priority', options.json);
	} catch (err) {
		exitWithError(err instanceof Error ? err.message : String(err), options.json);
	}

	const body: WorkItemCreateInput = {
		title: options.title,
		type: options.type ?? 'task',
		source: options.source ?? 'manual',
		projectPath,
		gitPath,
		readonly: false,
		...(options.status ? { status: options.status } : {}),
		...(options.description ? { description: options.description } : {}),
		...(options.tag ? { tags: normalizeRepeatable(options.tag) } : {}),
		...(options.parent ? { parentWorkItemId: options.parent } : {}),
		...(priority === undefined ? {} : { priority }),
		...(Object.keys(metadata).length === 0 ? {} : { metadata }),
	};

	let result: PmWorkApiResult<WorkItem>;
	try {
		result = await pmWorkFetch<WorkItem>('/items', {
			method: 'POST',
			body: JSON.stringify(body),
		});
	} catch (err) {
		exitWithError(err instanceof Error ? err.message : String(err), options.json);
	}

	if (!result.success) {
		exitWithError(result.error ?? 'Failed to create Work Graph item', options.json, {
			code: result.code,
		});
	}

	if (options.json) {
		console.log(JSON.stringify(result.data, null, 2));
		return;
	}

	console.log(`Work item created: ${result.data.id}`);
	console.log(`  Title:  ${result.data.title}`);
	console.log(`  Type:   ${result.data.type}`);
	console.log(`  Status: ${result.data.status}`);
}

export async function pmWorkUpdate(id: string, options: PmWorkUpdateOptions): Promise<void> {
	if (!id) {
		exitWithError('Work item ID is required', options.json);
	}

	let priority: number | undefined;
	let metadataPatch: Record<string, unknown>;
	try {
		priority = parseOptionalInt(options.priority, '--priority', options.json);
		metadataPatch = buildMetadata(options.metadata, options.file);
	} catch (err) {
		exitWithError(err instanceof Error ? err.message : String(err), options.json);
	}
	const patch: WorkItemPatch = {};
	if (options.title) patch.title = options.title;
	if (options.description !== undefined) patch.description = options.description;
	if (options.status) patch.status = options.status;
	if (options.type) patch.type = options.type;
	if (options.tag) patch.tags = normalizeRepeatable(options.tag);
	if (options.parent !== undefined) patch.parentWorkItemId = options.parent || undefined;
	if (priority !== undefined) patch.priority = priority;

	if (Object.keys(metadataPatch).length > 0) {
		const current = await getWorkItem(id, options.json);
		patch.metadata = { ...(current.metadata ?? {}), ...metadataPatch };
	}

	if (Object.keys(patch).length === 0) {
		exitWithError('No update fields provided', options.json);
	}

	const expectedVersion = parseOptionalInt(
		options.expectedVersion,
		'--expected-version',
		options.json
	);
	const body: {
		patch: WorkItemUpdateInput['patch'];
		actor: WorkItemUpdateInput['actor'];
		expectedVersion?: number;
	} = {
		patch,
		actor: { type: 'user', id: 'cli', name: 'CLI' },
		...(expectedVersion === undefined ? {} : { expectedVersion }),
	};

	let result: PmWorkApiResult<WorkItem>;
	try {
		result = await pmWorkFetch<WorkItem>(`/items/${encodeURIComponent(id)}`, {
			method: 'PATCH',
			body: JSON.stringify(body),
		});
	} catch (err) {
		exitWithError(err instanceof Error ? err.message : String(err), options.json);
	}

	if (!result.success) {
		exitWithError(result.error ?? 'Failed to update Work Graph item', options.json, {
			code: result.code,
		});
	}

	if (options.json) {
		console.log(JSON.stringify(result.data, null, 2));
		return;
	}

	console.log(`Work item updated: ${result.data.id}`);
	console.log(`  Title:  ${result.data.title}`);
	console.log(`  Type:   ${result.data.type}`);
	console.log(`  Status: ${result.data.status}`);
	console.log(`  Version: ${result.data.version}`);
}

async function getWorkItem(id: string, json?: boolean): Promise<WorkItem> {
	let result: PmWorkApiResult<WorkItem>;
	try {
		result = await pmWorkFetch<WorkItem>(`/items/${encodeURIComponent(id)}`);
	} catch (err) {
		exitWithError(err instanceof Error ? err.message : String(err), json);
	}
	if (!result.success) {
		exitWithError(result.error ?? 'Failed to load Work Graph item', json, { code: result.code });
	}
	return result.data;
}

function renderItems(items: WorkItem[]): void {
	if (items.length === 0) {
		console.log('No work items found.');
		return;
	}

	const idWidth = 12;
	const typeWidth = 10;
	const statusWidth = 12;
	const titleWidth = 56;
	const header = [
		'ID'.padEnd(idWidth),
		'TYPE'.padEnd(typeWidth),
		'STATUS'.padEnd(statusWidth),
		'TITLE',
	].join('  ');
	console.log(header);
	console.log('-'.repeat(idWidth + typeWidth + statusWidth + titleWidth + 6));

	for (const item of items) {
		const shortId = item.id.slice(0, idWidth - 1).padEnd(idWidth);
		const type = item.type.padEnd(typeWidth);
		const status = item.status.padEnd(statusWidth);
		const title = item.title.slice(0, titleWidth);
		console.log(`${shortId}  ${type}  ${status}  ${title}`);
	}

	console.log(`\n${items.length} item${items.length === 1 ? '' : 's'}`);
}

function buildMetadata(
	metadataEntries: string[] | undefined,
	files: string[] | undefined,
	projectPath?: string
): Record<string, unknown> {
	const metadata: Record<string, unknown> = {};
	for (const entry of metadataEntries ?? []) {
		const index = entry.indexOf('=');
		if (index <= 0) {
			throw new Error(`Invalid --metadata entry "${entry}". Use key=value.`);
		}
		const key = entry.slice(0, index).trim();
		const value = entry.slice(index + 1);
		metadata[key] = parseMetadataValue(value);
	}

	const normalizedFiles = normalizeRepeatable(files).map((filePath) => {
		const absolute = path.resolve(filePath);
		return projectPath ? path.relative(projectPath, absolute) || path.basename(absolute) : absolute;
	});
	if (normalizedFiles.length > 0) {
		metadata.files = normalizedFiles;
	}

	return metadata;
}

function parseMetadataValue(value: string): unknown {
	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
}

function appendRepeated(params: URLSearchParams, key: string, values: string[] | undefined): void {
	for (const value of normalizeRepeatable(values)) {
		params.append(key, value);
	}
}

function normalizeRepeatable(values: string[] | undefined): string[] {
	return (values ?? [])
		.flatMap((value) => value.split(','))
		.map((value) => value.trim())
		.filter(Boolean);
}

function parseOptionalInt(
	value: string | undefined,
	label: string,
	json: boolean | undefined
): number | undefined {
	if (value === undefined) return undefined;
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed)) {
		exitWithError(`${label} must be an integer`, json);
	}
	return parsed;
}

function exitWithError(message: string, json?: boolean, extra?: Record<string, unknown>): never {
	if (json) {
		console.log(JSON.stringify({ success: false, error: message, ...extra }, null, 2));
	} else {
		console.error(`Error: ${message}`);
	}
	process.exit(1);
}
