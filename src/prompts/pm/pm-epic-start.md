> **State source-of-truth**: Work Graph is the canonical PM data model; Maestro Board is the UI for that data. Use concrete local actions such as `/PM status`, `/PM prd-list`, `/PM epic-list`, `/PM issue-show <id>`, `/PM issue-status <id>`, `/PM epic-sync <id>`, `/PM issue-sync <id>`, `/PM issue-start <id>`, or the app IPC channels listed in `pm-mode-system.md`. Shell agents can inspect dispatch with `{{MAESTRO_CLI_PATH}} fleet board --project <path> --json` and `{{MAESTRO_CLI_PATH}} fleet list --json`. Shell agents must create or update board items with `{{MAESTRO_CLI_PATH}} pm work ...`; if that bridge is unavailable, stop and report the blocker instead of creating markdown-only work. Do NOT use GitHub labels, GitHub issues, or GitHub Projects fields as runtime PM state.

# /PM epic-start

Kick the Planning Pipeline for an epic, routing its tasks through the agent fleet.

Epic ID: {{ARGS}}

## What this does

Triggers the Planning Pipeline to:

1. Validate that the epic's tasks are in `ready` or `planned` status
2. Assign roles (`runner`, `fixer`, `reviewer`, `merger`) to tasks based on their pipeline state
3. Make eligible tasks available for agent auto-pickup via the Agent Dispatch engine
4. Set up the pipeline monitoring so blocked tasks surface automatically

## Pre-start checklist

Verify before starting:

- [ ] The epic has at least one task in `ready` status
- [ ] Work Graph / local mirror state is current (run `/PM epic-sync {{ARGS}}` first if unsure)
- [ ] The agent fleet has at least one idle `runner` available

## Pipeline behavior

- Tasks with no dependencies are immediately eligible for pickup
- Dependent tasks unlock automatically when their prerequisites reach `done`
- Blocked tasks notify the team via toast notification
- The pipeline self-heals: if an agent goes idle mid-task, the task returns to `ready`

## After starting

Show the pipeline status:

- Total tasks | Ready | In Progress | Blocked | Done
- Estimated completion range based on task sizes

Suggest `/PM epic-show {{ARGS}}` to monitor progress.
