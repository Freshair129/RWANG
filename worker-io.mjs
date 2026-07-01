// worker-io.mjs — text-to-file execution for SLM-friendly dispatch.
//
// Small local models are unreliable at agentic tool-calling but fine at plain text generation. For a
// "write this content to a file" atom, set `writeOutputTo` on the atom: the worker then runs in plain
// TEXT mode (no tool loop) and the ENGINE writes the model's answer to the target file. Avoids the
// fragile tool loop entirely for content-producing tasks.
// Zero-dependency Node ESM.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

// A task opts into text-to-file mode by declaring where its output goes.
export function wantsTextFile(task) {
  const p = task?.writeOutputTo || task?.textOut;
  return (typeof p === "string" && p.trim()) ? p.trim() : null;
}

// Strip a single wrapping ``` fence if the model wrapped the whole answer in one (common with SLMs).
export function unfence(text) {
  const m = String(text ?? "").trim().match(/^```[\w.-]*\n([\s\S]*?)\n?```$/);
  return m ? m[1] : String(text ?? "");
}

// Write the model's answer to `target` (absolute, or relative to root). Returns the resolved path.
export function writeAnswerFile(root, target, text) {
  if (!target) throw new Error("writeAnswerFile: no target path");
  // normalize a leading "/C:/..." that some models emit on Windows
  const cleaned = String(target).replace(/^\/([A-Za-z]:)/, "$1");
  const path = isAbsolute(cleaned) ? cleaned : resolve(root || ".", cleaned);
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, unfence(text), "utf8");
  return path;
}
