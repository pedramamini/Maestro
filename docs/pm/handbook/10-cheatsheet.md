# 10 — PM Cheatsheet

Use Maestro Board / Work Graph for PM state. Use git hosting only for branches, commits, PRs, reviews, and merges.

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

Do not use external project-board fields as PM state.
