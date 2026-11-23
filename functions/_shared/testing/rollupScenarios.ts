/**
 * Named hazards for the rollup, each taken by hand and checked against the oracle after every write. The
 * walk (rollupWalk.ts) finds combinations; these are the cases that must never go unvisited, so a weakened
 * trigger cannot survive on luck. This file is about what pins a row; rollupScenariosShape.ts about the rest.
 */
import { expect } from 'vitest'
import { onRequestDelete as deleteOne } from '../../api/expenses/transactions/[id]'
import { OTHER, OWNER } from './expenseWorld'
import { CUBE_FROM_CELLS_SQL } from './rollupOracle'
import { assertRollup, call, countRollupWrites, idsOf, rows } from './rollupKit'
import { newPlan } from './rollupLinkedSteps'
import { cellOf, make, raw, settleRows, type Scenario } from './rollupScenarioKit'
import { edit, formOf } from './rollupSteps'

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
    expect(
      rows(k, CUBE_FROM_CELLS_SQL, OWNER, '2026-09', '2026-09').map((r) => r.n),
      'the unsettled expense and the payment, now both unpinned',
    ).toEqual([1, 1])
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
      expect(
        cellOf(k, id).map(([p]) => p),
        name,
      ).toEqual([pinned])
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
    expect(
      await cost({ ...formOf(k, id), notes: 'a note', description: 'Renamed', date: '2026-09-20' }),
      'columns that are not in a cell',
    ).toBe(0)
    expect(await cost({ ...formOf(k, id), amountCents: 2500 }), 'amount only').toBe(1)
    expect(await cost({ flagId: flags[0]! }), 'unpinned to pinned').toBeGreaterThan(1)
    expect(await cost({ flagId: flags[1]! }), 'another flag, still pinned').toBe(0)
    expect(await cost({ ...formOf(k, id), type: 'investment' }), 'another type').toBeGreaterThan(1)
    expect(await cost({ ...formOf(k, id), amountCents: -2500 }), 'the sign of the amount alone').toBeGreaterThan(1)
    expect(
      await cost({ ...formOf(k, id), budgetMonth: '2026-08', date: '2026-08-10' }),
      'another month',
    ).toBeGreaterThan(1)
  },
}

const bothOwnersAreIndependent: Scenario = {
  name: 'one owner’s writes leave the other’s cells alone',
  run: async (k) => {
    const mine = await make(k, OWNER)
    const theirs = await make(k, OTHER)
    const snapshot = () =>
      JSON.stringify(rows(k, 'SELECT * FROM ledger_cells WHERE owner = ? ORDER BY 1, 2, 3, 4, 5, 6, 7, 8', OTHER))
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
      [
        'settled',
        async () => {
          const id = await make(k, OWNER)
          await settleRows(k, OWNER, [id], await make(k, OWNER, { type: 'refund' }))
          return id
        },
      ],
      [
        'covered count',
        async () => {
          const id = await make(k, OWNER, { type: 'refund' })
          raw(k, 'UPDATE transactions SET report_count = 2 WHERE id = ?', id)
          return id
        },
      ],
    ]
    for (const [reason, prepare] of reasons) {
      const id = await prepare()
      expect(
        cellOf(k, id).map(([p]) => p),
        reason,
      ).toEqual([1])
      for (const body of [{ amountCents: 4321 }, { cancelled: true }, { amountCents: 9876 }]) {
        expect(await edit(k, OWNER, id, body)).toBe(200)
        await assertRollup(k, `${reason}: ${JSON.stringify(body)}`)
      }
    }
  },
}

export const pinningScenarios: Scenario[] = [
  amountOfPinnedRow,
  paymentPinnedOnlyByPointer,
  rowMovesBetweenPinnedAndUnpinned,
  nullReportCount,
  editFormResendsValues,
  bothOwnersAreIndependent,
]
