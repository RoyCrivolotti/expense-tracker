import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MilestoneMatrix } from './MilestoneMatrix'
import { makeScenario } from '../../../../testing/factories'
import { defaultMilestones } from '../../../../engine'

const draft = makeScenario()
const noneReached = new Map<number, string>()

describe('MilestoneMatrix', () => {
  it('keeps two same-named scenarios as two rows, without a key warning', () => {
    // Duplicating a scenario and renaming it back, or reusing a name, gives two rows with
    // one label; keyed by name, React warned and could drop or repeat a row.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const a = makeScenario({ id: 1, name: 'Path A' })
    const b = makeScenario({ id: 2, name: 'Path A' })

    render(<MilestoneMatrix scenarios={[a, b]} draft={draft} milestones={defaultMilestones()} reached={noneReached} />)

    // Both saved rows are drawn, beside the editing row and the header row.
    expect(screen.getAllByRole('row', { name: /^Path A/ })).toHaveLength(2)
    expect(screen.getAllByRole('row')).toHaveLength(4)
    expect(error).not.toHaveBeenCalled()
    error.mockRestore()
  })

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

  it('stacks the name above the amount when a milestone is named', () => {
    render(
      <MilestoneMatrix
        scenarios={[draft]}
        draft={draft}
        milestones={[{ amountCents: 8_000_000, label: 'House deposit' }]}
        reached={noneReached}
      />,
    )
    const header = screen.getByRole('columnheader', { name: /House deposit/ })
    expect(header.textContent).toContain('House deposit')
    // The amount is always shown too, not only when the milestone is unnamed.
    expect(header.textContent).toMatch(/80k/)
  })

  it('spells the column out in the header tooltip, where width is not a constraint', () => {
    render(
      <MilestoneMatrix
        scenarios={[draft]}
        draft={draft}
        milestones={[{ amountCents: 8_000_000, label: 'House deposit' }]}
        reached={new Map([[8_000_000, '2026-03-14']])}
      />,
    )
    const title = screen.getByRole('columnheader', { name: /House deposit/ }).getAttribute('title')
    expect(title).toContain('House deposit')
    expect(title).toContain('reached by 2026-03-14')
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

  it('shows a loaded, unchanged scenario once, as the chart does', () => {
    render(
      <MilestoneMatrix
        scenarios={[draft, makeScenario({ id: 2, name: 'Aggressive' })]}
        draft={draft}
        milestones={[{ amountCents: 10_000_000, label: '' }]}
        reached={noneReached}
        includeDraft={false}
      />,
    )
    expect(screen.queryByText(/\(editing\)/)).toBeNull()
    expect(screen.getAllByRole('row')).toHaveLength(3)
  })

  it('marks a reached milestone with the month it was first observed', () => {
    render(
      <MilestoneMatrix
        scenarios={[draft]}
        draft={draft}
        milestones={[{ amountCents: 8_000_000, label: 'House deposit' }]}
        reached={new Map([[8_000_000, '2026-03-14']])}
      />,
    )
    // Short form on screen; the full date stays in the header's title.
    expect(screen.getByText("Mar '26")).toBeTruthy()
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
    expect(screen.getAllByText(/'26/)).toHaveLength(1)
    expect(
      screen.getByRole('columnheader', { name: /Future one/ }).getAttribute('title'),
    ).not.toContain('reached')
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
