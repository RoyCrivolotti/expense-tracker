import { memo, useMemo } from 'react'
import type { NewGoalScenario } from '../../../../data/dataSource'
import { formatCents, monthlyMortgageCents, scenarioToParams } from '../../../../engine'
import { Card } from '../../../components/primitives'
import { ChartGrid, ChartXLabels } from '../../../charts/linearChartParts'
import { makeScale, niceScale } from '../../../charts/linearScale'
import { formatEuroShort } from '../chartTheme'
import chartStyles from '../../../charts/charts.module.css'
import styles from '../goals.module.css'

const W = 360
const H = 180
const PAD = { top: 22, right: 16, bottom: 28, left: 56 }

function RentVsOwnChartImpl({ draft }: { draft: NewGoalScenario }) {
  const data = useMemo(() => {
    const mortgage = monthlyMortgageCents(scenarioToParams({ ...draft, id: 0 }))
    return [
      { label: 'Rent', value: draft.rentMonthlyCents },
      { label: 'Mortgage', value: mortgage },
    ]
  }, [draft])

  const innerH = H - PAD.top - PAD.bottom
  const innerW = W - PAD.left - PAD.right
  const nice = niceScale(0, Math.max(1, ...data.map((d) => d.value)))
  const scaleY = makeScale(nice.min, nice.max, PAD.top + innerH, PAD.top)
  const step = innerW / data.length
  const barW = Math.min(64, step * 0.5)
  const xForIndex = (i: number) => PAD.left + step * i + step / 2

  return (
    <Card className={styles.chartCard}>
      <h3 className={styles.chartTitle}>Rent vs own (monthly)</h3>
      <p className={styles.chartHint}>Mortgage payment at purchase vs current rent assumption.</p>
      <div className={chartStyles.chartWrap}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className={chartStyles.svg}
          role="img"
          aria-label="Monthly rent versus mortgage payment"
        >
          <ChartGrid
            ticks={nice.ticks}
            scaleY={scaleY}
            x0={PAD.left}
            x1={W - PAD.right}
            formatValue={formatEuroShort}
          />
          {data.map((d, i) => {
            const y = scaleY(d.value)
            return (
              <g key={d.label}>
                <rect
                  x={xForIndex(i) - barW / 2}
                  y={y}
                  width={barW}
                  height={scaleY(0) - y}
                  rx={5}
                  fill="var(--color-accent)"
                />
                <text
                  x={xForIndex(i)}
                  y={y - 6}
                  textAnchor="middle"
                  className={chartStyles.axisLabel}
                >
                  {formatCents(d.value)}
                </text>
              </g>
            )
          })}
          <ChartXLabels
            labels={data.map((d) => d.label)}
            xForIndex={xForIndex}
            y={H - 8}
          />
        </svg>
      </div>
    </Card>
  )
}

export const RentVsOwnChart = memo(RentVsOwnChartImpl)
