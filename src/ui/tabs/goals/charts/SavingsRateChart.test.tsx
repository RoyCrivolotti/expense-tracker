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

  it('says the amounts are in euros as they went through the account, not in the plan\'s euros', () => {
    render(<SavingsRateChart draft={draft(null)} monthly={[flow('2026-06', 40_000, 285_695)]} />)
    expect(screen.getByText(/In euros as they went through the account\./)).toBeInTheDocument()
  })

  it('names where the plan goes when it changes its monthly amount, and draws it as a line of its own', () => {
    const months = [flow('2026-04', 1, 1), flow('2026-05', 2, 2), flow('2026-06', 3, 3), flow('2026-07', 4, 4)]
    const dashedPaths = (container: HTMLElement) => container.querySelectorAll('path[stroke-dasharray]').length
    const flat = render(<SavingsRateChart draft={draft('2026-01-01')} monthly={months} />)
    const flatDashed = dashedPaths(flat.container)
    flat.unmount()

    const stepped = { ...draft('2026-01-01'), contributionSchedule: [{ from: '2026-06', monthlyCents: 90_000 }] }
    const { container } = render(<SavingsRateChart draft={stepped} monthly={months} />)
    expect(screen.getByText(/vs the plan, which goes from 500,00 € to 900,00 €\/mo over these months/)).toBeInTheDocument()
    // The plan is a series of its own, dashed like the net saving, instead of a flat line across.
    expect(dashedPaths(container)).toBe(flatDashed + 1)
  })

  it('draws one flat line for a plan that does not change, as before', () => {
    render(
      <SavingsRateChart draft={draft('2026-01-01')} monthly={[flow('2026-04', 1, 1), flow('2026-05', 2, 2)]} />,
    )
    expect(screen.getByText(/vs the 500,00 €\/mo this scenario assumes/)).toBeInTheDocument()
    expect(screen.queryByText(/goes from/)).toBeNull()
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
