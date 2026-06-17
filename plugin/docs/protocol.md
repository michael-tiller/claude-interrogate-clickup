# ClickUp Mirror Protocol

Canonical contract for the `clickup-push`, `clickup-sync`, and `clickup-status` skills.
Skills MUST follow this document. When this document and a skill's inline prose disagree,
this document wins.

## Principles

1. **Markdown is canonical; ClickUp is a mirror.** The taskout RC files under the
   roadmap directory are the single source of truth. Nothing ever syncs *from* ClickUp
   *to* markdown. There is no two-way sync and there never will be.
2. **No deletes, ever.** The ClickUp MCP server exposes a task-deletion tool; invoking
   it is forbidden. Items removed from markdown are mirrored by setting the list's
   closed-type status. Sidecar mapping entries are never removed either — they flip to
   `"state": "retired"`.
3. **Definition of Done items are never pushed as tasks.** DoD is the ship gate, not
   work items.
4. **Deterministic identity comes from core.** Item and story keys are computed by the
   `design_taskout_export` tool on the claude-interrogate MCP server (requires
   claude-interrogate >= 0.1.8). Never re-derive, guess, or hand-compute a key.

## Hierarchy mapping

**Agile mapping (standardized — each term means exactly its level of work):** **Epic** =
the RC / milestone (the **List**); **Story** = a `### Targeted` subsection (a parent
task); **Task** = a checkbox work item (a subtask under its Story). Set ClickUp
`task_type` to match the level — `Story` on a story parent, `Task` on a task subtask
(ClickUp's default type is already `Task`; the Epic is the List, not a typed task). Where
the workspace lacks a custom type (commonly `Story`), omit it and **suggest the user add
it via the ClickUp web UI** — the MCP server cannot create task-type definitions
(portability; same rule as a missing custom field).

| Interrogate concept                      | ClickUp container                                  |
| ---------------------------------------- | -------------------------------------------------- |
| Consuming project                        | one **Folder** (recorded in sidecar `project`)     |
| RC / milestone — the **Epic**            | one **List** in that Folder, or an existing sprint List by ID |
| `### Targeted` subsection — a **Story**  | parent task in the RC's List (`task_type: Story` when available) |
| Checkbox item — a **Task**               | subtask under its Story (`task_type: Task`, the default), status from checked state |
| Blockers & Dependencies                  | dependency link when the blocker maps to a known task key; otherwise folded into description text at creation time |

Sprints in ClickUp are Lists; an RC may target an existing sprint List by ID instead of
a created List. The ClickUp MCP server cannot create sprints — only plain Lists.

**Vocabulary & granularity ownership.** In planning terms the **List/RC is the
milestone**, each `### Targeted` subsection is an **epic** (one feature), each checkbox
item is a **ticket** (one goal). Tickets are kept **as small as possible — one goal
each** — on purpose: more tickets is more explicit, and explicit keeps the goal of every
piece of work transparent. The *decomposition* (how fine, and when one phase fans out
into several tickets) is owned upstream by the taskout interview; the mirror's job is to
**honor** it — it reflects whatever checkboxes taskout produced and **never splits,
merges, or resizes them** (Principle 1), so the fine-grained explicitness authored in
taskout survives intact into ClickUp.

## Sidecar files

Both live in `.captain-sdlc/` under the consuming project's output directory — the
Captain SDLC state dir, alongside `flay-state.json`. Legacy projects may still have
them at the output-dir root: read from the root as a fallback, and migrate by moving
the files into `.captain-sdlc/` on the next write. Never maintain both copies.

### `.clickup-map.json` — committed to git

```json
{
  "version": 1,
  "enabled": true,
  "workspace": { "teamId": "9018xxxxx" },
  "project": { "spaceId": "9001", "folderId": "9002", "folderName": "MyGame" },
  "rcs": {
    "MRC1_LAUNCH": {
      "listId": "901807xxxxx",
      "listName": "Sprint 14 (6/8 - 6/21)",
      "listKind": "sprint",
      "interrogateKeyFieldId": "ebbbb7a4-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      "fieldIds": {
        "tokenBudget": "cfc439d7-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        "tokenBudgetOptions": { "Vibes ($0)": "9d9ca2b0-xxxx", "Dinner ($30)": "45237fb9-xxxx" },
        "discipline": "7de468ab-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        "disciplineOptions": { "Eng": "xxxx", "Art": "xxxx" }
      },
      "statusMap": { "open": "to do", "done": "complete", "closed": "complete" },
      "stories": {
        "MRC1_LAUNCH#auth-hardening": { "taskId": "86cxxxxx", "heading": "Auth hardening" }
      },
      "items": {
        "MRC1_LAUNCH#auth-hardening#a1b2c3d4e5f6": {
          "taskId": "86cyyyyy",
          "storyKey": "MRC1_LAUNCH#auth-hardening",
          "text": "Rotate signing keys on deploy",
          "checked": false,
          "state": "active",
          "lastPushedAt": "2026-06-11T18:00:00Z",
          "fields": {
            "priority": "high",
            "timeEstimateMinutes": 120,
            "tokenBudget": "Dinner ($30)",
            "discipline": "Eng",
            "startedAt": "2026-06-13"
          }
        }
      },
      "lastSyncAt": "2026-06-11T18:05:00Z"
    }
  },
  "pendingOps": []
}
```

- `statusMap` core keys are `open`, `done`, `closed`. Two OPTIONAL keys —
  `inProgress` and `qa` — enable intermediate-state mirroring from the Seam 7
  release pass (claude-release-clickup forwards `Implements:`/`Needs-QA:` footer
  transitions as `bulk-status-update` pendingOps). Optional keys are additive: no
  sidecar `version` bump, and consumers that find them absent warn-and-skip
  intermediate mirroring rather than inventing a status. Configure via
  `/clickup-setup`.
- `interrogateKeyFieldId` caches the list's `interrogate-key` custom-field id
  (additive optional key, no `version` bump — discovered once per list via
  `Get Custom Fields`; see Idempotency for the dual-write rule).
- `fieldIds` caches the list's planning custom-field ids + dropdown option maps
  (Token Budget, Discipline) — discovered in the SAME `Get Custom Fields` call that
  finds `interrogateKeyFieldId` (no extra call). Additive optional key, no `version`
  bump. A field absent from the list → omit that enrichment AND **suggest the user add
  it via the ClickUp web UI**, naming the field and type (e.g. `Token Budget`
  (dropdown), `Discipline` (dropdown)) — the MCP server cannot create field
  definitions. Never block or fail on absence: the mirror must work for a user who does
  not share the project owner's exact custom-field setup (portability). Resolve a
  dropdown's option UUID from its
  `…Options` (cached label→UUID) map at write time — NEVER match by label string
  (option labels may carry trailing spaces).
- `items[key].fields` are per-item **planning estimates** mirrored onto the ClickUp
  task: `priority` (urgent/high/normal/low → native `priority`), `timeEstimateMinutes`
  (→ native `time_estimate`), `tokenBudget` + `discipline` (dropdown labels → option
  UUIDs via `fieldIds`), and `startedAt` (→ native `start_date`, set on flay; see Flay
  awareness). Stored as human-readable labels (git-readable, like `text`/`checked`).
  Additive optional key, no `version` bump. **Estimates are authored once** — proposed
  by the model, confirmed by the user at push (or at first sync for an already-mapped
  RC) — then **sticky**: sync mirrors a value to ClickUp only when the STORED value
  changes, never re-prompting. An active item with no `fields` block = "needs initial
  estimate". Estimates are mirror metadata: they live HERE, never in the canonical
  roadmap markdown (Principle 1). Sprint Points and Tags are intentionally NOT
  mirrored (no MCP write path / out of scope).
- `taskSpecs: true` (OPTIONAL, additive, no `version` bump) enables per-task spec
  blocks (§ Per-task spec blocks). Absent or `false` → skills do no spec work and
  spend no spec calls. Configure via `/clickup-setup`.
- `enabled: false` short-circuits every skill: report "ClickUp sync is disabled for
  this project (.clickup-map.json enabled=false)" and stop. No ClickUp calls, no
  questions.
- Missing file entirely: only `clickup-push` may offer to initialize; declining writes
  `{ "version": 1, "enabled": false }` so the project is never asked again.
  `clickup-sync` and `clickup-status` treat a missing sidecar as disabled.
- `state` is `"active"` or `"retired"`. Retired entries keep their taskId forever.
- **Legacy key migration (additive shim, no `version` bump).** Before the agile
  standardization the story map was named `epics` and item entries used `epicKey`. Read
  `rcs.<RC>.stories ?? rcs.<RC>.epics` and `items[k].storyKey ?? items[k].epicKey`; on the
  NEXT sidecar write, emit the `stories` / `storyKey` names and drop the legacy ones. The
  keys themselves (`<RC>#<slug>`, `<RC>#<slug>#<digest>`) are unchanged, so nothing is
  re-created in ClickUp.
- A story entry MAY carry an additive optional `status` (the derived rollup cache —
  `complete`/`qa`/`in-progress`/`to-do`) so the release pass skips re-setting a story
  whose computed status is unchanged; absent → treat as changed. No `version` bump.
  Story status is DERIVED from task state (release-pass `stories[]` rollup), never authored.
- A story entry MAY also carry a derived `scopeBudget` (the summed Token Budget of its
  child tasks — a deterministic $ rollup) and the RC/Epic a top-level total. Derived by
  math, never authored. (Rollup mechanics land with the budget-rollup work.)

### `pendingOps[]` — the durable queue

```json
{
  "op": "bulk-create-items",
  "rcId": "MRC1_LAUNCH",
  "storyKey": "MRC1_LAUNCH#auth-hardening",
  "itemKeys": ["MRC1_LAUNCH#auth-hardening#deadbeef0123"],
  "queuedAt": "2026-06-11T18:06:00Z",
  "reason": "budget-exhausted"
}
```

- Op vocabulary: `create-list`, `bulk-create-stories`, `bulk-create-items`,
  `bulk-status-update`, `add-dependency`, `update-spec` (legacy `post-comment` ops
  from ≤ v0.4.0 queues drain as `update-spec` body writes).
- `reason` is `"budget-exhausted"` or `"429"`.
- Ops store **keys, never text** — the drain step re-exports the RC so text is
  current-canonical at execution time. If a queued key no longer exists in the fresh
  export, drop that key from the op (the item was removed from markdown; the normal
  sync diff handles its retirement).
- Drain order: oldest first. Remove an op from the array only after its call succeeds.

### `.clickup-ledger.json` — gitignored in the consuming project

```json
{
  "version": 1,
  "budget": 300,
  "reserve": 30,
  "calls": [
    { "at": "2026-06-11T18:00:01Z", "tool": "create_bulk_tasks", "rcId": "MRC1_LAUNCH" }
  ]
}
```

- `budget` and `reserve` are user-editable knobs. Defaults: 300 / 30.
- Prune entries older than 25 hours on every write.
- Missing ledger: create it with defaults on first ClickUp call. (Multi-machine
  caveat: a fresh ledger can overspend; the reserve plus 429 handling is the backstop.)

## Flay awareness (advisory)

`.captain-sdlc/flay-state.json` (written by interrogate's flay harness, ≥ 0.1.9;
schema_version 1, single object) names the task currently being executed. Blades
read it ADVISORILY — never act destructively on it, never treat stale state
(phase `done`, old `updatedAt`) as live:

- **clickup-sync**: when the active task's RC is mapped AND its `statusMap` has the
  optional `inProgress` key, the sync may queue ONE `bulk-status-update` op moving
  that task's mirrored ClickUp task to in-progress. **On that same update, set the
  task's `start_date` to today and record `items[key].fields.startedAt`** — set-once:
  never overwrite an existing `startedAt`, so re-flaying keeps the original start. The
  start-date write rides the status update (zero extra calls). Normal budget rules
  apply. If `inProgress` is absent, skip silently — never invent a status.
- **clickup-status**: report the active task (key, phase, age) alongside drift.

## Verification in the task body

claude-release-clickup's task-footers writes a verification block to
`.captain-sdlc/verifications/<key>.md` whenever a commit carries a `Needs-QA:` or
`Completes:` footer — what was tried and its result, plus the QA steps to confirm it.
When clickup-sync flips that key to its `qa` or closed/`done` status — draining a qa
`bulk-status-update` op, or detecting a `Completes` checkbox flip — it writes the
artifact's contents into the mapped task's **description** (the body), then deletes
the artifact. DOD and verification specs must not live in a comment that scrolls away
under later discussion — the body is the durable, always-visible surface. *(Supersedes
the v0.1.3–v0.4.0 "verification comments" design; legacy queued `post-comment`
pendingOps drain as body writes.)*

- **With `taskSpecs: true`** the qa/complete spec-block write (§ Per-task spec blocks)
  IS the verification handoff — the artifact feeds **Automated coverage** + **Human QA
  steps**, zero extra calls beyond the spec write that flip already triggers.
- **With `taskSpecs` off/absent** the flip still writes the artifact into the
  description as a standalone `**Verification** _(spec v1)_` section (same placement
  rule: between item text and the `interrogate-key:` footer). Verification durability
  is not opt-in; only the in-progress DOD drafting is.
- One body write = 1 `Get Task` + 1 `Update Task` (descriptions are absent from bulk
  reads). Estimate both in the op-plan budget and ledger them like any call.
- Over budget or on a 429: queue an `update-spec` op (`rcId`, item `key`, `taskId`,
  trigger) to `pendingOps`, stop loudly, never partial-write.
- The artifact is the idempotency token: delete it only after the `Update Task`
  succeeds, so a re-run with no artifact writes nothing.
- The update MUST preserve the description's other content (item text, existing spec
  block content carried forward per the renovation rule, the key footer exactly) —
  clobbering loses human-reviewed prose.
