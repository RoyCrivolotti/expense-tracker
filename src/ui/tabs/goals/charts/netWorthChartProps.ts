import type { MoneyFormat } from '../../../../engine'
import { RETURN_BAND_SPREAD } from '../../../../engine'
import { formatMoneyShort } from '../chartTheme'
import type { HintText } from './ChartHint'
import type { ChartKeyMarks } from './ChartKeys'
import { insideWindow } from './heroWindow'

/** The breakdown floats on the half of the chart the pointer is not in. */
export function floatSideFor(
  activeIndex: number | null,
  pointCount: number,
): 'start' | 'end' {
  return activeIndex != null && activeIndex > (pointCount - 1) / 2 ? 'start' : 'end'
}

/** Pixels: tall enough on a desktop to read thirty years, short enough on a phone to fit above the fold. */
function heroHeight(narrow: boolean): number {
  // A wide screen gives the chart the page's width, and a plot that wide needs the height to
  // stay a chart and not a ribbon. The open scenario's chip is as tall as its tags make it, and the
  // levers bar held at the bottom of a 1280x800 screen still has to clear the legend under the chart.
  return narrow ? 210 : 316
}

const PROJECTION_LABEL = 'Invested portfolio projection by year'

/** The chart's accessible name, which carries the FI target when it is only marked: the marker's own title is not read out of an image. */
export function projectionLabel(marker: { title: string } | undefined): string {
  return marker ? `${PROJECTION_LABEL}. ${marker.title}` : PROJECTION_LABEL
}

/** The FI target as a marker on the chart's top edge when it is above the chart, so leaving it off the axis is not a silent omission. */
export function fiMarker(
  cents: number | null,
  format: MoneyFormat,
): { label: string; title: string } | undefined {
  if (cents === null) return undefined
  const amount = formatMoneyShort(cents, format)
  return { label: `FI ${amount}`, title: `The FI target, ${amount}, is above the top of this chart.` }
}

/**
 * The line above the chart. On a wide screen the hero has none: what it said is a note under the
 * legend instead (HeroNote), so the chart starts two lines higher and the page does not move
 * when a year is hovered.
 */
export function chartHint(
  isHero: boolean,
  narrow: boolean,
  money: string,
  expectedRealReturn: number,
): HintText | null {
  // What the chart's euros are leads, apart from the rest, so it can stay in view when the rest is folded.
  const said = (rest: string) => ({ lead: `${money.charAt(0).toUpperCase()}${money.slice(1)}.`, rest })
  if (!isHero) return said(DEFAULT_HINT)
  return narrow ? said(heroHint(expectedRealReturn)) : null
}

/** How far the band reaches either side of the return: three points, or less down below a return of three, where it stops at zero. */
export function bandReach(expectedRealReturn: number): { either: string; lowerAndHigher: string } {
  return expectedRealReturn >= RETURN_BAND_SPREAD
    ? { either: 'three points either side', lowerAndHigher: 'three points lower and higher' }
    : { either: 'up to three points either side', lowerAndHigher: 'up to three points lower and three points higher' }
}

/** The today marker, only while it lies inside the window. */
export function todayProp(
  todayIndex: number | undefined,
  windowYears: number | null,
): { todayIndex?: number } {
  return insideWindow(todayIndex, windowYears) && todayIndex !== undefined ? { todayIndex } : {}
}

export function variantProps(
  isHero: boolean,
  narrow: boolean,
  legendInBand: boolean,
  markerYears: { yearIndex: number }[],
  lifeEventMarkers: { yearIndex: number; label: string; amountCents: number }[],
  onActiveIndexChange: (index: number | null) => void,
) {
  // The tooltip is only an extra, temporary readout for while the legend has scrolled out of
  // view; the legend below always shows its own values regardless.
  const showPopup = narrow && !legendInBand
  return isHero
    ? {
        height: heroHeight(narrow),
        markerYears,
        lifeEventMarkers,
        tooltipMode: showPopup ? ('full' as const) : ('hidden' as const),
        // The legend below has its own always-there readout; the tooltip never has to fall
        // back to a second one below the chart, only above it or not at all.
        dockBelow: false,
        onActiveIndexChange,
      }
    : { height: 210, markerYears: [], tooltipMode: 'full' as const }
}

function heroHint(expectedRealReturn: number): string {
  return `At a purchase year, return and contributions apply before the down payment is withdrawn. Select a year on the chart for values and the purchase breakdown. Dashed vertical marks show purchase years. The shaded band is the edited plan at a return ${bandReach(expectedRealReturn).lowerAndHigher}: how much the return matters, not how likely an outcome is.`
}
const DEFAULT_HINT =
  'Compare saved scenarios plus your live edits. At a purchase year, return and contributions apply before the down payment is withdrawn. Hover that year for the breakdown.'

/** Which marks the hero chart draws beyond its lines, for the key under the legend. */
export function chartKeyMarks(
  isHero: boolean,
  checkinSeries: number,
  lifeEvents: { amountCents: number }[],
): ChartKeyMarks {
  return {
    checkins: isHero && checkinSeries > 0,
    lifeIn: lifeEvents.some((ev) => ev.amountCents >= 0),
    lifeOut: lifeEvents.some((ev) => ev.amountCents < 0),
  }
}
