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
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import { formatMoneyShort } from './chartTheme'
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
  const format = useMoneyFormat()
  const { end, y500, fiYear } = getNarrativeStats(draft)
  const stats: PlanStat[] = [
    {
      label: `Net worth in ${draft.horizonYears} yrs`,
      value: formatCents(end?.netWorthCents ?? 0, format),
    },
    y500 != null
      ? { label: `${formatMoneyShort(50_000_000, format)} invested`, value: `Year ${y500}` }
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

function FullNarrative({ draft }: { draft: NewGoalScenario }) {
  const format = useMoneyFormat()
  const { end, y500, y1m, fiYear, fiTarget } = getNarrativeStats(draft)
  const label500k = formatMoneyShort(50_000_000, format)
  const label1m = formatMoneyShort(100_000_000, format)
  return (
    <Card>
      <h3 className={styles.chartTitle}>What this means</h3>
      <p className={styles.narrative}>
        At {formatPercent(draft.expectedRealReturn, format)} real return and{' '}
        {formatCents(draft.monthlyContributionCents, format)}/mo invested, your portfolio reaches{' '}
        {formatCents(end?.investedCents ?? 0, format)} invested and{' '}
        {formatCents(end?.netWorthCents ?? 0, format)} net worth in {draft.horizonYears} years.
        {y500 != null
          ? ` ${label500k} invested lands around year ${y500}.`
          : ` ${label500k} is not reached in the horizon.`}
        {y1m != null ? ` ${label1m} around year ${y1m}.` : ''}
      </p>
      <p className={`${styles.narrative} ${styles.narrativeMuted}`}>
        FI target ({formatPercent(draft.safeWithdrawalRate, format)} SWR) is{' '}
        {formatCents(fiTarget, format)}
        {fiYear != null ? `, reachable around year ${fiYear}.` : ', not reached in the horizon.'}
      </p>
    </Card>
  )
}

export function GoalsNarrative({ draft, compact = false }: GoalsNarrativeProps) {
  return compact ? <CompactNarrative draft={draft} /> : <FullNarrative draft={draft} />
}
