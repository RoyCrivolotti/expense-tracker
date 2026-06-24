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

function CompactNarrative({ draft }: { draft: NewGoalScenario }) {
  const { end, y500, fiYear } = getNarrativeStats(draft)
  const parts = [
    `${formatCents(end?.netWorthCents ?? 0)} net worth in ${draft.horizonYears} yrs`,
    y500 != null ? `€500k at yr ${y500}` : null,
    fiYear != null ? `FI at yr ${fiYear}` : null,
  ].filter(Boolean)
  return (
    <>
      <span className={styles.chartFooterLabel}>Current plan summary</span>
      <p className={styles.summaryLine}>{parts.join(' · ')}</p>
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
