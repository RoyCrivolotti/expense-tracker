#!/usr/bin/env node
/**
 * Fail verify if the production JS bundle grows past budget. Guards the win from
 * dropping Recharts (the lazy Goals chunk went 108 KB -> ~8 KB gzip, and is ~41 KB now that
 * Goals has grown): re-adding a heavy chart/vendor lib would blow these limits. Budgets are
 * gzip bytes with headroom; bump deliberately when a real feature needs the room.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { join } from 'node:path'

const assetsDir = join(import.meta.dirname, '..', 'dist', 'assets')

// gzip bytes. Today: total ~212 KB, GoalsTab ~41 KB.
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
// Raised from 184 KB to 190 KB for the Goals UX round (confirm sheets in the Goals tab, an
// Assumptions view (called Setup then), the pinned mini chart and the net worth history
// chart): about 1.5 KB gzip took the total from ~182.5 KB to a few bytes over 184,000.
//
// Raised from 190 KB to 196 KB for the wealth follow-ups (withdrawals, hero windows and
// legend toggles, the comparison table, milestone dates, the cash reserve, the re-baseline
// confirm sheet): about 4 KB gzip across sixteen PRs took the total to 190.3 KB, and the
// last of them was the one to cross the line.
//
// Raised from 196 KB to 198 KB for the phone tooltip placement and the chart-axis and legend
// fixes: main was at 195.4 KB, the axis and legend fixes add about 0.6 KB and the tooltip change
// about 0.5 KB, which takes either PR to the limit and the two together past it.
//
// Raised from 198 KB to 198.5 KB for the editable report title: main was already at 197,931
// bytes with 69 left, and the rename control adds about 0.2 KB.
//
// Raised from 198.5 KB to 199 KB for the receipts-only report filter and the flagged card's
// button-width fix, landing on top of the title change above: the merged total came to
// 198,418 bytes.
//
// Raised from 199 KB to 202 KB for the Labels feature (a Settings management screen, a
// multi-select picker with inline quick-create, and the label chip row on transaction
// rows): about 2 KB gzip took the total to 201,006 bytes.
//
// Raised from 202 KB to 203 KB for the label filter on the transactions list (a
// trigger button plus the same multi-select picker the edit sheet already uses):
// about 500 bytes gzip took the total from 201,537 bytes, left over from the
// auto-label configuration feature, to 202,060.
//
// The past-report flag-identity fallback landed around the same point in the stack
// and independently needed the same bump for the same reason (auto-label
// configuration's own headroom): its own tests alone pushed the total to 202,026
// bytes against the pre-label-filtering budget. The two bumps merged onto the same
// 203 KB ceiling rather than stacking into two separate raises.
//
// Raised from 203 KB to 204 KB for the label filter's pill-shaped chevron (a second
// small icon plus its CSS): main had drifted to 202,984 bytes across everything merged
// since the 203 KB ceiling was set, leaving 16 bytes — enough for CI's build to land on
// either side of the line depending on minifier non-determinism, which is what happened.
//
// Raised from 204 KB to 206 KB for the Adjust section chips (the chip row with its scroll
// watcher, and the helpers that scroll a section under the pinned chart): about 0.8 KB gzip
// took the total from 203.6 KB to 204.4 KB, over the line. The extra KB beyond that is so the
// next one-line change does not fail the build, as the notes above describe.
//
// Raised from 206 KB to 209 KB for the Goals follow-ups on a phone (the Save and Discard
// confirmation and focus handling, the scroll memory kept by the tab, the pinned-area scroll
// padding, the end-value readout on the pinned chart, tab semantics for the view row, and the
// short-screen layout): the stack of them took the total from 205.5 KB to 206.9 KB, so the
// branch that carries the Save row was the first to cross the line.
//
// Raised from 209 KB to 214 KB, and the Goals chunk from 40 KB to 43 KB, for the one-column
// Goals Plan on a wide screen (the scenario tabs and their menu, the levers bar, the folding
// inputs panel and the two-column detail grid): about 4.4 KB gzip took the total from about
// 208 KB to 212,355 bytes and the Goals chunk from about 37 KB to 41,410, which is all new UI
// and no new library. The limits keep about 1.6 KB of headroom each, as the notes above do.
//
// Raised from 214 KB to 215 KB, and the Goals chunk from 43 KB to 44 KB, for what the review of
// that page found. The first fixes (the keyboard's place after a star, the panel scrolling into
// view, the lever field that only commits what was typed) left the total at 213.8 KB and the
// Goals chunk at 42.8 KB, with 0.2 KB of headroom. The polish round on top of them (the hints
// that stay with starred inputs, star tooltips and hover, the tab name ellipsis, the name check
// on Save, and the bar's scroll padding that follows the window width) added about 0.3 KB, which
// took both over. All of it is small code and CSS in the one lazy chunk, with no new library.
const TOTAL_MAX_GZIP = 215_000
const GOALS_MAX_GZIP = 44_000

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
