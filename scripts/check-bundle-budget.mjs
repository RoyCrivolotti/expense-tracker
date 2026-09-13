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

// gzip bytes. Today: total ~159 KB, GoalsTab ~20 KB.
//
// Raised from 160 KB when flags, receipts and the claim pack landed: three
// features' worth of UI took the total from ~146 KB to ~159 KB, leaving under
// 1 KB of headroom — at which point the next one-line change fails the build and
// somebody bumps this in a hurry without looking at why. The purpose is still to
// catch a heavy chart or vendor lib sneaking back in (dropping Recharts took the
// lazy Goals chunk from 108 KB to ~8 KB gzip), and 180 KB still catches that.
const TOTAL_MAX_GZIP = 180_000
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
