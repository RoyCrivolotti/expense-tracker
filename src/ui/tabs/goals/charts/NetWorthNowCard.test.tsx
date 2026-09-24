import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NetWorthNowCard } from './NetWorthNowCard'
import { makeScenario } from '../../../../testing/factories'

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
