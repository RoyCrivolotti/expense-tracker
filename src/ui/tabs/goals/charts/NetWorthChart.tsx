import { memo, useMemo } from 'react'
import {
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { GoalScenario } from '../../../../types'
import type { NewGoalScenario } from '../../../../data/dataSource'
import { scenarioToParams, projectNetWorth } from '../../../../engine'
import { MILESTONE_CENTS } from '../../../../engine'
import { Card } from '../../../components/primitives'
import { GOAL_CHART_MARGIN, chartTooltipStyle, formatEuroShort } from '../chartTheme'
import styles from '../goals.module.css'

interface LineDef {
  id: string
  name: string
  color: string
  points: { year: number; invested: number }[]
}

function buildLines(saved: GoalScenario[], draft: NewGoalScenario): LineDef[] {
  const lines: LineDef[] = saved.map((s) => {
    const series = projectNetWorth(scenarioToParams(s))
    return {
      id: `saved-${s.id}`,
      name: s.name,
      color: s.color,
      points: series.map((p) => ({ year: p.year, invested: p.investedCents })),
    }
  })
  const draftSeries = projectNetWorth(scenarioToParams({ ...draft, id: 0 }))
  lines.push({
    id: 'draft',
    name: `${draft.name} (editing)`,
    color: draft.color,
    points: draftSeries.map((p) => ({ year: p.year, invested: p.investedCents })),
  })
  return lines
}

function mergedChartData(lines: LineDef[]) {
  const years = lines[0]?.points.map((p) => p.year) ?? []
  return years.map((year) => {
    const row: Record<string, number> = { year }
    lines.forEach((line) => {
      row[line.id] = line.points.find((p) => p.year === year)?.invested ?? 0
    })
    return row
  })
}

function NetWorthChartImpl({
  scenarios,
  draft,
  variant = 'default',
}: {
  scenarios: GoalScenario[]
  draft: NewGoalScenario
  variant?: 'default' | 'hero'
}) {
  const lines = useMemo(() => buildLines(scenarios, draft), [scenarios, draft])
  const data = useMemo(() => mergedChartData(lines), [lines])
  const isHero = variant === 'hero'
  const cardClass = isHero ? `${styles.chartCard} ${styles.heroChart}` : styles.chartCard
  const height = isHero ? 'clamp(220px, 40dvh, 320px)' : 300

  return (
    <Card className={cardClass}>
      <h3 className={styles.chartTitle}>Invested portfolio projection</h3>
      {!isHero ? (
        <p className={styles.chartHint}>
          Compare saved scenarios plus your live edits. House purchase shows as a dip.
        </p>
      ) : null}
      <div className={styles.chartWrap} style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={GOAL_CHART_MARGIN}>
            <XAxis dataKey="year" tick={{ fontSize: 11 }} label={{ value: 'Years', fontSize: 11, dy: 8 }} />
            <YAxis tickFormatter={formatEuroShort} tick={{ fontSize: 11 }} width={48} />
            <Tooltip
              formatter={(v: number) => formatEuroShort(v)}
              contentStyle={chartTooltipStyle()}
            />
            {MILESTONE_CENTS.filter((m) => m <= 100_000_000).map((m) => (
              <ReferenceLine key={m} y={m} stroke="var(--color-border)" strokeDasharray="4 4" />
            ))}
            {lines.map((line) => (
              <Line
                key={line.id}
                type="monotone"
                dataKey={line.id}
                name={line.name}
                stroke={line.color}
                strokeWidth={line.id === 'draft' ? 2.5 : 2}
                strokeDasharray={line.id === 'draft' ? '6 4' : undefined}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

export const NetWorthChart = memo(NetWorthChartImpl)
