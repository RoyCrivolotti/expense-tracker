import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ReachedMilestones } from './ReachedMilestones'
import { makeScenario, makeWealthCheckin } from '../../../testing/factories'

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
    expect(screen.getByText(/^on track: .*, target .*2031$/)).toBeInTheDocument()
    expect(screen.getByText(/^\d+ months late: .*, target .*2026$/)).toBeInTheDocument()
    expect(screen.getByText(/^expected .*20\d\d$/)).toBeInTheDocument()
    expect(screen.getByText(/^not within the horizon, target .*2040$/)).toBeInTheDocument()
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
    expect(screen.getByText(/^not reached yet; the plan had it by .*, target .*2030$/)).toBeInTheDocument()
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
    expect(screen.getByText(/^on track: .*, target .*2030$/)).toBeInTheDocument()
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
