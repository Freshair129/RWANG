# SPEC â€” Verify Gate (per-task code review)

> **Status:** Approved (2026-06-21, USER/Boss Â· RUNBOOK Gate 2) â€” implement à¹à¸¥à¹‰à¸§à¹ƒà¸™ engine.mjs
> **Scope:** orchestration/ (multi-agent task orchestrator) â€” à¹„à¸¡à¹ˆà¹ƒà¸Šà¹ˆà¸•à¸±à¸§à¸œà¸¥à¸´à¸•à¸ à¸±à¸“à¸‘à¹Œ G-Maiden
> **Governed by:** [ADR-O-001](ADR-O-001--verify-gate.md)
> **à¸­à¹‰à¸²à¸‡à¸­à¸´à¸‡:** `docs/research/concepts/subagent-context-scoping.md` (reviewer scoping),
> `docs/architecture/engineering-spec.md` Â§7 (Definition of Done), `docs/guides/small-model-prompting.md`

---

## 1. à¸›à¸±à¸à¸«à¸² (à¸—à¸³à¹„à¸¡à¸•à¹‰à¸­à¸‡à¸¡à¸µ)

à¸•à¸­à¸™à¸™à¸µà¹‰ orchestrator mark task à¹€à¸›à¹‡à¸™ `done` à¸ˆà¸²à¸ **à¸ªà¸±à¸à¸à¸²à¸“à¸§à¹ˆà¸² "à¸—à¸³à¸ˆà¸š"** à¹€à¸—à¹ˆà¸²à¸™à¸±à¹‰à¸™:
- claude: exit 0 + à¹„à¸¡à¹ˆà¹€à¸ˆà¸­ `BLOCKED:`
- ollama: à¸¡à¸µ content (à¹„à¸¡à¹ˆ empty) + à¹„à¸¡à¹ˆ BLOCKED

**à¹„à¸¡à¹ˆà¸¡à¸µà¸à¸²à¸£à¸•à¸£à¸§à¸ˆà¸§à¹ˆà¸² output à¸–à¸¹à¸à¸•à¹‰à¸­à¸‡/à¸•à¸£à¸‡ acceptance à¸ˆà¸£à¸´à¸‡à¹„à¸«à¸¡.** à¸œà¸¥à¸„à¸·à¸­ `done` = "à¸ˆà¸š" à¹„à¸¡à¹ˆà¹ƒà¸Šà¹ˆ "à¸œà¹ˆà¸²à¸™" â€”
à¸«à¸¥à¸­à¸à¸•à¸²à¹€à¸§à¸¥à¸²à¸”à¸¹ progress (à¹€à¸Šà¹ˆà¸™ G0.3 à¸‚à¸¶à¹‰à¸™ done à¸—à¸±à¹‰à¸‡à¸—à¸µà¹ˆà¸¡à¸µ GitHub Action à¸›à¸¥à¸­à¸¡ `actions/setup-rust@v3`
à¹à¸¥à¸°à¸¥à¸·à¸¡ `pnpm` prefix). à¹‚à¸”à¸¢à¹€à¸‰à¸žà¸²à¸° output à¸ˆà¸²à¸ local model à¸—à¸µà¹ˆà¹€à¸›à¹‡à¸™ draft.

**Verify Gate** à¹à¸—à¸£à¸à¸‚à¸±à¹‰à¸™ **review à¹‚à¸”à¸¢ agent à¸­à¸´à¸ªà¸£à¸°** à¸£à¸°à¸«à¸§à¹ˆà¸²à¸‡ "produce" à¸à¸±à¸š "done" à¹€à¸žà¸·à¹ˆà¸­à¹ƒà¸«à¹‰
`done` à¹à¸›à¸¥à¸§à¹ˆà¸² "à¸œà¹ˆà¸²à¸™ acceptance à¹à¸¥à¹‰à¸§".

---

## 2. Workflow (state machine)

```
                    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ rework loop (â‰¤ maxReworkRounds) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
                    â–¼                                                                           â”‚
 todo â”€â”€claimâ”€â”€â–º running â”€â”€produceâ”€â”€â–º reviewing â”€â”€reviewâ”€â”€â–º  â”Œâ”€â”€ pass â”€â”€â–º done                  â”‚
   â–²                                      â”‚                  â””â”€â”€ fail â”€â”€â–º needs-rework â”€â”€re-dispatch (à¹à¸™à¸š issues)
   â”‚                                      â”‚
   â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ release â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   (empty/BLOCKED à¸ˆà¸²à¸ produce = à¸‚à¹‰à¸²à¸¡ review â†’ failed à¸—à¸±à¸™à¸—à¸µ)
```

