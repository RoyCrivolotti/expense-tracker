import { useRef } from 'react'
import { formatCents } from '../../engine/money'
import { ChartTooltip } from './ChartTooltip'
import { ChartYAxis } from './ChartYAxis'
import { CHART_H, CHART_W, PAD, monthLabel } from './chartLayout'
import { useSvgAnchor } from './useSvgAnchor'
import styles from './charts.module.css'

export interface YtdPoint {
  month: string
  cumIncome: number
  cumExpense: number
}

interface Props {
  points: YtdPoint[]
  maxVal: number
  innerH: number
  active: number | null
  focusX: number
  coords: (idx: number, val: number) => { x: number; y: number }
  line: (key: 'cumIncome' | 'cumExpense') => string
  pointerHandlers: Record<string, (e: React.PointerEvent<SVGSVGElement>) => void>
}

export function YtdLineChartView({
  points,
  maxVal,
  innerH,
  active,
  focusX,
  coords,
  line,
  pointerHandlers,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const focus = active != null ? points[active] : null
  const anchor = useSvgAnchor(svgRef, focus ? focusX : null, focus ? PAD.top : null)

  return (
    <div className={styles.chartWrap}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className={styles.svg}
        role="img"
        aria-label="Cumulative year-to-date income and expenses"
        {...pointerHandlers}
      >
        <ChartYAxis maxVal={maxVal} innerH={innerH} />
        <path d={line('cumIncome')} className={styles.lineIncome} fill="none" strokeWidth={2.5} />
        <path d={line('cumExpense')} className={styles.lineExpense} fill="none" strokeWidth={2.5} />
        {points.map((p, i) => (
          <text key={p.month} x={coords(i, 0).x} y={CHART_H - 8} textAnchor="middle" className={styles.axisLabel}>
            {monthLabel(p.month)}
          </text>
        ))}
        {focus && active != null && (
          <>
            <line x1={focusX} x2={focusX} y1={PAD.top} y2={PAD.top + innerH} className={styles.crosshair} />
            <circle cx={focusX} cy={coords(active, focus.cumIncome).y} r={4} className={styles.dotIncome} />
            <circle cx={focusX} cy={coords(active, focus.cumExpense).y} r={4} className={styles.dotExpense} />
          </>
        )}
      </svg>
      {focus && (
        <ChartTooltip
          anchor={anchor}
          title={monthLabel(focus.month)}
          lines={[
            { label: 'Cumulative income', value: formatCents(focus.cumIncome), tone: 'income' },
            { label: 'Cumulative expenses', value: formatCents(focus.cumExpense), tone: 'expense' },
            { label: 'Net', value: formatCents(focus.cumIncome - focus.cumExpense), tone: 'neutral' },
          ]}
        />
      )}
    </div>
  )
}
