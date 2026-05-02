# 05 — Dispatch & Claim

The Dispatch Engine automatically picks up eligible Work Graph items and runs them through configured agent slots. Maestro Board / Work Graph is the source of truth for status, role, ownership, and heartbeat state.

---

## The Four Roles

| Role       | What it does                                                  | When it runs                                            |
| ---------- | ------------------------------------------------------------- | ------------------------------------------------------- |
| `runner`   | Implements the task from scratch                              | Work Graph item is `ready` and current role is `runner` |
| `fixer`    | Corrects validation errors, test failures, or review feedback | Runner output needs repair                              |
| `reviewer` | Verifies the implementation meets acceptance criteria         | Runner/fixer work is complete                           |
| `merger`   | Merges the approved PR and marks local work done              | Reviewer approves                                       |

Typical flow:

```
ready
  -> runner claim -> in_progress -> PR opened
  -> reviewer claim -> review
  -> merger claim -> done
```

---

## Slot Configuration

Slots are configured per project in Maestro Settings / Roles:

```ts
projectRoleSlots[projectPath] = {
	runner: { agentId: '<session-id>', enabled: true },
	fixer: { agentId: '<session-id>', enabled: true },
	reviewer: { agentId: '<session-id>', enabled: true },
	merger: { agentId: '<session-id>', enabled: true },
};
```

`agentId` references an existing Left Bar agent. The runner must operate in the local project checkout; fixer/reviewer/merger may be remote if configured.

---

## Claims

An active Work Graph claim row is exclusive ownership. The in-memory `ClaimTracker` mirrors active claims for the renderer and heartbeat loop, but Work Graph is durable state.

A claim records:

- Work Graph item ID
- owning slot agent ID
- role
- claimed timestamp
- heartbeat/expiry

---

## Heartbeat And Recovery

Agents renew their Work Graph claim while running. A stale claim is one whose heartbeat/lease exceeds the configured threshold, normally 5 minutes.

Recovery path:

1. Run PM audit/health in Maestro, or inspect from a shell with `maestro-cli fleet board --project <path> --json`.
2. Release stale Work Graph claims in Maestro or with `maestro-cli fleet release <workItemId> --json`.
3. Return unfinished items to `ready`.
4. Leave a Work Graph event explaining the release.

Do not use external tracker labels or project fields for claim recovery.