à¸ªà¸–à¸²à¸™à¸°à¹ƒà¸«à¸¡à¹ˆà¸—à¸µà¹ˆà¹€à¸žà¸´à¹ˆà¸¡: **`reviewing`**, **`needs-rework`**
(à¸‚à¸­à¸‡à¹€à¸”à¸´à¸¡: `todo / claimed / running / done / failed`)

### à¸à¸•à¸´à¸à¸²à¹€à¸›à¸¥à¸µà¹ˆà¸¢à¸™à¸ªà¸–à¸²à¸™à¸°
1. produce à¹€à¸ªà¸£à¹‡à¸ˆ + `ok && !empty && !blocked` â†’ à¹€à¸‚à¹‰à¸² **`reviewing`** (à¸–à¹‰à¸² `requireReview`); à¹„à¸¡à¹ˆà¸‡à¸±à¹‰à¸™ â†’ `done` à¹€à¸¥à¸¢
2. reviewer à¸•à¸±à¸”à¸ªà¸´à¸™:
   - **pass** â†’ `done`
   - **fail** â†’ `needs-rework` (à¹à¸™à¸š `issues[]` à¸¥à¸‡ log)
3. à¸–à¹‰à¸² `autoRework` à¹€à¸›à¸´à¸”: `needs-rework` â†’ re-dispatch worker à¹€à¸”à¸´à¸¡ à¹‚à¸”à¸¢à¹à¸™à¸š issues à¹€à¸‚à¹‰à¸² prompt â†’ à¸§à¸™à¸‚à¹‰à¸­ 1
   à¸ˆà¸™à¸à¸§à¹ˆà¸² **pass** à¸«à¸£à¸·à¸­à¸„à¸£à¸š **`maxReworkRounds`** â†’ à¸„à¹‰à¸²à¸‡à¸—à¸µà¹ˆ `needs-rework` à¹ƒà¸«à¹‰à¸„à¸™à¸”à¸¹ (surface, à¹„à¸¡à¹ˆà¹€à¸‡à¸µà¸¢à¸š)
4. produce à¸—à¸µà¹ˆ `empty / BLOCKED` â†’ `failed` à¸—à¸±à¸™à¸—à¸µ à¹„à¸¡à¹ˆà¹€à¸‚à¹‰à¸² review (à¹„à¸¡à¹ˆà¸¡à¸µà¸­à¸°à¹„à¸£à¹ƒà¸«à¹‰à¸•à¸£à¸§à¸ˆ)

---

## 3. Reviewer agent

### 3.1 à¸„à¸§à¸²à¸¡à¹€à¸›à¹‡à¸™à¸­à¸´à¸ªà¸£à¸° (à¸«à¹‰à¸²à¸¡à¸•à¸£à¸§à¸ˆà¸‡à¸²à¸™à¸•à¸±à¸§à¹€à¸­à¸‡)
- reviewer **à¸•à¹‰à¸­à¸‡à¸„à¸™à¸¥à¸° model tier à¸à¸±à¸š worker** â€” worker à¸•à¸£à¸§à¸ˆà¸‡à¸²à¸™à¸•à¸±à¸§à¹€à¸­à¸‡à¸ˆà¸°à¸¥à¸³à¹€à¸­à¸µà¸¢à¸‡ (à¹€à¸«à¸¡à¸·à¸­à¸™ CONCEPT à¸§à¹ˆà¸²
  subagent à¸•à¸±à¹‰à¸‡ scope à¹€à¸­à¸‡à¹„à¸¡à¹ˆà¹„à¸”à¹‰)
- mapping à¹€à¸£à¸´à¹ˆà¸¡à¸•à¹‰à¸™ (`config.review.reviewerByTier`):

  | worker | reviewer |
  | --- | --- |
  | local (ollama) | `sonnet` |
  | haiku | `sonnet` |
  | sonnet | `opus` |
  | opus | `opus` (à¸«à¸£à¸·à¸­ skip â€” à¸‡à¸²à¸™à¸§à¸²à¸‡à¹à¸œà¸™ reviewer à¹€à¸—à¹ˆà¸²à¸à¸±à¸™à¸žà¸­) |

