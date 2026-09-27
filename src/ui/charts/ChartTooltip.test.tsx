import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChartTooltip } from './ChartTooltip'
import chartStyles from './charts.module.css'
import { installFakeBars } from '../../testing/fakeBars'
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

/** The bars' probes are 60px; the chart is where the test puts it, and the panel is `panelHeight` tall. */
function scene(top: number, bottom: number, panelHeight = 100) {
  const chart = document.createElement('div')
  const move = (t: number, b: number) => {
    chart.getBoundingClientRect = () => ({ top: t, bottom: b, height: b - t }) as DOMRect
  }
  move(top, bottom)
  installFakeBars()
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(panelHeight)
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
    expect(screen.getByRole('tooltip')).toHaveClass(chartStyles.tooltipBelow!)
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
    expect(screen.getByRole('tooltip')).toHaveClass(chartStyles.tooltipBelow!)
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
    expect(screen.getByRole('tooltip')).toHaveClass(chartStyles.tooltipBelow!)
  })

  it('opens above and is always shown when it has no chart to follow', () => {
    docked = true
    render(<ChartTooltip title="Year 5" lines={[]} anchor={null} />)
    expect(screen.getByRole('tooltip')).toHaveClass(chartStyles.tooltipAbove!)
  })

  it('draws an ordinary panel at its natural height, with taps passing through, while it fits', () => {
    docked = true
    const s = scene(window.innerHeight - 300, window.innerHeight - 70, 100)
    render(<ChartTooltip title="Year 1" lines={[]} anchor={null} chart={s.ref} />)
    const panel = screen.getByRole('tooltip')
    expect(panel).not.toHaveClass(chartStyles.tooltipScrollable!)
    expect(panel.style.maxHeight).toBe('')
  })

  it('scrolls its own rows, and stops passing taps through, once it no longer fits either side', () => {
    docked = true
    // Little room on either side, and a panel far taller than either has to give it.
    const s = scene(window.innerHeight / 2 - 40, window.innerHeight / 2 + 40, 900)
    render(<ChartTooltip title="Year 1" lines={[]} anchor={null} chart={s.ref} />)
    const panel = screen.getByRole('tooltip')
    expect(panel).toHaveClass(chartStyles.tooltipScrollable!)
    expect(panel.style.maxHeight).not.toBe('')
  })

  describe('with dockBelow false, for a chart with its own readout to fall back to', () => {
    it('still opens above a chart with room there', () => {
      docked = true
      const low = scene(window.innerHeight - 300, window.innerHeight - 70)
      render(<ChartTooltip title="Year 5" lines={[]} anchor={null} chart={low.ref} dockBelow={false} />)
      expect(screen.getByRole('tooltip')).toHaveClass(chartStyles.tooltipAbove!)
    })

    it('stays mounted but invisible, and out of the accessibility tree, where it would go below', () => {
      docked = true
      // No room above: without dockBelow this docks below instead.
      const high = scene(80, 310)
      const { container } = render(
        <ChartTooltip title="Year 5" lines={[]} anchor={null} chart={high.ref} dockBelow={false} />,
      )
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
      const panel = container.querySelector(`.${chartStyles.tooltipDocked}`)
      expect(panel).not.toBeNull()
      expect(panel).toHaveClass(chartStyles.tooltipBelow!, chartStyles.tooltipDockedBelowSuppressed!)
    })

    it('reappears once scrolling gives it room above again', () => {
      docked = true
      const s = scene(80, 310)
      render(<ChartTooltip title="Year 5" lines={[]} anchor={null} chart={s.ref} dockBelow={false} />)
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
      s.move(window.innerHeight - 300, window.innerHeight - 70)
      scrolled()
      expect(screen.getByRole('tooltip')).toHaveClass(chartStyles.tooltipAbove!)
    })
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
