import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nudgeIntoBand, pickSide, roomAround, useTooltipSide, visibleBand } from './useTooltipSide'

const BAR = 60

/** jsdom lays nothing out, so the bars' probes are given a height; everything else is left to the caller. */
function withBars(rectOf: (el: HTMLElement) => { top: number; bottom: number } = () => ({ top: 0, bottom: 0 })) {
  return vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.style.visibility === 'hidden') return { top: 0, bottom: BAR, height: BAR } as DOMRect
    const { top, bottom } = rectOf(this)
    return { top, bottom, height: bottom - top } as DOMRect
  })
}

function phone(matches = true) {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
}

function boxAt(top: number, bottom: number) {
  const el = document.createElement('div')
  const ref = { current: el }
  const move = (t: number, b: number) => {
    el.getBoundingClientRect = () => ({ top: t, bottom: b, height: b - t }) as DOMRect
  }
  move(top, bottom)
  return { ref, move }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('visibleBand and roomAround', () => {
  it('leave out what the header and the tab bar cover', () => {
    withBars()
    expect(visibleBand()).toEqual({ top: BAR, bottom: window.innerHeight - BAR })
    expect(roomAround({ top: 600, bottom: 700 })).toEqual({ above: 600 - BAR, below: window.innerHeight - BAR - 700 })
  })

  it('follow the visual viewport when there is one', () => {
    withBars()
    vi.stubGlobal('visualViewport', { offsetTop: 40, height: 500 })
    expect(visibleBand()).toEqual({ top: 40 + BAR, bottom: 40 + 500 - BAR })
  })
})

describe('pickSide', () => {
  it('takes the side with more room, and above when they are equal', () => {
    expect(pickSide({ above: 300, below: 200 })).toBe('above')
    expect(pickSide({ above: 100, below: 500 })).toBe('below')
    expect(pickSide({ above: 250, below: 250 })).toBe('above')
  })
})

describe('nudgeIntoBand', () => {
  const band = { top: 60, bottom: 700 }
  it('leaves a panel inside the band where it is', () => {
    expect(nudgeIntoBand({ top: 100, bottom: 400 }, band)).toBe(0)
  })
  it('moves a panel that pokes above the band down, and one that hangs below it up', () => {
    expect(nudgeIntoBand({ top: 20, bottom: 300 }, band)).toBe(40)
    expect(nudgeIntoBand({ top: 500, bottom: 760 }, band)).toBe(-60)
  })
  it('keeps the top of a panel taller than the band, since that is the title', () => {
    expect(nudgeIntoBand({ top: 0, bottom: 800 }, band)).toBe(60)
  })
})

describe('useTooltipSide', () => {
  it('opens above a chart low on the screen and below one high on it', () => {
    phone()
    withBars()
    const low = boxAt(window.innerHeight - 300, window.innerHeight - 70)
    expect(renderHook(() => useTooltipSide(true, low.ref)).result.current).toBe('above')
    const high = boxAt(70, 300)
    expect(renderHook(() => useTooltipSide(true, high.ref)).result.current).toBe('below')
  })

  it('holds its side while open, and chooses again the next time it opens', () => {
    phone()
    withBars()
    const chart = boxAt(70, 300)
    const { result, rerender } = renderHook(({ open }) => useTooltipSide(open, chart.ref), {
      initialProps: { open: true },
    })
    expect(result.current).toBe('below')
    // The page moves under the open tooltip: it must not jump to the other side.
    chart.move(window.innerHeight - 300, window.innerHeight - 70)
    rerender({ open: true })
    expect(result.current).toBe('below')
    rerender({ open: false })
    rerender({ open: true })
    expect(result.current).toBe('above')
  })

  it('measures nothing on a wide screen, or for a chart with no tooltip', () => {
    const spy = withBars()
    const chart = boxAt(70, 300)
    phone(false)
    expect(renderHook(() => useTooltipSide(true, chart.ref)).result.current).toBe('above')
    phone(true)
    expect(renderHook(() => useTooltipSide(true, chart.ref, { enabled: false })).result.current).toBe('above')
    expect(spy).not.toHaveBeenCalled()
  })

  it('decides when a tooltip becomes enabled while a point is already selected', () => {
    phone()
    withBars()
    const chart = boxAt(70, 300)
    const { result, rerender } = renderHook(({ enabled }) => useTooltipSide(true, chart.ref, { enabled }), {
      initialProps: { enabled: false },
    })
    expect(result.current).toBe('above')
    // The main chart's tooltip comes and goes as its legend scrolls in and out of view.
    rerender({ enabled: true })
    expect(result.current).toBe('below')
  })
})
