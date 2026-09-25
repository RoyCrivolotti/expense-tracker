import { fireEvent, render } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
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
