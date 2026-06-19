import styles from './charts.module.css'

export interface TooltipLine {
  label: string
  value: string
  tone?: 'income' | 'expense' | 'neutral'
}

interface Props {
  title: string
  lines: TooltipLine[]
  leftPct: number
}

export function ChartTooltip({ title, lines, leftPct }: Props) {
  const clamped = Math.min(92, Math.max(8, leftPct))
  return (
    <div
      className={styles.tooltip}
      style={{ left: `${clamped}%` }}
      role="tooltip"
    >
      <p className={styles.tooltipTitle}>{title}</p>
      <ul className={styles.tooltipList}>
        {lines.map((line) => (
          <li key={line.label} className={styles[`tooltip_${line.tone ?? 'neutral'}`]}>
            <span>{line.label}</span>
            <span>{line.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
