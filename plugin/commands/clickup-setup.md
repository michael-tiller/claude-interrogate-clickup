---
description: Interactive settings for the ClickUp mirror — sidecar config, budget knobs, status maps, and the CLAUDE.md workflow block
argument-hint: "[output-dir]"
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash, mcp__claude-interrogate, mcp__plugin_claude-interrogate_claude-interrogate, mcp__clickup, mcp__plugin_claude-interrogate-clickup_clickup]
---

# ClickUp Setup

The user invoked this command with: $ARGUMENTS

Follow the `clickup-setup` skill in this plugin. Read
`${CLAUDE_PLUGIN_ROOT}/docs/protocol.md` first.

- Zero ClickUp calls except explicit Folder/List lookups (budget-gated).
- The CLAUDE.md block is marker-managed and idempotent — never touch content
  outside the markers.
