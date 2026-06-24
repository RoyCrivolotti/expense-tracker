import type { NewGoalScenario } from '../../../data/dataSource'
import {
  fireNumber,
  formatCents,
  formatPercent,
  projectNetWorth,
  scenarioToParams,
  yearsToFi,
  yearsToTargetFromProjection,
} from '../../../engine'
import { Card } from '../../components/primitives'
import styles from './goals.module.css'

interface GoalsNarrativeProps {
  draft: NewGoalScenario
  compact?: boolean
}

function getNarrativeStats(draft: NewGoalScenario) {
  const params = scenarioToParams({ ...draft, id: 0 })
  const series = projectNetWorth(params)
  const end = series[series.length - 1]
  const y500 = yearsToTargetFromProjection(params, 50_000_000, false)
  const y1m = yearsToTargetFromProjection(params, 100_000_000, false)
  const fiYear = yearsToFi(params, draft.annualSpendCents, draft.safeWithdrawalRate)
  const fiTarget = fireNumber(draft.annualSpendCents, draft.safeWithdrawalRate)
  return { end, y500, y1m, fiYear, fiTarget }
}

interface PlanStat {
  label: string
  value: string
}

function CompactNarrative({ draft }: { draft: NewGoalScenario }) {
  const { end, y500, fiYear } = getNarrativeStats(draft)
  const stats: PlanStat[] = [
    { label: `Net worth in ${draft.horizonYears} yrs`, value: formatCents(end?.netWorthCents ?? 0) },
    y500 != null ? { label: '€500k invested', value: `Year ${y500}` } : null,
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

function FullNarrative({ draft }: { draft: NewGoalScenario }) {
  const { end, y500, y1m, fiYear, fiTarget } = getNarrativeStats(draft)
  return (
    <Card>
      <h3 className={styles.chartTitle}>What this means</h3>
      <p className={styles.narrative}>
        At {formatPercent(draft.expectedRealReturn)} real return and{' '}
        {formatCents(draft.monthlyContributionCents)}/mo invested, your portfolio reaches{' '}
        {formatCents(end?.investedCents ?? 0)} invested and{' '}
        {formatCents(end?.netWorthCents ?? 0)} net worth in {draft.horizonYears} years.
        {y500 != null ? ` €500k invested lands around year ${y500}.` : ' €500k is not reached in the horizon.'}
        {y1m != null ? ` €1M around year ${y1m}.` : ''}
      </p>
      <p className={`${styles.narrative} ${styles.narrativeMuted}`}>
        FI target ({formatPercent(draft.safeWithdrawalRate)} SWR) is {formatCents(fiTarget)}
        {fiYear != null ? `, reachable around year ${fiYear}.` : ', not reached in the horizon.'}
      </p>
    </Card>
  )
}

export function GoalsNarrative({ draft, compact = false }: GoalsNarrativeProps) {
  return compact ? <CompactNarrative draft={draft} /> : <FullNarrative draft={draft} />
}
