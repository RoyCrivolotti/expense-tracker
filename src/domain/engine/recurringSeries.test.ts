import { describe, expect, it } from 'vitest'
import type { Category, Transaction } from '../types'
import { daysBetween } from './dates'
import { detectedFixedCosts } from './fixedCosts'
import { classifierFromGroups, classifyFixedSpend, fixedRhythm, fixedRhythmFromGaps, recurringFixedGroups } from './fixedFlexible'
import { groupKeyString, groupTransactions, newestChargeBySeries } from './recurringDetect'
import {
  SERIES_TAIL_DATES,
  gapsOfSeries,
  newestChargesOfSeries,
  occurrenceGroupFromSeries,
  recurringFixedGroupsFromSeries,
  seriesFromTransactions,
} from './recurringSeries'
import { makeTxn, monthlyDates } from './recurringTestHelpers'
import { detectUpcoming, stillStopped } from './recurringUpcoming'
import { expectedFixedCents } from './spendingPace'

const categories: Category[] = [{ id: 1, name: 'Home', monthlyBudgetCents: 50_000, sortOrder: 0, active: true }]

/** Placeholder rows: a monthly gym fee, a quarterly insurance, a weekly market, and noise that is not a series. */
function ledger(): Transaction[] {
  let id = 1
  const gym = monthlyDates(2025, 1, 5, 14).map((date) => makeTxn({ id: id++, date, description: 'Gym', amountCents: 3_000 + id }))
  const insurance = ['2025-01-20', '2025-04-19', '2025-07-21', '2025-10-20', '2026-01-19'].map((date) =>
    makeTxn({ id: id++, date, description: 'Insurance', amountCents: 9_000, budgetMonth: date.slice(0, 7) }),
  )
  const market = Array.from({ length: 12 }, (_, i) => makeTxn({ id: id++, date: `2026-02-${String(i + 1).padStart(2, '0')}`, description: 'Market' }))
  return [
    ...gym,
    ...insurance,
    ...market,
    makeTxn({ id: id++, date: '2026-01-02', description: 'Once' }),
    makeTxn({ id: id++, date: '2026-01-09', description: 'Twice' }),
    makeTxn({ id: id++, date: '2026-02-09', description: 'Twice' }),
    makeTxn({ id: id++, date: '2026-01-10', description: 'Gym', cancelled: true }),
    makeTxn({ id: id++, date: '2026-01-11', description: '   ' }),
    makeTxn({ id: id++, date: '2026-01-12', description: 'Sofa', planId: 1, installmentIndex: 1 }),
  ].sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1))
}

describe('seriesFromTransactions', () => {
  const rows = ledger()
  const all = seriesFromTransactions(rows)
  const byLabel = (label: string) => all.find((s) => s.label === label)!

  it('returns the series of three or more rows, leaving cancelled, blank and plan rows out', () => {
    expect(all.map((s) => s.label).sort()).toEqual(['Gym', 'Insurance', 'Market'])
  })

  it('names the newest row and carries its fields', () => {
    const gym = byLabel('Gym')
    expect(gym).toMatchObject({ accountId: 1, categoryId: 1, type: 'expense' })
    expect(gym.newestDates.at(-1)).toBe('2026-02-05')
    expect(gym.amountCents).toBe(rows.find((t) => t.description === 'Gym' && t.date === '2026-02-05')!.amountCents)
  })

  it('keeps the newest dates as dates and every older gap, whatever the length of the series', () => {
    const gym = byLabel('Gym')
    expect(gym.newestDates).toHaveLength(SERIES_TAIL_DATES)
    expect(gym.olderGaps).toHaveLength(14 - SERIES_TAIL_DATES)
    expect(byLabel('Insurance').newestDates).toHaveLength(5)
    expect(byLabel('Insurance').olderGaps).toEqual([])
    expect(gapsOfSeries(gym)).toHaveLength(13)
  })

  it('carries every distinct budget month and the three newest offsets', () => {
    expect(byLabel('Gym').budgetMonths).toHaveLength(14)
    expect(byLabel('Market').budgetMonths).toEqual(['2026-02'])
    expect(byLabel('Gym').budgetOffsets).toEqual([0, 0, 0])
  })

  it('does not depend on the order the rows arrive in', () => {
    expect(seriesFromTransactions([...rows].reverse())).toEqual(all)
    expect(seriesFromTransactions([...rows].sort((a, b) => a.id - b.id))).toEqual(all)
  })

  it('lists the series in the order their newest rows appear in a dataset served newest first', () => {
    const order = groupTransactions(rows).map((g) => g.label)
    expect(all.map((s) => s.label)).toEqual(order)
  })

  it('stores older gaps by size, so two orders of the same gaps give the same series', () => {
    // Chronological gaps before the newest five dates are 3, 1 and 10 (the last bridges into the tail).
    const days = [1, 4, 5, 15, 16, 17, 18, 19]
    const rows = days.map((d, i) => makeTxn({ id: i + 1, date: `2026-01-${String(d).padStart(2, '0')}`, description: 'A' }))
    const gaps = (r: typeof rows) => seriesFromTransactions(r)[0]!.olderGaps
    expect(gaps(rows)).toEqual([1, 3, 10])
    expect(gaps([...rows].reverse())).toEqual([1, 3, 10])
  })
})

