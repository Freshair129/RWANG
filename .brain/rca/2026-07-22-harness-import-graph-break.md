---
version: "0.1.1b"
created_at: "2026-07-22T01:00:00+07:00,ATHER,pending"
last_update: "2026-07-22T01:30:00+07:00,ATHER"
status: "beta"
superseded_by: null
attributes:
  domain: "rwang-runtime"
  doc_type: "rca"
  scope: "G:\\Rwang runtime module graph"
---

# RCA — RWANG Harness Import Graph Break

## Symptom

`node -e "import('./server.mjs')"` and `node -e "import('./planner.mjs')"` fail before execution with `ERR_MODULE_NOT_FOUND` for `G:\Rwang\providers.mjs`.

## Evidence

- `engine.mjs` and `planner.mjs` import `./providers.mjs`.
- `server.mjs` imports `./providers.mjs`, `./accounts.mjs`, `./runs-reader.mjs`, and `./chain-verify.mjs`.
- All four paths are absent from `G:\Rwang`.
- A separate verified checkout at `D:\rwang\RWANG` commit `c2f071d6425a3a4ee7d73de8c7b9dd2ba14b77c8` contains all four modules and exports the exact names imported by the harness.
- Runtime import then revealed the transitive closure: `account-identity.mjs`, `image.mjs`, `ollama-vram.mjs`, and `worker-io.mjs`, plus required startup data `backlog.json`, were also absent.
- The recovered files have normalized-content parity with that pinned source. `node --test tests/runtime-import.test.mjs` now passes.

## Root Cause

The parent harness repository has a truncated runtime package: entrypoint files were retained while direct dependencies, their import closure, and required startup data were omitted. This is a repository-completeness defect, not a provider configuration failure.

## Why the issue escaped detection

The repository has no import-graph smoke test for `engine.mjs` and `planner.mjs`; syntax checks pass without resolving ESM imports. Existing governance tests do not exercise these entrypoint imports.

## Proposed Prevention

Add a deterministic runtime import-contract test that verifies the direct and transitive module closure, required startup data, and dynamically imports non-listening entrypoints. Keep the recovered module set source-pinned in the migration record and require the test in future validation.

## Status

Recovery is limited to the source-pinned runtime closure and `backlog.json`: no unrelated config, behavior, or provider routing was changed. Any incompatibility found during broader runtime verification blocks promotion and requires a follow-up RCA.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---------|------|--------|---------|-------------|-------|
| 0.1.1b | 2026-07-22 | beta | Added transitive-closure and startup-data evidence after import smoke test passed. | pending | ATHER |
| 0.1.0b | 2026-07-22 | under review | Initial RCA. | pending | ATHER |
