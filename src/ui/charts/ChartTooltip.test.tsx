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
