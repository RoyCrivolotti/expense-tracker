/**
 * What the named rollup scenarios (rollupScenarios.ts, rollupScenariosShape.ts) build on: a row with every field
 * fixed, a bulk settle, the cell a row sits in, emptying the smallest month, and a raw statement for rows the
 * routes cannot make.
 */
import { expect } from 'vitest'
import { onRequestPost as postTransaction } from '../../api/expenses/transactions/index'
import { onRequestDelete as deleteBulk, onRequestPatch as patchBulk } from '../../api/expenses/transactions/bulk'
import { PINNED_SQL } from '../ledgerPartsSql'
import { call, idsOf, rows, type Kit } from './rollupKit'

export interface Scenario {
  name: string
  run: (k: Kit) => Promise<void>
}

/** A row with every field fixed: September, the owner's first account and category, 10.00 spent. */
export async function make(
  k: Kit,
  owner: string,
  over: Record<string, unknown> = {},
): Promise<number> {
  const body = {
    date: '2026-09-10',
    budgetMonth: '2026-09',
    description: 'Market',
    accountId: idsOf(k, 'accounts', owner)[0],
    categoryId: idsOf(k, 'categories', owner)[0],
    type: 'expense',
    amountCents: 1000,
    cancelled: false,
    ...over,
  }
  const reply = await call(k, owner, postTransaction, '/transactions', { method: 'POST', body })
  expect(reply.status).toBe(201)
  return Number(reply.body.id)
}

export async function settleRows(
  k: Kit,
  owner: string,
  ids: number[],
  settledBy: number | null,
): Promise<void> {
  const reply = await call(k, owner, patchBulk, '/transactions/bulk', {
    method: 'PATCH',
    body: { ids, patch: { settledBy } },
  })
  expect(reply.status).toBe(200)
}

/** The cell a row belongs to, as the rollup holds it: `[pinned, count]`, or nothing if the cell is missing. */
export function cellOf(
  k: Kit,
  id: number,
): Array<[number, number]> {
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
export async function emptySmallestMonth(
  k: Kit,
  owner: string,
): Promise<void> {
  const [smallest] = rows(
    k,
    'SELECT budget_month AS m FROM transactions WHERE owner = ? GROUP BY 1 ORDER BY COUNT(*), 1 LIMIT 1',
    owner,
  )
  if (!smallest) return
  const ids = idsOf(k, 'transactions', owner, `budget_month = '${String(smallest.m)}'`)
  const reply = await call(k, owner, deleteBulk, '/transactions/bulk', { method: 'DELETE', body: { ids } })
  expect(reply.status).toBe(200)
}

export const raw = (
  k: Kit,
  sql: string,
  ...params: Array<string | number | null>
) => k.sqlite.prepare(sql).run(...params)
