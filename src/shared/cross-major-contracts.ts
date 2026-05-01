/**
 * cross-major-contracts.ts
 *
 * Canonical registry of Work Graph metadata namespaces written by each major
 * sub-system (Delivery Planner, Living Wiki, Agent Dispatch).
 *
 * Every metadata key that crosses a major boundary is documented here so that
 * subsequent tasks in the cross-major-integration epic (issues #161–#167) can
 * reference a single authoritative source rather than grepping across four
 * directories.
 *
 * @see .claude/INTEGRATION-LOG.md – "Cross-Major Contract Audit" section for
 *   the full contract table including file:line references for every producer
 *   and consumer.
 *
 * @see src/shared/agent-dispatch-lineage.ts – read-only extraction helpers
 *   that consume the metadata keys documented here.
 */

// ---------------------------------------------------------------------------
// Namespace registry
// ---------------------------------------------------------------------------

/**
 * Canonical Work Graph metadata namespaces, one per major sub-system.
 *
 * These are the top-level keys under `WorkItem.metadata` that each major owns:
 *
 * - `'deliveryPlanner'` — Delivery Planner writes:
 *     • `metadata.kind` ('prd' | 'epic' | 'task' | 'bug-follow-up')
 *     • `metadata.prdWorkItemId` — Work Graph ID of the owning PRD
 *     • `metadata.epicWorkItemId` — Work Graph ID of the owning epic
 *     • `metadata.ccpmSlug` — CCPM-compatible markdown path segment
 *     • `metadata.deliveryPlannerTraceability` — nested traceability record:
 *         – prdWorkItemId, epicWorkItemId, parentWorkItemId, github, livingWiki
 *     • `metadata.deliveryPlannerDispatch` — nested dispatch hints:
 *         – capabilityHints (string[]), ownership (string)
 *     • `metadata.deliveryPlannerAgentReady` — readiness evaluation record:
 *         – tag, ready, evaluatedAt, reason
 *     • `metadata.deliveryPlannerProgressComments` — array of progress comments
 *     • `metadata.relatedWorkItemId` — (bug-follow-up only) linked task/epic ID
 *     • `metadata.dependsOnTaskTitles` — (decomposed task) titles of upstream tasks
 *     • `metadata.filesLikelyTouched` — (decomposed task) expected file paths
 *     • `metadata.parallel` — (decomposed task) whether task can run in parallel
 *
 * - `'livingWiki'` — Living Wiki writes:
 *     • `metadata.kind` ('living-wiki-doc' | 'living-wiki-doc-gap')
 *     • `metadata.slug` — canonical wiki document slug
 *     • `metadata.area` — area identifier (e.g. 'architecture', 'api')
 *     • `metadata.frontmatter` — raw parsed YAML frontmatter object
 *     • `metadata.sourceGitPaths` — (living-wiki-doc) repo-relative paths of source files
 *     • `metadata.sourceGitPath` — (living-wiki-doc-gap) single source file path
 *     • `metadata.validationSummary` — frontmatter validation results
 *     • `metadata.bodyHash` — SHA-256 of the document body (excluding frontmatter)
 *     • `metadata.bodyText` — raw body text for full-text search
 *     • `metadata.searchText` — concatenated search blob (title + summary + body + sources)
 *     • `metadata.agentReadyNote` — (living-wiki-doc-gap) ownership boundary note
 *     • `metadata.plannerWorkItemId` — (living-wiki-doc-gap) optional link to a
 *         Delivery Planner PRD or epic
 *
 * - `'agentDispatch'` — Agent Dispatch does NOT write metadata to Work Graph items.
 *     It reads `metadata.kind`, `metadata.prdWorkItemId`, `metadata.epicWorkItemId`,
 *     `metadata.slug`, `metadata.area`, `metadata.sourceGitPath`, and
 *     `metadata.plannerWorkItemId` via `src/shared/agent-dispatch-lineage.ts`.
 *     Claim ownership is stored on `WorkItem.claim` (a first-class field), not
 *     in `metadata`. Capability routing is written to `WorkItemClaimInput.capabilityRouting`
 *     at claim time but is NOT persisted as `metadata.*`.
 */
export const WORK_GRAPH_METADATA_NAMESPACES = [
	'deliveryPlanner',
	'livingWiki',
	'agentDispatch',
] as const;

/** Union of valid metadata namespace identifiers. */
export type WorkGraphMetadataNamespace = (typeof WORK_GRAPH_METADATA_NAMESPACES)[number];

// ---------------------------------------------------------------------------
// Broadcast operation registry
// ---------------------------------------------------------------------------

