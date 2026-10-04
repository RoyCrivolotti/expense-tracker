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
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  installFakeMatchMedia()
})

const plan = makeScenario({
  id: 1,
  name: 'Path A',
  isActive: true,
  planStartDate: '2026-01-01',
  startInvestedCents: 10_000_000,
  monthlyContributionCents: 100_000,
})
const slower = makeScenario({
  id: 2,
  name: 'A path with quite a long name (editing, from today)',
  planStartDate: '2026-01-01',
  startInvestedCents: 10_000_000,
  monthlyContributionCents: 10_000,
})
const amounts = (...thousands: number[]) => thousands.map((k) => ({ amountCents: k * 100_000, label: '' }))
const EIGHT = amounts(100, 150, 200, 300, 400, 500, 750, 1000, 2000)

/** A phone, on the card's page: `px` is the width of the card, which jsdom cannot measure. */
function phone({ upright = true, width = 327 }: { upright?: boolean; width?: number } = {}) {
  installFakeMatchMedia((query) => query === NARROW_MQ || query === '(hover: none)' || (query === '(orientation: portrait)' && upright))
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(width)
}

function renderTable(milestones = EIGHT) {
  return render(
    <MilestoneMatrix scenarios={[plan, slower]} draft={draft} milestones={milestones} reached={new Map()} includeDraft={false} />,
  )
}

const dialog = () => screen.getByRole('dialog', { name: 'Years to milestone, every milestone' })
const open = () => userEvent.click(screen.getByRole('button', { name: 'All milestones' }))
const heads = (root: HTMLElement) => within(root).getAllByRole('columnheader').slice(1).map((h) => h.textContent ?? '')

describe('the sheet with every milestone', () => {
  it('is offered where the table is paged, and not where it is not', () => {
    phone()
    const { unmount } = renderTable()
    expect(screen.getByRole('button', { name: 'All milestones' })).toBeInTheDocument()
    unmount()

    phone({ width: 700 })
    renderTable()
    expect(screen.queryByRole('button', { name: 'All milestones' })).not.toBeInTheDocument()
  })

  it('is not there on the wide page', () => {
    installFakeMatchMedia()
    renderTable()

    expect(screen.queryByRole('button', { name: 'All milestones' })).not.toBeInTheDocument()
  })

  it('opens as a dialog with every milestone in it, the ones the card folds as well', async () => {
    phone()
    renderTable()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await open()

    expect(heads(dialog())).toHaveLength(9)
    expect(heads(dialog())[0]).toBe('100k €')
    expect(heads(dialog())[8]).toBe('2,0M €')
  })

  it('keeps the currency sign in the heads, with room for it', async () => {
    phone()
    renderTable()

    await open()

    expect(within(dialog()).getAllByRole('columnheader')[1]).toHaveTextContent('100k €')
  })

  it('is a table of its own, with its own sentence under it for the cell in hand', async () => {
    phone()
    renderTable()
    await open()

    const first = within(dialog()).getAllByRole('gridcell')[1] as HTMLElement
    await userEvent.click(first)

    expect(within(dialog()).getByText(/^Path A (reaches|already)/, { selector: 'p[aria-live]' })).toBeInTheDocument()
    // The card behind has not been told about it.
    expect(screen.getAllByText(/^Tap a cell to read it as a sentence/)).toHaveLength(1)
  })

  it('closes with its button, and gives the focus back to the button that opened it', async () => {
    phone()
    renderTable()
    await open()
    expect(within(dialog()).getByRole('button', { name: 'Close' })).toBeInTheDocument()

    await userEvent.click(within(dialog()).getByRole('button', { name: 'Close' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'All milestones' })).toHaveFocus()
  })

  it('closes with Escape', async () => {
    phone()
    renderTable()
    await open()

    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('changes what the card shows when its toggles are used, and leaves it that way', async () => {
    phone()
    renderTable()
    await open()

    await userEvent.click(within(dialog()).getByRole('radio', { name: 'Calendar year' }))
    await userEvent.click(within(dialog()).getByRole('button', { name: 'vs plan' }))
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Close' }))

    expect(screen.getByRole('radio', { name: 'Calendar year' })).toBeChecked()
    expect(screen.getByRole('button', { name: 'vs plan' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('says to turn the phone when it is held upright, and not when it is on its side', async () => {
    phone({ upright: true })
    const { unmount } = renderTable()
    await open()
    expect(screen.getByText('Turn your phone sideways for more room.')).toBeInTheDocument()
    unmount()

    phone({ upright: false })
    renderTable()
    await open()
    expect(screen.queryByText('Turn your phone sideways for more room.')).not.toBeInTheDocument()
  })

  it('does not say it for a mouse, where there is nothing to turn', async () => {
    installFakeMatchMedia((query) => query === NARROW_MQ || query === '(orientation: portrait)')
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(327)
    renderTable()
    await open()

    expect(screen.queryByText('Turn your phone sideways for more room.')).not.toBeInTheDocument()
  })

  it('is closed when the card goes to the wide page', async () => {
    const media = installFakeMatchMedia((query) => query === NARROW_MQ || query === '(hover: none)')
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(327)
    renderTable()
    await open()
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    media.change(NARROW_MQ, false)

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
