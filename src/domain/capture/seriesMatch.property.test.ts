import { describe, expect, it } from 'vitest'
import { addDaysIso, daysBetween } from '../engine/dates'
import { groupTransactions, occurrenceKey } from '../engine/recurringDetect'
import { mulberry32 } from '../engine/rng'
import { makeTxn } from '../engine/recurringTestHelpers'
import type { Transaction, TxnType } from '../types'
import { type PushToMatch, type SeriesFit, type SeriesHint, matchPushesToSeries } from './seriesMatch'
import { foldTitle } from './text'

/** Few prices, days and accounts, so series often collide and pushes often fit more than one. */
const PRICES = [999, 1000, 1299]
const TYPES: TxnType[] = ['expense', 'expense', 'expense', 'income', 'refund']
const DAYS = [3, 6, 27, 30]
const NAMES = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot']

function ledger(seed: number): { rows: Transaction[]; pushes: PushToMatch[] } {
  const rand = mulberry32(seed)
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!
  const rows: Transaction[] = []
  let id = 1
  const seriesCount = 1 + Math.floor(rand() * 6)
  for (let s = 0; s < seriesCount; s++) {
    const day = pick(DAYS)
    const months = 3 + Math.floor(rand() * 5)
    const description = `${NAMES[s]} ${pick(['Plus', 'Club'])}`
    const shared = { accountId: 1 + Math.floor(rand() * 2), type: pick(TYPES), amountCents: pick(PRICES) }
    // The series ends a month or three before the pushes, sometimes with a skipped month or a doubled one.
    const lastMonth = 9 + Math.floor(rand() * 3)
    for (let m = lastMonth - months + 1; m <= lastMonth; m++) {
      if (rand() < 0.1) continue
      const jitter = Math.floor(rand() * 5) - 2
      const date = addDaysIso(`2026-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`, jitter)
      rows.push(makeTxn({ id: id++, date, description, ...shared }))
      if (rand() < 0.05) rows.push(makeTxn({ id: id++, date: addDaysIso(date, 12), description, ...shared }))
    }
    // Often November's charge is already logged, a few days either side of the day.
    if (rand() < 0.35) {
      const date = addDaysIso(`2026-11-${String(day).padStart(2, '0')}`, Math.floor(rand() * 9) - 6)
      rows.push(makeTxn({ id: id++, date, description, ...shared }))
    }
  }
  const pushes: PushToMatch[] = []
  const pushCount = 1 + Math.floor(rand() * 4)
  for (let p = 0; p < pushCount; p++) {
    const localDate = addDaysIso('2026-10-25', Math.floor(rand() * 45))
    pushes.push({
      id: `p${p}`,
      createdAt: `${localDate}T0${p}:00:00Z`,
      localDate,
      amountCents: pick(PRICES),
      currency: 'EUR',
      suggestedType: pick(TYPES),
      accountId: pick([1, 2, null]),
      votedDescription: pick([null, null, `${NAMES[0]} Plus`, `${NAMES[1]} Club`]),
    })
  }
  return { rows, pushes }
}

function fitsOf(hint: SeriesHint): SeriesFit[] {
  if (hint.kind === 'none') return []
  return hint.kind === 'choose' ? hint.series : [hint.series]
}

/** The month's charges a hint names: each series with the usual date it stands in for. */
const named = (hint: SeriesHint) => fitsOf(hint).map((s) => `${s.seriesKey}|${s.usualDate}`)

const SEEDS = Array.from({ length: 400 }, (_, i) => i + 1)

describe('matchPushesToSeries over generated ledgers', () => {
  it('names one series only when no other series fits the push on its own', () => {
    let singles = 0
    let choices = 0
    for (const seed of SEEDS) {
      const { rows, pushes } = ledger(seed)
      const groups = groupTransactions(rows)
      for (const p of pushes) {
        // Each series alone, with only this push: whether that series could take it at all.
        const alone = groups.filter((g) => matchPushesToSeries([p], rows, { groups: [g] }).get(p.id)!.kind !== 'none')
        const hint = matchPushesToSeries([p], rows, { groups }).get(p.id)!
        if (hint.kind === 'choose') {
          choices++
          expect(alone.length).toBeGreaterThanOrEqual(2)
          expect(hint.series.length).toBe(alone.length)
        } else if (hint.kind === 'none') {
          // One series alone may fit and still give no hint: the votes name another series that is still there.
          const votesNameAnother = groups.some(
            (g) => g !== alone[0] && foldTitle(g.label) === foldTitle(p.votedDescription ?? ''),
          )
          expect(alone.length === 0 || (alone.length === 1 && votesNameAnother)).toBe(true)
        } else {
          singles++
          expect(alone).toHaveLength(1)
        }
      }
    }
    // The generator must reach both outcomes, or the check above says nothing.
    expect(singles).toBeGreaterThan(20)
    expect(choices).toBeGreaterThan(5)
  })

  it('never names a series whose charge for that usual day is already logged', () => {
    let checked = 0
    for (const seed of SEEDS) {
      const { rows, pushes } = ledger(seed)
      // The series as a caller with an older history holds them: built before this month's rows were logged, with
      // every row passed alongside. Built from all the rows, the series would never wait for a logged date at all.
      for (const groups of [groupTransactions(rows.filter((r) => r.date < '2026-11-01')), groupTransactions(rows)]) {
        const fits = [...matchPushesToSeries(pushes, rows, { groups }).values()].flatMap(fitsOf)
        checked += fits.length
        for (const fit of fits) {
          const logged = rows.filter((r) => occurrenceKey(r) === fit.seriesKey).map((r) => r.date)
          // A charge logged up to two weeks before the usual day, or any time after it, is that day's charge.
          expect(logged.filter((d) => daysBetween(d, fit.usualDate) <= 14)).toEqual([])
        }
      }
    }
    expect(checked).toBeGreaterThan(20)
  })

  it("never names one month's charge of a series for two pushes", () => {
    for (const seed of SEEDS) {
      const { rows, pushes } = ledger(seed)
      const taken = [...matchPushesToSeries(pushes, rows).values()].filter((h) => h.kind !== 'choose').flatMap(named)
      expect(new Set(taken).size).toBe(taken.length)
    }
  })
})
