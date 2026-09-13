import { describe, expect, it } from 'vitest'
import { EXIT_MAX_MS, EXIT_MIN_MS, exitDurationMs } from './useSheetExit'

describe('exitDurationMs', () => {
  it('takes the full time when the sheet starts from rest', () => {
    expect(exitDurationMs(600, 0)).toBe(EXIT_MAX_MS)
  })

  it('shortens in proportion to the distance already covered', () => {
    // Half dragged away, so half the journey is left.
    expect(exitDurationMs(600, 300)).toBe(EXIT_MAX_MS / 2)
  })

  it('keeps a floor, so a nearly-dismissed sheet animates rather than blinking out', () => {
    expect(exitDurationMs(600, 590)).toBe(EXIT_MIN_MS)
    expect(exitDurationMs(600, 600)).toBe(EXIT_MIN_MS)
  })

  it('is unfazed by a drag past the sheet height', () => {
    expect(exitDurationMs(600, 900)).toBe(EXIT_MIN_MS)
  })

  it('falls back to the full time when the sheet has not been measured', () => {
    expect(exitDurationMs(0, 0)).toBe(EXIT_MAX_MS)
  })
})
