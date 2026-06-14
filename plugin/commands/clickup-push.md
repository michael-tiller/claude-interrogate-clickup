---
description: Initial push of a taskout RC into ClickUp — Folder, List (or existing sprint) = Epic, Story parents, and Task subtasks
argument-hint: "<rc-id> [output-dir]"
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash, mcp__claude-interrogate, mcp__plugin_claude-interrogate_claude-interrogate, mcp__clickup, mcp__plugin_claude-interrogate-clickup_clickup]
---

# ClickUp Push

The user invoked this command with: $ARGUMENTS

Follow the `clickup-push` skill in this plugin. Read
`${CLAUDE_PLUGIN_ROOT}/docs/protocol.md` first — it is the binding contract for
sidecar schemas, the 300-calls/24h budget discipline, single-call create discipline,
idempotent crash recovery, and the no-delete rule.

- First argument: RC id (`M8_QUESTS` / `MRC1_LAUNCH` style). Required — if missing,
  list RC ids from the sidecar and `roadmap.md` and ask.
- Second argument: output directory (default: current working directory).
- If the RC is already mapped in `.clickup-map.json`, this is a sync — run the
  clickup-sync flow instead and tell the user.
