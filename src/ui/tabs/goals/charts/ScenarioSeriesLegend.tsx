import type { PurchaseYearBreakdown } from '../../../../engine'
import { formatEuroShort, formatSignedEuroShort } from '../chartTheme'
import styles from './ScenarioSeriesLegend.module.css'

export interface ScenarioLegendItem {
  label: string
  color: string
  dashed?: boolean
  valueCents: number | null
}

interface ScenarioSeriesLegendProps {
  items: ScenarioLegendItem[]
  activeYear: number | null
  purchaseBreakdown: PurchaseYearBreakdown | null
}

function DashedSwatch({ color }: { color: string }) {
  return (
    <svg className={styles.dashedSwatch} viewBox="0 0 14 12" aria-hidden>
      <line
        x1="1"
        y1="6"
        x2="13"
        y2="6"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="1.8 1.1"
      />
    </svg>
  )
}

function BreakdownRows({ breakdown }: { breakdown: PurchaseYearBreakdown }) {
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
      <p className={styles.breakdownTitle}>Purchase breakdown</p>
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
  purchaseBreakdown,
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
            {item.dashed ? (
              <DashedSwatch color={item.color} />
            ) : (
              <span className={styles.swatch} style={{ background: item.color }} aria-hidden />
            )}
            <span className={styles.label}>{item.label}</span>
            <span className={styles.value}>
              {item.valueCents != null ? formatEuroShort(item.valueCents) : ''}
            </span>
          </li>
        ))}
      </ul>
      {purchaseBreakdown ? <BreakdownRows breakdown={purchaseBreakdown} /> : null}
    </div>
  )
}
