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
  /**
   * Whether the docked panel may sit below the chart. False for a chart with its own
   * always-present readout to fall back to (see `DockedPanel`): below, the panel stays mounted
   * but invisible, and that readout is what shows instead. Defaults to true.
   */
  dockBelow?: boolean | undefined
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
 * laid over the page rather than in it, so it takes no space and the chart never moves, and it
 * needs no scrolling to reach: tapping away to scroll is what closes it.
 *
 * Nothing about where it sits is stored. CSS puts it against the chart's edge, so it moves with
 * the chart, and the only choice, which edge, is made again from where the chart is now. An
 * offset worked out when it opened would be wrong as soon as the page scrolled, and covered the
 * chart or left the panel out of reach.
 *
 * A panel with too many rows for its side gets a cap from `useTooltipSide` and scrolls its own
 * rows instead of being drawn over the header or tab bar. `pointer-events` is switched back on
 * only then, so the ordinary case (nearly all of them) still passes a tap straight through to the
 * page underneath, exactly as before.
 *
 * Where `dockBelow` is false, a panel that would sit below the chart is drawn invisible instead:
 * it stays mounted, since useTooltipSide needs its rendered height to keep judging which side
 * has room, but nothing about it is shown or reported as on screen. A chart with its own
 * always-present readout uses this so that readout, not a second below-the-chart one, is what a
 * reader falls back to.
 */
function DockedPanel({
  title,
  lines,
  chart,
  dockBelow,
}: Pick<Props, 'title' | 'lines' | 'dockBelow'> & { chart: Props['chart'] | undefined }) {
  const ref = useRef<HTMLDivElement>(null)
  const { side, maxHeight } = useTooltipSide(chart, ref, contentKey(title, lines))
  // dockBelow left unset means true, so this only ever suppresses on an explicit false.
  const suppressed = dockBelow === false && side === 'below'
  // Tells the chart's owner whether it is showing, and that it is gone once it closes. Before
  // paint: after it, the owner's legend would keep its figures for a frame beside the panel.
  // A suppressed panel is never on screen, whatever its own bounding box says.
  const onScreen = useInBand(ref, ON_SCREEN_SHARE) && !suppressed
  const report = useContext(TooltipVisibilityContext)
  useLayoutEffect(() => {
    report?.(onScreen)
    return () => report?.(false)
  }, [report, onScreen])
  const sideClass = side === 'above' ? styles.tooltipAbove : styles.tooltipBelow
  return (
    <div
      ref={ref}
      className={`${styles.tooltipDocked} ${sideClass}${maxHeight !== null ? ` ${styles.tooltipScrollable}` : ''}${suppressed ? ` ${styles.tooltipDockedBelowSuppressed}` : ''}`}
      style={maxHeight !== null ? { maxHeight } : undefined}
      role="tooltip"
      aria-hidden={suppressed || undefined}
    >
      <TooltipBody title={title} lines={lines} />
    </div>
  )
}

function DockedTooltip({
  title,
  lines,
  chart,
  dockBelow,
}: Pick<Props, 'title' | 'lines' | 'dockBelow'> & { chart: Props['chart'] | undefined }) {
  // A panel is only as useful as the chart it belongs to: with the chart scrolled away it would
  // hang over whatever is there now. Where nothing can be observed it is shown.
  const chartOnScreen = useInBand(chart, CHART_ON_SCREEN_SHARE, { enabled: chart !== undefined, fallback: true })
  if (chart !== undefined && !chartOnScreen) return null
  return <DockedPanel title={title} lines={lines} chart={chart} dockBelow={dockBelow} />
}

export function ChartTooltip({ title, lines, anchor, chart, dockBelow }: Props) {
  const docked = useDockedTooltip()

  if (docked) return <DockedTooltip title={title} lines={lines} chart={chart} dockBelow={dockBelow} />

  return <FloatingTooltip title={title} lines={lines} anchor={anchor} />
}
