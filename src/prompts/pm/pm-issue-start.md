> **State source-of-truth**: Work Graph is the canonical PM data model; Maestro Board is the UI for that data. Use concrete local actions such as `/PM status`, `/PM prd-list`, `/PM epic-list`, `/PM issue-show <id>`, `/PM issue-status <id>`, `/PM epic-sync <id>`, `/PM issue-sync <id>`, `/PM issue-start <id>`, or the app IPC channels listed in `pm-mode-system.md`. Shell agents can inspect dispatch with `{{MAESTRO_CLI_PATH}} fleet board --project <path> --json` and `{{MAESTRO_CLI_PATH}} fleet list --json`. Shell agents must create or update board items with `{{MAESTRO_CLI_PATH}} pm work ...`; if that bridge is unavailable, stop and report the blocker instead of creating markdown-only work. Do NOT use GitHub labels, GitHub issues, or GitHub Projects fields as runtime PM state.

# /PM issue-start

Manually claim a task for an agent via Agent Dispatch.

Task ID: {{ARGS}}

## What this does

Bypasses the automatic pickup queue and directly assigns this task to an agent.
This is useful when you want to:

- Start a specific high-priority task immediately
- Assign work to a particular agent with the right context
- Resume a task that was accidentally released

## Pre-claim check

Before claiming, confirm:

- The task is in `ready` or `planned` status (not already `in_progress` or `done`)
- The target agent is currently idle
- No other agent has an active claim on this task

## Claiming process

1. Open Agent Dispatch to show available agents
2. Display the task title and description so you can pick the right agent
3. Confirm the assignment
4. Update the task status to `in_progress` in the Work Graph

## After claiming

- The task appears in the agent's active work list
- A claim heartbeat will keep it alive every 60 seconds
- Use `/PM issue-status {{ARGS}}` to monitor progress
- Use `/PM issue-show {{ARGS}}` for full task detail

If the task is already claimed, show who has it and offer to force-release (with a warning).
