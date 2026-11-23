import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RecommendationInfo } from '../../data/recommendationsApi'
import { makeTransaction } from '../../testing/factories'
import { makeRecommendation, makeReviewModel, makeSeriesModel } from '../../testing/reviewKit'
import { EXIT_MS, setMotionDisabledForTests } from '../hooks/motion'
import { MoneyFormatProvider } from '../hooks/MoneyFormatProvider'
import ReviewCard from './ReviewCard'
import { ReviewCardSlot } from './ReviewCardSlot'
import { ReviewContext, type ReviewCore } from './reviewContext'

const model = makeReviewModel()
const id = (n: number) => `0b0c0d0e-1111-4222-8333-44445555666${n}`
const rec = (
  n: number,
  over: Partial<RecommendationInfo> = {},
) => makeRecommendation({ id: id(n), ...over })

function makeCore(over: Partial<ReviewCore> = {}): ReviewCore {
  const items = over.items ?? [rec(1)]
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
    submit: vi.fn().mockResolvedValue(makeTransaction({ id: 9 })),
    openForm: vi.fn(),
    ...over,
  }
}

/** The card with the sheet state its slot would hold. */
function Harness({ core }: { core: ReviewCore }) {
  const [sheet, setSheet] = useState(false)
  return <ReviewCard core={core} sheet={sheet} onSheet={setSheet} />
}

const wrap = (core: ReviewCore) => (
  <MoneyFormatProvider currencyCode="EUR" numberLocale="de-DE">
    <Harness core={core} />
  </MoneyFormatProvider>
)
const show = (core: ReviewCore) => render(wrap(core))

describe('a payment the server suggests from the person’s history', () => {
  const suggested = rec(1, {
    merchantRaw: 'NEW PLACE 0099',
    suggestion: {
      description: 'Weekly shop',
      categoryId: 2,
      type: 'expense',
      accountId: 1,
      amountCents: 1250,
      sightings: 2,
      settled: true,
      reasons: [],
    },
  })

  it('shows the person’s own description and category instead of the bank’s words', () => {
    show(makeCore({ items: [suggested] }))

    const row = screen.getByRole('listitem')
    expect(within(row).getByText('Weekly shop')).toBeInTheDocument()
    expect(within(row).getByText('Groceries')).toBeInTheDocument()
    expect(within(row).queryByText(/NEW PLACE/)).not.toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Add Weekly shop' })).toBeInTheDocument()
  })

  it('names a wording the person has never accepted as the reason to look', () => {
    show(makeCore({ items: [{ ...suggested, suggestion: { ...suggested.suggestion!, reasons: ['new-shape'] } }] }))

    const row = screen.getByRole('listitem')
    expect(within(row).getByText('New push wording')).toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: 'Add Weekly shop' })).not.toBeInTheDocument()
  })
})

describe('a known payment', () => {
  it("shows all seven fields and offers Add, Change and Don't add", () => {
    show(makeCore())

    const row = screen.getByRole('listitem')
    expect(within(row).getByText('Cafe Example')).toBeInTheDocument()
    expect(within(row).getByText(/12,50/)).toBeInTheDocument()
    expect(within(row).getByText('Expense')).toBeInTheDocument()
    expect(within(row).getByText('Eating out')).toBeInTheDocument()
    expect(within(row).getByText('Main Debit')).toBeInTheDocument()
    expect(within(row).getByText(/Tue 10 Nov, \d\d:\d\d/)).toBeInTheDocument()
    expect(within(row).getByText('Nov budget')).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Add Cafe Example' })).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Change' })).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: "Don't add Cafe Example" })).toBeInTheDocument()
  })

  it('holds an Add as a decision that sends the payment through its recommendation', async () => {
    const core = makeCore()
    show(core)

    fireEvent.click(screen.getByRole('button', { name: 'Add Cafe Example' }))

    const [recId, message, failure, send] = vi.mocked(core.decide).mock.calls[0]!
    expect([recId, failure]).toEqual([id(1), 'add Cafe Example'])
    expect(message.split('\n')[1]).toBe(
      'Expense \u00b7 Eating out \u00b7 Main Debit \u00b7 Tue 10 Nov \u00b7 Nov budget',
    )
    await send()
    expect(core.submit).toHaveBeenCalledWith(
      id(1),
      expect.objectContaining({ amountCents: 1250, categoryId: 1, accountId: 1, budgetMonth: '2026-11' }),
    )
  })

  it("holds a Don't add that only dismisses, and says it teaches nothing", () => {
    const core = makeCore()
    show(core)

    fireEvent.click(screen.getByRole('button', { name: "Don't add Cafe Example" }))

    const [recId, message, failure] = vi.mocked(core.decide).mock.calls[0]!
    expect([recId, failure]).toEqual([id(1), 'remove Cafe Example'])
    expect(message).toContain('Only this suggestion is removed')
    expect(core.submit).not.toHaveBeenCalled()
  })

  it('opens the add form on Change, with the seed and no queue behind a single payment', () => {
    const core = makeCore()
    show(core)

    fireEvent.click(screen.getByRole('button', { name: 'Change' }))

    const seed = vi.mocked(core.openForm).mock.calls[0]![0]
    expect(seed).toMatchObject({
      recommendationId: id(1),
      amountCents: 1250,
      categoryId: 1,
      description: 'Cafe Example',
    })
    expect(seed.queue?.left).toBe(0)
  })

  it("says in plain words that Don't add removes only this suggestion", () => {
    show(makeCore())

    expect(screen.getByText(/only removes that one suggestion/)).toBeInTheDocument()
  })
})

