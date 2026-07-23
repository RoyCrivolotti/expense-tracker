import { useMemo } from 'react'
import type { ExpenseModel } from '../useExpenseData'
import type { CategoryActuals } from '../../engine'
import { computeCategoryActuals, formatCents, shortMonthLabel } from '../../engine'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
import styles from './analytics.module.css'

/** Colour an actual against its monthly budget (only when a budget is set). */
function cellClass(actual: number, budget: number): string | undefined {
  if (actual === 0) return styles.zero
  if (budget <= 0) return undefined
  const ratio = actual / budget
  if (ratio > 1) return styles.over
  if (ratio >= 0.8) return styles.warn
  return undefined
}

function buildRows(model: ExpenseModel): CategoryActuals[] {
  const { dataset } = model
  const order = new Map(dataset.categories.map((c) => [c.id, c.sortOrder]))
  return computeCategoryActuals(dataset.transactions, dataset.categories, { includeForecast: true })
    .filter((r) => r.monthlyBudgetCents > 0 || r.ytdActualCents !== 0)
    .sort((a, b) => (order.get(a.categoryId) ?? 0) - (order.get(b.categoryId) ?? 0))
}

function buildTotals(rows: CategoryActuals[], months: string[]) {
  const perMonth = new Map(months.map((m) => [m, 0]))
  let budget = 0
  let ytd = 0
  for (const r of rows) {
    budget += r.monthlyBudgetCents
    ytd += r.ytdActualCents
    for (const m of months) perMonth.set(m, (perMonth.get(m) ?? 0) + (r.byMonth.get(m) ?? 0))
  }
  return { perMonth, budget, ytd }
}

/**
 * The workbook's "Category Budget vs Actual" sheet: categories down, budget
 * months across, net actual per cell (coloured vs that category's budget), plus
 * a budget column, a YTD column, and a totals row. Wide — scrolls on mobile.
 */
export function MonthlySummaryGrid({ model }: { model: ExpenseModel }) {
  const format = useMoneyFormat()
  const { months } = model
  const rows = useMemo(() => buildRows(model), [model])
  const totals = useMemo(() => buildTotals(rows, months), [rows, months])
  const cell = (cents: number): string => (cents === 0 ? '—' : formatCents(cents, format, false))

  if (rows.length === 0) return null

  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Category</th>
            <th>Budget</th>
            {months.map((m) => (
              <th key={m}>{shortMonthLabel(m)}</th>
            ))}
            <th>YTD</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.categoryId}>
              <td>{r.name}</td>
              <td className={styles.muted}>{cell(r.monthlyBudgetCents)}</td>
              {months.map((m) => {
                const v = r.byMonth.get(m) ?? 0
                return (
                  <td key={m} className={cellClass(v, r.monthlyBudgetCents)}>
                    {cell(v)}
                  </td>
                )
              })}
              <td>{cell(r.ytdActualCents)}</td>
            </tr>
          ))}
          <tr className={styles.totalRow}>
            <td>Total</td>
            <td>{cell(totals.budget)}</td>
            {months.map((m) => (
              <td key={m}>{cell(totals.perMonth.get(m) ?? 0)}</td>
            ))}
            <td>{cell(totals.ytd)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
