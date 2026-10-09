import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { makeScenario } from '../../../../testing/factories'
import { AssumedInflationContext } from '../../../hooks/assumedInflationContext'
import { MarketVolatilityContext } from '../../../hooks/marketVolatilityContext'
import { fireNumber, replayRetirement } from '../../../../engine'
import { runsOfHundred } from './retirementOddsLine'
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

describe('FireChart chance the money lasts', () => {
  // 24.000 a year at 4% is a 600.000 target, which 1.000.000 already passes.
  const reaching = () => draftOf({ startInvestedCents: 100_000_000, annualSpendCents: 2_400_000, safeWithdrawalRate: 0.04, retirementYears: 30 })
  const lasts = (draft: ReturnType<typeof draftOf>, rate: number, volatility = 0.15) =>
    runsOfHundred(
      replayRetirement({
        startCents: fireNumber(draft.annualSpendCents, rate),
        annualWithdrawalCents: draft.annualSpendCents,
        realReturn: draft.expectedRealReturn,
        volatility,
        years: draft.retirementYears,
        runs: 10_000,
      }).lasts,
    )

  it('says in how many of 100 runs the money lasts at the plan\'s rate and at the usual ones, where FI is reached', () => {
    const draft = reaching()
    render(<FireChart draft={draft} />)
    const text = screen.getByText(/^Started at the target, with the spending taken out each year/).textContent
    expect(text).toContain(`the money lasts all 30 years in ${lasts(draft, 0.04)} of 100 runs at your 4,0%`)
    expect(text).toContain(`${lasts(draft, 0.035)} at 3,5% and ${lasts(draft, 0.03)} at 3,0%.`)
    expect(text).toContain('The typical return is')
    // The plan's own 4% is said once, not again in the list of the others.
    expect(text.match(/4,0%/g)).toHaveLength(1)
  })

  it('says it where FI is never reached too, as it is about how safe the target is', () => {
    render(<FireChart draft={draftOf({ startInvestedCents: 0, monthlyContributionCents: 10_000, horizonYears: 10, annualSpendCents: 3_000_000 })} />)
    expect(screen.getByText(/^Started at the target, with the spending taken out each year/)).toBeInTheDocument()
  })

  it('names the plan\'s own rate when it is not one of the usual three, and follows the years the money must last', () => {
    const draft = draftOf({ startInvestedCents: 100_000_000, annualSpendCents: 2_400_000, safeWithdrawalRate: 0.0325, retirementYears: 50 })
    render(<FireChart draft={draft} />)
    const text = screen.getByText(/^Started at the target/).textContent
    expect(text).toContain(`all 50 years in ${lasts(draft, 0.0325)} of 100 runs at your 3,25%`)
    expect(text).toContain(`${lasts(draft, 0.04)} at 4,0%, ${lasts(draft, 0.035)} at 3,5% and ${lasts(draft, 0.03)} at 3,0%`)
  })

  it('uses the owner\'s market bounce: a calmer market lasts more often than a wilder one', () => {
    const draft = reaching()
    const at = (volatility: number) => {
      const { unmount } = render(
        <MarketVolatilityContext.Provider value={volatility}>
          <FireChart draft={draft} />
        </MarketVolatilityContext.Provider>,
      )
      const text = screen.getByText(/^Started at the target/).textContent
      unmount()
      return { text, own: Number(/lasts all 30 years in (\d+) of 100/.exec(text)?.[1]) }
    }
    const calm = at(0.05)
    const wild = at(0.3)
    expect(calm.text).toContain('bounce of 5,0%')
    expect(wild.text).toContain('bounce of 30,0%')
    expect(calm.own).toBe(lasts(draft, 0.04, 0.05))
    expect(wild.own).toBe(lasts(draft, 0.04, 0.3))
    expect(calm.own).toBeGreaterThan(wild.own)
  })

  it('has nothing to say without spending to cover', () => {
    render(<FireChart draft={draftOf({ startInvestedCents: 100_000_000, annualSpendCents: 0 })} />)
    expect(screen.queryByText(/Started at the target/)).not.toBeInTheDocument()
  })
})
