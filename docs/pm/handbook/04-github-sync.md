# 04 — Git Hosting Traceability

Maestro Board / Work Graph is the source of truth for PM issue/task work. GitHub is used only for git hosting mechanics: branches, commits, PRs, reviews, and merges.

---

## Rule

Do not create external tracker items as a prerequisite for dispatch.

Every branch, commit, and PR should reference the Work Graph/Maestro item ID it is working on.

Example:

```text
Maestro: <workItemId>
```

If an external tracker mirror already exists, its reference may be included as extra context, but it is never required for PM execution.

---

## Commit Guidance

Commit messages should include:

- concise change summary
- Work Graph/Maestro item ID
- test/build result when relevant

Example:

```text
Implement local PM audit action

Maestro: <workItemId>
Validation: npm run lint
```

---

## PR Guidance

PR bodies should include:

- Work Graph/Maestro item ID
- summary of changes
- validation run
- any follow-up Work Graph items created

Do not use external project-board status as PM state. Update Work Graph status instead.
