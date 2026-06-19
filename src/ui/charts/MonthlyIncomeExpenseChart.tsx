import { useCallback, useMemo } from 'react'
import type { ExpenseModel } from '../useExpenseData'
import { computeMonthlyTotals } from '../../engine'
import { chartMax, innerSize, PAD } from './chartLayout'
import { MonthlyBarChartView } from './MonthlyBarChartView'
import { useChartFocus } from './useChartFocus'
import styles from './charts.module.css'

function lastMonths(months: string[], count: number): string[] {
  return months.slice(Math.max(0, months.length - count))
}

function monthIncomeExpense(model: ExpenseModel, month: string) {
  const t = computeMonthlyTotals(model.dataset.transactions).get(month)
  return { income: t?.incomeCents ?? 0, expenses: t?.expensesCents ?? 0 }
}

interface Props {
  model: ExpenseModel
}

/** Side-by-side bars for income vs expenses over recent budget months. */
export function MonthlyIncomeExpenseChart({ model }: Props) {
  const months = lastMonths(model.months, 6)
  const rows = useMemo(
    () => months.map((month) => ({ month, ...monthIncomeExpense(model, month) })),
    [model, months],
  )
  const { w: innerW, h: innerH } = innerSize()
  const groupW = innerW / Math.max(1, rows.length)
  const barW = Math.min(16, groupW / 3)
  const maxVal = chartMax(rows.flatMap((r) => [r.income, r.expenses]))
  const xForIndex = useCallback((i: number) => PAD.left + i * groupW + groupW / 2, [groupW])
  const { active, ...pointerHandlers } = useChartFocus(rows.length, xForIndex)

  if (rows.length === 0) return null

  return (
    <figure className={styles.figure}>
      <figcaption className={styles.caption}>Income vs expenses (recent months)</figcaption>
      <MonthlyBarChartView
        rows={rows}
        maxVal={maxVal}
        innerH={innerH}
        barW={barW}
        active={active}
        focusX={active != null ? xForIndex(active) : 0}
        xForIndex={xForIndex}
        pointerHandlers={pointerHandlers}
      />
      <div className={styles.legend}>
        <span className={styles.legendIncome}>Income</span>
        <span className={styles.legendExpense}>Expenses</span>
      </div>
    </figure>
  )
}
