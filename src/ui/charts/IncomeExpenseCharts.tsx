import { useMemo } from 'react'
import type { ExpenseModel } from '../useExpenseData'
import { computeMonthlyTotals } from '../../engine'
import { formatCents } from '../../engine/money'
import styles from './charts.module.css'

const CHART_W = 320
const CHART_H = 160
const PAD = { top: 12, right: 8, bottom: 28, left: 48 }

function lastMonths(months: string[], count: number): string[] {
  return months.slice(Math.max(0, months.length - count))
}

function monthLabel(ym: string): string {
  const [, m] = ym.split('-')
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return names[Number(m) - 1] ?? ym
}

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
}

/** Side-by-side bars for income vs expenses over recent budget months. */
export function MonthlyIncomeExpenseChart({ model }: Props) {
  const months = lastMonths(model.months, 6)
  const rows = useMemo(
    () => months.map((month) => ({ month, ...monthIncomeExpense(model, month) })),
    [model, months],
  )
  if (rows.length === 0) return null

  const maxVal = Math.max(1, ...rows.flatMap((r) => [r.income, r.expenses]))
  const innerW = CHART_W - PAD.left - PAD.right
  const innerH = CHART_H - PAD.top - PAD.bottom
  const groupW = innerW / rows.length
  const barW = Math.min(14, groupW / 3)

  return (
    <figure className={styles.figure}>
      <figcaption className={styles.caption}>Income vs expenses (recent months)</figcaption>
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className={styles.svg}
        role="img"
        aria-label="Bar chart of monthly income and expenses"
      >
        {rows.map((r, i) => {
          const x0 = PAD.left + i * groupW + groupW / 2
          const incH = (r.income / maxVal) * innerH
          const expH = (r.expenses / maxVal) * innerH
          return (
            <g key={r.month}>
              <rect
                x={x0 - barW - 1}
                y={PAD.top + innerH - incH}
                width={barW}
                height={incH}
                className={styles.barIncome}
              />
              <rect
                x={x0 + 1}
                y={PAD.top + innerH - expH}
                width={barW}
                height={expH}
                className={styles.barExpense}
              />
              <text x={x0} y={CHART_H - 6} textAnchor="middle" className={styles.axisLabel}>
                {monthLabel(r.month)}
              </text>
            </g>
          )
        })}
      </svg>
      <div className={styles.legend}>
        <span className={styles.legendIncome}>Income</span>
        <span className={styles.legendExpense}>Expenses</span>
      </div>
    </figure>
  )
}

/** Cumulative income and expenses from January through the selected budget month. */
export function YtdIncomeExpenseChart({ model, month }: Props & { month: string }) {
  const year = month.slice(0, 4)
  const months = model.months.filter((m) => m.startsWith(`${year}-`) && m <= month)
  const points = useMemo(() => cumulativeYtdPoints(model, months), [model, months])

  if (points.length === 0) return null

  const maxVal = Math.max(1, ...points.flatMap((p) => [p.cumIncome, p.cumExpense]))
  const innerW = CHART_W - PAD.left - PAD.right
  const innerH = CHART_H - PAD.top - PAD.bottom

  const coords = (idx: number, val: number) => ({
    x: PAD.left + (idx / Math.max(1, points.length - 1)) * innerW,
    y: PAD.top + innerH - (val / maxVal) * innerH,
  })

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
    <figure className={styles.figure}>
      <figcaption className={styles.caption}>
        YTD income vs expenses ({year}) · net {formatCents(gap)}
      </figcaption>
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className={styles.svg}
        role="img"
        aria-label="Cumulative year-to-date income and expenses"
      >
        <path d={line('cumIncome')} className={styles.lineIncome} fill="none" strokeWidth={2} />
        <path d={line('cumExpense')} className={styles.lineExpense} fill="none" strokeWidth={2} />
        {points.map((p, i) => {
          const { x } = coords(i, p.cumIncome)
          return (
            <text key={p.month} x={x} y={CHART_H - 6} textAnchor="middle" className={styles.axisLabel}>
              {monthLabel(p.month)}
            </text>
          )
        })}
      </svg>
      <div className={styles.legend}>
        <span className={styles.legendIncome}>Cumulative income</span>
        <span className={styles.legendExpense}>Cumulative expenses</span>
      </div>
    </figure>
  )
}
