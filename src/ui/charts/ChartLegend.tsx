import styles from './ChartLegend.module.css'

export interface LegendItem {
  label: string
  color: string
}

/** Shared color key for charts: a swatch + label per series. */
export function ChartLegend({ items }: { items: LegendItem[] }) {
  if (items.length === 0) return null
  return (
    <ul className={styles.legend}>
      {items.map((item) => (
        <li key={item.label} className={styles.item}>
          <span className={styles.swatch} style={{ background: item.color }} aria-hidden />
          {item.label}
        </li>
      ))}
    </ul>
  )
}
