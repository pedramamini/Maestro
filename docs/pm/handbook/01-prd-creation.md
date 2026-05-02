# 01 — PRD Creation

A PRD (Product Requirements Document) captures the _what_ and _why_ before any code is written. In Maestro's pipeline, the PRD markdown file is the readable spec and the Work Graph item is the canonical PM record. Maestro Board is the UI for that Work Graph item and tracks its lifecycle.

---

## Trigger

The user says any of: "plan X", "I want to build X", "create a PRD for X", "let's scope out X", "new feature: X".

---

## Preflight Checks

1. Verify local PM is initialized. If not: "Maestro Board is not initialized for this project. Run `/PM-init` first, then come back."
2. PM planning and dispatch do not require GitHub auth, GitHub issues, or GitHub project-board access.
3. Check if `docs/pm/prds/<slug>.md` already exists. If yes: "PRD `<slug>` already exists. Do you want to edit it instead?"
4. Ensure `docs/pm/prds/` directory exists. Create it if not: `mkdir -p docs/pm/prds/`.

---

## The Interview Process

Conduct a genuine brainstorming session. Ask **one question at a time**. Do not front-load all questions in one message. Wait for the answer before asking the next question.

### Required questions (in order)

1. **Problem**: What problem does this solve? Who is affected?
2. **Users**: Who are the target users? (internal team, end users, specific roles?)
3. **Success**: What does success look like at launch? Make it measurable.
4. **Scope**: What's explicitly included? What's explicitly out of scope?
5. **Constraints**: Technology constraints, deployment requirements, timeline pressure?
6. **Dependencies**: What other systems, teams, or epics does this depend on?

### When to stop asking

Stop when you can fill every section of the PRD template without placeholder text. This usually takes 4–6 exchanges. If the user gives rich answers that cover multiple questions, adapt — don't robotically ask questions they've already answered.

### Feature name / slug

Derive the slug from the feature name: lowercase, kebab-case, letters/numbers/hyphens, starts with a letter.

Examples:

- "OAuth2 Login" → `oauth2-login`
- "User Profile Editing" → `user-profile-editing`
- "Fix payment retry bug" → `payment-retry-fix`

---

## PRD Output Template

Write to `docs/pm/prds/<slug>.md`:

```markdown
---
name: <slug>
description: <one-line summary — used in lists>
status: prd-draft
created: <ISO-8601 from: date -u +"%Y-%m-%dT%H:%M:%SZ">
---

# PRD: <Feature Name>

## Executive Summary

<2–3 sentences: what is being built, why, for whom>

## Problem Statement

<The concrete problem being solved. Specific, not vague.>

## User Stories

- As a <user type>, I want to <action> so that <outcome>.
  Acceptance: <measurable acceptance criterion>

(add more user stories as needed)

## Functional Requirements

1. <Specific requirement — include acceptance criteria inline>
2. <...>

## Non-Functional Requirements

- Performance: <e.g., "operation completes in <2s at p95">
- Security: <e.g., "credentials never logged, tokens stored in httpOnly cookies">
- Reliability: <e.g., "degrades gracefully if OAuth provider is unavailable">

## Success Criteria

- [ ] <Measurable criterion — testable in staging>
- [ ] <...>

## Constraints & Assumptions

- <Technology constraint (e.g., "must use existing Passport.js setup")>
- <Explicit assumption (e.g., "users already have Google accounts")>

## Out of Scope

- <Explicit exclusion 1>
- <Explicit exclusion 2>
  (if truly nothing is out of scope for this iteration, write "None declared for v1.")

## Dependencies

- <External system or service (e.g., Google OAuth2 API)>
- <Other epic this depends on (e.g., "User model must exist — see user-model PRD")>
```

### Quality gates — do not save until all pass

- [ ] No section is empty or contains placeholder text
- [ ] Every user story has an acceptance criterion
- [ ] Success criteria are measurable (can be verified by a human or automated test)
- [ ] Out of Scope is explicitly listed
- [ ] Feature name is valid kebab-case slug

---

## Creating the Work Graph Item

After writing the file, create or update the local Work Graph item and set its initial state. Do not stop after creating markdown.

Use the concrete local PM surface available in your context: `/PM prd-new <slug>` / `/PM prd-status <id>` in Maestro chat, the Conversational PRD "Commit to Work Graph" flow, or the app IPC path that creates the Delivery Planner PRD item. Set status to `planned` until the epic decomposition is ready.

### After creation

Confirm to the user:

- "PRD written to `docs/pm/prds/<slug>.md`."
- "Maestro Board item created with status=planned."
- "Ready to decompose? Say: `decompose <slug>`."

---

## Status Transitions for PRD Items

| Trigger                           | Work Graph status |
| --------------------------------- | ----------------- |
| PRD file written + item created   | `planned`         |
| User finishes reviewing PRD       | `planned`         |
| Epic decomposition confirmed      | `ready`           |
| Something blocking PRD completion | `blocked`         |

---

## Editing an Existing PRD

When the user asks to edit a PRD:

1. Read `docs/pm/prds/<slug>.md`.
2. Ask what they want to change (one question at a time).
3. Apply targeted edits — preserve all frontmatter.
4. Update `updated: <ISO-8601>` in frontmatter.
5. If the PRD is already in Refinement or Tasks Ready, warn: "This PRD has already been decomposed. Editing it now may require updating tasks. Proceed?"

---

## File Location Reference

| Artifact       | Path                                     |
| -------------- | ---------------------------------------- |
| PRD file       | `docs/pm/prds/<slug>.md`                 |
| Epic file      | `docs/pm/epics/<slug>/epic.md`           |
| Task file      | `docs/pm/epics/<slug>/<N>.md` (numbered) |
| PM board state | Maestro Board / Work Graph               |
