import { useCallback, useEffect, useState, type RefObject } from 'react'
import { prefersReducedMotion } from './prefersReducedMotion'

/** Long enough to read as movement, short enough not to sit between you and the app. */
export const EXIT_MAX_MS = 300
/** Floor, so a sheet already dragged most of the way out animates rather than blinks. */
export const EXIT_MIN_MS = 140

/**
 * Thrown: the finger was already moving, so the sheet has to pick that speed up
 * immediately. An accelerating curve here reads as a stall — you fling the sheet, it
 * hesitates, and only then leaves.
 */
const EASE_THROWN = 'cubic-bezier(0.22, 0.61, 0.36, 1)'
/** From rest (the Close button, the backdrop): nothing to continue, so accelerate away. */
const EASE_FROM_REST = 'cubic-bezier(0.4, 0, 1, 1)'

export interface SheetExit {
  /** Where the sheet is leaving from, and how long it has to get there. */
  fromPx: number
  ms: number
  ease: string
}

/** How long the sheet should take to cover the distance it has left to travel. */
export function exitDurationMs(sheetHeight: number, fromOffsetPx: number): number {
  if (sheetHeight <= 0) return EXIT_MAX_MS
  const remaining = Math.max(0, sheetHeight - fromOffsetPx)
  const scaled = Math.round((remaining / sheetHeight) * EXIT_MAX_MS)
  return Math.min(EXIT_MAX_MS, Math.max(EXIT_MIN_MS, scaled))
}

/**
 * Let a sheet animate itself out before it unmounts.
 *
 * Nothing in this app used to have an exit: modals went from on-screen to gone in a
 * single commit. With a button that reads as the button doing something, but after a
 * drag your hand is still moving and the sheet teleports out from under it.
 *
 * `requestClose` takes the offset the sheet was released at, so the animation picks
 * up the movement the finger was already making instead of restarting from rest.
 *
 * `closeMayPrompt` is the one case that must not animate: when the consumer answers a
 * close request by raising a confirm instead (an unsaved draft), a sheet that had
 * animated away would be stranded off-screen behind it.
 */
export function useSheetExit(
  sheetRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  closeMayPrompt: boolean,
): { exit: SheetExit | null; requestClose: (fromOffsetPx?: number) => void } {
  const [exit, setExit] = useState<SheetExit | null>(null)

  const requestClose = useCallback(
    (fromOffsetPx = 0) => {
      if (exit) return
      if (closeMayPrompt || prefersReducedMotion()) {
        onClose()
        return
      }
      setExit({
        fromPx: fromOffsetPx,
        ms: exitDurationMs(sheetRef.current?.offsetHeight ?? 0, fromOffsetPx),
        ease: fromOffsetPx > 0 ? EASE_THROWN : EASE_FROM_REST,
      })
    },
    [closeMayPrompt, exit, onClose, sheetRef],
  )

  // Timed rather than driven off `animationend`: the duration is ours, and a missed
  // event would leave the sheet parked off-screen with the page still locked behind it.
  useEffect(() => {
    if (!exit) return
    const timer = setTimeout(onClose, exit.ms)
    return () => clearTimeout(timer)
  }, [exit, onClose])

  return { exit, requestClose }
}
