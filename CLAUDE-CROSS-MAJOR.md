# CLAUDE-CROSS-MAJOR.md

Reference for the three major sub-systems and every integration point between them. Read this before touching `src/main/delivery-planner/`, `src/main/living-wiki/`, `src/main/agent-dispatch/`, or `src/shared/cross-major-contracts.ts`.

---

## The Three Majors

| Major                | Role                                                                      | Canonical source             |
| -------------------- | ------------------------------------------------------------------------- | ---------------------------- |
| **Delivery Planner** | PRD → Epic → Tasks decomposition, `agent-ready` tagging, GitHub sync      | `src/main/delivery-planner/` |
| **Living Wiki**      | Auto-generates and maintains doc coverage, raises doc-gap candidates      | `src/main/living-wiki/`      |
| **Agent Dispatch**   | Matches agents to `agent-ready` Work Graph items, manages claim lifecycle | `src/main/agent-dispatch/`   |

All three share the **Work Graph** as their storage substrate (`src/main/work-graph/`). Work Graph owns storage only — it writes no application-level metadata.

---

## Work Graph Metadata Namespaces

Canonical registry: `src/shared/cross-major-contracts.ts` → `WORK_GRAPH_METADATA_NAMESPACES`.

Every semantic key lives under `WorkItem.metadata` (a `Record<string, unknown>`). The three logical namespaces are:

### Delivery Planner (`metadata.*`)

Written by `src/main/delivery-planner/planner-service.ts`.

| Key                               | Written at                                                                   | Description                                                                       |
| --------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `kind`                            | `createPrd`, `convertPrdToEpic`, `decomposeEpicToTasks`, `createBugFollowUp` | `'prd' \| 'epic' \| 'task' \| 'bug-follow-up'`                                    |
| `prdWorkItemId`                   | `convertPrdToEpic` (epic), `decomposeEpicToTasks` (task)                     | Work Graph ID of the owning PRD                                                   |
| `epicWorkItemId`                  | `decomposeEpicToTasks`                                                       | Work Graph ID of the owning epic                                                  |
| `ccpmSlug`                        | `createPrd`, `convertPrdToEpic`                                              | Slugified title for CCPM markdown paths                                           |
| `deliveryPlannerTraceability`     | `enrichPlannerMetadata()`                                                    | Nested: `{ prdWorkItemId, epicWorkItemId, parentWorkItemId, github, livingWiki }` |
| `deliveryPlannerDispatch`         | `enrichPlannerMetadata()`                                                    | Nested: `{ capabilityHints: string[], ownership: string }`                        |
| `deliveryPlannerAgentReady`       | `refreshAgentReadyTags()`                                                    | Nested: `{ tag, ready, evaluatedAt, reason }`                                     |
| `deliveryPlannerProgressComments` | `addProgressComment()`                                                       | Array of `{ id, body, createdAt, actor }`                                         |
| `dependsOnTaskTitles`             | decomposer output                                                            | Upstream task titles for dependency wiring                                        |
| `filesLikelyTouched`              | decomposer output                                                            | Expected file paths for capability-hint inference                                 |
| `parallel`                        | decomposer output                                                            | Whether the task can run in parallel with siblings                                |

### Living Wiki (`metadata.*`)

Written by `src/main/living-wiki/workGraphBridge.ts`.

| Key                 | Written at                                                      | Description                                               |
| ------------------- | --------------------------------------------------------------- | --------------------------------------------------------- |
| `kind`              | `createLivingWikiDocMetadata()`, `upsertLivingWikiDocGapItem()` | `'living-wiki-doc' \| 'living-wiki-doc-gap'`              |
| `slug`              | `createLivingWikiDocMetadata()`                                 | Canonical wiki doc slug                                   |
| `area`              | `createLivingWikiDocMetadata()`                                 | Area identifier (`'architecture'`, `'api'`, …)            |
| `frontmatter`       | `createLivingWikiDocMetadata()`                                 | Raw parsed YAML frontmatter                               |
| `sourceGitPaths`    | `createLivingWikiDocMetadata()`                                 | Repo-relative source file paths (living-wiki-doc)         |
| `sourceGitPath`     | `upsertLivingWikiDocGapItem()`                                  | Single source file path that lacks a wiki doc (doc-gap)   |
| `bodyHash`          | `createLivingWikiDocMetadata()`                                 | SHA-256 of document body                                  |
| `bodyText`          | `createLivingWikiDocMetadata()`                                 | Raw body for full-text search                             |
| `searchText`        | `createLivingWikiDocMetadata()`                                 | Concatenated search blob                                  |
| `agentReadyNote`    | `upsertLivingWikiDocGapItem()`                                  | Ownership boundary note (never set `agent-ready` on gaps) |
| `plannerWorkItemId` | `upsertLivingWikiDocGapItem()`                                  | (optional) Soft link to a Delivery Planner PRD/epic       |

