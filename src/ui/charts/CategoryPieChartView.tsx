import { useRef } from 'react'
import { formatCents } from '../../engine/money'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
import { ChartTooltip } from './ChartTooltip'
import { useSvgAnchor } from './useSvgAnchor'
import styles from './charts.module.css'

const SIZE = 220

export interface PieSlice {
  name: string
  cents: number
  d: string
  color: string
  total: number
  labelX: number
  labelY: number
}

interface Props {
  paths: PieSlice[]
  active: number | null
  onShow: (index: number) => void
  onHide: () => void
}

function PiePaths({
  paths,
  active,
  onShow,
  onHide,
}: Pick<Props, 'paths' | 'active' | 'onShow' | 'onHide'>) {
  return paths.map((p, i) => (
    <path
      key={p.name}
      d={p.d}
      fill={p.color}
      className={active != null && active !== i ? styles.dimmed : styles.pieSlice}
      onPointerEnter={() => onShow(i)}
      onPointerLeave={(e) => {
        if (e.pointerType === 'mouse') onHide()
      }}
      onPointerDown={() => onShow(i)}
    />
  ))
}

export function CategoryPieChartView({ paths, active, onShow, onHide }: Props) {
  const format = useMoneyFormat()
  const svgRef = useRef<SVGSVGElement>(null)
  const total = paths[0]?.total ?? 1
  const focus = active != null ? paths[active] : null
  const anchor = useSvgAnchor(
    svgRef,
    focus ? focus.labelX : null,
    focus ? focus.labelY : null,
  )

  return (
    <div className={styles.pieRow}>
      <div className={styles.pieChartCol}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className={styles.pieSvg}
          role="img"
          aria-label="Category expense pie chart"
        >
          <PiePaths paths={paths} active={active} onShow={onShow} onHide={onHide} />
        </svg>
        {focus && (
          <ChartTooltip
            anchor={anchor}
            title={focus.name}
            lines={[
              { label: 'Amount', value: formatCents(focus.cents, format), tone: 'expense' },
              { label: 'Share', value: `${Math.round((focus.cents / total) * 100)}%`, tone: 'neutral' },
            ]}
          />
        )}
      </div>
      <ul className={styles.pieLegend}>
        {paths.map((p, i) => (
          <li
            key={p.name}
            className={active === i ? styles.legendActive : undefined}
            onMouseEnter={() => onShow(i)}
            onMouseLeave={onHide}
          >
            <span className={styles.swatch} style={{ background: p.color }} aria-hidden />
            <span className={styles.pieLegendName}>{p.name}</span>
            <span className={styles.pieLegendAmount}>{formatCents(p.cents, format)}</span>
            <span className={styles.pieLegendPct}>{Math.round((p.cents / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
