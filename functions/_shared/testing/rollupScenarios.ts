/**
 * Named hazards for the rollup, each taken by hand and checked against the oracle after every write. The
 * walk (rollupWalk.ts) finds combinations; these are the cases that must never go unvisited, so a weakened
 * trigger cannot survive on luck. This file is about what pins a row; rollupScenariosShape.ts about the rest.
 */
import { expect } from 'vitest'
import { onRequestPost as postTransaction } from '../../api/expenses/transactions/index'
import { onRequestDelete as deleteOne } from '../../api/expenses/transactions/[id]'
import { onRequestDelete as deleteBulk, onRequestPatch as patchBulk } from '../../api/expenses/transactions/bulk'
import { PINNED_SQL } from '../ledgerPartsSql'
import { emptyTables, restoreStatements } from '../restoreSql'
import { OTHER, OWNER } from './expenseWorld'
import { CUBE_FROM_CELLS_SQL } from './rollupOracle'
import { assertRollup, call, countRollupWrites, idsOf, rows, type Kit } from './rollupKit'
import { newPlan } from './rollupLinkedSteps'
import { edit, formOf } from './rollupSteps'

export interface Scenario {
  name: string
  run: (k: Kit) => Promise<void>
}

/** A row with every field fixed: September, the owner's first account and category, 10.00 spent. */
export async function make(k: Kit, owner: string, over: Record<string, unknown> = {}): Promise<number> {
  const body = {
    date: '2026-09-10', budgetMonth: '2026-09', description: 'Market', accountId: idsOf(k, 'accounts', owner)[0],
    categoryId: idsOf(k, 'categories', owner)[0], type: 'expense', amountCents: 1000, cancelled: false, ...over,
  }
  const reply = await call(k, owner, postTransaction, '/transactions', { method: 'POST', body })
  expect(reply.status).toBe(201)
  return Number(reply.body.id)
}

export async function settleRows(k: Kit, owner: string, ids: number[], settledBy: number | null): Promise<void> {
  const reply = await call(k, owner, patchBulk, '/transactions/bulk', { method: 'PATCH', body: { ids, patch: { settledBy } } })
  expect(reply.status).toBe(200)
}

/** The cell a row belongs to, as the rollup holds it: `[pinned, count]`, or nothing if the cell is missing. */
export function cellOf(k: Kit, id: number): Array<[number, number]> {
  return rows(
    k,
    `SELECT c.pinned, c.n FROM transactions t JOIN ledger_cells c ON c.owner = t.owner AND c.budget_month = t.budget_month
      AND c.account_id = t.account_id AND c.category_id = t.category_id AND c.type = t.type AND c.cancelled = t.cancelled
      AND c.sign = CASE WHEN t.amount_cents > 0 THEN 1 WHEN t.amount_cents < 0 THEN -1 ELSE 0 END
      AND c.pinned = CASE WHEN ${PINNED_SQL} THEN 1 ELSE 0 END
      WHERE t.id = ?`,
    id,
  ).map((r) => [Number(r.pinned), Number(r.n)])
}

/** Deletes every row of the owner's smallest month, so that month has to leave the rollup. */
export async function emptySmallestMonth(k: Kit, owner: string): Promise<void> {
  const [smallest] = rows(k, 'SELECT budget_month AS m FROM transactions WHERE owner = ? GROUP BY 1 ORDER BY COUNT(*), 1 LIMIT 1', owner)
  if (!smallest) return
  const ids = idsOf(k, 'transactions', owner, `budget_month = '${String(smallest.m)}'`)
  const reply = await call(k, owner, deleteBulk, '/transactions/bulk', { method: 'DELETE', body: { ids } })
  expect(reply.status).toBe(200)
}

const raw = (k: Kit, sql: string, ...params: Array<string | number | null>) => k.sqlite.prepare(sql).run(...params)

const paymentPinnedOnlyByPointer: Scenario = {
  name: 'a payment that is pinned only because a row points at it',
  run: async (k) => {
    const expense = await make(k, OWNER)
    const payment = await make(k, OWNER, { type: 'refund', amountCents: 1000 })
    await assertRollup(k, 'both created')
    await settleRows(k, OWNER, [expense], payment)
    await assertRollup(k, 'settled')
    expect(cellOf(k, payment)).toEqual([[1, 1]])
    raw(k, 'UPDATE transactions SET report_count = NULL, report_covered_cents = NULL WHERE id = ?', payment)
    await assertRollup(k, 'payment recorded before the covered count')
    expect(cellOf(k, payment)).toEqual([[0, 1]])
    const cube = rows(k, CUBE_FROM_CELLS_SQL, OWNER, '2026-09', '2026-09')
    expect(cube, 'the payment sits in an unpinned cell, and the reader leaves it out').toEqual([])
    await settleRows(k, OWNER, [expense], null)
    await assertRollup(k, 'unsettled')
    expect(rows(k, CUBE_FROM_CELLS_SQL, OWNER, '2026-09', '2026-09').map((r) => r.n), 'the unsettled expense and the payment, now both unpinned').toEqual([1, 1])
  },
}

