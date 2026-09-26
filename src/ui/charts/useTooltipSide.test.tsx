import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chooseSide, pickSide, roomAround, useTooltipSide, visibleBand } from './useTooltipSide'

const BAR = 60
const PANEL = 200

/** jsdom lays nothing out, so the bars' probes are given a height; everything else is left to the caller. */
function withBars() {
  return vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return (this.style.visibility === 'hidden' ? { top: 0, bottom: BAR, height: BAR } : { top: 0, bottom: 0, height: 0 }) as DOMRect
  })
}

/** A chart that can be moved, and a panel of a fixed height, as refs. */
function scene(top: number, bottom: number) {
  const chart = document.createElement('div')
  const panel = document.createElement('div')
  Object.defineProperty(panel, 'offsetHeight', { value: PANEL })
  const move = (t: number, b: number) => {
    chart.getBoundingClientRect = () => ({ top: t, bottom: b, height: b - t }) as DOMRect
  }
  move(top, bottom)
  return { chart: { current: chart }, panel: { current: panel }, move }
}

const screenHeight = () => window.innerHeight

// The hook works out the side once a frame; a frame here is a tick of the fake clock.
const frame = () =>
  act(() => {
    vi.advanceTimersByTime(20)
  })
const event = (type: string) => {
  act(() => {
    window.dispatchEvent(new Event(type))
  })
  frame()
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
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

describe('chooseSide', () => {
  it('picks the side with more room when there is none yet and both fit', () => {
    expect(chooseSide(null, { above: 300, below: 500 }, 200)).toBe('below')
    expect(chooseSide(null, { above: 500, below: 300 }, 200)).toBe('above')
    expect(chooseSide(null, { above: 250, below: 250 }, 200)).toBe('above')
  })

  it('picks the side that fits when only one does', () => {
    expect(chooseSide(null, { above: 100, below: 500 }, 200)).toBe('below')
    expect(chooseSide(null, { above: 500, below: 100 }, 200)).toBe('above')
  })

  it('cuts off the tail rather than the title when neither side has room', () => {
    // A little less room below than above, but the panel is cut at its end there, not its title.
    expect(chooseSide(null, { above: 240, below: 236 }, 300)).toBe('below')
    // Above only if it loses clearly less.
    expect(chooseSide(null, { above: 290, below: 100 }, 300)).toBe('above')
  })

  it('keeps a side while the panel still fits there, even if the other has more room', () => {
    expect(chooseSide('above', { above: 220, below: 600 }, 200)).toBe('above')
    expect(chooseSide('below', { above: 600, below: 200 }, 200)).toBe('below')
  })

  it('moves to the other side once the panel no longer fits, if that is clearly better', () => {
    expect(chooseSide('above', { above: 150, below: 400 }, 200)).toBe('below')
    expect(chooseSide('below', { above: 400, below: 150 }, 200)).toBe('above')
  })

  it('stays put when the other side is not clearly better, so it does not swap back and forth', () => {
    // On the tab bar side, nothing fits: 100px cut. Above would cut 50, which counts double.
    expect(chooseSide('below', { above: 150, below: 100 }, 200)).toBe('below')
    // Clearly less cut off above, and it moves.
    expect(chooseSide('below', { above: 170, below: 100 }, 200)).toBe('above')
    // Cut equally, the top counting double: from above it moves down, from below it stays.
    expect(chooseSide('above', { above: 140, below: 140 }, 200)).toBe('below')
    expect(chooseSide('below', { above: 140, below: 140 }, 200)).toBe('below')
  })
})

describe('useTooltipSide', () => {
  const render = (s: ReturnType<typeof scene>, content = 'Year 1') =>
    renderHook(({ text }) => useTooltipSide(s.chart, s.panel, text), { initialProps: { text: content } })

  it('opens above a chart low on the screen and below one high on it', () => {
    withBars()
    expect(render(scene(screenHeight() - 300, screenHeight() - 70)).result.current).toBe('above')
    expect(render(scene(70, 300)).result.current).toBe('below')
  })

  it('is above when it has no chart to measure', () => {
    withBars()
    expect(renderHook(() => useTooltipSide(undefined, scene(0, 0).panel, 'x')).result.current).toBe('above')
  })

  it('works the side out again as the page scrolls under it, once the side it is on runs out', () => {
    withBars()
    const s = scene(screenHeight() - 300, screenHeight() - 70)
    const { result } = render(s)
    expect(result.current).toBe('above')
    // Still room for the panel above: it stays above however the page moves.
    s.move(screenHeight() - 500, screenHeight() - 270)
    event('scroll')
    expect(result.current).toBe('above')
    // The chart has gone up the screen, and the panel would sit under the header: below.
    s.move(150, 380)
    event('scroll')
    expect(result.current).toBe('below')
    // And back down: above again, once below has run out.
    s.move(screenHeight() - 200, screenHeight() - 30)
    event('scroll')
    expect(result.current).toBe('above')
  })

  it('also works the side out when what it shows changes, since that changes its height', () => {
    withBars()
    const s = scene(screenHeight() - 300, screenHeight() - 70)
    const { result, rerender } = render(s)
    expect(result.current).toBe('above')
    // The chart moved without a scroll event reaching it; the next thing it shows settles it.
    s.move(150, 380)
    rerender({ text: 'Year 2' })
    expect(result.current).toBe('below')
  })

  it('measures the bars once, and again only when the screen changes', () => {
    withBars()
    const s = scene(300, 500)
    const probes = vi.spyOn(document.body, 'appendChild')
    render(s)
    const opened = probes.mock.calls.length
    expect(opened).toBeGreaterThan(0)
    // Every scroll frame reads the chart, not the bars.
    for (let i = 0; i < 5; i++) event('scroll')
    expect(probes.mock.calls.length).toBe(opened)
    // A rotation or the browser's toolbar changes the bars: measured again.
    event('resize')
    expect(probes.mock.calls.length).toBeGreaterThan(opened)
  })

  it('stops listening when it goes away', () => {
    withBars()
    const s = scene(300, 500)
    const remove = vi.spyOn(window, 'removeEventListener')
    const { unmount } = render(s)
    unmount()
    expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function), true)
    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function))
  })
})
