#!/usr/bin/env node
/**
 * Fail verify if the production JS bundle grows past budget. Guards the win from
 * dropping Recharts (the lazy Goals chunk went 108 KB -> ~8 KB gzip): re-adding a
 * heavy chart/vendor lib would blow these limits. Budgets are gzip bytes with
 * headroom; bump deliberately when a real feature needs the room.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { join } from 'node:path'

const assetsDir = join(import.meta.dirname, '..', 'dist', 'assets')

// gzip bytes. Today: total ~180 KB, GoalsTab ~21 KB.
//
// Raised from 160 KB when flags, receipts and the claim pack landed: three
// features' worth of UI took the total from ~146 KB to ~159 KB, leaving under
// 1 KB of headroom — at which point the next one-line change fails the build and
// somebody bumps this in a hurry without looking at why. The purpose is still to
// catch a heavy chart or vendor lib sneaking back in (dropping Recharts took the
// lazy Goals chunk from 108 KB to ~8 KB gzip), and this limit still catches that.
//
// Raised again, from 180 KB to 184 KB, when the motion layer landed (Presence, the sheet and
// popover exits, the folds): about 1.7 KB gzip took the total from ~178.3 KB to 179,969
// bytes, which left 31 bytes and would have failed the next unrelated change.
//
// Raised from 184 KB to 190 KB for the Goals UX round (confirm sheets in the Goals tab, a
// Setup view, the pinned mini chart and the net worth history chart): about 1.5 KB gzip
// took the total from ~182.5 KB to a few bytes over 184,000.
//
// Raised from 190 KB to 196 KB for the wealth follow-ups (withdrawals, hero windows and
// legend toggles, the comparison table, milestone dates, the cash reserve, the re-baseline
// confirm sheet): about 4 KB gzip across sixteen PRs took the total to 190.3 KB, and the
// last of them was the one to cross the line.
//
// Raised from 196 KB to 198 KB for the chart readout on a phone and the chart-axis and legend
// fixes: main was at 195.4 KB, the readout adds about 0.8 KB and the axis and legend fixes
// about 0.4 KB, so whichever of the two lands second would have crossed the line.
const TOTAL_MAX_GZIP = 198_000
const GOALS_MAX_GZIP = 40_000

function gzipBytes(path) {
  return gzipSync(readFileSync(path)).length
}

let jsFiles
try {
  jsFiles = readdirSync(assetsDir).filter((name) => name.endsWith('.js'))
} catch {
  console.error('check-bundle-budget: dist/assets not found. Run the build first.')
  process.exit(1)
}

if (jsFiles.length === 0) {
  console.error('check-bundle-budget: no JS assets found in dist/assets')
  process.exit(1)
}

let total = 0
let goals = 0
for (const name of jsFiles) {
  const size = gzipBytes(join(assetsDir, name))
  total += size
  if (name.startsWith('GoalsTab')) goals += size
}

const kb = (n) => `${(n / 1000).toFixed(1)} KB`
const failures = []
if (total > TOTAL_MAX_GZIP) {
  failures.push(`total JS ${kb(total)} gzip exceeds budget ${kb(TOTAL_MAX_GZIP)}`)
}
if (goals > GOALS_MAX_GZIP) {
  failures.push(`GoalsTab ${kb(goals)} gzip exceeds budget ${kb(GOALS_MAX_GZIP)}`)
}

if (failures.length > 0) {
  console.error(`bundle budget exceeded:\n  - ${failures.join('\n  - ')}`)
  process.exit(1)
}

console.log(`bundle budget OK (total ${kb(total)} gzip, GoalsTab ${kb(goals)} gzip)`)
