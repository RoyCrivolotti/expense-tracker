import type { NewGoalScenario } from '../../../data/dataSource'
import { useAssumedInflation } from '../..//hooks/assumedInflationContext'
import type { Milestone } from '../../../types'
import { formatCents, formatPercent, milestoneLabelWithAmount, type MoneyFormat } from '../../../engine'
import { Card } from '../../components/primitives'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import { formatMoneyShort } from './chartTheme'
import { aboutOnAccount, bothMoneys, bothMoneysTail } from './bothMoneys'
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
  /** Under the label, for a figure that needs its money said. */
  note?: string
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
  const worth = bothMoneys({
    cents: end?.netWorthCents ?? 0,
    years: end?.year ?? 0,
    planStartDate: draft.planStartDate,
    inflationRate,
    money: (cents) => formatMoneyShort(cents, format),
  })
  const stats: PlanStat[] = [
    {
      label: `Net worth in ${draft.horizonYears} ${draft.horizonYears === 1 ? 'yr' : 'yrs'}`,
      value: formatCents(end?.netWorthCents ?? 0, format),
      note: bothMoneysTail(worth),
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
            {s.note ? <span className={styles.statLabel}>{s.note}</span> : null}
          </div>
        ))}
      </div>
    </>
  )
}

/**
 * The FI target in the plan's euros and on the account at the point of the plan it is read at: the year it is
 * reached, or the end of the plan when it never is.
 */
function fiSentence({
  draft,
  fiTarget,
  fiYear,
  lastYear,
  inflationRate,
  format,
}: {
  draft: NewGoalScenario
  fiTarget: number
  fiYear: number | null
  lastYear: number
  inflationRate: number
  format: MoneyFormat
}): string {
  const target = bothMoneys({
    cents: fiTarget,
    years: fiYear ?? lastYear,
    planStartDate: draft.planStartDate,
    inflationRate,
    money: (c) => formatMoneyShort(c, format),
  })
  const reached =
    fiYear != null
      ? `reachable around year ${fiYear} (${aboutOnAccount(target)})`
      : `not reached in the horizon (${aboutOnAccount(target)}, when the plan ends)`
  return `FI target (${formatPercent(draft.safeWithdrawalRate, format)} SWR) is ${formatCents(fiTarget, format)} in ${target.planLabel}, ${reached}.`
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
  const planStartDate = draft.planStartDate
  const worth = bothMoneys({
    cents: end?.netWorthCents ?? 0,
    years: end?.year ?? 0,
    planStartDate,
    inflationRate,
    money: (c) => formatCents(c, format),
  })
  return (
    <Card>
      <h3 className={styles.chartTitle}>What this means</h3>
      <p className={styles.narrative}>
        At {formatPercent(draft.expectedRealReturn, format)} real return and{' '}
        {contributionPhrase(draft, format)} invested, your portfolio reaches{' '}
        {formatCents(end?.investedCents ?? 0, format)} invested and{' '}
        {formatCents(end?.netWorthCents ?? 0, format)} net worth in {draft.horizonYears} years, in {worth.planLabel}{' '}
        (the net worth is {aboutOnAccount(worth)}).
        {milestoneSentences([next, top], short)}
      </p>
      <p className={`${styles.narrative} ${styles.narrativeMuted}`}>
        {fiSentence({ draft, fiTarget, fiYear, lastYear: end?.year ?? 0, inflationRate, format })}
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
