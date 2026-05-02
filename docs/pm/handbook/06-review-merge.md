# 06 — Review & Merge

After the runner completes work, the delivery pipeline moves through review and merge. GitHub is used for PR mechanics; Maestro Board / Work Graph remains the PM source of truth.

---

## Trigger

The review phase starts when:

- the runner opens a PR and records the Work Graph item ID in the PR body
- the Work Graph item moves to `review`
- the reviewer slot is configured and enabled

---

## Status Flow

```
in_progress
  -> review
  -> done
```

If review fails, move the item back to `in_progress` or `blocked` with a Work Graph event explaining why.

---

## PR Traceability

Every PR should include the Work Graph/Maestro item ID. External tracker references are optional and only used when they already exist.

Example PR body line:

```text
Maestro: <workItemId>
```

---

## Merge

Before merge:

1. Verify the PR is approved and checks pass.
2. Verify the PR references the Work Graph item ID.
3. Merge using the normal git hosting flow.
4. Mark the Work Graph item `done`.
5. If all sibling tasks are `done`, mark the parent epic `done`.
