/**
 * The series route reads each row once and folds them in the Worker; the oracle works the whole answer
 * out inside SQLite with window functions (`src/testing/seriesOracle.ts`). Over ledgers built to break either,
 * the two must give the same series, field for field and in the same order. `dbSeries.parity.test.ts`
 * holds the route to the engine on the same kinds of ledger.
 */
import { describe, expect, it } from 'vitest'
import type { RecurringSeries } from '../../src/domain/engine/recurringSeries'
import { adversarialLedger } from '../../src/testing/adversarialLedger'
import { makeDataset } from '../../src/testing/factories'
import { randomLedger } from '../../src/testing/randomLedger'
import { seriesEdgeLedger } from '../../src/testing/seriesEdgeLedger'
import { syntheticLedger } from '../../src/testing/syntheticLedger'
import { unicodeLedger } from '../../src/testing/unicodeLedger'
import { OTHER_OWNER, OWNER, awkwardLedger, queryDb } from '../../src/testing/transactionQueryKit'
import type { ExpenseDataset } from '../../src/domain/types'
import { createD1ExpenseRepository } from './adapters/d1ExpenseRepository'
import { oracleSeries } from '../../src/testing/seriesOracle'

async function both(dataset: ExpenseDataset, others: Array<{ owner: string; dataset: ExpenseDataset }> = []) {
  const kit = queryDb(dataset, others)
  const route = await createD1ExpenseRepository({ DB: kit.d1 }).readSeries(OWNER)
  const oracle = oracleSeries(kit.sqlite, OWNER)
  expect(route).toEqual(oracle)
  return route
}

const find = (series: RecurringSeries[], label: string) => series.filter((s) => s.label.trim().toLowerCase() === label.toLowerCase())

describe('the series route and the window-function oracle agree', () => {
  it('on every corner of a series in one ledger, and the corners are all there', async () => {
    const series = await both(seriesEdgeLedger())
    expect(find(series, 'Run of 2')).toHaveLength(0)
    for (const count of [3, 4, 5, 6, 7, 8, 12]) expect(find(series, `Run of ${count}`), `run of ${count}`).toHaveLength(1)
    expect(find(series, 'Run of 5')[0]!.olderGaps).toEqual([])
    expect(find(series, 'Run of 6')[0]!.olderGaps).toHaveLength(1)
    expect(find(series, 'Run of 12')[0]!.olderGaps).toHaveLength(7)
    expect(find(series, 'Zero gap')[0]!.olderGaps).toContain(0)
    expect(find(series, 'Many months')[0]!.budgetMonths).toHaveLength(30)
    expect(find(series, 'Budget moves')[0]!.budgetOffsets).toHaveLength(3)
    expect(find(series, 'Two accounts')).toHaveLength(2)
    expect(find(series, 'Split text')).toHaveLength(0)
    expect(find(series, 'Gym')[0]!.label).toBe(' Gym')
    for (const none of ['Cancelled one', 'Cancelled all', 'Plan payment']) expect(find(series, none), none).toHaveLength(0)
    expect(find(series, 'Cancelled newest')[0]!.newestDates.at(-1)).toBe('2025-04-12')
    expect(series.every((s) => s.label.trim() !== '')).toBe(true)
  })

  it('on rows that tie on a date, whatever order they were booked in', async () => {
    const series = await both(seriesEdgeLedger())
    const [sameDay, sameDayToo] = [find(series, 'Same day')[0]!, find(series, 'Same day too')[0]!]
    expect(series.indexOf(sameDayToo)).toBeLessThan(series.indexOf(sameDay))
    expect(find(series, 'Back dated')[0]!.newestDates).toEqual(['2025-02-28', '2025-03-30', '2025-04-30', '2025-05-30', '2025-06-30'])
  })

  it('on another owner’s rows of the same texts, which it must not read', async () => {
    const mine = seriesEdgeLedger()
    const theirs = seriesEdgeLedger()
    const alone = await both(mine)
    expect(await both(mine, [{ owner: OTHER_OWNER, dataset: theirs }])).toEqual(alone)
  })

  it('on the ledgers the other series tests use', async () => {
    let total = 0
    for (const dataset of [awkwardLedger(), adversarialLedger(), unicodeLedger(), syntheticLedger({ months: 48, perMonth: 30, seed: 5 })]) {
      total += (await both(dataset)).length
    }
    expect(total).toBeGreaterThan(40)
  })

  it('on 120 seeded random ledgers', async () => {
    let withOlderGaps = 0
    for (let seed = 0; seed < 120; seed += 1) {
      const series = await both(randomLedger(seed))
      if (series.some((s) => s.olderGaps.length > 0)) withOlderGaps += 1
    }
    expect(withOlderGaps).toBeGreaterThan(30)
  }, 120_000)

  it('on an owner with no rows', async () => {
    expect(await both(makeDataset())).toEqual([])
  })
})
