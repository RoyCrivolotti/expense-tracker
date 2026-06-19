import { useMemo } from 'react'
import type { ExpenseModel } from '../useExpenseData'
import { computeCategoryActuals } from '../../engine'
import { formatCents } from '../../engine/money'
import styles from './charts.module.css'

const SIZE = 200
const R = 72
const CX = SIZE / 2
const CY = SIZE / 2

const SLICE_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
  'var(--chart-7)',
  'var(--chart-8)',
]

function arcPath(startAngle: number, endAngle: number): string {
  const x1 = CX + R * Math.cos(startAngle)
  const y1 = CY + R * Math.sin(startAngle)
  const x2 = CX + R * Math.cos(endAngle)
  const y2 = CY + R * Math.sin(endAngle)
  const large = endAngle - startAngle > Math.PI ? 1 : 0
  return `M ${CX} ${CY} L ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} Z`
}

function buildSlices(model: ExpenseModel, month: string) {
  const actuals = computeCategoryActuals(model.dataset.transactions, model.dataset.categories, {
    includeForecast: true,
  })
  const positive = actuals
    .map((a) => ({ name: a.name, cents: a.byMonth.get(month) ?? 0 }))
    .filter((s) => s.cents > 0)
    .sort((a, b) => b.cents - a.cents)
  const total = positive.reduce((s, x) => s + x.cents, 0)
  if (total === 0) return null

  let angle = -Math.PI / 2
  const paths = positive.map((s, i) => {
    const start = angle
    const sweep = (s.cents / total) * Math.PI * 2
    angle += sweep
    return {
      ...s,
      d: arcPath(start, angle),
      color: SLICE_COLORS[i % SLICE_COLORS.length] ?? SLICE_COLORS[0],
      total,
    }
  })
  return paths
}

interface Props {
  model: ExpenseModel
  month: string
}

/** Expense share by category for the selected budget month. */
export function CategoryPieChart({ model, month }: Props) {
  const paths = useMemo(() => buildSlices(model, month), [model, month])
  if (!paths) return null
  const total = paths[0]?.total ?? 1

  return (
    <figure className={styles.figure}>
      <figcaption className={styles.caption}>Expenses by category ({month})</figcaption>
      <div className={styles.pieRow}>
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className={styles.pieSvg} role="img" aria-label="Category expense pie chart">
          {paths.map((p) => (
            <path key={p.name} d={p.d} fill={p.color} />
          ))}
        </svg>
        <ul className={styles.pieLegend}>
          {paths.map((p) => (
            <li key={p.name}>
              <span className={styles.swatch} style={{ background: p.color }} />
              {p.name}{' '}
              <span className={styles.muted}>
                {formatCents(p.cents)} ({Math.round((p.cents / total) * 100)}%)
              </span>
            </li>
          ))}
        </ul>
      </div>
    </figure>
  )
}
