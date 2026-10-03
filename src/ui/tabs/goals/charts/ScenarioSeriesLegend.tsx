import type { Ref } from 'react'
import type { PurchaseYearBreakdown } from '../../../../engine'
import { LiveLegend, SeriesSwatch, type LiveLegendItem } from '../../../charts/LiveLegend'
import { formatMoneyShort, formatSignedMoneyShort } from '../chartTheme'
import { useMoneyFormat } from '../../../hooks/moneyFormatContext'
import styles from './ScenarioSeriesLegend.module.css'

/** The row shape is generic; kept as its own name here since this is the scenario projection's legend. */
export type ScenarioLegendItem = LiveLegendItem

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
  /** The value list, for a caller that needs to know whether it is on screen. */
  listRef?: Ref<HTMLUListElement> | undefined
  /** Makes each saved scenario's row a toggle for its line, as chart legends usually are. */
  onToggle?: ((scenarioId: number) => void) | undefined
  layout?: 'rows' | 'chips' | undefined
}

function BreakdownRows({
  label,
  color,
  dashed,
  breakdown,
  format,
}: ScenarioLegendBreakdown & { format: ReturnType<typeof useMoneyFormat> }) {
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
  listRef,
  onToggle,
  layout,
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
      <LiveLegend
        items={items}
        formatValue={(cents) => formatMoneyShort(cents, format)}
        onToggle={onToggle}
        listRef={listRef}
        layout={layout}
      />
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
