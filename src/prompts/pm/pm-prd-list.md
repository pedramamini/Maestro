> **State source-of-truth**: This project uses Maestro Board/Work Graph for all PM and dispatch state. Do NOT use GitHub labels or GitHub Projects fields as runtime state. Query and update state through Maestro PM IPC/commands such as `pm:setStatus`.

# /PM prd-list

List all PRDs for the current project.

Format the output as a markdown table with columns: Title | Status | Created.
Sort by creation date descending (newest first).
If there are no PRDs, say so clearly and offer to create one with `/PM prd-new <name>`.
