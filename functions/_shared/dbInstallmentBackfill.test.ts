import { describe, expect, it } from 'vitest'
import { backfillInstallments } from './dbInstallmentBackfill'
import type { Env } from './env'
import type { InstallmentPlanRow, TxnRow } from './rows'
import { defaultBudgetMonth, shiftBudgetMonth } from '../domain/engine/dates'

function currentBudgetMonth(): string {
  return new Date().toISOString().slice(0, 7)
}

function planRow(overrides: Partial<InstallmentPlanRow> = {}): InstallmentPlanRow {
  return {
    id: 1,
    description: 'Sofa',
    total_count: 3,
    amount_cents: 15000,
    account_id: 2,
    category_id: 1,
    type: 'expense',
    anchor_budget_month: shiftBudgetMonth(currentBudgetMonth(), -2),
    start_installment_index: 1,
    due_day_of_month: null,
    active: 1,
    ...overrides,
  }
}

function txnRow(overrides: Partial<TxnRow> = {}): TxnRow {
  return {
    id: 900,
    date: '2026-01-10',
    budget_month: '2026-01',
    description: 'Sofa',
    account_id: 2,
    category_id: 1,
    type: 'expense',
    amount_cents: 15000,
    cancelled: 0,
    notes: null,
    created_at: '2026-01-10T00:00:00Z',
    plan_id: 1,
    installment_index: 1,
    flag_id: null,
    settled_by: null,
    report_count: null,
    report_covered_cents: null,
    ...overrides,
  }
}

interface MockState {
  planRows: InstallmentPlanRow[]
  txnRows: TxnRow[]
  insertedRows: TxnRow[]
  prepared: string[]
  nextId: number
  /** Simulate ON CONFLICT DO NOTHING firing for this exact (planId, installmentIndex). */
  conflictOn?: { planId: number; installmentIndex: number }
  /** Simulate the insert throwing for this planId — anything, any installment. */
  throwForPlanId?: number
  /** settings.budget_rollover_day for the owner; omitted simulates no settings row (falls back to 1). */
  rolloverDay?: number
}

function envForBackfill(state: MockState): Env {
  return {
    DB: {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => {
          state.prepared.push(sql)
          if (sql.includes('JOIN accounts')) {
            return { all: async () => ({ results: state.planRows }) }
          }
          if (sql.includes('plan_id IN')) {
            return { all: async () => ({ results: state.txnRows }) }
          }
          if (sql.startsWith('INSERT INTO transactions')) {
            const [
              owner,
              date,
              budgetMonth,
              description,
              accountId,
              categoryId,
              type,
              amountCents,
              planId,
              installmentIndex,
            ] = args as [string, string, string, string, number, number, TxnRow['type'], number, number, number]
            if (state.throwForPlanId === planId) throw new Error('simulated insert failure')
            if (
              state.conflictOn &&
              state.conflictOn.planId === planId &&
              state.conflictOn.installmentIndex === installmentIndex
            ) {
              return { first: async () => null }
            }
            state.nextId += 1
            const row = txnRow({
              id: state.nextId,
              date,
              budget_month: budgetMonth,
              description,
              account_id: accountId,
              category_id: categoryId,
              type,
              amount_cents: amountCents,
              plan_id: planId,
              installment_index: installmentIndex,
            })
            void owner
            state.insertedRows.push(row)
            return { first: async () => row }
          }
          if (sql.includes('total_count AS t')) {
            const [planId] = args as [number, string]
            const plan = state.planRows.find((p) => p.id === planId)
            return { first: async () => (plan ? { t: plan.total_count, a: plan.active } : null) }
          }
          if (sql.includes('MAX(installment_index)')) {
            const [, planId] = args as [string, number]
            const indices = [...state.txnRows, ...state.insertedRows]
              .filter((t) => t.plan_id === planId && t.cancelled === 0)
              .map((t) => t.installment_index as number)
            return { first: async () => ({ m: indices.length ? Math.max(...indices) : null }) }
          }
          if (sql.startsWith('UPDATE installment_plans')) {
            return { run: async () => ({ meta: { changes: 1 } }) }
          }
          if (sql.includes('budget_rollover_day')) {
            return {
              first: async () =>
                state.rolloverDay != null ? { budget_rollover_day: state.rolloverDay } : null,
            }
          }
          return { first: async () => null, all: async () => ({ results: [] }) }
        },
      }),
    },
  } as unknown as Env
}

