import { useMemo } from 'react'
import type { ExpenseModel } from '../useExpenseData'
import type { MonthOverview } from '../../engine'
import { computeYearlyOverview } from '../../engine'
import { LedgerTable, type LedgerColumn } from './LedgerTable'
import { money, moneyAlways, sum } from './cells'
import styles from './analytics.module.css'

const COLUMNS: LedgerColumn<MonthOverview>[] = [
  { label: 'Income', value: (r) => money(r.incomeCents), cls: () => styles.pos },
  { label: 'Actual', value: (r) => money(r.actualExpensesCents) },
  { label: 'Forecast', value: (r) => money(r.forecastExpensesCents), cls: () => styles.muted },
  { label: 'Invested', value: (r) => money(r.investmentsCents) },
  {
    label: 'Net saving',
    value: (r) => moneyAlways(r.netSavingCents),
    cls: (r) => (r.netSavingCents < 0 ? styles.neg : styles.pos),
  },
  { label: 'Expected cash', value: (r) => moneyAlways(r.expectedCashCents) },
  { label: 'Investments', value: (r) => moneyAlways(r.investmentBalanceCents) },
  { label: 'Net worth', value: (r) => moneyAlways(r.netWorthCents) },
]

/** Per-month flows plus the cumulative cash / investment / net-worth trajectory. */
export function YearlyOverviewTable({ model }: { model: ExpenseModel }) {
  const rows = useMemo(
    () => computeYearlyOverview(model.dataset.transactions, model.dataset.settings),
    [model.dataset],
  )
  if (rows.length === 0) return null
  const totals = [
    money(sum(rows, (r) => r.incomeCents)),
    money(sum(rows, (r) => r.actualExpensesCents)),
    money(sum(rows, (r) => r.forecastExpensesCents)),
    money(sum(rows, (r) => r.investmentsCents)),
    moneyAlways(sum(rows, (r) => r.netSavingCents)),
    '',
    '',
    '',
  ]
  return <LedgerTable rows={rows} columns={COLUMNS} totals={totals} />
}
