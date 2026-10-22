// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { migratedDatabase } from '../../src/testing/sqliteD1'
import { seedDataset } from '../../src/testing/seedSqlite'
import { syntheticLedger } from '../../src/testing/syntheticLedger'
import {
  CAPS,
  FREE_PLAN,
  FULL_INDEXES_ON_TRANSACTIONS,
  LABEL_LINK_WRITES,
  datasetInsertWrites,
  insertWrites,
  largestSeed,
  partialIndexHits,
  readPassEstimate,
  seedBudget,
} from './budget'
import { ledgerOfAbout } from './ledgerSize'

interface IndexRow {
  name: string
  partial: number
}

/** Entries an index holds, read from the schema itself: all rows, or those its WHERE clause keeps. */
function indexEntries(db: ReturnType<typeof migratedDatabase>, table: string): number {
  const indexes = db.prepare(`PRAGMA index_list(${table})`).all() as unknown as IndexRow[]
  let entries = 0
  for (const index of indexes) {
    const sql = (db.prepare('SELECT sql FROM sqlite_master WHERE name = ?').get(index.name) as { sql: string | null }).sql
    const where = index.partial ? /\bWHERE\b([\s\S]*)$/i.exec(sql ?? '')?.[1] : undefined
    const count = db.prepare(`SELECT count(*) AS n FROM ${table}${where ? ` WHERE ${where}` : ''}`).get() as { n: number }
    entries += count.n
  }
  return entries
}

describe('what an insert costs', () => {
  const db = migratedDatabase()

  it('counts the indexes that hold every transaction, so a new index fails this until the docs are updated', () => {
    const indexes = db.prepare('PRAGMA index_list(transactions)').all() as unknown as IndexRow[]
    expect(indexes.filter((i) => !i.partial)).toHaveLength(FULL_INDEXES_ON_TRANSACTIONS)
    expect(indexes.filter((i) => i.partial)).toHaveLength(5)
  })

  it('counts a label link as its row, its UNIQUE pair and its two indexes', () => {
    const indexes = db.prepare('PRAGMA index_list(transaction_labels)').all()
    expect(1 + indexes.length).toBe(LABEL_LINK_WRITES)
  })

  it('agrees with the entries a seeded ledger really puts in the table and its indexes', () => {
    const fresh = migratedDatabase()
    const dataset = syntheticLedger({ months: 12, perMonth: 20, endMonth: '2026-10', seed: 3 })
    seedDataset(fresh, 'scaling-check@example.com', dataset)
    const rows = dataset.transactions.length
    const links = dataset.transactions.reduce((sum, t) => sum + (t.labelIds?.length ?? 0), 0)
    const txnWrites = rows + indexEntries(fresh, 'transactions')
    const linkWrites = links + indexEntries(fresh, 'transaction_labels')
    expect(datasetInsertWrites(dataset)).toBe(txnWrites + linkWrites)
  })

  it('puts an ordinary expense at 8 rows and a row in every partial index at 13', () => {
    expect(insertWrites({ type: 'expense' })).toBe(8)
    const everything = { type: 'investment' as const, planId: 1, installmentIndex: 2, flagId: 3, settledBy: 4, reportCount: 1 }
    expect(partialIndexHits(everything)).toBe(5)
    expect(insertWrites(everything)).toBe(13)
  })

  it('leaves a plan row without an instalment index out of the unique plan index', () => {
    expect(partialIndexHits({ type: 'expense', planId: 1 })).toBe(2)
  })
})

describe('the seed budget', () => {
  it('fits the caps at 1,200 transactions and says where the rows go', () => {
    const budget = seedBudget(ledgerOfAbout(1200, '2026-10'))
    expect(budget.transactions).toBeGreaterThanOrEqual(1080)
    expect(budget.total).toBe(budget.dayOne + budget.dayTwo)
    expect(budget.fitsTotalCap).toBe(true)
    expect(budget.fitsDailyCap).toBe(true)
    expect(budget.total).toBeLessThanOrEqual(CAPS.rowsWrittenTotal)
  })

  it('does not fit at 2,000 transactions', () => {
    const budget = seedBudget(ledgerOfAbout(2000, '2026-10'))
    expect(budget.fitsTotalCap).toBe(false)
  })

  it('finds the largest seed under a cap, and none larger fits', () => {
    const build = (n: number) => ledgerOfAbout(n, '2026-10')
    const best = largestSeed(build)
    expect(best.budget.total).toBeLessThanOrEqual(CAPS.rowsWrittenTotal)
    expect(best.requested).toBeGreaterThan(1000)
    expect(seedBudget(build(best.requested + 250)).total).toBeGreaterThan(CAPS.rowsWrittenTotal)
  })

  it('estimates a read pass as linear in the ledger with a small fixed part', () => {
    expect(readPassEstimate(0)).toBe(5_000)
    expect(readPassEstimate(1000)).toBeGreaterThan(readPassEstimate(500))
  })

  it('keeps the exercise a small share of the Free plan', () => {
    expect(CAPS.rowsWrittenTotal / FREE_PLAN.rowsWrittenPerDay).toBeLessThanOrEqual(0.25)
    expect(CAPS.rowsReadTotal / FREE_PLAN.rowsReadPerDay).toBeLessThanOrEqual(0.1)
    expect(CAPS.accountWrittenCeiling).toBeLessThan(FREE_PLAN.rowsWrittenPerDay / 2)
  })
})
