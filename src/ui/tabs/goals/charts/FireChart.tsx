import {
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { NewGoalScenario } from '../../../../data/dataSource'
import {
  fireNumber,
  projectDrawdown,
  projectNetWorth,
  scenarioToParams,
  yearsToFi,
} from '../../../../engine'
import { Card } from '../../../components/primitives'
import { GOAL_CHART_MARGIN, chartTooltipStyle, formatEuroShort } from '../chartTheme'
import styles from '../goals.module.css'

export function FireChart({ draft }: { draft: NewGoalScenario }) {
  const params = scenarioToParams({ ...draft, id: 0 })
  const fiTarget = fireNumber(draft.annualSpendCents, draft.safeWithdrawalRate)
  const fiYear = yearsToFi(params, draft.annualSpendCents, draft.safeWithdrawalRate)
  const growth = projectNetWorth(params)
  const fiPortfolio = fiYear != null ? growth[fiYear]?.netWorthCents ?? fiTarget : fiTarget
  const drawdown = projectDrawdown(
    fiPortfolio,
    draft.annualSpendCents,
    draft.expectedRealReturn,
    Math.min(30, draft.horizonYears),
  )
  const data = drawdown.map((bal, year) => ({ year, balance: bal }))

  return (
    <Card className={styles.chartCard}>
      <h3 className={styles.chartTitle}>FIRE drawdown</h3>
      <p className={styles.chartHint}>
        FI target {formatEuroShort(fiTarget)}
        {fiYear != null ? ` · reached year ${fiYear}` : ' · not reached in horizon'}.
        Post-FI portfolio with constant real withdrawal.
      </p>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={GOAL_CHART_MARGIN}>
          <XAxis dataKey="year" tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={formatEuroShort} tick={{ fontSize: 11 }} width={56} />
          <Tooltip formatter={(v: number) => formatEuroShort(v)} contentStyle={chartTooltipStyle()} />
          <ReferenceLine y={fiTarget} stroke="#7c3aed" strokeDasharray="4 4" />
          <Line type="monotone" dataKey="balance" stroke="#8b5cf6" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  )
}
