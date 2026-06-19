import { useMemo, useState } from 'react'
import type { ExpenseModel } from '../useExpenseData'
import { computeCategoryActuals } from '../../engine'
import { CategoryPieChartView, type PieSlice } from './CategoryPieChartView'
import styles from './charts.module.css'

const SIZE = 220
const R = 80
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

function buildSlices(model: ExpenseModel, month: string): PieSlice[] | null {
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
  return positive.map((s, i) => {
    const start = angle
    const sweep = (s.cents / total) * Math.PI * 2
    angle += sweep
    const mid = start + sweep / 2
    return {
      ...s,
      d: arcPath(start, angle),
      color: SLICE_COLORS[i % SLICE_COLORS.length] ?? 'var(--chart-1)',
      total,
      labelX: CX + R * 0.55 * Math.cos(mid),
      labelY: CY + R * 0.55 * Math.sin(mid),
    }
  })
}

interface Props {
  model: ExpenseModel
  month: string
}

/** Expense share by category for the selected budget month. */
export function CategoryPieChart({ model, month }: Props) {
  const paths = useMemo(() => buildSlices(model, month), [model, month])
  const [active, setActive] = useState<number | null>(null)

  if (!paths) return null

  return (
    <figure className={styles.figure}>
      <figcaption className={styles.caption}>Expenses by category ({month})</figcaption>
      <CategoryPieChartView
        paths={paths}
        active={active}
        onShow={setActive}
        onHide={() => setActive(null)}
        onTouchEnd={() => window.setTimeout(() => setActive(null), 2800)}
      />
    </figure>
  )
}