describe('a series read back as the group the detectors take', () => {
  const rows = ledger()
  const series = seriesFromTransactions(rows)
  const fromRows = groupTransactions(rows)
  const groupOf = (label: string) => occurrenceGroupFromSeries(series.find((s) => s.label === label)!)
  const engineGroup = (label: string) => fromRows.find((g) => g.label === label)!

  it('has the key, label, amount and category of the engine’s group', () => {
    for (const label of ['Gym', 'Insurance', 'Market']) {
      const { key, label: name, categoryId, amountCents, budgetMonths } = groupOf(label)
      const engine = engineGroup(label)
      expect({ key, name, categoryId, amountCents, budgetMonths }).toEqual({
        key: engine.key,
        name: engine.label,
        categoryId: engine.categoryId,
        amountCents: engine.amountCents,
        budgetMonths: engine.budgetMonths,
      })
    }
  })

  it('has the engine’s newest five dates and every gap, in the order the engine has them', () => {
    for (const label of ['Gym', 'Insurance', 'Market']) {
      const served = groupOf(label).dates
      const engine = engineGroup(label).dates
      expect(served.slice(-SERIES_TAIL_DATES)).toEqual(engine.slice(-SERIES_TAIL_DATES))
      expect(served).toHaveLength(engine.length)
      const gaps = (dates: string[]) => dates.slice(1).map((d, i) => daysBetween(dates[i]!, d))
      expect(gaps(served).sort((a, b) => a - b)).toEqual(gaps(engine).sort((a, b) => a - b))
    }
  })

  it('has the engine’s newest three offsets', () => {
    expect(groupOf('Gym').budgetOffsets).toEqual(engineGroup('Gym').budgetOffsets.slice(-3))
  })

  it('classifies the rhythm the same way, from the gaps or from the group', () => {
    for (const label of ['Gym', 'Insurance', 'Market']) {
      expect(fixedRhythmFromGaps(gapsOfSeries(series.find((s) => s.label === label)!))).toBe(fixedRhythm(engineGroup(label)))
    }
    expect(fixedRhythmFromGaps([])).toBeNull()
    expect(fixedRhythmFromGaps([30, 31, 30, 120, 31])).toBe(fixedRhythmFromGaps([120, 31, 30, 31, 30]))
  })

  it('keeps the recurring series the split trusts: the monthly and quarterly, not the weekly one', () => {
    const served = recurringFixedGroupsFromSeries(series)
    expect(served.map((g) => g.label)).toEqual(recurringFixedGroups(rows).map((g) => g.label))
    expect(served.map((g) => g.label).sort()).toEqual(['Gym', 'Insurance'])
  })
})

describe('the detectors given the series of all the history and none of the rows', () => {
  const rows = ledger()
  const series = seriesFromTransactions(rows)
  const groups = recurringFixedGroupsFromSeries(series)

  it('classify every row as the classifier built from the rows does', () => {
    const served = classifierFromGroups(groups)
    const engine = classifyFixedSpend(rows)
    expect(rows.map((t) => served.isFixed(t))).toEqual(rows.map((t) => engine.isFixed(t)))
  })

  it('give the same fixed costs and pace envelope', () => {
    for (const month of ['2025-06', '2025-12', '2026-02', '2026-09']) {
      expect(detectedFixedCosts([], [], categories, month, groups)).toEqual(detectedFixedCosts(rows, [], categories, month))
      expect(expectedFixedCents([], [], categories, month, groups)).toBe(expectedFixedCents(rows, [], categories, month))
    }
  })

  it('give the same upcoming charges', () => {
    for (const today of ['2026-02-01', '2026-02-20', '2026-03-03', '2026-03-04', '2026-03-07', '2026-03-12']) {
      expect(detectUpcoming([], { today, groups })).toEqual(detectUpcoming(rows, { today }))
    }
    expect(detectUpcoming(rows, { today: '2026-03-04' }).length).toBeGreaterThan(0)
  })

  it('tell the same series from the stopped ones', () => {
    const key = groupKeyString({ normalizedDesc: 'gym', accountId: 1, categoryId: 1, type: 'expense' })
    const stopped = { [key]: { after: '2026-02-05' }, 'x|9|9|expense': { after: '2026-01-01' } }
    const known = newestChargesOfSeries(series)
    expect(known.get(key)).toBe('2026-02-05')
    expect(known).toEqual(new Map([...newestChargeBySeries(rows)].filter(([k]) => known.has(k))))
    expect(stillStopped([], stopped, known)).toEqual(stillStopped(rows, stopped))
    const lateStopped = { [key]: { after: '2026-01-05' } }
    expect(stillStopped([], lateStopped, known)).toEqual({})
    expect(stillStopped([], lateStopped)).toEqual(lateStopped)
  })

  it('count a newer charge in the rows over an older one in the series', () => {
    const key = groupKeyString({ normalizedDesc: 'gym', accountId: 1, categoryId: 1, type: 'expense' })
    const newer = [makeTxn({ id: 900, date: '2026-03-05', description: 'Gym' })]
    expect(stillStopped(newer, { [key]: { after: '2026-02-05' } }, newestChargesOfSeries(series))).toEqual({})
  })
})
