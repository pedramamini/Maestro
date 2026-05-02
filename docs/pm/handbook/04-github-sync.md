# 04 — Git Hosting Traceability

Work Graph is the source of truth for PM issue/task work, and Maestro Board is the UI for that Work Graph state. GitHub is used only for git hosting mechanics: branches, commits, PRs, reviews, and merges.

---

## Rule

Do not create GitHub issues or GitHub Project cards as a prerequisite for PM work, dispatch, review, or merge.

Every branch, commit, and PR should reference the Work Graph/Maestro item ID it is working on. GitHub issue references are optional traceability only when a mirror already exists.

Example:

```text
Maestro: <workItemId>
```

If an external tracker mirror already exists, its reference may be included as extra context, but it is never required for PM execution. Do not create new GitHub issues just to satisfy PM process.

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

Do not use GitHub issue state, labels, milestones, or project-board status as PM state. Update Work Graph status instead through `/PM issue-sync <id>`, `/PM epic-sync <id>`, `/PM issue-start <id>`, `pm:setStatus`, or the Maestro Board UI.