### 3.2 Scope à¹à¸„à¸š (POLA)
reviewer à¹„à¸”à¹‰à¹€à¸‰à¸žà¸²à¸°:
- `task.title` + `task.accept` (à¹€à¸à¸“à¸‘à¹Œà¸œà¹ˆà¸²à¸™)
- **output à¸‚à¸­à¸‡ task à¸™à¸±à¹‰à¸™** (à¸ˆà¸²à¸ log) â€” à¹„à¸¡à¹ˆà¹ƒà¸Šà¹ˆà¸—à¸±à¹‰à¸‡ repo
- `scope.docs` à¸‚à¸­à¸‡ task (à¸–à¹‰à¸²à¸ˆà¸³à¹€à¸›à¹‡à¸™à¸•à¹ˆà¸­à¸à¸²à¸£à¸•à¸£à¸§à¸ˆ; orchestrator-only à¸–à¸¹à¸à¸à¸£à¸­à¸‡à¸­à¸­à¸à¹€à¸«à¸¡à¸·à¸­à¸™à¹€à¸”à¸´à¸¡)

à¹„à¸¡à¹ˆà¹‚à¸«à¸¥à¸”à¸šà¸£à¸´à¸šà¸—à¸­à¸·à¹ˆà¸™à¹€à¸à¸´à¸™à¸ˆà¸³à¹€à¸›à¹‡à¸™ (à¸¥à¸” token + blast radius à¸•à¸²à¸¡ CONCEPT)

### 3.3 Adversarial framing
prompt à¹ƒà¸«à¹‰ reviewer **à¸žà¸¢à¸²à¸¢à¸²à¸¡à¸«à¸²à¸‚à¹‰à¸­à¸œà¸´à¸”** à¸à¹ˆà¸­à¸™ à¹„à¸¡à¹ˆà¹ƒà¸Šà¹ˆà¸«à¸²à¹€à¸«à¸•à¸¸à¸œà¸¥à¹ƒà¸«à¹‰à¸œà¹ˆà¸²à¸™ â€” default à¹€à¸›à¹‡à¸™ `fail` à¹€à¸¡à¸·à¹ˆà¸­à¹„à¸¡à¹ˆà¸¡à¸±à¹ˆà¸™à¹ƒà¸ˆ
(à¸ˆà¸²à¸ pattern adversarial-verify). à¸ªà¸³à¸«à¸£à¸±à¸š task à¸ªà¸³à¸„à¸±à¸à¸­à¸²à¸ˆà¹ƒà¸Šà¹‰ reviewer à¸«à¸¥à¸²à¸¢à¸•à¸±à¸§ (majority vote) â€” à¹€à¸Ÿà¸ªà¸–à¸±à¸”à¹„à¸›.

### 3.4 Output schema (structured)
reviewer à¸•à¹‰à¸­à¸‡à¸„à¸·à¸™ JSON à¸•à¸²à¸¡à¸™à¸µà¹‰ (à¸šà¸±à¸‡à¸„à¸±à¸šà¸£à¸¹à¸›à¹à¸šà¸š):

```json
{
  "verdict": "pass | fail",
  "score": 0,
  "issues": [
    { "severity": "critical | major | minor", "area": "correctness|security|nfr|style", "detail": "...", "fix": "..." }
  ],
  "summary": "à¸«à¸™à¸¶à¹ˆà¸‡à¸šà¸£à¸£à¸—à¸±à¸”"
}
```

### 3.5 à¸à¸•à¸´à¸à¸²à¸•à¸±à¸”à¸ªà¸´à¸™ (decision rule)
- `verdict == "pass"` **à¹à¸¥à¸°** à¹„à¸¡à¹ˆà¸¡à¸µ issue `severity == "critical"` â†’ **pass**
- à¸¡à¸µ critical à¹ƒà¸” à¹† â†’ **fail** (à¸•à¹ˆà¸­à¹ƒà¸«à¹‰ reviewer à¸šà¸­à¸ pass à¸à¹‡à¸•à¸²à¸¡ â€” à¸à¸±à¸™à¸¥à¸³à¹€à¸­à¸µà¸¢à¸‡)
- major à¸›à¸¥à¹ˆà¸­à¸¢à¸œà¹ˆà¸²à¸™à¹„à¸”à¹‰à¹à¸•à¹ˆ log à¹„à¸§à¹‰; à¸›à¸£à¸±à¸šà¹„à¸”à¹‰à¸”à¹‰à¸§à¸¢ `config.review.failOn` (`critical` | `major`)

