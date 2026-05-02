/**
 * Pending GitHub Project field writes.
 *
 * This is a narrow write-ahead log for GithubProjectCoordinator mutations.
 * It intentionally does not replay at module initialization; startup code can
 * later call flushPendingWrites(coordinator) after the app is ready.
 */

import * as crypto from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { app } from 'electron';
import type { GithubProjectReference } from './github-project-coordinator';

const DEFAULT_PENDING_WRITES_FILE = 'github-project-pending-writes.json';

export interface GithubProjectPendingWrite {
	id: string;
	project: GithubProjectReference;
	itemId: string;
	fields: Record<string, string>;
	createdAt: string;
}

export interface GithubProjectPendingWriteInput {
	project: GithubProjectReference;
	itemId: string;
	fields: Record<string, string>;
}

export interface GithubProjectPendingWriteStoreOptions {
	filePath?: string;
	baseDir?: string;
	now?: () => number;
}

export interface GithubProjectFieldWriteOptions {
	skipPendingWrite?: boolean;
}

export interface GithubProjectPendingWriteCoordinator {
	setItemFieldValues(
		project: GithubProjectReference,
		itemId: string,
		fields: Record<string, string>,
		options?: GithubProjectFieldWriteOptions
	): Promise<void>;
}

export class GithubProjectPendingWriteStore {
	private readonly filePath: string | undefined;
	private readonly baseDir: string | undefined;
	private readonly now: () => number;
	private resolvedFilePath: string | undefined;
	private queue: Promise<void> = Promise.resolve();

	constructor(options: GithubProjectPendingWriteStoreOptions = {}) {
		this.filePath = options.filePath;
		this.baseDir = options.baseDir;
		this.now = options.now ?? Date.now;
	}

	async recordWrite(input: GithubProjectPendingWriteInput): Promise<GithubProjectPendingWrite> {
		return this.withLock(async () => {
			const records = await this.readRecordsUnlocked();
			const createdAt = new Date(this.now()).toISOString();
			const record: GithubProjectPendingWrite = {
				id: buildPendingWriteId(input.project, input.itemId, input.fields, createdAt),
				project: cloneProjectReference(input.project),
				itemId: input.itemId,
				fields: { ...input.fields },
				createdAt,
			};

			if (!records.some((candidate) => candidate.id === record.id)) {
				records.push(record);
				await this.writeRecordsUnlocked(records);
			}

			return record;
		});
	}

	async completeWrite(id: string): Promise<void> {
		await this.withLock(async () => {
			const records = await this.readRecordsUnlocked();
			const next = records.filter((record) => record.id !== id);
			if (next.length !== records.length) {
				await this.writeRecordsUnlocked(next);
			}
		});
	}

	async listPendingWrites(): Promise<GithubProjectPendingWrite[]> {
		return this.withLock(async () => {
			const records = await this.readRecordsUnlocked();
			return records.map(clonePendingWrite);
		});
	}

	private async withLock<T>(fn: () => Promise<T>): Promise<T> {
		const previous = this.queue;
		let release: () => void = () => undefined;
		this.queue = new Promise<void>((resolve) => {
			release = resolve;
		});

		await previous.catch(() => undefined);
		try {
			return await fn();
		} finally {
			release();
		}
	}

	private async readRecordsUnlocked(): Promise<GithubProjectPendingWrite[]> {
		const filePath = this.getFilePath();
		let raw: string;
		try {
			raw = await fs.readFile(filePath, 'utf8');
		} catch (err) {
			if (isMissingFileError(err)) return [];
			throw err;
		}

		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) {
			throw new Error(`Pending GitHub write log is not an array: ${filePath}`);
		}

		return parsed.map(parsePendingWrite);
	}

	private async writeRecordsUnlocked(records: GithubProjectPendingWrite[]): Promise<void> {
		const filePath = this.getFilePath();
		await fs.mkdir(path.dirname(filePath), { recursive: true });
		const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
		await fs.writeFile(tmpPath, `${JSON.stringify(records, null, 2)}\n`, 'utf8');
		await fs.rename(tmpPath, filePath);
	}

	private getFilePath(): string {
		if (this.resolvedFilePath) return this.resolvedFilePath;
		if (this.filePath) {
			this.resolvedFilePath = this.filePath;
			return this.resolvedFilePath;
		}

		const root = this.baseDir ?? getDefaultPendingWriteBaseDir();
		this.resolvedFilePath = path.join(root, 'agent-dispatch', DEFAULT_PENDING_WRITES_FILE);
		return this.resolvedFilePath;
	}
}

export async function flushPendingWrites(
	coordinator: GithubProjectPendingWriteCoordinator,
	store = new GithubProjectPendingWriteStore()
): Promise<GithubProjectPendingWrite[]> {
	const pending = await store.listPendingWrites();
	for (const record of pending) {
		await coordinator.setItemFieldValues(record.project, record.itemId, record.fields, {
			skipPendingWrite: true,
		});
		await store.completeWrite(record.id);
	}
	return pending;
}

function buildPendingWriteId(
	project: GithubProjectReference,
	itemId: string,
	fields: Record<string, string>,
	createdAt: string
): string {
	const stableInput = JSON.stringify({
		project: cloneProjectReference(project),
		itemId,
		fields: Object.fromEntries(Object.entries(fields).sort(([a], [b]) => a.localeCompare(b))),
		createdAt,
	});
	return crypto.createHash('sha256').update(stableInput).digest('hex').slice(0, 32);
}

function clonePendingWrite(record: GithubProjectPendingWrite): GithubProjectPendingWrite {
	return {
		id: record.id,
		project: cloneProjectReference(record.project),
		itemId: record.itemId,
		fields: { ...record.fields },
		createdAt: record.createdAt,
	};
}

function cloneProjectReference(project: GithubProjectReference): GithubProjectReference {
	return {
		projectOwner: project.projectOwner,
		projectNumber: project.projectNumber,
		...(project.projectPath ? { projectPath: project.projectPath } : {}),
	};
}

function parsePendingWrite(value: unknown): GithubProjectPendingWrite {
	if (!value || typeof value !== 'object') {
		throw new Error('Pending GitHub write record must be an object');
	}

	const candidate = value as Partial<GithubProjectPendingWrite>;
	if (
		typeof candidate.id !== 'string' ||
		!candidate.project ||
		typeof candidate.project.projectOwner !== 'string' ||
		typeof candidate.project.projectNumber !== 'number' ||
		(candidate.project.projectPath !== undefined &&
			typeof candidate.project.projectPath !== 'string') ||
		typeof candidate.itemId !== 'string' ||
		!candidate.fields ||
		typeof candidate.fields !== 'object' ||
		Array.isArray(candidate.fields) ||
		Object.values(candidate.fields).some((value) => typeof value !== 'string') ||
		typeof candidate.createdAt !== 'string'
	) {
		throw new Error('Pending GitHub write record has an invalid shape');
	}

	return clonePendingWrite(candidate as GithubProjectPendingWrite);
}

function getDefaultPendingWriteBaseDir(): string {
	try {
		return app.getPath('userData');
	} catch {
		return process.cwd();
	}
}

function isMissingFileError(err: unknown): boolean {
	return (
		!!err &&
		typeof err === 'object' &&
		'code' in err &&
		(err as { code?: string }).code === 'ENOENT'
	);
}
