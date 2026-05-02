> **State source-of-truth**: This project uses Maestro Board/Work Graph for all PM and dispatch state. Do NOT use GitHub labels or GitHub Projects fields as runtime state. Query and update state through Maestro PM IPC/commands such as `pm:setStatus`.

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
