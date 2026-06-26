import type { PurchaseYearBreakdown } from '../../../../engine'
import { formatEuroShort, formatSignedEuroShort } from '../chartTheme'
import styles from './ScenarioSeriesLegend.module.css'

export interface ScenarioLegendItem {
  label: string
  color: string
  dashed?: boolean
  valueCents: number | null
}

export interface ScenarioLegendBreakdown {
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

function SeriesSwatch({
  color,
  dashed = false,
}: {
  color: string
  dashed?: boolean
}) {
  if (dashed) return <DashedSwatch color={color} />
  return <span className={styles.swatch} style={{ background: color }} aria-hidden />
}

function BreakdownRows({
  label,
  color,
  dashed,
  breakdown,
}: ScenarioLegendBreakdown) {
  const rows: { label: string; value: string; tone?: 'income' | 'expense' | 'neutral' }[] = [
    { label: 'Start of year', value: formatEuroShort(breakdown.startInvestedCents) },
    {
      label: 'Return this year',
      value: formatSignedEuroShort(breakdown.growthCents),
      tone: breakdown.growthCents >= 0 ? 'income' : 'expense',
    },
    {
      label: 'Contributions',
      value: formatSignedEuroShort(breakdown.contributionCents),
      tone: breakdown.contributionCents >= 0 ? 'income' : 'expense',
    },
    {
      label: 'Down payment + fees',
      value: formatSignedEuroShort(-breakdown.totalWithdrawalCents),
      tone: 'expense',
    },
    { label: 'End invested', value: formatEuroShort(breakdown.endInvestedCents) },
    {
      label: 'Step vs prior year',
      value: formatSignedEuroShort(breakdown.netChangeCents),
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
}: ScenarioSeriesLegendProps) {
  if (items.length === 0) return null

  return (
    <div className={styles.wrap}>
      {activeYear != null ? (
        <p className={styles.yearHeader}>Year {activeYear}</p>
      ) : (
        <p className={styles.hint}>Tap or hover the chart to compare values by year.</p>
      )}
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.label} className={styles.row}>
            <SeriesSwatch color={item.color} {...(item.dashed ? { dashed: true } : {})} />
            <span className={styles.label}>{item.label}</span>
            <span className={styles.value}>
              {item.valueCents != null ? formatEuroShort(item.valueCents) : ''}
            </span>
          </li>
        ))}
      </ul>
      {breakdowns.length > 0 ? (
        <div className={styles.breakdownStack}>
          {breakdowns.map((entry) => (
            <BreakdownRows key={entry.label} {...entry} />
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
