import type { Ref } from 'react'
import styles from './LiveLegend.module.css'

export interface LiveLegendItem {
  label: string
  color: string
  dashed?: boolean
  /** The plan from today: drawn dotted, in the plan's colour. */
  dotted?: boolean
  /** The line does not reach the focused point: the row shows a dash, not a blank. */
  outOfRun?: boolean
  valueCents: number | null
  /** The series behind the row, when it can be toggled; a row with none cannot be hidden. */
  scenarioId?: number
  /** Hidden on the chart: listed dimmed so it can be brought back. */
  hidden?: boolean
}

interface LiveLegendProps {
  items: LiveLegendItem[]
  /** Renders a value's cents; the caller already has its own money formatter and format. */
  formatValue: (cents: number) => string
  /** Makes each toggleable row a button, as chart legends usually are. */
  onToggle?: ((scenarioId: number) => void) | undefined
  /** The row list, for a caller that needs to know whether it is on screen. */
  listRef?: Ref<HTMLUListElement> | undefined
  /** One row under another, or side by side as chips where the chart is wide enough to hold them. */
  layout?: 'rows' | 'chips' | undefined
}

/** One legend row; a button when the row can hide or show its series. */
function LegendRow({
  item,
  onToggle,
  formatValue,
}: {
  item: LiveLegendItem
  onToggle: LiveLegendProps['onToggle']
  formatValue: LiveLegendProps['formatValue']
}) {
  const body = (
    <>
      <SeriesSwatch color={item.color} {...(item.dashed ? { dashed: true } : {})} {...(item.dotted ? { dotted: true } : {})} />
      <span className={styles.label} title={item.label}>{item.label}</span>
      <span className={item.outOfRun ? `${styles.value} ${styles.valueNone}` : styles.value}>
        {item.valueCents != null ? formatValue(item.valueCents) : item.outOfRun ? '-' : ''}
      </span>
    </>
  )
  if (onToggle && item.scenarioId !== undefined) {
    const id = item.scenarioId
    return (
      <li className={styles.rowItem}>
        <button
          type="button"
          className={item.hidden ? `${styles.row} ${styles.rowButton} ${styles.rowHidden}` : `${styles.row} ${styles.rowButton}`}
          aria-pressed={!item.hidden}
          aria-label={`${item.hidden ? 'Show' : 'Hide'} ${item.label} on chart`}
          onClick={() => onToggle(id)}
        >
          {body}
        </button>
      </li>
    )
  }
  return <li className={styles.row}>{body}</li>
}

function DashedSwatch({ color }: { color: string }) {
  const stroke = 2
  const r = 2.4
  const o = 2
  return (
    <svg className={styles.dashedSwatch} viewBox="0 0 12 12" aria-hidden>
      <path
        d={`M ${o + r} ${o} A ${r} ${r} 0 0 0 ${o} ${o + r}`}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
      />
      <path
        d={`M ${12 - o - r} ${o} A ${r} ${r} 0 0 1 ${12 - o} ${o + r}`}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
      />
      <path
        d={`M ${12 - o} ${12 - o - r} A ${r} ${r} 0 0 1 ${12 - o - r} ${12 - o}`}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
      />
      <path
        d={`M ${o} ${12 - o - r} A ${r} ${r} 0 0 0 ${o + r} ${12 - o}`}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
      />
    </svg>
  )
}

function DottedSwatch({ color }: { color: string }) {
  return (
    <svg className={styles.dashedSwatch} viewBox="0 0 12 12" aria-hidden>
      {[2, 6, 10].map((cx) => (
        <circle key={cx} cx={cx} cy={6} r={1.3} fill={color} />
      ))}
    </svg>
  )
}

/** The swatch alone, for a caller drawing its own row around it (e.g. a breakdown heading). */
export function SeriesSwatch({
  color,
  dashed = false,
  dotted = false,
}: {
  color: string
  dashed?: boolean
  dotted?: boolean
}) {
  if (dotted) return <DottedSwatch color={color} />
  if (dashed) return <DashedSwatch color={color} />
  return <span className={styles.swatch} style={{ background: color }} aria-hidden />
}

/**
 * A chart legend where each row can show a live, per-focus value alongside its swatch and
 * label — the shape `ScenarioSeriesLegend` uses for the projection chart, generalized so any
 * chart can reuse the same row rendering. Callers own everything else about a legend
 * (a hint, a heading, extra rows below): this is only the row list.
 */
export function LiveLegend({ items, formatValue, onToggle, listRef, layout = 'rows' }: LiveLegendProps) {
  if (items.length === 0) return null
  return (
    <ul ref={listRef} className={layout === 'chips' ? `${styles.list} ${styles.chips}` : styles.list}>
      {items.map((item) => (
        <LegendRow key={item.scenarioId ?? item.label} item={item} onToggle={onToggle} formatValue={formatValue} />
      ))}
    </ul>
  )
}
