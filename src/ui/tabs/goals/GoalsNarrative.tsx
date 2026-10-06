import type { NewGoalScenario } from '../../../data/dataSource'
import { useAssumedInflation } from '../..//hooks/assumedInflationContext'
import type { Milestone } from '../../../types'
import { formatCents, formatPercent, milestoneLabelWithAmount } from '../../../engine'
import { Card } from '../../components/primitives'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import { formatMoneyShort } from './chartTheme'
import { contributionPhrase } from './contributionText'
import { getNarrativeStats, type MilestoneStat } from './narrativeStats'
import styles from './goals.module.css'

interface GoalsNarrativeProps {
  draft: NewGoalScenario
  milestones: Milestone[]
  compact?: boolean
}

/** Prose for the narrated milestones, with a leading space, or '' when there are none. */
function milestoneSentences(
  stats: (MilestoneStat | null)[],
  short: (cents: number) => string,
): string {
  const parts = stats
    .filter((s): s is MilestoneStat => s != null)
    .map((s) => {
      const label = milestoneLabelWithAmount(s.milestone, short)
      return s.year != null
        ? `${label} invested lands around year ${s.year}.`
        : `${label} is not reached in the horizon.`
    })
  return parts.length > 0 ? ` ${parts.join(' ')}` : ''
}

interface PlanStat {
  label: string
  value: string
}

function CompactNarrative({
  draft,
  milestones,
}: {
  draft: NewGoalScenario
  milestones: Milestone[]
}) {
  const format = useMoneyFormat()
  const inflationRate = useAssumedInflation()
  const { end, next, fiYear } = getNarrativeStats(draft, milestones, inflationRate)
  const stats: PlanStat[] = [
    {
      label: `Net worth in ${draft.horizonYears} ${draft.horizonYears === 1 ? 'yr' : 'yrs'}`,
      value: formatCents(end?.netWorthCents ?? 0, format),
    },
    next?.year != null
      ? {
          label: `${milestoneLabelWithAmount(next.milestone, (c) => formatMoneyShort(c, format))} invested`,
          value: `Year ${next.year}`,
        }
      : null,
    fiYear != null ? { label: 'Financial independence', value: `Year ${fiYear}` } : null,
  ].filter((s): s is PlanStat => s != null)
  return (
    <>
      <span className={styles.chartFooterLabel}>Scenario summary</span>
      <div className={styles.statStrip}>
        {stats.map((s) => (
          <div key={s.label} className={styles.statItem}>
            <span className={styles.statValue}>{s.value}</span>
            <span className={styles.statLabel}>{s.label}</span>
          </div>
        ))}
      </div>
    </>
  )
}

function FullNarrative({
  draft,
  milestones,
}: {
  draft: NewGoalScenario
  milestones: Milestone[]
}) {
  const format = useMoneyFormat()
  const inflationRate = useAssumedInflation()
  const { end, next, top, fiYear, fiTarget } = getNarrativeStats(draft, milestones, inflationRate)
  const short = (c: number) => formatMoneyShort(c, format)
  return (
    <Card>
      <h3 className={styles.chartTitle}>What this means</h3>
      <p className={styles.narrative}>
        At {formatPercent(draft.expectedRealReturn, format)} real return and{' '}
        {contributionPhrase(draft, format)} invested, your portfolio reaches{' '}
        {formatCents(end?.investedCents ?? 0, format)} invested and{' '}
        {formatCents(end?.netWorthCents ?? 0, format)} net worth in {draft.horizonYears} years.
        {milestoneSentences([next, top], short)}
      </p>
      <p className={`${styles.narrative} ${styles.narrativeMuted}`}>
        FI target ({formatPercent(draft.safeWithdrawalRate, format)} SWR) is{' '}
        {formatCents(fiTarget, format)}
        {fiYear != null ? `, reachable around year ${fiYear}.` : ', not reached in the horizon.'}
      </p>
    </Card>
  )
}

export function GoalsNarrative({ draft, milestones, compact = false }: GoalsNarrativeProps) {
  return compact ? (
    <CompactNarrative draft={draft} milestones={milestones} />
  ) : (
    <FullNarrative draft={draft} milestones={milestones} />
  )
}
