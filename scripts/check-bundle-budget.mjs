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
//
// Raised from 215 KB to 217 KB, and the Goals chunk from 44 KB to 45 KB, for the fixes to the
// wide page on a tablet and in Safari: main stood at 214.7 KB after the shorter hero, the
// touch sizing, the star and menu fixes for a touch screen, the scroll padding the bar needs in
// each engine, the milestone line thinning and the control names took the total to 215.1 KB.
// All of it is small code and CSS in the one lazy chunk, with no new library, and the next
// round of fixes from the same review is still to come.
//
// Raised from 217 KB to 221 KB, and the Goals chunk from 45 KB to 47 KB, for the round of
// follow-ups from the review of the wide Goals page (a guard for leaving Goals with unsaved edits,
// the bar's second figure, the breakdown as an overlay, line colours for the light theme, a legend
// for the check-in dots and life events, and the input and data fixes under them): main stood at
// 216.0 KB with the Goals chunk at 44.8, and the round adds a few KB across several PRs. All of it
// is small code and CSS, with no new library.
//
// Raised from 221 KB to 230 KB, and the Goals chunk from 47 KB to 54 KB, for the next round on
// the wide Goals page: the new Years to milestone table (a tint, years or calendar year, the gap
// to the plan, a sentence for a cell), an optional timeline beside it, and the input and
// keyboard fixes that follow from the last review. Main stood at 218.1 KB with the Goals chunk
// at 46.2 KB, so the last round left under 1 KB for the Goals chunk. All of it is small code and
// CSS in the one lazy chunk, with no new library.
//
// Raised the Goals chunk from 54 KB to 58 KB for the phone's Years to milestone view (the table a
// page of columns at a time, the by-goal list and a full-screen sheet with every milestone).
// Main stood at 52.5 KB and the table's pages and by-goal list alone add 1.5 KB, so 54 KB left no room for the sheet. All of it is small code and CSS in the one lazy
// chunk, with no new library.
// Raised from 230 KB to 240 KB for the Analytics Overview (the engine's pace, movers,
// signals, allocation and baseline functions, the KPI tiles, the trend chart with its
// hatched unpaid caps, and the cards that read them): main stood at 229.5 KB after the
// Analytics shell, and the Overview adds about 6.7 KB gzip, almost all of it in the lazy
// Analytics chunk (which this PR takes from ~15 KB to ~22 KB), with no new library. The
// redesign's final PR removes the old tables and charts it supersedes, which should claw
// most of this back.
// Raised from 240 KB to 244 KB for the Analytics Spending and Cash views (ranked rows with
// budget bullets, the detail pane and sheet, the Transactions entry channel, month-close
// dots, the cash bridge and drift bars): the two landed back to back and together add about
// 4 KB gzip, all of it UI code and CSS in the lazy Analytics chunk, with no new library.
// The redesign's final PR removes the old tables, the pie and the superseded charts, which
// claws most of the Analytics growth back.
//
// That final PR landed: deleting the pie, the two income/expense charts and the old mobile
// tabs took the total from 240.2 KB to 238.1 KB. The 244 KB ceiling stays, leaving the
// usual few KB of headroom rather than resetting it to the measured byte.
//
// Raised from 244 KB to 248 KB for the monthly-investing changes: the plan's schedule in the
// projection, the metrics that now read it (months behind, the pace sentence, the headline, the
// investing-against-plan series, the comparison column) and the editor that follows. Main stood
// at 243.3 KB after the start-from-today switch and the schedule foundation, the metrics add
// about 0.9 KB and the editor a little more, all of it small code in the lazy Goals chunk, with
// no new library.
//
// Raised the Goals chunk from 58 KB to 60 KB for the full-screen chart sheet. Main stood at 57.7 KB
// after the monthly-investing round, and the groundwork for the sheet (the chart's focus options,
// a chart that fills its box and the measured-size hook) is about 0.3 KB, which is the whole of the
// room that was left. The sheet itself follows, all of it small code in the lazy Goals chunk, with
// no new library.
//
// Raised from 248 KB to 251 KB, and the Goals chunk from 60 KB to 63 KB, for the full-screen chart's
// floating readout: the controller that moves a card and makes it larger or smaller by its corner
// (placement as a share of the room, the scale, the pointer gestures and the keys), the layout of
// the card whole with a purchase year's breakdown beside the rows, and the sheet around them. Main
// stood at 247.3 KB with the Goals chunk at 59.4, and resizing a card whole added 1.1 KB over moving
// it, all of it code in the lazy Goals chunk, with no new library.
//
// Raised from 251 KB to 254 KB, and the Goals chunk from 63 KB to 65 KB, for the value chips on the
// wide chart (their layout, the merge of lines that read the same figure, the text colour that reads
// on each line colour and the chips' CSS): main stood at 250.1 KB with the Goals chunk at 61.9 KB, and
// the chips add about 1.3 KB, all of it small code in the lazy Goals chunk, with no new library.
//
// Raised the Goals chunk from 65 KB to 65.5 KB for the house price at purchase (the line under the
// price, the name for the plan's money and the helper both read): the chunk stood at about 64.9 KB
// after the new default return, the three pieces add about 0.25 KB to 65,172 bytes, and the total
// is still under its limit at 253,745. All of it is small code in the lazy Goals chunk, with no new
// library.
//
// Raised from 254 KB to 255.7 KB, and the Goals chunk from 65.5 KB to 66 KB, for the plan's line through a
// house payment or event: the line and its stretches, the step the charts draw (a line and its band can
// climb to the value before a payment and drop straight to the one after), the window around a step,
// and the status wording that goes with them. The total stood at 253,745 bytes after the house price and
// this takes it to 255,412 (the Goals chunk from 65,172 to 65,867). All of it is small code, in the engine
// and the lazy Goals chunk, with no new library.
//
// Raised from 255.7 KB to 256.7 KB, and the Goals chunk from 66 KB to 67.2 KB, for dating milestones on
// the account: the crossing search (a bisection per year of the line and the days a step jumps over an
// amount), the worth and the fall-back the chips now say, the reference curves the chart draws in both
// views, and the wording. The total stood at 255,412 bytes after the plan's line and this takes it to
// 256,461 (the Goals chunk from 65,867 to 66,905). All of it is small code, in the engine and the lazy
// Goals chunk, with no new library.
//
// Raised the total from 256.7 KB to 258.1 KB for restating a re-baselined plan: the amounts and the house
// price counted in the euros of the new start, the owned house with its loan from the schedule, the
// from-today line drawn in the plan's money, the part-year mortgage term and the sheet's new lines. The
// total stood at 256,461 bytes after dating milestones and this takes it to 257,876 (the Goals chunk from
// 66,905 to 67,124, still under its limit). Most of it is engine code that the dashboard and Progress
// also load, with no new library.
//
// Raised from 258.1 KB to 258.6 KB, and the Goals chunk from 67.2 KB to 67.8 KB, for the return guards
// (the reading that holds a return back when it would only be money moved in without a record, the
// check-in a day is read once, and the two lines that say what to record). The total stood at 257,876
// bytes after restating a re-baselined plan and this takes it to 258,331 (the Goals chunk from 67,124
// to 67,529). All of it is small code, in the engine and the lazy Goals chunk, with no new library.
//
// Raised from 258.6 KB to 260.4 KB, and the Goals chunk from 67.8 KB to 69.6 KB, for the split of the gap
// to the plan (the five paths and the checks that decide when saving and the market can be told apart,
// the rows with their wording, and the restart rule) net of the steady-gap hint it replaces. The total
// stood at 258,331 bytes after the return guards and this takes it to 260,122 (the Goals chunk from
// 67,529 to 69,318). All of it is small code, in the engine and the lazy Goals chunk, with no new library.
//
// Raised from 260.4 KB to 262.4 KB, and the Goals chunk from 69.6 KB to 71.6 KB, for the redesigned Rent vs
// buy (each side split into what it holds and pays, the comparison from the purchase year to ten years past
// the loan, the readout and the note that say so, the turning points drawn on the chart). The total stood at
// 260,3 KB after the upkeep input and this takes it to 262,218 bytes (the Goals chunk from 69,5 KB to 71,398).
// All of it is small code, in the engine and the lazy Goals chunk, with no new library.
//
// Raised from 262.4 KB to 263.2 KB, and the Goals chunk from 71.6 KB to 72.38 KB, for the years the money must
// last (the field with its guide for the withdrawal rate, the drawdown that runs for them, and the FI target
// said at three rates in the FI chart and in Where you are today). The total stood at 262,218 bytes after the
// Rent vs buy redesign and this takes it to 262,905 (the Goals chunk from 71,398 to 72,081). All of it is small
// code, in the engine and the lazy Goals chunk, with no new library.
//
// Raised from 263.2 KB to 263.78 KB, and the Goals chunk from 72.38 KB to 72.86 KB, for the market bounce card
// in Assumptions (the stepper with its three usual choices, saved the way the assumed inflation is, which now
// shares one hook with it). The total stood at 262,957 bytes after the replay engine and this takes it to 263,487
// (the Goals chunk from 72,080 to 72,572). All of it is small code in the lazy Goals chunk, with no new library.
const TOTAL_MAX_GZIP = 263_780
const GOALS_MAX_GZIP = 72_860

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
