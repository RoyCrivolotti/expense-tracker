import type { ReactNode, Ref } from 'react'
import { LiveLegend, type LiveLegendItem } from '../../../charts/LiveLegend'
import { formatMoneyShort } from '../chartTheme'
import { useMoneyFormat } from '../../../hooks/moneyFormatContext'
import { yearLabel } from '../yearLabel'
import { BreakdownExtras, type ScenarioLegendBreakdown } from './purchaseBreakdown'
import styles from './ScenarioSeriesLegend.module.css'

export { BreakdownExtras, BreakdownSlot, type ScenarioLegendBreakdown } from './purchaseBreakdown'

/** The row shape is generic; kept as its own name here since this is the scenario projection's legend. */
export type ScenarioLegendItem = LiveLegendItem

interface ScenarioSeriesLegendProps {
  items: ScenarioLegendItem[]
  activeYear: number | null
  breakdowns: ScenarioLegendBreakdown[]
  /**
   * The breakdown is worked out on the real projection, so in the Nominal view its figures are in
   * the plan's euros while the values above it are inflated: it says so rather than leave the two to
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
  /** Said after the hint where the rows show figures before a year is pointed at: which year they are for. */
  restNote?: string | undefined
  /** The axis' first day, where it counts calendar years: the year pointed at is named by the calendar. */
  calendarOrigin?: string | null | undefined
  /**
   * The scenarios are in chips above the chart: `items` is only what has none, and the legend is
   * still there, without them, for the year being pointed at and the breakdown that floats up
   * from it.
   */
  chipsAbove?: boolean | undefined
  /**
   * The purchase breakdown in a column of its own beside the rows, so it makes the legend wider
   * and not taller. For a card that has to be whole in a box that is short.
   */
  extrasBeside?: boolean | undefined
}

/** What the legend says before a year is pointed at: what it is told to, else how to use it, and which year the rows are for. */
function legendHint(
  override: string | undefined,
  togglable: boolean,
  restNote: string | undefined,
): string {
  if (restNote !== undefined) return `${legendHint(override, togglable, undefined)} ${restNote}`
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

interface LegendMainProps {
  items: ScenarioLegendItem[]
  activeYear: number | null | undefined
  hint: string
  format: ReturnType<typeof useMoneyFormat>
  onToggle: ScenarioSeriesLegendProps['onToggle']
  listRef: ScenarioSeriesLegendProps['listRef']
  layout: ScenarioSeriesLegendProps['layout']
  /** The scenarios' chips are above the chart, and its own are to two decimals in millions, so this key is too. */
  chipsAbove: boolean
  calendarOrigin: string | null | undefined
}

/** The year pointed at, or how to point at one, and the rows; no rows where the chips above have them. */
function LegendMain({
  items,
  activeYear,
  hint,
  format,
  onToggle,
  listRef,
  layout,
  chipsAbove,
  calendarOrigin,
}: LegendMainProps) {
  return (
    <>
      {activeYear != null ? (
        <p className={styles.yearHeader}>
          {calendarOrigin ? yearLabel(activeYear, calendarOrigin) : <>Year {activeYear}</>}
        </p>
      ) : (
        <p className={styles.hint}>{hint}</p>
      )}
      {items.length > 0 ? (
        <LiveLegend
          items={items}
          formatValue={(cents) => formatMoneyShort(cents, format, chipsAbove ? 2 : 1)}
          onToggle={onToggle}
          listRef={listRef}
          layout={layout}
        />
      ) : null}
    </>
  )
}

/** Where the breakdown that floats up from the legend sits: over the end of it, or the start. */
function floaterClass(side: 'start' | 'end'): string {
  return `${styles.floater} ${side === 'start' ? styles.floaterStart : styles.floaterEnd}`
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
  restNote,
  calendarOrigin,
  chipsAbove = false,
  extrasBeside,
}: ScenarioSeriesLegendProps) {
  const format = useMoneyFormat()
  if (items.length === 0 && !chipsAbove) return null
  const hint = legendHint(hintOverride, onToggle !== undefined, restNote)

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
    <LegendMain
      items={items}
      activeYear={activeYear}
      hint={hint}
      format={format}
      onToggle={onToggle}
      listRef={listRef}
      layout={layout}
      chipsAbove={chipsAbove}
      calendarOrigin={calendarOrigin}
    />
  )
  if (extrasBeside) return <Beside main={main} extras={extras} />

  return (
    <div className={layout === 'chips' ? `${styles.wrap} ${styles.wrapWide}` : styles.wrap}>
      {main}
      {floats ? <div className={floaterClass(floatSide)}>{extras}</div> : extras}
    </div>
  )
}