### Agent Dispatch

Agent Dispatch writes **no metadata**. It reads via the helpers in `src/shared/agent-dispatch-lineage.ts`. Claim ownership is stored on `WorkItem.claim` (a first-class Work Graph field), not in `metadata`.

---

## Broadcast Operations

Full registry: `src/shared/cross-major-contracts.ts` → `BROADCAST_OPERATIONS_BY_NAMESPACE`.
All operations are typed as `WorkGraphBroadcastOperation` in `src/shared/work-graph-types.ts`.

| Producer         | Operation                              | File:line                                         |
| ---------------- | -------------------------------------- | ------------------------------------------------- |
| Delivery Planner | `workGraph.item.created`               | `planner-service.ts:497`, `spec-bridge.ts:104`    |
| Delivery Planner | `workGraph.item.updated`               | `planner-service.ts:510,552`, `spec-bridge.ts:84` |
| Delivery Planner | `workGraph.item.statusChanged`         | `planner-service.ts:368`                          |
| Living Wiki      | `workGraph.item.updated`               | `service.ts:145` (`publishDocChange`)             |
| Agent Dispatch   | `agentDispatch.fleet.changed`          | `fleet-registry.ts:148`                           |
| Agent Dispatch   | `agentDispatch.agent.readinessChanged` | `fleet-registry.ts:148`                           |
| Agent Dispatch   | `agentDispatch.agent.claimsChanged`    | `fleet-registry.ts:148`                           |
| Agent Dispatch   | `agentDispatch.agent.pickupChanged`    | `fleet-registry.ts:148`                           |

Agent Dispatch **subscribes to** (source: `src/main/agent-dispatch/events.ts:18–24`, `runtime.ts:147`):
`workGraph.item.created`, `workGraph.item.updated`, `workGraph.item.released`, `workGraph.item.statusChanged`, `workGraph.tags.updated`

---

## Integration Flows

### 1. Planner → Dispatch handoff (issue #161)

```
createPrd → convertPrdToEpic → decomposeEpicToTasks
  └─ refreshAgentReadyTags() tags unblocked, specified tasks with WORK_GRAPH_READY_TAG
       └─ workGraph.item.created / updated events → AgentDispatchEngine.runAutoPickup()
            └─ claimItem(workItemId, agentId) → WorkItem.status = 'claimed'
```

Key files: `planner-service.ts` (producer), `dispatch-engine.ts` (consumer), `events.ts` (subscription wiring).
Integration test: `src/__tests__/integration/planner-dispatch-handoff.test.ts`

### 2. Doc-gap promotion (issue #162)

```
Living Wiki runGeneration() detects undocumented source file
  └─ upsertLivingWikiDocGapItem() creates WorkItem { kind: 'living-wiki-doc-gap', tags: [] }
       └─ plannerWorkItemId optionally links to a Delivery Planner PRD/epic
            └─ Human or Delivery Planner explicitly adds agent-ready tag to promote for dispatch
```

Living Wiki **never** sets `agent-ready` on gap items. Only Delivery Planner or a human promoter does.
Key file: `src/main/living-wiki/workGraphBridge.ts` (`upsertLivingWikiDocGapItem`)

### 3. Dispatch completion → coverage refresh (issue #163)

```
AgentDispatch completes claim → updateStatus('done')
  └─ workGraph.item.statusChanged event fires
       └─ LivingWikiService subscription (subscribeWorkGraphEvents) detects:
            – item.source === 'living-wiki', OR
            – item.tags includes 'living-wiki', OR
            – item.metadata.livingWiki.sourceGitPath is set
          → debounced runGeneration({ projectPath }) (3-second window, per-project)
```

