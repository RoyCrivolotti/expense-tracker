import { useMemo } from 'react'
import type { ExpenseModel } from '../useExpenseData'
import type { MonthlyTotals } from '../../engine'
import { computeMonthlyTotals } from '../../engine'
import { LedgerTable, type LedgerColumn } from './LedgerTable'
import { money, moneyAlways, sum } from './cells'
import styles from './analytics.module.css'

const signed = (cents: number): string | undefined =>
  cents > 0 ? styles.pos : cents < 0 ? styles.neg : undefined

const COLUMNS: LedgerColumn<MonthlyTotals>[] = [
  { label: 'Income', value: (r) => money(r.incomeCents), cls: () => styles.pos },
  { label: 'Expenses', value: (r) => money(r.expensesCents) },
  {
    label: 'Net saving',
    value: (r) => moneyAlways(r.netSavingCents),
    cls: (r) => signed(r.netSavingCents),
  },
  { label: 'Invested', value: (r) => money(r.investmentsCents) },
]

/** Per-month income / expenses / net saving / invested. */
export function MonthlyTotalsTable({ model }: { model: ExpenseModel }) {
  const rows = useMemo(
    () =>
      [...computeMonthlyTotals(model.dataset.transactions).values()].sort((a, b) =>
        a.month.localeCompare(b.month),
      ),
    [model.dataset],
  )
  if (rows.length === 0) return null
  const totals = [
    money(sum(rows, (r) => r.incomeCents)),
    money(sum(rows, (r) => r.expensesCents)),
    moneyAlways(sum(rows, (r) => r.netSavingCents)),
    money(sum(rows, (r) => r.investmentsCents)),
  ]
  return <LedgerTable rows={rows} columns={COLUMNS} totals={totals} />
}
