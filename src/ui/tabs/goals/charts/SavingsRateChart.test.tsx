import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { SavingsRateChart } from './SavingsRateChart'
import { makeScenario } from '../../../../testing/factories'
import type { MonthlyFlow } from '../../../../engine'

beforeAll(() => {
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

function draft(planStartDate: string | null) {
  const { id, isActive, ...rest } = makeScenario({ planStartDate, monthlyContributionCents: 50_000 })
  void id
  void isActive
  return rest
}

const flow = (month: string, investedCents: number, netSavingCents: number): MonthlyFlow => ({
  month,
  investedCents,
  netSavingCents,
})

describe('SavingsRateChart', () => {
  it('compares investing, not net saving, with the plan and says so', () => {
    render(<SavingsRateChart draft={draft(null)} monthly={[flow('2026-06', 40_000, 285_695)]} />)
    expect(screen.getByText('Actual investing vs plan')).toBeInTheDocument()
    expect(screen.getByText(/Investment transactions per month vs the 500,00 €\/mo/)).toBeInTheDocument()
    expect(screen.getByText('Invested')).toBeInTheDocument()
    expect(screen.getByText('Net saving')).toBeInTheDocument()
  })

  it('counts from the plan start when the plan has one', () => {
    render(
      <SavingsRateChart
        draft={draft('2026-03-15')}
        monthly={[flow('2026-01', 1, 1), flow('2026-03', 2, 2), flow('2026-06', 3, 3)]}
      />,
    )
    expect(screen.getByText(/since the plan started/)).toBeInTheDocument()
    expect(screen.queryByText('01/26')).toBeNull()
    expect(screen.getByText('03/26')).toBeInTheDocument()
  })

  it('explains itself when there is no history', () => {
    render(<SavingsRateChart draft={draft(null)} monthly={[]} />)
    expect(screen.getByText(/No monthly history yet/)).toBeInTheDocument()
  })
})
