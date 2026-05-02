# 10 — PM Cheatsheet

Use Work Graph for PM state; Maestro Board is the UI for it. Use git hosting only for branches, commits, PRs, reviews, and merges.

---

## PM State

| Need            | Source                                        |
| --------------- | --------------------------------------------- |
| Board status    | Work Graph item `status`                      |
| Assignment      | active Work Graph claim                       |
| Runner liveness | Work Graph claim heartbeat/expiry             |
| Dependencies    | Work Graph dependency edges / metadata        |
| Traceability    | Work Graph/Maestro item ID in commits and PRs |

---

## Common Status Changes

| Intent           | Work Graph state                            |
| ---------------- | ------------------------------------------- |
| Ready for pickup | `ready`                                     |
| Claimed/running  | `claimed` / `in_progress` with active claim |
| Needs review     | `review`                                    |
| Blocked          | `blocked` plus reason event                 |
| Complete         | `done`                                      |

---

## Git Hosting

Use normal git/PR commands for shipping code. Always include the Work Graph item ID in commit and PR text.

```bash
git status
git add <files>
git commit -m "<summary>"
git push
gh pr create --draft
gh pr merge <number> --squash --delete-branch
```

Do not use GitHub issues, labels, or project-board fields as PM state.

---

## Concrete Local Commands

```bash
# Board and standup from Maestro chat
/PM status
/PM standup
/PM next

# Item detail and local Work Graph sync from Maestro chat
/PM epic-list
/PM epic-show <id>
/PM issue-show <id>
/PM issue-status <id>
/PM epic-sync <id>
/PM issue-sync <id>
/PM issue-start <id>

# Shell Work Graph item creation/update
{{MAESTRO_CLI_PATH}} pm work create --project <path> --kind prd --title "<PRD title>" --json
{{MAESTRO_CLI_PATH}} pm work create --project <path> --kind epic --parent <prdId> --title "<Epic title>" --json
{{MAESTRO_CLI_PATH}} pm work create --project <path> --kind task --parent <epicId> --title "<Task title>" --json
{{MAESTRO_CLI_PATH}} pm work update <workItemId> --status in_progress --json

# Shell dispatch inspection/repair
{{MAESTRO_CLI_PATH}} fleet board --project <path> --json
{{MAESTRO_CLI_PATH}} fleet list --json
{{MAESTRO_CLI_PATH}} fleet claim <workItemId> --to <fleetEntryId> --json
{{MAESTRO_CLI_PATH}} fleet release <workItemId> --json
```
