/**
 * Evidence for dropping two indexes on `transactions` that the paged reads make redundant (the drop
 * itself is described in docs/SCALING.md and is not a migration). Every statement the repository runs
 * against `transactions` across reads and the write paths is put through `EXPLAIN QUERY PLAN`:
 *
 * - `idx_txn_budget_month (budget_month)` is read by no statement at all. Writes keep it up to date
 *   and nothing consults it.
 * - `idx_txn_owner (owner)` is the first column of `idx_txn_owner_date (owner, date)`, so anything it
 *   serves, that one serves with the same rows visited.
 *
 * Each index costs a written row on every insert, and Cloudflare's Free plan allows 100,000 a day.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { syntheticLedger } from '../../src/testing/syntheticLedger'
import { OWNER, planOf, queryDb, type QueryDb, type RecordedStatement } from '../../src/testing/transactionQueryKit'
import { createD1ExpenseRepository } from './adapters/d1ExpenseRepository'

const USED_INDEX = /USING (?:COVERING )?INDEX (\w+)/

let kit: QueryDb
let touching: RecordedStatement[]

async function exercise(kit: QueryDb): Promise<void> {
  const repo = createD1ExpenseRepository({ DB: kit.d1 })
  const row = {
    date: '2026-09-02',
    budgetMonth: '2026-09',
    description: 'Audit',
    accountId: 1,
    categoryId: 1,
    type: 'expense' as const,
    amountCents: 100,
    cancelled: false,
  }
  await repo.loadDataset(OWNER)
  await repo.listOwners()
  const a = await repo.insertTransaction(OWNER, row)
  const b = await repo.insertTransaction(OWNER, { ...row, planId: 1 })
  await repo.updateTransaction(OWNER, a.id, { budgetMonth: '2026-08', amountCents: 250, flagId: 1 })
  await repo.setTransactionLabels(OWNER, a.id, [1, 2])
  await repo.bulkUpdateTransactions(OWNER, [a.id, b.id], { categoryId: 2 })
  await repo.transactionExists(OWNER, a.id)
  await repo.deleteTransaction(OWNER, a.id)
  await repo.deleteTransactions(OWNER, [b.id])
  await repo.deleteFlag(OWNER, 2)
  await repo.deleteLabel(OWNER, 3)
  await repo.deleteCategory(OWNER, 9, { reassignToId: 1 })
  await repo.deleteAccount(OWNER, 4, { reassignToId: 1 })
  for (const filter of [{}, { month: '2026-03' }, { categoryId: 2 }, { query: 'market' }, { labelIds: [1] }]) {
    await repo.queryTransactions(OWNER, filter, { limit: 50 })
    await repo.summarizeTransactions(OWNER, filter)
  }
  await repo.getTransaction(OWNER, 5)
}

beforeAll(async () => {
  kit = queryDb(syntheticLedger({ months: 12, perMonth: 20, seed: 9 }))
  await exercise(kit)
  touching = kit.statements.filter((s) => /\btransactions\b/.test(s.sql))
})

const dml = (statement: RecordedStatement) => /^\s*(select|update|delete|with)\b/i.test(statement.sql)

function indexesUsed(): Set<string> {
  const used = new Set<string>()
  for (const statement of touching.filter(dml)) {
    for (const line of planOf(kit.sqlite, statement)) {
      const index = USED_INDEX.exec(line)?.[1]
      if (index) used.add(index)
    }
  }
  return used
}

describe('indexes on transactions, by the statements the repository runs', () => {
  it('runs a representative set of statements', () => {
    expect(touching.filter(dml).length).toBeGreaterThan(25)
  })

  it('reads through the two new indexes', () => {
    const used = indexesUsed()
    expect(used).toContain('idx_txn_owner_date')
    expect(used).toContain('idx_txn_owner_month_date')
  })

  it('never reads through idx_txn_budget_month', () => {
    expect(indexesUsed()).not.toContain('idx_txn_budget_month')
  })

  it('plans the same scans without idx_txn_owner and idx_txn_budget_month', () => {
    const scans = (statement: RecordedStatement) =>
      planOf(kit.sqlite, statement)
        .filter((line) => /^SCAN /.test(line))
        .map((line) => line.replace(/ USING (COVERING )?INDEX \w+/, ''))
    const before = touching.filter(dml).map(scans)
    kit.sqlite.exec('DROP INDEX idx_txn_owner')
    kit.sqlite.exec('DROP INDEX idx_txn_budget_month')
    expect(touching.filter(dml).map(scans)).toEqual(before)
    expect(indexesUsed()).not.toContain('idx_txn_owner')
  })
})

describe('the indexes that stay', () => {
  it('include the owner-less category and account ones, which foreign keys and reassigns use', () => {
    expect([...indexesUsed()]).toEqual(expect.arrayContaining(['idx_txn_category', 'idx_txn_account']))
  })
})
