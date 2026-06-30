#!/usr/bin/env node
// gks/compile.mjs — the DECOMPOSE/ASSEMBLE runtime primitive for G-Orchestra v2 (atom algo--genesis-compile).
// Reads Genesis Block atoms -> validates (GKS-001 unique id / GKS-002 acyclic / GKS-003 >6-hop warn + unresolved-dep)
// via atom-schema -> emits a runnable engine backlog + renders canonical Markdown, self-checking the Markdown<->object
// round-trip. Importable as compile() (pure, throws CompileError on failure) or run as a CLI (exits non-zero, loud).
// Zero-dependency Node ESM. Run from the repo root:  node gks/compile.mjs
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateSet, toBacklogTask, renderAtomMarkdown, parseAtomMarkdown } from "./atom-schema.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dir, "atoms.gorch.json");
const OUT_BACKLOG = join(__dir, "backlog.gorch.json");
const OUT_ATOMS = join(__dir, "atoms");

export class CompileError extends Error {
  constructor(message, errors) {
    super(message);
    this.name = "CompileError";
    this.errors = errors || [];
  }
}

// Validate + project an atom set into { backlog, markdown, waves, warnings }. Throws CompileError (with the
// GKS-001/002 / unresolved-dep messages) on any hard failure — never writes anything when validation fails.
// When `write` is true the backlog + per-atom Markdown are emitted to disk (CLI path); pure otherwise (test path).
export function compile({ block, atoms = [], write = false, outBacklog = OUT_BACKLOG, outAtoms = OUT_ATOMS } = {}) {
  const { errors, warnings, waves } = validateSet(atoms);
  if (errors.length) throw new CompileError("validation failed:\n  - " + errors.join("\n  - "), errors);

  const tasks = atoms.map(toBacklogTask);
  const backlog = { $schema: "engine backlog (compiled from gks/atoms.gorch.json — do NOT hand-edit; run `node gks/compile.mjs`)", block, tasks };
  const markdown = new Map(atoms.map((a) => [a.id, renderAtomMarkdown(a, block)]));

  let rtChecked = 0;
  for (const a of atoms) {
    const rt = parseAtomMarkdown(markdown.get(a.id));
    if (rt.id !== a.id || rt.type !== a.type || rt.tier !== a.tier) {
      throw new CompileError(`round-trip mismatch: ${a.id}`, [`round-trip mismatch: ${a.id}`]);
    }
    rtChecked++;
  }

  if (write) {
    writeFileSync(outBacklog, JSON.stringify(backlog, null, 2) + "\n", "utf8");
    rmSync(outAtoms, { recursive: true, force: true });
    mkdirSync(outAtoms, { recursive: true });
    for (const a of atoms) writeFileSync(join(outAtoms, `${a.id}.md`), markdown.get(a.id), "utf8");
  }
  return { backlog, markdown, tasks, waves, warnings, rtChecked };
}

function cli() {
  const src = JSON.parse(readFileSync(SRC, "utf8"));
  const atoms = src.atoms || [];
  let out;
  try {
    out = compile({ block: src.block, atoms, write: true });
  } catch (err) {
    console.error("✗ COMPILE FAILED — " + err.message);
    process.exit(1);
  }
  const { tasks, waves, warnings, rtChecked } = out;
  const byPhase = {};
  for (const a of atoms) (byPhase[a.phase] ||= []).push(a.id);
  console.log(`✓ compiled ${atoms.length} atoms  (GKS-001 ✓ · GKS-002 ✓ · round-trip ${rtChecked}/${atoms.length} ✓)`);
  console.log(`  wrote ${OUT_BACKLOG.split(/[\\/]/).pop()} (${tasks.length} tasks) + ${atoms.length} atom .md in gks/atoms/`);
  console.log(`  phases: ` + Object.entries(byPhase).map(([p, xs]) => `${p}=${xs.length}`).join("  "));
  const byState = {}; for (const a of atoms) byState[a.state || "new"] = (byState[a.state || "new"] || 0) + 1;
  console.log(`  state:  ` + ["exists", "extend", "new"].filter((s) => byState[s]).map((s) => `${s}=${byState[s]}`).join("  "));
  console.log(`  build waves (parallelizable):`);
  waves.forEach((w, i) => console.log(`    wave ${i}: ${w.join(", ")}`));
  console.log(warnings.length ? "⚠ warnings:\n" + warnings.map((w) => "  - " + w).join("\n") : "  no coupling warnings (all depths ≤ 6).");
}

if (import.meta.url === `file://${process.argv[1]}` || fileURLToPath(import.meta.url) === process.argv[1]) cli();
