import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { makeScenario } from '../../../../testing/factories'
import { FireChart } from './FireChart'

function draftOf(overrides: Parameters<typeof makeScenario>[0]) {
  const { id, isActive, ...draft } = makeScenario(overrides)
  void id
  void isActive
  return draft
}

describe('FireChart', () => {
  it('draws the drawdown from the year FI is reached', () => {
    // Already past a 600k target, so it is reached in year 0.
    const draft = draftOf({ startInvestedCents: 1_000_000_00, annualSpendCents: 2_400_000, safeWithdrawalRate: 0.04 })

    const { container } = render(<FireChart draft={draft} />)

    expect(screen.getByText(/reached year 0/)).toBeInTheDocument()
    expect(screen.getByText('Portfolio balance')).toBeInTheDocument()
    expect(container.querySelector('svg[role="img"]')).not.toBeNull()
  })

  it('draws no balance where FI is never reached, rather than one that starts at the target', () => {
    // 100 a month for ten years does not make 600k.
    const draft = draftOf({
      startInvestedCents: 0,
      monthlyContributionCents: 10_000,
      horizonYears: 10,
      annualSpendCents: 2_400_000,
      safeWithdrawalRate: 0.04,
    })

    const { container } = render(<FireChart draft={draft} />)

    expect(screen.getByText(/not reached in the horizon, so there is no drawdown to show/)).toBeInTheDocument()
    expect(screen.queryByText('Portfolio balance')).not.toBeInTheDocument()
    expect(container.querySelector('svg[role="img"]')).toBeNull()
  })
})
