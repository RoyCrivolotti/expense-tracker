#!/usr/bin/env node
/**
 * Fail verify if the production JS bundle grows past budget. Guards the win from
 * dropping Recharts (the lazy Goals chunk went 108 KB -> ~8 KB gzip): re-adding a heavy
 * chart/vendor lib would blow these limits. Three are kept: the bundle a browser
 * that never turns the ledger mode on downloads, the code only the Goals tab loads (its own chunk,
 * the chunks split out of it and its lazy card), and the code only the ledger mode loads, all
 * found from the imports in the built files by `bundleGraph.mjs`.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { join } from 'node:path'
import { goalsOnlyChunks, ledgerOnlyChunks } from './bundleGraph.mjs'

const assetsDir = join(import.meta.dirname, '..', 'dist', 'assets')

// gzip bytes. Each limit is set about 1 KB above what the built files measured when it was last changed, which is room
// for the minifier's run-to-run variance and for the odd small change. A PR that stays inside it leaves the limit
// alone; one that grows that part on purpose raises it, to about 1 KB above the new size, and says in its description
// what the growth bought. The point is to catch a vendor library or a whole feature arriving by accident (dropping
// Recharts took the lazy Goals chunk from 108 KB to about 8 KB), not to count bytes.
//
// TOTAL: the JS a browser downloads when the ledger mode is off, which is everyone's default. LEDGER: the chunks only
// the ledger mode loads. GOALS: the Goals tab's own chunk and the chunks split out of it, which overlap TOTAL.
const TOTAL_MAX_GZIP = 288_500
const LEDGER_MAX_GZIP = 16_700
const GOALS_MAX_GZIP = 85_900

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

const goalsOnly = new Set(
  goalsOnlyChunks({
    files: jsFiles,
    read: (name) => readFileSync(join(assetsDir, name), 'utf8'),
    indexHtml: readFileSync(join(assetsDir, '..', 'index.html'), 'utf8'),
  }),
)
if (goalsOnly.size === 0) {
  console.error('check-bundle-budget: found no Goals-only chunk in dist/assets, so the Goals limit would count nothing')
  process.exit(1)
}
const ledgerOnly = new Set(
  ledgerOnlyChunks({
    files: jsFiles,
    read: (name) => readFileSync(join(assetsDir, name), 'utf8'),
    indexHtml: readFileSync(join(assetsDir, '..', 'index.html'), 'utf8'),
  }),
)
if (ledgerOnly.size === 0) {
  console.error('check-bundle-budget: found no ledger-only chunk in dist/assets, so the ledger limit would count nothing')
  process.exit(1)
}

let total = 0
let goals = 0
let ledger = 0
for (const name of jsFiles) {
  const size = gzipBytes(join(assetsDir, name))
  if (ledgerOnly.has(name)) ledger += size
  else total += size
  if (goalsOnly.has(name)) goals += size
}

const kb = (n) => `${(n / 1000).toFixed(1)} KB`
const failures = []
if (total > TOTAL_MAX_GZIP) {
  failures.push(`JS without the ledger-only chunks ${kb(total)} gzip exceeds budget ${kb(TOTAL_MAX_GZIP)}`)
}
if (ledger > LEDGER_MAX_GZIP) {
  failures.push(`ledger-only JS ${kb(ledger)} gzip exceeds budget ${kb(LEDGER_MAX_GZIP)}`)
}
if (goals > GOALS_MAX_GZIP) {
  failures.push(`Goals-only JS ${kb(goals)} gzip exceeds budget ${kb(GOALS_MAX_GZIP)}`)
}

if (failures.length > 0) {
  console.error(`bundle budget exceeded:\n  - ${failures.join('\n  - ')}`)
  process.exit(1)
}

const bytes = (n, max) => `${n.toLocaleString('en-US')} of ${max.toLocaleString('en-US')}`
console.log(
  `bundle budget OK (${bytes(total, TOTAL_MAX_GZIP)} bytes gzip without the ledger chunks, ` +
    `ledger-only ${bytes(ledger, LEDGER_MAX_GZIP)}, Goals-only ${bytes(goals, GOALS_MAX_GZIP)})`,
)
