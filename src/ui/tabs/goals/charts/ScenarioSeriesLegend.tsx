import type { ReactNode, Ref } from 'react'
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
  /**
   * The breakdown is worked out on the real projection, so in the Nominal view its figures are in
   * today's money while the values above it are inflated: it says so rather than leave the two to
   * be read as one.
   */
  breakdownInTodaysMoney?: boolean
  yearZeroHint?: boolean
  /** The value list, for a caller that needs to know whether it is on screen. */
  listRef?: Ref<HTMLUListElement> | undefined
  /** Makes each saved scenario's row a toggle for its line, as chart legends usually are. */
  onToggle?: ((scenarioId: number) => void) | undefined
  layout?: 'rows' | 'chips' | undefined
  /** Where the floating breakdown sits over the chart: away from the year being pointed at. */
  floatSide?: 'start' | 'end' | undefined
  /** What it says before a year is pointed at, where "below" is not where the rows are. */
  hint?: string | undefined
  /**
   * The purchase breakdown in a column of its own beside the rows, so it makes the legend wider
   * and not taller. For a card that has to be whole in a box that is short.
   */
  extrasBeside?: boolean | undefined
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

function BreakdownExtras({
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
            <p className={styles.breakdownNote}>The purchase breakdown is in today's money, not in the Nominal values above.</p>
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

/** What the legend says before a year is pointed at: what it is told to, else how to use it. */
function legendHint(override: string | undefined, togglable: boolean): string {
  if (override !== undefined) return override
  return togglable
    ? 'Tap or hover the chart to compare values by year. Tap a scenario below to hide or show its line.'
    : 'Tap or hover the chart to compare values by year.'
}

/** The rows in a column and the purchase breakdown in another, each at its own width; no column when there is none. */
function Beside({ main, extras }: { main: ReactNode; extras: ReactNode }) {
  return (
    <div className={styles.beside}>
      <div className={styles.besideMain}>{main}</div>
      <div className={styles.besideExtras}>{extras}</div>
    </div>
  )
}

export function ScenarioSeriesLegend({
  items,
  activeYear,
  breakdowns,
  breakdownInTodaysMoney = false,
  yearZeroHint = false,
  listRef,
  onToggle,
  layout,
  floatSide = 'end',
  hint: hintOverride,
  extrasBeside,
}: ScenarioSeriesLegendProps) {
  const format = useMoneyFormat()
  if (items.length === 0) return null
  const hint = legendHint(hintOverride, onToggle !== undefined)

  // Side by side the chips leave no room for a block that comes and goes with the pointer: in the
  // flow it pushed the cards below it down by 144px, and the legend under the bar held at the
  // bottom of a laptop screen. It floats over the chart instead and takes no room.
  const floats = layout === 'chips' && (breakdowns.length > 0 || yearZeroHint)
  const extras = (
    <BreakdownExtras
      breakdowns={breakdowns}
      breakdownInTodaysMoney={breakdownInTodaysMoney}
      yearZeroHint={yearZeroHint}
      format={format}
    />
  )

  const main = (
    <>
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
    </>
  )
  if (extrasBeside) return <Beside main={main} extras={extras} />

  return (
    <div className={layout === 'chips' ? `${styles.wrap} ${styles.wrapWide}` : styles.wrap}>
      {main}
      {floats ? (
        <div className={`${styles.floater} ${floatSide === 'start' ? styles.floaterStart : styles.floaterEnd}`}>{extras}</div>
      ) : (
        extras
      )}
    </div>
  )
}
