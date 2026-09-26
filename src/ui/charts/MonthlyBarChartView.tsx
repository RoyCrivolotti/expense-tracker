import type { ChartFocusHandlers } from './useChartFocus'
import { useRef } from 'react'
import { formatCents } from '../../engine/money'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
import { ChartTooltip } from './ChartTooltip'
import { ChartYAxis } from './ChartYAxis'
import { CHART_H, CHART_W, PAD, monthLabel, yAt } from './chartLayout'
import { useSvgAnchor } from './useSvgAnchor'
import { useTooltipSide } from './useTooltipSide'
import styles from './charts.module.css'

export interface BarRow {
  month: string
  income: number
  expenses: number
}

interface Props {
  rows: BarRow[]
  maxVal: number
  ticks: number[]
  innerH: number
  barW: number
  active: number | null
  focusX: number
  xForIndex: (i: number) => number
  pointerHandlers: ChartFocusHandlers
}

export function MonthlyBarChartView({
  rows,
  maxVal,
  ticks,
  innerH,
  barW,
  active,
  focusX,
  xForIndex,
  pointerHandlers,
}: Props) {
  const format = useMoneyFormat()
  const svgRef = useRef<SVGSVGElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const focus = active != null ? rows[active] : null
  const { side } = useTooltipSide(focus != null, wrapRef)
  const anchor = useSvgAnchor(svgRef, focus ? focusX : null, focus ? PAD.top : null)

  return (
    <div ref={wrapRef} className={styles.chartWrap}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className={styles.svg}
        tabIndex={0}
        role="img"
        aria-label="Bar chart of monthly income and expenses"
        {...pointerHandlers}
      >
        <ChartYAxis maxVal={maxVal} ticks={ticks} innerH={innerH} />
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
          anchor={anchor}
          side={side}
          title={monthLabel(focus.month)}
          lines={[
            { label: 'Income', value: formatCents(focus.income, format), tone: 'income' },
            { label: 'Expenses', value: formatCents(focus.expenses, format), tone: 'expense' },
          ]}
        />
      )}
    </div>
  )
}
