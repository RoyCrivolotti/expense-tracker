/**
 * An edit on a filter reaches exactly the rows the engine's filter picks (and so the rows the paged list
 * pages through), whatever the filter holds: description, notes, accents, `%` and `_`, ties on a date,
 * withdrawals and a missing account all included. Each of 120 random filters is applied to the real SQL
 * on SQLite and to the in-memory repository, and the rows that changed are compared with
 * `filterTransactions` over the dataset the API serves.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { MAX_FILTER_EDIT_ROWS } from '../domain/data/bulkEdit'
import { validateTxnFilter } from '../domain/application/transactionQueryService'
import { filterTransactions, type TxnFilter } from '../domain/engine/transactions'
import type { ExpenseDataset, Transaction } from '../domain/types'
import type { ExpenseRepository } from '../domain/ports/expenseRepository'
import { inMemoryExpenseRepository } from '../../src/testing/inMemoryExpenseRepository'
import {
  OWNER,
  allPages,
  awkwardLedger,
  filterStream,
  queryDb,
  vocabularyOf,
  type QueryDb,
} from '../../src/testing/transactionQueryKit'
import { createD1ExpenseRepository } from './adapters/d1ExpenseRepository'
import { loadDataset } from './db'
import type { Env } from './env'

const SLOW = 60_000

let kit: QueryDb
let env: Env
let repo: ExpenseRepository
let served: ExpenseDataset
let filters: TxnFilter[]
let original: Map<number, { description: string; description_norm: string | null; updated_at: string | null }>

beforeAll(async () => {
  const ledger = awkwardLedger()
  kit = queryDb(ledger)
  env = { DB: kit.d1 }
  repo = createD1ExpenseRepository(env)
  // Reading the dataset inserts the instalments that have fallen due; do that before taking the snapshot.
  served = await loadDataset(env, OWNER)
  filters = filterStream(vocabularyOf(ledger), 120, 20261019)
  const rows = kit.sqlite.prepare('SELECT id, description, description_norm, updated_at FROM transactions WHERE owner = ?').all(OWNER) as Array<{
    id: number
    description: string
    description_norm: string | null
    updated_at: string | null
  }>
  original = new Map(rows.map((r) => [r.id, r]))
})

/** The in-memory repository over the dataset the API serves, label links included (a seed's `labelIds` are ignored). */
function inMemoryRepository(): ExpenseRepository {
  const transactionLabels = served.transactions.flatMap((t) =>
    (t.labelIds ?? []).map((labelId) => ({ transactionId: t.id, labelId })),
  )
  return inMemoryExpenseRepository({ ...served, transactionLabels }, OWNER)
}

/** Put back what an edit changed, so every filter is judged against the same ledger. */
function restore(ids: number[]): void {
  const put = kit.sqlite.prepare('UPDATE transactions SET description = ?, description_norm = ?, updated_at = ? WHERE id = ?')
  for (const id of ids) {
    const row = original.get(id)!
    put.run(row.description, row.description_norm, row.updated_at, id)
  }
}

const renamed = (): number[] =>
  (kit.sqlite.prepare("SELECT id FROM transactions WHERE owner = ? AND description LIKE 'Bulk edit %' ORDER BY id").all(OWNER) as Array<{ id: number }>).map((r) => r.id)

describe('an edit on a filter changes exactly the rows the engine’s filter picks', () => {
  it('for 120 random filters, in SQL and in the in-memory repository', async () => {
    let withRows = 0
    let tooMany = 0
    for (const [i, filter] of filters.entries()) {
      const want = filterTransactions(served.transactions, validateTxnFilter(filter)).map((t) => t.id).sort((a, b) => a - b)
      const patch = { description: `Bulk edit ${i}` }
      if (want.length > MAX_FILTER_EDIT_ROWS) {
        // Past the cap an edit is refused whole, in SQL and in memory alike, and nothing is written.
        const target = { filter: validateTxnFilter(filter), expectedCount: MAX_FILTER_EDIT_ROWS }
        await expect(repo.bulkUpdateTransactionsByFilter(OWNER, target, patch)).rejects.toMatchObject({ status: 400 })
        await expect(inMemoryRepository().bulkUpdateTransactionsByFilter(OWNER, target, patch)).rejects.toMatchObject({ status: 400 })
        expect(renamed(), JSON.stringify(filter)).toEqual([])
        tooMany += 1
        continue
      }
      if (want.length > 0) withRows += 1

      const sql = await repo.bulkUpdateTransactionsByFilter(OWNER, { filter: validateTxnFilter(filter), expectedCount: want.length }, patch)
      const touched = renamed()
      restore(touched)
      const memory = inMemoryRepository()
      const double = await memory.bulkUpdateTransactionsByFilter(OWNER, { filter: validateTxnFilter(filter), expectedCount: want.length }, patch)
      const doubled = (await memory.loadDataset(OWNER)).transactions.filter((t) => t.description === patch.description)

      expect(sql.updated, JSON.stringify(filter)).toBe(want.length)
      expect(touched, JSON.stringify(filter)).toEqual(want)
      expect(double.updated).toBe(want.length)
      expect(doubled.map((t) => t.id).sort((a, b) => a - b), JSON.stringify(filter)).toEqual(want)
    }
    expect(withRows).toBeGreaterThan(40)
    expect(tooMany).toBeGreaterThan(3)
  }, SLOW)

  it('and refuses the same filters when the count is one off', async () => {
    for (const filter of filters.slice(0, 30)) {
      const valid = validateTxnFilter(filter)
      const n = filterTransactions(served.transactions, valid).length
      if (n > MAX_FILTER_EDIT_ROWS) continue
      for (const expectedCount of [n + 1, ...(n > 0 ? [n - 1] : [])]) {
        await expect(repo.bulkUpdateTransactionsByFilter(OWNER, { filter: valid, expectedCount }, { description: 'No' })).rejects.toMatchObject({ status: 409 })
        await expect(
          inMemoryRepository().bulkUpdateTransactionsByFilter(OWNER, { filter: valid, expectedCount }, { description: 'No' }),
        ).rejects.toMatchObject({ status: 409 })
      }
    }
    expect(renamed()).toEqual([])
  }, SLOW)

  it('reaches the rows the list pages through, whichever page size is used', async () => {
    for (const [i, filter] of filters.slice(0, 40).entries()) {
      const valid = validateTxnFilter(filter)
      const listed = (await allPages(repo, OWNER, valid, 50)).map((t: Transaction) => t.id).sort((a, b) => a - b)
      if (listed.length > MAX_FILTER_EDIT_ROWS) continue

      await repo.bulkUpdateTransactionsByFilter(OWNER, { filter: valid, expectedCount: listed.length }, { description: `Bulk edit ${i}` })
      const touched = renamed()
      restore(touched)

      expect(touched, JSON.stringify(filter)).toEqual(listed)
    }
  }, SLOW)
})
