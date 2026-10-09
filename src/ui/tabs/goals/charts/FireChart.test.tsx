import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { makeScenario } from '../../../../testing/factories'
import { AssumedInflationContext } from '../../../hooks/assumedInflationContext'
import { formatMoneyShort } from '../chartTheme'
import { onAccountCents } from '../bothMoneys'
import { EU_MONEY_FORMAT } from '../../../../engine/money'
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

    expect(screen.getByText(/not reached in the horizon \(.*, when the plan ends\), so there is no drawdown to show/)).toBeInTheDocument()
    expect(screen.queryByText('Portfolio balance')).not.toBeInTheDocument()
    expect(container.querySelector('svg[role="img"]')).toBeNull()
  })
})

describe('FireChart in both moneys', () => {
  const short = (cents: number) => formatMoneyShort(cents, EU_MONEY_FORMAT)
  const renderChart = (draft: ReturnType<typeof draftOf>, inflation = 0.02) =>
    render(
      <AssumedInflationContext.Provider value={inflation}>
        <FireChart draft={draft} />
      </AssumedInflationContext.Provider>,
    )

  it('says the target in the plan\'s euros and on the account in the year it is reached, and that the drawdown is in the plan\'s euros', () => {
    // 24.000 a year at 4% is a 600.000 target, which 1.000.000 already passes: reached in year 0.
    renderChart(draftOf({ startInvestedCents: 100_000_000, annualSpendCents: 2_400_000, safeWithdrawalRate: 0.04, planStartDate: '2026-01-01' }))
    expect(screen.getByText(/^FI target 600k € in 2026 euros · reached year 0 \(the same on your account in 2026\)\./)).toBeInTheDocument()
    expect(screen.getByText(/withdraws a constant amount in 2026 euros/)).toBeInTheDocument()
  })

  it('says what the target would be on the account at the end of the plan where FI is never reached', () => {
    renderChart(
      draftOf({ startInvestedCents: 0, monthlyContributionCents: 10_000, horizonYears: 10, annualSpendCents: 3_000_000, planStartDate: '2026-01-01' }),
    )
    expect(
      screen.getByText(
        `FI target 750k € in 2026 euros · not reached in the horizon (about ${short(onAccountCents(75_000_000, 10, 0.02))} on your account in 2036, when the plan ends), so there is no drawdown to show. The same spending needs 750k € at 4,0%, 857k € at 3,5% or 1,0M € at 3,0%.`,
      ),
    ).toBeInTheDocument()
  })

  it('says the target on the account where the plan reaches it later', () => {
    const draft = draftOf({ startInvestedCents: 40_000_000, monthlyContributionCents: 500_000, horizonYears: 20, annualSpendCents: 3_000_000, planStartDate: '2026-01-01' })
    renderChart(draft)
    const text = screen.getByText(/^FI target 750k € in 2026 euros · reached year \d+ \(about /).textContent
    const year = Number(/reached year (\d+)/.exec(text)?.[1])
    expect(year).toBeGreaterThan(0)
    expect(text).toContain(`(about ${short(onAccountCents(75_000_000, year, 0.02))} on your account in ${2026 + year})`)
  })
})
