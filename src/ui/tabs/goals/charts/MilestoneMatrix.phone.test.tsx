import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installFakeMatchMedia } from '../../../../testing/fakeMatchMedia'
import { makeScenario } from '../../../../testing/factories'
import { NARROW_MQ } from '../useGoalsNarrow'
import { MilestoneMatrix } from './MilestoneMatrix'

const draft = makeScenario({ id: 0, name: 'Draft' })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 0, 1, 12))
  installFakeMatchMedia((query) => query === NARROW_MQ || query === '(hover: none)')
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  installFakeMatchMedia()
})

// 100k to start and 1.000 a month at 7% real.
const plan = makeScenario({
  id: 1,
  name: 'Path A',
  isActive: true,
  planStartDate: '2026-01-01',
  startInvestedCents: 10_000_000,
  monthlyContributionCents: 100_000,
})
// A tenth of the saving: later everywhere, and the big amounts are out of reach.
const slower = makeScenario({
  id: 2,
  name: 'A path with quite a long name (editing, from today)',
  planStartDate: '2026-01-01',
  startInvestedCents: 10_000_000,
  monthlyContributionCents: 10_000,
})

const amounts = (...thousands: number[]) => thousands.map((k) => ({ amountCents: k * 100_000, label: '' }))
const EIGHT = amounts(100, 150, 200, 300, 400, 500, 750, 1000, 2000)
const TWELVE = amounts(100, 125, 150, 175, 200, 250, 300, 350, 400, 500, 750, 1000, 2000)

/** The table's card is `px` wide: jsdom does no layout, so a test says how wide it is. */
function cardIs(px: number) {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(px)
}

function renderTable(milestones = EIGHT, scenarios = [plan, slower], reached = new Map<number, string>()) {
  return render(
    <MilestoneMatrix scenarios={scenarios} draft={draft} milestones={milestones} reached={reached} includeDraft={false} />,
  )
}

const heads = () => screen.getAllByRole('columnheader').slice(1).map((h) => h.textContent ?? '')
const items = () => within(screen.getByRole('list', { name: /^Paths in the order/ })).getAllByRole('listitem')
const chips = (name: string) => within(screen.getByRole('radiogroup', { name })).getAllByRole('radio')

