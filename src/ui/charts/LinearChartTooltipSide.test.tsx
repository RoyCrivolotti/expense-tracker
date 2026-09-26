import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LinearChart } from './LinearChart'
import chartStyles from './charts.module.css'

const props = {
  height: 200,
  series: [{ id: 's', color: '#6366f1', values: [10, 20, 30] }],
  xLabels: ['0', '1', '2'],
  formatValue: String,
  ariaLabel: 'Test chart',
  tooltip: (i: number) => ({ title: `Year ${i}`, lines: [{ label: 'Net worth', value: `${i}k` }] }),
}

function phone() {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: true,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
}

function chartAt(top: number, bottom: number) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top, bottom, height: 0 } as DOMRect)
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('the tooltip of a chart on a phone', () => {
  it('opens above a chart low on the screen, where there is more room above', () => {
    phone()
    chartAt(window.innerHeight - 260, window.innerHeight - 30)
    const { container } = render(<LinearChart {...props} />)
    // Nothing until a point is tapped.
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    fireEvent.keyDown(container.querySelector('svg')!, { key: 'Home' })
    expect(screen.getByRole('tooltip')).toHaveClass(chartStyles.tooltipAbove!)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Year 0')
  })

  it('opens below a chart high on the screen, and stays there as the point changes', () => {
    phone()
    chartAt(80, 310)
    const { container } = render(<LinearChart {...props} />)
    const svg = container.querySelector('svg')!
    fireEvent.keyDown(svg, { key: 'Home' })
    expect(screen.getByRole('tooltip')).toHaveClass(chartStyles.tooltipBelow!)
    fireEvent.keyDown(svg, { key: 'ArrowRight' })
    expect(screen.getByRole('tooltip')).toHaveClass(chartStyles.tooltipBelow!)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Year 1')
  })
})