- No artifact for a flipping key → nothing to write; never synthesize one. The mirror
  still never reads ClickUp back into markdown — canonical stays canonical.
- **Blocked (forward extension).** The same plumbing writes a "what we tried / why
  stalled" note on a flip to a blocked status. No footer verb mints a blocked
  transition today (Seam 7 has three verbs); wiring that trigger is an open decision —
  until it lands, this fires only on qa/complete.

## Per-task spec blocks (opt-in: sidecar `taskSpecs: true`)

Each task's description can carry a structured spec block — DOD plus the two
verification layers — written and renovated at **touch points** (status flips), never
as a bulk backfill campaign. The block is **derived prose**, same standing as the story
DoD seeding: markdown + verification artifacts stay canonical; the block never syncs
back. Format `spec v1`:

```
**How to implement** _(spec v1)_
- <the concrete path: file:line / seam to touch — from the taskout export's `howToImplement`, present only on a warm ticket>

**Design context**
- <traps + the why to carry into execution — from the export's `designContext`, warm only>

**Definition of Done**
- <binary, observable criteria — what QA actually checks; no prose hedges>

**Automated coverage**
- <tests/smokes added for THIS task + evidence: suite, count, commit — e.g. "CorpseServiceTests 12/12, v2.63.0 50ebbf70">

**Human QA steps**
1. <numbered manual script for FUTURE touch passes — e.g. start game; spawn critter, kill it; 2x speed, wait ~Xs; check logs for the message>
```

