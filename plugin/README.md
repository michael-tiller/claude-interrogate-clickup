# claude-interrogate-clickup plugin

A Claude Code companion to [claude-interrogate](https://github.com/michael-tiller/claude-interrogate) that mirrors taskout RC checklists into ClickUp. Markdown is canonical; ClickUp is the mirror.

Requires claude-interrogate >= 0.1.8.

## Commands

- `/clickup-setup` — interactive settings + CLAUDE.md workflow block
- `/clickup-push <rc-id>` — initial RC mirror to ClickUp
- `/clickup-sync [rc-id]` — re-sync checkbox state and drain pending ops
- `/clickup-status [--verify]` — call-budget report, zero ClickUp calls by default

## Setup

Install the plugin, then `/mcp` to OAuth into ClickUp via the bundled remote server.