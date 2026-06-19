import styles from './charts.module.css'
import { useTooltipClamp } from './useTooltipClamp'

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
  const contentKey = `${title}|${lines.map((line) => `${line.label}:${line.value}`).join('|')}`
  const { ref, shiftX } = useTooltipClamp(clamped, contentKey)

  return (
    <div
      ref={ref}
      className={styles.tooltip}
      style={{ left: `${clamped}%`, transform: `translateX(calc(-50% + ${shiftX}px))` }}
      role="tooltip"
    >
      <p className={styles.tooltipTitle}>{title}</p>
      <ul className={styles.tooltipList}>
        {lines.map((line) => (
          <li key={line.label} className={styles[`tooltip_${line.tone ?? 'neutral'}`]}>
            <span className={styles.tooltipLabel}>{line.label}</span>
            <span className={styles.tooltipValue}>{line.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
