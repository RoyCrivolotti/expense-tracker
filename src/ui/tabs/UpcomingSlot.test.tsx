import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RecommendationInfo } from '../../data/recommendationsApi'
import { groupTransactions } from '../../domain/engine/recurringDetect'
import { makeTransaction } from '../../testing/factories'
import { makeRecommendation, makeSeriesModel } from '../../testing/reviewKit'
import { buildExpenseModel } from '../buildExpenseModel'
import { ReviewContext, type ReviewCore } from '../capture/reviewContext'
import type { ExpenseModel } from '../useExpenseData'
import { resetStoppedSuggestionsForTests } from './stoppedSuggestions'
import { MARKS_WAIT_MS } from './useRecurringMarks'
import { UpcomingSlot } from './UpcomingSlot'

const model = makeSeriesModel()

/** A push no history knows, for Video Stream's 12,99 due on the 10th. Invented data. */
const push = (over: Partial<RecommendationInfo> = {}) =>
  makeRecommendation({ merchantRaw: 'PAYPROC*XY 77', amountCents: 1299, localDate: '2026-11-11', ...over })

function makeCore(over: Partial<ReviewCore> = {}): ReviewCore {
  const items = over.items ?? []
  return {
    model,
    items,
    loads: 1,
    count: items.length,
    hasMore: false,
    more: vi.fn(),
    error: null,
    retry: vi.fn(),
    failures: new Map(),
    canWrite: true,
    decide: vi.fn(),
    openForm: vi.fn(),
    ...over,
  }
}

function show(
  core: ReviewCore | null,
  on: ExpenseModel = model,
) {
  const onAdd = vi.fn()
  const slot = (c: ReviewCore | null) => (
    <ReviewContext.Provider value={c}>
      <UpcomingSlot model={on} month="2026-11" onAdd={onAdd} />
    </ReviewContext.Provider>
  )
  const view = render(slot(core))
  return { onAdd, rerender: (c: ReviewCore | null) => view.rerender(slot(c)) }
}

const captured = () => screen.queryAllByText('Captured from your bank, review')

beforeEach(() => {
  localStorage.clear()
  resetStoppedSuggestionsForTests()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-11T12:00:00'))
})
afterEach(() => vi.useRealTimers())

describe('the Upcoming card and the bank pushes waiting', () => {
  it('marks the charge a waiting push is, and opens that push on "+" instead of a new row', async () => {
    const core = makeCore({ items: [push()] })
    const { onAdd } = show(core)

    expect(await screen.findByText('Captured from your bank, review')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Review Video Stream from your bank' }))

    expect(core.openForm).toHaveBeenCalledWith(
      expect.objectContaining({ recommendationId: push().id, description: 'Video Stream', categoryId: 2 }),
    )
    expect(onAdd).not.toHaveBeenCalled()
    expect(captured()).toHaveLength(1)
  })

  it('opens the same push from the "Captured from your bank" line', async () => {
    const core = makeCore({ items: [push()] })
    show(core)

    fireEvent.click(await screen.findByRole('button', { name: 'Captured from your bank, review Video Stream' }))

    expect(core.openForm).toHaveBeenCalledWith(expect.objectContaining({ recommendationId: push().id }))
  })

  it('leaves the other charges as they were: "+" adds a new row', async () => {
    vi.setSystemTime(new Date('2026-11-12T12:00:00'))
    const { onAdd } = show(makeCore({ items: [push()] }))
    await screen.findByText('Captured from your bank, review')

    fireEvent.click(screen.getByRole('button', { name: 'Add Gym' }))

    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ description: 'Gym', amountCents: 2500 }))
    expect(onAdd.mock.calls[0]![0]).not.toHaveProperty('recommendationId')
  })

  it('marks neither of two series one push fits', async () => {
    vi.setSystemTime(new Date('2026-11-14T12:00:00'))
    show(makeCore({ items: [push({ amountCents: 999, localDate: '2026-11-14' })] }))

    expect(await screen.findByRole('button', { name: 'Add Music Plan' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Cloud Box' })).toBeInTheDocument()
    expect(captured()).toHaveLength(0)
  })

  it('holds the card until the pushes are read, so a mark never appears under a finger', async () => {
    const { rerender } = show(makeCore({ items: [], loads: 0 }))
    expect(screen.queryByText('Upcoming')).not.toBeInTheDocument()

    rerender(makeCore({ items: [push()], loads: 1 }))

    expect(await screen.findByText('Upcoming')).toBeInTheDocument()
    expect(captured()).toHaveLength(1)
  })

  it('shows the card plain when the read fails', () => {
    show(makeCore({ loads: 0, error: 'Offline' }))

    expect(screen.getByText('Upcoming')).toBeInTheDocument()
    expect(captured()).toHaveLength(0)
  })

  it('stops waiting for a read that hangs', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    vi.setSystemTime(new Date('2026-11-11T12:00:00'))
    show(makeCore({ loads: 0 }))
    expect(screen.queryByText('Upcoming')).not.toBeInTheDocument()

    act(() => void vi.advanceTimersByTime(MARKS_WAIT_MS - 1))
    expect(screen.queryByText('Upcoming')).not.toBeInTheDocument()
    act(() => void vi.advanceTimersByTime(1))
    expect(screen.getByText('Upcoming')).toBeInTheDocument()
  })

  it('shows at once where there is no list of pushes at all', () => {
    show(null)

    expect(screen.getByRole('button', { name: 'Add Video Stream' })).toBeInTheDocument()
  })
})

describe('a model holding only some rows', () => {
  it('shows nothing until the history arrives, then the card with its mark at once', async () => {
    const waiting: ExpenseModel = { ...model, sums: model.dataset }
    const onAdd = vi.fn()
    const core = makeCore({ items: [push()] })
    const slot = (on: ExpenseModel) => (
      <ReviewContext.Provider value={core}>
        <UpcomingSlot model={on} month="2026-11" onAdd={onAdd} />
      </ReviewContext.Provider>
    )
    const { rerender } = render(slot(waiting))
    expect(screen.queryByText('Upcoming')).not.toBeInTheDocument()

    rerender(slot({ ...waiting, history: { groups: groupTransactions(model.dataset.transactions) } }))

    expect(await screen.findByText('Upcoming')).toBeInTheDocument()
    expect(captured()).toHaveLength(1)
  })
})

describe('a charge that may already be logged under another name', () => {
  const saved = (over: Partial<Parameters<typeof makeTransaction>[0]> = {}) =>
    buildExpenseModel({
      ...model.dataset,
      transactions: [
        ...model.dataset.transactions,
        makeTransaction({ id: 900, description: 'PAYPROC*XY 77', amountCents: 1299, date: '2026-11-09', ...over }),
      ],
    })

  it('says so and stays on the card, with "+" still adding a new row', () => {
    const { onAdd } = show(makeCore(), saved())

    expect(screen.getByText(/^Maybe already added on 9\sNov as PAYPROC\*XY 77$/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add Video Stream' }))
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ description: 'Video Stream' }))
  })

  it('says nothing for a row of another amount', () => {
    show(makeCore(), saved({ amountCents: 1300 }))

    expect(screen.getByRole('button', { name: 'Add Video Stream' })).toBeInTheDocument()
    expect(screen.queryByText(/Maybe already added/)).not.toBeInTheDocument()
  })
})