describe('backfillInstallments', () => {
  it('does nothing when no plan is eligible', async () => {
    const state: MockState = { planRows: [], txnRows: [], insertedRows: [], prepared: [], nextId: 1000 }
    await backfillInstallments(envForBackfill(state), 'a@b.com')
    expect(state.insertedRows).toHaveLength(0)
    expect(state.prepared.some((sql) => sql.includes('plan_id IN'))).toBe(false)
  })

  it('creates the final missing installment and completes the plan', async () => {
    const plan = planRow({ id: 1, total_count: 3, anchor_budget_month: shiftBudgetMonth(currentBudgetMonth(), -2) })
    const existing = [
      txnRow({ id: 1, plan_id: 1, installment_index: 1 }),
      txnRow({ id: 2, plan_id: 1, installment_index: 2 }),
    ]
    const state: MockState = {
      planRows: [plan],
      txnRows: existing,
      insertedRows: [],
      prepared: [],
      nextId: 1000,
    }
    await backfillInstallments(envForBackfill(state), 'a@b.com')
    expect(state.insertedRows).toHaveLength(1)
    expect(state.insertedRows[0]!.installment_index).toBe(3)
    expect(state.prepared.some((sql) => sql.startsWith('UPDATE installment_plans'))).toBe(true)
  })

  it('creates every missing month in one pass, oldest first', async () => {
    const plan = planRow({ id: 1, total_count: 4, anchor_budget_month: shiftBudgetMonth(currentBudgetMonth(), -12) })
    const state: MockState = { planRows: [plan], txnRows: [], insertedRows: [], prepared: [], nextId: 1000 }
    await backfillInstallments(envForBackfill(state), 'a@b.com')
    expect(state.insertedRows).toHaveLength(4)
    expect(state.insertedRows.map((r) => r.installment_index)).toEqual([1, 2, 3, 4])
    expect(state.prepared.some((sql) => sql.startsWith('UPDATE installment_plans'))).toBe(true)
  })

  it('creates nothing for a plan not due yet', async () => {
    const plan = planRow({ id: 1, total_count: 3, anchor_budget_month: shiftBudgetMonth(currentBudgetMonth(), 24) })
    const state: MockState = { planRows: [plan], txnRows: [], insertedRows: [], prepared: [], nextId: 1000 }
    await backfillInstallments(envForBackfill(state), 'a@b.com')
    expect(state.insertedRows).toHaveLength(0)
    expect(state.prepared.some((sql) => sql.startsWith('UPDATE installment_plans'))).toBe(false)
  })

  it('stops cleanly when a concurrent request already backfilled the index', async () => {
    const plan = planRow({ id: 1, total_count: 3, anchor_budget_month: shiftBudgetMonth(currentBudgetMonth(), -6) })
    const state: MockState = {
      planRows: [plan],
      txnRows: [],
      insertedRows: [],
      prepared: [],
      nextId: 1000,
      conflictOn: { planId: 1, installmentIndex: 1 },
    }
    await expect(backfillInstallments(envForBackfill(state), 'a@b.com')).resolves.toBeUndefined()
    expect(state.insertedRows).toHaveLength(0)
  })

  it('uses the owner\'s rollover-day budget month, not the raw calendar month, to decide what is due', async () => {
    // rolloverDay=2 shifts every day but the 1st of the month into next month's
    // budget — so whenever today isn't the 1st, this constructs exactly the case
    // the fix targets: a month the rollover-aware budget calendar has already
    // reached but the raw calendar hasn't. Anchoring the plan there means the old,
    // calendar-only cutoff would wrongly leave this installment un-created.
    const rolloverDay = 2
    const rolloverBudgetMonth = defaultBudgetMonth(new Date().toISOString().slice(0, 10), rolloverDay)
    const plan = planRow({ id: 1, total_count: 3, anchor_budget_month: rolloverBudgetMonth })
    const state: MockState = {
      planRows: [plan],
      txnRows: [],
      insertedRows: [],
      prepared: [],
      nextId: 1000,
      rolloverDay,
    }
    await backfillInstallments(envForBackfill(state), 'a@b.com')
    expect(state.insertedRows).toHaveLength(1)
    expect(state.insertedRows[0]!.budget_month).toBe(rolloverBudgetMonth)
  })

  it('falls back to the raw calendar month when the owner has no settings row', async () => {
    const plan = planRow({ id: 1, total_count: 3, anchor_budget_month: shiftBudgetMonth(currentBudgetMonth(), 1) })
    const state: MockState = { planRows: [plan], txnRows: [], insertedRows: [], prepared: [], nextId: 1000 }
    await backfillInstallments(envForBackfill(state), 'a@b.com')
    expect(state.insertedRows).toHaveLength(0)
  })

  describe('the date given to a created installment', () => {
    const cur = currentBudgetMonth()
    const budgetMonthsAgo = (n: number) => shiftBudgetMonth(cur, -n)
    // Installments 1..3 fall due two months ago, last month and this month.
    const plan = () => planRow({ id: 1, total_count: 4, anchor_budget_month: budgetMonthsAgo(2), due_day_of_month: 6 })
    const first = (date: string) => txnRow({ id: 1, plan_id: 1, installment_index: 1, date, budget_month: budgetMonthsAgo(2) })
    const run = async (planRows: InstallmentPlanRow[], txnRows: TxnRow[]) => {
      const state: MockState = { planRows, txnRows, insertedRows: [], prepared: [], nextId: 1000 }
      await backfillInstallments(envForBackfill(state), 'a@b.com')
      return state.insertedRows
    }

    it('trails its budget month by the same gap as the first installment', async () => {
      const created = await run([plan()], [first(`${budgetMonthsAgo(3)}-06`)])
      expect(created.map((r) => r.budget_month)).toEqual([budgetMonthsAgo(1), cur])
      expect(created.map((r) => r.date)).toEqual([`${budgetMonthsAgo(2)}-06`, `${budgetMonthsAgo(1)}-06`])
    })

    it('stays in the budget month when the first installment was dated in it', async () => {
      const created = await run([plan()], [first(`${budgetMonthsAgo(2)}-06`)])
      expect(created.map((r) => r.date)).toEqual([`${budgetMonthsAgo(1)}-06`, `${cur}-06`])
    })

    it('stays in the budget month when nothing has been recorded to read a gap from', async () => {
      const created = await run([plan()], [])
      expect(created.map((r) => r.date)).toEqual([
        `${budgetMonthsAgo(2)}-06`,
        `${budgetMonthsAgo(1)}-06`,
        `${cur}-06`,
      ])
    })

    it('keeps the first of the budget month for a plan with no due day', async () => {
      const created = await run(
        [planRow({ id: 1, total_count: 4, anchor_budget_month: budgetMonthsAgo(2) })],
        [first(`${budgetMonthsAgo(3)}-06`)],
      )
      expect(created.map((r) => r.date)).toEqual([`${budgetMonthsAgo(1)}-01`, `${cur}-01`])
    })

    it('is not thrown off by a later installment dated in its own budget month', async () => {
      const later = txnRow({
        id: 2,
        plan_id: 1,
        installment_index: 2,
        date: `${budgetMonthsAgo(1)}-06`,
        budget_month: budgetMonthsAgo(1),
      })
      const created = await run([plan()], [first(`${budgetMonthsAgo(3)}-06`), later])
      expect(created.map((r) => r.date)).toEqual([`${budgetMonthsAgo(1)}-06`])
    })
  })

  it('isolates a failure in one plan from the rest', async () => {
    const failing = planRow({ id: 1, total_count: 3, anchor_budget_month: shiftBudgetMonth(currentBudgetMonth(), -2) })
    const healthy = planRow({ id: 2, total_count: 2, anchor_budget_month: shiftBudgetMonth(currentBudgetMonth(), -2) })
    const state: MockState = {
      planRows: [failing, healthy],
      txnRows: [],
      insertedRows: [],
      prepared: [],
      nextId: 1000,
      throwForPlanId: 1,
    }
    await expect(backfillInstallments(envForBackfill(state), 'a@b.com')).resolves.toBeUndefined()
    expect(state.insertedRows.every((r) => r.plan_id === 2)).toBe(true)
    expect(state.insertedRows.length).toBeGreaterThan(0)
  })
})