---

## 4. Config (à¸—à¸µà¹ˆà¸ˆà¸°à¹€à¸žà¸´à¹ˆà¸¡à¹ƒà¸™ `config.json`)

```json
"review": {
  "enabled": true,
  "requireReviewDefault": true,
  "failOn": "critical",
  "autoRework": true,
  "maxReworkRounds": 1,
  "reviewerByTier": { "ollama": "sonnet", "haiku": "sonnet", "sonnet": "opus", "opus": "opus" },
  "skipForDraft": true
}
```

override à¸•à¹ˆà¸­ task à¹ƒà¸™ backlog: `task.requireReview: false` (à¹€à¸Šà¹ˆà¸™ à¸‡à¸²à¸™ draft local à¸—à¸µà¹ˆà¸•à¸±à¹‰à¸‡à¹ƒà¸ˆà¹ƒà¸«à¹‰à¸„à¸™à¹€à¸à¸¥à¸²à¸•à¹ˆà¸­
à¸­à¸¢à¸¹à¹ˆà¹à¸¥à¹‰à¸§ â€” `skipForDraft` à¸—à¸³à¹ƒà¸«à¹‰ task à¸—à¸µà¹ˆ pin `model:"local"` à¸‚à¹‰à¸²à¸¡ review à¹‚à¸”à¸¢à¸­à¸±à¸•à¹‚à¸™à¸¡à¸±à¸•à¸´à¹„à¸”à¹‰)

---

## 5. Telemetry & quality signal
- à¸šà¸±à¸™à¸—à¸¶à¸ verdict + issues à¸¥à¸‡ log à¹à¸¢à¸ (`logs/<id>.<worker>.review.log`) à¹à¸¥à¸°à¸™à¸±à¸šà¹ƒà¸™ usage ledger
  (reviewer à¸à¹‡à¸à¸´à¸™ token â€” claude tier)
- **review-reject count à¹€à¸›à¹‡à¸™à¸ªà¸±à¸à¸à¸²à¸“à¸„à¸¸à¸“à¸ à¸²à¸ž:** task à¸¢à¸²à¸à¸—à¸µà¹ˆà¸œà¹ˆà¸²à¸™ review à¸£à¸­à¸šà¹€à¸”à¸µà¸¢à¸§à¹‚à¸”à¸¢à¹„à¸¡à¹ˆà¸¡à¸µ issue à¹€à¸¥à¸¢
  = à¸™à¹ˆà¸²à¸ªà¸‡à¸ªà¸±à¸¢ (reviewer à¸«à¸¥à¸°à¸«à¸¥à¸§à¸¡) â€” à¸•à¸²à¸¡ CONCEPT Â§"why escalation is load-bearing"
- UI: badge à¸ªà¸–à¸²à¸™à¸° `reviewing` (à¸ªà¸µà¹€à¸«à¸¥à¸·à¸­à¸‡ pulse), `needs-rework` (à¸ªà¹‰à¸¡) + à¸”à¸¹ verdict à¹ƒà¸™ modal

---

## 6. Edge cases
| à¸à¸£à¸“à¸µ | à¸žà¸¤à¸•à¸´à¸à¸£à¸£à¸¡ |
| --- | --- |
| reviewer à¹ƒà¸Šà¹‰à¹„à¸¡à¹ˆà¹„à¸”à¹‰ (cloud à¸«à¸¥à¸¸à¸”/à¹„à¸¡à¹ˆà¸¡à¸µ tier) | à¸„à¹‰à¸²à¸‡à¸—à¸µà¹ˆ `reviewing` + log à¹€à¸•à¸·à¸­à¸™; à¹„à¸¡à¹ˆ auto-pass (fail-safe) |
| reviewer à¸•à¸­à¸š BLOCKED | treat à¹€à¸›à¹‡à¸™ fail + surface (à¸‚à¸²à¸”à¸šà¸£à¸´à¸šà¸—à¸•à¸£à¸§à¸ˆ) |
| produce empty/BLOCKED | `failed` à¸à¹ˆà¸­à¸™à¸–à¸¶à¸‡ review |
| à¸„à¸£à¸š maxReworkRounds à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸œà¹ˆà¸²à¸™ | à¸„à¹‰à¸²à¸‡ `needs-rework` à¹ƒà¸«à¹‰à¸„à¸™à¸•à¸±à¸”à¸ªà¸´à¸™ (à¹„à¸¡à¹ˆà¸§à¸™à¹„à¸¡à¹ˆà¸ˆà¸š) |
| à¸•à¹‰à¸™à¸—à¸¸à¸™ token | review à¹€à¸žà¸´à¹ˆà¸¡ ~1 agent/task â€” à¸›à¸´à¸”à¹„à¸”à¹‰à¸”à¹‰à¸§à¸¢ `requireReview:false` à¸«à¸£à¸·à¸­ `skipForDraft` |

