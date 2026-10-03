import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { installFakeMatchMedia } from '../../../../testing/fakeMatchMedia'
import { NARROW_MQ } from '../useGoalsNarrow'
import { MilestoneMatrix } from './MilestoneMatrix'
import { makeScenario } from '../../../../testing/factories'

const draft = makeScenario({ id: 0, name: 'Draft' })

// 100k to start and 1.000 a month at 7% real: 1M is reached inside the 30 years.
const plan = makeScenario({
  id: 1,
  name: 'Path A',
  isActive: true,
  planStartDate: '2026-01-01',
  startInvestedCents: 10_000_000,
  monthlyContributionCents: 100_000,
})
// Saves a tenth as much, so every milestone is later than the plan's and 1M is out of reach in 30 years.
const slower = makeScenario({
  id: 2,
  name: 'Path B',
  planStartDate: '2026-01-01',
  startInvestedCents: 10_000_000,
  monthlyContributionCents: 10_000,
})

const milestones = [
  { amountCents: 10_000_000, label: '' },
  { amountCents: 20_000_000, label: 'House deposit' },
  { amountCents: 100_000_000, label: '' },
]
const reached = new Map([[10_000_000, '2026-05-14']])

function renderTable(scenarios = [plan, slower], extra = {}) {
  return render(
    <MilestoneMatrix
      scenarios={scenarios}
      draft={draft}
      milestones={milestones}
      reached={reached}
      includeDraft={false}
      {...extra}
    />,
  )
}

const cell = (row: string, col: number) =>
  within(screen.getByRole('row', { name: new RegExp(`^${row}`) })).getAllByRole('gridcell')[col] as HTMLElement

