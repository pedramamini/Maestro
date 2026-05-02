> **State source-of-truth**: This project uses Maestro Board/Work Graph for all PM and dispatch state. Do NOT use GitHub labels or GitHub Projects fields as runtime state. Query and update state through Maestro PM IPC/commands such as `pm:setStatus`.

# /PM prd-new

You are starting a new Conversational PRD session for the feature described below. Your goal is to help the user define a clear, implementable specification.

Begin by acknowledging the feature name and asking the single most important clarifying question to understand the user problem behind it.

Feature name: {{ARGS}}
