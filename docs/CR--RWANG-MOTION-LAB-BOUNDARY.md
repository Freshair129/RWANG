---
version: "0.1.3b"
created_at: "2026-07-22T00:20:00+07:00,ATHER,pending"
last_update: "2026-07-22T03:10:00+07:00,ATHER"
status: "beta"
superseded_by: null
attributes:
  domain: "rwang-architecture"
  doc_type: "architecture-change-request"
  scope: "RWANG harness, desktop motion adapter, and skill distribution boundaries"
  language: "th-TH+en"
---

# CR — RWANG Motion Lab Boundary and Promax Readiness

## 1. Decision requested

Approve the following repository boundaries before any rename, Git-history repair, fork, or source move:

1. `G:\Rwang` remains the canonical RWANG harness/control-plane source.
2. `D:\RWANG-PROMAX` is renamed to `rwang-motion-lab` and remains an experimental desktop interaction project.
3. The experimental project is not branded or released as `RWANG-PROMAX` until the readiness criteria in this CR are met.
4. `G:\Rwang\RWANG-PROMAX-skills` remains a separate skill-distribution concern until an approved adapter migration defines its replacement.

## 2. Verified current state

| Surface | Verified role | Evidence boundary |
|---|---|---|
| `G:\Rwang` | Node/Python control plane for spec-driven orchestration, cost routing, governance, and run monitoring | Source-pinned runtime dependency closure and `backlog.json` were recovered; `node --test tests/runtime-import.test.mjs` passes. Broader runtime behavior is not yet claimed. |
| `D:\rwang-motion-lab\app` | Tauri/React desktop app with MediaPipe hand tracking, webcam capture, gesture routing, and a Windows media-key dispatcher | `npm test -- --reporter=verbose` exits cleanly with 22 tests passing and `npm run build` passes. Loopback telemetry now publishes only the versioned envelope and Rust validates it plus the local policy state. Harness consumption, real hardware, and depth-gesture proof remain incomplete. |
| `G:\Rwang\RWANG-PROMAX-skills` | Installer and three-skill governance bundle | It is tracked by the parent as a gitlink without a `.gitmodules` mapping; the relationship is not reproducible. |

## 3. Target architecture

```text
RWANG harness (canonical control plane)
  ├─ runtime: orchestration, workers, context, memory, governance
  ├─ adapters
  │   ├─ desktop-motion: rwang-motion-lab (experimental until promoted)
  │   └─ host-skills: Codex/Claude/Antigravity compatibility adapters
  └─ evidence ledger and approval boundaries

rwang-motion-lab
  └─ local camera → gesture classification → whitelisted command intent
```

The desktop adapter MUST NOT send raw camera frames to the harness. It may emit only a versioned, local-first command intent with gesture type, confidence, timestamp, source, and policy result. Windows media-key dispatch remains local, explicit opt-in, and whitelist-gated.

## 4. Naming contract

| Current path/name | Approved target role | Target name |
|---|---|---|
| `D:\RWANG-PROMAX` | Experimental motion/gesture/command project | `rwang-motion-lab` |
| `G:\Rwang` | Canonical harness source | `rwang` (product/repository identity when a rename is separately approved) |
| `G:\Rwang\RWANG-PROMAX-skills` | Existing skill-distribution bundle | No rename or move in this CR |

`RWANG-PROMAX` is reserved for a promoted release, not an experimental folder.

## 5. Promotion readiness for RWANG-PROMAX

The motion adapter may be promoted only when all conditions below have evidence:

1. Harness runtime has a clean import/build/test gate, including restored or replaced missing runtime modules.
2. Motion lab has valid Git provenance, a reproducible build, and a test command that exits cleanly.
3. Camera permission, hand detection, gesture mapping, and local Windows media dispatch pass an end-to-end hardware test.
4. Any depth gesture has its own classifier and test evidence; specification text alone is insufficient.
5. A versioned `gesture_command_intent` contract is approved and tested between desktop adapter and harness.
6. The adapter proves raw frames stay local; only whitelisted intents may cross its outbound port.
7. Host-skill distribution has a separately approved migration away from the current unmapped gitlink.

## 6. Non-goals

- No folder rename, Git repair, fork, merge, or code move is performed by this CR alone.
- No arbitrary OS input injection, browser automation, or remote camera streaming is introduced.
- No claim is made that the current `depth_double_tap` proposal is production-ready.

## 7. Risk assessment

**HIGH / C-3.** This affects repository identity, Git provenance, desktop OS-command safety, camera privacy, and the boundary between a control plane and a user-facing adapter.

## 8. Implementation plan after approval

1. Create a recoverable Git-provenance plan for `D:\RWANG-PROMAX`, then rename it to `rwang-motion-lab` without overwriting an existing target.
2. Repair and verify the RWANG harness import graph before introducing new adapter contracts.
3. Define the adapter port and local-only policy gate; add cross-repository conformance tests only when an adapter implementation is introduced.
4. Create an adapter migration plan for the skill bundle; remove the invalid gitlink only after its replacement is verified.
5. Run independent architecture review and full acceptance evidence before reserving the `RWANG-PROMAX` release identity.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---------|------|--------|---------|-------------|-------|
| 0.1.3b | 2026-07-22 | beta | Recorded local contract projection/validation and backend command-mode policy gate. | pending | ATHER |
| 0.1.2b | 2026-07-22 | beta | Recorded reviewer finding: current loopback telemetry is not the approved adapter contract. | pending | ATHER |
| 0.1.1b | 2026-07-22 | beta | Recorded verified harness import recovery, Motion Lab build/test evidence, and canonical adapter contract. | pending | ATHER |
| 0.1.0b | 2026-07-22 | beta | Owner approved Wave 1: rwang-motion-lab boundary and recoverable rename. | pending | ATHER |
| 0.1.0b | 2026-07-22 | candidate | Proposed the rwang-motion-lab boundary and RWANG-PROMAX promotion criteria. | pending | ATHER |
