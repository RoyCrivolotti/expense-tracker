import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LinearChart } from './LinearChart'
import type { TooltipLine } from './ChartTooltip'

function phone(matches: boolean) {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// Point 1 has an extra summary line, so it is the tallest; it and point 2 have detail lines.
function tooltip(i: number): { title: string; lines: TooltipLine[] } {
  const lines: TooltipLine[] = [{ label: 'Net worth', value: `${i}k` }]
  if (i === 1) lines.push({ label: 'Only at one point', value: 'x' })
  if (i === 2) lines.push({ label: 'Start of year', value: 'y', variant: 'detail' })
  return { title: `Year ${i}`, lines }
}

const props = {
  height: 200,
  series: [{ id: 's', color: '#6366f1', values: [10, 20, 30] }],
  xLabels: ['0', '1', '2'],
  formatValue: String,
  ariaLabel: 'Test chart',
  tooltip,
}

const live = (container: HTMLElement) => container.querySelector('[data-readout="live"]')!

describe('the docked readout on a phone', () => {
  it('is there before anything is tapped, above the chart, reading the last point', () => {
    phone(true)
    const { container } = render(<LinearChart {...props} />)
    const readout = screen.getByRole('status')
    expect(live(container)).toHaveTextContent('Year 2')
    expect(live(container)).toHaveTextContent('Tap the chart to see another point')
    // Above the svg, so it is on screen with a chart at the bottom of the page.
    expect(readout.compareDocumentPosition(container.querySelector('svg')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('follows the tapped point, and goes back to the last one when it is cleared', () => {
    phone(true)
    const { container } = render(<LinearChart {...props} />)
    const svg = container.querySelector('svg')!
    fireEvent.keyDown(svg, { key: 'Home' })
    expect(live(container)).toHaveTextContent('Year 0')
    expect(live(container)).not.toHaveTextContent('Tap the chart')
    fireEvent.keyDown(svg, { key: 'Escape' })
    expect(live(container)).toHaveTextContent('Year 2')
  })

  it('is as tall as its tallest point, so it never moves the chart under it', () => {
    phone(true)
    const { container } = render(<LinearChart {...props} />)
    const sizer = container.querySelector('[aria-hidden="true"]')!
    // The last point has one line; the sizer holds the two-line point.
    expect(live(container)).not.toHaveTextContent('Only at one point')
    expect(sizer).toHaveTextContent('Only at one point')
  })

  it('puts a point\'s detail lines under the chart, says so, and scrolls nothing', () => {
    phone(true)
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const { container } = render(<LinearChart {...props} />)
    // Not at rest: nothing under the chart until a point with detail is tapped.
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    const svg = container.querySelector('svg')!
    fireEvent.keyDown(svg, { key: 'End' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('Start of year')
    expect(screen.getByRole('tooltip').compareDocumentPosition(svg) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
    expect(live(container)).not.toHaveTextContent('Start of year')
    expect(live(container)).toHaveTextContent('Breakdown under the chart')
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('is not there when the chart hides its tooltip', () => {
    phone(true)
    render(<LinearChart {...props} tooltipMode="hidden" />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

describe('the tooltip on a wide screen', () => {
  it('floats at the pointer and has no readout', () => {
    phone(false)
    const { container } = render(<LinearChart {...props} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    fireEvent.keyDown(container.querySelector('svg')!, { key: 'Home' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('Year 0')
  })
})
