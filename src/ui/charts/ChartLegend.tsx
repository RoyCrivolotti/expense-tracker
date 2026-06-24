import styles from './ChartLegend.module.css'

export interface LegendItem {
  label: string
  color: string
}

/**
 * Shared color key for charts: a swatch + label per series.
 * `wrap` (default) flows items horizontally; `stack` puts one per line, which
 * reads better when labels are long (e.g. named scenarios).
 */
export function ChartLegend({
  items,
  variant = 'wrap',
}: {
  items: LegendItem[]
  variant?: 'wrap' | 'stack'
}) {
  if (items.length === 0) return null
  const className = variant === 'stack' ? `${styles.legend} ${styles.legendStack}` : styles.legend
  return (
    <ul className={className}>
      {items.map((item) => (
        <li key={item.label} className={styles.item}>
          <span className={styles.swatch} style={{ background: item.color }} aria-hidden />
          {item.label}
        </li>
      ))}
    </ul>
  )
}
