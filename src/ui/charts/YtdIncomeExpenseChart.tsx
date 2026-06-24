import { useCallback, useMemo } from 'react'
import type { ExpenseModel } from '../useExpenseData'
import { computeMonthlyTotals } from '../../engine'
import { formatCents } from '../../engine/money'
import { chartMax, innerSize, PAD, yAt } from './chartLayout'
import { YtdLineChartView } from './YtdLineChartView'
import { useChartFocus } from './useChartFocus'
import styles from './charts.module.css'

function monthIncomeExpense(model: ExpenseModel, month: string) {
  const t = computeMonthlyTotals(model.dataset.transactions).get(month)
  return { income: t?.incomeCents ?? 0, expenses: t?.expensesCents ?? 0 }
}

function cumulativeYtdPoints(model: ExpenseModel, months: string[]) {
  let cumIncome = 0
  let cumExpense = 0
  return months.map((m) => {
    const t = monthIncomeExpense(model, m)
    cumIncome += t.income
    cumExpense += t.expenses
    return { month: m, cumIncome, cumExpense }
  })
}

interface Props {
  model: ExpenseModel
  month: string
}

/** Cumulative income and expenses from January through the selected budget month. */
export function YtdIncomeExpenseChart({ model, month }: Props) {
  const year = month.slice(0, 4)
  const months = model.months.filter((m) => m.startsWith(`${year}-`) && m <= month)
  const points = useMemo(() => cumulativeYtdPoints(model, months), [model, months])
  const { w: innerW, h: innerH } = innerSize()
  const maxVal = chartMax(points.flatMap((p) => [p.cumIncome, p.cumExpense]))
  const coords = useCallback(
    (idx: number, val: number) => ({
      x: PAD.left + (idx / Math.max(1, points.length - 1)) * innerW,
      y: yAt(val, maxVal, innerH),
    }),
    [innerW, innerH, maxVal, points.length],
  )
  const xForIndex = useCallback((i: number) => coords(i, 0).x, [coords])
  const { active, containerRef, ...pointerHandlers } = useChartFocus(points.length, xForIndex)

  if (points.length === 0) return null

  const line = (key: 'cumIncome' | 'cumExpense') =>
    points
      .map((p, i) => {
        const { x, y } = coords(i, p[key])
        return `${i === 0 ? 'M' : 'L'}${x},${y}`
      })
      .join(' ')

  const last = points[points.length - 1]
  const gap = last ? last.cumIncome - last.cumExpense : 0

  return (
    <figure ref={containerRef} className={styles.figure}>
      <figcaption className={styles.captionSplit}>
        <span className={styles.captionHeading}>YTD savings ({year})</span>
        <span className={styles.captionValue}>{formatCents(gap)}</span>
      </figcaption>
      <YtdLineChartView
        points={points}
        maxVal={maxVal}
        innerH={innerH}
        active={active}
        focusX={active != null ? coords(active, 0).x : 0}
        coords={coords}
        line={line}
        pointerHandlers={pointerHandlers}
      />
      <div className={styles.legend}>
        <span className={styles.legendIncome}>Cumulative income</span>
        <span className={styles.legendExpense}>Cumulative expenses</span>
      </div>
    </figure>
  )
}