describe('a payment in doubt', () => {
  it('has Review and no one-tap Add, says why in chips, and writes a foreign amount in its own currency', () => {
    show(makeCore({ items: [rec(1, { merchantRaw: 'BRAND NEW PLACE', currency: 'USD', amountCents: 2000 })] }))

    expect(screen.queryByRole('button', { name: /^Add / })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review' })).toBeInTheDocument()
    expect(screen.getByText('Category: not set')).toBeInTheDocument()
    expect(screen.getByText('Not in euros')).toBeInTheDocument()
    expect(screen.getByText('New merchant')).toBeInTheDocument()
    expect(screen.getByText('US$20.00')).toBeInTheDocument()
  })

  it('says what is missing on a payment with no merchant, no account and no amount', () => {
    show(makeCore({ items: [rec(1, { merchantRaw: null, accountId: null, amountCents: null, suggestedType: null })] }))

    expect(screen.getByText('No merchant', { selector: 'span[class*=missing]' })).toBeInTheDocument()
    expect(screen.getByText('Account: not set')).toBeInTheDocument()
    expect(screen.getByText('Type: pick one')).toBeInTheDocument()
    expect(screen.getByText('Your own money moved')).toBeInTheDocument()
    expect(screen.getByText('Amount missing')).toBeInTheDocument()
  })

  it('offers to link the typed row the server named, and holds the link', () => {
    const core = makeCore({
      items: [rec(1, { possibleMatch: { transactionId: 9, description: 'Cafe', date: '2026-11-09' } })],
    })
    show(core)

    expect(screen.queryByRole('button', { name: /^Add / })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Already entered as Cafe? Link' }))

    const [recId, message, failure] = vi.mocked(core.decide).mock.calls[0]!
    expect([recId, failure]).toEqual([id(1), 'link Cafe Example'])
    expect(message).toContain('To your typed row "Cafe". Nothing new is added.')
  })

  it('cuts a long description of the typed row on the button, starts the name with the words shown and keeps the whole of it after them', () => {
    const long = 'A very long description that somebody typed once and that runs past the end of any row'
    show(makeCore({ items: [rec(1, { possibleMatch: { transactionId: 9, description: long, date: '2026-11-09' } })] }))

    const button = screen.getByRole('button', {
      name: `Already entered as A very long description that somebo\u2026? Link, ${long}`,
    })

    expect(button).toHaveTextContent(/^Already entered as A very long description that somebo\u2026\? Link$/)
    expect(button).toHaveAttribute('title', long)
  })

  it('shows why a payment came back after a failed send', () => {
    show(makeCore({ failures: new Map([[id(1), 'Request failed (500)']]) }))

    expect(screen.getByRole('alert')).toHaveTextContent('Not sent: Request failed (500)')
  })
})

describe('the card', () => {
  it('counts the payments, in the singular too', () => {
    const { unmount } = show(makeCore({ items: [rec(1)] }))
    expect(screen.getByRole('heading', { name: '1 payment to review' })).toBeInTheDocument()
    unmount()

    show(makeCore({ items: [rec(1), rec(2)] }))
    expect(screen.getByRole('heading', { name: '2 payments to review' })).toBeInTheDocument()
  })

  it('shows three payments and opens the rest in a sheet, whose Review closes it and opens the form', () => {
    const core = makeCore({ items: [rec(1), rec(2), rec(3), rec(4), rec(5, { merchantRaw: 'BRAND NEW PLACE' })] })
    show(core)
    expect(screen.getAllByRole('listitem')).toHaveLength(3)

    fireEvent.click(screen.getByRole('button', { name: 'See all 5' }))
    const sheet = screen.getByRole('dialog')
    expect(within(sheet).getAllByRole('listitem')).toHaveLength(5)
    fireEvent.click(within(sheet).getByRole('button', { name: 'Review' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(vi.mocked(core.openForm).mock.calls[0]![0]).toMatchObject({ recommendationId: id(5) })
  })

  it.each([
    ['a phone', true, 3],
    ['a wide screen', false, 5],
  ])(
    'shows %s the most rows, and all of them when it is exactly one more, with the full count on the heading',
    (_name, phone, limit) => {
      viewport(phone)
      for (const total of [0, 1, 3, 4, 5, 6, 7]) {
        const items = Array.from({ length: total }, (_x, i) => rec(i + 1))
        const { unmount } = show(makeCore({ items }))
        const rows = screen.queryAllByRole('listitem').length
        const expected = total === 0 ? 0 : total === limit + 1 ? total : Math.min(total, limit)

        expect(rows, `${total} on ${limit}`).toBe(expected)
        expect(screen.queryByRole('button', { name: `See all ${total}` }) !== null, `${total} see all`).toBe(
          total > expected,
        )
        if (total > 0)
          expect(
            screen.getByRole('heading', { name: total === 1 ? '1 payment to review' : `${total} payments to review` }),
          ).toBeInTheDocument()
        unmount()
      }
    },
  )

  it('queues the payments after the one reviewed, so the form can move on to them', () => {
    const core = makeCore({ items: [rec(1, { merchantRaw: 'BRAND NEW PLACE' }), rec(2), rec(3)] })
    show(core)

    fireEvent.click(screen.getByRole('button', { name: 'Review' }))

    const seed = vi.mocked(core.openForm).mock.calls[0]![0]
    expect(seed.queue!.left).toBe(2)
    expect(seed.queue!.next()).toMatchObject({ recommendationId: id(2) })
  })

  it('offers See all when more are not loaded yet, and Show more in the sheet', () => {
    const core = makeCore({ hasMore: true, count: 9 })
    show(core)

    fireEvent.click(screen.getByRole('button', { name: 'See all 9' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Show more' }))

    expect(core.more).toHaveBeenCalledOnce()
  })

  it('says all caught up in the sheet once nothing is left', () => {
    const core = makeCore({ items: [rec(1), rec(2), rec(3), rec(4), rec(5)] })
    const { rerender } = show(core)
    fireEvent.click(screen.getByRole('button', { name: 'See all 5' }))

    rerender(wrap({ ...core, items: [], count: 0 }))

    expect(within(screen.getByRole('dialog')).getByText('All caught up.')).toBeInTheDocument()
  })

  it('shows a failed read with a way to try again', () => {
    const core = makeCore({ error: 'Request failed (500)' })
    show(core)

    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Try again' }))

    expect(core.retry).toHaveBeenCalledOnce()
  })

  it('shows the rows but no buttons where the app cannot write', () => {
    show(makeCore({ canWrite: false, submit: undefined }))

    expect(screen.getByText('Cafe Example')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('ignores a one tap where the app cannot write', () => {
    const core = makeCore({ submit: undefined })
    show(core)

    fireEvent.click(screen.getByRole('button', { name: 'Add Cafe Example' }))

    expect(core.decide).not.toHaveBeenCalled()
  })
})

/** The shell's breakpoint: matches below 768px, where it is a phone layout. */
function viewport(phone: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: phone && query === '(max-width: 767px)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  })
}

beforeEach(() => viewport(true))

afterEach(() => {
  vi.useRealTimers()
  setMotionDisabledForTests(true)
})

describe('the slot on the Dashboard', () => {
  const slot = (value: ReviewCore | null) =>
    render(
      <MoneyFormatProvider currencyCode="EUR" numberLocale="de-DE">
        <ReviewContext.Provider value={value}>
          <ReviewCardSlot />
        </ReviewContext.Provider>
      </MoneyFormatProvider>,
    )

  it('shows nothing with the flag off, and nothing when there is nothing to review', () => {
    const off = slot(null)
    expect(off.container).toBeEmptyDOMElement()
    off.unmount()

    expect(slot(makeCore({ items: [], count: 0 })).container).toBeEmptyDOMElement()
  })

  it('loads the card when there is a payment', async () => {
    slot(makeCore())

    expect(await screen.findByRole('heading', { name: '1 payment to review' })).toBeInTheDocument()
  })

  it('keeps the sheet when its last payment is decided there, says all caught up, and lets it leave before the card goes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    setMotionDisabledForTests(false)
    const four = [rec(1), rec(2), rec(3), rec(4), rec(5)]
    const { rerender } = slot(makeCore({ items: four }))
    await act(async () => void (await vi.advanceTimersByTimeAsync(0)))
    fireEvent.click(await screen.findByRole('button', { name: 'See all 5' }))

    rerender(
      <MoneyFormatProvider currencyCode="EUR" numberLocale="de-DE">
        <ReviewContext.Provider value={makeCore({ items: [], count: 0 })}>
          <ReviewCardSlot />
        </ReviewContext.Provider>
      </MoneyFormatProvider>,
    )

    const sheet = screen.getByRole('dialog')
    expect(within(sheet).getByText('All caught up.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /payments? to review/ })).not.toBeInTheDocument()

    fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await act(async () => void (await vi.advanceTimersByTimeAsync(EXIT_MS.sheet + 10)))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('lets the sheet play its exit when it is closed with payments still waiting', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    setMotionDisabledForTests(false)
    slot(makeCore({ items: [rec(1), rec(2), rec(3), rec(4), rec(5)] }))
    await act(async () => void (await vi.advanceTimersByTimeAsync(0)))
    fireEvent.click(await screen.findByRole('button', { name: 'See all 5' }))

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await act(async () => void (await vi.advanceTimersByTimeAsync(EXIT_MS.sheet + 10)))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '5 payments to review' })).toBeInTheDocument()
  })
})

describe('the payment a notification was tapped for', () => {
  afterEach(() => window.history.replaceState(null, '', '/'))

  it('opens that payment’s form once the list has landed, and takes the id off the URL', () => {
    window.history.replaceState(null, '', '/?ledger=off&review=' + id(2))
    const core = makeCore({ items: [rec(1), rec(2)] })
    show(core)

    expect(core.openForm).toHaveBeenCalledTimes(1)
    expect(window.location.search).toBe('?ledger=off')
  })

  it('opens nothing for a payment no longer waiting, or where the app cannot write, and still clears the URL', () => {
    window.history.replaceState(null, '', '/?review=' + id(9))
    const gone = makeCore({ items: [rec(1)] })
    show(gone)
    expect(gone.openForm).not.toHaveBeenCalled()
    expect(window.location.search).toBe('')

    window.history.replaceState(null, '', '/?review=' + id(1))
    const readOnly = makeCore({ items: [rec(1)], canWrite: false })
    show(readOnly)
    expect(readOnly.openForm).not.toHaveBeenCalled()
    expect(window.location.search).toBe('')
  })

  it('waits for the list to land before deciding', () => {
    window.history.replaceState(null, '', '/?review=' + id(1))
    const core = makeCore({ items: [rec(1)], loads: 0 })
    show(core)
    expect(core.openForm).not.toHaveBeenCalled()
    expect(window.location.search).toBe('?review=' + id(1))
  })
})

describe('a payment that looks like a monthly series', () => {
  const seriesModel = makeSeriesModel()
  const push = (over: Partial<RecommendationInfo> = {}) =>
    rec(1, { merchantRaw: 'PAYPROC*XY 77', amountCents: 1299, localDate: '2026-11-11', ...over })
  const hintText = () => screen.getByText(/Looks like/).textContent
  const showPush = (
    over: Partial<RecommendationInfo> = {},
    core: Partial<ReviewCore> = {},
  ) => {
    const c = makeCore({ model: seriesModel, items: [push(over)], ...core })
    show(c)
    return c
  }

  it('says which series and when it is due, fills the row from it and offers no one-tap Add', () => {
    showPush()

    expect(hintText()).toBe('Looks like your monthly Video Stream, due 10\u00a0Nov.')
    const row = screen.getByRole('listitem')
    expect(within(row).getAllByText('Video Stream')).toHaveLength(2)
    expect(within(row).getByText('Groceries')).toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: /^Add / })).not.toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Review' })).toBeInTheDocument()
    expect(within(row).queryByText('New merchant')).not.toBeInTheDocument()
  })

  it('names the series’ account when the push named none, so a wrong one shows before adding', () => {
    showPush({ accountId: null, card: { source: 'bank', digits: '0000' } })

    expect(hintText()).toBe('Looks like your monthly Video Stream, due 10\u00a0Nov, paid from Main Debit.')
  })

  it('asks whether a series paid from another account moved', () => {
    showPush({ accountId: 2 })

    expect(hintText()).toBe('Looks like Video Stream, which you pay from Main Debit. Moved it?')
    expect(within(screen.getByRole('listitem')).getByText('Travel Credit')).toBeInTheDocument()
  })

  it('asks about a rename and shows the series’ current name', () => {
    showPush({
      suggestion: {
        description: 'Old Stream',
        categoryId: 1,
        type: 'expense',
        accountId: 1,
        amountCents: 1299,
        sightings: 3,
        settled: true,
        reasons: [],
      },
    })

    expect(hintText()).toBe(
      'Looks like your monthly Video Stream, due 10\u00a0Nov. You added it as Old Stream before. Renamed?',
    )
  })

  it('offers two series to pick from, and opens review filled from the one picked', () => {
    const core = showPush({ amountCents: 999, localDate: '2026-11-14' })

    expect(hintText()).toBe('Looks like one of your monthly payments. Which one?')
    fireEvent.click(screen.getByRole('button', { name: 'Review as Cloud Box, due 15\u00a0Nov' }))

    expect(core.openForm).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Cloud Box', categoryId: 2, type: 'expense', accountId: 1 }),
    )
    expect(screen.getByRole('button', { name: 'Review as Music Plan, due 14\u00a0Nov' })).toBeInTheDocument()
  })

  it('opens a payment two series fit with both offered, when "Add and next" reaches it', () => {
    const plain = rec(2, { merchantRaw: 'BRAND NEW PLACE', amountCents: 450, localDate: '2026-11-13' })
    const core = makeCore({ model: seriesModel, items: [plain, push({ amountCents: 999, localDate: '2026-11-14' })] })
    show(core)

    fireEvent.click(within(screen.getAllByRole('listitem')[0]!).getByRole('button', { name: 'Review' }))
    const first = vi.mocked(core.openForm).mock.calls[0]![0]
    expect(first.seriesChoice).toBeUndefined()
    const next = first.queue!.next()!

    expect(next.recommendationId).toBe(id(1))
    expect(next.seriesChoice?.map((o) => o.label)).toEqual([
      'Music Plan, due 14\u00a0Nov',
      'Cloud Box, due 15\u00a0Nov',
    ])
    next.seriesChoice![1]!.pick()
    const picked = vi.mocked(core.openForm).mock.calls[1]![0]
    expect(picked).toMatchObject({ recommendationId: id(1), description: 'Cloud Box', categoryId: 2 })
    expect(picked.fromSeries).toBe(next.seriesChoice![1]!.seriesKey)
    expect(picked.seriesChoice).toBeUndefined()
  })

  it('offers the two series in the form opened from Review too', () => {
    const core = showPush({ amountCents: 999, localDate: '2026-11-14' })

    fireEvent.click(screen.getByRole('button', { name: 'Review' }))

    const seed = vi.mocked(core.openForm).mock.calls[0]![0]
    expect(seed.seriesChoice).toHaveLength(2)
    expect(seed.fromSeries).toBeUndefined()
  })

  it('closes the sheet before opening the form for a series picked there, as Review does', () => {
    const core = makeCore({ model: seriesModel, items: [push({ amountCents: 999, localDate: '2026-11-14' })] })
    const onSheet = vi.fn()
    render(
      <MoneyFormatProvider currencyCode="EUR" numberLocale="de-DE">
        <ReviewCard core={core} sheet={true} onSheet={onSheet} />
      </MoneyFormatProvider>,
    )

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^Review as Cloud Box/ }))

    expect(onSheet).toHaveBeenCalledWith(false)
    expect(core.openForm).toHaveBeenCalledWith(expect.objectContaining({ description: 'Cloud Box' }))
  })

  it('names the two series without buttons where the app cannot write', () => {
    showPush({ amountCents: 999, localDate: '2026-11-14' }, { canWrite: false, submit: undefined })

    expect(screen.getByText(/^Music Plan, due 14.Nov$/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('asks the model for the whole history while the card is shown', () => {
    const gone = vi.fn()
    const watchHistory = vi.fn(() => gone)
    const { unmount } = render(wrap(makeCore({ model: { ...seriesModel, watchHistory } })))

    expect(watchHistory).toHaveBeenCalledTimes(1)
    unmount()
    expect(gone).toHaveBeenCalledTimes(1)
  })

  it('shows no hint for a payment no series fits', () => {
    showPush({ amountCents: 1300 })

    expect(screen.queryByText(/Looks like/)).not.toBeInTheDocument()
  })
})
