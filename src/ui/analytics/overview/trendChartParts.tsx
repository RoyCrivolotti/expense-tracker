import { useMemo, type RefObject } from 'react'
import { formatCents, type MoneyFormat } from '../../../engine'
import { ChartTooltip } from '../../charts/ChartTooltip'
import { CHART_H, PAD, monthLabel, yAt } from '../../charts/chartLayout'
import { UNPAID_FILL } from '../shared/ChartHatchDefs'
import type { TrendPoint } from './trendChartModel'
import chartStyles from '../../charts/charts.module.css'
import styles from './overview.module.css'

export function Bars({
  points,
  maxVal,
  innerH,
  barW,
  xForIndex,
  active,
  selectedMonth,
}: {
  points: TrendPoint[]
  maxVal: number
  innerH: number
  barW: number
  xForIndex: (i: number) => number
  active: number | null
  selectedMonth: string
}) {
  return (
    <>
      {points.map((p, i) => {
        const x = xForIndex(i) - barW / 2
        const paid = p.spendCents - p.unpaidCents
        const dim = active != null && active !== i
        return (
          <g key={p.month} className={dim ? chartStyles.dimmed : undefined}>
            <rect
              x={x}
              y={yAt(paid, maxVal, innerH)}
              width={barW}
              height={(paid / maxVal) * innerH}
              className={styles.trendSpend}
            />
            {p.unpaidCents > 0 && (
              <rect
                x={x}
                y={yAt(p.spendCents, maxVal, innerH)}
                width={barW}
                height={(p.unpaidCents / maxVal) * innerH}
                fill={UNPAID_FILL}
                className={styles.trendUnpaid}
              />
            )}
            <text
              x={xForIndex(i)}
              y={CHART_H - 8}
              textAnchor="middle"
              className={p.month === selectedMonth ? styles.trendMonthSelected : chartStyles.axisLabel}
            >
              {monthLabel(p.month)}
            </text>
          </g>
        )
      })}
    </>
  )
}

export function TrendCrosshair({ x, innerH }: { x: number; innerH: number }) {
  return <line x1={x} x2={x} y1={PAD.top} y2={PAD.top + innerH} className={chartStyles.crosshair} />
}

/** The income line, and the dot that stands for it when there is only one month. */
export function TrendIncome({
  points,
  xForIndex,
  maxVal,
  innerH,
}: {
  points: TrendPoint[]
  xForIndex: (i: number) => number
  maxVal: number
  innerH: number
}) {
  const incomeLine = useMemo(
    () => points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xForIndex(i)},${yAt(p.incomeCents, maxVal, innerH)}`).join(' '),
    [points, xForIndex, maxVal, innerH],
  )
  return (
    <>
      <path d={incomeLine} className={styles.trendIncome} />
      {/* One point makes a path of a single "M", which draws nothing. */}
      {points.length === 1 && (
        <circle
          cx={xForIndex(0)}
          cy={yAt(points[0]!.incomeCents, maxVal, innerH)}
          r={4}
          className={styles.trendIncomeDot}
        />
      )}
    </>
  )
}

export function TrendTooltip({
  focus,
  anchor,
  wrapRef,
  format,
}: {
  focus: TrendPoint
  anchor: React.ComponentProps<typeof ChartTooltip>['anchor']
  wrapRef: RefObject<HTMLDivElement | null>
  format: MoneyFormat
}) {
  return (
    <ChartTooltip
      anchor={anchor}
      chart={wrapRef}
      title={monthLabel(focus.month)}
      lines={[
        { label: 'Income', value: formatCents(focus.incomeCents, format), tone: 'income' },
        { label: 'Spent', value: formatCents(focus.spendCents, format), tone: 'expense' },
        ...(focus.unpaidCents > 0 ? [{ label: 'Of it unpaid', value: formatCents(focus.unpaidCents, format) }] : []),
      ]}
    />
  )
}

export function TrendLegend({ count }: { count: number }) {
  return (
    <div className={chartStyles.legend}>
      <span className={chartStyles.legendExpense}>Spent</span>
      <span className={chartStyles.legendIncome}>Income</span>
      <span className={styles.legendAvg}>{count}-month average spend</span>
      <span className={styles.legendUnpaid}>Hatched: not paid yet</span>
    </div>
  )
}
