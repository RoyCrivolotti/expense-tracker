import { useCallback, useMemo, useRef } from 'react'
import type { ExpenseModel } from '../useExpenseData'
import type { AnalyticsBasis } from '../../engine'
import { basisOptions, computeMonthlyTotals } from '../../engine'
import { formatCents } from '../../engine/money'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
import { chartAxis, innerSize, PAD, yAt } from './chartLayout'
import { YtdLineChartView } from './YtdLineChartView'
import { useChartFocus } from './useChartFocus'
import styles from './charts.module.css'

function cumulativeYtdPoints(model: ExpenseModel, months: string[], basis: AnalyticsBasis) {
  const totals = computeMonthlyTotals(model.dataset.transactions, basisOptions(basis))
  let cumIncome = 0
  let cumExpense = 0
  return months.map((m) => {
    const t = totals.get(m)
    cumIncome += t?.incomeCents ?? 0
    cumExpense += t?.expensesCents ?? 0
    return { month: m, cumIncome, cumExpense }
  })
}

interface Props {
  model: ExpenseModel
  month: string
  basis?: AnalyticsBasis
}

/**
 * Cumulative income and expenses from January through the selected budget month.
 * Defaults to the committed basis — unpaid card charges count.
 */
export function YtdIncomeExpenseChart({ model, month, basis = 'committed' }: Props) {
  const format = useMoneyFormat()
  const year = month.slice(0, 4)
  const months = model.months.filter((m) => m.startsWith(`${year}-`) && m <= month)
  const points = useMemo(() => cumulativeYtdPoints(model, months, basis), [model, months, basis])
  const { w: innerW, h: innerH } = innerSize()
  const { max: maxVal, ticks } = chartAxis(points.flatMap((p) => [p.cumIncome, p.cumExpense]))
  const coords = useCallback(
    (idx: number, val: number) => ({
      x: PAD.left + (idx / Math.max(1, points.length - 1)) * innerW,
      y: yAt(val, maxVal, innerH),
    }),
    [innerW, innerH, maxVal, points.length],
  )
  const xForIndex = useCallback((i: number) => coords(i, 0).x, [coords])
  const containerRef = useRef<HTMLElement>(null)
  const { active, ...pointerHandlers } = useChartFocus(points.length, xForIndex, containerRef)

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
        <span className={styles.captionValue}>{formatCents(gap, format)}</span>
      </figcaption>
      <YtdLineChartView
        points={points}
        maxVal={maxVal}
        ticks={ticks}
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
