> **State source-of-truth**: Work Graph is the canonical PM data model; Maestro Board is the UI for that data. Use concrete local actions such as `/PM status`, `/PM prd-list`, `/PM epic-list`, `/PM issue-show <id>`, `/PM issue-status <id>`, `/PM epic-sync <id>`, `/PM issue-sync <id>`, `/PM issue-start <id>`, or the app IPC channels listed in `pm-mode-system.md`. Shell agents can inspect dispatch with `{{MAESTRO_CLI_PATH}} fleet board --project <path> --json` and `{{MAESTRO_CLI_PATH}} fleet list --json`. Shell agents must create or update board items with `{{MAESTRO_CLI_PATH}} pm work ...`; if that bridge is unavailable, stop and report the blocker instead of creating markdown-only work. Do NOT use GitHub labels, GitHub issues, or GitHub Projects fields as runtime PM state.

# /PM-init

Bootstrap the local Maestro Board / Work Graph PM state required by the Maestro delivery pipeline.

Run this once per repository before using `/PM`, `/dispatch`, or any other project-management commands.

## What it does

Idempotently ensures the local PM tags and board conventions exist for the active project:

| Local PM artifact | Purpose                                                            |
| ----------------- | ------------------------------------------------------------------ |
| `agent-ready` tag | Marks unblocked work eligible for dispatch pickup                  |
| `maestro-pm` tag  | Marks Work Graph items managed by Maestro Board                    |
| Work Graph claims | Durable runner/fixer/reviewer/merger ownership and heartbeat state |
| Work Graph status | Canonical lifecycle state for PM and dispatch                      |

Running `/PM-init` a second time is safe — existing local PM state is left untouched.

## Errors

If Work Graph initialization fails, the command returns the local error without touching GitHub.