The first two sections (**How to implement**, **Design context**) are the *implementation*
spec, authored upstream by the taskout interview and carried verbatim from the export;
they appear only on a warm ticket. The last three are the *verification* spec, drafted at
touch points. A cold ticket has only the verification sections.

Placement: between the item text and the `---` / `interrogate-key:` footer. The
`_(spec v1)_` marker rides the block's FIRST heading — **How to implement** on a warm
ticket, else **Definition of Done** — and is the version sentinel renovation keys off.

**Touch-point triggers** (only when the flip itself is already being written — spec
work piggybacks on transitions, it never initiates calls):

| Flip                  | Spec work                                                       |
| --------------------- | --------------------------------------------------------------- |
| → in-progress         | Draft/review **Definition of Done** (scope knowledge is freshest at work start) |
| → qa / complete       | Write **Automated coverage** (from the verification artifact + named suites) and **Human QA steps** (numbered manual script); review DOD against final scope |

In **auto/unattended runs** (flay-auto, no human at the boundary): skip the
in-progress spec write and batch ALL spec drafting at the end flip (qa/complete),
tagged `_(auto-drafted — review)_` — one write instead of two, fewer ClickUp
interactions.

**Warm seeding at create (deep-shape-first).** The *implementation* spec (**How to
implement** + **Design context**) is not drafted at a flip — it is seeded once, at task
CREATE, by `clickup-push` from the export's `howToImplement` / `designContext` (warm
tickets only, `taskSpecs: true`), riding the single create call at zero extra cost. The
export/markdown stays canonical: these two sections are carried from the export, never
authored in ClickUp and never synced back. A cold ticket (no export spec) gets no
implementation spec — there is no shape to seed yet, and touch points only ever own the
*verification* sections. The renovation rule applies unchanged: a later touch preserves
the seeded How to implement / Design context verbatim and only adds/renovates the
verification sections — never re-derives or discards the taskout-authored spec.

