// savings-report.mjs — aggregate usage.jsonl into an honest hybrid-vs-frontier savings figure.
// Ground-truth (measured) is separated from counterfactual (estimated). Run: node savings-report.mjs
import { readFileSync } from 'node:fs'

const path = new URL('./usage.jsonl', import.meta.url)
const rows = readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean)
  .map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)

// USD per MTok. Local SLM replaces the sonnet "coder" tier -> use sonnet as counterfactual rate.
const SONNET = { in: 3, out: 15 }

const isLocal = r => typeof r.model === 'string' && r.model.toLowerCase().includes('ollama')
const isReview = r => String(r.id).includes('#review')

let actual = 0, reviewSpend = 0, produceSpend = 0
let localRuns = 0, frontierRuns = 0, localIn = 0, localOut = 0
let cfFloor = 0                 // token-based counterfactual (floor — ignores cache/context frontier would load)
const produceCosts = []        // real frontier produce runs (non-review, out>500) -> realistic per-run replacement

for (const r of rows) {
  if (isLocal(r)) {
    localRuns++; localIn += r.in || 0; localOut += r.out || 0
    cfFloor += ((r.in || 0) * SONNET.in + (r.out || 0) * SONNET.out) / 1e6
  } else {
    frontierRuns++; actual += r.cost || 0
    if (isReview(r)) reviewSpend += r.cost || 0
    else { produceSpend += r.cost || 0; if ((r.out || 0) > 500) produceCosts.push(r.cost || 0) }
  }
}

const avgProduce = produceCosts.reduce((a, b) => a + b, 0) / (produceCosts.length || 1)
const cfRealistic = localRuns * avgProduce      // each local run ~= one avoided frontier produce run

const usd = n => '$' + n.toFixed(2)
const pct = n => n.toFixed(0) + '%'
const allFrontierFloor = actual + cfFloor
const allFrontierReal = actual + cfRealistic

console.log(`
=== GoVibe Hybrid Savings Report (source: usage.jsonl, ${rows.length} runs) ===

— GROUND TRUTH (measured) —
  Total runs              : ${rows.length}
  Local runs (Ollama, $0) : ${localRuns}  (${pct(localRuns / rows.length * 100)} of all runs)
  Frontier runs           : ${frontierRuns}
  Local tokens generated  : ${(localIn + localOut).toLocaleString()}  (${localOut.toLocaleString()} out)  @ $0
  Actual spend (hybrid)   : ${usd(actual)}
    ├─ produce/plan       : ${usd(produceSpend)}
    └─ Verify-Gate review : ${usd(reviewSpend)}  (${pct(reviewSpend / actual * 100)} of spend = the "review tax")

— COUNTERFACTUAL (estimated: if local runs were frontier) —
  Floor (token-based)     : +${usd(cfFloor)}   -> all-frontier ~ ${usd(allFrontierFloor)}
  Realistic (run-replace) : +${usd(cfRealistic)}   (avg produce run = ${usd(avgProduce)} x ${localRuns} local)
                                          -> all-frontier ~ ${usd(allFrontierReal)}

— HERO NUMBER (range) —
  Saved vs all-frontier   : ${usd(cfFloor)} – ${usd(cfRealistic)}
  Savings %               : ${pct(cfFloor / allFrontierFloor * 100)} – ${pct(cfRealistic / allFrontierReal * 100)}
  Free local execution    : ${pct(localRuns / rows.length * 100)} of runs cost $0, ran on-device
`)
