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
import goalStyles from '../goals.module.css'
import { LEVER_SPECS } from '../leverFields'
import { Lever } from './Lever'
import { useBarScrollPadding } from './useBarScrollPadding'
import styles from './planDesktop.module.css'

interface ResultProps {
  /** What the charts read, so a slider is never waiting on the projection under it. */
  draft: NewGoalScenario
}

/** The net worth the plan ends at, in today's money, as the narrative under the chart gives it. */
const LeverResult = memo(function LeverResult({ draft }: ResultProps) {
  const format = useMoneyFormat()
  const inflationRate = useAssumedInflation()
  const end = useMemo(() => {
    const series = projectNetWorth(scenarioToParams({ ...draft, id: 0 }, inflationRate))
    return series[series.length - 1]?.netWorthCents ?? 0
  }, [draft, inflationRate])
  return (
    <>
      <span className={styles.leverLabel}>Net worth at horizon</span>
      <span className={styles.leverResult}>{formatCentsCompact(end, format)}</span>
    </>
  )
})

interface LeversBarProps {
  draft: NewGoalScenario
  /** The draft the charts read; the result under the bar follows it, not the live draft. */
  resultDraft: NewGoalScenario
  keys: readonly LeverKey[]
  onChange: (patch: Partial<NewGoalScenario>) => void
  expanded: boolean
  /** The id of the panel the button opens. */
  panelId: string
  onToggle: () => void
}

/**
 * The inputs a plan is mostly tuned with, beside the result they move, always in reach: along the
 * bottom edge while its place in the page is below the fold, then in the page, then under the app
 * header once the page has scrolled past it. The page's scroll padding covers it while it is
 * mounted, so a control reached with the keyboard is not left behind it. The rest of the inputs
 * open from the button in the result block.
 */
export function LeversBar({ draft, resultDraft, keys, onChange, expanded, panelId, onToggle }: LeversBarProps) {
  const bar = useRef<HTMLDivElement>(null)
  useBarScrollPadding(bar)
  return (
    <div ref={bar} className={styles.leversBar}>
      <Card className={styles.levers}>
        <div className={styles.leverGrid} role="group" aria-label="Key inputs">
          {keys.map((key) => (
            <Lever key={key} spec={LEVER_SPECS[key]} draft={draft} onChange={onChange} />
          ))}
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