const rowMovesBetweenPinnedAndUnpinned: Scenario = {
  name: 'a row that moves between pinned and unpinned',
  run: async (k) => {
    const id = await make(k, OWNER)
    const other = await make(k, OWNER, { description: 'Other' })
    const flag = idsOf(k, 'flags', OWNER)[0]!
    const steps: Array<[string, () => unknown, number]> = [
      ['flagged', () => edit(k, OWNER, id, { flagId: flag }), 1],
      ['unflagged', () => edit(k, OWNER, id, { flagId: null }), 0],
      ['investment', () => edit(k, OWNER, id, { type: 'investment' }), 1],
      ['expense again', () => edit(k, OWNER, id, { type: 'expense' }), 0],
      ['settled', () => settleRows(k, OWNER, [id], other), 1],
      ['unsettled', () => settleRows(k, OWNER, [id], null), 0],
      ['covered count', () => raw(k, 'UPDATE transactions SET report_count = 2 WHERE id = ?', id), 1],
      ['count of zero', () => raw(k, 'UPDATE transactions SET report_count = 0 WHERE id = ?', id), 0],
      ['count of NULL after a count', () => raw(k, 'UPDATE transactions SET report_count = 3 WHERE id = ?', id), 1],
    ]
    for (const [name, write, pinned] of steps) {
      await write()
      await assertRollup(k, name)
      expect(cellOf(k, id).map(([p]) => p), name).toEqual([pinned])
    }
    raw(k, 'UPDATE transactions SET report_count = NULL WHERE id = ?', id)
    await assertRollup(k, 'count back to NULL')
    expect(cellOf(k, id).map(([p]) => p)).toEqual([0])
  },
}

const nullReportCount: Scenario = {
  name: 'a NULL covered count is not pinned',
  run: async (k) => {
    const id = await make(k, OWNER)
    expect(rows(k, 'SELECT report_count FROM transactions WHERE id = ?', id)[0]!.report_count).toBeNull()
    expect(cellOf(k, id)).toEqual([[0, 1]])
    await edit(k, OWNER, id, { amountCents: 2000 })
    await assertRollup(k, 'edited while NULL')
    await call(k, OWNER, deleteOne, `/transactions/${id}`, { method: 'DELETE', params: { id: String(id) } })
    await assertRollup(k, 'deleted while NULL')
    expect(rows(k, 'SELECT COUNT(*) AS c FROM ledger_cells WHERE owner = ?', OWNER)[0]!.c).toBe(0)
  },
}

const editFormResendsValues: Scenario = {
  name: 'an edit form that sends every field back unchanged writes nothing',
  run: async (k) => {
    const id = await make(k, OWNER)
    await make(k, OWNER)
    const writes = countRollupWrites(k.sqlite)
    const cost = async (body: Record<string, unknown>): Promise<number> => {
      const before = writes()
      expect(await edit(k, OWNER, id, body)).toBe(200)
      await assertRollup(k, JSON.stringify(body))
      return writes() - before
    }
    const flags = idsOf(k, 'flags', OWNER)
    expect(await cost(formOf(k, id)), 'nothing changed').toBe(0)
    expect(await cost({ ...formOf(k, id), notes: 'a note', description: 'Renamed', date: '2026-09-20' }), 'columns that are not in a cell').toBe(0)
    expect(await cost({ ...formOf(k, id), amountCents: 2500 }), 'amount only').toBe(1)
    expect(await cost({ flagId: flags[0]! }), 'unpinned to pinned').toBeGreaterThan(1)
    expect(await cost({ flagId: flags[1]! }), 'another flag, still pinned').toBe(0)
    expect(await cost({ ...formOf(k, id), type: 'investment' }), 'another type').toBeGreaterThan(1)
    expect(await cost({ ...formOf(k, id), amountCents: -2500 }), 'the sign of the amount alone').toBeGreaterThan(1)
    expect(await cost({ ...formOf(k, id), budgetMonth: '2026-08', date: '2026-08-10' }), 'another month').toBeGreaterThan(1)
  },
}

