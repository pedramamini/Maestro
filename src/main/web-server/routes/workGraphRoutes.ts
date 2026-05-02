/**
 * Work Graph Web Routes
 *
 * Local-first Work Graph access for agent-callable CLI commands.
 *
 * Route map:
 *   GET   /$TOKEN/api/work-graph/items      -> list Work Graph items
 *   POST  /$TOKEN/api/work-graph/items      -> create a Work Graph item
 *   GET   /$TOKEN/api/work-graph/items/:id  -> get a Work Graph item
 *   PATCH /$TOKEN/api/work-graph/items/:id  -> update a Work Graph item
 */

import { FastifyInstance, FastifyReply } from 'fastify';
import { getWorkGraphItemStore } from '../../work-graph';
import { logger } from '../../utils/logger';
import type { RateLimitConfig } from '../types';
import type {
	WorkGraphListResult,
	WorkItem,
	WorkItemCreateInput,
	WorkItemFilters,
	WorkItemSource,
	WorkItemStatus,
	WorkItemType,
	WorkItemUpdateInput,
} from '../../../shared/work-graph-types';

const LOG_CONTEXT = 'WebServer:WorkGraph';

interface WorkGraphListQuery {
	projectPath?: string;
	gitPath?: string;
	status?: string | string[];
	type?: string | string[];
	tag?: string | string[];
	source?: string | string[];
	limit?: string;
	cursor?: string;
}

type WorkGraphCreateBody = Partial<WorkItemCreateInput>;

interface WorkGraphUpdateBody {
	patch?: WorkItemUpdateInput['patch'];
	actor?: WorkItemUpdateInput['actor'];
	expectedUpdatedAt?: string;
	expectedVersion?: number;
}

export function registerWorkGraphRoutes(
	server: FastifyInstance,
	token: string,
	rateLimitConfig: RateLimitConfig
): void {
	const workGraph = getWorkGraphItemStore();

	const handleRouteError = (reply: FastifyReply, operation: string, err: unknown) => {
		logger.error(`${operation} error`, LOG_CONTEXT, { error: String(err) });
		return reply.code(500).send({
			success: false,
			error: err instanceof Error ? err.message : String(err),
			timestamp: Date.now(),
		});
	};

	server.get(
		`/${token}/api/work-graph/items`,
		{
			config: {
				rateLimit: {
					max: rateLimitConfig.max,
					timeWindow: rateLimitConfig.timeWindow,
				},
			},
		},
		async (request, reply) => {
			try {
				const filters = parseListQuery((request.query as WorkGraphListQuery | undefined) ?? {});
				const data = await workGraph.listItems(filters);
				return { success: true, data, timestamp: Date.now() };
			} catch (err) {
				return handleRouteError(reply, 'GET items', err);
			}
		}
	);

	server.post(
		`/${token}/api/work-graph/items`,
		{
			config: {
				rateLimit: {
					max: rateLimitConfig.maxPost,
					timeWindow: rateLimitConfig.timeWindow,
				},
			},
		},
		async (request, reply) => {
			const input = request.body as WorkGraphCreateBody | undefined;
			if (!input?.title || !input.projectPath || !input.gitPath || !input.type || !input.source) {
				return reply.code(400).send({
					success: false,
					error: 'Request body must include title, type, source, projectPath, and gitPath',
					timestamp: Date.now(),
				});
			}

			try {
				const data = await workGraph.createItem(input as WorkItemCreateInput, {
					type: 'user',
					id: 'cli',
					name: 'CLI',
				});
				return { success: true, data, timestamp: Date.now() };
			} catch (err) {
				return handleRouteError(reply, 'POST items', err);
			}
		}
	);

	server.get(
		`/${token}/api/work-graph/items/:id`,
		{
			config: {
				rateLimit: {
					max: rateLimitConfig.max,
					timeWindow: rateLimitConfig.timeWindow,
				},
			},
		},
		async (request, reply) => {
			const { id } = request.params as { id?: string };
			if (!id) {
				return reply.code(400).send({
					success: false,
					error: 'Item id is required',
					timestamp: Date.now(),
				});
			}

			try {
				const data = await workGraph.getItem(id);
				if (!data) {
					return reply.code(404).send({
						success: false,
						error: `Unknown Work Graph item: ${id}`,
						timestamp: Date.now(),
					});
				}
				return { success: true, data, timestamp: Date.now() };
			} catch (err) {
				return handleRouteError(reply, 'GET item', err);
			}
		}
	);

	server.patch(
		`/${token}/api/work-graph/items/:id`,
		{
			config: {
				rateLimit: {
					max: rateLimitConfig.maxPost,
					timeWindow: rateLimitConfig.timeWindow,
				},
			},
		},
		async (request, reply) => {
			const { id } = request.params as { id?: string };
			const input = request.body as WorkGraphUpdateBody | undefined;
			if (!id) {
				return reply.code(400).send({
					success: false,
					error: 'Item id is required',
					timestamp: Date.now(),
				});
			}
			if (!input?.patch || Object.keys(input.patch).length === 0) {
				return reply.code(400).send({
					success: false,
					error: 'Request body must include a non-empty patch',
					timestamp: Date.now(),
				});
			}

			try {
				const data = await workGraph.updateItem(
					{
						id,
						patch: input.patch,
						actor: input.actor ?? { type: 'user', id: 'cli', name: 'CLI' },
						expectedUpdatedAt: input.expectedUpdatedAt,
					},
					input.expectedVersion === undefined
						? undefined
						: { expectedVersion: input.expectedVersion }
				);
				return { success: true, data, timestamp: Date.now() };
			} catch (err) {
				return handleRouteError(reply, 'PATCH item', err);
			}
		}
	);
}

function parseListQuery(query: WorkGraphListQuery): WorkItemFilters {
	const filters: WorkItemFilters = {};
	if (query.projectPath) filters.projectPath = query.projectPath;
	if (query.gitPath) filters.gitPath = query.gitPath;
	const statuses = parseCsvList(query.status) as WorkItemStatus[];
	if (statuses.length > 0) filters.statuses = statuses;
	const types = parseCsvList(query.type) as WorkItemType[];
	if (types.length > 0) filters.types = types;
	const tags = parseCsvList(query.tag);
	if (tags.length > 0) filters.tags = tags;
	const sources = parseCsvList(query.source) as WorkItemSource[];
	if (sources.length === 1) filters.source = sources[0];
	if (sources.length > 1) filters.source = sources;
	const limit = query.limit ? Number.parseInt(query.limit, 10) : undefined;
	if (limit && limit > 0) filters.limit = limit;
	if (query.cursor) filters.cursor = query.cursor;
	return filters;
}

function parseCsvList(value: string | string[] | undefined): string[] {
	const raw = Array.isArray(value) ? value : value ? [value] : [];
	return raw
		.flatMap((entry) => entry.split(','))
		.map((entry) => entry.trim())
		.filter(Boolean);
}

export type {
	WorkGraphCreateBody,
	WorkGraphListQuery,
	WorkGraphUpdateBody,
	WorkGraphListResult,
	WorkItem,
};
