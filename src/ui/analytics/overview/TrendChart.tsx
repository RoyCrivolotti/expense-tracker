import { useCallback, useMemo, useRef } from 'react'
import { formatCents } from '../../../engine'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import { ChartTooltip } from '../../charts/ChartTooltip'
import { ChartYAxis } from '../../charts/ChartYAxis'
import { CHART_H, CHART_W, PAD, innerSize, monthLabel, yAt } from '../../charts/chartLayout'
import { nearestIndex, useChartFocus } from '../../charts/useChartFocus'
import { useSvgAnchor } from '../../charts/useSvgAnchor'
import { ChartHatchDefs, UNPAID_FILL } from '../shared/ChartHatchDefs'
import type { TrendModel, TrendPoint } from './trendChartModel'
import chartStyles from '../../charts/charts.module.css'
import styles from './overview.module.css'

interface Props {
  model: TrendModel
  selectedMonth: string
  onSelectMonth: (month: string) => void
}

function Bars({
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
            <rect x={x} y={yAt(paid, maxVal, innerH)} width={barW} height={(paid / maxVal) * innerH} className={styles.trendSpend} />
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

/**
 * Spending bars (hatched where a card statement is still unpaid), the income
 * line, and the 12-month average spend. Clicking a month moves the page there.
 */
export function TrendChart({ model, selectedMonth, onSelectMonth }: Props) {
  const format = useMoneyFormat()
  const { points, avgSpendCents, maxVal, ticks } = model
  const { w: innerW, h: innerH } = innerSize()
  const groupW = innerW / Math.max(1, points.length)
  const barW = Math.min(18, groupW * 0.6)
  const xForIndex = useCallback((i: number) => PAD.left + i * groupW + groupW / 2, [groupW])
  const containerRef = useRef<HTMLElement>(null)
  const {
    active,
    onKeyDown: focusKeyDown,
    ...pointerHandlers
  } = useChartFocus(points.length, xForIndex, containerRef)
  const svgRef = useRef<SVGSVGElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const focus = active != null ? points[active] : null
  const anchor = useSvgAnchor(svgRef, focus ? xForIndex(active!) : null, focus ? PAD.top : null)

  const incomeLine = useMemo(
    () =>
      points
        .map((p, i) => `${i === 0 ? 'M' : 'L'}${xForIndex(i)},${yAt(p.incomeCents, maxVal, innerH)}`)
        .join(' '),
    [points, xForIndex, maxVal, innerH],
  )

  // The focus hook captures the pointer on pointerdown, which retargets the click
  // to the svg itself: a per-bar hit rect would never see it. So the svg owns the
  // click and maps it back to the nearest month, the same way hover focus does.
  const onClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget
    const ctm = svg.getScreenCTM()
    if (!ctm) return
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = 0
    const { x } = pt.matrixTransform(ctm.inverse())
    const i = nearestIndex(x, points.length, xForIndex)
    if (i !== null) onSelectMonth(points[i]!.month)
  }

  const onKeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'Enter' && active != null) {
      e.preventDefault()
      onSelectMonth(points[active]!.month)
      return
    }
    focusKeyDown(e)
  }

  if (points.length === 0) return null

  return (
    <figure ref={containerRef} className={chartStyles.figure}>
      <figcaption className={chartStyles.caption}>Spending and income, last {points.length} months</figcaption>
      <div ref={wrapRef} className={chartStyles.chartWrap}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          className={`${chartStyles.svg} ${styles.trendClickable}`}
          tabIndex={0}
          role="img"
          aria-label="Spending bars and income line by month"
          {...pointerHandlers}
          onKeyDown={onKeyDown}
          onClick={onClick}
        >
          <ChartHatchDefs stroke="var(--exp-expense)" />
          <ChartYAxis maxVal={maxVal} ticks={ticks} innerH={innerH} />
          <line
            x1={PAD.left}
            x2={PAD.left + innerW}
            y1={yAt(avgSpendCents, maxVal, innerH)}
            y2={yAt(avgSpendCents, maxVal, innerH)}
            className={styles.trendAvg}
          />
          <Bars
            points={points}
            maxVal={maxVal}
            innerH={innerH}
            barW={barW}
            xForIndex={xForIndex}
            active={active}
            selectedMonth={selectedMonth}
          />
          <path d={incomeLine} className={styles.trendIncome} />
          {/* One point makes a path of a single "M", which draws nothing. */}
          {points.length === 1 && (
            <circle cx={xForIndex(0)} cy={yAt(points[0]!.incomeCents, maxVal, innerH)} r={4} className={styles.trendIncomeDot} />
          )}
          {focus && (
            <line x1={xForIndex(active!)} x2={xForIndex(active!)} y1={PAD.top} y2={PAD.top + innerH} className={chartStyles.crosshair} />
          )}
        </svg>
        {focus && (
          <ChartTooltip
            anchor={anchor}
            chart={wrapRef}
            title={monthLabel(focus.month)}
            lines={[
              { label: 'Income', value: formatCents(focus.incomeCents, format), tone: 'income' },
              { label: 'Spent', value: formatCents(focus.spendCents, format), tone: 'expense' },
              ...(focus.unpaidCents > 0
                ? [{ label: 'Of it unpaid', value: formatCents(focus.unpaidCents, format) }]
                : []),
            ]}
          />
        )}
      </div>
      <div className={chartStyles.legend}>
        <span className={chartStyles.legendExpense}>Spent</span>
        <span className={chartStyles.legendIncome}>Income</span>
        <span className={styles.legendAvg}>{points.length}-month average spend</span>
        <span className={styles.legendUnpaid}>Hatched: not paid yet</span>
      </div>
    </figure>
  )
}
