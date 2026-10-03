import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MilestoneMatrix } from './MilestoneMatrix'
import { makeScenario } from '../../../../testing/factories'
import { planFromToday } from '../../../../engine'
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

  it('names a milestone that is not reached by the horizon it was searched to, not by a flat 40+', () => {
    const short = makeScenario({ id: 1, name: 'Short', horizonYears: 12, startInvestedCents: 0, monthlyContributionCents: 10_000 })
    const long = makeScenario({ id: 2, name: 'Long', horizonYears: 45, startInvestedCents: 0, monthlyContributionCents: 10_000 })
    const milestones = [{ amountCents: 1_000_000_00, label: '' }]

    render(<MilestoneMatrix scenarios={[short, long]} draft={draft} milestones={milestones} reached={noneReached} />)

    // 100 a month for 12 years does not reach a million, and says it was looked for 12 years.
    expect(within(screen.getByRole('row', { name: /^Short/ })).getByText('12+')).toBeInTheDocument()
    expect(within(screen.getByRole('row', { name: /^Long/ })).getByText('45+')).toBeInTheDocument()
    expect(screen.queryByText('40+')).not.toBeInTheDocument()
  })

  it('keeps a copy and its original apart by name, where cutting at the colon would call both Path A', () => {
    const original = makeScenario({ id: 1, name: 'Path A: Invest only' })
    const copy = makeScenario({ id: 2, name: 'Path A: Invest only (copy)' })
    const other = makeScenario({ id: 3, name: 'Path B: House now' })

    render(<MilestoneMatrix scenarios={[original, copy, other]} draft={draft} milestones={defaultMilestones()} reached={noneReached} />)

    expect(screen.getByText('Path A: Invest only')).toBeInTheDocument()
    expect(screen.getByText('Path A: Invest only (copy)')).toBeInTheDocument()
    expect(screen.queryByText('Path A')).not.toBeInTheDocument()
    // A name nobody shares keeps its short form.
    expect(screen.getByText('Path B')).toBeInTheDocument()
    expect(screen.queryByText('Path B: House now')).not.toBeInTheDocument()
  })

  it('puts its grid in a named region, which takes no tab stop of its own: the cells take the focus there', () => {
    render(<MilestoneMatrix scenarios={[draft]} draft={draft} milestones={defaultMilestones()} reached={noneReached} />)

    const region = screen.getByRole('region', { name: 'Years to milestone' })
    expect(region).not.toHaveAttribute('tabindex')
    expect(region).toContainElement(screen.getByRole('grid'))
  })

  it('gives each scenario a row header, so a screen reader can say whose figure it is on', () => {
    const a = makeScenario({ id: 1, name: 'Path A' })
    const b = makeScenario({ id: 2, name: 'Path B' })

    render(<MilestoneMatrix scenarios={[a, b]} draft={draft} milestones={defaultMilestones()} reached={noneReached} />)

    expect(screen.getByRole('rowheader', { name: 'Path A' })).toHaveAttribute('scope', 'row')
    expect(screen.getByRole('rowheader', { name: 'Path B' })).toBeInTheDocument()
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

  it('lists the plan from today under the plan', () => {
    const plan = makeScenario({ id: 2, name: 'Aggressive', planStartDate: '2024-01-01', isActive: true })
    render(
      <MilestoneMatrix
        scenarios={[draft, plan]}
        draft={draft}
        milestones={[{ amountCents: 10_000_000, label: '' }]}
        reached={noneReached}
        fromToday={planFromToday(plan, { investedCents: 1, date: '2026-01-01' })}
      />,
    )
    const names = screen.getAllByRole('row').slice(1).map((r) => r.querySelector('th[scope="row"]')?.textContent)
    expect(names).toEqual(['Scenario', 'Aggressive', 'Aggressive, from today', 'Scenario (editing)'])
    expect(screen.getByText(/counts years from your latest check-in/)).toBeInTheDocument()
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
    expect(screen.getByText(/Edit the list in Assumptions/)).toBeTruthy()
  })
})
