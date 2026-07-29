import { render, screen, fireEvent } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { CategoryPieChartView, type PieSlice } from './CategoryPieChartView'

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
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
