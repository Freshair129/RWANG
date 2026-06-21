/**
 * Smoke test L2 — grounded context (retrieveContext / GRL)
 * รัน:  node orchestration/poc/l2-smoke.mjs genesisdb
 *       node orchestration/poc/l2-smoke.mjs file        (ต้องคืน null — degrade)
 * พิสูจน์: เก็บ outcome 2 task -> task ใหม่ที่คล้าย -> groundContext คืน "ชื่องานที่เกี่ยวข้อง" -> โผล่ใน buildPrompt
 */
import { getStore } from "../store/knowledge.mjs";
import { buildPrompt } from "../engine.mjs";
import { rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const mode = process.argv[2] || "genesisdb";
const BRAIN = join(dirname(fileURLToPath(import.meta.url)), "..", "brain");
const CONFIG = { store: { knowledge: mode, genesisdb: { bindingPath: "G:/GenesisBlock_Dev/GenesisBlock/index.js", path: "", vectorDim: 1024, embedModel: "bge-m3:latest", ollamaHost: "http://127.0.0.1:11434" } } };

const seeds = [
  { taskId: "G0.3", taskTitle: "CI: clippy + tauri build", type: "config", model: "ollama:gemma4-rust-coder", worker: "seed", status: "needs-rework", at: new Date().toISOString(),
    issues: [{ severity: "critical", area: "correctness", detail: "hallucinate 'actions/setup-rust@v3'", fix: "ใช้ 'dtolnay/rust-toolchain@stable'" }], summary: "CI action ปลอม" },
  { taskId: "G1.5", taskTitle: "Vercel web build + GitHub Actions deploy", type: "config", model: "ollama:gemma4-rust-coder", worker: "seed", status: "needs-rework", at: new Date().toISOString(),
    issues: [{ severity: "major", area: "correctness", detail: "ลืม prefix 'pnpm'", fix: "ใช้ 'pnpm build:web'" }], summary: "ลืม pnpm" },
];
const newTask = { id: "G8.9", title: "ตั้ง GitHub Actions CI build Rust + Tauri บน Windows", type: "config", phase: "8", deps: [], accept: "PR เขียว ได้ artifact MSI", scope: { budgetTokens: 4000 } };

async function main() {
  console.log(`\n=== L2 smoke (mode=${mode}) ===`);
  if (existsSync(BRAIN)) rmSync(BRAIN, { recursive: true, force: true });
  const store = getStore(CONFIG);
  console.log(`  store.kind = ${store.kind}`);

  for (const s of seeds) await store.recordOutcome(s);
  console.log(`  \x1b[32m✓\x1b[0m เก็บ outcome 2 task (G0.3, G1.5) + task nodes + failed_with edges`);

  const grounded = await store.groundContext(newTask, { tier: "H1", budget: 4000 });

  if (mode === "file") {
    if (grounded !== null) throw new Error("file mode ต้องคืน null (ไม่มี GRL)");
    console.log(`  \x1b[32m✓\x1b[0m file mode คืน null -> degrade เป็น static scope.docs (ถูกต้อง)`);
  } else {
    if (!grounded?.lines?.length) throw new Error("genesisdb groundContext ไม่คืนงานที่เกี่ยวข้อง");
    console.log(`  \x1b[32m✓\x1b[0m grounded: ${grounded.lines.length} งานเกี่ยวข้อง · ~${grounded.tokenEstimate ?? "?"} tok`);
    for (const l of grounded.lines) console.log(`     • ${l}`);
    console.log(`     reasoningPath: ${(grounded.reasoningPath || "").slice(0, 70)}`);
    const prompt = buildPrompt(newTask, "ollama:gemma4-rust-coder", "ollama", null, null, grounded);
    if (!prompt.includes("บริบทงานที่เกี่ยวข้อง")) throw new Error("buildPrompt ไม่ได้ inject grounded block");
    console.log(`  \x1b[32m✓\x1b[0m buildPrompt inject "บริบทงานที่เกี่ยวข้อง" แล้ว`);
  }

  await store.close?.();
  rmSync(BRAIN, { recursive: true, force: true });
  console.log(`\n\x1b[32m=== L2 ผ่าน (mode=${mode}) ===\x1b[0m\n`);
}
main().catch((e) => { console.error(`\n\x1b[31m✗ L2 ล้มเหลว:\x1b[0m ${e.stack || e.message}`); process.exit(1); });
