import { formatCents } from '../../engine/money'
import { ChartTooltip } from './ChartTooltip'
import { ChartYAxis } from './ChartYAxis'
import { CHART_H, CHART_W, PAD, monthLabel, yAt } from './chartLayout'
import styles from './charts.module.css'

export interface BarRow {
  month: string
  income: number
  expenses: number
}

interface Props {
  rows: BarRow[]
  maxVal: number
  innerH: number
  barW: number
  active: number | null
  focusX: number
  xForIndex: (i: number) => number
  pointerHandlers: Record<string, (e: React.PointerEvent<SVGSVGElement>) => void>
}

export function MonthlyBarChartView({
  rows,
  maxVal,
  innerH,
  barW,
  active,
  focusX,
  xForIndex,
  pointerHandlers,
}: Props) {
  const focus = active != null ? rows[active] : null

  return (
    <div className={styles.chartWrap}>
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className={styles.svg}
        role="img"
        aria-label="Bar chart of monthly income and expenses"
        {...pointerHandlers}
      >
        <ChartYAxis maxVal={maxVal} innerH={innerH} />
        {rows.map((r, i) => {
          const x0 = xForIndex(i)
          const incH = (r.income / maxVal) * innerH
          const expH = (r.expenses / maxVal) * innerH
          const dim = active != null && active !== i
          return (
            <g key={r.month} className={dim ? styles.dimmed : undefined}>
              <rect x={x0 - barW - 1} y={yAt(r.income, maxVal, innerH)} width={barW} height={incH} className={styles.barIncome} />
              <rect x={x0 + 1} y={yAt(r.expenses, maxVal, innerH)} width={barW} height={expH} className={styles.barExpense} />
              <text x={x0} y={CHART_H - 8} textAnchor="middle" className={styles.axisLabel}>
                {monthLabel(r.month)}
              </text>
            </g>
          )
        })}
        {focus && (
          <line x1={focusX} x2={focusX} y1={PAD.top} y2={PAD.top + innerH} className={styles.crosshair} />
        )}
      </svg>
      {focus && (
        <ChartTooltip
          title={monthLabel(focus.month)}
          leftPct={(focusX / CHART_W) * 100}
          lines={[
            { label: 'Income', value: formatCents(focus.income), tone: 'income' },
            { label: 'Expenses', value: formatCents(focus.expenses), tone: 'expense' },
          ]}
        />
      )}
    </div>
  )
}
