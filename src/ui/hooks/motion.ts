import type { CSSProperties } from 'react'
import { prefersReducedMotion } from './prefersReducedMotion'

/**
 * How long an overlay stays mounted after its owner let go of it, in ms.
 *
 * The same number holds the element in the DOM (`Presence`) and drives its CSS exit
 * (`--exit-ms`), so the two cannot drift apart. Exits are kept short and shorter than
 * the matching entrance: people see these dozens of times a day, and leaving needs
 * less attention than arriving.
 */
export const EXIT_MS = {
  /** A sheet sliding back down the way it came up. */
  sheet: 170,
  /** A popover or menu, which is on screen for a moment and gone. */
  popover: 90,
  /** A toast, banner or full-page overlay fading out. */
  fade: 130,
  /** A docked bar sliding away. */
  bar: 150,
  /**
   * A row folding away, or a group of rows. Must equal `--motion-fold` in theme.css, which
   * the CSS transition reads; `motion.test.ts` holds the two together.
   */
  fold: 180,
} as const

/** Resolves after `ms`, or at once when nothing will be animated. */
export function afterExit(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, motionEnabled() ? ms : 0))
}

/** Resolves once a fold has had time to finish, or at once when nothing will be animated. */
export function foldDone(): Promise<void> {
  return afterExit(EXIT_MS.fold)
}

/**
 * `--exit-ms` for an overlay that is leaving, or nothing while it is not. The CSS reads it
 * in place of a duration of its own, so the animation ends exactly when `Presence` lets go.
 */
export function exitVars(leaving: boolean, exitMs: number): CSSProperties | undefined {
  return leaving ? ({ '--exit-ms': `${exitMs}ms` } as CSSProperties) : undefined
}

let disabled = false

/**
 * Tests only. An exit keeps an element in the DOM for a while, which would turn every
 * "it closed" assertion into a wait, so the suite switches motion off and the few tests
 * about motion switch it back on.
 */
export function setMotionDisabledForTests(value: boolean): void {
  disabled = value
}

/** False when the person asked for less movement, so overlays leave at once instead. */
export function motionEnabled(): boolean {
  return !disabled && !prefersReducedMotion()
}
