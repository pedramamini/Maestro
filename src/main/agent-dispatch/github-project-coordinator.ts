/**
 * GitHub Project Coordinator
 *
 * Intent-level service for Agent Dispatch GitHub Projects v2 reads/writes.
 * This wraps GithubClient so dispatch callers do not repeat raw field queries,
 * project-id resolution, cache handling, and claim writes.
 */

import { logger } from '../utils/logger';
import {
	getGithubClientForProject,
	type GithubClient,
	type GithubProjectItem,
} from './github-client';
import {
	GithubProjectPendingWriteStore,
	type GithubProjectFieldWriteOptions,
	type GithubProjectPendingWrite,
} from './github-pending-writes';

const LOG_CONTEXT = '[GithubProjectCoordinator]';
const DEFAULT_BOARD_TTL_MS = 30_000;
const AI_STATUS_FIELD = 'AI Status';
const AI_ASSIGNED_SLOT_FIELD = 'AI Assigned Slot';
const STATUS_TASKS_READY = 'Tasks Ready';
const STATUS_IN_PROGRESS = 'In Progress';

export interface GithubProjectReference {
	projectOwner: string;
	projectNumber: number;
	/** Optional stable local key. Falls back to owner:number. */
	projectPath?: string;
}

export interface GithubProjectBoardSnapshot {
	project: GithubProjectReference;
	items: GithubProjectItem[];
	fetchedAt: number;
	stale: boolean;
}

export interface GithubProjectClaimResult {
	projectId: string;
	item: GithubProjectItem;
	claimedAt: string;
}

export interface GithubProjectCoordinatorOptions {
	ttlMs?: number;
	rateLimitLow?: number;
	clientFactory?: (project: GithubProjectReference) => GithubClient;
	pendingWriteStore?: GithubProjectPendingWriteStore;
	now?: () => number;
}

interface CachedBoard {
	project: GithubProjectReference;
	items: GithubProjectItem[];
	fetchedAt: number;
}

export class GithubProjectCoordinator {
	private readonly ttlMs: number;
	private readonly rateLimitLow: number | undefined;
	private readonly clientFactory: (project: GithubProjectReference) => GithubClient;
	private readonly pendingWriteStore: GithubProjectPendingWriteStore;
	private readonly now: () => number;
	private readonly boardCache = new Map<string, CachedBoard>();
	private readonly boardReads = new Map<string, Promise<GithubProjectBoardSnapshot>>();
	private readonly projectIds = new Map<string, Promise<string>>();
	private readonly writeLocks = new Map<string, Promise<void>>();

	constructor(options: GithubProjectCoordinatorOptions = {}) {
		this.ttlMs = options.ttlMs ?? DEFAULT_BOARD_TTL_MS;
		this.rateLimitLow = options.rateLimitLow;
		this.clientFactory =
			options.clientFactory ??
			((project) =>
				getGithubClientForProject({
					projectOwner: project.projectOwner,
					projectNumber: project.projectNumber,
					ttlMs: this.ttlMs,
					rateLimitLow: this.rateLimitLow,
				}));
		this.pendingWriteStore = options.pendingWriteStore ?? new GithubProjectPendingWriteStore();
		this.now = options.now ?? Date.now;
	}

	async getBoardSnapshot(
		project: GithubProjectReference,
		options: { forceRefresh?: boolean } = {}
	): Promise<GithubProjectBoardSnapshot> {
		const cacheKey = this.getProjectCacheKey(project);
		const cached = this.boardCache.get(cacheKey);
		const now = this.now();
		if (!options.forceRefresh && cached && now - cached.fetchedAt <= this.ttlMs) {
			return this.toSnapshot(cached, false);
		}

		const existingRead = this.boardReads.get(cacheKey);
		if (existingRead) return existingRead;

		const read = this.readBoard(project, cacheKey, cached);
		this.boardReads.set(cacheKey, read);
		try {
			return await read;
		} finally {
			this.boardReads.delete(cacheKey);
		}
	}

	async getReadyItems(project: GithubProjectReference): Promise<GithubProjectItem[]> {
		const snapshot = await this.getBoardSnapshot(project);
		return snapshot.items.filter((item) => {
			return (
				item.fields[AI_STATUS_FIELD] === STATUS_TASKS_READY &&
				(item.fields[AI_ASSIGNED_SLOT_FIELD] ?? '') === ''
			);
		});
	}

	async getInFlightItems(
		project: GithubProjectReference,
		agentId?: string
	): Promise<GithubProjectItem[]> {
		const snapshot = await this.getBoardSnapshot(project);
		return snapshot.items.filter((item) => {
			if (item.fields[AI_STATUS_FIELD] !== STATUS_IN_PROGRESS) return false;
			if (!agentId) return true;
			return item.fields[AI_ASSIGNED_SLOT_FIELD] === agentId;
		});
	}

	async claimItem(
		project: GithubProjectReference,
		itemId: string,
		agentId: string
	): Promise<GithubProjectClaimResult> {
		const snapshot = await this.getBoardSnapshot(project);
		const item = snapshot.items.find((candidate) => candidate.id === itemId);
		if (!item) {
			throw new Error(`GitHub project item "${itemId}" was not found`);
		}

		await this.setItemFieldValues(project, itemId, {
			[AI_ASSIGNED_SLOT_FIELD]: agentId,
			[AI_STATUS_FIELD]: STATUS_IN_PROGRESS,
		});
		const projectId = await this.getProjectId(project);

		const claimedAt = new Date(this.now()).toISOString();

		return {
			projectId,
			item: {
				...item,
				fields: {
					...item.fields,
					[AI_ASSIGNED_SLOT_FIELD]: agentId,
					[AI_STATUS_FIELD]: STATUS_IN_PROGRESS,
				},
			},
			claimedAt,
		};
	}