**Sourcing precedence** for drafted content: the key's verification artifact
(`.captain-sdlc/verifications/<key>.md`) → RC Definition of Done bullets that name the
item → drafted from the item text. Human QA steps describe player-visible verification
(launch, perform, observe), not test-runner invocations — those belong in Automated
coverage.

**Renovation rule (always renovatable).** On any spec-bearing touch, whatever the
description currently holds renovates into the current format: a bare description gets
a fresh block; hand-written legacy sections or an older `spec vN` block get parsed and
their content CARRIED FORWARD into the current shape (never discarded — prior human
prose becomes bullets in the matching section, unrecognized prose is preserved above
the block). This is also how the format itself evolves: bump the sentinel, ship the new
shape, and old tickets upgrade lazily as they're touched — rolling design, no backfill
pass.

**Costs and safety.** A spec write = 1 `Get Task` (descriptions are absent from bulk
reads) + 1 `Update Task`, both ledgered and included in the op-plan estimate; over
budget → queue an `update-spec` op (`rcId`, item `key`, `taskId`, trigger) to
`pendingOps`. The update MUST rewrite the description as item text + block + key
footer, preserving the footer exactly. **Rename-remap and any other description
rewrite MUST preserve an existing spec block** — clobbering it loses human-reviewed
content.

