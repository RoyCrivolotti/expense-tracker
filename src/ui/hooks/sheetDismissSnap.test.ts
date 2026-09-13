import { describe, expect, it } from 'vitest'
import {
  CANCEL_PULLBACK_PX,
  DISMISS_MAX_PX,
  DISMISS_RATIO,
  FLICK_MIN_PX,
  VELOCITY_WINDOW_MS,
  dismissThresholdPx,
  recentVelocity,
  resolveDismissSnap,
} from './sheetDismissSnap'
import { SWIPE_DRAG_THRESHOLD_PX, SWIPE_FLING_PX_MS } from './swipeSnap'

const SHEET_HEIGHT = 400
const THRESHOLD = dismissThresholdPx(SHEET_HEIGHT)
const FAST = SWIPE_FLING_PX_MS + 0.1

/** Defaults to a release with no reversal and no speed; override what matters. */
function release(over: Partial<Parameters<typeof resolveDismissSnap>[0]> & { offsetY: number }) {
  return resolveDismissSnap({
    peakOffsetY: over.offsetY,
    sheetHeight: SHEET_HEIGHT,
    velocityY: 0,
    ...over,
  })
}

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

describe('recentVelocity', () => {
  it('is zero without at least two samples', () => {
    expect(recentVelocity([])).toBe(0)
    expect(recentVelocity([{ y: 10, t: 0 }])).toBe(0)
  })

  it('reads the tail of the gesture, not its whole length', () => {
    // Slow for 500ms, then a decisive flick. Averaged start-to-end this reads as
    // slow and the flick is lost.
    const samples = [
      { y: 0, t: 0 },
      { y: 20, t: 500 },
      { y: 80, t: 560 },
    ]
    expect(recentVelocity(samples)).toBeCloseTo(1, 5)
  })

  it('reads a sheet parked before release as stationary', () => {
    // The bug this replaced: quick to begin with, then deliberately held still.
    // Averaging the whole drag called that fast and flung the sheet away.
    const samples = [
      { y: 0, t: 0 },
      { y: 200, t: 200 },
      { y: 202, t: 300 },
      { y: 202, t: 400 },
    ]
    expect(Math.abs(recentVelocity(samples))).toBeLessThan(SWIPE_FLING_PX_MS)
  })

  it('goes negative while the finger is moving back up', () => {
    const samples = [
      { y: 200, t: 0 },
      { y: 120, t: VELOCITY_WINDOW_MS },
    ]
    expect(recentVelocity(samples)).toBeLessThan(0)
  })
})

describe('resolveDismissSnap', () => {
  it('dismisses past the threshold without any speed', () => {
    expect(release({ offsetY: THRESHOLD })).toBe('dismiss')
    expect(release({ offsetY: THRESHOLD - 1 })).toBe('settle')
  })

  it('dismisses on a flick that stops short, once it has travelled far enough', () => {
    expect(release({ offsetY: FLICK_MIN_PX, velocityY: FAST })).toBe('dismiss')
  })

  it('ignores a fast twitch that barely moved', () => {
    // A jab while reaching for a field. Fast, but nowhere near far enough to mean it.
    expect(release({ offsetY: FLICK_MIN_PX - 1, velocityY: FAST })).toBe('settle')
    expect(release({ offsetY: SWIPE_DRAG_THRESHOLD_PX + 1, velocityY: 5 })).toBe('settle')
  })

  it('settles on an upward flick, wherever the sheet has got to', () => {
    expect(release({ offsetY: THRESHOLD + 80, velocityY: -FAST })).toBe('settle')
  })

  it('settles when the finger pulled back up before lifting', () => {
    // Reported from the device: drag well past the threshold, change your mind, come
    // back up, lift below it — and it still closed, because velocity was averaged
    // from the start point and so stayed positive.
    expect(release({ offsetY: 60, peakOffsetY: 200, velocityY: FAST })).toBe('settle')
  })

  it('lets a pull back up beat the distance rule too', () => {
    expect(release({ offsetY: THRESHOLD + 10, peakOffsetY: THRESHOLD + 10 })).toBe('dismiss')
    expect(
      release({ offsetY: THRESHOLD + 10, peakOffsetY: THRESHOLD + 10 + CANCEL_PULLBACK_PX }),
    ).toBe('settle')
  })

  it('is not troubled by the jitter at the end of an ordinary drag', () => {
    expect(release({ offsetY: THRESHOLD + 40, peakOffsetY: THRESHOLD + 45 })).toBe('dismiss')
  })

  it('settles when the sheet was never really dragged', () => {
    expect(release({ offsetY: 0 })).toBe('settle')
    expect(release({ offsetY: SWIPE_DRAG_THRESHOLD_PX })).toBe('settle')
  })
})