describe('the table on a phone, paged by width', () => {
  it('shows what the width holds and says the rest is a page away', () => {
    cardIs(327)
    renderTable()

    // 100k is on every path from the start: a line, not a column. Eight left, four to a page.
    expect(heads()).toEqual(['150k €', '200k €', '300k €', '400k €'])
    expect(chips('Milestones shown').map((c) => c.textContent)).toEqual(['150k €–400k €', '500k €–2,0M €'])
    expect(screen.getByText(/Already there on every path: 100k €/)).toBeInTheDocument()
  })

  it('holds fewer columns on a narrower phone and more on a wider one', () => {
    cardIs(272)
    const { unmount } = renderTable()
    expect(heads()).toHaveLength(3)
    expect(chips('Milestones shown')).toHaveLength(3)
    unmount()

    cardIs(382)
    renderTable()
    expect(heads()).toHaveLength(4)
    expect(chips('Milestones shown')).toHaveLength(2)
  })

  it('turns to the other page and keeps the rows where they were', async () => {
    cardIs(327)
    renderTable()
    const names = () => screen.getAllByRole('rowheader').map((h) => h.textContent)
    const before = names()

    await userEvent.click(screen.getByRole('radio', { name: /^500k/ }))

    expect(heads()).toEqual(['500k €', '750k €', '1,0M €', '2,0M €'])
    expect(names()).toEqual(before)
    expect(screen.getByRole('radio', { name: /^500k/ })).toBeChecked()
  })

  it('gives a path its whole name, whatever its length', () => {
    cardIs(327)
    renderTable()

    expect(screen.getByRole('rowheader', { name: /A path with quite a long name \(editing, from today\)/ })).toBeInTheDocument()
  })

  it('splits twice as many milestones into more pages, none of them one column', () => {
    cardIs(327)
    renderTable(TWELVE)

    // 12 left once 100k is folded: three pages of four.
    expect(chips('Milestones shown')).toHaveLength(3)
    expect(heads()).toHaveLength(4)
  })

  it('has one page, and no page chips, for a short list', () => {
    cardIs(327)
    renderTable(amounts(100, 200, 500))

    expect(heads()).toEqual(['200k €', '500k €'])
    expect(screen.queryByRole('radiogroup', { name: 'Milestones shown' })).not.toBeInTheDocument()
  })

  it('has one page when the width holds them all, a tablet in portrait', () => {
    cardIs(700)
    renderTable()

    expect(heads()).toHaveLength(8)
    expect(screen.queryByRole('radiogroup', { name: 'Milestones shown' })).not.toBeInTheDocument()
  })

  it('has a single column for a single milestone', () => {
    cardIs(327)
    renderTable(amounts(500))

    expect(heads()).toEqual(['500k €'])
    expect(screen.queryByRole('radiogroup', { name: 'Milestones shown' })).not.toBeInTheDocument()
  })

  it('moves between the cells of a page with the arrow keys and stops at its edge', async () => {
    cardIs(327)
    renderTable()
    const row = () => within(screen.getAllByRole('row')[1] as HTMLElement).getAllByRole('gridcell')
    await userEvent.click(row()[3] as HTMLElement)

    await userEvent.keyboard('{ArrowRight}')
    expect(row()[3]).toHaveFocus()
    await userEvent.keyboard('{Home}')
    expect(row()[0]).toHaveFocus()
    await userEvent.keyboard('{End}')
    expect(row()[3]).toHaveFocus()
  })

  it('does not leave the sentence of a cell that is no longer on the page', async () => {
    cardIs(327)
    renderTable()
    await userEvent.click(within(screen.getAllByRole('row')[1] as HTMLElement).getAllByRole('gridcell')[0] as HTMLElement)
    expect(screen.getByText(/^Path A reaches/, { selector: 'p[aria-live]' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('radio', { name: /^500k/ }))

    expect(screen.getByText(/^Tap a cell to read it as a sentence/)).toBeInTheDocument()
  })

  it('keeps the currency sign in the heads while the columns are few', () => {
    cardIs(327)
    renderTable()

    expect(screen.getAllByRole('columnheader')[1]).toHaveTextContent('150k €')
  })

  it('drops the sign where more than five columns share a phone', () => {
    cardIs(900)
    renderTable()

    expect(heads()[0]).toBe('150k')
  })
})

describe('what is already there', () => {
  it('folds the milestones every path has, with the date the check-ins saw them reached', () => {
    cardIs(327)
    renderTable(EIGHT, [plan, slower], new Map([[10_000_000, '2026-05-14']]))

    expect(screen.getByText(/Already there on every path: 100k € \(by May '26\)/)).toBeInTheDocument()
    expect(heads()).not.toContain('100k €')
  })

  it('names more than one, with their names where they have them', () => {
    cardIs(327)
    const named = [
      { amountCents: 10_000_000, label: '' },
      { amountCents: 5_000_000, label: 'Starter' },
      ...amounts(500),
    ]
    renderTable(named)

    expect(screen.getByText(/Already there on every path: 100k €, Starter \(50k €\)/)).toBeInTheDocument()
  })

  it('says the check-ins\' date once when they agree on it, and leaves it out when they do not', () => {
    cardIs(327)
    const rich = [plan, slower].map((s) => ({ ...s, startInvestedCents: 20_000_000 }))
    const same = new Map([[10_000_000, '2026-05-14'], [15_000_000, '2026-05-14']])
    const { unmount } = renderTable(amounts(100, 150, 500), rich, same)
    expect(screen.getByText(/^Already there on every path: 100k €, 150k € \(by May '26\)$/)).toBeInTheDocument()
    unmount()

    const differ = new Map([[10_000_000, '2026-05-14'], [15_000_000, '2026-08-02']])
    renderTable(amounts(100, 150, 500), rich, differ)
    expect(screen.getByText(/^Already there on every path: 100k €, 150k €$/)).toBeInTheDocument()
  })

  it('keeps a milestone one path has not reached as a column, with its tick where it has', () => {
    cardIs(327)
    const low = makeScenario({ id: 3, name: 'Starts lower', planStartDate: '2026-01-01', startInvestedCents: 2_000_000, monthlyContributionCents: 100_000 })
    renderTable(amounts(100, 500), [plan, low])

    expect(screen.queryByText(/Already there on every path/)).not.toBeInTheDocument()
    expect(heads()).toEqual(['100k €', '500k €'])
  })

  it('shows every column, and no line, when all of them are there already', () => {
    cardIs(327)
    renderTable(amounts(20, 50, 100))

    expect(screen.queryByText(/Already there on every path/)).not.toBeInTheDocument()
    expect(heads()).toHaveLength(3)
  })
})

describe('reading by goal', () => {
  async function byGoal() {
    cardIs(327)
    renderTable()
    await userEvent.click(screen.getByRole('radio', { name: 'By goal' }))
  }

  it('picks one milestone, from every one still ahead, and lists the paths under it', async () => {
    await byGoal()

    expect(chips('Milestone').map((c) => c.textContent)).toEqual(['150k €', '200k €', '300k €', '400k €', '500k €', '750k €', '1,0M €', '2,0M €'])
    expect(screen.getByText('1 of 8')).toBeInTheDocument()
    expect(screen.queryByRole('grid')).not.toBeInTheDocument()
    expect(items()).toHaveLength(2)
  })

  it('puts the soonest path first, whatever order the table has them in', async () => {
    await byGoal()

    const names = items().map((li) => li.textContent ?? '')
    expect(names[0]).toMatch(/^Path A/)
    expect(names[1]).toMatch(/^A path with quite a long name/)
  })

  it('says a path that never gets there, last, as the end of its horizon', async () => {
    await byGoal()

    await userEvent.click(screen.getByRole('radio', { name: '2,0M €' }))

    const last = items().at(-1) as HTMLElement
    expect(last).toHaveTextContent(/A path with quite a long name.*30\+/)
  })

  it('steps to the next and the previous milestone, and stops at the ends', async () => {
    await byGoal()
    const previous = screen.getByRole('button', { name: 'Previous milestone' })
    const next = screen.getByRole('button', { name: 'Next milestone' })
    expect(previous).toBeDisabled()

    await userEvent.click(next)
    expect(screen.getByText('2 of 8')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '200k €' })).toBeChecked()

    await userEvent.click(screen.getByRole('radio', { name: '2,0M €' }))
    expect(next).toBeDisabled()
    await userEvent.click(previous)
    expect(screen.getByText('7 of 8')).toBeInTheDocument()
  })

  it('shows how far each path is from the plan, once the table compares with it', async () => {
    await byGoal()
    expect(screen.queryByText(/\d+y vs plan/)).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'vs plan' }))

    const list = items()
    expect(list[0]).toHaveTextContent('plan')
    expect(list[1]).toHaveTextContent(/\+\d+y vs plan/)
  })

  it('switches to the calendar year with the same toggle as the table', async () => {
    await byGoal()
    const years = items()[1]?.textContent ?? ''

    await userEvent.click(screen.getByRole('radio', { name: 'Calendar year' }))

    expect(items()[1]?.textContent).not.toBe(years)
    expect(items()[1]).toHaveTextContent(/20\d\d/)
  })

  it('goes back to the table with the page it was on', async () => {
    cardIs(327)
    renderTable()
    await userEvent.click(screen.getByRole('radio', { name: /^500k/ }))
    await userEvent.click(screen.getByRole('radio', { name: 'By goal' }))

    await userEvent.click(screen.getByRole('radio', { name: 'Table' }))

    expect(heads()[0]).toBe('500k €')
  })
})

describe('off the phone', () => {
  it('shows every milestone in one table with no paging, no switch and nothing folded', () => {
    installFakeMatchMedia((query) => query === '(hover: none)')
    cardIs(327)
    renderTable(EIGHT, [plan, slower], new Map([[10_000_000, '2026-05-14']]))

    expect(heads()).toHaveLength(9)
    expect(screen.queryByRole('radio', { name: 'By goal' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Already there on every path/)).not.toBeInTheDocument()
  })
})
