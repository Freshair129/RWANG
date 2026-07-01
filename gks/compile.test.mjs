// gks/compile.test.mjs — node --test for algo--genesis-compile.
// Feeds tiny in-memory atom sets (clean / dup / cycle / unresolved dep / >6-hop) and asserts the DoD:
// clean passes + emits; dup id, cycle, and unresolved dep each fail loudly (throw CompileError).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, rmSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { compile, CompileError } from "./compile.mjs";

const atom = (id, deps = [], extra = {}) => ({
  id, type: "algo", displayName: id, tier: "H2", phase: "P0", deps, ...extra,
});

test("clean set passes and emits backlog + per-atom markdown", () => {
  const dir = mkdtempSync(join(tmpdir(), "gks-compile-"));
  const outBacklog = join(dir, "backlog.gorch.json");
  const outAtoms = join(dir, "atoms");
  try {
    const atoms = [atom("algo--a"), atom("algo--b", ["algo--a"])];
    const r = compile({ block: "Test::Block", atoms, write: true, outBacklog, outAtoms });

    assert.equal(r.tasks.length, 2);
    assert.equal(r.warnings.length, 0);
    assert.equal(r.rtChecked, 2);

    assert.ok(existsSync(outBacklog), "backlog.gorch.json emitted");
    const backlog = JSON.parse(readFileSync(outBacklog, "utf8"));
    assert.equal(backlog.block, "Test::Block");
    assert.equal(backlog.tasks.length, 2);
    assert.deepEqual(backlog.tasks[1].deps, ["algo--a"]);

    for (const id of ["algo--a", "algo--b"]) {
      assert.ok(existsSync(join(outAtoms, `${id}.md`)), `${id}.md emitted`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("pure compile (write:false) emits nothing to disk", () => {
  const atoms = [atom("algo--solo")];
  const r = compile({ block: "Test::Block", atoms });
  assert.equal(r.tasks.length, 1);
  assert.ok(r.markdown.has("algo--solo"));
});

test("GKS-001: duplicate id fails loudly", () => {
  const atoms = [atom("algo--dup"), atom("algo--dup")];
  assert.throws(() => compile({ block: "B", atoms }), (err) => {
    assert.ok(err instanceof CompileError);
    assert.match(err.message, /GKS-001 duplicate id: algo--dup/);
    return true;
  });
});

test("GKS-002: dependency cycle fails loudly", () => {
  const atoms = [atom("algo--x", ["algo--y"]), atom("algo--y", ["algo--x"])];
  assert.throws(() => compile({ block: "B", atoms }), (err) => {
    assert.ok(err instanceof CompileError);
    assert.match(err.message, /GKS-002 cycle/);
    return true;
  });
});

test("unresolved dep (dep id that doesn't exist) fails loudly", () => {
  const atoms = [atom("algo--real", ["algo--ghost"])];
  assert.throws(() => compile({ block: "B", atoms }), (err) => {
    assert.ok(err instanceof CompileError);
    assert.match(err.message, /unresolved dep: algo--real -> algo--ghost/);
    return true;
  });
});

test("a failing set writes nothing to disk", () => {
  const dir = mkdtempSync(join(tmpdir(), "gks-compile-fail-"));
  const outBacklog = join(dir, "backlog.gorch.json");
  const outAtoms = join(dir, "atoms");
  try {
    const atoms = [atom("algo--real", ["algo--ghost"])];
    assert.throws(() => compile({ block: "B", atoms, write: true, outBacklog, outAtoms }), CompileError);
    assert.ok(!existsSync(outBacklog), "no backlog emitted on failure");
    assert.ok(!existsSync(outAtoms), "no atoms dir emitted on failure");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("GKS-003: a dependency chain deeper than 6 hops warns (does not fail)", () => {
  // chain of 8 atoms -> deepest is at depth 7 (>6) -> exactly one coupling warning, still compiles.
  const atoms = [atom("algo--h0")];
  for (let i = 1; i < 8; i++) atoms.push(atom(`algo--h${i}`, [`algo--h${i - 1}`]));
  const r = compile({ block: "B", atoms });
  assert.equal(r.tasks.length, 8);
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /GKS-003 COUPLING_RISK_WARN: algo--h7 at depth 7/);
});