/**
 * Work Graph broadcast operations produced by each major, keyed by namespace.
 *
 * These map directly to `WorkGraphBroadcastOperation` in work-graph-types.ts.
 *
 * Delivery Planner produces:
 *   - 'workGraph.item.created'   (createWorkItem private helper)
 *   - 'workGraph.item.updated'   (updateWorkItem private helper)
 *   - 'workGraph.item.statusChanged'   (updateStatus)
 *
 * Living Wiki produces:
 *   - 'workGraph.item.updated'   (service.ts publishDocChange)
 *
 * Agent Dispatch produces (via FleetRegistry):
 *   - 'agentDispatch.fleet.changed'
 *   - 'agentDispatch.agent.readinessChanged'
 *   - 'agentDispatch.agent.claimsChanged'
 *   - 'agentDispatch.agent.pickupChanged'
 *
 * Agent Dispatch subscribes to (via subscribeWorkGraphEvents in runtime.ts):
 *   - 'workGraph.item.created'
 *   - 'workGraph.item.updated'
 *   - 'workGraph.item.released'
 *   - 'workGraph.item.statusChanged'
 *   - 'workGraph.tags.updated'
 */
export const BROADCAST_OPERATIONS_BY_NAMESPACE = {
	deliveryPlanner: [
		'workGraph.item.created',
		'workGraph.item.updated',
		'workGraph.item.statusChanged',
	],
	livingWiki: ['workGraph.item.updated'],
	agentDispatch: [
		'agentDispatch.fleet.changed',
		'agentDispatch.agent.readinessChanged',
		'agentDispatch.agent.claimsChanged',
		'agentDispatch.agent.pickupChanged',
	],
} as const satisfies Record<WorkGraphMetadataNamespace, readonly string[]>;

// ---------------------------------------------------------------------------
// IPC channel registry
// ---------------------------------------------------------------------------

/**
 * IPC channels exposed by each major (from scripts/audit-ipc.mjs output).
 *
 * Delivery Planner channels:
 *   deliveryPlanner:addProgressComment, createBugFollowUp, createPrd,
 *   dashboard, decomposeEpic, decomposePrd, getProgress, listProgress,
 *   resolvePaths, sync
 *
 * Living Wiki channels:
 *   livingWiki:enroll, enrollProject, getConfig, getDoc, getMeta, history,
 *   listDocs, runGeneration, saveDoc, search, unwatch, updateConfig,
 *   validate, watch
 *
 * Work Graph channels:
 *   workGraph:claimItem, completeClaim, createItem, deleteItem, getItem,
 *   getUnblockedAgentReadyWork, importItems, listEvents, listItems, listTags,
 *   releaseClaim, renewClaim, searchItems, updateItem, upsertTag
 *
 * Agent Dispatch channels:
 *   agentDispatch:assign, assignManually, createSubtask, getBoard, getFleet,
 *   listAgents, listEligible, pause, pauseAgent, release, releaseClaim,
 *   resume, resumeAgent, status
 */
export const IPC_CHANNELS_BY_NAMESPACE = {
	deliveryPlanner: [
		'deliveryPlanner:addProgressComment',
		'deliveryPlanner:createBugFollowUp',
		'deliveryPlanner:createPrd',
		'deliveryPlanner:dashboard',
		'deliveryPlanner:decomposeEpic',
		'deliveryPlanner:decomposePrd',
		'deliveryPlanner:getProgress',
		'deliveryPlanner:listProgress',
		'deliveryPlanner:resolvePaths',
		'deliveryPlanner:sync',
	],
	livingWiki: [
		'livingWiki:enroll',
		'livingWiki:enrollProject',
		'livingWiki:getConfig',
		'livingWiki:getDoc',
		'livingWiki:getMeta',
		'livingWiki:history',
		'livingWiki:listDocs',
		'livingWiki:runGeneration',
		'livingWiki:saveDoc',
		'livingWiki:search',
		'livingWiki:unwatch',
		'livingWiki:updateConfig',
		'livingWiki:validate',
		'livingWiki:watch',
	],
	agentDispatch: [
		'agentDispatch:assign',
		'agentDispatch:assignManually',
		'agentDispatch:createSubtask',
		'agentDispatch:getBoard',
		'agentDispatch:getFleet',
		'agentDispatch:listAgents',
		'agentDispatch:listEligible',
		'agentDispatch:pause',
		'agentDispatch:pauseAgent',
		'agentDispatch:release',
		'agentDispatch:releaseClaim',
		'agentDispatch:resume',
		'agentDispatch:resumeAgent',
		'agentDispatch:status',
	],
} as const satisfies Record<WorkGraphMetadataNamespace, readonly string[]>;

// ---------------------------------------------------------------------------
// Web API route prefixes
// ---------------------------------------------------------------------------

/**
 * Web API route prefixes for each major (canonical source: src/shared/web-routes.ts).
 *
 * Delivery Planner: /api/delivery-planner
 * Living Wiki:      /api/living-wiki
 * Work Graph:       /api/work-graph
 * Agent Dispatch:   /api/agent-dispatch
 *
 * Note: Work Graph is the shared substrate; it is not listed in
 * WORK_GRAPH_METADATA_NAMESPACES because it does not write application-level
 * metadata — it owns the storage layer, not the semantic content.
 */
export const WEB_ROUTE_PREFIXES_BY_NAMESPACE = {
	deliveryPlanner: '/api/delivery-planner',
	livingWiki: '/api/living-wiki',
	agentDispatch: '/api/agent-dispatch',
} as const satisfies Record<WorkGraphMetadataNamespace, string>;
