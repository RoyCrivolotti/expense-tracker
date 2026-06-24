import type { NewGoalScenario } from '../../../data/dataSource'
import {
  fireNumber,
  formatCents,
  formatPercent,
  monthlyMortgageCents,
  projectNetWorth,
  scenarioToParams,
  yearsToFi,
  yearsToTargetFromProjection,
} from '../../../engine'
import { Card } from '../../components/primitives'
import styles from './goals.module.css'

export function GoalsNarrative({ draft }: { draft: NewGoalScenario }) {
  const params = scenarioToParams({ ...draft, id: 0 })
  const series = projectNetWorth(params)
  const end = series[series.length - 1]
  const y500 = yearsToTargetFromProjection(params, 50_000_000, false)
  const y1m = yearsToTargetFromProjection(params, 100_000_000, false)
  const fiYear = yearsToFi(params, draft.annualSpendCents, draft.safeWithdrawalRate)
  const fiTarget = fireNumber(draft.annualSpendCents, draft.safeWithdrawalRate)
  const mortgage = monthlyMortgageCents(params)

  const purchaseNote =
    draft.housePurchaseYear === null
      ? 'You never buy in this scenario — rent continues.'
      : draft.housePurchaseYear === 0
        ? 'You own from day one; starting invested already reflects the down payment.'
        : `You buy in year ${draft.housePurchaseYear}, withdrawing down payment and costs from the portfolio.`

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
        {purchaseNote} Mortgage ≈ {formatCents(mortgage)}/mo vs rent {formatCents(draft.rentMonthlyCents)}/mo.
        FI target ({formatPercent(draft.safeWithdrawalRate)} SWR on {formatCents(draft.annualSpendCents)}/yr spend)
        is {formatCents(fiTarget)}
        {fiYear != null ? `, reachable around year ${fiYear}.` : ', not reached in the horizon.'}
      </p>
    </Card>
  )
}
