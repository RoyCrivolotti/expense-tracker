import type { ReactNode } from 'react'
import { currencyWord, type PurchaseYearBreakdown } from '../../../../engine'
import { SeriesSwatch } from '../../../charts/LiveLegend'
import { formatMoneyShort, formatSignedMoneyShort } from '../chartTheme'
import { useMoneyFormat } from '../../../hooks/moneyFormatContext'
import styles from './ScenarioSeriesLegend.module.css'

export interface ScenarioLegendBreakdown {
  /** Scenario id, or 'draft'; two scenarios can share a name. */
  id: string
  label: string
  color: string
  dashed?: boolean
  breakdown: PurchaseYearBreakdown
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

export function BreakdownExtras({
  breakdowns,
  breakdownInTodaysMoney,
  yearZeroHint,
  format,
}: {
  breakdowns: ScenarioLegendBreakdown[]
  breakdownInTodaysMoney: boolean
  yearZeroHint: boolean
  format: ReturnType<typeof useMoneyFormat>
}) {
  return (
    <>
      {breakdowns.length > 0 ? (
        <div className={styles.breakdownStack}>
          {breakdownInTodaysMoney ? (
            <p className={styles.breakdownNote}>The purchase breakdown is in the plan's {currencyWord(format)}, not in the Nominal values above.</p>
          ) : null}
          {breakdowns.map((entry) => (
            <BreakdownRows key={entry.id} {...entry} format={format} />
          ))}
        </div>
      ) : null}
      {yearZeroHint ? (
        <p className={styles.yearZeroHint}>
          House already owned: the down payment is already out of the starting invested balance.
        </p>
      ) : null}
    </>
  )
}

interface BreakdownSlotProps {
  breakdowns: ScenarioLegendBreakdown[]
  yearZeroHint: boolean
  breakdownInTodaysMoney: boolean
  /** Some line buys in a year, so the room for its breakdown is kept whether or not it is showing. */
  reserve: boolean
  /** What is there while no breakdown is: the chart's note. */
  children: ReactNode
}

function slotClass(reserve: boolean, withNote: boolean): string {
  if (!reserve) return styles.slot ?? ''
  return `${styles.slot} ${withNote ? styles.slotReservedNote : styles.slotReserved}`
}

/**
 * A place under the chart that is the chart's note until a purchase year is pointed at, and that
 * year's breakdown while it is. Nothing is covered, and nothing moves when it changes, because the
 * room is kept when a line has a purchase.
 */
export function BreakdownSlot({ breakdowns, yearZeroHint, breakdownInTodaysMoney, reserve, children }: BreakdownSlotProps) {
  const format = useMoneyFormat()
  const showing = breakdowns.length > 0 || yearZeroHint
  return (
    <div className={slotClass(reserve, breakdownInTodaysMoney)}>
      {showing ? (
        <BreakdownExtras
          breakdowns={breakdowns}
          breakdownInTodaysMoney={breakdownInTodaysMoney}
          yearZeroHint={yearZeroHint}
          format={format}
        />
      ) : (
        children
      )}
    </div>
  )
}
