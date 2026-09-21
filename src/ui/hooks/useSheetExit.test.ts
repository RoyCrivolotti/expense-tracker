import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EXIT_MAX_MS, EXIT_MIN_MS, exitDurationMs, useSheetExit } from './useSheetExit'

describe('exitDurationMs', () => {
  it('takes the full time when the sheet starts from rest', () => {
    expect(exitDurationMs(600, 0)).toBe(EXIT_MAX_MS)
  })

  it('shortens in proportion to the distance already covered', () => {
    // A quarter of the way out, so three quarters of the journey is left.
    expect(exitDurationMs(600, 150)).toBe(Math.round(EXIT_MAX_MS * 0.75))
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

  it('never takes longer than the time the sheet is held in the DOM', () => {
    expect(EXIT_MAX_MS).toBeGreaterThan(EXIT_MIN_MS)
    expect(exitDurationMs(600, 0)).toBeLessThanOrEqual(EXIT_MAX_MS)
  })
})

describe('useSheetExit', () => {
  const sheetOf = (height: number) => ({ current: { offsetHeight: height } as HTMLElement })

  /** The owner takes a swipe by starting the exit in the update the swipe made. */
  function swipe(result: { current: ReturnType<typeof useSheetExit> }, rerender: (props: { leaving: boolean }) => void, from: number) {
    act(() => {
      result.current.requestClose(from)
      rerender({ leaving: true })
    })
  }

  const setup = (sheet: { current: HTMLElement | null }, onClose = vi.fn()) => ({
    onClose,
    ...renderHook(({ leaving }) => useSheetExit(sheet, onClose, leaving), { initialProps: { leaving: false } }),
  })

  it('hands a close from rest straight to the owner and remembers no release point', () => {
    const { result, onClose } = setup(sheetOf(400))

    act(() => result.current.requestClose())

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(result.current.release).toBeNull()
  })

  it('remembers where a swipe let go, how long the rest of the trip takes, and how far along it was', () => {
    const { result, rerender, onClose } = setup(sheetOf(400))

    swipe(result, rerender, 200)

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(result.current.release).toEqual({ fromPx: 200, ms: exitDurationMs(400, 200), progress: 0.5 })
  })

  it('reports no progress for a sheet that has not been measured', () => {
    const { result, rerender } = setup({ current: null })

    swipe(result, rerender, 120)

    expect(result.current.release).toMatchObject({ fromPx: 120, progress: 0 })
  })

  it('forgets a swipe the owner did not take, because that sheet is not leaving', () => {
    const { result, onClose } = setup(sheetOf(400))

    act(() => result.current.requestClose(200))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(result.current.release).toBeNull()
  })
})
