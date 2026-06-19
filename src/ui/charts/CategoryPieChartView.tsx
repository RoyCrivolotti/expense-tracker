import { formatCents } from '../../engine/money'
import { ChartTooltip } from './ChartTooltip'
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
  onTouchEnd: () => void
}

export function CategoryPieChartView({ paths, active, onShow, onHide, onTouchEnd }: Props) {
  const total = paths[0]?.total ?? 1
  const focus = active != null ? paths[active] : null

  return (
    <div className={styles.pieRow}>
      <div className={styles.chartWrap}>
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className={styles.pieSvg} role="img" aria-label="Category expense pie chart">
          {paths.map((p, i) => (
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
              onPointerUp={onTouchEnd}
            />
          ))}
        </svg>
        {focus && (
          <ChartTooltip
            title={focus.name}
            leftPct={(focus.labelX / SIZE) * 100}
            lines={[
              { label: 'Amount', value: formatCents(focus.cents), tone: 'expense' },
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
            <span className={styles.swatch} style={{ background: p.color }} />
            {p.name}{' '}
            <span className={styles.muted}>
              {formatCents(p.cents)} ({Math.round((p.cents / total) * 100)}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
