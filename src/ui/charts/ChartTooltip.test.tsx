import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChartTooltip } from './ChartTooltip'
import chartStyles from './charts.module.css'
import { TooltipVisibilityContext } from './tooltipVisibility'
import { installFakeIntersectionObserver } from '../../testing/fakeIntersectionObserver'

let docked = false

beforeAll(() => {
  // The docked tooltip reads a media query; jsdom has no matchMedia.
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: docked,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  })
})

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const BAR = 60

/** The bars' probes are 60px; the chart is where the test puts it, and the panel is 100px tall. */
function scene(top: number, bottom: number) {
  const chart = document.createElement('div')
  const move = (t: number, b: number) => {
    chart.getBoundingClientRect = () => ({ top: t, bottom: b, height: b - t }) as DOMRect
  }
  move(top, bottom)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return (this.style.visibility === 'hidden' ? { top: 0, bottom: BAR, height: BAR } : { top: 0, bottom: 0, height: 0 }) as DOMRect
  })
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(100)
  return { ref: { current: chart }, move }
}

const scrolled = () => {
  act(() => {
    window.dispatchEvent(new Event('scroll'))
  })
  act(() => {
    vi.advanceTimersByTime(20)
  })
}

describe('ChartTooltip on a phone', () => {
  it('opens on the side of its chart with more room, and scrolls nothing', () => {
    docked = true
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const lines = [{ label: 'Plan', value: '1k €' }]
    const low = scene(window.innerHeight - 300, window.innerHeight - 70)
    const { unmount } = render(<ChartTooltip title="Year 5" lines={lines} anchor={null} chart={low.ref} />)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Year 5')
    expect(screen.getByRole('tooltip')).toHaveClass(chartStyles.tooltipAbove!)
    unmount()
    const high = scene(80, 310)
    render(<ChartTooltip title="Year 5" lines={lines} anchor={null} chart={high.ref} />)
    expect(screen.getByRole('tooltip')).toHaveClass(chartStyles.tooltipPinned!)
    // It is laid over the page, so nothing needs to move for it to be seen.
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('is never moved off its chart by an offset: it sits on the chart edge and moves with it', () => {
    docked = true
    const s = scene(window.innerHeight - 300, window.innerHeight - 70)
    render(<ChartTooltip title="Year 1" lines={[]} anchor={{ x: 1, y: 1 }} chart={s.ref} />)
    const panel = screen.getByRole('tooltip')
    expect(panel.style.transform).toBe('')
    // The page scrolls, and the chart is where it was and then nowhere near the header or tab bar:
    // the panel is not slid, pinned or measured into another place.
    s.move(window.innerHeight - 400, window.innerHeight - 170)
    scrolled()
    expect(screen.getByRole('tooltip')).toBe(panel)
    expect(panel.style.transform).toBe('')
    expect(panel).toHaveClass(chartStyles.tooltipAbove!)
  })

  it('changes side as the page scrolls under it, once the side it is on runs out of room', () => {
    docked = true
    const s = scene(window.innerHeight - 300, window.innerHeight - 70)
    render(<ChartTooltip title="Year 1" lines={[]} anchor={null} chart={s.ref} />)
    expect(screen.getByRole('tooltip')).toHaveClass(chartStyles.tooltipAbove!)
    // The chart scrolled up the screen: the panel (100px) would be under the header.
    s.move(80, 310)
    scrolled()
    expect(screen.getByRole('tooltip')).toHaveClass(chartStyles.tooltipPinned!)
  })

  it('is pinned to the screen, across the chart, when it goes below, and back on the chart when above', () => {
    docked = true
    const s = scene(80, 310)
    // The chart has a left edge and a width of its own.
    const rect = (t: number, b: number) => ({ top: t, bottom: b, height: b - t, left: 16, width: 343 }) as DOMRect
    s.ref.current.getBoundingClientRect = () => rect(80, 310)
    render(<ChartTooltip title="Year 1" lines={[]} anchor={null} chart={s.ref} />)
    const panel = screen.getByRole('tooltip')
    expect(panel).toHaveClass(chartStyles.tooltipPinned!)
    expect(panel).not.toHaveClass(chartStyles.tooltipAbove!)
    expect(panel.style.left).toBe('16px')
    expect(panel.style.width).toBe('343px')
    // The screen changes width: the panel follows the chart across.
    s.ref.current.getBoundingClientRect = () => ({ ...rect(80, 310), left: 8, width: 400 })
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    expect(panel.style.left).toBe('8px')
    expect(panel.style.width).toBe('400px')
    // The chart is lower on the screen and the panel goes above it: back to the chart's own width.
    s.ref.current.getBoundingClientRect = () => rect(window.innerHeight - 300, window.innerHeight - 70)
    scrolled()
    expect(panel).toHaveClass(chartStyles.tooltipAbove!)
    expect(panel.style.left).toBe('')
    expect(panel.style.width).toBe('')
  })

  it('is not shown while its chart is mostly off screen, and comes back with it', () => {
    docked = true
    const io = installFakeIntersectionObserver()
    // Below the fold when the tooltip is first drawn: measured at once, not shown.
    const s = scene(window.innerHeight + 100, window.innerHeight + 330)
    render(<ChartTooltip title="Year 1" lines={[]} anchor={null} chart={s.ref} />)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    s.move(window.innerHeight - 300, window.innerHeight - 70)
    act(() => io.emit(0.8))
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    // The chart scrolled away: the panel would hang over whatever is there now.
    act(() => io.emit(0.1, 0))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    // Back: chosen afresh, for where the chart is now.
    s.move(80, 310)
    act(() => io.emit(0.8, 0))
    expect(screen.getByRole('tooltip')).toHaveClass(chartStyles.tooltipPinned!)
  })

  it('tells whoever drew the chart whether it is on screen, and that it is gone when it closes', () => {
    docked = true
    const io = installFakeIntersectionObserver()
    const s = scene(window.innerHeight - 300, window.innerHeight - 70)
    const report = vi.fn()
    const { unmount } = render(
      <TooltipVisibilityContext.Provider value={report}>
        <ChartTooltip title="Year 1" lines={[]} anchor={null} chart={s.ref} />
      </TooltipVisibilityContext.Provider>,
    )
    // The chart is the first thing observed; nothing is showing yet, so nothing is reported.
    act(() => io.emit(0.8, 0))
    expect(report).toHaveBeenLastCalledWith(false)
    // The panel is the second: nothing is reported as on screen until it says so.
    act(() => io.emit(0.6, 1))
    expect(report).toHaveBeenLastCalledWith(true)
    act(() => io.emit(0.1, 1))
    expect(report).toHaveBeenLastCalledWith(false)
    act(() => io.emit(0.6, 1))
    // The chart going away takes the panel with it, and that is reported too.
    act(() => io.emit(0.1, 0))
    expect(report).toHaveBeenLastCalledWith(false)
    act(() => io.emit(0.8, 0))
    act(() => io.emit(0.6, 1))
    unmount()
    expect(report).toHaveBeenLastCalledWith(false)
  })

  it('opens above and is always shown when it has no chart to follow', () => {
    docked = true
    render(<ChartTooltip title="Year 5" lines={[]} anchor={null} />)
    expect(screen.getByRole('tooltip')).toHaveClass(chartStyles.tooltipAbove!)
  })
})

describe('ChartTooltip on a wide screen', () => {
  it('floats beside the anchor, and scrolls nothing', () => {
    docked = false
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    render(<ChartTooltip title="Year 5" lines={[]} anchor={{ x: 10, y: 10 }} />)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Year 5')
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('observes nothing, since the floating tooltip is not tied to the page', () => {
    docked = false
    const io = installFakeIntersectionObserver()
    const s = scene(80, 310)
    render(<ChartTooltip title="Year 5" lines={[]} anchor={{ x: 10, y: 10 }} chart={s.ref} />)
    expect(io.live()).toHaveLength(0)
  })
})
