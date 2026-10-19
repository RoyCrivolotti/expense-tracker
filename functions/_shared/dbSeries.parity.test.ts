/**
 * The series statement is held to the engine. For ledgers of every shape the test kit has, the series the
 * SQL serves are exactly the series `seriesFromTransactions` builds from the same rows (the engine's own
 * `groupTransactions` is what that function reduces), including for text where SQLite's `lower` and
 * `trim` disagree with JavaScript's. The real SQL runs on SQLite with the real migrations.
 */
import { describe, expect, it } from 'vitest'
import { seriesFromTransactions } from '../../src/domain/engine/recurringSeries'
import { adversarialLedger } from '../../src/testing/adversarialLedger'
import { awkwardRows } from '../../src/testing/awkwardDescriptions'
import { makeDataset } from '../../src/testing/factories'
import { randomLedger } from '../../src/testing/randomLedger'
import { syntheticLedger } from '../../src/testing/syntheticLedger'
import { spelledSeries, unicodeLedger } from '../../src/testing/unicodeLedger'
import { inMemoryExpenseRepository } from '../../src/testing/inMemoryExpenseRepository'
import { OWNER, awkwardLedger, queryDb } from '../../src/testing/transactionQueryKit'
import type { ExpenseDataset } from '../../src/domain/types'
import { createD1ExpenseRepository } from './adapters/d1ExpenseRepository'
import { loadDataset } from './db'

async function served(dataset: ExpenseDataset) {
  const kit = queryDb(dataset)
  return createD1ExpenseRepository({ DB: kit.d1 }).readSeries(OWNER)
}

const reference = (dataset: ExpenseDataset) => seriesFromTransactions(dataset.transactions)

describe('the series the SQL serves equal the engine’s', () => {
  it('on the generated ledger the paged-read tests use, with its accents, ties and missing accounts', async () => {
    const dataset = awkwardLedger()
    const series = await served(dataset)
    expect(series.length).toBeGreaterThan(5)
    expect(series).toEqual(reference(dataset))
  })

  it('on the 60 month adversarial ledger', async () => {
    const dataset = adversarialLedger()
    const series = await served(dataset)
    expect(series.length).toBeGreaterThan(5)
    expect(series).toEqual(reference(dataset))
  })

  it('on 80 seeded random ledgers', async () => {
    let withSeries = 0
    for (let seed = 0; seed < 80; seed += 1) {
      const dataset = randomLedger(seed)
      const series = await served(dataset)
      expect(series, `seed ${seed}`).toEqual(reference(dataset))
      if (series.length > 0) withSeries += 1
    }
    expect(withSeries).toBeGreaterThan(30)
  }, 60_000)

  it('on a large regular ledger of fixed, quarterly and yearly series', async () => {
    const dataset = syntheticLedger({ months: 48, perMonth: 30, seed: 5 })
    const series = await served(dataset)
    expect(series.length).toBeGreaterThan(5)
    expect(series).toEqual(reference(dataset))
  })

  it('on text where SQLite’s lower and trim disagree with JavaScript’s', async () => {
    const dataset = unicodeLedger()
    const series = await served(dataset)
    expect(series).toEqual(reference(dataset))
    const labels = series.map((s) => s.label.trim().toLowerCase())
    expect(labels).toEqual(expect.arrayContaining(['café', 'москва', 'straße', 'kelvin', 'rent', '🍕 pizza']))
    expect(series.filter((s) => s.label.trim().toLowerCase() === 'café')).toHaveLength(3)
    expect(series.find((s) => s.label.trim().toLowerCase() === 'rent')?.newestDates).toHaveLength(4)
  })

  it('and would not if the SQL grouped on lower(trim(description)): the same ledger groups differently', async () => {
    const dataset = unicodeLedger()
    const kit = queryDb(dataset)
    const rows = kit.sqlite
      .prepare('SELECT lower(trim(description)) AS k, count(*) AS n FROM transactions GROUP BY k, account_id, category_id, type')
      .all() as unknown as Array<{ k: string; n: number }>
    const sqlSeries = rows.filter((r) => r.k !== '' && r.n >= 3).length
    expect(sqlSeries).not.toBe(reference(dataset).length)
  })

  it('on a ledger of the awkward descriptions used by the backfill tests, repeated into series', async () => {
    const rows = [0, 1, 2, 3].flatMap((round) =>
      awkwardRows(1 + round * 100, { date: `2026-0${round + 1}-12`, budgetMonth: `2026-0${round + 1}` }),
    )
    const dataset = makeDataset({ transactions: rows.map((t) => ({ ...t, createdAt: '2026-01-01T00:00:00Z' })) })
    expect(await served(dataset)).toEqual(reference(dataset))
  })

  it('and returns nothing for an owner with no rows or fewer than three of a kind', async () => {
    expect(await served(makeDataset())).toEqual([])
    const two = makeDataset({ transactions: spelledSeries(1, ['Gym', 'gym']) })
    expect(await served(two)).toEqual([])
  })
})

describe('the in-memory repository answers the same as the SQL', () => {
  it('for the series of the dataset the API serves', async () => {
    let total = 0
    for (const dataset of [awkwardLedger(), unicodeLedger(), randomLedger(3), randomLedger(11), adversarialLedger()]) {
      const env = { DB: queryDb(dataset).d1 }
      const fromSql = await createD1ExpenseRepository(env).readSeries(OWNER)
      const memory = inMemoryExpenseRepository(await loadDataset(env, OWNER), OWNER)
      expect(await memory.readSeries(OWNER)).toEqual(fromSql)
      total += fromSql.length
    }
    expect(total).toBeGreaterThan(20)
  })

  it('and for an owner it has never seen, none', async () => {
    expect(await inMemoryExpenseRepository({}, OWNER).readSeries(OWNER)).toEqual([])
  })
})
