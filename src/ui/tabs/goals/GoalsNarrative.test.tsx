import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { GoalsNarrative } from './GoalsNarrative'
import { formatCents } from '../../../engine'
import { EU_MONEY_FORMAT } from '../../../engine/money'
import { makeScenario } from '../../../testing/factories'
import { AssumedInflationContext } from '../../hooks/assumedInflationContext'
import { onAccountCents } from './bothMoneys'
import { formatMoneyShort } from './chartTheme'
import { getNarrativeStats } from './narrativeStats'

// startInvestedCents is €100k, so €150k is the next milestone and €1M the top.
const next = { amountCents: 15_000_000, label: 'Coast FI' }
const top = { amountCents: 100_000_000, label: 'Two comma club' }

describe('GoalsNarrative', () => {
  it('names the next milestone in the compact strip, with its amount', () => {
    render(<GoalsNarrative draft={makeScenario()} milestones={[next, top]} compact />)
    expect(screen.getByText(/^Coast FI \(.*\) invested$/)).toBeTruthy()
  })

  it('narrates both the next milestone and the top of the ladder in full mode', () => {
    render(<GoalsNarrative draft={makeScenario()} milestones={[next, top]} />)
    expect(screen.getByText(/Coast FI \(.*\) invested lands around year/)).toBeTruthy()
    expect(screen.getByText(/Two comma club \(.*\) invested lands around year/)).toBeTruthy()
  })

  it('narrates a single milestone when the next one is also the top', () => {
    render(<GoalsNarrative draft={makeScenario()} milestones={[next]} />)
    const body = screen.getByText(/Coast FI \(.*\) invested lands around year/)
    expect(body.textContent?.match(/Coast FI/g)).toHaveLength(1)
  })

  it('says what the scenario invests, and each change to it with its month', () => {
    const draft = makeScenario({
      planStartDate: '2026-01-01',
      monthlyContributionCents: 1_500_00,
      contributionSchedule: [{ from: '2028-03', monthlyCents: 2_500_00 }],
    })
    render(<GoalsNarrative draft={draft} milestones={[]} />)
    expect(screen.getByText(/real return and 1\.500,00 €\/mo, then 2\.500,00 €\/mo from Mar '28 invested, your portfolio reaches/)).toBeTruthy()
  })

  it('says only the monthly amount for a scenario that never changes it', () => {
    render(<GoalsNarrative draft={makeScenario({ monthlyContributionCents: 1_500_00 })} milestones={[]} />)
    expect(screen.getByText(/real return and 1\.500,00 €\/mo invested, your portfolio reaches/)).toBeTruthy()
  })

  it('says so when a milestone is out of reach within the horizon', () => {
    const draft = makeScenario({ horizonYears: 2, monthlyContributionCents: 0 })
    render(<GoalsNarrative draft={draft} milestones={[top]} />)
    expect(screen.getByText(/Two comma club \(.*\) is not reached in the horizon/)).toBeTruthy()
  })

  it('says "1 yr", not "1 yrs", for a one year horizon, and "yrs" for any other', () => {
    const { rerender } = render(<GoalsNarrative draft={makeScenario({ horizonYears: 1 })} milestones={[]} compact />)
    expect(screen.getByText('Net worth in 1 yr')).toBeTruthy()

    rerender(<GoalsNarrative draft={makeScenario({ horizonYears: 30 })} milestones={[]} compact />)
    expect(screen.getByText('Net worth in 30 yrs')).toBeTruthy()
  })

  it('omits milestone prose entirely when there are none', () => {
    render(<GoalsNarrative draft={makeScenario()} milestones={[]} />)
    expect(screen.queryByText(/lands around year/)).toBeNull()
    expect(screen.getByText(/What this means/)).toBeTruthy()
  })

  it('omits the milestone stat from the compact strip when there are none', () => {
    render(<GoalsNarrative draft={makeScenario()} milestones={[]} compact />)
    expect(screen.getByText('Scenario summary')).toBeTruthy()
    expect(screen.queryByText(/invested$/)).toBeNull()
  })
})

describe('GoalsNarrative in both moneys', () => {
  // No return, no saving and no house: the net worth stays 100.000 euros, so what it comes to on the account
  // is that grown by the inflation for the ten years. 30.000 a year at 4% needs 750.000, which it never reaches.
  const flat = {
    startInvestedCents: 10_000_000,
    monthlyContributionCents: 0,
    expectedRealReturn: 0,
    horizonYears: 10,
    housePurchaseYear: null,
    annualSpendCents: 3_000_000,
    safeWithdrawalRate: 0.04,
    planStartDate: '2026-01-01',
  }
  const full = (cents: number) => formatCents(cents, EU_MONEY_FORMAT)
  const short = (cents: number) => formatMoneyShort(cents, EU_MONEY_FORMAT)
  const renderIn = (inflation: number, draft = makeScenario(flat), compact = false) =>
    render(
      <AssumedInflationContext.Provider value={inflation}>
        <GoalsNarrative draft={draft} milestones={[]} compact={compact} />
      </AssumedInflationContext.Provider>,
    )

  it('says the full narrative is in the plan\'s euros and what the net worth comes to on the account when the plan ends', () => {
    renderIn(0.02)
    expect(
      screen.getByText(new RegExp(`in 10 years, in 2026 euros \\(the net worth is about ${full(12_189_944).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} on your account in 2036\\)`)),
    ).toBeInTheDocument()
  })

  it('says the FI target in the plan\'s euros and, when it is not reached, what it would be on the account at the end of the plan', () => {
    renderIn(0.02)
    const target = onAccountCents(75_000_000, 10, 0.02)
    expect(screen.getByText(/FI target \(.* SWR\) is/).textContent).toBe(
      `FI target (4,0% SWR) is ${full(75_000_000)} in 2026 euros, not reached in the horizon (about ${short(target)} on your account in 2036, when the plan ends).`,
    )
  })

  it('says the FI target on the account in the year it is reached', () => {
    const reaching = makeScenario({ ...flat, startInvestedCents: 50_000_000, monthlyContributionCents: 500_000, horizonYears: 20 })
    const { fiYear } = getNarrativeStats(reaching, [], 0.02)
    expect(fiYear).not.toBeNull()
    renderIn(0.02, reaching)
    expect(screen.getByText(/FI target \(.* SWR\) is/).textContent).toBe(
      `FI target (4,0% SWR) is ${full(75_000_000)} in 2026 euros, reachable around year ${fiYear} (about ${short(onAccountCents(75_000_000, fiYear!, 0.02))} on your account in ${2026 + fiYear!}).`,
    )
  })

  it('says once that the figures are the same with no inflation', () => {
    renderIn(0)
    expect(screen.getByText(/in 10 years, in 2026 euros \(the net worth is the same on your account in 2036\)/)).toBeInTheDocument()
    expect(screen.getByText(/FI target/).textContent).toContain('in 2026 euros, not reached in the horizon (the same on your account in 2036, when the plan ends)')
  })

  it('puts the same pair under the net worth in the phone\'s summary box', () => {
    renderIn(0.02, makeScenario(flat), true)
    expect(screen.getByText('Net worth in 10 yrs')).toBeInTheDocument()
    expect(screen.getByText(`in 2026 euros, about ${short(12_189_944)} on your account in 2036`)).toBeInTheDocument()
  })

  it('names the money today\'s euros and the year by the plan year for a plan with no start date', () => {
    renderIn(0.02, makeScenario({ ...flat, planStartDate: null }))
    expect(screen.getByText(/in today's euros \(the net worth is about .* on your account in year 10\)/)).toBeInTheDocument()
  })
})
