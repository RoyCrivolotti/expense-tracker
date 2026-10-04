import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installFakeMatchMedia } from '../../../../testing/fakeMatchMedia'
import { NARROW_MQ } from '../useGoalsNarrow'
import { MilestoneMatrix } from './MilestoneMatrix'
import { makeScenario } from '../../../../testing/factories'

const draft = makeScenario({ id: 0, name: 'Draft' })

// The paths count their years from today, so the day is fixed: the plans below start on it.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 0, 1, 12))
})
afterEach(() => {
  vi.useRealTimers()
})

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

  it('says in the hint that every path is counted from today, in yearly steps that can be later than the date on Progress', () => {
    renderTable()

    expect(screen.getByText(/Every path is counted in whole years from today/)).toBeInTheDocument()
    expect(screen.getByText(/up to a year later than the date on the Progress tab/)).toBeInTheDocument()
  })

  it('counts a path that started a while ago from today, and its calendar year from its own start', async () => {
    const started = makeScenario({ ...plan, id: 9, name: 'Path S', isActive: false, planStartDate: '2023-07-01' })
    renderTable([started, plan])
    const own = Number((cell('Path S', 1).getAttribute('aria-label') ?? '').match(/by (\d{4})/)?.[1]) - 2023
    const fromNow = Number((cell('Path S', 1).textContent ?? '').replace('y', ''))

    // Started two and a half years before today: the same step is that much nearer, rounded up.
    expect(fromNow).toBe(Math.ceil(own - 2.5))
    await userEvent.click(screen.getByRole('radio', { name: 'Calendar year' }))
    expect(cell('Path S', 1)).toHaveTextContent(String(2023 + own))
  })

  it('shows a milestone the path passed before today as a tick in both views, and says when', async () => {
    const started = makeScenario({ ...plan, planStartDate: '2000-01-01', monthlyContributionCents: 1_000_000 })
    renderTable([started])

    expect(cell('Path A', 1)).toHaveTextContent('✓')
    expect(cell('Path A', 1).getAttribute('aria-label')).toMatch(/^Path A reached House deposit \(200k €\) before today, in 20\d\d\./)
    await userEvent.click(screen.getByRole('radio', { name: 'Calendar year' }))
    expect(cell('Path A', 1)).toHaveTextContent('✓')
  })

  it('counts where a path ends from today too: the hatched box says the years that are left', () => {
    const started = makeScenario({ ...slower, planStartDate: '2024-01-01' })
    renderTable([plan, started])

    expect(cell('Path B', 2)).toHaveTextContent('28+')
    expect(cell('Path B', 2).getAttribute('aria-label')).toBe('Path B does not reach 1,0M € within its horizon (the next 28 years).')
    expect(screen.getByText(/Darker: further away \(the darkest is 30 years\)/)).toBeInTheDocument()
  })

  it('tints a cell by the years from today, on one scale for every row', () => {
    const started = makeScenario({ ...slower, planStartDate: '2024-01-01' })
    renderTable([plan, started])

    const tint = (c: HTMLElement) => parseInt(c.querySelector<HTMLElement>('span')!.style.getPropertyValue('--tint'))
    const years = (c: HTMLElement) => Number((c.textContent ?? '').replace('y', ''))
    const [a, b] = [cell('Path A', 1), cell('Path B', 1)]
    expect(years(b)).toBeGreaterThan(years(a))
    expect(tint(b)).toBeGreaterThan(tint(a))
    expect(tint(b)).toBe(Math.round(5 + 26 * (years(b) / 30)))
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
    // Nobody is compared with themselves.
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

  const shown = (c: HTMLElement) => c.querySelector('span')?.textContent ?? ''
  const gapOf = (c: HTMLElement) => c.querySelector('[class*="matrixGap"]')?.textContent?.trim() ?? ''
  const signed = (text: string) => Number(text.replace('−', '-').replace(/[+y]/g, ''))

  it('gives every path a figure whatever day it started on, which is the difference of the cells shown', async () => {
    // The plan started a year and a half before the other path and two years before today.
    const early = makeScenario({ ...plan, planStartDate: '2024-01-01' })
    const later = makeScenario({ ...slower, planStartDate: '2025-07-01', monthlyContributionCents: 40_000 })
    renderTable([early, later])
    await userEvent.click(screen.getByRole('button', { name: 'vs plan' }))

    const planYears = Number(shown(cell('Path A', 1)).replace('y', ''))
    const pathYears = Number(shown(cell('Path B', 1)).replace('y', ''))
    expect(gapOf(cell('Path B', 1))).not.toBe('')
    expect(signed(gapOf(cell('Path B', 1)))).toBe(pathYears - planYears)
    expect(cell('Path B', 1).getAttribute('aria-label')).toMatch(/years later than Path A \(the plan\)\./)
  })

  it('sets the plan from today against the plan as well, on the same footing, and gives the plan itself nothing', async () => {
    const dated = makeScenario({ ...plan, planStartDate: '2024-01-01' })
    renderTable([dated, makeScenario({ ...slower, planStartDate: '2024-01-01' })], {
      fromToday: { scenario: makeScenario({ ...dated, startInvestedCents: 12_000_000 }), offsetYears: 2, since: '2026-01-01' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'vs plan' }))

    const exact = (name: string, col: number) =>
      within(screen.getByRole('rowheader', { name: new RegExp(`^${name}( plan)?$`) }).closest('tr')!).getAllByRole('gridcell')[col] as HTMLElement
    const planYears = Number(shown(exact('Path A', 1)).replace('y', ''))
    const todayYears = Number(shown(exact('Path A, from today', 1)).replace('y', ''))
    // Today's balance is behind the plan's schedule here, so the row is later than the plan.
    expect(todayYears).toBeGreaterThan(planYears)
    expect(signed(gapOf(exact('Path A, from today', 1)))).toBe(todayYears - planYears)
    expect(gapOf(exact('Path A', 1))).toBe('')
    expect(within(cell('Path B', 1)).getByText(/^\+\d+y$/)).toBeInTheDocument()
  })

  it('keeps the line for the gap only in the rows that can have one', async () => {
    renderTable()
    const lines = (row: string) => screen.getByRole('row', { name: new RegExp(`^${row}`) }).querySelectorAll('[class*="matrixGap"]').length
    expect(lines('Path B')).toBe(0)

    await userEvent.click(screen.getByRole('button', { name: 'vs plan' }))

    expect(lines('Path A')).toBe(0)
    expect(lines('Path B')).toBe(3)
  })

  it('keeps no line in a row where every milestone is already there', async () => {
    render(
      <MilestoneMatrix
        scenarios={[plan, slower]}
        draft={draft}
        milestones={[{ amountCents: 1_000_000, label: '' }]}
        reached={new Map()}
        includeDraft={false}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'vs plan' }))

    expect(document.querySelectorAll('[class*="matrixGap"]')).toHaveLength(0)
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

  it('asks for a tap, not a hover, and keeps the currency sign in the sentences', () => {
    installFakeMatchMedia().setMatching((query) => query === NARROW_MQ || query === '(hover: none)')
    renderTable()

    // 100k is there on every path from the start, so it is a line of text and not a column.
    expect(screen.queryByRole('columnheader', { name: /^100k/ })).not.toBeInTheDocument()
    expect(cell('Path A', 0).getAttribute('aria-label')).toMatch(/House deposit \(200k €\)/)
    expect(screen.getByText(/^Tap a cell to read it as a sentence/)).toBeInTheDocument()
  })
})
