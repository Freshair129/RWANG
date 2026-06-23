# ADR-O-001 â€” Verify Gate: independent per-task code review before `done`

> **Series:** ADR-O (orchestrator-scoped â€” à¹à¸¢à¸à¸ˆà¸²à¸ ADR-01..07 à¸‚à¸­à¸‡à¸•à¸±à¸§à¸œà¸¥à¸´à¸•à¸ à¸±à¸“à¸‘à¹Œ G-Maiden à¹ƒà¸™
> `docs/architecture/technical-design-document.md`)
> **Status:** Approved (2026-06-21, USER/Boss Â· RUNBOOK Gate 3)
> **Date:** 2026-06-21
> **Spec:** [SPEC--VERIFY-GATE.md](SPEC--VERIFY-GATE.md)

---

## Context

orchestrator (`orchestration/`) à¹à¸ˆà¸à¸ˆà¹ˆà¸²à¸¢ task à¹ƒà¸«à¹‰ AI worker (Claude tiers à¸«à¸£à¸·à¸­ local Ollama) à¹à¸¥à¹‰à¸§
mark `done` à¸ˆà¸²à¸ **à¸ªà¸±à¸à¸à¸²à¸“à¸à¸²à¸£à¸—à¸³à¸ˆà¸š** à¹€à¸—à¹ˆà¸²à¸™à¸±à¹‰à¸™ (exit code / à¸¡à¸µ output / à¹„à¸¡à¹ˆ BLOCKED) â€” **à¹„à¸¡à¹ˆà¹„à¸”à¹‰à¸•à¸£à¸§à¸ˆ
à¸„à¸§à¸²à¸¡à¸–à¸¹à¸à¸•à¹‰à¸­à¸‡à¹€à¸—à¸µà¸¢à¸š `acceptance`**.

à¸œà¸¥à¸—à¸µà¹ˆà¸ªà¸±à¸‡à¹€à¸à¸•à¸ˆà¸£à¸´à¸‡: task `G0.3` à¸‚à¸¶à¹‰à¸™ `done` à¸—à¸±à¹‰à¸‡à¸—à¸µà¹ˆ output à¸¡à¸µà¸‚à¹‰à¸­à¸œà¸´à¸” (`actions/setup-rust@v3` à¹€à¸›à¹‡à¸™ action
à¸—à¸µà¹ˆà¹„à¸¡à¹ˆà¸¡à¸µà¸ˆà¸£à¸´à¸‡, à¸¥à¸·à¸¡ `pnpm` prefix). output à¸ˆà¸²à¸ local model à¹€à¸›à¹‡à¸™ "draft" à¹‚à¸”à¸¢à¸˜à¸£à¸£à¸¡à¸Šà¸²à¸•à¸´ â€” `done` à¸ˆà¸¶à¸‡
à¸ªà¸·à¹ˆà¸­à¸„à¸§à¸²à¸¡à¸«à¸¡à¸²à¸¢à¸œà¸´à¸” ("à¸ˆà¸š" â‰  "à¸œà¹ˆà¸²à¸™") à¹à¸¥à¸°à¸—à¸³à¹ƒà¸«à¹‰ progress à¸—à¸µà¹ˆà¹€à¸«à¹‡à¸™à¹€à¸Šà¸·à¹ˆà¸­à¸–à¸·à¸­à¹„à¸¡à¹ˆà¹„à¸”à¹‰.

à¹€à¸­à¸à¸ªà¸²à¸£à¸­à¸­à¸à¹à¸šà¸šà¹€à¸£à¸µà¸¢à¸à¸£à¹‰à¸­à¸‡à¸à¸²à¸£à¸•à¸£à¸§à¸ˆà¸­à¸¢à¸¹à¹ˆà¹à¸¥à¹‰à¸§ (`docs/architecture/engineering-spec.md` Â§7 Definition of Done,
`CONCEPT--SUBAGENT-CONTEXT-SCOPING` Â§"why escalation is load-bearing") à¹à¸•à¹ˆà¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸–à¸¹à¸ wire à¹€à¸‚à¹‰à¸² runtime.

