import { describe, expect, it } from 'vitest'
import { swipeRevealPx } from './useSwipeReveal'
import { resolveSwipeSnap, SWIPE_FLING_PX_MS, SWIPE_OPEN_RATIO } from './swipeSnap'

describe('resolveSwipeSnap', () => {
  const revealPx = swipeRevealPx(2)

  it('snaps open past 30% threshold', () => {
    const threshold = -revealPx * SWIPE_OPEN_RATIO
    expect(resolveSwipeSnap(threshold - 1, revealPx, 0)).toBe(-revealPx)
    expect(resolveSwipeSnap(threshold + 1, revealPx, 0)).toBe(0)
  })

  it('opens on fast left fling below threshold', () => {
    expect(resolveSwipeSnap(-10, revealPx, -SWIPE_FLING_PX_MS - 0.01)).toBe(-revealPx)
  })

  it('closes on fast right fling while partly open', () => {
    expect(resolveSwipeSnap(-revealPx + 10, revealPx, SWIPE_FLING_PX_MS + 0.01)).toBe(0)
  })

  it('snaps fully open from 51% without velocity', () => {
    const at51 = -revealPx * 0.51
    expect(resolveSwipeSnap(at51, revealPx, 0)).toBe(-revealPx)
  })
})
