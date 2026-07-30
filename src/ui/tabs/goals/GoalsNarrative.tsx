import type { NewGoalScenario } from '../../../data/dataSource'
import type { Milestone } from '../../../types'
import {
  fireNumber,
  formatCents,
  formatPercent,
  milestoneLabelWithAmount,
  projectNetWorth,
  scenarioToParams,
  yearsToFi,
  yearsToTargetFromProjection,
} from '../../../engine'
import { Card } from '../../components/primitives'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import { formatMoneyShort } from './chartTheme'
import styles from './goals.module.css'

interface GoalsNarrativeProps {
  draft: NewGoalScenario
  milestones: Milestone[]
  compact?: boolean
}

interface MilestoneStat {
  milestone: Milestone
  year: number | null
}

/**
 * The two milestones worth narrating: the next one the plan should cross, and
 * the top of the ladder. Collapses to one when the next milestone is the top.
 */
function narrativeMilestones(draft: NewGoalScenario, milestones: Milestone[]) {
  const params = scenarioToParams({ ...draft, id: 0 })
  const toStat = (milestone: Milestone): MilestoneStat => ({
    milestone,
    year: yearsToTargetFromProjection(params, milestone.amountCents, false),
  })
  const next = milestones.find((m) => m.amountCents > draft.startInvestedCents) ?? null
  const last = milestones[milestones.length - 1] ?? null
  const top = last && last.amountCents !== next?.amountCents ? last : null
  return { next: next ? toStat(next) : null, top: top ? toStat(top) : null }
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

function getNarrativeStats(draft: NewGoalScenario, milestones: Milestone[]) {
  const params = scenarioToParams({ ...draft, id: 0 })
  const series = projectNetWorth(params)
  const end = series[series.length - 1]
  const fiYear = yearsToFi(params, draft.annualSpendCents, draft.safeWithdrawalRate)
  const fiTarget = fireNumber(draft.annualSpendCents, draft.safeWithdrawalRate)
  return { end, fiYear, fiTarget, ...narrativeMilestones(draft, milestones) }
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
  const { end, next, fiYear } = getNarrativeStats(draft, milestones)
  const stats: PlanStat[] = [
    {
      label: `Net worth in ${draft.horizonYears} yrs`,
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
      <span className={styles.chartFooterLabel}>Current plan summary</span>
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
  const { end, next, top, fiYear, fiTarget } = getNarrativeStats(draft, milestones)
  const short = (c: number) => formatMoneyShort(c, format)
  return (
    <Card>
      <h3 className={styles.chartTitle}>What this means</h3>
      <p className={styles.narrative}>
        At {formatPercent(draft.expectedRealReturn, format)} real return and{' '}
        {formatCents(draft.monthlyContributionCents, format)}/mo invested, your portfolio reaches{' '}
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