## Decision

à¹à¸—à¸£à¸ **Verify Gate** à¸£à¸°à¸«à¸§à¹ˆà¸²à¸‡ "produce" à¸à¸±à¸š "done": à¸«à¸¥à¸±à¸‡ worker à¸œà¸¥à¸´à¸• output à¸ˆà¸° spawn
**reviewer agent à¸­à¸´à¸ªà¸£à¸°** (à¸„à¸™à¸¥à¸° model tier à¸à¸±à¸š worker) à¸¡à¸²à¸•à¸£à¸§à¸ˆ output à¹€à¸—à¸µà¸¢à¸š `acceptance` à¹à¸¥à¹‰à¸§à¸„à¸·à¸™
verdict à¹à¸šà¸š structured. task à¹€à¸›à¹‡à¸™ `done` **à¸à¹‡à¸•à¹ˆà¸­à¹€à¸¡à¸·à¹ˆà¸­à¸œà¹ˆà¸²à¸™ review** (à¹„à¸¡à¹ˆà¸¡à¸µ critical issue); à¹„à¸¡à¹ˆà¸œà¹ˆà¸²à¸™ â†’
`needs-rework` à¸žà¸£à¹‰à¸­à¸¡ issues (auto re-dispatch à¹„à¸”à¹‰à¸ªà¸¹à¸‡à¸ªà¸¸à¸” `maxReworkRounds` à¸£à¸­à¸š).

à¸«à¸¥à¸±à¸à¸à¸²à¸£à¸šà¸±à¸‡à¸„à¸±à¸š:
1. **à¸«à¹‰à¸²à¸¡ self-review** â€” reviewer à¸•à¹‰à¸­à¸‡à¸„à¸™à¸¥à¸° tier (worker local/haiku â†’ reviewer sonnet; sonnet â†’ opus)
2. **Reviewer scope à¹à¸„à¸š (POLA)** â€” à¹€à¸«à¹‡à¸™à¹€à¸‰à¸žà¸²à¸° acceptance + output + scope.docs à¸‚à¸­à¸‡ task à¸™à¸±à¹‰à¸™ à¹„à¸¡à¹ˆà¹ƒà¸Šà¹ˆà¸—à¸±à¹‰à¸‡ repo
3. **Adversarial** â€” reviewer à¸žà¸¢à¸²à¸¢à¸²à¸¡à¸«à¸²à¸‚à¹‰à¸­à¸œà¸´à¸”à¸à¹ˆà¸­à¸™, default `fail` à¹€à¸¡à¸·à¹ˆà¸­à¹„à¸¡à¹ˆà¸¡à¸±à¹ˆà¸™à¹ƒà¸ˆ
4. **Fail-safe** â€” reviewer à¹ƒà¸Šà¹‰à¹„à¸¡à¹ˆà¹„à¸”à¹‰ â†’ à¸„à¹‰à¸²à¸‡ `reviewing` à¹„à¸¡à¹ˆ auto-pass
5. **à¹„à¸¡à¹ˆà¸§à¸™à¹„à¸¡à¹ˆà¸ˆà¸š** â€” à¸„à¸£à¸š maxReworkRounds â†’ à¸„à¹‰à¸²à¸‡ `needs-rework` à¹ƒà¸«à¹‰à¸„à¸™ (surface à¹„à¸¡à¹ˆà¹€à¸‡à¸µà¸¢à¸š)

## Alternatives considered

