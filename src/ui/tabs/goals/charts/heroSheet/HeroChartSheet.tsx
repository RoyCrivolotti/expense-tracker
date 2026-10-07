import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { LinearChart } from '../../../../charts/LinearChart'
import { Presence } from '../../../../components/Presence'
import { PopOutIcon } from '../../../../icons'
import { LOWER_RIGHT, type Placement } from '../../../../hooks/cardPlacement'
import { EXIT_MS } from '../../../../hooks/motion'
import goalsStyles from '../../goals.module.css'
import { SheetFrame } from '../SheetFrame'
import { useSideways } from '../sheetOrientation'
import { HeroFloatingReadout } from './HeroFloatingReadout'
import { HeroReadoutAnnouncer, ReadoutLegend } from './HeroReadoutParts'
import { useReadout, type Readout } from './useReadout'
import type { HeroSheetModel } from './heroSheetModel'
import styles from './HeroChartSheet.module.css'

/** Drawn at this until the stage has been measured, which is one frame. */
const FALLBACK_HEIGHT = 240

/** The chart does not redraw for the sheet's own state, only for what the card hands over. */
const SheetChart = memo(LinearChart)

/** Where the focus goes when the readout changes places, since the control that was pressed is gone. */
type FocusNext = 'card' | 'rail' | null

/**
 * The hero chart on the whole screen, with the readout beside it, or over it. A phone held upright
 * gets it drawn a quarter turn, and then the chart reads the pointer from its height (`SheetFrame`).
 *
 * The readout starts docked in a rail. Floated, the rail goes and the chart has the whole width, and
 * the same readout is a card that can be moved about the chart. It is put back by its cross, and a
 * sheet always opens docked: where the card was is kept only while the sheet is open.
 *
 * The year pointed at is kept when a finger lifts, and it is this sheet's own: it starts at the
 * card's year and the card is not told, so nothing the sheet does re-draws the card behind it.
 */
export const HeroChartSheet = memo(function HeroChartSheet({
  model,
  initialIndex,
  onClose,
}: {
  model: HeroSheetModel
  initialIndex: number | null
  onClose: () => void
}) {
  const sideways = useSideways()
  const [active, setActive] = useState<number | null>(initialIndex)
  const [floating, setFloating] = useState(false)
  const [focusNext, setFocusNext] = useState<FocusNext>(null)
  const stage = useRef<HTMLDivElement>(null)
  const placement = useRef<Placement>(LOWER_RIGHT)
  // The size asked for with the card's corner, kept as long as the sheet is open and not just the card.
  const choice = useRef<number | null>(null)
  const readout = useReadout(model, active)
  const focus = useMemo(
    () => ({ sticky: true, initial: initialIndex, turn: sideways ? (1 as const) : (0 as const) }),
    [initialIndex, sideways],
  )
  const move = (to: boolean) => {
    setFocusNext(to ? 'card' : 'rail')
    setFloating(to)
  }

  return (
    <SheetFrame
      title="Invested portfolio projection"
      label="Invested portfolio projection, full screen"
      toolbar={
        <div className={goalsStyles.sheetTools}>
          {model.displaySwitch}
          {model.windowPicker}
        </div>
      }
      onClose={onClose}
    >
      <div className={styles.body}>
        <div ref={stage} className={styles.stage}>
          <SheetChart
            {...model.chart}
            height={FALLBACK_HEIGHT}
            fillHeight
            tooltipMode="hidden"
            onActiveIndexChange={setActive}
            focus={focus}
          />
          <Presence show={floating} exitMs={EXIT_MS.popover}>
            <HeroFloatingReadout
              stage={stage}
              placement={placement}
              choice={choice}
              turn={sideways ? 1 : 0}
              readout={readout}
              onDock={() => move(false)}
              focusOnMount={focusNext === 'card'}
            />
          </Presence>
        </div>
        {floating ? null : (
          <HeroRail readout={readout} onFloat={() => move(true)} focusOnMount={focusNext === 'rail'} />
        )}
      </div>
      <HeroReadoutAnnouncer sentence={readout.sentence} />
    </SheetFrame>
  )
})

/** The docked readout: beside the chart, with the control that floats it over the chart. */
function HeroRail({
  readout,
  onFloat,
  focusOnMount,
}: {
  readout: Readout
  onFloat: () => void
  focusOnMount: boolean
}) {
  const float = useRef<HTMLButtonElement>(null)
  useLayoutEffect(() => {
    if (focusOnMount) float.current?.focus()
  }, [focusOnMount])
  return (
    <aside className={styles.rail} aria-label="Values for the year">
      <div className={styles.railHead}>
        <button
          ref={float}
          type="button"
          className={styles.float}
          aria-label="Float the values over the chart"
          onClick={onFloat}
        >
          <PopOutIcon aria-hidden="true" />
        </button>
      </div>
      <ReadoutLegend readout={readout} />
    </aside>
  )
}