---

## 7. Engine integration (à¸ˆà¸¸à¸”à¸—à¸µà¹ˆà¸•à¹‰à¸­à¸‡à¹à¸à¹‰ â€” implementation note)
- à¹€à¸žà¸´à¹ˆà¸¡à¸ªà¸–à¸²à¸™à¸° `reviewing` / `needs-rework` (à¹„à¸¡à¹ˆà¸­à¸¢à¸¹à¹ˆà¹ƒà¸™ ACTIVE; needs-rework à¹à¸ªà¸”à¸‡à¸›à¸¸à¹ˆà¸¡ re-run/release)
- `runAgent` à¸‚à¸­à¸‡ worker à¹€à¸ªà¸£à¹‡à¸ˆ â†’ à¸–à¹‰à¸² `requireReviewFor(task)` â†’ `setStatus(reviewing)` â†’ `runReview(task)`
- `runReview(task)`: build reviewer prompt (scope Â§3.2) â†’ spawn `claude -p --model <reviewerTier>`
  à¸”à¹‰à¸§à¸¢ StructuredOutput schema Â§3.4 â†’ parse verdict â†’ decision rule Â§3.5
- `requireReviewFor(task)`: `task.requireReview ?? !(skipForDraft && isLocalPinned(task)) ?? requireReviewDefault`
- rework: re-dispatch worker à¹€à¸”à¸´à¸¡ à¹‚à¸”à¸¢ `buildPrompt` à¹à¸™à¸š section "ROUND N â€” à¹à¸à¹‰à¸•à¸²à¸¡ issues:" + issues[]
- runPool/dispatchOne à¹€à¸£à¸µà¸¢à¸ path à¹ƒà¸«à¸¡à¹ˆà¸™à¸µà¹‰à¹à¸—à¸™à¸à¸²à¸£ setStatus(done) à¸•à¸£à¸‡ à¹†

---

## 8. Verification (à¸‚à¸­à¸‡ feature à¸™à¸µà¹‰à¹€à¸­à¸‡)
- [ ] task à¸—à¸µà¹ˆ output à¸œà¸´à¸” acceptance à¸•à¹‰à¸­à¸‡à¹„à¸”à¹‰ `needs-rework` à¹„à¸¡à¹ˆà¹ƒà¸Šà¹ˆ `done`
- [ ] reviewer à¸•à¹‰à¸­à¸‡à¸„à¸™à¸¥à¸° tier à¸à¸±à¸š worker à¹€à¸ªà¸¡à¸­ (à¹„à¸¡à¹ˆà¸¡à¸µ self-review)
- [ ] reviewer prompt à¸¡à¸µà¹€à¸‰à¸žà¸²à¸° acceptance + output + scope.docs (à¹„à¸¡à¹ˆà¸¡à¸µ orchestrator-only, à¹„à¸¡à¹ˆà¸¡à¸µà¸—à¸±à¹‰à¸‡ repo)
- [ ] rework loop à¸«à¸¢à¸¸à¸”à¸—à¸µà¹ˆ maxReworkRounds (à¹„à¸¡à¹ˆà¸§à¸™à¹„à¸¡à¹ˆà¸ˆà¸š)
- [ ] `requireReview:false` / draft â†’ à¸‚à¹‰à¸²à¸¡ review à¹„à¸”à¹‰à¸ˆà¸£à¸´à¸‡
- [ ] reviewer à¹ƒà¸Šà¹‰à¹„à¸¡à¹ˆà¹„à¸”à¹‰ â†’ à¸„à¹‰à¸²à¸‡ reviewing à¹„à¸¡à¹ˆ auto-pass



