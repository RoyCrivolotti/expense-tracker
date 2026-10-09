import { memo, useMemo, useRef } from 'react'
import type { NewGoalScenario } from '../../../../data/dataSource'
import {
  formatCentsCompact,
  projectNetWorth,
  scenarioToParams,
  type LeverKey,
} from '../../../../engine'
import { ChevronIcon } from '../../../icons'
import { useAssumedInflation } from '../../../hooks/assumedInflationContext'
import { useMoneyFormat } from '../../../hooks/moneyFormatContext'
import { Card } from '../../../components/primitives'
import { bothMoneys, bothMoneysSentence } from '../bothMoneys'
import { formatMoneyShort } from '../chartTheme'
import goalStyles from '../goals.module.css'
import { LEVER_SPECS } from '../leverFields'
import { Lever } from './Lever'
import { STAR_HOME_ATTR } from './starFocus'
import { useBarScrollPadding } from './useBarScrollPadding'
import styles from './planDesktop.module.css'

interface ResultProps {
  /** What the charts read, so a slider is never waiting on the projection under it. */
  draft: NewGoalScenario
}

/** The net worth the plan ends at, in the plan's money and on the account, as the narrative under the chart gives it. */
const LeverResult = memo(function LeverResult({ draft }: ResultProps) {
  const format = useMoneyFormat()
  const inflationRate = useAssumedInflation()
  const { netWorth, invested, years } = useMemo(() => {
    const series = projectNetWorth(scenarioToParams({ ...draft, id: 0 }, inflationRate))
    const last = series[series.length - 1]
    return { netWorth: last?.netWorthCents ?? 0, invested: last?.investedCents ?? 0, years: last?.year ?? 0 }
  }, [draft, inflationRate])
  const worth = bothMoneys({
    cents: netWorth,
    years,
    planStartDate: draft.planStartDate,
    inflationRate,
    money: (cents) => formatCentsCompact(cents, format),
    format,
  })
  return (
    <>
      <div className={styles.leverHead}>
        {/* The one place the plan's net worth is on this layout, so it is named as the summary
            names it: the horizon in the label, which is also the input beside it. */}
        <span className={styles.leverLabel}>
          Net worth in {draft.horizonYears} {draft.horizonYears === 1 ? 'yr' : 'yrs'}
        </span>
      </div>
      {/* Always the plan's money, whichever way the chart above is showing it, and said so under it.
          What it comes to on the account when the plan ends is in the hover text and, in full, in the
          line under the chart: there is no room for it here without taking it from the levers. */}
      <span className={styles.leverResult} title={bothMoneysSentence(worth)}>
        {worth.plan}
      </span>
      {/* The chart above draws the invested portfolio. With a house in the plan the net worth is
          more than that, and the two figures would otherwise look like a disagreement. One line for
          both: the held bar is sized for the result column's height with a house, which is one
          note, and has no room for another. */}
      <span className={styles.leverResultNote}>
        {invested !== netWorth ? `${worth.planLabel}, ${formatMoneyShort(invested, format)} invested` : worth.planLabel}
      </span>
    </>
  )
})

interface LeversBarProps {
  draft: NewGoalScenario
  /** The draft the charts read; the result under the bar follows it, not the live draft. */
  resultDraft: NewGoalScenario
  keys: readonly LeverKey[]
  onChange: (patch: Partial<NewGoalScenario>) => void
  /** Takes an input out of the bar; absent where the bar cannot be changed. */
  onUnstar?: ((key: LeverKey) => void) | undefined
  expanded: boolean
  /** The id of the panel the button opens. */
  panelId: string
  onToggle: () => void
}

/**
 * The inputs a plan is mostly tuned with, beside the result they move, always in reach: along the
 * bottom edge while its place in the page is below the fold (where the screen is wide enough for
 * them to be one row and tall enough to leave the chart above the bar), then in the page, then
 * under the app header once the page has scrolled past it. The page's scroll padding covers it while it is mounted, so a control reached with
 * the keyboard is not left behind it. The rest of the inputs open from the button in the result
 * block.
 */
export function LeversBar({ draft, resultDraft, keys, onChange, onUnstar, expanded, panelId, onToggle }: LeversBarProps) {
  const bar = useRef<HTMLDivElement>(null)
  useBarScrollPadding(bar)
  return (
    <div ref={bar} className={styles.leversBar} data-levers-bar="">
      <Card className={styles.levers}>
        <div className={styles.leverGrid} role="group" aria-label="Key inputs" {...{ [STAR_HOME_ATTR]: '' }}>
          {keys.map((key) => (
            <Lever
              key={key}
              spec={LEVER_SPECS[key]}
              draft={draft}
              onChange={onChange}
              onUnstar={onUnstar ? () => onUnstar(key) : undefined}
            />
          ))}
          {keys.length === 0 ? (
            <p className={styles.leverEmpty}>Nothing is starred. Open All inputs and star the ones you change most.</p>
          ) : null}
        </div>
        <div className={styles.leverSide}>
          <LeverResult draft={resultDraft} />
          <button
            type="button"
            className={`${goalStyles.btn} ${styles.allInputs}`}
            aria-expanded={expanded}
            aria-controls={panelId}
            onClick={onToggle}
          >
            All inputs
            <span className={expanded ? `${styles.chevron} ${styles.chevronOpen}` : styles.chevron} aria-hidden>
              <ChevronIcon />
            </span>
          </button>
        </div>
      </Card>
    </div>
  )
}
