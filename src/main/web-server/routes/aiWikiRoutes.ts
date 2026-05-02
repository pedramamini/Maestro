/**
 * AI Wiki Web Routes
 *
 * Token-protected local API for kicking the Maestro-managed project wiki writer.
 * The wiki is stored under Electron userData/project-wikis and is never written
 * into the source repository by these routes.
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import type { RateLimitConfig } from '../types';
import type { AiWikiProjectRequest } from '../../../shared/ai-wiki-types';
import { AiWikiService } from '../../ai-wiki/service';
import { logger } from '../../utils/logger';

const LOG_CONTEXT = 'WebServer:AiWiki';

export interface AiWikiRouteDependencies {
	userDataPath: string;
}

export function registerAiWikiRoutes(
	server: FastifyInstance,
	token: string,
	rateLimitConfig: RateLimitConfig,
	deps: AiWikiRouteDependencies
): void {
	const service = new AiWikiService({ userDataPath: deps.userDataPath });

	const handleRouteError = (reply: FastifyReply, operation: string, err: unknown) => {
		logger.error(`${operation} error`, LOG_CONTEXT, { error: String(err) });
		return reply.code(500).send({
			success: false,
			error: err instanceof Error ? err.message : String(err),
			timestamp: Date.now(),
		});
	};

	server.post(
		`/${token}/api/ai-wiki/status`,
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
				const data = await service.getStatus(parseProjectRequest(request.body));
				return { success: true, data, timestamp: Date.now() };
			} catch (err) {
				return handleRouteError(reply, 'POST status', err);
			}
		}
	);

	server.post(
		`/${token}/api/ai-wiki/refresh`,
		{
			config: {
				rateLimit: {
					max: rateLimitConfig.maxPost,
					timeWindow: rateLimitConfig.timeWindow,
				},
			},
		},
		async (request, reply) => {
			try {
				const data = await service.refresh(parseProjectRequest(request.body));
				return { success: true, data, timestamp: Date.now() };
			} catch (err) {
				return handleRouteError(reply, 'POST refresh', err);
			}
		}
	);

	server.post(
		`/${token}/api/ai-wiki/context`,
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
				const data = await service.getContextPacket(parseProjectRequest(request.body));
				return { success: true, data, timestamp: Date.now() };
			} catch (err) {
				return handleRouteError(reply, 'POST context', err);
			}
		}
	);
}

function parseProjectRequest(body: unknown): AiWikiProjectRequest {
	const input = (body ?? {}) as Partial<AiWikiProjectRequest>;
	if (!input.projectRoot || typeof input.projectRoot !== 'string') {
		throw new Error('Request body must include projectRoot');
	}
	return {
		projectRoot: input.projectRoot,
		projectId: typeof input.projectId === 'string' ? input.projectId : undefined,
		sshRemoteId: typeof input.sshRemoteId === 'string' ? input.sshRemoteId : null,
	};
}
