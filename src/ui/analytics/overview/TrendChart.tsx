import { useCallback, useRef } from 'react'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import { ChartYAxis } from '../../charts/ChartYAxis'
import { CHART_H, CHART_W, PAD, innerSize, yAt } from '../../charts/chartLayout'
import { useChartFocus } from '../../charts/useChartFocus'
import { useSvgAnchor } from '../../charts/useSvgAnchor'
import { ChartHatchDefs } from '../shared/ChartHatchDefs'
import type { TrendModel } from './trendChartModel'
import { Bars, TrendCrosshair, TrendIncome, TrendLegend, TrendTooltip } from './trendChartParts'
import { trendHandlers } from './trendHandlers'
import chartStyles from '../../charts/charts.module.css'
import styles from './overview.module.css'

interface Props {
  model: TrendModel
  selectedMonth: string
  onSelectMonth: (month: string) => void
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
  const { active, onKeyDown: focusKeyDown, ...pointerHandlers } = useChartFocus(points.length, xForIndex, containerRef)
  const svgRef = useRef<SVGSVGElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const focus = active != null ? points[active] : null
  const anchor = useSvgAnchor(svgRef, focus ? xForIndex(active!) : null, focus ? PAD.top : null)

  const { onClick, onKeyDown } = trendHandlers(points, active, xForIndex, onSelectMonth, focusKeyDown)

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
          <TrendIncome points={points} xForIndex={xForIndex} maxVal={maxVal} innerH={innerH} />
          {focus && <TrendCrosshair x={xForIndex(active!)} innerH={innerH} />}
        </svg>
        {focus && <TrendTooltip focus={focus} anchor={anchor} wrapRef={wrapRef} format={format} />}
      </div>
      <TrendLegend count={points.length} />
    </figure>
  )
}
