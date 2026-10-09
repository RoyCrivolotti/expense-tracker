import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ReachedMilestones } from './ReachedMilestones'
import { makeScenario, makeWealthCheckin } from '../../../testing/factories'
import { samplePlan } from '../../../testing/samplePlan'
import { DEFAULT_INFLATION_RATE, addDaysIso, milestoneCrossingDate, planFromToday } from '../../../engine'

const milestones = [
  { amountCents: 10_000_000, label: 'House deposit' },
  { amountCents: 50_000_000, label: 'Coast FI' },
]

describe('ReachedMilestones', () => {
  it('renders nothing when none have been reached', () => {
    const { container } = render(
      <ReachedMilestones milestones={milestones} reached={new Map()} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when there are no milestones at all', () => {
    const { container } = render(<ReachedMilestones milestones={[]} reached={new Map()} />)
    expect(container.firstChild).toBeNull()
  })

  it('lists only the reached milestones, naming each with its amount and date', () => {
    render(
      <ReachedMilestones
        milestones={milestones}
        reached={new Map([[10_000_000, '2026-03-14']])}
      />,
    )
    expect(screen.getByText(/House deposit \(.*\)/)).toBeTruthy()
    expect(screen.getByText(/^by .*2026$/)).toBeTruthy()
    expect(screen.queryByText(/Coast FI/)).toBeNull()
  })

  it('dates an unreached milestone from today as well, which is the date that moves with check-ins', () => {
    const plan = makeScenario({
      id: 1,
      isActive: true,
      planStartDate: '2026-01-01',
      startInvestedCents: 9_000_000,
      monthlyContributionCents: 100_000,
      expectedRealReturn: 0.05,
      horizonYears: 10,
      housePurchaseYear: null,
    })
    // Ahead of plan a year in (the plan has about 108.300 euros on the account by then, this has 109.500):
    // the crossing from today comes sooner than the plan said.
    const latest = makeWealthCheckin({ id: 1, checkinDate: '2027-01-01', entries: [{ accountId: 1, valueCents: 10_950_000 }] })
    render(
      <ReachedMilestones
        milestones={[{ amountCents: 11_000_000, label: 'Soon' }, { amountCents: 900_000_000, label: 'Far' }]}
        reached={new Map()}
        plan={plan}
        latestCheckin={latest}
        fromToday={planFromToday(plan, { investedCents: 10_950_000, date: '2027-01-01' })}
      />,
    )
    const soon = screen.getByText(/^expected .*; from today, .*$/)
    const [planned, fromToday] = soon.textContent.replace('expected ', '').split('; from today, ')
    expect(new Date(fromToday!).getTime()).toBeLessThan(new Date(planned!).getTime())
    expect(screen.getByText(/not within the horizon; from today, not within the horizon/)).toBeInTheDocument()
  })

  it('dates the unreached ones by the plan and sets them against their targets', () => {
    const plan = makeScenario({
      id: 1,
      isActive: true,
      planStartDate: '2026-01-01',
      startInvestedCents: 9_000_000,
      monthlyContributionCents: 100_000,
      expectedRealReturn: 0.05,
      horizonYears: 10,
      housePurchaseYear: null,
    })
    render(
      <ReachedMilestones
        milestones={[
          { amountCents: 11_000_000, label: 'Soon', targetDate: '2031-01-01' },
          { amountCents: 12_000_000, label: 'Tight', targetDate: '2026-06-01' },
          { amountCents: 15_000_000, label: 'Undated' },
          { amountCents: 900_000_000, label: 'Far', targetDate: '2040-01-01' },
        ]}
        reached={new Map()}
        plan={plan}
      />,
    )
    expect(screen.getByText('Milestones')).toBeInTheDocument()
    expect(screen.getByText(/^on track: .*, target .*2031 \(worth about [\d.]+ € in 2026 euros\)$/)).toBeInTheDocument()
    expect(screen.getByText(/^\d+ months late: .*, target .*2026 \(worth about [\d.]+ € in 2026 euros\)$/)).toBeInTheDocument()
    expect(screen.getByText(/^expected .*20\d\d \(worth about [\d.]+ € in 2026 euros\)$/)).toBeInTheDocument()
    expect(screen.getByText(/^not within the horizon, target .*2040$/)).toBeInTheDocument()
  })

  it('says "1 month late", not "1 months late"', () => {
    const plan = makeScenario({
      id: 1,
      isActive: true,
      planStartDate: '2026-01-01',
      startInvestedCents: 9_000_000,
      monthlyContributionCents: 100_000,
      expectedRealReturn: 0.05,
      horizonYears: 10,
      housePurchaseYear: null,
    })
    // A target a month before the date the plan crosses the amount.
    const crossing = milestoneCrossingDate(plan, 11_000_000, DEFAULT_INFLATION_RATE)!
    render(
      <ReachedMilestones
        milestones={[{ amountCents: 11_000_000, label: 'Soon', targetDate: addDaysIso(crossing, -30) }]}
        reached={new Map()}
        plan={plan}
      />,
    )
    expect(screen.getByText(/^1 month late: /)).toBeInTheDocument()
  })

  it('says a milestone the plan should have crossed by now is not reached yet', () => {
    const plan = makeScenario({
      id: 1,
      isActive: true,
      planStartDate: '2020-01-01',
      startInvestedCents: 9_000_000,
      monthlyContributionCents: 100_000,
      expectedRealReturn: 0.05,
      horizonYears: 10,
      housePurchaseYear: null,
    })
    render(
      <ReachedMilestones
        milestones={[{ amountCents: 10_000_000, label: 'Past due', targetDate: '2030-01-01' }]}
        reached={new Map()}
        plan={plan}
        latestCheckin={makeWealthCheckin({ checkinDate: '2026-09-01', entries: [] })}
      />,
    )
    expect(screen.getByText(/^not reached yet; the plan had it by .*, target .*2030 \(worth about [\d.]+ € in 2020 euros\)$/)).toBeInTheDocument()
    expect(screen.queryByText(/on track/)).not.toBeInTheDocument()
  })

  it('does not call a milestone overdue without a check-in to say so', () => {
    const plan = makeScenario({
      id: 1,
      isActive: true,
      planStartDate: '2020-01-01',
      startInvestedCents: 9_000_000,
      monthlyContributionCents: 100_000,
      expectedRealReturn: 0.05,
      horizonYears: 10,
      housePurchaseYear: null,
    })
    render(
      <ReachedMilestones
        milestones={[{ amountCents: 10_000_000, label: 'Past due', targetDate: '2030-01-01' }]}
        reached={new Map()}
        plan={plan}
      />,
    )
    expect(screen.queryByText(/not reached yet/)).not.toBeInTheDocument()
    expect(screen.getByText(/^on track: .*, target .*2030 \(worth about [\d.]+ € in 2020 euros\)$/)).toBeInTheDocument()
  })

  it('keeps the reached heading when everything listed has been reached', () => {
    render(
      <ReachedMilestones
        milestones={[{ amountCents: 10_000_000, label: 'Done', targetDate: '2030-01-01' }]}
        reached={new Map([[10_000_000, '2026-03-14']])}
        plan={makeScenario({ id: 1, planStartDate: '2026-01-01' })}
      />,
    )
    expect(screen.getByText('Milestones reached')).toBeInTheDocument()
  })

  it('shows the amount alone for an unnamed milestone', () => {
    render(
      <ReachedMilestones
        milestones={[{ amountCents: 10_000_000, label: '' }]}
        reached={new Map([[10_000_000, '2026-03-14']])}
      />,
    )
    expect(screen.getByText(/^by .*2026$/)).toBeTruthy()
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })
})

describe('ReachedMilestones on the account', () => {
  const plan = samplePlan({ id: 1, isActive: true })
  const render150and500 = () =>
    render(
      <ReachedMilestones
        milestones={[{ amountCents: 15_000_000, label: 'Deposit' }, { amountCents: 50_000_000, label: 'Half' }]}
        reached={new Map()}
        plan={plan}
      />,
    )

  it('says what an amount on the account is worth in the euros of the plan start on the day the plan has it', () => {
    render150and500()
    // 150.000 euros on the account some years in is 128.000 to 136.000 in the euros of 2026; 500.000 is about 300.000.
    expect(screen.getByText(/\(worth about 1[23]\d\.\d{3} € in 2026 euros\)/)).toBeInTheDocument()
    expect(screen.getByText(/\(worth about [23]\d\d\.\d{3} € in 2026 euros\)$/)).toBeInTheDocument()
  })

  it('says a milestone the plan loses again to a house payment, and when', () => {
    render150and500()
    expect(screen.getByText(/the plan falls back below it in Jan 2034/)).toBeInTheDocument()
    expect(screen.getAllByText(/falls back below it/)).toHaveLength(1)
  })

  it('names the money by the plan start year, or today without one', () => {
    render(
      <ReachedMilestones
        milestones={[{ amountCents: 15_000_000, label: 'Deposit' }]}
        reached={new Map()}
        plan={{ ...plan, planStartDate: '2031-06-01' }}
      />,
    )
    expect(screen.getByText(/in 2031 euros\)/)).toBeInTheDocument()
  })
})
