import type { ExpenseDataset } from '../../types'
import { trackVerdict, type TrackStatus } from '../../engine'
import { Card, EmptyState, SectionTitle } from './primitives'
import { useAssumedInflation } from '../hooks/assumedInflationContext'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
import { formatMoneyShort } from '../tabs/goals/chartTheme'
import { planGapLabel } from '../tabs/goals/planGap'
import { planMoneyLabel } from '../tabs/goals/planMoneyLabel'
import { daysSinceCheckin } from './checkinAge'
import { useGoalsCardFigures } from './useGoalsCardFigures'
import styles from './GoalsCard.module.css'

interface GoalsCardProps {
  dataset: ExpenseDataset
  onOpenGoals?: () => void
  /** Opens Goals on Progress with the check-in form up; absent when nothing can be written. */
  onLogCheckin?: (() => void) | undefined
}

/** Check-ins are monthly by design; a month without one is worth a word. */
const NUDGE_AFTER_DAYS = 30

/**
 * Manual check-ins die of neglect, and nothing else in the app asks for one. Shown once
 * there is an account to log against and the last check-in is a month old, or missing.
 */
function CheckinNudge({ dataset, onLogCheckin }: { dataset: ExpenseDataset; onLogCheckin: () => void }) {
  if (!dataset.wealthAccounts.some((a) => !a.archived)) return null
  const days = daysSinceCheckin(dataset)
  if (days !== null && days < NUDGE_AFTER_DAYS) return null
  const text = days === null ? 'No check-in logged yet.' : `Last check-in ${days} days ago.`
  return (
    <p className={styles.nudge}>
      {text}{' '}
      <button type="button" className={styles.openLink} onClick={onLogCheckin}>
        Log check-in
      </button>
    </p>
  )
}

interface TrackBadgeProps {
  status: TrackStatus
  format: ReturnType<typeof useMoneyFormat>
  /** The euros the gap in money is in, named when it is the only thing said. */
  planMoney: string
}

function TrackBadge({ status, format, planMoney }: TrackBadgeProps) {
  const verdict = trackVerdict(status)
  // Within a month either way is on track, which is neither the green nor the red of a side.
  const ahead = verdict !== 'behind'
  const dotClass = `${styles.trackDot} ${ahead ? styles.trackDotAhead : styles.trackDotBehind}`
  const money = formatMoneyShort(Math.abs(status.deltaCents), format)
  // Without a month count the plan's line has no point at this balance on this side of a step, so the gap in money is all there is.
  const label =
    verdict === 'on-track'
      ? 'On track'
      : status.deltaMonths
        ? planGapLabel(status.deltaMonths)
        : `${money} ${verdict} (${planMoney})`
  return (
    <div className={`${styles.trackBadge} ${ahead ? styles.trackBadgeAhead : styles.trackBadgeBehind}`}>
      <span className={dotClass} />
      {label}
    </div>
  )
}

function GoalsEmpty({ dataset, onOpenGoals }: { dataset: ExpenseDataset; onOpenGoals: (() => void) | undefined }) {
  return (
    <>
      <SectionTitle>Goals</SectionTitle>
      <Card>
        <EmptyState actionLabel={onOpenGoals ? 'Open Goals' : undefined} onAction={onOpenGoals}>
          {dataset.goalScenarios.length > 0
            ? 'Pick one of your scenarios as your plan under Goals, and this card will track it.'
            : 'A long-range plan: what you invest each month and where that leads in 10, 20 or 30 years.'}
        </EmptyState>
      </Card>
    </>
  )
}

export function GoalsCard({ dataset, onOpenGoals, onLogCheckin }: GoalsCardProps) {
  const format = useMoneyFormat()
  const inflationRate = useAssumedInflation()
  const { scenario, headline, track } = useGoalsCardFigures(dataset, format, inflationRate)

  if (!scenario || !headline) {
    return <GoalsEmpty dataset={dataset} onOpenGoals={onOpenGoals} />
  }

  return (
    <>
      <SectionTitle>
        Goals
        {onOpenGoals ? (
          <>
            {' '}
            <button type="button" className={styles.openLink} onClick={onOpenGoals}>
              View projections
            </button>
          </>
        ) : null}
      </SectionTitle>
      <Card>
        <p className={styles.primary}>{headline.primary}</p>
        <p className={styles.secondary}>{headline.secondary}</p>
        {track ? (
          <TrackBadge status={track} format={format} planMoney={planMoneyLabel(scenario?.planStartDate, format)} />
        ) : null}
        {onLogCheckin ? <CheckinNudge dataset={dataset} onLogCheckin={onLogCheckin} /> : null}
        {onOpenGoals ? (
          <button type="button" className={styles.cta} onClick={onOpenGoals}>
            Open Goals
          </button>
        ) : null}
      </Card>
    </>
  )
}
