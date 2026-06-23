// Run: node --test plugin/lib/clickup-lifecycle-hook.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { classify, mapPath, decideFlay, decideQa } from "./clickup-lifecycle-hook.mjs";

const SCRIPT = fileURLToPath(new URL("./clickup-lifecycle-hook.mjs", import.meta.url));

const KEY = "M1#epic#abc123";
const liveFlay = { task_id: KEY, rcId: "M1", phase: "assigned" };
const passVerdict = { task_id: KEY, rcId: "M1", result: "pass" };
const onMap = (over = {}) => ({
  enabled: true,
  trackTime: true,
  rcs: { M1: { items: { [KEY]: { taskId: "t1" } } } },
  ...over,
});

test("classify routes flay-state and qa verdict writes, ignores the rest", () => {
  assert.equal(classify({ file_path: "/p/.captain-sdlc/flay-state.json" }), "flay");
  assert.equal(classify({ file_path: "C:\\p\\.captain-sdlc\\qa\\M1#e#d\\verdict.json" }), "qa");
  assert.equal(classify({ file_path: "/p/.captain-sdlc/.clickup-map.json" }), null);
  assert.equal(classify({ file_path: "/p/src/index.ts" }), null);
  assert.equal(classify({}), null);
});

test("decideFlay triggers on a fresh flay begin for a mapped, tracked task", () => {
  const d = decideFlay(onMap(), liveFlay);
  assert.deepEqual([d.trigger, d.kind, d.rcId, d.key], [true, "begin", "M1", KEY]);
});

test("decideQa triggers on a passing verdict for a mapped, tracked task", () => {
  const d = decideQa(onMap(), passVerdict);
  assert.deepEqual([d.trigger, d.kind, d.rcId, d.key], [true, "complete", "M1", KEY]);
});

test("both no-op when trackTime is off or mirror disabled", () => {
  assert.equal(decideFlay(onMap({ trackTime: false }), liveFlay).trigger, false);
  assert.equal(decideQa(onMap({ enabled: false }), passVerdict).trigger, false);
  assert.equal(decideFlay(null, liveFlay).trigger, false);
});

test("decideQa no-ops for a non-pass verdict or an unmapped task", () => {
  assert.equal(decideQa(onMap(), { ...passVerdict, result: "fail" }).trigger, false);
  assert.equal(decideQa(onMap({ rcs: { M1: { items: {} } } }), passVerdict).trigger, false);
  assert.equal(decideQa(onMap(), null).trigger, false);
});

test("idempotency: flay skips when already in-progress, qa skips when already complete", () => {
  const f = onMap(); f.rcs.M1.items[KEY].derivedStatus = "in-progress";
  assert.equal(decideFlay(f, liveFlay).trigger, false);
  const q = onMap(); q.rcs.M1.items[KEY].derivedStatus = "complete";
  assert.equal(decideQa(q, passVerdict).trigger, false);
});

test("mapPath prefers .captain-sdlc when neither file exists", () => {
  const dir = mkdtempSync(join(tmpdir(), "lifecycle-hook-path-"));
  try {
    assert.ok(mapPath(dir).endsWith(join(".captain-sdlc", ".clickup-map.json")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- CLI: the actual nudges the hook delivers ---

function runHook(cwd, filePath) {
  const event = JSON.stringify({ tool_name: "Write", tool_input: { file_path: filePath }, cwd });
  return execFileSync("node", [SCRIPT], { input: event, encoding: "utf8" });
}

function seedMap(dir, map) {
  const sdlc = join(dir, ".captain-sdlc");
  mkdirSync(sdlc, { recursive: true });
  writeFileSync(join(sdlc, ".clickup-map.json"), JSON.stringify(map));
  return sdlc;
}

test("CLI emits an in-progress nudge on a fresh flay-state write", () => {
  const dir = mkdtempSync(join(tmpdir(), "lifecycle-flay-"));
  try {
    const sdlc = seedMap(dir, onMap());
    const fp = join(sdlc, "flay-state.json");
    writeFileSync(fp, JSON.stringify(liveFlay));
    const o = JSON.parse(runHook(dir, fp));
    assert.equal(o.hookSpecificOutput.hookEventName, "PostToolUse");
    assert.match(o.hookSpecificOutput.additionalContext, /flay just began/);
    assert.match(o.hookSpecificOutput.additionalContext, /clickup-sync M1/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI emits a Done nudge on a passing qa verdict write", () => {
  const dir = mkdtempSync(join(tmpdir(), "lifecycle-qa-"));
  try {
    const sdlc = seedMap(dir, onMap());
    const qaDir = join(sdlc, "qa", KEY);
    mkdirSync(qaDir, { recursive: true });
    const fp = join(qaDir, "verdict.json");
    writeFileSync(fp, JSON.stringify(passVerdict));
    const o = JSON.parse(runHook(dir, fp));
    assert.match(o.hookSpecificOutput.additionalContext, /QA just passed/);
    assert.match(o.hookSpecificOutput.additionalContext, /QA\/Review to Done/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI stays silent for unrelated writes and a failing verdict", () => {
  const dir = mkdtempSync(join(tmpdir(), "lifecycle-silent-"));
  try {
    const sdlc = seedMap(dir, onMap());
    assert.equal(runHook(dir, join(dir, "src", "x.ts")).trim(), "");
    const qaDir = join(sdlc, "qa", KEY);
    mkdirSync(qaDir, { recursive: true });
    const fp = join(qaDir, "verdict.json");
    writeFileSync(fp, JSON.stringify({ ...passVerdict, result: "fail" }));
    assert.equal(runHook(dir, fp).trim(), "");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