const bothOwnersAreIndependent: Scenario = {
  name: 'one owner’s writes leave the other’s cells alone',
  run: async (k) => {
    const mine = await make(k, OWNER)
    const theirs = await make(k, OTHER)
    const snapshot = () => JSON.stringify(rows(k, 'SELECT * FROM ledger_cells WHERE owner = ? ORDER BY 1, 2, 3, 4, 5, 6, 7, 8', OTHER))
    const before = snapshot()
    await edit(k, OWNER, mine, { amountCents: 5000, categoryId: idsOf(k, 'categories', OWNER)[1] })
    await settleRows(k, OWNER, [mine], await make(k, OWNER, { type: 'refund' }))
    await assertRollup(k, 'owner edits')
    expect(snapshot()).toBe(before)
    expect(await edit(k, OTHER, mine, { amountCents: 1 }), 'another owner’s id is not found').toBe(404)
    expect(await edit(k, OTHER, theirs, { amountCents: 2000 })).toBe(200)
    await assertRollup(k, 'other owner edits')
  },
}

const amountOfPinnedRow: Scenario = {
  name: 'an amount or a cancellation edited alone on a row pinned for each reason',
  run: async (k) => {
    const flag = idsOf(k, 'flags', OWNER)[0]
    const reasons: Array<[string, () => Promise<number>]> = [
      ['investment', () => make(k, OWNER, { type: 'investment' })],
      ['flag', () => make(k, OWNER, { flagId: flag })],
      ['plan', async () => (await newPlan(k, OWNER), idsOf(k, 'transactions', OWNER, 'plan_id IS NOT NULL')[0]!)],
      ['settled', async () => { const id = await make(k, OWNER); await settleRows(k, OWNER, [id], await make(k, OWNER, { type: 'refund' })); return id }],
      ['covered count', async () => { const id = await make(k, OWNER, { type: 'refund' }); raw(k, 'UPDATE transactions SET report_count = 2 WHERE id = ?', id); return id }],
    ]
    for (const [reason, prepare] of reasons) {
      const id = await prepare()
      expect(cellOf(k, id).map(([p]) => p), reason).toEqual([1])
      for (const body of [{ amountCents: 4321 }, { cancelled: true }, { amountCents: 9876 }]) {
        expect(await edit(k, OWNER, id, body)).toBe(200)
        await assertRollup(k, `${reason}: ${JSON.stringify(body)}`)
      }
    }
  },
}

/** Rows the API cannot make now, and a change of owner it never makes: the triggers hold for them all the same. */
const oldShapes: Scenario = {
  name: 'a zero amount and a row handed to another owner',
  run: async (k) => {
    const [account, category] = [idsOf(k, 'accounts', OWNER)[0]!, idsOf(k, 'categories', OWNER)[0]!]
    await make(k, OWNER)
    const tables = emptyTables()
    tables.transactions = [{ id: 9001, date: '2026-09-01', budgetMonth: '2026-09', description: 'Zero', accountId: account, categoryId: category, type: 'expense', amountCents: 0, cancelled: false, createdAt: '2026-09-01 10:00:00' }]
    for (const statement of restoreStatements(OWNER, tables)) k.sqlite.exec(statement)
    const id = 9001
    await assertRollup(k, 'a zero amount')
    expect(await edit(k, OWNER, id, { amountCents: 500 })).toBe(200)
    await assertRollup(k, 'zero to positive')
    expect(await edit(k, OWNER, id, { amountCents: 500, type: 'investment' })).toBe(200)
    raw(k, 'UPDATE transactions SET owner = ? WHERE id = ?', OTHER, id)
    await assertRollup(k, 'handed to another owner')
    raw(k, 'UPDATE transactions SET owner = ?, amount_cents = 0 WHERE id = ?', OWNER, id)
    await assertRollup(k, 'handed back, and zero again')
    await call(k, OWNER, deleteOne, `/transactions/${id}`, { method: 'DELETE', params: { id: String(id) } })
    await assertRollup(k, 'the zero row deleted')
  },
}

export const pinningScenarios: Scenario[] = [amountOfPinnedRow, oldShapes, 
  paymentPinnedOnlyByPointer, rowMovesBetweenPinnedAndUnpinned, nullReportCount, editFormResendsValues, bothOwnersAreIndependent,
]
