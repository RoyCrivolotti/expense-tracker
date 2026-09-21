import { useCallback, useState, type RefObject } from 'react'
import { EXIT_MS } from './motion'

/** The full trip, from rest. Also how long `Presence` holds a sheet in the DOM. */
export const EXIT_MAX_MS = EXIT_MS.sheet
/** Floor, so a sheet already dragged most of the way out animates rather than blinks. */
export const EXIT_MIN_MS = 100

/**
 * Thrown: the finger was already moving, so the sheet has to pick that speed up
 * immediately. An accelerating curve here reads as a stall: you fling the sheet, it
 * hesitates, and only then leaves. From rest (the Close button, the backdrop, Save) there
 * is nothing to continue, so the sheet uses the shared accelerating curve instead.
 */
export const EASE_THROWN = 'cubic-bezier(0.22, 0.61, 0.36, 1)'

/** Where a swipe let go of the sheet, so the exit can carry on from there. */
export interface SheetRelease {
  fromPx: number
  ms: number
  /** How far the sheet had been dragged, as a fraction of its height, for the scrim. */
  progress: number
}

/** How long the sheet should take to cover the distance it has left to travel. */
export function exitDurationMs(sheetHeight: number, fromOffsetPx: number): number {
  if (sheetHeight <= 0) return EXIT_MAX_MS
  const remaining = Math.max(0, sheetHeight - fromOffsetPx)
  const scaled = Math.round((remaining / sheetHeight) * EXIT_MAX_MS)
  return Math.min(EXIT_MAX_MS, Math.max(EXIT_MIN_MS, scaled))
}

/**
 * The way out of a sheet: hand the close to its owner, and remember where a swipe let go.
 *
 * A sheet asks its owner to close at once, and the owner's `Presence` keeps it mounted long
 * enough to play the exit. Save, Discard and every other route out therefore animate the
 * same way as the Close button, and the action behind them is not held up by the animation.
 *
 * A swipe passes the offset it was released at. The sheet leaves from there rather than
 * springing home first, and over a time in proportion to what is left to travel.
 */
export function useSheetExit(
  sheetRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  leaving: boolean,
): { release: SheetRelease | null; requestClose: (fromOffsetPx?: number) => void } {
  const [release, setRelease] = useState<SheetRelease | null>(null)

  // A release belongs to the exit it started, which begins in the same update. An owner
  // may answer a swipe with a confirm instead, and the sheet then stays; left in place, the
  // release would colour whichever close came next (Save, Discard) with a swipe long over.
  if (release && !leaving) setRelease(null)

  const requestClose = useCallback(
    (fromOffsetPx = 0) => {
      if (fromOffsetPx > 0) {
        const height = sheetRef.current?.offsetHeight ?? 0
        setRelease({
          fromPx: fromOffsetPx,
          ms: exitDurationMs(height, fromOffsetPx),
          progress: height > 0 ? Math.min(1, fromOffsetPx / height) : 0,
        })
      }
      onClose()
    },
    [onClose, sheetRef],
  )

  return { release, requestClose }
}
