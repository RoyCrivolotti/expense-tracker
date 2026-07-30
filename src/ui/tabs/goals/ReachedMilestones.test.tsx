import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ReachedMilestones } from './ReachedMilestones'

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
    expect(screen.getByText('by 2026-03-14')).toBeTruthy()
    expect(screen.queryByText(/Coast FI/)).toBeNull()
  })

  it('shows the amount alone for an unnamed milestone', () => {
    render(
      <ReachedMilestones
        milestones={[{ amountCents: 10_000_000, label: '' }]}
        reached={new Map([[10_000_000, '2026-03-14']])}
      />,
    )
    expect(screen.getByText('by 2026-03-14')).toBeTruthy()
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })
})