describe('the years to milestone grid', () => {
  it('is a grid with a cell for every path and milestone, each read as a sentence', () => {
    renderTable()

    expect(screen.getAllByRole('gridcell')).toHaveLength(6)
    expect(cell('Path A', 0)).toHaveAccessibleName(
      "Path A already has 100k € at its start. Your check-ins reached it by May '26.",
    )
    expect(cell('Path A', 1).getAttribute('aria-label')).toMatch(/^Path A reaches House deposit \(200k €\) in \d+ years, by 20\d\d\.$/)
  })

  it('shows already there as a tick, and not within the horizon as the horizon with a plus', () => {
    renderTable()

    expect(cell('Path A', 0)).toHaveTextContent('✓')
    // 1M at a tenth of the saving: not within 30 years.
    expect(cell('Path B', 2)).toHaveTextContent('30+')
  })

  it('tints a cell more the further away it is, and gives a tick and a miss no tint', () => {
    renderTable()

    const tint = (c: HTMLElement) => c.querySelector<HTMLElement>('span')!.style.getPropertyValue('--tint')
    expect(tint(cell('Path A', 0))).toBe('')
    expect(tint(cell('Path B', 2))).toBe('')
    expect(parseInt(tint(cell('Path B', 1)))).toBeGreaterThan(parseInt(tint(cell('Path A', 1))))
  })

  it('says what the tint, the tick and the hatching mean, under the table', () => {
    renderTable()

    expect(screen.getByText(/Darker: further away \(the darkest is 30 years\)/)).toBeInTheDocument()
    expect(screen.getByText('Already there')).toBeInTheDocument()
    expect(screen.getByText(/Hatched: not within the path's horizon/)).toBeInTheDocument()
  })

  it('keeps the reached-by tick in the column header', () => {
    renderTable()

    expect(screen.getByRole('columnheader', { name: /100k €/ })).toHaveTextContent("May '26")
  })
})

describe('years from now and calendar year', () => {
  it('starts as years and switches to the calendar year each path reaches it in', async () => {
    renderTable()
    const before = cell('Path B', 1).textContent ?? ''
    expect(before).toMatch(/^\d+y$/)

    await userEvent.click(screen.getByRole('radio', { name: 'Calendar year' }))

    const years = Number(before.replace('y', ''))
    expect(cell('Path B', 1)).toHaveTextContent(String(2026 + years))
    // A tick stays a tick, and a miss names the year the search ended in.
    expect(cell('Path A', 0)).toHaveTextContent('✓')
    expect(cell('Path B', 2)).toHaveTextContent('2056+')
  })

  it('says in the hint that a year is the yearly step, which can be later than the date on Progress', () => {
    renderTable()

    expect(screen.getByText(/up to a year later than the date on the Progress tab/)).toBeInTheDocument()
  })
})

describe('vs plan', () => {
  it('is off to begin with, and shows how many years later or sooner each path is than the plan when pressed', async () => {
    renderTable()
    const button = screen.getByRole('button', { name: 'vs plan' })
    expect(button).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByText(/^\+\d+y$/)).toBeNull()

    await userEvent.click(button)

    expect(button).toHaveAttribute('aria-pressed', 'true')
    // The slower path is behind the plan by some years at 200k.
    expect(within(cell('Path B', 1)).getByText(/^\+\d+y$/)).toBeInTheDocument()
    // Nobody is compared with themselves, and the plan row keeps its height with an empty line.
    expect(within(cell('Path A', 1)).queryByText(/^[+−]\d+y$/)).toBeNull()
    expect(cell('Path B', 1).getAttribute('aria-label')).toMatch(/years later than Path A \(the plan\)\./)
    expect(screen.getByText(/Years sooner or later than Path A, the plan/)).toBeInTheDocument()
  })

  it('shows a path that is ahead in green with a minus', async () => {
    renderTable([makeScenario({ ...plan, monthlyContributionCents: 10_000 }), makeScenario({ ...slower, monthlyContributionCents: 100_000 })])
    await userEvent.click(screen.getByRole('button', { name: 'vs plan' }))

    const gap = within(cell('Path B', 1)).getByText(/^−\d+y$/)
    expect(gap.className).toMatch(/matrixSooner/)
  })

  it('words it where one side never gets there', async () => {
    renderTable()
    await userEvent.click(screen.getByRole('button', { name: 'vs plan' }))

    // The plan reaches 1M within 30 years and the slower path does not.
    expect(within(cell('Path B', 2)).getByText('later')).toBeInTheDocument()
  })

  it('gives the plan from today and the plan itself no figure, since they count from another baseline', async () => {
    const dated = makeScenario({ ...plan, planStartDate: '2024-01-01' })
    renderTable([dated, makeScenario({ ...slower, planStartDate: '2024-01-01' })], {
      fromToday: { scenario: makeScenario({ ...dated, startInvestedCents: 12_000_000 }), offsetYears: 2, since: '2026-01-01' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'vs plan' }))

    const fromToday = screen.getByRole('row', { name: /from today/ })
    expect(within(fromToday).queryByText(/^([+−]\d+y|=|later|sooner)$/)).toBeNull()
    expect(within(cell('Path B', 1)).getByText(/^\+\d+y$/)).toBeInTheDocument()
  })

  it('is off, with the reason, when no scenario is marked as the plan', () => {
    renderTable([makeScenario({ ...plan, isActive: false }), slower])

    const button = screen.getByRole('button', { name: 'vs plan' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-pressed', 'false')
    expect(button.getAttribute('title')).toMatch(/No scenario is marked as your current plan/)
  })
})

describe('the sentence under the table', () => {
  const readout = () => screen.getByText(/ a cell to read it as a sentence|reaches|already has|does not reach/, { selector: 'p[aria-live]' })

  it('asks to point at a cell before one has been, in a live region', () => {
    renderTable()

    expect(readout()).toHaveTextContent('Point at or focus a cell to read it as a sentence. The arrow keys move between cells.')
    expect(readout()).toHaveAttribute('aria-live', 'polite')
  })

  it('reads out the cell that is pointed at, then keeps it when the pointer leaves', async () => {
    renderTable()
    await userEvent.hover(cell('Path B', 1))

    expect(readout().textContent).toBe(cell('Path B', 1).getAttribute('aria-label'))
    await userEvent.unhover(cell('Path B', 1))
    expect(readout().textContent).toBe(cell('Path B', 1).getAttribute('aria-label'))
  })

  it('reads out the cell that is focused, and the one that is tapped', () => {
    renderTable()
    act(() => cell('Path A', 1).focus())
    expect(readout().textContent).toBe(cell('Path A', 1).getAttribute('aria-label'))

    fireEvent.click(cell('Path B', 0))
    expect(readout().textContent).toBe(cell('Path B', 0).getAttribute('aria-label'))
  })

  it('follows the toggle: pressing vs plan adds the comparison to the cell already read', async () => {
    renderTable()
    await userEvent.hover(cell('Path B', 1))
    expect(readout().textContent).not.toMatch(/the plan/)

    await userEvent.click(screen.getByRole('button', { name: 'vs plan' }))

    expect(readout().textContent).toMatch(/years later than Path A \(the plan\)\./)
  })

  it('marks the row and column of the cell pointed at, and clears them when the pointer leaves', async () => {
    renderTable()
    const marked = () => screen.getAllByRole('gridcell').filter((c) => /matrixLine|matrixCross/.test(c.className))

    await userEvent.hover(cell('Path B', 1))
    // Its row (3 cells) and column (2 cells) share the cell itself.
    expect(marked()).toHaveLength(4)
    expect(cell('Path B', 1).className).toMatch(/matrixCross/)

    await userEvent.unhover(cell('Path B', 1))
    expect(marked()).toHaveLength(0)
  })
})

describe('moving about the grid by keyboard', () => {
  it('is one tab stop, on the first cell, which the arrow keys move', async () => {
    renderTable()
    const stops = () => screen.getAllByRole('gridcell').filter((c) => c.getAttribute('tabindex') === '0')
    expect(stops()).toEqual([cell('Path A', 0)])

    act(() => cell('Path A', 0).focus())
    await userEvent.keyboard('{ArrowRight}')
    expect(cell('Path A', 1)).toHaveFocus()
    expect(stops()).toEqual([cell('Path A', 1)])

    await userEvent.keyboard('{ArrowDown}')
    expect(cell('Path B', 1)).toHaveFocus()
    await userEvent.keyboard('{ArrowLeft}{ArrowUp}')
    expect(cell('Path A', 0)).toHaveFocus()
  })

  it('goes to the ends of the row with Home and End, and stops at the edges', async () => {
    renderTable()
    act(() => cell('Path B', 1).focus())

    await userEvent.keyboard('{End}')
    expect(cell('Path B', 2)).toHaveFocus()
    await userEvent.keyboard('{ArrowRight}{ArrowDown}')
    expect(cell('Path B', 2)).toHaveFocus()
    await userEvent.keyboard('{Home}')
    expect(cell('Path B', 0)).toHaveFocus()
  })

  it('reads out each cell it lands on, and leaves other keys alone', async () => {
    renderTable()
    act(() => cell('Path A', 0).focus())
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByText(/^Path A reaches House deposit/, { selector: 'p[aria-live]' })).toBeInTheDocument()

    await userEvent.keyboard('a')
    expect(cell('Path A', 1)).toHaveFocus()
  })

  it('has its tab stop on a cell that is still there when rows go', () => {
    const { rerender } = renderTable([plan, slower])
    act(() => cell('Path B', 2).focus())

    rerender(<MilestoneMatrix scenarios={[plan]} draft={draft} milestones={milestones} reached={reached} includeDraft={false} />)

    expect(screen.getAllByRole('gridcell').filter((c) => c.getAttribute('tabindex') === '0')).toEqual([cell('Path A', 2)])
  })
})

describe('on a phone', () => {
  afterEach(() => {
    installFakeMatchMedia().setMatching(() => false)
  })

  it('drops the currency sign from the column heads, so that seven of them fit, and keeps it in the sentences', () => {
    installFakeMatchMedia().setMatching((query) => query === NARROW_MQ || query === '(hover: none)')
    renderTable()

    expect(screen.getByRole('columnheader', { name: /^100k/ }).textContent).not.toMatch(/€/)
    expect(screen.getByRole('columnheader', { name: /^100k/ })).toHaveAttribute('title', expect.stringContaining('100k €'))
    expect(cell('Path A', 0).getAttribute('aria-label')).toMatch(/100k €/)
    expect(screen.getByText(/^Tap a cell to read it as a sentence/)).toBeInTheDocument()
  })
})
