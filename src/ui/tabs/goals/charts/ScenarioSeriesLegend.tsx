import type { MoneyFormat, PurchaseYearBreakdown } from '../../../../engine'
import { formatMoneyShort, formatSignedMoneyShort } from '../chartTheme'
import { useMoneyFormat } from '../../../hooks/moneyFormatContext'
import styles from './ScenarioSeriesLegend.module.css'

export interface ScenarioLegendItem {
  label: string
  color: string
  dashed?: boolean
  /** The plan from today: drawn dotted, in the plan's colour. */
  dotted?: boolean
  valueCents: number | null
  /** The saved scenario behind the line; the draft has none and cannot be hidden. */
  scenarioId?: number
  /** Hidden on the chart: listed dimmed so it can be brought back. */
  hidden?: boolean
}

export interface ScenarioLegendBreakdown {
  /** Scenario id, or 'draft'; two scenarios can share a name. */
  id: string
  label: string
  color: string
  dashed?: boolean
  breakdown: PurchaseYearBreakdown
}

interface ScenarioSeriesLegendProps {
  items: ScenarioLegendItem[]
  activeYear: number | null
  breakdowns: ScenarioLegendBreakdown[]
  yearZeroHint?: boolean
  /** Makes each saved scenario's row a toggle for its line, as chart legends usually are. */
  onToggle?: ((scenarioId: number) => void) | undefined
}

/** One legend row; a button when the row can hide or show its line. */
function LegendRow({ item, onToggle, format }: { item: ScenarioLegendItem; onToggle: ScenarioSeriesLegendProps['onToggle']; format: MoneyFormat }) {
  const body = (
    <>
      <SeriesSwatch color={item.color} {...(item.dashed ? { dashed: true } : {})} {...(item.dotted ? { dotted: true } : {})} />
      <span className={styles.label}>{item.label}</span>
      <span className={styles.value}>
        {item.valueCents != null ? formatMoneyShort(item.valueCents, format) : ''}
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

function SeriesSwatch({
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

function BreakdownRows({
  label,
  color,
  dashed,
  breakdown,
  format,
}: ScenarioLegendBreakdown & { format: MoneyFormat }) {
  const rows: { label: string; value: string; tone?: 'income' | 'expense' | 'neutral' }[] = [
    { label: 'Start of year', value: formatMoneyShort(breakdown.startInvestedCents, format) },
    {
      label: 'Return this year',
      value: formatSignedMoneyShort(breakdown.growthCents, format),
      tone: breakdown.growthCents >= 0 ? 'income' : 'expense',
    },
    {
      label: 'Contributions',
      value: formatSignedMoneyShort(breakdown.contributionCents, format),
      tone: breakdown.contributionCents >= 0 ? 'income' : 'expense',
    },
    {
      label: 'Down payment + fees',
      value: formatSignedMoneyShort(-breakdown.totalWithdrawalCents, format),
      tone: 'expense',
    },
    { label: 'End invested', value: formatMoneyShort(breakdown.endInvestedCents, format) },
    {
      label: 'Step vs prior year',
      value: formatSignedMoneyShort(breakdown.netChangeCents, format),
      tone: breakdown.netChangeCents >= 0 ? 'income' : 'expense',
    },
  ]

  return (
    <div className={styles.breakdown}>
      <div className={styles.breakdownHeader}>
        <SeriesSwatch color={color} {...(dashed ? { dashed: true } : {})} />
        <p className={styles.breakdownTitle}>{label}</p>
      </div>
      <ul className={styles.breakdownList}>
        {rows.map((row) => (
          <li key={row.label} className={styles.breakdownRow}>
            <span className={styles.breakdownLabel}>{row.label}</span>
            <span className={row.tone ? styles[`tone_${row.tone}`] : styles.breakdownValue}>
              {row.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function ScenarioSeriesLegend({
  items,
  activeYear,
  breakdowns,
  yearZeroHint = false,
  onToggle,
}: ScenarioSeriesLegendProps) {
  const format = useMoneyFormat()
  if (items.length === 0) return null
  const hint = onToggle
    ? 'Tap or hover the chart to compare values by year. Tap a scenario below to hide or show its line.'
    : 'Tap or hover the chart to compare values by year.'

  return (
    <div className={styles.wrap}>
      {activeYear != null ? (
        <p className={styles.yearHeader}>Year {activeYear}</p>
      ) : (
        <p className={styles.hint}>{hint}</p>
      )}
      <ul className={styles.list}>
        {items.map((item) => (
          <LegendRow key={item.scenarioId ?? item.label} item={item} onToggle={onToggle} format={format} />
        ))}
      </ul>
      {breakdowns.length > 0 ? (
        <div className={styles.breakdownStack}>
          {breakdowns.map((entry) => (
            <BreakdownRows key={entry.id} {...entry} format={format} />
          ))}
        </div>
      ) : null}
      {yearZeroHint ? (
        <p className={styles.yearZeroHint}>
          Purchase at year 0 — down payment is reflected in start invested.
        </p>
      ) : null}
    </div>
  )
}