| à¸—à¸²à¸‡à¹€à¸¥à¸·à¸­à¸ | à¸—à¸³à¹„à¸¡à¹„à¸¡à¹ˆà¹€à¸¥à¸·à¸­à¸ |
| --- | --- |
| **A. à¸„à¸‡à¹€à¸”à¸´à¸¡ (à¹„à¸¡à¹ˆ review)** | `done` à¸«à¸¥à¸­à¸à¸•à¸²; draft à¸œà¸´à¸” à¹† à¸œà¹ˆà¸²à¸™à¹„à¸”à¹‰ â€” à¸›à¸±à¸à¸«à¸²à¸—à¸µà¹ˆà¸à¸³à¸¥à¸±à¸‡à¹à¸à¹‰ |
| **B. self-review (worker à¸•à¸£à¸§à¸ˆà¹€à¸­à¸‡)** | à¸¥à¸³à¹€à¸­à¸µà¸¢à¸‡ â€” à¹‚à¸¡à¹€à¸”à¸¥à¹€à¸”à¸µà¸¢à¸§à¸à¸±à¸™à¸¡à¸­à¸‡à¹„à¸¡à¹ˆà¹€à¸«à¹‡à¸™à¸‚à¹‰à¸­à¸œà¸´à¸”à¸•à¸±à¸§à¹€à¸­à¸‡; à¸‚à¸±à¸” CONCEPT (independence) |
| **C. human-only review** | à¹„à¸¡à¹ˆ scale à¸à¸±à¸š 45 task / fan-out; à¸„à¸™à¸à¸¥à¸²à¸¢à¹€à¸›à¹‡à¸™à¸„à¸­à¸‚à¸§à¸” |
| **D. static check à¸­à¸¢à¹ˆà¸²à¸‡à¹€à¸”à¸µà¸¢à¸§** (lint/compile) | à¸ˆà¸±à¸šà¹„à¸”à¹‰à¹à¸„à¹ˆ syntax à¹„à¸¡à¹ˆà¸ˆà¸±à¸š "à¸•à¸£à¸‡ acceptance à¹„à¸«à¸¡ / action à¸›à¸¥à¸­à¸¡ / logic"; à¹€à¸ªà¸£à¸´à¸¡à¹„à¸”à¹‰à¹à¸•à¹ˆà¹„à¸¡à¹ˆà¸žà¸­ |
| **E. judge panel à¸«à¸¥à¸²à¸¢à¸•à¸±à¸§à¸—à¸¸à¸ task** | à¹à¸žà¸‡ token à¹€à¸à¸´à¸™à¸ˆà¸³à¹€à¸›à¹‡à¸™à¸ªà¸³à¸«à¸£à¸±à¸šà¸‡à¸²à¸™à¸—à¸±à¹ˆà¸§à¹„à¸› â€” à¹€à¸à¹‡à¸šà¹„à¸§à¹‰à¹€à¸›à¹‡à¸™ opt-in à¸‡à¸²à¸™à¸ªà¸³à¸„à¸±à¸ (à¹€à¸Ÿà¸ªà¸–à¸±à¸”à¹„à¸›) |

## Consequences

**à¸”à¸µ**
- `done` à¸¡à¸µà¸„à¸§à¸²à¸¡à¸«à¸¡à¸²à¸¢à¸ˆà¸£à¸´à¸‡ = "à¸œà¹ˆà¸²à¸™ acceptance" â†’ progress à¹€à¸Šà¸·à¹ˆà¸­à¸–à¸·à¸­à¹„à¸”à¹‰
- à¸ˆà¸±à¸š draft à¸œà¸´à¸”à¸‚à¸­à¸‡ local model à¸­à¸±à¸•à¹‚à¸™à¸¡à¸±à¸•à¸´à¸à¹ˆà¸­à¸™à¸ªà¸°à¸ªà¸¡à¹€à¸›à¹‡à¸™à¸«à¸™à¸µà¹‰
- review-reject count à¹€à¸›à¹‡à¸™ quality signal (à¸•à¸²à¸¡ CONCEPT)
- à¹€à¸‚à¹‰à¸²à¸à¸±à¸š pattern à¹€à¸”à¸´à¸¡ (POLA scope, model-tier routing, BLOCKED escalation)