## Budget discipline

The ClickUp MCP server allows ~300 calls per **rolling 24 hours** on paid plans without
the AI add-on. This is a hard constraint, not advisory.

**Enforced, not just disciplined.** A plugin `PreToolUse` hook
(`plugin/hooks/hooks.json` → `lib/clickup-ledger-hook.mjs`) runs before every ClickUp
call: it prunes the 25h window, appends the ledger entry, and **denies** the call when
`calls.length >= budget - reserve`. So the steps below are how a skill stays *within*
the budget gracefully (estimate up front, queue overflow) — the hook is the backstop
that makes "every call is ledgered" and the ceiling true even if a run forgets. See
ADR 0001. The hook fails open on its own errors; never rely on that — keep estimating.

Before ANY sequence of ClickUp calls:

1. Read the ledger, prune entries older than 25h, compute `used = calls.length`.
2. `remaining = budget - used - reserve`.
3. **Estimate the full op plan's call count FIRST** — including one before-create
   reconciliation read per touched list (see Idempotency) and every bulk call. One bulk
   call = one ledger entry, regardless of how many tasks it carries.
4. If `estimate > remaining`: write the ENTIRE plan to `pendingOps`, then stop loudly —
   report used, remaining, what was queued, and roughly when the oldest ledger entries
   roll off. Do not start a batch you cannot finish.
5. Append a ledger entry after EVERY ClickUp call — success or failure, **read or
   write** — before making the next call. No interaction is exempt: reconciliation
   `Get Task` / list reads, `Get Custom Fields` discovery, `Get Workspace Hierarchy`,
   searches, every bulk create/update, dependency links, and verification
   body-write (`Get Task` + `Update Task`) calls all ledger. The `calls[]` example below shows a write, but reads
   count identically — an unledgered call corrupts the rolling-24h count for every
   machine sharing the budget.

On a 429 or any rate-limit error: ledger the failed call, write all remaining work to
`pendingOps` with reason `"429"`, stop loudly. **Never retry-loop.**

## Scope rollup (Token Budget math)

Token Budget is a per-**Task** estimate (the $-tier dropdown). A **Story** and the **Epic**
carry a *derived* scope = the sum of their descendants' Token Budgets — a deterministic
math rollup, never authored, recomputed on sync (code does the math, not the model):

- Parse each Task's Token Budget tier to its dollar value (`/\$(\d+)/` — `Vibes ($0)` → 0 …
  `Stop. Just stop. ($5000+)` → 5000). A Task with no Token Budget contributes 0 and counts
  as unbudgeted, so the rollup reports coverage and a partial estimate isn't misread as cheap.
- **Story scope** = Σ its Tasks. **Epic total** = Σ its Stories.
- Cache in the sidecar: `stories[key].scopeBudget = { usd, taskCount, budgetedCount }` and
  `rcs[rc].scopeBudget = { usd, storyCount, taskCount, budgetedCount }`. Derived cache, no
  `version` bump; recompute and overwrite each sync.
