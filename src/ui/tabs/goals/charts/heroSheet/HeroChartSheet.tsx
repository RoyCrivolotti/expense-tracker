import { memo, useMemo, useState } from 'react'
import { LinearChart } from '../../../../charts/LinearChart'
import chartStyles from '../../../../charts/charts.module.css'
import { useDebouncedAnnouncement } from '../../../../hooks/useDebouncedAnnouncement'
import { useMoneyFormat } from '../../../../hooks/moneyFormatContext'
import { formatMoneyShort } from '../../chartTheme'
import goalsStyles from '../../goals.module.css'
import { useChartLegendState, withFromToday } from '../heroLegendState'
import { ScenarioSeriesLegend } from '../ScenarioSeriesLegend'
import { SheetFrame } from '../SheetFrame'
import { useSideways } from '../sheetOrientation'
import type { HeroSheetModel } from './heroSheetModel'
import { readoutSentence } from './heroReadout'
import styles from './HeroChartSheet.module.css'

/** Drawn at this until the stage has been measured, which is one frame. */
const FALLBACK_HEIGHT = 240

/** How long a year must stay pointed at before a screen reader is told its values. */
const ANNOUNCE_AFTER_MS = 500

const HINT = 'Touch the chart to read a year. Tap a scenario to hide or show its line.'

/** The chart does not redraw for the sheet's own state, only for what the card hands over. */
const SheetChart = memo(LinearChart)

/**
 * The hero chart on the whole screen, with the readout beside it. A phone held upright gets it
 * drawn a quarter turn, and then the chart reads the pointer from its height (`SheetFrame`).
 *
 * The year pointed at is kept when a finger lifts, and it is this sheet's own: it starts at the
 * card's year and the card is not told, so nothing the sheet does re-draws the card behind it.
 */
export const HeroChartSheet = memo(function HeroChartSheet({
  model,
  initialIndex,
  onClose,
}: {
  model: HeroSheetModel
  initialIndex: number | null
  onClose: () => void
}) {
  const sideways = useSideways()
  const [active, setActive] = useState<number | null>(initialIndex)
  const focus = useMemo(
    () => ({ sticky: true, initial: initialIndex, turn: sideways ? (1 as const) : (0 as const) }),
    [initialIndex, sideways],
  )

  return (
    <SheetFrame
      title="Invested portfolio projection"
      label="Invested portfolio projection, full screen"
      toolbar={
        <div className={goalsStyles.sheetTools}>
          {model.displaySwitch}
          {model.windowPicker}
        </div>
      }
      onClose={onClose}
    >
      <div className={styles.body}>
        <div className={styles.stage}>
          <SheetChart
            {...model.chart}
            height={FALLBACK_HEIGHT}
            fillHeight
            tooltipMode="hidden"
            onActiveIndexChange={setActive}
            focus={focus}
          />
        </div>
        <HeroReadout model={model} active={active} />
      </div>
    </SheetFrame>
  )
})

/** The rail: every line's value in the year pointed at, and what a purchase did in it. */
function HeroReadout({ model, active }: { model: HeroSheetModel; active: number | null }) {
  const format = useMoneyFormat()
  const { legend } = model
  const { activeYear, legendItems, breakdowns, yearZeroHint } = useChartLegendState(
    legend.lines,
    legend.displaySeries,
    legend.names,
    legend.years,
    active,
    legend.scenarios,
    legend.hiddenIds,
  )
  const items = useMemo(
    () => withFromToday(legendItems, legend.fromTodayLine, legend.fromTodayLabel, activeYear),
    [legendItems, legend.fromTodayLine, legend.fromTodayLabel, activeYear],
  )
  const sentence = readoutSentence(activeYear, items, breakdowns.length > 0, (cents) => formatMoneyShort(cents, format))
  const announced = useDebouncedAnnouncement(sentence, ANNOUNCE_AFTER_MS)

  return (
    <>
      <aside className={styles.rail} aria-label="Values for the year">
        <ScenarioSeriesLegend
          items={items}
          activeYear={activeYear}
          breakdowns={breakdowns}
          breakdownInTodaysMoney={legend.nominalMode}
          yearZeroHint={yearZeroHint}
          onToggle={legend.onToggleVisible}
          layout="rows"
          hint={HINT}
        />
      </aside>
      {/* Outside the rail, and kept apart from what it draws: said once when a year settles, not on each step of a drag. */}
      <p className={chartStyles.srOnly} role="status" aria-live="polite" aria-atomic="true">
        {announced}
      </p>
    </>
  )
}
