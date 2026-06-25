import { createPortal } from 'react-dom'
import styles from './charts.module.css'
import { useDockedTooltip } from './useDockedTooltip'
import { useTooltipPosition } from './useTooltipPosition'

export interface TooltipLine {
  label: string
  value: string
  tone?: 'income' | 'expense' | 'neutral'
  variant?: 'default' | 'detail'
}

interface Anchor {
  x: number
  y: number
}

interface Props {
  title: string
  lines: TooltipLine[]
  anchor: Anchor | null
}

function TooltipBody({ title, lines }: Pick<Props, 'title' | 'lines'>) {
  return (
    <>
      <p className={styles.tooltipTitle}>{title}</p>
      <ul className={styles.tooltipList}>
        {lines.map((line) => (
          <li
            key={line.label}
            className={`${styles[`tooltip_${line.tone ?? 'neutral'}`]}${line.variant === 'detail' ? ` ${styles.tooltipDetail}` : ''}`}
          >
            <span className={styles.tooltipLabel}>{line.label}</span>
            <span className={styles.tooltipValue}>{line.value}</span>
          </li>
        ))}
      </ul>
    </>
  )
}

function contentKey(title: string, lines: TooltipLine[]) {
  return `${title}|${lines.map((line) => `${line.label}:${line.value}`).join('|')}`
}

function FloatingTooltip({ title, lines, anchor }: Props) {
  const key = contentKey(title, lines)
  const { ref, pos } = useTooltipPosition(anchor?.x ?? null, anchor?.y ?? null, key)

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={ref}
      className={styles.tooltipFixed}
      style={{
        left: pos?.left ?? 0,
        top: pos?.top ?? 0,
        visibility: pos ? 'visible' : 'hidden',
      }}
      role="tooltip"
    >
      <TooltipBody title={title} lines={lines} />
    </div>,
    document.body,
  )
}

export function ChartTooltip({ title, lines, anchor }: Props) {
  const docked = useDockedTooltip()

  if (docked) {
    return (
      <div className={styles.tooltipDocked} role="tooltip">
        <TooltipBody title={title} lines={lines} />
      </div>
    )
  }

  return <FloatingTooltip title={title} lines={lines} anchor={anchor} />
}