	async releaseItem(
		project: GithubProjectReference,
		itemId: string,
		status = STATUS_TASKS_READY
	): Promise<void> {
		await this.setItemFieldValues(project, itemId, {
			[AI_ASSIGNED_SLOT_FIELD]: '',
			[AI_STATUS_FIELD]: status,
		});
	}

	async setItemFieldValue(
		project: GithubProjectReference,
		itemId: string,
		fieldName: string,
		value: string
	): Promise<void> {
		await this.setItemFieldValues(project, itemId, { [fieldName]: value });
	}

	async setItemFieldValues(
		project: GithubProjectReference,
		itemId: string,
		fields: Record<string, string>,
		options: GithubProjectFieldWriteOptions = {}
	): Promise<void> {
		const entries = Object.entries(fields);
		if (entries.length === 0) return;

		const cacheKey = this.getProjectCacheKey(project);
		const writeKey = `${cacheKey}:${itemId}`;
		const previous = this.writeLocks.get(writeKey) ?? Promise.resolve();
		const write = previous
			.catch(() => undefined)
			.then(async () => {
				let pendingWrite: GithubProjectPendingWrite | undefined;
				if (!options.skipPendingWrite) {
					pendingWrite = await this.pendingWriteStore.recordWrite({
						project,
						itemId,
						fields,
					});
				}

				const client = this.clientFactory(project);
				const projectId = await this.getProjectId(project);
				for (const [fieldName, value] of entries) {
					await client.setItemFieldValue(projectId, itemId, fieldName, value);
				}
				if (pendingWrite) {
					await this.pendingWriteStore.completeWrite(pendingWrite.id);
				}
				this.patchCachedItem(cacheKey, itemId, fields);
			});

		this.writeLocks.set(writeKey, write);
		try {
			await write;
		} finally {
			if (this.writeLocks.get(writeKey) === write) {
				this.writeLocks.delete(writeKey);
			}
		}
	}

	async addItemComment(
		project: GithubProjectReference,
		issueNumber: number,
		repo: string,
		body: string
	): Promise<void> {
		await this.clientFactory(project).addItemComment(issueNumber, repo, body);
	}

	clearProjectCache(project: GithubProjectReference): void {
		const cacheKey = this.getProjectCacheKey(project);
		this.boardCache.delete(cacheKey);
		this.boardReads.delete(cacheKey);
	}

	private async readBoard(
		project: GithubProjectReference,
		cacheKey: string,
		cached: CachedBoard | undefined
	): Promise<GithubProjectBoardSnapshot> {
		try {
			const items = await this.clientFactory(project).listProjectItems();
			const next: CachedBoard = {
				project,
				items,
				fetchedAt: this.now(),
			};
			this.boardCache.set(cacheKey, next);
			return this.toSnapshot(next, false);
		} catch (err) {
			if (cached && isGithubGraphqlRateLimitError(err)) {
				logger.warn(
					`GitHub project read for ${cacheKey} was rate-limited; using stale board cache`,
					LOG_CONTEXT
				);
				return this.toSnapshot(cached, true);
			}
			throw err;
		}
	}

	private getProjectId(project: GithubProjectReference): Promise<string> {
		const cacheKey = this.getProjectCacheKey(project);
		let projectId = this.projectIds.get(cacheKey);
		if (!projectId) {
			projectId = this.clientFactory(project).readProjectId();
			void projectId.catch(() => {
				if (this.projectIds.get(cacheKey) === projectId) {
					this.projectIds.delete(cacheKey);
				}
			});
			this.projectIds.set(cacheKey, projectId);
		}
		return projectId;
	}

	private patchCachedItem(cacheKey: string, itemId: string, fields: Record<string, string>): void {
		const cached = this.boardCache.get(cacheKey);
		if (!cached) return;

		this.boardCache.set(cacheKey, {
			...cached,
			items: cached.items.map((item) => {
				if (item.id !== itemId) return item;
				return {
					...item,
					fields: {
						...item.fields,
						...fields,
					},
				};
			}),
			fetchedAt: this.now(),
		});
	}

	private toSnapshot(cached: CachedBoard, stale: boolean): GithubProjectBoardSnapshot {
		return {
			project: cached.project,
			items: cached.items.map((item) => ({
				...item,
				fields: { ...item.fields },
			})),
			fetchedAt: cached.fetchedAt,
			stale,
		};
	}

	private getProjectCacheKey(project: GithubProjectReference): string {
		const coords = `${project.projectOwner}:${project.projectNumber}`;
		return project.projectPath ? `${project.projectPath}:${coords}` : coords;
	}
}

function isGithubGraphqlRateLimitError(err: unknown): boolean {
	const message = err instanceof Error ? err.message : String(err);
	return (
		/rate-?limited/i.test(message) ||
		/rate limit (already )?exceeded/i.test(message) ||
		/api rate limit/i.test(message) ||
		/secondary rate limit/i.test(message)
	);
}

let _coordinator: GithubProjectCoordinator | undefined;

export function getGithubProjectCoordinator(): GithubProjectCoordinator {
	if (!_coordinator) {
		_coordinator = new GithubProjectCoordinator();
	}
	return _coordinator;
}
