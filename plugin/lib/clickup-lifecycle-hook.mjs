#!/usr/bin/env node
// Captain-SDLC lifecycle trigger for the ClickUp mirror.
//
// Declared as a PostToolUse hook in ../hooks/hooks.json for Write/Edit. It fires after
// a file write and nudges `clickup-sync` for the active RC when the write is a
// captain-sdlc lifecycle event in a time-tracking project (`trackTime: true`):
//
//   - flay begin  — a write to `.captain-sdlc/flay-state.json` for a mapped task that
//     is not yet in-progress → flip it to in-progress and START its ClickUp stopwatch.
//   - qa complete — a passing `.captain-sdlc/qa/<key>/verdict.json` for a mapped task
//     that is not yet complete → flip it from QA/Review to Done and STOP its stopwatch.
//
// flay and qa never call the tracker; they just write their state files. This hook is
// how the clickup plugin "ties in": the lifecycle write fires the hook, the plugin tied
// to the hook drives the tracker (via the budget-ledgered clickup-sync skill, never this
// script — ADR 0002).
//
// Idempotent: skips once the task already shows the target derivedStatus (sync ran),
// so per-phase flay-state rewrites and a lingering verdict file don't re-fire.
//
// Fail-open + silent: any error, or any unrelated write, exits 0 with no output — a hook
// on every Write/Edit must add no friction to normal editing.
//
// Pure helpers are exported for ./clickup-lifecycle-hook.test.mjs.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/** Classify a write by its file_path: "flay" | "qa" | null. */
export function classify(toolInput) {
  const fp = toolInput?.file_path;
  if (typeof fp !== "string") return null;
  const norm = fp.replace(/\\/g, "/");
  if (norm.endsWith(".captain-sdlc/flay-state.json")) return "flay";
  if (/\.captain-sdlc\/qa\/[^/]+\/verdict\.json$/.test(norm)) return "qa";
  return null;
}

/** Resolve the clickup map path under a project cwd: canonical, legacy root fallback. */
export function mapPath(cwd) {
  const canonical = join(cwd, ".captain-sdlc", ".clickup-map.json");
  const legacy = join(cwd, ".clickup-map.json");
  if (!existsSync(canonical) && existsSync(legacy)) return legacy;
  return canonical;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function gated(map) {
  return map && map.enabled === true && map.trackTime === true;
}

/** flay-begin → in-progress + start stopwatch. Pure. */
export function decideFlay(map, flay) {
  if (!gated(map)) return { trigger: false, reason: "disabled-or-not-tracking" };
  if (!flay || typeof flay.task_id !== "string" || typeof flay.rcId !== "string")
    return { trigger: false, reason: "no-active-task" };
  if (flay.phase === "done") return { trigger: false, reason: "flay-done" };
  const item = map.rcs?.[flay.rcId]?.items?.[flay.task_id];
  if (!item) return { trigger: false, reason: "task-not-mapped" };
  if (item.derivedStatus === "in-progress")
    return { trigger: false, reason: "already-in-progress" };
  return { trigger: true, kind: "begin", rcId: flay.rcId, key: flay.task_id, reason: "flay-begin" };
}

/** qa-pass → Done + stop stopwatch. Pure. */
export function decideQa(map, verdict) {
  if (!gated(map)) return { trigger: false, reason: "disabled-or-not-tracking" };
  if (!verdict || verdict.result !== "pass" || typeof verdict.task_id !== "string" || typeof verdict.rcId !== "string")
    return { trigger: false, reason: "no-pass-verdict" };
  const item = map.rcs?.[verdict.rcId]?.items?.[verdict.task_id];
  if (!item) return { trigger: false, reason: "task-not-mapped" };
  if (item.derivedStatus === "complete")
    return { trigger: false, reason: "already-complete" };
  return { trigger: true, kind: "complete", rcId: verdict.rcId, key: verdict.task_id, reason: "qa-pass" };
}

function nudge(d) {
  return d.kind === "begin"
    ? `A flay just began for ClickUp-mapped ticket ${d.key} (RC ${d.rcId}) in a ` +
        `time-tracking project. Run /clickup-sync ${d.rcId} now so the mirror flips it ` +
        `to in-progress and starts its ClickUp stopwatch (best-effort — skip if the ` +
        `call budget is exhausted; never block the flay).`
    : `QA just passed for ClickUp-mapped ticket ${d.key} (RC ${d.rcId}) in a ` +
        `time-tracking project. Run /clickup-sync ${d.rcId} now so the mirror moves it ` +
        `from QA/Review to Done and stops its ClickUp stopwatch (best-effort — skip if ` +
        `the call budget is exhausted; never block).`;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  let event = {};
  try {
    const raw = await readStdin();
    if (raw.trim()) event = JSON.parse(raw);
  } catch {
    process.exit(0); // fail-open
  }

  const kind = classify(event.tool_input);
  if (!kind) process.exit(0); // fast path: unrelated write

  const cwd = event.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const map = readJson(mapPath(cwd));

  const d =
    kind === "flay"
      ? decideFlay(map, readJson(join(cwd, ".captain-sdlc", "flay-state.json")))
      : decideQa(map, readJson(event.tool_input.file_path));
  if (!d.trigger) process.exit(0);

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: nudge(d) },
    }),
  );
  process.exit(0);
}

// Only run the CLI when invoked directly (not when imported by the test).
if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("clickup-lifecycle-hook.mjs")
) {
  main().catch(() => process.exit(0)); // fail-open: never brick editing
}