- Surface on the board in the container's **description** as
  `Scope: ~$<usd> (<budgetedCount>/<taskCount> tasks budgeted)` — NOT in the per-Task tier
  dropdown (a sum rarely lands on a tier, and that dropdown means the item's OWN cost). The
  Epic total rides the List description/content (a List has no task custom fields).

## Single-call create discipline

The current ClickUp MCP server exposes **no bulk create or bulk update endpoint**
(verified live 2026-06-14 — only single `Create Task` / `Update Task` exist). Earlier
drafts of this doc assumed a "Create Bulk Tasks" tool; it does not exist. So:

- **One `Create Task` per task, carrying its FULL detail in that single call** — status
  (from `checked` via `statusMap`), the `interrogate-key` custom field, the description
  (item text + the item's per-item **DOD** when the export carries one + the key
  footer), AND the planning fields (`priority`, `time_estimate`, Token Budget +
  Discipline `custom_fields` resolved to option UUIDs via the cached `fieldIds`). It is
  NOT a shortcut to create a bare task and enrich it in a second call — that doubles the
  call count and leaves a window where the task shows no budget/owner/spec. Gather
  everything up front (the socratic estimate + DOD pass), confirm once, then create with
  the full payload.
- Status flips on existing tasks: one `Update Task` per task. Group identical flips to
  plan the budget, but there is no bulk-status tool — estimate N single calls.
- The `bulk-create-stories` / `bulk-create-items` / `bulk-status-update` names in the
  `pendingOps` vocabulary are queue *groupings*, not a bulk API — each drains as one
  `Create Task` / `Update Task` per task.
- Verify the live tool list at session start; if a future server adds real bulk
  endpoints, prefer them and update this section (via a repo PR).

| Purpose                    | Live tool (verified 2026-06-14)         |
| -------------------------- | --------------------------------------- |
| Workspace tree             | Get Workspace Hierarchy                 |
| Create a List in a Folder  | Create List                             |
| Create a task (full detail)| Create Task — single, **no bulk**       |
| Status / field update      | Update Task — single, **no bulk**       |
| Dependency links           | Add dependency                          |
| Search                     | Search Workspace                        |
| Read one task              | Get Task                                |
| One body/spec write        | Get Task + Update Task (2 calls)        |

## Idempotency and crash recovery

A bulk create can succeed and the session die before the sidecar write. Two mandatory
mechanisms:

1. **Machine-readable key, written twice on create (both ride the same call — zero
   extra spend).**

   **Primary: the `interrogate-key` custom field** (short_text), set via the create
   call's `custom_fields`. Discover the field id once per list (`Get Custom Fields`,
   1 call — counts against the budget estimate) and cache it in the sidecar as the
   RC's `interrogateKeyFieldId` (additive optional key, no `version` bump). If the
   list has no such field, **suggest the user add a `short_text` custom field named
   `interrogate-key` via the ClickUp web UI** (the MCP server cannot create field
   definitions); until then fall back to footer-only — it works, but cross-run
   reconciliation is less robust (descriptions are human-editable). Degrade, never block.

   **Secondary: the description footer.** Every created task's description still ends
   with exactly:

   ```
   ---
   interrogate-key: <key>
   ```

   Own line, after a `---` separator, nothing after it. Never freelance this format.
   The footer is kept because it is free at create time and readable by tools that
   omit custom fields — but descriptions are human-editable prose; when field and
   footer disagree, **the custom field wins**.

2. **Before-create reconciliation.** Before ANY create batch into a list, fetch that
   list's tasks using the cheapest available list/search tool the ClickUp server
   exposes for the target List (1 call — counts against the budget estimate).
   Caveat (verified live 2026-06-11): the current server's bulk list read returns
   neither descriptions nor custom-field values — so use the list read to spot
   suspect tasks (same name as a planned create, or any task in a list the sidecar
   says is empty), then `Get Task` each suspect (1 call each, budgeted) and read its
   `interrogate-key` field (footer as fallback). Matches are orphans from an
   interrupted run: adopt them into the sidecar (record their taskId), remove them
   from the create set, then proceed.

Write the sidecar after each completed batch — never once at the end of the run.

## Key caveats

- Keys are stable under whitespace and reordering changes, but **rewording an item
  produces a new key** (close-and-create on the ClickUp side unless the user confirms
  a rename remap during sync). A confirmed remap updates the sidecar key AND rewrites
  the task's `interrogate-key` custom field (1 call — the field is the primary
  identity, a stale field corrupts future reconciliation); the description footer is
  left stale — never spend a call just to rewrite a footer.
- Reordering duplicate-text items under one heading swaps their keys (inherent to the
  occurrence counter; rare and harmless — same text either way).
