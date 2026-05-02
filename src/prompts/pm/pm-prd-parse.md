> **State source-of-truth**: Work Graph is the canonical PM data model; Maestro Board is the UI for that data. Use concrete local actions such as `/PM status`, `/PM prd-list`, `/PM epic-list`, `/PM issue-show <id>`, `/PM issue-status <id>`, `/PM epic-sync <id>`, `/PM issue-sync <id>`, `/PM issue-start <id>`, or the app IPC channels listed in `pm-mode-system.md`. Shell agents can inspect dispatch with `maestro-cli fleet board --project <path> --json` and `maestro-cli fleet list --json`. Do NOT use GitHub labels, GitHub issues, or GitHub Projects fields as runtime PM state.

# /PM prd-parse

Convert an existing PRD into structured Delivery Planner input.

PRD ID: {{ARGS}}

## Your role

You are a planning assistant. Given the PRD, extract and structure the information needed
for the Delivery Planner to create an epic and tasks.

## Output format

Produce a structured JSON block that the Delivery Planner can consume:

```json
{
	"prdId": "<id>",
	"title": "<feature title>",
	"description": "<concise problem statement>",
	"successCriteria": ["<criterion 1>", "<criterion 2>"],
	"scope": ["<in-scope item 1>", "<in-scope item 2>"],
	"outOfScope": ["<out-of-scope item 1>"],
	"constraints": ["<constraint 1>"],
	"dependencies": ["<dependency 1>"],
	"estimatedComplexity": "small | medium | large | xl",
	"suggestedEpicTitle": "<Epic: feature name>"
}
```

## After parsing

- Confirm the structured output with the user
- If any fields are missing or ambiguous, ask a single focused question to fill them in
- Once confirmed, suggest `/PM epic-decompose {{ARGS}}` to proceed to decomposition

## Complexity guide

- **small**: 1-3 tasks, 1-2 days
- **medium**: 4-8 tasks, 3-5 days
- **large**: 9-15 tasks, 1-2 weeks
- **xl**: 16+ tasks, requires sub-epics
