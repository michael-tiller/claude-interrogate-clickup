---
description: Re-sync taskout checkbox state into mapped ClickUp tasks and drain the pending-ops queue
argument-hint: "[rc-id] [output-dir]"
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash, mcp__claude-interrogate, mcp__plugin_claude-interrogate_claude-interrogate, mcp__clickup, mcp__plugin_claude-interrogate-clickup_clickup]
---

# ClickUp Sync

The user invoked this command with: $ARGUMENTS

Follow the `clickup-sync` skill in this plugin. Read
`${CLAUDE_PLUGIN_ROOT}/docs/protocol.md` first — it is the binding contract.

- Optional first argument: a single RC id; omitted → sync every mapped RC.
- Optional second argument: output directory (default: current working directory).
- Drain `pendingOps` before new work. Never delete ClickUp tasks — removals close in
  place and mappings flip to `retired`.