**à¹à¸¥à¸à¸¡à¸²**
- **+1 agent/task** (reviewer à¹ƒà¸Šà¹‰ token tier claude à¹€à¸ªà¸¡à¸­ à¹à¸¡à¹‰ worker à¹€à¸›à¹‡à¸™ local à¸Ÿà¸£à¸µ) â†’ à¸•à¹‰à¸™à¸—à¸¸à¸™à¹€à¸žà¸´à¹ˆà¸¡
  â†’ à¸šà¸£à¸£à¹€à¸—à¸²à¸”à¹‰à¸§à¸¢ `requireReview:false` à¸•à¹ˆà¸­ task à¹à¸¥à¸° `skipForDraft` (à¸‡à¸²à¸™ local draft à¸‚à¹‰à¸²à¸¡ review à¹„à¸”à¹‰)
- à¹€à¸žà¸´à¹ˆà¸¡ latency à¸•à¹ˆà¸­ task (à¸£à¸µà¸§à¸´à¸§à¸à¹ˆà¸­à¸™à¸›à¸´à¸”)
- reviewer à¹€à¸­à¸‡à¸­à¸²à¸ˆà¸œà¸´à¸” (false fail/pass) â†’ à¸šà¸£à¸£à¹€à¸—à¸²à¸”à¹‰à¸§à¸¢ adversarial framing + human escalation à¸—à¸µà¹ˆà¸›à¸¥à¸²à¸¢à¸—à¸²à¸‡
- à¹€à¸žà¸´à¹ˆà¸¡à¸„à¸§à¸²à¸¡à¸‹à¸±à¸šà¸‹à¹‰à¸­à¸™ state machine (`reviewing`, `needs-rework`)

## Compliance / links
- POLA reviewer scoping â†’ `docs/research/concepts/subagent-context-scoping.md`
- Definition of Done à¸—à¸µà¹ˆ gate à¸„à¸§à¸£à¸šà¸±à¸‡à¸„à¸±à¸š â†’ `docs/architecture/engineering-spec.md` Â§7
- discipline à¸‚à¸­à¸‡ output à¸—à¸µà¹ˆ reviewer à¸•à¸£à¸§à¸ˆ â†’ `docs/guides/small-model-prompting.md`
- à¸£à¸²à¸¢à¸¥à¸°à¹€à¸­à¸µà¸¢à¸” workflow/schema/config/edge-case â†’ [SPEC--VERIFY-GATE.md](SPEC--VERIFY-GATE.md)

## Revisit when
- à¸•à¹‰à¸™à¸—à¸¸à¸™ review à¸ªà¸¹à¸‡à¹€à¸à¸´à¸™à¸£à¸±à¸š â†’ à¸žà¸´à¸ˆà¸²à¸£à¸“à¸² static-check-first à¹à¸¥à¹‰à¸§à¸„à¹ˆà¸­à¸¢ agent-review à¹€à¸‰à¸žà¸²à¸°à¸—à¸µà¹ˆà¸œà¹ˆà¸²à¸™ static
- à¸•à¹‰à¸­à¸‡à¸à¸²à¸£à¸„à¸§à¸²à¸¡à¹€à¸Šà¸·à¹ˆà¸­à¸¡à¸±à¹ˆà¸™à¸ªà¸¹à¸‡à¸‚à¸¶à¹‰à¸™à¹ƒà¸™à¸‡à¸²à¸™à¸ªà¸³à¸„à¸±à¸ â†’ à¸¢à¸ reviewer à¹€à¸›à¹‡à¸™ judge panel (majority vote)
- à¸¡à¸µ escalate() round-trip à¸ˆà¸£à¸´à¸‡ (à¸•à¸²à¸¡ CONCEPT) â†’ à¸œà¸¹à¸ needs-rework à¹€à¸‚à¹‰à¸²à¸à¸±à¸š escalation API




