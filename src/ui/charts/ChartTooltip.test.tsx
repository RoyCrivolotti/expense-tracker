import { render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { ChartTooltip } from './ChartTooltip'
import chartStyles from './charts.module.css'

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

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ChartTooltip', () => {
  it('opens on the side it is given on a phone, and scrolls nothing', () => {
    docked = true
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const lines = [{ label: 'Plan', value: '1k €' }]
    const { rerender } = render(<ChartTooltip title="Year 5" lines={lines} anchor={null} side="below" />)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Year 5')
    expect(screen.getByRole('tooltip')).toHaveClass(chartStyles.tooltipBelow!)
    rerender(<ChartTooltip title="Year 5" lines={lines} anchor={null} side="above" />)
    expect(screen.getByRole('tooltip')).toHaveClass(chartStyles.tooltipAbove!)
    // It is laid over the page, so nothing needs to move for it to be seen.
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('slides back into the free band when it hangs out of it, over the chart if it must', () => {
    docked = true
    // The bars' probes are 60px; the tooltip itself is what the test moves around.
    let panel = { top: 10, bottom: 300 }
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.style.visibility === 'hidden') return { top: 0, bottom: 60, height: 60 } as DOMRect
      return { ...panel, height: panel.bottom - panel.top } as DOMRect
    })
    const { rerender } = render(<ChartTooltip title="Year 5" lines={[]} anchor={null} side="above" />)
    // Poking 50px above the band's top (60px): moved down.
    expect(screen.getByRole('tooltip').style.transform).toBe('translateY(50px)')
    // Hanging below the band: moved up.
    panel = { top: 500, bottom: window.innerHeight + 100 }
    rerender(<ChartTooltip title="Year 6" lines={[]} anchor={null} side="below" />)
    expect(screen.getByRole('tooltip').style.transform).toBe(`translateY(${-160}px)`)
    // Inside: not moved.
    panel = { top: 200, bottom: 400 }
    rerender(<ChartTooltip title="Year 7" lines={[]} anchor={null} side="below" />)
    expect(screen.getByRole('tooltip').style.transform).toBe('')
  })

  it('opens above when no side is given', () => {
    docked = true
    render(<ChartTooltip title="Year 5" lines={[]} anchor={null} />)
    expect(screen.getByRole('tooltip')).toHaveClass(chartStyles.tooltipAbove!)
  })

  it('floats beside the anchor on a wide screen, and scrolls nothing', () => {
    docked = false
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    render(<ChartTooltip title="Year 5" lines={[]} anchor={{ x: 10, y: 10 }} />)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Year 5')
    expect(scrollIntoView).not.toHaveBeenCalled()
  })
})
