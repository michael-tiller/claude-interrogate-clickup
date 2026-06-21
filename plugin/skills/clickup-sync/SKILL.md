---
name: clickup-sync
description: Re-sync taskout RC checkbox state into already-mapped ClickUp tasks and drain the pending-ops queue. Use when the user asks to sync ClickUp, OR proactively after a taskout maintenance run in a project whose .clickup-map.json has enabled true and the RC is already mapped.
---

# ClickUp Sync (re-mirror mapped RCs)

FIRST: Read `${CLAUDE_PLUGIN_ROOT}/docs/protocol.md`. It is the binding contract.

Arguments: `[rc-id] [output-dir]`. No rc-id → sync every RC under `rcs` in the
sidecar. Output dir defaults to the current working directory.

## Steps

1. **Gate.** Load `.clickup-map.json` from `<output-dir>/.captain-sdlc/` (legacy
   fallback: the output-dir root). Missing or `enabled: false` → report disabled, stop.
   RC named but not mapped → that's a push job; run the clickup-push flow and say so.
2. **Drain pendingOps first.** Oldest first, budget-gated per protocol. Re-export the
   affected RC before executing each op (ops store keys, not text). Remove an op only
   after its call succeeds. An `update-spec` op (or a legacy `post-comment` op from an
   older queue) writes a verification artifact into the task's description
   (protocol § Verification in the task body).
3. **Per RC: export and diff.** Call `design_taskout_export`; key-diff against sidecar
   `items`:
   - **New keys** → one `Create Task` per key under the mapped story, carrying FULL
     detail in that single call (status, `interrogate-key` field + footer, description =
     item text + the item's per-item DOD from the export when present, and the planning
     fields inline — clickup-push step 9). No bulk endpoint exists; never
     bare-create-then-enrich (protocol § Single-call create discipline). New subsection
     → create its story first (`task_type: Story` when available). Reconciliation read
     before any create batch (protocol §
     Idempotency).
   - **`checked` changed** → group all flips by target status; one bulk-status-update
     per status group.
   - **Planning fields** (protocol § `items[key].fields`). New keys get their estimates
     at create (clickup-push step 8 — proposed + set inline). An active item with NO
     `fields` block (e.g. a pre-enrichment backfill) → propose its estimate (model
     guesses Priority / Time / Token Budget / Discipline from the item text, user
     confirms), then set `priority` + `time_estimate` + Token Budget/Discipline
     `custom_fields` (option UUIDs via `fieldIds`) — folded into this run's `update_task`
     when a status flip already touches the task, else +1 `update_task` (estimated up
     front, budget-gated). Items that already have a `fields` block are STICKY — never
     re-proposed or re-pushed. To re-estimate one, delete its `fields` block in the
     sidecar; the next sync re-proposes it. A planning custom field absent on the list →
     omit it and suggest the user add it via the ClickUp web UI (protocol § `fieldIds` —
     portability; never block).
   - **Key gone but `state: "active"`** → close in place (one bulk-status-update with
     the `closed` status), flip mapping to `"retired"`. NEVER delete.
   - **Verification → task body.** Any key moved to its `qa` / complete / `blocked`
     status this run — here, via a drained op in step 2, or a derived qa flip in
     step 6 — and holding a
     `.captain-sdlc/verifications/<key>.md` artifact → write the artifact into the
     task's DESCRIPTION, never a comment (comments scroll away; DOD/QA specs must stay
     visible): with `taskSpecs: true` it feeds the spec-block write below (same Get+
     Update, zero extra calls); otherwise it lands as a standalone
     `**Verification** _(spec v1)_` section above the key footer. Delete the artifact
     only after the `Update Task` succeeds (protocol § Verification in the task body).
     Overflow → an `update-spec` op.
   - **Per-task spec blocks** (only if sidecar `taskSpecs: true`). Spec work piggybacks
     on flips written this run (protocol § Per-task spec blocks): a key flipped to
     in-progress → draft/review its **Definition of Done**; flipped to qa/complete →
     write **Automated coverage** + **Human QA steps** (sourced verification-artifact →
     RC DoD → item text) and review the DOD. Renovate whatever the description holds
     into the current `spec v1` shape — carry prior content forward, never discard;
     preserve the `interrogate-key` footer exactly. A warm-created task already carries
     **How to implement** / **Design context** from taskout — carry those two sections
     forward verbatim; a flip only drafts/renovates the verification sections, never
     re-derives the taskout-authored implementation spec. 1 `Get Task` + 1 `Update Task` per
     touched task, ledgered and estimated up front; overflow → an `update-spec` op.
     Unattended runs: skip the in-progress write, batch all drafting at the end flip
     tagged `_(auto-drafted — review)_`.
4. **Rename heuristic.** If one subsection shows both removals AND additions in the
   same run, list the pairs and ask: "renamed (remap key → existing task, 0 calls) or
   genuinely replaced (close + create)?" before spending any calls. A remap updates
   the sidecar key and the task's footer is left stale — note it for the next created
   task description, never spend a call just to rewrite a footer.
