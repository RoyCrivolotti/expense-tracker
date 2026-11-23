import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeRecommendation } from '../../testing/reviewKit'
import { setMotionDisabledForTests } from '../hooks/motion'
import { ReviewCardSlot } from './ReviewCardSlot'
import { ReviewContext, type ReviewCore } from './reviewContext'
import { HISTORY_WAIT_MS } from '../useHistoryWatch'
import { HISTORY_WORDS } from '../historyWords'

// The card stands in for its lazy chunk: whether it mounts is whether the chunk is fetched.
vi.mock('./ReviewCard', () => ({ default: () => <p>card chunk mounted</p> }))

const coreWith = (
  items: ReviewCore['items'],
  model: object = {},
) => ({ items, count: items.length, model }) as unknown as ReviewCore

function slot(core: ReviewCore | null) {
  return render(
    <ReviewContext.Provider value={core}>
      <ReviewCardSlot />
    </ReviewContext.Provider>,
  )
}

beforeEach(() => setMotionDisabledForTests(true))

describe('the review card slot', () => {
  it('loads the card once a payment is open', async () => {
    slot(coreWith([makeRecommendation()]))

    expect(await screen.findByText('card chunk mounted')).toBeInTheDocument()
  })

  it('does not load the card while nothing is open', async () => {
    slot(coreWith([]))

    // A lazy import resolves within a few ticks; give it them before saying it never came.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.queryByText('card chunk mounted')).not.toBeInTheDocument()
  })

  it('shows nothing without a provider', () => {
    const { container } = slot(null)

    expect(container).toBeEmptyDOMElement()
  })

  describe('on a model holding only some rows', () => {
    // `sums` set and no `history`: the monthly-series hints cannot be worked out yet.
    const partial = { sums: {}, watchHistory: vi.fn(() => () => {}) }
    const full = { ...partial, history: { groups: [] } }
    const hostFor = (model: object) => (
      <ReviewContext.Provider value={coreWith([makeRecommendation()], model)}>
        <ReviewCardSlot />
      </ReviewContext.Provider>
    )

    // The give-up outlives a screen, so each test starts from a landed history that forgets it.
    beforeEach(() => {
      render(hostFor(full)).unmount()
    })

    it('holds the card until the history lands, then shows it', async () => {
      const view = render(hostFor(partial))
      await act(() => new Promise((resolve) => setTimeout(resolve, 50)))
      expect(screen.queryByText('card chunk mounted')).not.toBeInTheDocument()
      expect(partial.watchHistory).toHaveBeenCalled()

      view.rerender(hostFor(full))
      expect(await screen.findByText('card chunk mounted')).toBeInTheDocument()
    })

    it('shows the card without the history once the wait is over', async () => {
      vi.useFakeTimers()
      try {
        render(hostFor(partial))
        await act(() => vi.advanceTimersByTimeAsync(HISTORY_WAIT_MS - 100))
        expect(screen.queryByText('card chunk mounted')).not.toBeInTheDocument()
        await act(() => vi.advanceTimersByTimeAsync(200))
        vi.useRealTimers()
        expect(await screen.findByText('card chunk mounted')).toBeInTheDocument()
      } finally {
        vi.useRealTimers()
      }
    })

    it('shows the card at once when the model says the read failed or there is no one to ask', async () => {
      for (const note of [HISTORY_WORDS.failed, HISTORY_WORDS.offline]) {
        const view = render(hostFor({ ...partial, historyNote: note }))
        expect(await screen.findByText('card chunk mounted')).toBeInTheDocument()
        view.unmount()
      }
    })

    it('waits for a hung read once, not on every return to the screen', async () => {
      const hung = { ...partial, historyNote: HISTORY_WORDS.loading }
      vi.useFakeTimers()
      try {
        const first = render(hostFor(hung))
        await act(() => vi.advanceTimersByTimeAsync(HISTORY_WAIT_MS + 100))
        first.unmount()
        vi.useRealTimers()
        render(hostFor(hung))
        expect(await screen.findByText('card chunk mounted')).toBeInTheDocument()
      } finally {
        vi.useRealTimers()
      }
    })

    it('waits again after the history has landed once and a new wait begins', async () => {
      const hung = { ...partial, historyNote: HISTORY_WORDS.loading }
      vi.useFakeTimers()
      try {
        const first = render(hostFor(hung))
        await act(() => vi.advanceTimersByTimeAsync(HISTORY_WAIT_MS + 100))
        first.unmount()
        // The history lands: the card shows with it, and the give-up is forgotten.
        const landed = render(hostFor(full))
        await act(() => vi.advanceTimersByTimeAsync(50))
        landed.unmount()
        const again = render(hostFor(hung))
        await act(() => vi.advanceTimersByTimeAsync(50))
        expect(screen.queryByText('card chunk mounted')).not.toBeInTheDocument()
        again.unmount()
      } finally {
        vi.useRealTimers()
      }
    })

    it('does not watch the history while nothing is waiting', () => {
      const watch = vi.fn(() => () => {})
      render(
        <ReviewContext.Provider value={coreWith([], { ...partial, watchHistory: watch })}>
          <ReviewCardSlot />
        </ReviewContext.Provider>,
      )
      expect(watch).not.toHaveBeenCalled()
    })
  })
})
