import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { buildExpenseModel } from '../buildExpenseModel'
import { makeDataset, makeTransaction } from '../../testing/factories'
import { AnalyticsTab } from './AnalyticsTab'

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }),
  })
})

describe('AnalyticsTab', () => {
  it('shows the empty state when there is no data', () => {
    render(<AnalyticsTab model={buildExpenseModel(makeDataset())} month="" onMonthChange={vi.fn()} />)
    expect(screen.getByText(/No data yet/)).toBeInTheDocument()
  })

  it('renders the three-view shell once there is data', () => {
    const model = buildExpenseModel(
      makeDataset({ transactions: [makeTransaction({ id: 1, budgetMonth: '2026-01' })] }),
    )
    render(<AnalyticsTab model={model} month="2026-01" onMonthChange={vi.fn()} />)
    expect(screen.getByRole('tablist', { name: 'Analytics view' })).toBeInTheDocument()
  })
})
