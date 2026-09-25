import { useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import styles from './charts.module.css'
import { useDockedTooltip } from './useDockedTooltip'
import { useTooltipPosition } from './useTooltipPosition'
import { nudgeIntoBand, visibleBand, type TooltipSide } from './useTooltipSide'

export interface TooltipLine {
  label: string
  value: string
  color?: string | undefined
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
  /** Which side of the chart the phone tooltip opens on (see `useTooltipSide`). */
  side?: TooltipSide
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
            <span className={styles.tooltipLabel}>
              {line.color ? (
                <span className={styles.tooltipSwatch} style={{ background: line.color }} />
              ) : null}
              {line.label}
            </span>
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

/**
 * On a phone the tooltip is a panel on the chart's own edge, on the side with more room. It is
 * laid over the page rather than in it, so it takes no space and the chart never moves, and
 * it needs no scrolling to reach: tapping away to scroll is what closes it.
 */
function DockedTooltip({ title, lines, side }: Pick<Props, 'title' | 'lines'> & { side: TooltipSide }) {
  const ref = useRef<HTMLDivElement>(null)
  // A panel taller than the room on its side would sit under the header or the tab bar, out of
  // reach: it slides back into the free band, over the chart if it must. Set on the element
  // rather than in state so a tooltip that changes height as the point changes does not
  // render twice.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.transform = ''
    const shift = nudgeIntoBand(el.getBoundingClientRect(), visibleBand())
    if (shift !== 0) el.style.transform = `translateY(${shift}px)`
  })
  return (
    <div
      ref={ref}
      className={`${styles.tooltipDocked} ${side === 'above' ? styles.tooltipAbove : styles.tooltipBelow}`}
      role="tooltip"
    >
      <TooltipBody title={title} lines={lines} />
    </div>
  )
}

export function ChartTooltip({ title, lines, anchor, side = 'above' }: Props) {
  const docked = useDockedTooltip()

  if (docked) return <DockedTooltip title={title} lines={lines} side={side} />

  return <FloatingTooltip title={title} lines={lines} anchor={anchor} />
}
