import { fireEvent, render, screen } from '@testing-library/react'
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
  it('draws the drawdown for the years the money must last, not for the plan\'s horizon', () => {
    const draft = draftOf({ startInvestedCents: 1_000_000_00, annualSpendCents: 2_400_000, horizonYears: 10, retirementYears: 50 })
    const { container } = render(<FireChart draft={draft} />)
    const svg = container.querySelector('svg[role="img"]')!
    fireEvent.keyDown(svg, { key: 'End' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('Year 50')
    expect(screen.getByText(/runs for the 50 years the money must last/)).toBeInTheDocument()
  })

  it('draws 30 years for a scenario that has not said, as it always did', () => {
    const { container } = render(<FireChart draft={draftOf({ startInvestedCents: 1_000_000_00, annualSpendCents: 2_400_000 })} />)
    fireEvent.keyDown(container.querySelector('svg[role="img"]')!, { key: 'End' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('Year 30')
  })

  it('says what the same spending needs at 4%, 3,5% and 3%', () => {
    // 30.000 € a year.
    render(<FireChart draft={draftOf({ startInvestedCents: 1_000_000_00, annualSpendCents: 3_000_000 })} />)
    expect(screen.getByText(/The same spending needs 750k € at 4,0%, 857k € at 3,5% or 1,0M € at 3,0%\./)).toBeInTheDocument()
  })

  it('says it too where FI is never reached', () => {
    render(<FireChart draft={draftOf({ startInvestedCents: 0, monthlyContributionCents: 10_000, horizonYears: 10, annualSpendCents: 3_000_000 })} />)
    expect(screen.getByText(/The same spending needs 750k € at 4,0%/)).toBeInTheDocument()
  })

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
