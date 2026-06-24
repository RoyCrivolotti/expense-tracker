import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { NewGoalScenario } from '../../../../data/dataSource'
import { projectNetWorth, scenarioToParams } from '../../../../engine'
import { Card } from '../../../components/primitives'
import { GOAL_CHART_MARGIN, chartTooltipStyle, formatEuroShort } from '../chartTheme'
import styles from '../goals.module.css'

export function CompositionChart({ draft }: { draft: NewGoalScenario }) {
  const data = projectNetWorth(scenarioToParams({ ...draft, id: 0 })).map((p) => ({
    year: p.year,
    invested: p.investedCents,
    house: p.houseEquityCents,
    mortgage: -p.mortgageBalanceCents,
    netWorth: p.netWorthCents,
  }))

  return (
    <Card className={styles.chartCard}>
      <h3 className={styles.chartTitle}>Net worth composition</h3>
      <p className={styles.chartHint}>
        Invested portfolio + house equity − mortgage for the scenario you are editing.
      </p>
      <div className={styles.chartWrap} style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={GOAL_CHART_MARGIN}>
          <XAxis dataKey="year" tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={formatEuroShort} tick={{ fontSize: 11 }} width={56} />
          <Tooltip formatter={(v: number) => formatEuroShort(Math.abs(v))} contentStyle={chartTooltipStyle()} />
          <Area type="monotone" dataKey="invested" stackId="1" stroke="#6366f1" fill="#6366f1" fillOpacity={0.5} />
          <Area type="monotone" dataKey="house" stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.4} />
          <Area type="monotone" dataKey="mortgage" stackId="1" stroke="#ef4444" fill="#ef4444" fillOpacity={0.3} />
        </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
