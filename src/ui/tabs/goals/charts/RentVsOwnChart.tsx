import { memo, useMemo } from 'react'
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

function RentVsOwnChartImpl({ draft }: { draft: NewGoalScenario }) {
  const data = useMemo(() => {
    const mortgage = monthlyMortgageCents(scenarioToParams({ ...draft, id: 0 }))
    return [
      { label: 'Rent', monthly: draft.rentMonthlyCents },
      { label: 'Mortgage', monthly: mortgage },
    ]
  }, [draft])

  return (
    <Card className={styles.chartCard}>
      <h3 className={styles.chartTitle}>Rent vs own (monthly)</h3>
      <p className={styles.chartHint}>
        Mortgage payment at purchase vs current rent assumption.
      </p>
      <div className={styles.chartWrap} style={{ height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={GOAL_CHART_MARGIN}>
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={(v: number) => formatCents(v)} tick={{ fontSize: 11 }} width={48} />
          <Tooltip
            formatter={(v: number | string) => formatCents(Number(v))}
            contentStyle={chartTooltipStyle()}
          />
          <Bar dataKey="monthly" fill="var(--color-accent)" radius={[6, 6, 0, 0]} />
        </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

export const RentVsOwnChart = memo(RentVsOwnChartImpl)