Key files: `src/main/living-wiki/service.ts` (subscription + debounce), `src/main/work-graph/events.ts`.
Integration test: `src/__tests__/integration/dispatch-completion-coverage.integration.test.ts`

### 4. Reconnect-resync envelope (issue #164)

```
Web/mobile client reconnects (WebSocket or fresh page load)
  └─ GET /:token/api/resync
       └─ ResyncSnapshot { workGraph, deliveryPlanner, livingWiki, agentDispatch }
            └─ Client replaces all local state atomically (single round-trip)
```

Key files: `src/main/web-server/routes/apiRoutes.ts` (`ResyncSnapshot`, `getResyncSnapshot` callback).
Contract test: `src/__tests__/main/web-server/routes/resyncRoute.test.ts`

---

## Fork-Only GitHub Invariant

Agent Dispatch and Living Wiki **never** create GitHub issues or PRs. All GitHub sync is owned by Delivery Planner and is gated to the `HumpfTech/Maestro` fork only.

This invariant is checked at runtime by `src/shared/fork-only-github.ts` and enforced in `src/main/delivery-planner/github-sync.ts`. Any attempt by Agent Dispatch or Living Wiki to call GitHub APIs should be treated as a bug.

See `CLAUDE-AGENT-DISPATCH.md` for the fork-only guard implementation details.

---

## Lineage Extraction Helpers

`src/shared/agent-dispatch-lineage.ts` provides read-only helpers:

| Helper                                | Reads from                                                                                                | Returns                  |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------ |
| `extractDeliveryPlannerLineage(item)` | `metadata.kind`, `metadata.prdWorkItemId`, `metadata.epicWorkItemId`                                      | `DeliveryPlannerLineage` |
| `extractLivingWikiReference(item)`    | `metadata.kind`, `metadata.slug`, `metadata.area`, `metadata.sourceGitPath`, `metadata.plannerWorkItemId` | `LivingWikiReference`    |
| `isDeliveryPlannerItem(item)`         | calls `extractDeliveryPlannerLineage`                                                                     | `boolean`                |
| `isLivingWikiItem(item)`              | calls `extractLivingWikiReference`                                                                        | `boolean`                |

No side effects. No writes. No imports from planner or wiki internals.

---

## Implicit Ordering Assumptions

1. **Enrollment before generation** — `livingWiki:enroll` must run before `livingWiki:runGeneration`.
2. **PRD before epic** — `convertPrdToEpic` requires an existing PRD work item.
3. **Epic before task decomposition** — `decomposeEpicToTasks` requires an existing epic.
4. **`agent-ready` before claim** — Agent Dispatch filters on `WORK_GRAPH_READY_TAG`; only Delivery Planner (or explicit human promotion) sets it.
5. **Claim before release** — `releaseClaim` requires an active claim on the item.

---

## How to Extend

### Add a metadata key to an existing major

1. Write the key in the owning major's service (planner-service.ts or workGraphBridge.ts).
2. Update the namespace comment block in `src/shared/cross-major-contracts.ts`.
3. If Agent Dispatch needs to read it, add a field to the matching interface in `agent-dispatch-lineage.ts` and update the extractor.
4. Update `INTEGRATION-LOG.md` with the file:line.
5. Add a fixture assertion to `src/__tests__/contracts/cross-major-contracts.test.ts`.

### Add a new cross-major flow

1. Identify producer and consumer.
2. Route all cross-major state through `WorkItem.metadata` — never import across major boundaries directly.
3. Add the new broadcast operation to `BROADCAST_OPERATIONS_BY_NAMESPACE` if applicable.
4. Write an integration test under `src/__tests__/integration/`.
5. Append an entry to `INTEGRATION-LOG.md`.

---

## Validation Steps

```bash
# Contract registry (fast, no I/O)
npm run audit:cross-major

# Integration flows (#161 handoff, #163 coverage refresh)
npm run audit:integrations

# Reconnect-resync envelope (#164)
npx vitest run src/__tests__/main/web-server/routes/resyncRoute.test.ts

# Full cross-major smoke (all three majors + lineage extraction)
npx vitest run --config vitest.integration.config.ts src/__tests__/integration/cross-major-smoke.integration.test.ts

# Type-check
npx tsc -p tsconfig.lint.json --noEmit
npx tsc -p tsconfig.main.json --noEmit
```
