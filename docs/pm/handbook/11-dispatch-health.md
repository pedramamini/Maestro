# 11 — Dispatch Health Check

When the user asks `/PM check health`, `/PM dispatch status`, or anything about runners being stuck, follow this playbook.

> **What you can and cannot see from PM mode**
>
> The PM agent runs inside whichever runner/cwd is hosting the conversation — typically NOT on the maestro main server. That means:
>
> - **You CAN** query Maestro Board / Work Graph state with `/PM status`, `/PM standup`, PM audit/health, or `{{MAESTRO_CLI_PATH}} fleet board --project <path> --json` when available
> - **You CAN** check whether processes on **the same host you're on** are alive (`ps aux | grep`)
> - **You CANNOT** introspect the maestro headless service, the dispatch poller, the in-memory ClaimTracker, or the renderer's claim map
> - **You CANNOT** SSH into the maestro host unless the user explicitly grants you that access
>
> Maestro Board / Work Graph is the source of truth for dispatch state by design. If local status, claims, and heartbeat state look healthy, dispatch is healthy. If they look stale, run or ask the user to run the PM audit/health action; don't use GitHub Projects as the authority.

## What can go wrong

| Symptom                                       | Likely cause                                                          | Fix                                                                      |
| --------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Item stuck in `in_progress` for >30 min       | Runner exited but main process missed the exit event (orphaned claim) | Run PM audit/health to release stale Work Graph claim                    |
| Active claim but item is `ready`              | Partial local transition or stale cache                               | Release claim or move item back to `claimed`/`in_progress`               |
| Claim heartbeat older than 5 min              | Runner agent died silently                                            | Stale-claim sweeper should catch it; if not, manually release            |
| Multiple items claimed by same slot agent     | Concurrent ticks, race condition                                      | Release all but the oldest, let runner finish                            |
| Runner spawn never logs "Found eligible item" | No local `ready` items, slot disabled, or role mismatch               | Check Maestro Board status/role and slot config                          |
| Sidebar role icon doesn't flash               | Renderer attached after `claimStarted` fired                          | Reload window, or wait for next poller tick to rehydrate from Work Graph |

## Health-check sequence

### 1. List all in-flight claims for the active project

Use the PM audit/health action or Maestro Board view to list active Work Graph claims. Report item title, Work Graph ID, assigned slot, role, and last heartbeat.

### 2. Detect stale claims (heartbeat >5 min old)

Run PM audit/health. Stale claims are claims whose heartbeat or lease has exceeded the configured threshold, normally 5 minutes.

### 3. Process-liveness check (only if you're on the right host)

If you happen to be running on the same host as the runner agent (e.g. the user is talking to a runner on the project's remote host), you can do:

```bash
ps aux | grep -E "codex|claude|opencode" | grep -v grep
```

If you're NOT on that host, **don't speculate**. Tell the user the local PM state (heartbeat fresh / stale) and let them ssh into wherever the runner lives if they want a process-level check. Do not assume `ssh <host>` works from your shell — the PM agent rarely has the right keys.

### 4. Release a stuck claim manually

Use PM audit/health auto-fix when possible. Manual repair is: release the Work Graph claim and set the Work Graph item status back to `ready`, with a note explaining why.

### 5. Bulk health snapshot (one-liner)

For a quick "everything looks ok" check across configured projects, group Maestro Board items by Work Graph status and list stale claims per project.

## Local-vs-remote dispatch model

A common confusion: where does the runner actually run?

- **Maestro headless** (the dispatch poller, claim writer, IPC bus) runs on the **maestro main server** — only that host has the in-memory ClaimTracker, the IPC routes, and the renderer's role-icon state.
- **The runner agent** (Claude Code, Codex, etc.) spawns where the project source lives:
  - Project bound to a remote host via `sshRemoteConfig.enabled=true` → runner spawns on that remote host via `wrapSpawnWithSsh`
  - Project on a local path with no SSH config → runner spawns locally on the maestro host
- The runner has access to the project source. It does NOT have access to maestro's internals — only what GitHub exposes.

If the slot agent for runner is mis-configured (wrong host), the runner can't see the code and will fail fast with `Agent exited with code 255`. Fix: in the **Roles** tab on the maestro app, pick a slot agent whose `cwd` matches the project path on the right host.

### What this means for "check the dispatch end-to-end"

A PM agent reading this handbook from a runner on a remote host **cannot** verify the maestro main server is up, the poller is ticking, or the IPC bus is alive. The contract is: Maestro Board / Work Graph is the source of truth, and the maestro main server is responsible for keeping local claims, heartbeats, and board state current. If Work Graph claim/status state looks healthy, dispatch is healthy. If you suspect maestro itself is wedged, that's a question for the user to answer from their own shell on the maestro host (e.g. `systemctl status maestro-headless`); don't try to answer it from PM mode.

## Handoff actions you can offer the user

When the user asks "anything stuck?" follow steps 1+2 above and present:

1. Number of items currently claimed (with their Work Graph item IDs and slot IDs)
2. Any stale claims (heartbeat older than 5 min)
3. Concrete local PM audit/health action to release each stale claim after confirmation
4. If everything's healthy: "All clear — N items in flight, heartbeats fresh."

Never auto-release without confirmation. Releasing destroys in-flight work if the runner is just slow.
