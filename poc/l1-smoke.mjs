/**
 * Smoke test L1 — queryContext + prompt injection (anti-error loop กันผิดซ้ำ)
 * รัน:  node orchestration/poc/l1-smoke.mjs file
 *       node orchestration/poc/l1-smoke.mjs genesisdb
 * พิสูจน์: เก็บความผิด -> task ใหม่ที่คล้าย ดึง "❌ past mistakes" กลับมา -> โผล่ใน buildPrompt จริง
 */
import { getStore } from "../store/knowledge.mjs";
import { buildPrompt } from "../engine.mjs";
import { rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const mode = process.argv[2] || "file";
const BRAIN = join(dirname(fileURLToPath(import.meta.url)), "..", "brain");
const CONFIG = { store: { knowledge: mode, genesisdb: { bindingPath: "G:/GenesisBlock_Dev/GenesisBlock/index.js", path: "", vectorDim: 1024, embedModel: "bge-m3:latest", ollamaHost: "http://127.0.0.1:11434" } } };

const seed = {
  taskId: "G0.3", taskTitle: "CI: clippy + tauri build", type: "config",
  model: "ollama:gemma4-rust-coder", worker: "seed", status: "needs-rework", at: new Date().toISOString(),
  issues: [{ severity: "critical", area: "correctness", detail: "hallucinate 'actions/setup-rust@v3' ที่ไม่มีจริง", fix: "ใช้ 'dtolnay/rust-toolchain@stable'" }],
  summary: "CI ใช้ action ปลอม",
};
const newTask = { id: "G8.9", title: "ตั้ง CI workflow ใหม่ build Rust + Tauri บน Windows", type: "config", phase: "8", deps: [], accept: "PR เขียว ได้ artifact MSI", scope: { budgetTokens: 4000 } };

async function main() {
  console.log(`\n=== L1 smoke (mode=${mode}) ===`);
  if (existsSync(BRAIN)) rmSync(BRAIN, { recursive: true, force: true });   // เริ่มสะอาด
  const store = getStore(CONFIG);
  console.log(`  store.kind = ${store.kind}`);

  // [1] เก็บความผิด (G2)
  await store.recordOutcome(seed);
  console.log(`  \x1b[32m✓\x1b[0m เก็บความผิด G0.3 (setup-rust hallucination)`);

  // [2] task ใหม่ที่คล้าย -> ดึงกลับ (G3)
  const mistakes = await store.queryContext(newTask, { k: 3 });
  if (!mistakes.length) throw new Error("queryContext ไม่คืนผล — task ใหม่ไม่เจอความผิดที่คล้าย");
  console.log(`  \x1b[32m✓\x1b[0m queryContext คืน ${mistakes.length} past mistakes:`);
  for (const m of mistakes) console.log(`     ❌ ${m.issue}  →  ✅ ${m.fix}  (${m.task})`);
  if (!mistakes.some((m) => /setup-rust/.test(m.issue))) throw new Error("ไม่เจอความผิด setup-rust ที่เกี่ยวข้อง");

  // [3] โผล่ใน buildPrompt จริงไหม (inject)
  const prompt = buildPrompt(newTask, "ollama:gemma4-rust-coder", "ollama", null, mistakes);
  if (!prompt.includes("ห้ามทำซ้ำ") || !/setup-rust/.test(prompt)) throw new Error("buildPrompt ไม่ได้ inject ❌ past mistakes");
  console.log(`  \x1b[32m✓\x1b[0m buildPrompt inject บล็อก "❌ ห้ามทำซ้ำ" + setup-rust แล้ว (${prompt.length} ตัวอักษร)`);

  await store.close?.();
  rmSync(BRAIN, { recursive: true, force: true });
  console.log(`\n\x1b[32m=== L1 ผ่าน (mode=${mode}) — กันผิดซ้ำทำงานจริง ===\x1b[0m\n`);
}
main().catch((e) => { console.error(`\n\x1b[31m✗ L1 ล้มเหลว:\x1b[0m ${e.stack || e.message}`); process.exit(1); });
