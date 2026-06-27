#!/usr/bin/env node
// gks/compile.mjs — the DECOMPOSE/ASSEMBLE runtime primitive for G-Orchestra v2.
// Reads Genesis Block atoms -> validates (GKS-001/002/003 via atom-schema) -> emits a runnable
// engine backlog + renders canonical Markdown, and self-checks the Markdown<->object round-trip.
// Zero-dependency Node ESM. Run from orchestration/:  node gks/compile.mjs
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateSet, toBacklogTask, renderAtomMarkdown, parseAtomMarkdown } from "./atom-schema.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dir, "atoms.gorch.json");
const OUT_BACKLOG = join(__dir, "backlog.gorch.json");
const OUT_ATOMS = join(__dir, "atoms");

const src = JSON.parse(readFileSync(SRC, "utf8"));
const atoms = src.atoms || [];

// ---- validate (GKS-001 unique · GKS-002 acyclic · GKS-003 >6-hop warn) ----
const { errors, warnings, waves, level } = validateSet(atoms);
if (errors.length) { console.error("✗ VALIDATION FAILED:\n" + errors.map((e) => "  - " + e).join("\n")); process.exit(1); }

// ---- ASSEMBLE: emit engine backlog ----
const tasks = atoms.map(toBacklogTask);
writeFileSync(OUT_BACKLOG, JSON.stringify({ $schema: "engine backlog (compiled from gks/atoms.gorch.json — do NOT hand-edit; run `node gks/compile.mjs`)", block: src.block, tasks }, null, 2) + "\n", "utf8");

// ---- render each atom to canonical Markdown ----
rmSync(OUT_ATOMS, { recursive: true, force: true });
mkdirSync(OUT_ATOMS, { recursive: true });
for (const a of atoms) writeFileSync(join(OUT_ATOMS, `${a.id}.md`), renderAtomMarkdown(a, src.block), "utf8");

// ---- round-trip self-check (entity--atom-schema acceptance: Markdown <-> object) ----
let rtChecked = 0;
for (const a of atoms) {
  const rt = parseAtomMarkdown(renderAtomMarkdown(a, src.block));
  if (rt.id !== a.id || rt.type !== a.type || rt.tier !== a.tier) {
    console.error(`✗ round-trip mismatch: ${a.id}`, rt); process.exit(1);
  }
  rtChecked++;
}

// ---- report ----
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
