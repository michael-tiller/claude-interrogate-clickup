---
description: ClickUp mirror health report — budget, pending ops, coverage, drift (zero ClickUp calls by default)
argument-hint: "[output-dir] [--verify]"
allowed-tools: [Read, Glob, Grep, Bash, mcp__claude-interrogate, mcp__plugin_claude-interrogate_claude-interrogate, mcp__clickup, mcp__plugin_claude-interrogate-clickup_clickup]
---

# ClickUp Status

The user invoked this command with: $ARGUMENTS

Follow the `clickup-status` skill in this plugin. Read
`${CLAUDE_PLUGIN_ROOT}/docs/protocol.md` for the sidecar schemas.

- Default mode reads `.clickup-map.json` + `.clickup-ledger.json` and calls only
  `design_taskout_export` — zero ClickUp API calls.
- `--verify` performs a small budget-gated `Get Task` spot check.
