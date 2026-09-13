import { describe, expect, it } from 'vitest'
import {
  DISMISS_MAX_PX,
  DISMISS_RATIO,
  dismissThresholdPx,
  resolveDismissSnap,
} from './sheetDismissSnap'
import { SWIPE_DRAG_THRESHOLD_PX, SWIPE_FLING_PX_MS } from './swipeSnap'

describe('dismissThresholdPx', () => {
  it('asks for a quarter of a short sheet', () => {
    expect(dismissThresholdPx(400)).toBe(400 * DISMISS_RATIO)
  })

  it('caps the distance so a tall sheet is not a long drag', () => {
    expect(dismissThresholdPx(2000)).toBe(DISMISS_MAX_PX)
  })

  it('falls back to the cap when the sheet has not been measured', () => {
    expect(dismissThresholdPx(0)).toBe(DISMISS_MAX_PX)
  })
})

describe('resolveDismissSnap', () => {
  const sheetHeight = 400
  const threshold = dismissThresholdPx(sheetHeight)

  it('dismisses past the threshold without velocity', () => {
    expect(resolveDismissSnap(threshold, sheetHeight, 0)).toBe('dismiss')
    expect(resolveDismissSnap(threshold - 1, sheetHeight, 0)).toBe('settle')
  })

  it('dismisses on a fast downward fling short of the threshold', () => {
    expect(resolveDismissSnap(threshold - 1, sheetHeight, SWIPE_FLING_PX_MS + 0.01)).toBe('dismiss')
  })

  it('settles on a fast upward fling even past the threshold', () => {
    expect(resolveDismissSnap(threshold + 50, sheetHeight, -SWIPE_FLING_PX_MS - 0.01)).toBe('settle')
  })

  it('ignores a fling that never really moved', () => {
    // A tap with a shaky finger reads as high velocity over a tiny distance.
    expect(resolveDismissSnap(SWIPE_DRAG_THRESHOLD_PX, sheetHeight, 5)).toBe('settle')
    expect(resolveDismissSnap(0, sheetHeight, 5)).toBe('settle')
  })

  it('settles when the sheet was never dragged', () => {
    expect(resolveDismissSnap(0, sheetHeight, 0)).toBe('settle')
  })
})
