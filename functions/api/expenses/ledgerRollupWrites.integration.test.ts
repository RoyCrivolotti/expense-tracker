// @vitest-environment node
/**
 * What the triggers write, counted on SQLite as rows changed in `ledger_cells` and `ledger_months`: an insert,
 * an edit of a key column, an edit of an amount, an edit that changes no column of a cell, a delete, and a bulk
 * edit of 500 rows, each through the real route. docs/decisions/ledger-rollup.md quotes these numbers. They are
 * the triggers' own writes; D1 bills them as rows written (measured on 2026-10-24, see the decision record).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { onRequestDelete as deleteOne, onRequestPatch as patchOne } from './transactions/[id]'
import { onRequestDelete as deleteBulk, onRequestPatch as patchBulk, onRequestPost as postBulk } from './transactions/bulk'
import { migratedDatabase, newStats, sqliteD1 } from '../../../src/testing/sqliteD1'
import { OWNER } from '../../_shared/testing/expenseWorld'
import { call, countRollupWrites, idsOf, type Kit } from '../../_shared/testing/rollupKit'
import { newKit } from '../../_shared/testing/rollupWorld'
import { make } from '../../_shared/testing/rollupScenarios'

afterEach(() => vi.useRealTimers())

async function ledger(): Promise<{ k: Kit; writes: () => number }> {
  const sqlite = migratedDatabase()
  const k = await newKit(sqlite, sqliteD1(sqlite, newStats()), 1)
  const writes = countRollupWrites(sqlite)
  return { k, writes }
}

/** Rows written by `act`. */
async function cost(writes: () => number, act: () => Promise<unknown>): Promise<number> {
  const before = writes()
  await act()
  return writes() - before
}

const patch = (k: Kit, id: number, body: Record<string, unknown>) =>
  call(k, OWNER, patchOne, `/transactions/${id}`, { method: 'PATCH', params: { id: String(id) }, body })

describe('rows written by the triggers', () => {
  it('one row at a time', async () => {
    const { k, writes } = await ledger()
    const [c1, c2] = idsOf(k, 'categories', OWNER) as [number, number]
    const first = await make(k, OWNER, { categoryId: c1 })
    const second = await make(k, OWNER, { categoryId: c1 })
    const alone = await make(k, OWNER, { categoryId: c2, budgetMonth: '2026-07', date: '2026-07-01' })

    expect(await cost(writes, () => make(k, OWNER, { categoryId: c1 })), 'insert into a cell that exists').toBe(2)
    expect(await cost(writes, () => make(k, OWNER, { categoryId: c2 })), 'insert into a new cell').toBe(2)
    expect(await cost(writes, () => patch(k, first, { categoryId: c2 })), 'key column, old cell keeps rows').toBe(2)
    expect(await cost(writes, () => patch(k, alone, { categoryId: c1 })), 'key column, old cell empties').toBe(3)
    expect(await cost(writes, () => patch(k, second, { amountCents: 2000 })), 'amount only').toBe(1)
    expect(await cost(writes, () => patch(k, second, { amountCents: 2000, categoryId: c1, budgetMonth: '2026-09' })), 'nothing changed').toBe(0)
    expect(await cost(writes, () => patch(k, second, { notes: 'x', description: 'y', date: '2026-09-02' })), 'columns outside every cell').toBe(0)
    expect(await cost(writes, () => patch(k, first, { budgetMonth: '2026-03' })), 'month, others remain in the old cell and month').toBe(4)
    expect(await cost(writes, () => patch(k, alone, { budgetMonth: '2026-02' })), 'month, alone in its cell and its month').toBe(6)
    expect(await cost(writes, () => call(k, OWNER, deleteOne, `/transactions/${second}`, { method: 'DELETE', params: { id: String(second) } })), 'delete, others remain').toBe(2)
    expect(await cost(writes, () => call(k, OWNER, deleteOne, `/transactions/${first}`, { method: 'DELETE', params: { id: String(first) } })), 'delete the last of a cell and a month').toBe(4)
  })

  it('500 rows at a time', async () => {
    const { k, writes } = await ledger()
    const [c1, c2] = idsOf(k, 'categories', OWNER) as [number, number]
    const body = Array.from({ length: 500 }, (_, i) => ({
      date: '2026-09-10', budgetMonth: '2026-09', description: `Row ${i}`, accountId: idsOf(k, 'accounts', OWNER)[0], categoryId: c1,
      type: 'expense', amountCents: 1000 + i, cancelled: false,
    }))
    expect(await cost(writes, () => call(k, OWNER, postBulk, '/transactions/bulk', { method: 'POST', body: { transactions: body } })), 'bulk create').toBe(1000)
    const ids = idsOf(k, 'transactions', OWNER)
    expect(await cost(writes, () => call(k, OWNER, patchBulk, '/transactions/bulk', { method: 'PATCH', body: { ids, patch: { description: 'Same' } } })), 'bulk edit of a column outside every cell').toBe(0)
    expect(await cost(writes, () => call(k, OWNER, patchBulk, '/transactions/bulk', { method: 'PATCH', body: { ids, patch: { categoryId: c2 } } })), 'bulk edit of a key column').toBe(1001)
    expect(await cost(writes, () => call(k, OWNER, deleteBulk, '/transactions/bulk', { method: 'DELETE', body: { ids } })), 'bulk delete').toBe(1002)
  })
})
