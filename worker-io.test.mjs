// worker-io.test.mjs — text-to-file dispatch helpers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { wantsTextFile, unfence, writeAnswerFile } from "./worker-io.mjs";

test("wantsTextFile returns the target path only when declared", () => {
  assert.equal(wantsTextFile({ writeOutputTo: "docs/x.md" }), "docs/x.md");
  assert.equal(wantsTextFile({ textOut: "  y.txt  " }), "y.txt");
  assert.equal(wantsTextFile({}), null);
  assert.equal(wantsTextFile({ writeOutputTo: "" }), null);
});

test("unfence strips a single wrapping code fence", () => {
  assert.equal(unfence("```md\nhello\n```"), "hello");
  assert.equal(unfence("```\nplain\n```"), "plain");
  assert.equal(unfence("no fence here"), "no fence here");
});

test("writeAnswerFile writes (creating dirs) to absolute + relative targets, normalizing /C:", () => {
  const root = mkdtempSync(join(tmpdir(), "wio-"));
  const rel = writeAnswerFile(root, "sub/dir/hello.md", "hi there");
  assert.ok(existsSync(rel));
  assert.equal(readFileSync(rel, "utf8"), "hi there");
  const absTarget = join(root, "abs.md");
  const abs = writeAnswerFile(root, absTarget, "```\nfenced\n```");
  assert.equal(readFileSync(abs, "utf8"), "fenced"); // unfenced on write
  rmSync(root, { recursive: true, force: true });
});