5. **Flay & QA awareness.** If `.captain-sdlc/flay-state.json` exists and is live (not
   phase `done`), and the active task's RC is mapped with `statusMap.inProgress`
   set: queue one `bulk-status-update` op moving its mirrored task to in-progress AND
   setting its `start_date` to today (same update, zero extra calls); record
   `items[key].fields.startedAt` — set-once, never overwrite an existing `startedAt`
   so re-flaying keeps the original start (protocol § Flay awareness). Absent statusMap
   key → skip silently.

   **Stopwatch (opt-in `trackTime: true`; skip this paragraph entirely when off).**
   Independent of the status flip — the timer needs only the `taskId`:
   - **START** — a live flay names this mapped task and no top-level `activeTimer`
     already covers it → `start_time_tracking` its `taskId`, record
     `activeTimer = { rcId, key, taskId, entryId, startedAt }`. Idempotent: an
     `activeTimer` already on this task = already running → do nothing.
   - **STOP** — `activeTimer` is set and its task is no longer being timed: it reached
     its terminal complete status this run (the `[x]`/`Completes:` flip from step 3 /
     step 6) OR its flay-state is gone and it is no longer in-progress (abandoned) →
     `stop_time_tracking`, then clear `activeTimer`. A `qa` flip does NOT stop it — the
     stopwatch runs until Completes (logs actual time taken).
   Each start/stop is one ledgered, budget-gated call; best-effort — over budget or on a
   tool error, SKIP (never queue a stale timer op, never block the sync); time-tracking
   tools unavailable → degrade-and-skip (protocol § Flay awareness — stopwatch).

   **QA completion (opt-in `trackTime: true`; advisory, same standing as flay-state).**
   A mapped key with a passing verdict at `.captain-sdlc/qa/<key>/verdict.json`
   (`result: "pass"`) → move it from its `qa`/review status to `statusMap.done`
   (Closed/Done) and STOP its stopwatch (clear `activeTimer`). Set
   `derivedStatus: complete`; idempotent — skip when already complete. A second
   sanctioned complete-emitter alongside the step-3 `[x]` checked-flip path (both guard
   on `derivedStatus`, so no double-write); the canonical `[x]` still lands via the
   Seam 7 release pass. Any verification artifact for the key → write it to the body
   (step 3 / § Verification).
6. **Derived lifecycle.** Mirror INTERMEDIATE states (in-progress / qa) from Seam 7
   footers by CONSUMING the existing engine — never add a footer parser
   (protocol § Derived lifecycle on sync). Run
   `release-pass.mjs --list-transitions --range <lastSyncedRef>..HEAD --repo <consuming
   project's git repo>` (absent `lastSyncedRef` → fall back to the consuming repo's last
   tag); take only `isItem` rows. Per item key, derive its status by PRECEDENCE: `[x]` →
   complete (owned by the step-3 `checked`-flip path — the derived emitter NEVER emits
   complete); else a live flay-state key → in-progress (step 5); else the latest
   transition (`Needs-QA:` → qa, `Implements:` → in-progress); else todo. Emit a
   `bulk-status-update` ONLY when the derived intermediate differs from the cached
   `items[key].derivedStatus`, then update the cache. The step-3 checked-flip path is the
   `complete` owner — it sets `derivedStatus = complete` on `[x]` and CLEARS it on an
   uncheck (so a later qa/in-progress re-emits). Map via `statusMap.inProgress` / `qa`;
   absent key → warn-and-skip (never invent a status). Derived ops are idempotent
   `set status → X`. Advance `lastSyncedRef` to HEAD ONLY after every derived op has
   drained or been re-queued to `pendingOps`, persisted in the SAME atomic sidecar write.
7. **Blocked tags.** Re-derive two per-item tags each sync (protocol § Blocked tags);
   these are a DIFFERENT axis from the RC-level `## Blockers & Dependencies` link.
   First ensure `blocked-dep` and `blocked-hitl` exist in the space; a missing tag →
   degrade-and-suggest (`add_tag` no-ops on an undefined tag). Derive:
   - **`blocked-dep`** = any of the item's exported `blockedBy` keys whose `checked` is
     false. A `blockedBy` REFERENCE missing from a CLEAN export STAYS blocking
     (stale-reference — flag for repair, never unblock); do NOT conflate with class-b.
   - **`blocked-hitl`** = a live entry in the flay-owned ledger
     `.captain-sdlc/blocked-hitl.json` (read advisorily, same place step 5 reads
     flay-state). A ledger ENTRY whose own subject key is retired/absent MAY be dropped —
     but ONLY on a strict CLEAN parse (export signals parse success); else KEEP it
     (conservative).
   Tags are BIDIRECTIONAL: ADD when blocked; REMOVE only if previously stamped (per the
   sidecar's last-derived state) — never remove a tag the mirror didn't add. Budget-gate
   and ledger every `add_tag` / `remove_tag` like any call.
8. **Bookkeeping.** Update `checked`, `lastPushedAt`, `lastSyncAt`, and `lastSyncedRef`
   per protocol; write sidecar (atomically — temp+rename) after each batch; ledger after
   every call.
9. **Report.** Per-RC drift summary (created / status-flipped / lifecycle-derived /
   blocked-tagged / retired / remapped), pendingOps drained and remaining, calls spent,
   budget remaining, active flay if any, and any stopwatch started/stopped this run.
