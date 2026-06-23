// cost-meter.mjs — live ANSI terminal cost meter for the hybrid loop. Dependency-free.
// Run once:  node cost-meter.mjs        Live:  node cost-meter.mjs --watch
import { readFileSync, watchFile } from 'node:fs'
import { fileURLToPath } from 'node:url'

const FILE = fileURLToPath(new URL('./usage.jsonl', import.meta.url))
const WATCH = process.argv.includes('--watch')
const SONNET = { in: 3, out: 15 } // local SLM replaces the sonnet coder tier (counterfactual rate)
const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  teal: '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m', gray: '\x1b[90m',
}

function compute() {
  const rows = readFileSync(FILE, 'utf8').split(/\r?\n/).filter(Boolean)
    .map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  const isLocal = r => typeof r.model === 'string' && r.model.toLowerCase().includes('ollama')
  const isReview = r => String(r.id).includes('#review')
  let actual = 0, review = 0, localRuns = 0, localOut = 0, cfFloor = 0
  const produce = []
  for (const r of rows) {
    if (isLocal(r)) { localRuns++; localOut += r.out || 0; cfFloor += ((r.in || 0) * SONNET.in + (r.out || 0) * SONNET.out) / 1e6 }
    else { actual += r.cost || 0; if (isReview(r)) review += r.cost || 0; else if ((r.out || 0) > 500) produce.push(r.cost || 0) }
  }
  const avg = produce.reduce((a, b) => a + b, 0) / (produce.length || 1)
  const cfReal = localRuns * avg
  return { total: rows.length, localRuns, localOut, actual, review, cfReal, cfFloor, allFrontier: actual + cfReal }
}

const bar = (frac, w) => '█'.repeat(Math.round(frac * w)) + C.dim + '·'.repeat(w - Math.round(frac * w)) + C.reset

function render() {
  const d = compute()
  const savedPct = d.allFrontier ? d.cfReal / d.allFrontier * 100 : 0
  const localPct = d.total ? d.localRuns / d.total * 100 : 0
  const reviewPct = d.actual ? d.review / d.actual * 100 : 0
  const L = []
  L.push('')
  L.push(`  ${C.bold}GoVibe · Hybrid Cost Meter${C.reset}  ${C.dim}${d.total} runs · usage.jsonl${C.reset}`)
  L.push('')
  L.push(`  ${C.green}${C.bold}~$${d.cfReal.toFixed(0)} saved${C.reset} ${C.green}(≈${savedPct.toFixed(0)}%, est.)${C.reset}   ${C.teal}${localPct.toFixed(0)}% runs on-device · $0${C.reset}   ${C.teal}100% code local${C.reset}`)
  L.push('')
  L.push(`  ${C.dim}all-frontier ~$${d.allFrontier.toFixed(0)}${C.reset}  ${bar(1, 28)}`)
  L.push(`  ${C.bold}hybrid  $${d.actual.toFixed(2)}${C.reset}      ${C.green}${bar(d.allFrontier ? d.actual / d.allFrontier : 0, 28)}${C.reset}`)
  L.push('')
  L.push(`  ${C.gray}produce/plan $${(d.actual - d.review).toFixed(2)}  ·  ${C.yellow}review $${d.review.toFixed(2)} (${reviewPct.toFixed(0)}% = next lever)${C.reset}`)
  L.push(`  ${C.dim}est: run-replacement; floor (token-only) $${d.cfFloor.toFixed(2)}. planning-heavy sample.${C.reset}`)
  L.push('')
  process.stdout.write((WATCH ? '\x1b[2J\x1b[H' : '') + L.join('\n') + '\n')
}

render()
if (WATCH) {
  process.stdout.write(`${C.dim}  watching usage.jsonl … (Ctrl+C to exit)${C.reset}\n`)
  watchFile(FILE, { interval: 500 }, render)
}
