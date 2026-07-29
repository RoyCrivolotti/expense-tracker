import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MilestoneMatrix } from './MilestoneMatrix'
import { makeScenario } from '../../../../testing/factories'
import { defaultMilestones } from '../../../../engine'

const draft = makeScenario()

describe('MilestoneMatrix', () => {
  it('renders one column header per milestone', () => {
    render(
      <MilestoneMatrix scenarios={[draft]} draft={draft} milestones={defaultMilestones()} />,
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
      />,
    )
    expect(screen.queryByRole('columnheader', { name: '' })).toBeNull()
    // Two headers: "Scenario" and the amount-derived one.
    expect(screen.getAllByRole('columnheader')).toHaveLength(2)
  })

  it('shows an empty state instead of the table when there are no milestones', () => {
    render(<MilestoneMatrix scenarios={[draft]} draft={draft} milestones={[]} />)
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
      />,
    )
    expect(screen.getByText(/\(editing\)/)).toBeTruthy()
    // Two saved scenarios + the editing draft.
    expect(screen.getAllByRole('row')).toHaveLength(4)
  })
})
