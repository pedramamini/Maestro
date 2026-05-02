# 03 — Task Breakdown

Tasks are the atomic unit of delivery in the Maestro pipeline. Each task maps 1:1 to a Work Graph item, and implementation work should reference that item in branches, commits, and PRs. A task markdown file is optional mirror/context and is not enough for dispatch; create or update the Work Graph item first through `{{MAESTRO_CLI_PATH}} pm work create --kind task ...`, `window.maestro.workGraph.createItem`, `/PM epic-sync <id>`, `/PM issue-sync <id>`, or the Delivery Planner sync IPC. This file covers how to size tasks correctly, write acceptance criteria that are actually useful to an agent, and avoid the most common breakdown mistakes.

---

## What Makes a Good Task

A good task satisfies all of these:

1. **Implementable by one agent in one sitting.** If an agent would need to stop and ask a question mid-task, the task is underspecified or too large.
2. **Has clear done criteria.** The agent can self-verify without human review at the implementation stage.
3. **Touches a bounded set of files.** If a task touches >10 files, it's probably two tasks.
4. **Has an imperative title.** "Add GoogleStrategy to Passport config" not "Google auth strategy".
5. **Scoped to its role.** Runner tasks implement. Fixer tasks correct errors. Reviewer tasks verify. Merger tasks merge.

---

## Sizing Reference

| Size | Hours | What fits                                                                          |
| ---- | ----- | ---------------------------------------------------------------------------------- |
| xs   | <1    | Config change, single-file edit, adding a constant or type                         |
| s    | 1–2   | Single endpoint, single component, small migration                                 |
| m    | 2–4   | Feature slice with tests, multi-file refactor, integration of one external service |
| l    | 4–8   | Full subsystem, complex integration with multiple edge cases                       |
| xl   | 8+    | **Split this.** An xl task is an undefined epic, not a task.                       |

### Splitting xl tasks

When a task is xl, ask: "What's the first piece that can ship and be tested independently?" That's Task A. Everything else is Task B (and maybe C).

Example:

- xl: "Implement full OAuth2 flow" → split:
  - m: "Add Passport.js strategies and strategy config"
  - s: "Add /auth/callback route and session establishment"
  - s: "Add JWT issuance on successful callback"

---

## Title Conventions

Use imperative verb + subject noun. No gerunds ("Adding..."), no passive ("OAuth route added").

Good:

- "Configure GoogleStrategy in Passport"
- "Add /auth/github callback route"
- "Write smoke test checklist for OAuth sign-in"

Bad:

- "Google auth" (not a sentence)
- "Authentication work" (vague noun phrase)
- "Implementing OAuth" (gerund)

---

## Acceptance Criteria Template

Each acceptance criterion should be:

- **Binary**: either passes or fails — no "mostly works"
- **Testable without human judgment**: agent can run a command or check a condition
- **Specific**: "sign-in redirects to /dashboard" not "sign-in works"

Template for each criterion:

```
- [ ] Given <condition>, when <action>, then <expected outcome>
```

Or for code-level criteria:

```
- [ ] `npm test` passes with no new failures
- [ ] `GET /auth/google` returns 302 to accounts.google.com
- [ ] httpOnly cookie named `session` is set after callback
```

---

## Role Assignment Rules

| Role       | Assign when                                                                                              |
| ---------- | -------------------------------------------------------------------------------------------------------- |
| `runner`   | Task is a fresh implementation — no code exists yet                                                      |
| `fixer`    | Task is correcting something that was tried and failed (validation error, test failure, review feedback) |
| `reviewer` | Task is verifying that implementation meets acceptance criteria; may include running tests               |
| `merger`   | Task is merging an approved PR                                                                           |

The typical flow for a feature task:

```
runner (implements) → fixer (corrects if needed) → reviewer (verifies) → merger (ships)
```

Not every task needs all four roles. Simple chores might be: runner → reviewer → merger.

---

## Parallelism Rules

Two tasks can run in parallel if and only if:

1. Neither depends on the other's output
2. They do not write to the same files
3. They are not both migrations (database schema changes must be sequential)

Mark parallel tasks explicitly in the epic table and in each task file's frontmatter (`parallel: true`).

When assigning to slots: parallel tasks with the same role can be dispatched to separate agents simultaneously. The Dispatch Engine handles this automatically — you do not need to manually coordinate.

---

## Dependencies — How to Express Them

In the task file frontmatter:

```yaml
depends_on: [1, 2] # draft task numbers before sync; Work Graph item IDs after sync
```

In the task body:

```markdown
## Dependencies

Blocked by: #42 (Configure Passport strategies), #43 (Add /auth routes)
```

After task creation, replace draft task numbers with Work Graph item IDs. The Dispatch Engine reads dependencies from Work Graph relationships and task metadata.

---

## Common Breakdown Mistakes

### Mistake: Mixing roles in one task

"Implement the route AND review it AND merge the PR" — this is three tasks.

### Mistake: Underspecified technical notes

"Add authentication" without specifying which file, which library, or what pattern to follow. The agent will guess, and it will guess wrong.

### Mistake: Missing acceptance criteria

Tasks with only a description and no acceptance criteria are a fixer magnet. The runner won't know when it's done, so it will either over-implement or stop too early.

### Mistake: xl tasks disguised as l

If a task description has more than 5 acceptance criteria, it is probably xl. Re-read sizing reference.

### Mistake: Dependencies on done tasks

If you're decomposing a PRD for a feature where some tasks already exist in the repo, check first — don't create duplicate implementation tasks.

---

## Task Checklist Before Creating Work Graph Items

Run through this before creating dispatchable Work Graph items:

- [ ] Title is imperative verb + noun
- [ ] Size is xs, s, m, or l (no xl)
- [ ] Acceptance criteria are binary and testable
- [ ] Dependencies are listed (or "none")
- [ ] AI Role is set (runner/fixer/reviewer/merger)
- [ ] Parallel flag is correct
- [ ] Technical notes are specific enough for an agent to start without questions

Once all tasks pass this checklist, create/update the Work Graph items with `/PM epic-sync <id>` or the Delivery Planner sync IPC, then proceed to handbook/04-github-sync.md for local mirror and git traceability guidance.
