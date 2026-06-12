# ADR 0001 — Force the ClickUp call ledger with a plugin PreToolUse hook

- **Status:** Accepted (2026-06-12)
- **Deciders:** Michael Tiller

## Context

The ClickUp MCP server allows ~300 calls per rolling 24h. The protocol mandates a
ledger entry after *every* call and a budget gate that queues overflow to `pendingOps`.
Until now both were **skill discipline** — the model was instructed to append and to
estimate the plan before spending. That is exactly the deterministic accounting that
should be code, not judgment (project Rule 5): a forgetful or interrupted run silently
skips the ledger, corrupting the rolling count for every machine sharing the budget.

The ClickUp server is a **remote HTTP MCP server** (`https://mcp.clickup.com/mcp`), so
wrapping it in a local proxy that ledgers each call is not practical to own.

## Decision

Ship a **PreToolUse hook** in the plugin (`plugin/hooks/hooks.json`) matched to the
ClickUp tool namespace `mcp__plugin_claude-interrogate-clickup_clickup__.*`. It runs
`plugin/lib/clickup-ledger-hook.mjs` before every ClickUp call and:

1. Prunes ledger entries older than 25h.
2. **Gates:** if `calls.length >= budget - reserve`, denies the call
   (`permissionDecision: "deny"`) so the skill must queue to `pendingOps`.
3. Otherwise **appends** `{ at, tool }` and allows the call.

PreToolUse (not PostToolUse) is deliberate: appending the *attempt* also captures calls
that fail (429s) or are denied downstream. Over-counting is budget-safe; under-counting
is not. The hook is **fail-open** — any unexpected error allows the call and logs to
stderr, because a crashing gate must never brick the mirror.

Enforcement lives in the plugin, so enabling the plugin enables enforcement — no
per-project `settings.json` wiring. The skills keep doing plan-level estimation; the
hook is the backstop that makes "every call is ledgered" true rather than aspirational.

## Consequences

- The ledger is now trustworthy without depending on the model remembering to write it;
  skill prose about ledgering describes what the hook guarantees.
- Reads (`Get Task`, list reads, `Get Custom Fields`, searches), writes, and
  `post-comment` calls all ledger uniformly — they all cross the same hook.
- A spent budget hard-stops *every* ClickUp call, including reads. That is intended: out
  of calls means out of calls. The skill reacts by queueing to `pendingOps`.
- The hook trusts the call's `cwd` to locate `<cwd>/.captain-sdlc/.clickup-ledger.json`
  (legacy root fallback). A call issued from outside the project would ledger in the
  wrong place — acceptable, as the mirror skills always run from the project root.
- The append path is covered by `clickup-ledger-hook.test.mjs`. The **deny path uses
  Claude Code's structured `permissionDecision` output** and should be smoke-tested live
  once against a real over-budget ledger to confirm the harness blocks as expected.
- Pre-existing ledgers are compatible: missing `budget`/`reserve` fall back to 300/30.
