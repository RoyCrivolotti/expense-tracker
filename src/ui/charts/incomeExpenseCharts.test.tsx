import { fireEvent, render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { buildExpenseModel } from '../buildExpenseModel'
import { makeDataset, makeTransaction } from '../../testing/factories'
import { MonthlyIncomeExpenseChart } from './MonthlyIncomeExpenseChart'
import { YtdIncomeExpenseChart } from './YtdIncomeExpenseChart'

beforeAll(() => {
  // The docked tooltip reads a media query; jsdom has no matchMedia.
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
})

function model() {
  return buildExpenseModel(
    makeDataset({
      transactions: [
        makeTransaction({ id: 1, budgetMonth: '2026-05', date: '2026-05-03', type: 'income', amountCents: 300_000 }),
        makeTransaction({ id: 2, budgetMonth: '2026-05', date: '2026-05-10', type: 'expense', amountCents: 40_000 }),
        makeTransaction({ id: 3, budgetMonth: '2026-06', date: '2026-06-03', type: 'income', amountCents: 320_000 }),
        makeTransaction({ id: 4, budgetMonth: '2026-06', date: '2026-06-12', type: 'expense', amountCents: 55_000 }),
      ],
    }),
  )
}

describe('the income and expense charts', () => {
  it('render the monthly bars and take keyboard focus', () => {
    const { container } = render(<MonthlyIncomeExpenseChart model={model()} />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('tabindex')).toBe('0')

    fireEvent.keyDown(svg, { key: 'ArrowRight' })
    expect(container.querySelector('svg')).not.toBeNull()
    fireEvent.keyDown(svg, { key: 'Escape' })
    fireEvent.blur(svg)
  })

  it('render the year-to-date lines and take keyboard focus', () => {
    const { container } = render(<YtdIncomeExpenseChart model={model()} month="2026-06" />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('tabindex')).toBe('0')

    fireEvent.keyDown(svg, { key: 'End' })
    expect(container.querySelector('svg')).not.toBeNull()
    fireEvent.keyDown(svg, { key: 'Home' })
  })
})

describe('the income and expense charts on a phone', () => {
  afterEach(() => vi.unstubAllGlobals())
  const onPhone = () =>
    vi.stubGlobal('matchMedia', (media: string) => ({
      matches: true,
      media,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  const live = (container: HTMLElement) => container.querySelector('[data-readout="live"]')!

  it('read the latest month before anything is tapped, and the tapped month after', () => {
    onPhone()
    const { container } = render(<MonthlyIncomeExpenseChart model={model()} />)
    expect(live(container)).toHaveTextContent('Jun')
    expect(live(container)).toHaveTextContent('Tap the chart to see another point')
    fireEvent.keyDown(container.querySelector('svg')!, { key: 'Home' })
    expect(live(container)).toHaveTextContent('Income')
    expect(live(container)).not.toHaveTextContent('Tap the chart')
  })

  it('show the year to date at the latest month too', () => {
    onPhone()
    const { container } = render(<YtdIncomeExpenseChart model={model()} month="2026-06" />)
    expect(live(container)).toHaveTextContent('Jun')
    expect(live(container)).toHaveTextContent('Net')
    fireEvent.keyDown(container.querySelector('svg')!, { key: 'Home' })
    expect(live(container)).toHaveTextContent('May')
  })
})
