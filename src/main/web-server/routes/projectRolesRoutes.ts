/**
 * Project Roles Web Routes (#448)
 *
 * Exposes the per-project role slot config and live claim state over HTTP so
 * the mobile/web Dev Crew panel can read the same data available via IPC.
 *
 * Route map:
 *   GET  /$TOKEN/api/project-roles?projectPath=<path>
 *     → { slots: ProjectRoleSlots, claims: ClaimInfo[] }
 */

import { FastifyInstance } from 'fastify';
import type { ProjectRoleSlots } from '../../../shared/project-roles-types';
import type { ClaimInfo } from '../../agent-dispatch/claim-tracker';
import type { SettingsStoreInterface } from '../../stores/types';
import type { RateLimitConfig } from '../types';
import { logger } from '../../utils/logger';

const LOG_CONTEXT = 'WebServer:ProjectRoles';

/** The top-level key used inside the settings store for project role slots. */
const STORE_KEY = 'projectRoleSlots';

type ProjectRoleSlotsMap = Record<string, ProjectRoleSlots>;

export interface ProjectRolesRouteDependencies {
	settingsStore: SettingsStoreInterface;
	/** Return all active claims from the in-memory ClaimTracker. */
	getActiveClaims: () => ClaimInfo[];
}

/**
 * Register Project Roles HTTP routes on the Fastify server.
 */
export function registerProjectRolesRoutes(
	server: FastifyInstance,
	token: string,
	rateLimitConfig: RateLimitConfig,
	deps: ProjectRolesRouteDependencies
): void {
	// ---------------------------------------------------------------------------
	// GET /api/project-roles?projectPath=<path>
	//
	// Returns the slot config for the given project path plus all active claims
	// that belong to that project (filtered by projectPath).
	// ---------------------------------------------------------------------------
	server.get(
		`/${token}/api/project-roles`,
		{
			config: {
				rateLimit: {
					max: rateLimitConfig.max,
					timeWindow: rateLimitConfig.timeWindow,
				},
			},
		},
		async (request, reply) => {
			const { projectPath } = request.query as { projectPath?: string };
			if (!projectPath) {
				return reply.code(400).send({
					success: false,
					error: 'Query param "projectPath" is required',
					timestamp: Date.now(),
				});
			}

			try {
				const map = (deps.settingsStore.get(STORE_KEY, {}) as ProjectRoleSlotsMap) ?? {};
				const slots: ProjectRoleSlots = map[projectPath] ?? {};

				// Filter active claims to those belonging to this project.
				const claims = deps.getActiveClaims().filter((c) => c.projectPath === projectPath);

				return {
					success: true,
					data: { slots, claims },
					timestamp: Date.now(),
				};
			} catch (err) {
				logger.error('GET project-roles error', LOG_CONTEXT, { error: String(err) });
				return reply.code(500).send({
					success: false,
					error: String(err),
					timestamp: Date.now(),
				});
			}
		}
	);

	logger.debug('Project Roles routes registered', LOG_CONTEXT);
}
