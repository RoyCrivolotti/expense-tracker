import chartStyles from '../../../../charts/charts.module.css'
import { useDebouncedAnnouncement } from '../../../../hooks/useDebouncedAnnouncement'
import { ScenarioSeriesLegend } from '../ScenarioSeriesLegend'
import type { Readout } from './useReadout'

/** How long a year must stay pointed at before a screen reader is told its values. */
const ANNOUNCE_AFTER_MS = 500

const HINT = 'Touch the chart to read a year. Tap a scenario to hide or show its line.'

/** The readout's rows, the same whether it is in the rail or in the card that floats over the chart. */
export function ReadoutLegend({ readout }: { readout: Readout }) {
  return (
    <ScenarioSeriesLegend
      items={readout.items}
      activeYear={readout.activeYear}
      breakdowns={readout.breakdowns}
      breakdownInTodaysMoney={readout.nominalMode}
      yearZeroHint={readout.yearZeroHint}
      onToggle={readout.onToggle}
      layout="rows"
      hint={HINT}
    />
  )
}

/**
 * What a screen reader is told when the year pointed at settles. Apart from wherever the readout
 * is drawn, so that moving the readout never takes it away and says it again, and said once the year
 * has stopped changing, not at each step of a drag.
 */
export function HeroReadoutAnnouncer({ sentence }: { sentence: string }) {
  const announced = useDebouncedAnnouncement(sentence, ANNOUNCE_AFTER_MS)
  return (
    <p className={chartStyles.srOnly} role="status" aria-live="polite" aria-atomic="true">
      {announced}
    </p>
  )
}
