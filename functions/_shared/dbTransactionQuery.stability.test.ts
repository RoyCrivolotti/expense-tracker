/**
 * Paging by position rather than offset: whatever is inserted or deleted between two page fetches,
 * no row is returned twice and no row that was there from the first fetch to the last is missed.
 */
import { describe, expect, it } from 'vitest'
import type { TransactionKey } from '../../src/domain/data/transactionQuery'
import type { TxnFilter } from '../../src/domain/engine/transactions'
import { mulberry32 } from '../../src/domain/engine/rng'
import type { Transaction } from '../../src/domain/types'
import { syntheticLedger } from '../../src/testing/syntheticLedger'
import { OWNER, queryDb } from '../../src/testing/transactionQueryKit'
import { createD1ExpenseRepository } from './adapters/d1ExpenseRepository'

const FILTERS: TxnFilter[] = [{}, { month: '2026-08' }, { type: 'expense', status: 'posted' }]

function setup() {
  const ledger = syntheticLedger({ months: 6, perMonth: 40, seed: 3 })
  const kit = queryDb(ledger)
  const repo = createD1ExpenseRepository({ DB: kit.d1 })
  return { kit, repo, ledger }
}

function insert(kit: ReturnType<typeof setup>['kit'], date: string, description: string): number {
  const result = kit.sqlite
    .prepare(
      `INSERT INTO transactions (owner, date, budget_month, description, account_id, category_id, type, amount_cents, cancelled, created_at)
       VALUES (?, ?, ?, ?, 1, 1, 'expense', 1234, 0, '2026-09-01T00:00:00Z')`,
    )
    .run(OWNER, date, date.slice(0, 7), description)
  return Number(result.lastInsertRowid)
}

describe('paging while the ledger changes', () => {
  it('never repeats a row nor drops one that stayed, whatever is inserted or deleted between pages', async () => {
    for (const [seed, filter] of FILTERS.entries()) {
      const { kit, repo } = setup()
      const rnd = mulberry32(100 + seed)
      const initial = (await repo.queryTransactions(OWNER, filter, { limit: 100_000 })).items
      expect(initial.length).toBeGreaterThan(30)
      const initialIds = new Set(initial.map((t) => t.id))
      const deleted = new Set<number>()
      const seen: Transaction[] = []
      let after: TransactionKey | undefined
      for (let guard = 0; guard < 1_000; guard += 1) {
        const page = await repo.queryTransactions(OWNER, filter, after ? { limit: 9, after } : { limit: 9 })
        seen.push(...page.items)
        const last = page.items.at(-1)
        if (!page.hasMore || !last) break
        after = { date: last.date, id: last.id }
        // Between fetches: some rows disappear (including ones just read), and new ones arrive
        // both ahead of and behind the cursor, on the cursor's own date and on others.
        for (const row of initial) {
          if (rnd() < 0.03) {
            kit.sqlite.prepare('DELETE FROM transactions WHERE id = ?').run(row.id)
            deleted.add(row.id)
          }
        }
        for (const date of [last.date, '2026-09-20', '2026-03-05', '2026-08-15']) {
          if (rnd() < 0.6) insert(kit, date, `arrived ${guard}`)
        }
      }
      const ids = seen.map((t) => t.id)
      expect(new Set(ids).size, 'no row twice').toBe(ids.length)
      const stayed = initial.filter((t) => !deleted.has(t.id))
      for (const row of stayed) expect(ids, `row ${row.id} kept`).toContain(row.id)
      for (const t of seen) {
        const wasThere = initialIds.has(t.id)
        const matches = filter.month === undefined || t.budgetMonth === filter.month
        expect(wasThere || matches).toBe(true)
      }
      const order = seen.map((t) => `${t.date}#${String(t.id).padStart(9, '0')}`)
      expect(order).toEqual([...order].sort().reverse())
    }
  })

  it('does not move the next page when the cursor row itself is deleted', async () => {
    const { kit, repo } = setup()
    const first = await repo.queryTransactions(OWNER, {}, { limit: 5 })
    const last = first.items.at(-1) as Transaction
    const expectedNext = (await repo.queryTransactions(OWNER, {}, { limit: 10, after: last })).items
    kit.sqlite.prepare('DELETE FROM transactions WHERE id = ?').run(last.id)
    const after = await repo.queryTransactions(OWNER, {}, { limit: 10, after: last })
    expect(after.items.map((t) => t.id)).toEqual(expectedNext.map((t) => t.id))
  })

  it('shows a row inserted behind the cursor on a later page and one ahead of it not at all', async () => {
    const { kit, repo } = setup()
    const first = await repo.queryTransactions(OWNER, {}, { limit: 5 })
    const last = first.items.at(-1) as Transaction
    const ahead = insert(kit, '2099-01-01', 'ahead of the cursor')
    const behind = insert(kit, '2000-01-01', 'behind the cursor')
    const rest: number[] = []
    let after: TransactionKey = { date: last.date, id: last.id }
    for (let i = 0; i < 1_000; i += 1) {
      const page = await repo.queryTransactions(OWNER, {}, { limit: 100, after })
      rest.push(...page.items.map((t) => t.id))
      const tail = page.items.at(-1)
      if (!page.hasMore || !tail) break
      after = { date: tail.date, id: tail.id }
    }
    expect(rest).toContain(behind)
    expect(rest).not.toContain(ahead)
  })
})
