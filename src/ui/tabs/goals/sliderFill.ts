import type { CSSProperties } from 'react'

/**
 * How far along its range a slider's thumb is, for the track to paint the part behind it. A
 * value outside the range, or a range of no length, stays at an end rather than overflowing.
 */
export function fillOf(value: number, min: number, max: number): CSSProperties {
  const span = max - min
  const along = span > 0 ? Math.min(Math.max((value - min) / span, 0), 1) : 0
  return { '--fill': `${along * 100}%` } as CSSProperties
}
