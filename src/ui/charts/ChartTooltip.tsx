import { useContext, useLayoutEffect, useRef, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import styles from './charts.module.css'
import { TooltipVisibilityContext } from './tooltipVisibility'
import { useDockedTooltip } from './useDockedTooltip'
import { useInBand } from './useInBand'
import { useTooltipPosition } from './useTooltipPosition'
import { useTooltipSide } from './useTooltipSide'

/** How much of the tooltip has to be on screen for it to count as showing. */
const ON_SCREEN_SHARE = 0.4
/** How much of its chart has to be on screen for a phone tooltip to be shown at all. */
const CHART_ON_SCREEN_SHARE = 0.4

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
  /**
   * The chart a phone tooltip belongs to. It sits on the chart's edge, on the side with room
   * (see `useTooltipSide`), and is not shown while the chart is mostly off screen.
   */
  chart?: RefObject<HTMLElement | null>
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
 * On a phone the tooltip is a panel laid over the page rather than in it, so it takes no space and
 * the chart never moves, and it needs no scrolling to reach: tapping away to scroll is what
 * closes it. With room above the chart it sits against the chart's top edge and moves with it. With
 * more room below, it is pinned to the screen above the tab bar instead, so it stays where it can
 * be read while the page scrolls.
 *
 * Nothing about where it sits is stored. CSS puts it against the chart's edge or the screen's, and
 * the only choice, which of the two, is made again from where the chart is now. An offset worked
 * out when it opened would be wrong as soon as the page scrolled, and covered the chart or left
 * the panel out of reach.
 */
function DockedPanel({ title, lines, chart }: Pick<Props, 'title' | 'lines'> & { chart: Props['chart'] | undefined }) {
  const ref = useRef<HTMLDivElement>(null)
  const side = useTooltipSide(chart, ref, contentKey(title, lines))
  const pinned = side === 'below'
  // A fixed box is laid out against the screen, so it takes the chart's left and width by hand.
  // They only change when the screen does, never as the page scrolls.
  useLayoutEffect(() => {
    const el = ref.current
    const box = chart?.current
    if (!el) return undefined
    if (!pinned || !box) {
      el.style.left = ''
      el.style.width = ''
      return undefined
    }
    const across = () => {
      const r = box.getBoundingClientRect()
      el.style.left = `${r.left}px`
      el.style.width = `${r.width}px`
    }
    across()
    window.addEventListener('resize', across)
    return () => window.removeEventListener('resize', across)
  }, [chart, pinned])
  // Tells the chart's owner whether it is showing, and that it is gone once it closes. Before
  // paint: after it, the owner's legend would keep its figures for a frame beside the panel.
  const onScreen = useInBand(ref, ON_SCREEN_SHARE)
  const report = useContext(TooltipVisibilityContext)
  useLayoutEffect(() => {
    report?.(onScreen)
    return () => report?.(false)
  }, [report, onScreen])
  return (
    <div
      ref={ref}
      className={`${styles.tooltipDocked} ${pinned ? styles.tooltipPinned : styles.tooltipAbove}`}
      role="tooltip"
    >
      <TooltipBody title={title} lines={lines} />
    </div>
  )
}

function DockedTooltip({ title, lines, chart }: Pick<Props, 'title' | 'lines'> & { chart: Props['chart'] | undefined }) {
  // A panel is only as useful as the chart it belongs to: with the chart scrolled away it would
  // hang over whatever is there now. Where nothing can be observed it is shown.
  const chartOnScreen = useInBand(chart, CHART_ON_SCREEN_SHARE, { enabled: chart !== undefined, fallback: true })
  if (chart !== undefined && !chartOnScreen) return null
  return <DockedPanel title={title} lines={lines} chart={chart} />
}

export function ChartTooltip({ title, lines, anchor, chart }: Props) {
  const docked = useDockedTooltip()

  if (docked) return <DockedTooltip title={title} lines={lines} chart={chart} />

  return <FloatingTooltip title={title} lines={lines} anchor={anchor} />
}
