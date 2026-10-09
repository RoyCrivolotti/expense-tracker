import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EU_MONEY_FORMAT } from '../../../../engine/money'
import { makeScenario } from '../../../../testing/factories'
import { AssumedInflationContext } from '../../../hooks/assumedInflationContext'
import { formatMoneyShort } from '../chartTheme'
import { PlanStrip } from './PlanStrip'

function draftOf(overrides = {}) {
  const { id, ...rest } = makeScenario(overrides)
  void id
  return rest
}

// No return, no saving and no house: the net worth stays 100.000 euros whatever the year, so what it comes to
// on the account is that grown by the inflation for the ten years.
const flat = {
  startInvestedCents: 10_000_000,
  monthlyContributionCents: 0,
  expectedRealReturn: 0,
  horizonYears: 10,
  housePurchaseYear: null,
  annualSpendCents: 0,
  planStartDate: '2026-01-01',
}
const short = (cents: number) => formatMoneyShort(cents, EU_MONEY_FORMAT)

function renderStrip(inflation: number, overrides = {}) {
  return render(
    <AssumedInflationContext.Provider value={inflation}>
      <PlanStrip draft={draftOf({ ...flat, ...overrides })} milestones={[]} />
    </AssumedInflationContext.Provider>,
  )
}

describe('PlanStrip', () => {
  it('says where the plan ends in both moneys: in the plan\'s euros and on the account in that year', () => {
    renderStrip(0.02)
    expect(screen.getByText('Net worth at year 10')).toBeInTheDocument()
    expect(
      screen.getByText(`${short(10_000_000)} in 2026 euros, about ${short(12_189_944)} on your account in 2036`),
    ).toBeInTheDocument()
  })

  it('says once that the two are the same when there is no inflation', () => {
    renderStrip(0)
    expect(screen.getByText(`${short(10_000_000)} in 2026 euros, the same on your account in 2036`)).toBeInTheDocument()
  })

  it('names the year by the plan year, and the money today\'s euros, for a plan with no start date', () => {
    renderStrip(0.02, { horizonYears: 1, planStartDate: null })
    expect(screen.getByText('Net worth at year 1')).toBeInTheDocument()
    expect(screen.getByText(/in today's euros, about .* on your account in year 1$/)).toBeInTheDocument()
  })

  it('keeps the net worth first, ahead of the year FI is reached', () => {
    renderStrip(0.02, { annualSpendCents: 100_000, safeWithdrawalRate: 0.04 })
    const labels = Array.from(document.querySelectorAll('p > span > span')).map((el) => el.textContent)
    expect(labels[0]).toBe('Net worth at year 10')
    expect(labels).toContain('Financial independence')
  })
})
