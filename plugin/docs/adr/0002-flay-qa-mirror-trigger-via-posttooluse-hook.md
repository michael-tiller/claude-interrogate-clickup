# ADR 0002 — Trigger flay/qa mirror transitions with a PostToolUse hook

- **Status:** Accepted (2026-06-21)
- **Deciders:** Michael Tiller

## Context

The mirror knows how to move a ticket through its lifecycle inside `clickup-sync` — to
in-progress (with a stopwatch) when a flay is live, and to Done when the work completes —
but `clickup-sync` is **pull-based**: nothing runs it during a flay or a qa pass, so a
ticket sat at TODO with no timer for the whole flay (observed live in dirigible2D:
everything mapped and `statusMap` complete, yet `derivedStatus`/`startedAt` null because
no sync ran), and a passing qa left the ticket stuck at Review.

flay and qa must not call the tracker — that decoupling ("never calls a tracker";
markdown is canonical, ClickUp is a mirror) is deliberate. So neither can hardcode a
`clickup-sync` handoff. We need the *clickup plugin* to react to the lifecycle, owned
entirely on the clickup side.

## Decision

The lifecycle skill fires a hook; the plugin tied to the hook drives the tracker. Ship a
**PostToolUse hook** matched to `Write|Edit` that runs `lib/clickup-lifecycle-hook.mjs`.
The script classifies the write and nudges `/clickup-sync <rc>` on two events:

- **flay begin** — a write to `.captain-sdlc/flay-state.json` for a mapped task not yet
  in-progress → flip to in-progress + START its stopwatch.
- **qa pass** — a `.captain-sdlc/qa/<key>/verdict.json` with `result: "pass"` for a
  mapped task not yet complete → move QA/Review → Done + STOP its stopwatch.

It fast-exits unless the path is one of those two; no-ops unless the sidecar has
`enabled` AND `trackTime`; and is idempotent (skips once the task already shows the
target `derivedStatus` — `in-progress` / `complete`), so flay's per-phase state rewrites
and a lingering verdict file fire the nudge once, not repeatedly.

The hook is the **trigger**, not the caller: the real ClickUp work stays in
`clickup-sync`, so it remains budget-ledgered (ADR 0001) and protocol-bound. flay/qa
write their state; the clickup plugin owns both the hook and the skill it nudges. Gated
by the opt-in `trackTime` key — a project that has not opted in pays nothing and keeps
today's manual-sync behavior.

## Consequences

- A flayed ticket flips to in-progress with its stopwatch running in real time, and a
  passing qa moves it to Done with the stopwatch stopped (logging actual time taken) —
  all with no change to flay or qa and no `clickup-sync` reference in the interrogate
  plugin.
- **Cost:** unlike ADR 0001's hook (scoped to the rare ClickUp tool namespace), this one
  matches `Write|Edit`, so the node script starts on *every* file write in any session
  where the plugin is installed. It is built to exit in a few statements for the common
  (non-lifecycle) case; the per-edit cost is node startup. Accepted as the price of
  flay/qa never importing tracker logic.
- **Soft trigger:** `additionalContext` nudges the model; it is not a guaranteed call.
  Reliable enough for an explicit instruction, and fail-safe — a missed nudge just leaves
  the ticket to the next manual sync, exactly as before.
- The qa-pass → Done flip is a **second** sanctioned complete-emitter alongside the
  `[x]` checked-flip path; both guard on `derivedStatus` so they never double-write. The
  canonical `[x]` still lands via the Seam 7 release pass.
- Pure helpers (`classify`, `mapPath`, `decideFlay`, `decideQa`) are covered by
  `clickup-lifecycle-hook.test.mjs`; the nudge path is fail-open like the ledger hook.
