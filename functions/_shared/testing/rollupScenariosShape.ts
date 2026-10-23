/**
 * The rest of the named hazards (rollupScenarios.ts has the ones about pinning): months that empty, cancelled
 * rows, a category deleted with its rows moved, an owner purged and restored, the instalment backfill that
 * inserts on a GET, a fill that touches no cell column, and the counts the API sends back from statements that
 * fire the triggers.
 */
import { expect } from 'vitest'
import { onRequestDelete as deleteFlag } from '../../api/expenses/flags/[id]'
import { onRequestDelete as deleteCategory } from '../../api/expenses/categories/[id]'
import { onRequestDelete as deleteOne } from '../../api/expenses/transactions/[id]'
import { onRequestDelete as deleteBulk } from '../../api/expenses/transactions/bulk'
import { OTHER, OWNER } from './expenseWorld'
import { assertRollup, call, countRollupWrites, idsOf, newCategory, rows, type Kit } from './rollupKit'
import { newPlan, purgeAndRestore, refillNorm, readDataset } from './rollupLinkedSteps'
import { cellOf, make, settleRows, type Scenario } from './rollupScenarios'
import { edit } from './rollupSteps'

const months = (k: Kit, owner: string) =>
  rows(k, 'SELECT budget_month AS m, n FROM ledger_months WHERE owner = ? ORDER BY 1', owner).map((r) => [String(r.m), Number(r.n)])

const monthLosesItsLastRow: Scenario = {
  name: 'a month that loses its last row disappears',
  run: async (k) => {
    const early = await make(k, OWNER, { budgetMonth: '2026-05', date: '2026-05-04' })
    const late = await make(k, OWNER)
    expect(months(k, OWNER)).toEqual([['2026-05', 1], ['2026-09', 1]])
    await edit(k, OWNER, early, { budgetMonth: '2026-09', date: '2026-09-04' })
    await assertRollup(k, 'moved out of its month')
    expect(months(k, OWNER)).toEqual([['2026-09', 2]])
    await call(k, OWNER, deleteOne, `/transactions/${late}`, { method: 'DELETE', params: { id: String(late) } })
    await call(k, OWNER, deleteOne, `/transactions/${early}`, { method: 'DELETE', params: { id: String(early) } })
    await assertRollup(k, 'deleted the last rows')
    expect(months(k, OWNER)).toEqual([])
    expect(rows(k, 'SELECT COUNT(*) AS c FROM ledger_cells WHERE owner = ?', OWNER)[0]!.c).toBe(0)
  },
}

const cancelledRow: Scenario = {
  name: 'a cancelled row is its own cell, and counts in its month',
  run: async (k) => {
    const live = await make(k, OWNER)
    const gone = await make(k, OWNER, { cancelled: true })
    await assertRollup(k, 'created')
    expect(months(k, OWNER)).toEqual([['2026-09', 2]])
    expect(cellOf(k, gone)).toEqual([[0, 1]])
    await edit(k, OWNER, gone, { cancelled: false })
    await assertRollup(k, 'un-cancelled')
    expect(cellOf(k, live)).toEqual([[0, 2]])
    await edit(k, OWNER, live, { cancelled: true })
    await assertRollup(k, 'cancelled')
  },
}

const categoryDeletedWithItsRows: Scenario = {
  name: 'a category deleted with its rows moved to another',
  run: async (k) => {
    const [from, to] = idsOf(k, 'categories', OWNER) as [number, number]
    const ids = [await make(k, OWNER, { categoryId: from }), await make(k, OWNER, { categoryId: from, amountCents: 700 }), await make(k, OWNER, { categoryId: to })]
    const reply = await call(k, OWNER, deleteCategory, `/categories/${from}`, { method: 'DELETE', params: { id: String(from) }, body: { reassignToId: to } })
    expect(reply.status).toBe(200)
    await assertRollup(k, 'category deleted')
    expect(cellOf(k, ids[0]!)).toEqual([[0, 3]])
    expect(rows(k, 'SELECT COUNT(*) AS c FROM ledger_cells WHERE category_id = ?', from)[0]!.c).toBe(0)
    await newCategory(k, OWNER)
  },
}

const purgeThenRestore: Scenario = {
  name: 'an owner purged and restored from a backup',
  run: async (k) => {
    const mine = await make(k, OWNER)
    await make(k, OTHER)
    await make(k, OTHER, { type: 'investment', amountCents: -5000 })
    await make(k, OTHER, { flagId: idsOf(k, 'flags', OTHER)[0], cancelled: true })
    const covered = await make(k, OTHER, { amountCents: 2500 })
    await settleRows(k, OTHER, [covered], await make(k, OTHER, { type: 'refund', amountCents: 2500 }))
    await newPlan(k, OTHER)
    const snapshot = (owner: string) => JSON.stringify(rows(k, 'SELECT * FROM ledger_cells WHERE owner = ? ORDER BY 1, 2, 3, 4, 5, 6, 7, 8', owner))
    const [before, ownersBefore] = [snapshot(OTHER), snapshot(OWNER)]
    await purgeAndRestore(k, OTHER)
    await assertRollup(k, 'purged and restored')
    expect(snapshot(OTHER)).toBe(before)
    expect(snapshot(OWNER)).toBe(ownersBefore)
    expect(cellOf(k, mine)).toEqual([[0, 1]])
  },
}

const backfillOnGet: Scenario = {
  name: 'rows the backfill inserts on a GET, and a second GET that inserts none',
  run: async (k) => {
    const writes = countRollupWrites(k.sqlite)
    await newPlan(k, OWNER)
    await assertRollup(k, 'backfilled')
    const planRows = idsOf(k, 'transactions', OWNER, 'plan_id IS NOT NULL')
    expect(planRows.length).toBeGreaterThan(2)
    const after = writes()
    await readDataset(k, OWNER)
    await assertRollup(k, 'read again')
    expect(writes(), 'ON CONFLICT DO NOTHING fires no trigger').toBe(after)
  },
}

const fillTouchesNoCell: Scenario = {
  name: 'the description_norm fill writes no rollup row',
  run: async (k) => {
    await make(k, OWNER)
    await make(k, OWNER, { description: 'Café' })
    const writes = countRollupWrites(k.sqlite)
    await refillNorm(k, OWNER)
    await assertRollup(k, 'refilled')
    expect(writes()).toBe(0)
  },
}

const countsTheApiSends: Scenario = {
  name: 'the counts the API sends back are the rows changed, not the rows the triggers wrote',
  run: async (k) => {
    const flag = idsOf(k, 'flags', OWNER)[0]!
    const flagged = [await make(k, OWNER, { flagId: flag }), await make(k, OWNER, { flagId: flag })]
    const dropped = await call(k, OWNER, deleteFlag, `/flags/${flag}`, { method: 'DELETE', params: { id: String(flag) } })
    expect(dropped.body, 'rows that left the pinned cells').toEqual({ unflagged: 2 })
    await assertRollup(k, 'flag deleted')
    const ids = [...flagged, await make(k, OWNER, { type: 'investment' })]
    const deleted = await call(k, OWNER, deleteBulk, '/transactions/bulk', { method: 'DELETE', body: { ids } })
    expect(deleted.body).toEqual({ deleted: 3, requested: 3 })
    await assertRollup(k, 'bulk deleted')
  },
}

export const shapeScenarios: Scenario[] = [
  monthLosesItsLastRow, cancelledRow, categoryDeletedWithItsRows, purgeThenRestore, backfillOnGet, fillTouchesNoCell, countsTheApiSends,
]
