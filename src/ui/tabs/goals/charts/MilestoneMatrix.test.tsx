import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MilestoneMatrix } from './MilestoneMatrix'
import { makeScenario } from '../../../../testing/factories'
import { defaultMilestones } from '../../../../engine'

const draft = makeScenario()
const noneReached = new Map<number, string>()

describe('MilestoneMatrix', () => {
  it('renders one column header per milestone', () => {
    render(
      <MilestoneMatrix
        scenarios={[draft]}
        draft={draft}
        milestones={defaultMilestones()}
        reached={noneReached}
      />,
    )
    // One header per milestone, plus the leading "Scenario" column.
    expect(screen.getAllByRole('columnheader')).toHaveLength(defaultMilestones().length + 1)
  })

  it('shows the milestone name when one is set', () => {
    render(
      <MilestoneMatrix
        scenarios={[draft]}
        draft={draft}
        milestones={[{ amountCents: 8_000_000, label: 'House deposit' }]}
        reached={noneReached}
      />,
    )
    expect(screen.getByRole('columnheader', { name: 'House deposit' })).toBeTruthy()
  })

  it('falls back to the formatted amount for an unnamed milestone', () => {
    render(
      <MilestoneMatrix
        scenarios={[draft]}
        draft={draft}
        milestones={[{ amountCents: 10_000_000, label: '' }]}
        reached={noneReached}
      />,
    )
    expect(screen.queryByRole('columnheader', { name: '' })).toBeNull()
    // Two headers: "Scenario" and the amount-derived one.
    expect(screen.getAllByRole('columnheader')).toHaveLength(2)
  })

  it('shows an empty state instead of the table when there are no milestones', () => {
    render(
      <MilestoneMatrix scenarios={[draft]} draft={draft} milestones={[]} reached={noneReached} />,
    )
    expect(screen.getByText('No milestones set.')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('renders a row per saved scenario plus the draft being edited', () => {
    const second = makeScenario({ id: 2, name: 'Aggressive' })
    render(
      <MilestoneMatrix
        scenarios={[draft, second]}
        draft={draft}
        milestones={[{ amountCents: 10_000_000, label: '' }]}
        reached={noneReached}
      />,
    )
    expect(screen.getByText(/\(editing\)/)).toBeTruthy()
    // Two saved scenarios + the editing draft.
    expect(screen.getAllByRole('row')).toHaveLength(4)
  })

  it('marks a reached milestone with the date it was first observed', () => {
    render(
      <MilestoneMatrix
        scenarios={[draft]}
        draft={draft}
        milestones={[{ amountCents: 8_000_000, label: 'House deposit' }]}
        reached={new Map([[8_000_000, '2026-03-14']])}
      />,
    )
    expect(screen.getByText('reached by 2026-03-14')).toBeTruthy()
  })

  it('leaves unreached milestones unmarked', () => {
    render(
      <MilestoneMatrix
        scenarios={[draft]}
        draft={draft}
        milestones={[
          { amountCents: 8_000_000, label: 'Reached one' },
          { amountCents: 90_000_000, label: 'Future one' },
        ]}
        reached={new Map([[8_000_000, '2026-03-14']])}
      />,
    )
    expect(screen.getAllByText(/reached by/)).toHaveLength(1)
  })

  it('points at where the list is edited', () => {
    render(
      <MilestoneMatrix
        scenarios={[draft]}
        draft={draft}
        milestones={defaultMilestones()}
        reached={noneReached}
      />,
    )
    expect(screen.getByText(/Settings → Milestones/)).toBeTruthy()
  })
})
