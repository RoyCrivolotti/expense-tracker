import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NetWorthNowCard } from './NetWorthNowCard'
import { formatCents, nominalToReal, scenarioToParams, yearsToFi } from '../../../../engine'
import { EU_MONEY_FORMAT } from '../../../../engine/money'
import { makeScenario } from '../../../../testing/factories'
import { AssumedInflationContext } from '../../../hooks/assumedInflationContext'
import { formatMoneyShort } from '../chartTheme'
import { onAccountCents } from '../bothMoneys'

// startInvestedCents is €100k, so €80k is already passed and €150k is next.
const passed = { amountCents: 8_000_000, label: 'House deposit' }
const upcoming = { amountCents: 15_000_000, label: 'Coast FI' }
const noneReached = new Map<number, string>()

describe('NetWorthNowCard', () => {
  it('reads today from the latest check-in, dated, rather than the plan start', () => {
    const draft = makeScenario({ annualSpendCents: 4_000_000 })
    render(
      <NetWorthNowCard
        draft={draft}
        latest={{ investedCents: 11_700_000, date: '2026-09-11' }}
        milestones={[upcoming]}
        reached={noneReached}
      />,
    )
    expect(screen.getByText('117.000,00 €')).toBeTruthy()
    expect(screen.getByText(/as of .*2026/)).toBeTruthy()
    // 117k against a 100M FI target rounds to 0%; the point is that it is the check-in's.
    expect(screen.queryByText('100.000,00 €')).toBeNull()
  })

  it('takes the FI share from the balance in today\'s money, and shows the balance as measured', () => {
    // 4% of 1M a year: the target is 25M, in the plan start's money.
    const draft = makeScenario({ annualSpendCents: 1_000_000, safeWithdrawalRate: 0.04, planStartDate: '2020-01-01' })
    render(
      <NetWorthNowCard
        draft={draft}
        latest={{ investedCents: 22_500_000, date: '2026-01-01' }}
        milestones={[]}
        reached={noneReached}
      />,
    )
    expect(screen.getByText('225.000,00 €')).toBeTruthy()
    // 225k six years on is about 200k in 2020 money at 2%: 80% of the target, not 90%.
    expect(screen.getByText('80%')).toBeTruthy()
  })

  it('says what the same spending needs at 4%, 3,5% and 3%, beside the target it uses', () => {
    const draft = makeScenario({ annualSpendCents: 3_000_000, safeWithdrawalRate: 0.04 })
    render(<NetWorthNowCard draft={draft} latest={{ investedCents: 11_700_000, date: '2026-09-11' }} milestones={[]} reached={noneReached} />)
    expect(screen.getByText(/The same spending needs 750\.000,00 € at 4,0%, 857\.142,86 € at 3,5% or 1\.000\.000,00 € at 3,0%\./)).toBeTruthy()
  })

  it('says it is showing the plan start when there is no check-in yet', () => {
    const draft = makeScenario({ annualSpendCents: 4_000_000 })
    render(<NetWorthNowCard draft={draft} latest={null} milestones={[]} reached={noneReached} />)
    expect(screen.getByText('100.000,00 €')).toBeTruthy()
    expect(screen.getByText(/no check-in yet/)).toBeTruthy()
  })

  it('names the first milestone above the current invested value', () => {
    const draft = makeScenario({ annualSpendCents: 4_000_000 })
    render(<NetWorthNowCard draft={draft} milestones={[passed, upcoming]} reached={noneReached} />)
    // Named milestones carry their amount too, so the target is never ambiguous.
    expect(screen.getByText(/Coast FI \(.*\)/)).toBeTruthy()
    expect(screen.queryByText(/House deposit/)).toBeNull()
  })

  it('shows the amount alone for an unnamed next milestone', () => {
    const draft = makeScenario({ annualSpendCents: 4_000_000 })
    render(
      <NetWorthNowCard
        draft={draft}
        milestones={[{ amountCents: 15_000_000, label: '' }]}
        reached={noneReached}
      />,
    )
    expect(screen.getByText(/Next milestone:/)).toBeTruthy()
  })

  it('omits the next-milestone line when every milestone is already passed', () => {
    const draft = makeScenario({ annualSpendCents: 4_000_000 })
    render(<NetWorthNowCard draft={draft} milestones={[passed]} reached={noneReached} />)
    expect(screen.queryByText(/Next milestone:/)).toBeNull()
  })

  it('omits the next-milestone line when there are no milestones', () => {
    const draft = makeScenario({ annualSpendCents: 4_000_000 })
    render(<NetWorthNowCard draft={draft} milestones={[]} reached={noneReached} />)
    expect(screen.queryByText(/Next milestone:/)).toBeNull()
  })

  it('skips a milestone a check-in already recorded as reached', () => {
    const draft = makeScenario({ annualSpendCents: 4_000_000 })
    const later = { amountCents: 50_000_000, label: 'Coast FI x2' }
    render(
      <NetWorthNowCard
        draft={draft}
        milestones={[upcoming, later]}
        reached={new Map([[upcoming.amountCents, '2026-03-14']])}
      />,
    )
    expect(screen.getByText(/Coast FI x2 \(.*\)/)).toBeTruthy()
    expect(screen.queryByText(/Coast FI \(/)).toBeNull()
  })

  it('mentions the next milestone in the no-FI-target branch', () => {
    const draft = makeScenario({ annualSpendCents: 0 })
    render(<NetWorthNowCard draft={draft} milestones={[upcoming]} reached={noneReached} />)
    expect(screen.getByText(/next milestone Coast FI/)).toBeTruthy()
  })

  it('renders the no-FI-target branch without a milestone when the list is empty', () => {
    const draft = makeScenario({ annualSpendCents: 0 })
    render(<NetWorthNowCard draft={draft} milestones={[]} reached={noneReached} />)
    expect(screen.getByText(/Set annual spend at FI/)).toBeTruthy()
  })
})

describe('NetWorthNowCard in both moneys', () => {
  const short = (cents: number) => formatMoneyShort(cents, EU_MONEY_FORMAT)
  // 25M cents of spending at 4%: a 25.000.000 target in the euros of 2020, and no growth or saving, so a plan
  // of ten years never gets there.
  const stuck = {
    annualSpendCents: 1_000_000,
    safeWithdrawalRate: 0.04,
    planStartDate: '2020-01-01',
    startInvestedCents: 10_000_000,
    monthlyContributionCents: 0,
    expectedRealReturn: 0,
    horizonYears: 10,
    housePurchaseYear: null,
  }
  const renderCard = (draft: ReturnType<typeof makeScenario>, latest: { investedCents: number; date: string } | null, inflation = 0.02) =>
    render(
      <AssumedInflationContext.Provider value={inflation}>
        <NetWorthNowCard draft={draft} latest={latest} milestones={[]} reached={noneReached} />
      </AssumedInflationContext.Provider>,
    )

  it('says what a check-in is worth in the plan\'s euros, which is the money the FI target is in', () => {
    renderCard(makeScenario(stuck), { investedCents: 22_500_000, date: '2026-01-01' })
    const real = nominalToReal(22_500_000, '2020-01-01', '2026-01-01', 0.02)
    expect(screen.getByText(`worth about ${formatCents(real, EU_MONEY_FORMAT)} in 2020 euros, the money the FI target is in`)).toBeTruthy()
  })

  it('has no worth line before a check-in, as the plan start is already in the plan\'s euros', () => {
    renderCard(makeScenario(stuck), null)
    expect(screen.queryByText(/the money the FI target is in/)).toBeNull()
  })

  it('has no worth line for a check-in on the day the plan started', () => {
    renderCard(makeScenario(stuck), { investedCents: 10_000_000, date: '2020-01-01' })
    expect(screen.queryByText(/the money the FI target is in/)).toBeNull()
  })

  it('says the FI target is in the plan\'s euros and what it would be on the account at the end of the plan, when it is never reached', () => {
    renderCard(makeScenario(stuck), { investedCents: 11_000_000, date: '2020-06-01' })
    expect(
      screen.getByText(`The target is in 2020 euros, about ${short(onAccountCents(25_000_000, 10, 0.02))} on your account in 2030, when the plan ends.`),
    ).toBeTruthy()
  })

  it('says it on the account in the year the plan reaches it', () => {
    const reaching = makeScenario({ ...stuck, startInvestedCents: 20_000_000, monthlyContributionCents: 500_000, horizonYears: 20 })
    const fiYear = yearsToFi(scenarioToParams({ ...reaching, id: 0 }, 0.02), reaching.annualSpendCents, reaching.safeWithdrawalRate)
    expect(fiYear).not.toBeNull()
    renderCard(reaching, { investedCents: 20_000_000, date: '2020-06-01' })
    expect(
      screen.getByText(`The target is in 2020 euros, about ${short(onAccountCents(25_000_000, fiYear!, 0.02))} on your account in ${2020 + fiYear!}, the year the plan reaches it.`),
    ).toBeTruthy()
  })

  it('says the same, once, with no inflation', () => {
    renderCard(makeScenario(stuck), { investedCents: 11_000_000, date: '2020-06-01' }, 0)
    expect(screen.getByText('The target is in 2020 euros, the same on your account in 2030, when the plan ends.')).toBeTruthy()
  })
})
