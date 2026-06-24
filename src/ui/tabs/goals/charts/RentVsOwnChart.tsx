import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { NewGoalScenario } from '../../../../data/dataSource'
import { formatCents, monthlyMortgageCents, scenarioToParams } from '../../../../engine'
import { Card } from '../../../components/primitives'
import { GOAL_CHART_MARGIN, chartTooltipStyle } from '../chartTheme'
import styles from '../goals.module.css'

export function RentVsOwnChart({ draft }: { draft: NewGoalScenario }) {
  const params = scenarioToParams({ ...draft, id: 0 })
  const mortgage = monthlyMortgageCents(params)
  const data = [
    { label: 'Rent', monthly: draft.rentMonthlyCents },
    { label: 'Mortgage', monthly: mortgage },
  ]

  return (
    <Card className={styles.chartCard}>
      <h3 className={styles.chartTitle}>Rent vs own (monthly)</h3>
      <p className={styles.chartHint}>
        Mortgage payment at purchase vs current rent assumption.
      </p>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} margin={GOAL_CHART_MARGIN}>
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={(v: number) => formatCents(v)} tick={{ fontSize: 11 }} width={56} />
          <Tooltip
            formatter={(v: number | string) => formatCents(Number(v))}
            contentStyle={chartTooltipStyle()}
          />
          <Bar dataKey="monthly" fill="var(--color-accent)" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  )
}
