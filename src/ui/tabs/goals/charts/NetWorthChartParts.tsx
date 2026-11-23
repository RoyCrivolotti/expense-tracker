import type { ReactNode, RefObject } from 'react'
import type { NewGoalScenario } from '../../../../data/dataSource'
import { RETURN_BAND_SPREAD, formatPercent } from '../../../../engine'
import { ChartLegend, type LegendItem } from '../../../charts/ChartLegend'
import { useMoneyFormat } from '../../../hooks/moneyFormatContext'
import { HeroWindowPicker } from './HeroWindowPicker'
import { HeroTitleRow } from './heroSheet/HeroTitleRow'
import type { HeroWindowKey, heroWindowsFor } from './heroWindow'
import progressStyles from '../progress.module.css'
import {
  BreakdownSlot,
  ScenarioSeriesLegend,
  type ScenarioLegendBreakdown,
  type ScenarioLegendItem,
} from './ScenarioSeriesLegend'
import styles from '../goals.module.css'
import { chipsAboveHint, restNote, type RestYear } from './heroRestYear'
import { bandReach } from './netWorthChartProps'

const NO_BREAKDOWNS: ScenarioLegendBreakdown[] = []

/** What the line under the chart says where the scenarios' chips are above it, not under it. */
const CHIPS_ABOVE_HINT = 'The values in the chips above are for the last year, or for the year you point at.'

export function PortfolioLegend({
  isHero,
  narrow,
  listRef,
  staticLegend,
  legendItems,
  chipsAbove,
  activeYear,
  breakdowns,
  yearZeroHint,
  breakdownInTodaysMoney,
  floatSide,
  onToggle,
  calendar,
}: {
  isHero: boolean
  narrow: boolean
  /** The scenarios are listed in chips above the chart, so only what has no chip is listed here. */
  chipsAbove: boolean
  listRef: RefObject<HTMLUListElement | null>
  staticLegend: LegendItem[]
  legendItems: ScenarioLegendItem[]
  activeYear: number | null
  breakdowns: ScenarioLegendBreakdown[]
  yearZeroHint: boolean
  /** The purchase breakdown is worked out in the plan's euros, whichever way the lines are drawn. */
  breakdownInTodaysMoney: boolean
  /** Which side of the chart the wide layout's floating breakdown sits on. */
  floatSide: 'start' | 'end'
  onToggle: ((scenarioId: number) => void) | undefined
  /** On a calendar axis: its first day, and the year the figures are for before one is pointed at. */
  calendar: { origin: string; rest: RestYear } | null
}) {
  if (isHero) {
    return (
      <ScenarioSeriesLegend
        items={chipsAbove ? legendItems.filter((item) => item.dotted) : legendItems}
        {...(chipsAbove
          ? { chipsAbove: true, hint: calendar ? chipsAboveHint(calendar.rest, calendar.origin) : CHIPS_ABOVE_HINT }
          : {})}
        {...(calendar
          ? {
              calendarOrigin: calendar.origin,
              ...(chipsAbove ? {} : { restNote: restNote(calendar.rest, calendar.origin) }),
            }
          : {})}
        activeYear={activeYear}
        breakdowns={chipsAbove ? NO_BREAKDOWNS : breakdowns}
        yearZeroHint={chipsAbove ? false : yearZeroHint}
        breakdownInTodaysMoney={breakdownInTodaysMoney}
        onToggle={onToggle}
        listRef={listRef}
        layout={narrow ? 'rows' : 'chips'}
        floatSide={floatSide}
      />
    )
  }
  return <ChartLegend items={staticLegend} variant="stack" />
}

/**
 * The hero's header: the title, and on the right the window buttons, with, where a wide screen
 * has the room, the display switch beside them. A phone has the button that opens the chart full
 * screen at the end of the title's line.
 */
export function ChartHeader({
  isHero,
  money,
  aside,
  windows,
  value,
  onChange,
  onOpenSheet,
}: {
  isHero: boolean
  /** What the chart's euros are, said beside the title where the title has the room. */
  money: string
  aside: ReactNode
  windows: ReturnType<typeof heroWindowsFor>
  value: HeroWindowKey
  onChange: (next: HeroWindowKey) => void
  onOpenSheet: (() => void) | undefined
}) {
  const picker = isHero ? <HeroWindowPicker windows={windows} value={value} onChange={onChange} /> : null
  return (
    <div className={progressStyles.chartHeaderRow}>
      {onOpenSheet ? (
        <HeroTitleRow onOpen={onOpenSheet} />
      ) : (
        <div className={styles.chartTitleBlock}>
          <h3 className={styles.chartTitle}>Invested portfolio projection</h3>
          <span className={styles.chartMoney}>{money}</span>
        </div>
      )}
      {isHero && aside ? (
        <div className={styles.chartTools}>
          {aside}
          {picker}
        </div>
      ) : (
        picker
      )}
    </div>
  )
}

/** What is under the legend: a box of its own on a phone, a line of the card on a wide screen. */
export function ChartFooter({ footer, bare }: { footer: ReactNode; bare: boolean }) {
  if (footer == null) return null
  return <div className={bare ? styles.chartFooterBare : styles.chartFooter}>{footer}</div>
}

/**
 * What the wide hero's marks mean, under its legend: the purchase years, why a purchase dips the
 * line, and what the band is, which nothing else on the chart says. Static, so it never changes
 * height as a year is hovered the way the line above the chips does.
 */
export function HeroNote({ draft, isHero, narrow }: { draft: NewGoalScenario; isHero: boolean; narrow: boolean }) {
  const format = useMoneyFormat()
  // A phone has the explanation above the chart instead (chartHint).
  if (!isHero || narrow) return null
  const low = Math.max(0, draft.expectedRealReturn - RETURN_BAND_SPREAD)
  const high = draft.expectedRealReturn + RETURN_BAND_SPREAD
  return (
    <p className={`${styles.chartHint} ${styles.heroNote}`}>
      Dashed vertical lines mark purchase years: in one, return and contributions apply before the down payment comes
      out. The shaded band is the line you are editing at a real return of {formatPercent(low, format)} to{' '}
      {formatPercent(high, format)}, {bandReach(draft.expectedRealReturn).either}. It shows how much the return matters,
      not how likely an outcome is.
    </p>
  )
}

interface HeroFootnoteProps {
  draft: NewGoalScenario
  isHero: boolean
  narrow: boolean
  chipsAbove: boolean
  breakdowns: ScenarioLegendBreakdown[]
  yearZeroHint: boolean
  breakdownInTodaysMoney: boolean
  reserve: boolean
}

/**
 * Under the wide hero: the note on what the marks mean. With the scenarios' chips above the chart
 * the purchase breakdown has no legend to float over, so it takes the note's place, in a slot as
 * tall as it, while a purchase year is pointed at.
 */
export function HeroFootnote({
  chipsAbove,
  breakdowns,
  yearZeroHint,
  breakdownInTodaysMoney,
  reserve,
  ...note
}: HeroFootnoteProps) {
  if (!chipsAbove || !note.isHero || note.narrow) return <HeroNote {...note} />
  return (
    <BreakdownSlot
      breakdowns={breakdowns}
      yearZeroHint={yearZeroHint}
      breakdownInTodaysMoney={breakdownInTodaysMoney}
      reserve={reserve}
    >
      <HeroNote {...note} />
    </BreakdownSlot>
  )
}
