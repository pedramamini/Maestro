/**
 * Shared web API route prefixes
 *
 * Single source of truth for every `/api/<feature>` prefix used by the web
 * server (src/main/web-server/routes/) and the web/mobile client
 * (src/web/hooks/, src/web/mobile/).
 *
 * Importing this constant on both sides means a typo at one end will produce
 * a TypeScript error rather than a silent 404 in production.
 *
 * Usage - server:
 *   `/${token}${WEB_API_PREFIXES.agentDispatch}/board`
 *
 * Usage - client (path argument passed to buildApiUrl):
 *   buildApiUrl(`${WEB_API_PREFIXES.agentDispatch}/board`)
 *   // buildApiUrl prepends the token-scoped apiBase so only the /api/...
 *   // suffix is needed here.
 */

/** Map of feature keys to their `/api/<feature>` path segments. */
export const WEB_API_PREFIXES = {
	deliveryPlanner: '/api/delivery-planner',
	livingWiki: '/api/living-wiki',
	workGraph: '/api/work-graph',
	agentDispatch: '/api/agent-dispatch',
	pipeline: '/api/pipeline',
	resync: '/api/resync',
} as const;

/** Union of valid feature keys. */
export type WebApiPrefix = keyof typeof WEB_API_PREFIXES;

/**
 * Join a prefix with one or more path segments, collapsing duplicate slashes.
 *
 * @example
 * buildRoutePath(WEB_API_PREFIXES.agentDispatch, 'board')
 * // -> '/api/agent-dispatch/board'
 *
 * buildRoutePath(WEB_API_PREFIXES.livingWiki, 'doc', docId, 'history')
 * // -> '/api/living-wiki/doc/<docId>/history'
 */
export function buildRoutePath(prefix: string, ...segments: string[]): string {
	const parts = [prefix, ...segments].map((part) => part.replace(/^\/+|\/+$/g, ''));
	return '/' + parts.filter(Boolean).join('/');
}
