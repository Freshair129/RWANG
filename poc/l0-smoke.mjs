/**
 * Smoke test L0 — failure write-only adapter (store/knowledge.mjs)
 * รัน:  node orchestration/poc/l0-smoke.mjs file
 *       node orchestration/poc/l0-smoke.mjs genesisdb
 * พิสูจน์: recordOutcome() ของ outcome ที่ Verify Gate ตีกลับ -> เขียน failure ลง store ได้ ไม่ throw
 */
import { getStore } from "../store/knowledge.mjs";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const mode = process.argv[2] || "file";
const FAILLOG = join(dirname(fileURLToPath(import.meta.url)), "..", "brain", "failures.jsonl");

const CONFIG = {
  store: {
    knowledge: mode,
    genesisdb: { bindingPath: "G:/GenesisBlock_Dev/GenesisBlock/index.js", path: "", vectorDim: 1024, embedModel: "bge-m3:latest", ollamaHost: "http://127.0.0.1:11434" },
  },
};

// outcome จำลองแบบที่ executeWithReview ส่งมาตอน needs-rework (review.issues จริง)
const outcome = {
  taskId: "SMOKE-1", taskTitle: "CI: clippy + tauri build", type: "config",
  model: "ollama:gemma4-rust-coder", worker: "smoke", status: "needs-rework",
  at: new Date().toISOString(),
  issues: [
    { severity: "critical", area: "correctness", detail: "hallucinate 'actions/setup-rust@v3' ที่ไม่มีจริง", fix: "ใช้ 'dtolnay/rust-toolchain@stable'" },
    { severity: "major", area: "correctness", detail: "ลืม prefix 'pnpm' หน้า build", fix: "ใช้ 'pnpm build:web'" },
  ],
  summary: "CI workflow ใช้ action ปลอม + ลืม pnpm",
};

async function main() {
  console.log(`\n=== L0 smoke (mode=${mode}) ===`);
  const before = existsSync(FAILLOG) ? readFileSync(FAILLOG, "utf8").split("\n").filter(Boolean).length : 0;
  const store = getStore(CONFIG);
  console.log(`  store.kind = ${store.kind}`);

  await store.recordOutcome(outcome);
  await store.close?.();

  const lines = readFileSync(FAILLOG, "utf8").split("\n").filter(Boolean);
  const added = lines.length - before;
  if (added !== outcome.issues.length) throw new Error(`คาด +${outcome.issues.length} row, ได้ +${added}`);
  console.log(`  \x1b[32m✓\x1b[0m เขียน ${added} failure rows ลง brain/failures.jsonl`);
  const last = JSON.parse(lines[lines.length - 1]);
  console.log(`  \x1b[32m✓\x1b[0m row ล่าสุด: [${last.severity}] ${last.issue} → ${last.fix}`);
  if (mode === "genesisdb") console.log(`  \x1b[32m✓\x1b[0m genesisdb: addNode + embedding (bge-m3) ผ่าน ไม่ throw`);
  console.log(`\n\x1b[32m=== L0 ผ่าน (mode=${mode}) ===\x1b[0m\n`);
}
main().catch((e) => { console.error(`\n\x1b[31m✗ L0 ล้มเหลว:\x1b[0m ${e.stack || e.message}`); process.exit(1); });
