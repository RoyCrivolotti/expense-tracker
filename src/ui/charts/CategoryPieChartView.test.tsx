import { render, screen, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CategoryPieChartView, type PieSlice } from './CategoryPieChartView'
import chartStyles from './charts.module.css'
import { installFakeBars } from '../../testing/fakeBars'
import { installFakeMatchMedia } from '../../testing/fakeMatchMedia'

// Made again for every test: a phone's answer, once set, would otherwise stay for the tests after it.
beforeEach(() => {
  installFakeMatchMedia()
})

afterEach(() => {
  vi.restoreAllMocks()
})

function makeSlices(): PieSlice[] {
  return [
    { name: 'Food', cents: 5000, d: 'M0 0', color: '#f00', total: 10000, labelX: 50, labelY: 50 },
    { name: 'Rent', cents: 3000, d: 'M0 0', color: '#0f0', total: 10000, labelX: 60, labelY: 60 },
    { name: 'Fun', cents: 2000, d: 'M0 0', color: '#00f', total: 10000, labelX: 70, labelY: 70 },
  ]
}

describe('CategoryPieChartView legend pointer events', () => {
  it('fires onShow on pointerEnter over a legend item', () => {
    const onShow = vi.fn()
    const { container } = render(
      <CategoryPieChartView paths={makeSlices()} active={null} onShow={onShow} onHide={vi.fn()} />,
    )
    const items = container.querySelectorAll('li')
    fireEvent.pointerEnter(items[1]!)
    expect(onShow).toHaveBeenCalledWith(1)
  })

  it('fires onHide on pointerLeave only for mouse', () => {
    const onHide = vi.fn()
    const { container } = render(
      <CategoryPieChartView paths={makeSlices()} active={0} onShow={vi.fn()} onHide={onHide} />,
    )
    const items = container.querySelectorAll('li')

    fireEvent.pointerLeave(items[0]!, { pointerType: 'touch' })
    expect(onHide).not.toHaveBeenCalled()

    fireEvent.pointerLeave(items[0]!, { pointerType: 'mouse' })
    expect(onHide).toHaveBeenCalledOnce()
  })

  it('fires onShow on pointerDown (tap) on a legend item', () => {
    const onShow = vi.fn()
    const { container } = render(
      <CategoryPieChartView paths={makeSlices()} active={null} onShow={onShow} onHide={vi.fn()} />,
    )
    const items = container.querySelectorAll('li')
    fireEvent.pointerDown(items[2]!)
    expect(onShow).toHaveBeenCalledWith(2)
  })

  it('renders legend items with correct category names', () => {
    render(
      <CategoryPieChartView paths={makeSlices()} active={null} onShow={vi.fn()} onHide={vi.fn()} />,
    )
    expect(screen.getByText('Food')).toBeDefined()
    expect(screen.getByText('Rent')).toBeDefined()
    expect(screen.getByText('Fun')).toBeDefined()
  })
})

describe('CategoryPieChartView tooltip on a phone', () => {
  it('does not dock below the chart: its own legend already reads the active slice', () => {
    installFakeMatchMedia(() => true)
    installFakeBars()
    // Mounted with nothing selected first, then given a selection, as a real tap would: mounting
    // straight in with `active` already set would (in this test environment only, per a React
    // ref-commit-order quirk with an ancestor ref and its child in the very same commit) settle
    // before `colRef` was attached, unlike a real tap, which always lands well after the chart's
    // own ref is set.
    const { container, rerender } = render(
      <CategoryPieChartView paths={makeSlices()} active={null} onShow={vi.fn()} onHide={vi.fn()} />,
    )
    // No room above the chart, and plenty below.
    container.querySelector<HTMLElement>(`.${chartStyles.pieChartCol}`)!.getBoundingClientRect = () =>
      ({ top: 20, bottom: 240, height: 220 }) as DOMRect
    rerender(<CategoryPieChartView paths={makeSlices()} active={0} onShow={vi.fn()} onHide={vi.fn()} />)
    // Not shown to the user or the accessibility tree...
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    // ...but still mounted, drawn invisible, since useTooltipSide needs it to keep measuring.
    const panel = container.querySelector(`.${chartStyles.tooltipDocked}`)
    expect(panel).not.toBeNull()
    expect(panel).toHaveClass(chartStyles.tooltipDockedBelowSuppressed!)
    // The legend is the readout instead: it already named and valued the active slice.
    expect(container.querySelector(`li.${chartStyles.legendActive}`)).toHaveTextContent('Food')
  })
})
