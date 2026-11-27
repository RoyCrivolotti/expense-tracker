import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RecommendationInfo } from '../../data/recommendationsApi'
import { makeTransaction } from '../../testing/factories'
import { makeRecommendation, makeReviewModel, makeSeriesModel, pushAt } from '../../testing/reviewKit'
import { EXIT_MS, setMotionDisabledForTests } from '../hooks/motion'
import { MoneyFormatProvider } from '../hooks/MoneyFormatProvider'
import ReviewCard from './ReviewCard'
import styles from './ReviewList.module.css'
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

const ROW = 'Review Cafe Example, −12,50 €, Today'
const newPlace = (
  n: number,
  over: Partial<RecommendationInfo> = {},
) => rec(n, { merchantRaw: 'BRAND NEW PLACE', ...over })
const MOVEMENT = 'Example Bank alert: 43,80 EUR today'
const names = (el: HTMLElement) =>
  within(el)
    .getAllByRole('button')
    .map((b) => b.getAttribute('aria-label') ?? b.textContent)

describe('a row', () => {
  it('is the amount with its day, the name with one note, and one button', () => {
    show(makeCore())

    const row = screen.getByRole('listitem')
    expect(row).toHaveTextContent('−12,50 € money outTodayCafe ExampleEating outAdd')
    expect(names(row)).toEqual([ROW, 'Add Cafe Example, −12,50 €'])
    expect(within(row).getByText('Add')).toHaveClass(styles.add!)
  })

  it("has no Don't add, Link or Change, on the card or in the sheet", () => {
    const match = { transactionId: 7, description: 'Lunch', date: '2026-11-10' }
    show(makeCore({ items: [rec(1), rec(2, { possibleMatch: match }), rec(3), rec(4), rec(5)] }))
    fireEvent.click(screen.getByRole('button', { name: 'See all 5' }))

    for (const label of [/don't add/i, /link/i, /change/i])
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument()
  })

  it('holds an Add as a decision that sends the payment through its recommendation', async () => {
    const core = makeCore()
    show(core)

    fireEvent.click(screen.getByRole('button', { name: 'Add Cafe Example, −12,50 €' }))

    const [recId, message, failure, send] = vi.mocked(core.decide).mock.calls[0]!
    expect([recId, failure]).toEqual([id(1), 'add Cafe Example'])
    expect(message.split('\n')).toEqual([
      'Added · Cafe Example −12,50 €',
      'Expense · Eating out · Main Debit · Tue 10 Nov · Nov budget',
    ])
    await send()
    expect(core.submit).toHaveBeenCalledWith(
      id(1),
      expect.objectContaining({ amountCents: 1250, categoryId: 1, accountId: 1, budgetMonth: '2026-11' }),
    )
    expect(core.openForm).not.toHaveBeenCalled()
  })

  it('opens the review view when a ready row is tapped anywhere but its button', () => {
    const core = makeCore()
    show(core)

    fireEvent.click(screen.getByRole('button', { name: ROW }))

    const seed = vi.mocked(core.openForm).mock.calls[0]![0]
    expect(seed).toMatchObject({
      recommendationId: id(1),
      amountCents: 1250,
      categoryId: 1,
      description: 'Cafe Example',
    })
    expect(seed.queue?.spot()).toEqual({ at: 1, of: 1 })
    expect(core.decide).not.toHaveBeenCalled()
  })

  it('has Review for a payment in doubt, which does what tapping the row does and is announced once', () => {
    const core = makeCore({ items: [newPlace(1)] })
    show(core)
    const row = screen.getByRole('listitem')

    expect(names(row)).toEqual(['Review BRAND NEW PLACE, −12,50 €, Today'])
    const pill = within(row).getByText('Review')
    expect(pill).toHaveClass(styles.review!)
    expect(pill.closest('button')).toHaveAttribute('aria-hidden', 'true')
    expect(pill.closest('button')).toHaveAttribute('tabindex', '-1')
    fireEvent.click(pill)
    // A press on the pill is the row's press: the focus is on the row's button, where it returns when the form closes.
    expect(within(row).getByRole('button')).toHaveFocus()
    fireEvent.click(within(row).getByRole('button'))

    expect(vi.mocked(core.openForm).mock.calls.map(([seed]) => seed.recommendationId)).toEqual([id(1), id(1)])
  })

  it('never opens: nothing on it says it can be expanded', () => {
    show(makeCore({ items: [rec(1), newPlace(2)] }))

    for (const row of screen.getAllByRole('listitem'))
      for (const button of within(row).getAllByRole('button', { hidden: true }))
        expect(button).not.toHaveAttribute('aria-expanded')
  })

  it('draws a note the person must decide in amber, a possible duplicate as a chip, and what it is plainly', () => {
    const match = { transactionId: 7, description: 'Lunch', date: '2026-11-10' }
    show(makeCore({ items: [rec(1), newPlace(2), rec(3, { possibleMatch: match }), rec(4, { currency: 'USD' })] }))

    expect(screen.getByText('Eating out').tagName).toBe('P')
    expect(screen.getByText('No category')).toHaveClass(styles.need!)
    expect(screen.getByText('Possible duplicate')).toHaveClass(styles.chip!)
    expect(screen.getByText('Not in euros')).toHaveClass(styles.need!)
    expect(screen.getByText(/US\$12\.50/)).toBeInTheDocument()
    // The note is not in the button's name, so it is tied to it: a screen reader says it after the name.
    const [ready, , duplicate, foreign] = screen.getAllByRole('listitem')
    expect(within(duplicate!).getByRole('button')).toHaveAccessibleDescription('Possible duplicate')
    expect(within(foreign!).getByRole('button')).toHaveAccessibleDescription('Not in euros')
    expect(within(ready!).getByRole('button', { name: ROW })).toHaveAccessibleDescription('Eating out')
  })

  it('draws money in green with a plus, money out plainly with a minus, and no sign where the way is not known', () => {
    show(makeCore({ items: [rec(1, { suggestedType: 'income' }), rec(2), rec(3, { suggestedType: null })] }))
    const [income, expense, unknown] = screen.getAllByRole('listitem')

    expect(within(income!).getByText(/^\+12,50 €/)).toHaveClass(styles.in!)
    expect(within(income!).getByText('money in', { exact: false, selector: 'span span' })).toBeInTheDocument()
    expect(within(expense!).getByText(/^−12,50 €/)).not.toHaveClass(styles.in!)
    expect(within(unknown!).getByText('12,50 €')).not.toHaveClass(styles.in!)
    expect(within(unknown!).queryByText(/money (in|out)/)).not.toBeInTheDocument()
  })

  it('says "Unnamed" in grey for a whole message, with the time as its one clue, and never the sentence', () => {
    show(makeCore({ items: [rec(1, { merchantRaw: MOVEMENT, amountCents: 4380 })] }))
    const row = screen.getByRole('listitem')

    expect(within(row).getByText('Unnamed').closest(`.${styles.title}`)).toHaveClass(styles.unnamed!)
    expect(within(row).getByText('No merchant, 09:41')).toBeInTheDocument()
    expect(row).not.toHaveTextContent(/alert/)
    expect(names(row)).toEqual(['Review Unnamed payment, −43,80 €, Today'])
  })

  it('says "No amount" where the bank gave none', () => {
    show(makeCore({ items: [rec(1, { amountCents: null })] }))

    expect(screen.getByText('No amount')).toHaveClass(styles.noAmount!)
    expect(screen.getByText('Amount missing')).toHaveClass(styles.need!)
    expect(names(screen.getByRole('listitem'))).toEqual(['Review Cafe Example, no amount, Today'])
  })

  it('says in red that a send failed, with the reason for a screen reader, and keeps its button to try again', () => {
    show(makeCore({ failures: new Map([[id(1), 'Request failed (500)']]) }))

    const alert = screen.getByRole('alert')
    expect(alert).toHaveClass(styles.bad!)
    expect(alert).toHaveTextContent('Not sent. Try again: Request failed (500)')
    expect(screen.getByRole('button', { name: 'Add Cafe Example, −12,50 €' })).toBeInTheDocument()
  })

  it('carries the bank’s message and why it needs a look into the review view', () => {
    const core = makeCore({
      items: [rec(1, { merchantRaw: MOVEMENT, message: `${MOVEMENT}. Thank you for banking with us` })],
    })
    show(core)

    fireEvent.click(screen.getByRole('button', { name: /^Review Unnamed payment/ }))

    const seed = vi.mocked(core.openForm).mock.calls[0]![0]
    expect(seed).not.toHaveProperty('description')
    expect(seed.intro).toEqual({
      arrived: 'Tue 10 Nov, 09:41',
      amount: '−12,50 €',
      message: `${MOVEMENT}. Thank you for banking with us`,
      reasons: ["the bank's message names no merchant", 'it has no category yet'],
      notes: [],
    })
  })

  it('carries the entry a payment may duplicate into the review view, in full, and drops the repeated reason', () => {
    const match = {
      transactionId: 7,
      description: 'Lunch',
      date: '2026-11-10',
      amountCents: 1250,
      type: 'expense',
      accountId: 2,
    }
    const core = makeCore({ items: [rec(1, { possibleMatch: match })] })
    show(core)

    fireEvent.click(screen.getByRole('button', { name: ROW }))

    const seed = vi.mocked(core.openForm).mock.calls[0]![0]
    expect(seed.possibleMatch).toEqual(match)
    expect(seed.intro).toMatchObject({ reasons: [] })
  })
})

describe('the card’s one line', () => {
  const heading = () => screen.getByRole('heading')
  const strip = () => within(heading()).getByRole('button')

  it('counts the payments, the same way for one', () => {
    const { unmount } = show(makeCore({ items: [rec(1)] }))
    expect(heading()).toHaveTextContent(/^1 to review/)
    unmount()

    show(makeCore({ items: [rec(1), rec(2)] }))
    expect(heading()).toHaveTextContent(/^2 to review/)
  })

  it('shows what is waiting, money in on a green chip and money out on a red one, in whole euros', () => {
    show(
      makeCore({
        items: [
          rec(1, { amountCents: 340 }),
          rec(2, { amountCents: 17024 }),
          rec(3, { amountCents: 185000, suggestedType: 'income' }),
        ],
      }),
    )

    expect(screen.getByText('+1.850 €')).toHaveClass(styles.total!, styles.in!)
    expect(screen.getByText('−174 €')).toHaveClass(styles.total!, styles.out!)
    expect(heading()).toHaveAccessibleName('3 to review +1.850 € coming in −174 € going out')
  })

  it('has no chip for a side where nothing moves', () => {
    const { unmount } = show(makeCore({ items: [rec(1), rec(2)] }))
    expect(heading()).toHaveAccessibleName('2 to review −25 € going out')
    unmount()

    show(makeCore({ items: [rec(1, { suggestedType: 'refund' })] }))
    expect(heading()).toHaveAccessibleName('1 to review +13 € coming in')
  })

  it('leaves out what cannot be added up: not in euros, no amount, a way not known', () => {
    show(
      makeCore({
        items: [
          rec(1, { amountCents: 500 }),
          rec(2, { amountCents: 99900, currency: 'USD' }),
          rec(3, { amountCents: null }),
          rec(4, { amountCents: 30000, suggestedType: null }),
        ],
      }),
    )

    expect(heading()).toHaveAccessibleName('4 to review −5 € going out')
  })

  it('counts a bill that waits twice once, and one the bank only announced like any other', () => {
    const bill = { amountCents: 6215, localDate: '2026-11-10', merchantRaw: 'EXAMPLE UTILITY' }
    const notice = rec(1, { ...bill, occurredAt: pushAt(2026, 11, 6, 10, 2) })
    const charge = rec(2, { ...bill, occurredAt: pushAt(2026, 11, 10, 8, 10) })
    const { unmount } = show(makeCore({ items: [charge, notice, rec(3, { amountCents: 340 })] }))
    expect(heading()).toHaveAccessibleName('3 to review −66 € going out')
    unmount()

    show(makeCore({ items: [notice, rec(3, { amountCents: 340 })] }))
    expect(heading()).toHaveAccessibleName('2 to review −66 € going out')
  })

  it('shows no totals while more payments wait than are loaded, when a sum would be short', () => {
    show(makeCore({ hasMore: true, count: 60 }))

    expect(heading()).toHaveAccessibleName('60 to review')
  })

  it('is one line until it is opened, and opens and folds from that line', () => {
    localStorage.clear()
    show(makeCore())
    const body = document.getElementById(strip().getAttribute('aria-controls')!)!

    expect(strip()).toHaveAttribute('aria-expanded', 'false')
    expect(body).toHaveAttribute('inert')
    fireEvent.click(strip())
    expect(strip()).toHaveAttribute('aria-expanded', 'true')
    expect(body).not.toHaveAttribute('inert')
    expect(within(body).getByRole('listitem')).toBeInTheDocument()
    fireEvent.click(strip())
    expect(strip()).toHaveAttribute('aria-expanded', 'false')
    expect(body).toHaveAttribute('inert')
  })

  it('comes back the way it was left after a reload, on this device', () => {
    localStorage.clear()
    const first = show(makeCore())
    fireEvent.click(strip())
    first.unmount()

    const second = show(makeCore())
    expect(strip()).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(strip())
    second.unmount()

    show(makeCore())
    expect(strip()).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('a bill that waits twice', () => {
  const bill = { amountCents: 6215, localDate: '2026-11-10', merchantRaw: 'EXAMPLE UTILITY' }
  const notice = rec(1, {
    ...bill,
    merchantRaw: 'Heads up: 62,15 EUR is due',
    occurredAt: pushAt(2026, 11, 6, 10, 2),
  })
  const charge = rec(2, { ...bill, occurredAt: pushAt(2026, 11, 10, 8, 10) })

  it.each([
    ['the announcement listed first', [notice, charge]],
    ['the charge listed first', [charge, notice]],
  ])('ties the two with the heading and Dismiss duplicate beside it, with %s', (_name, items) => {
    show(makeCore({ items }))
    const [top, bottom] = screen.getAllByRole('listitem')

    expect(top).toHaveClass(styles.tieTop!)
    expect(bottom).toHaveClass(styles.tieBottom!)
    expect(top).toHaveTextContent('Is this a duplicate?Dismiss duplicate−62,15 €')
    expect(screen.queryByText(/If it's duplicated/)).not.toBeInTheDocument()
    expect(within(top!).getByText('EXAMPLE UTILITY')).toBeInTheDocument()
    expect(within(bottom!).getByText('Unnamed')).toBeInTheDocument()
    expect(within(bottom!).getByText('Notice, 6 Nov')).toBeInTheDocument()
    expect(screen.getAllByText('Is this a duplicate?')).toHaveLength(1)
  })

  it('keeps Review on both rows', () => {
    show(makeCore({ items: [charge, notice] }))

    for (const row of screen.getAllByRole('listitem')) {
      expect(within(row).getByText('Review')).toHaveClass(styles.review!)
      expect(within(row).queryByText('Add')).not.toBeInTheDocument()
    }
  })

  it('removes only the announcement on Dismiss duplicate, as a decision that can be undone', () => {
    const core = makeCore({ items: [charge, notice, rec(3)] })
    show(core)

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss duplicate: the notice, −62,15 €' }))

    expect(core.decide).toHaveBeenCalledOnce()
    const [recId, message, failure] = vi.mocked(core.decide).mock.calls[0]!
    expect(recId).toBe(id(1))
    expect(message).toContain('Not added · Unnamed payment')
    expect(failure).toBe('remove Unnamed payment')
    expect(core.submit).not.toHaveBeenCalled()
  })

  it('tells the review view of each about the other', () => {
    const core = makeCore({ items: [charge, notice] })
    show(core)

    fireEvent.click(screen.getByRole('button', { name: /^Review EXAMPLE UTILITY/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Review Unnamed payment/ }))

    const [first, second] = vi.mocked(core.openForm).mock.calls.map(([seed]) => seed.intro!)
    expect(first!.pair).toMatch(
      /^Might be the same bill as the one the bank announced on Fri 6 Nov \(−62,15 €, also waiting\)/,
    )
    expect(first!.reasons[0]).toBe('it might be the same bill as another one waiting')
    expect(second!.pair).toMatch(/^Might be the same bill as EXAMPLE UTILITY, −62,15 €, charged Tue 10 Nov/)
  })

  it('only warns where the app cannot write: the heading, what to do, and no button', () => {
    show(makeCore({ items: [charge, notice], canWrite: false, submit: undefined }))

    expect(screen.getByText('Is this a duplicate?').parentElement).toHaveTextContent(
      "Is this a duplicate?If it's duplicated, add only one.",
    )
    expect(within(screen.getByRole('list')).queryByRole('button')).not.toBeInTheDocument()
  })

  it('draws no tie on the card when its limit shows only one of the two, and draws it in the sheet', () => {
    show(makeCore({ items: [rec(3), rec(4), charge, notice, rec(5)] }))
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.queryByText('Is this a duplicate?')).not.toBeInTheDocument()
    // The half that is shown is an ordinary row: no amber line down its side with nothing to tie it to.
    for (const row of screen.getAllByRole('listitem')) {
      expect(row).not.toHaveClass(styles.tieTop!)
      expect(row).not.toHaveClass(styles.tieBottom!)
    }

    fireEvent.click(screen.getByRole('button', { name: 'See all 5' }))

    expect(within(screen.getByRole('dialog')).getByText('Is this a duplicate?')).toBeInTheDocument()
  })

  it('keeps the announcement under its charge in the sheet when the charge came days after the day named', () => {
    const early = rec(1, { ...bill, localDate: '2026-11-08', occurredAt: pushAt(2026, 11, 6, 10, 2) })
    show(
      makeCore({
        items: [charge, rec(3, { localDate: '2026-11-09', occurredAt: pushAt(2026, 11, 9) }), early, rec(4), rec(5)],
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'See all 5' }))
    const sheet = screen.getByRole('dialog')

    // One run of rows under the charge's day holds both, so the tie is drawn and the notice gets no day of its own.
    const tied = within(sheet).getByText('Is this a duplicate?').closest('ul')!
    expect(within(tied).getByText('Notice, 6 Nov')).toBeInTheDocument()
    expect(within(sheet).queryByRole('heading', { name: 'Sun 8 Nov' })).not.toBeInTheDocument()
  })

  it('ties nothing when the two are not one bill: another amount, or a charge before the day named', () => {
    const { unmount } = show(makeCore({ items: [rec(2, { ...charge, amountCents: 6216 }), notice] }))
    expect(screen.queryByText('Is this a duplicate?')).not.toBeInTheDocument()
    unmount()

    show(
      makeCore({
        items: [rec(2, { ...bill, localDate: '2026-11-09', occurredAt: pushAt(2026, 11, 9, 8, 10) }), notice],
      }),
    )
    expect(screen.queryByText('Is this a duplicate?')).not.toBeInTheDocument()
  })
})

describe('the card', () => {
  it('shows three payments and opens the rest in a sheet, where tapping a row opens the form and keeps the sheet', () => {
    const core = makeCore({ items: [rec(1), rec(2), rec(3), rec(4), newPlace(5)] })
    show(core)
    expect(screen.getAllByRole('listitem')).toHaveLength(3)

    fireEvent.click(screen.getByRole('button', { name: 'See all 5' }))
    const sheet = screen.getByRole('dialog')
    expect(within(sheet).getAllByRole('listitem')).toHaveLength(5)
    fireEvent.click(within(sheet).getByRole('button', { name: /^Review BRAND NEW PLACE/ }))

    // The form opens on top of it, so closing the form comes back here.
    expect(screen.getByRole('dialog')).toBe(sheet)
    expect(vi.mocked(core.openForm).mock.calls[0]![0]).toMatchObject({ recommendationId: id(5) })
  })

  it.each([
    ['a phone', true, 3],
    ['a wide screen', false, 5],
  ])(
    'shows %s the most rows, and all of them when it is exactly one more, with the full count on its line',
    (_name, phone, limit) => {
      viewport(phone)
      for (const total of [1, 3, 4, 5, 6, 7]) {
        const items = Array.from({ length: total }, (_x, i) => rec(i + 1))
        const { unmount } = show(makeCore({ items }))
        const rows = screen.queryAllByRole('listitem').length
        const expected = total === limit + 1 ? total : Math.min(total, limit)

        expect(rows, `${total} on ${limit}`).toBe(expected)
        expect(screen.queryByRole('button', { name: `See all ${total}` }) !== null, `${total} see all`).toBe(
          total > expected,
        )
        expect(screen.getByRole('heading')).toHaveTextContent(new RegExp(`^${total} to review`))
        unmount()
      }
    },
  )

  it('shows nothing at all with nothing waiting', () => {
    const { container } = show(makeCore({ items: [], count: 0 }))

    expect(container).toBeEmptyDOMElement()
  })

  it('places the payment reviewed among the others, so the form can move on to them', () => {
    const core = makeCore({ items: [newPlace(1), rec(2), rec(3)] })
    show(core)

    fireEvent.click(screen.getByRole('button', { name: /^Review BRAND NEW PLACE/ }))

    const seed = vi.mocked(core.openForm).mock.calls[0]![0]
    expect(seed.queue!.spot()).toEqual({ at: 1, of: 3 })
    expect(seed.queue!.next()).toMatchObject({ recommendationId: id(2), intro: { arrived: 'Tue 10 Nov, 09:41' } })
  })

  it('offers See all when more are not loaded yet, and Show more in the sheet', () => {
    const core = makeCore({ hasMore: true, count: 9 })
    show(core)

    fireEvent.click(screen.getByRole('button', { name: 'See all 9' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Show more' }))

    expect(core.more).toHaveBeenCalledOnce()
  })

  it('shows a failed read with a way to try again', () => {
    const core = makeCore({ error: 'Request failed (500)' })
    show(core)

    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Try again' }))

    expect(core.retry).toHaveBeenCalledOnce()
  })

  it('shows the rows with no buttons where the app cannot write, and says it is a saved copy', () => {
    show(makeCore({ canWrite: false, submit: undefined }))

    expect(screen.getByText('Cafe Example')).toBeInTheDocument()
    expect(screen.getByText('Saved copy. You can add these when you are back online.')).toBeInTheDocument()
    expect(within(screen.getByRole('list')).queryByRole('button')).not.toBeInTheDocument()
  })

  it('ignores a one tap where the app cannot write', () => {
    const core = makeCore({ submit: undefined })
    show(core)

    fireEvent.click(screen.getByRole('button', { name: 'Add Cafe Example, −12,50 €' }))

    expect(core.decide).not.toHaveBeenCalled()
  })
})

describe('the sheet', () => {
  const open = (core: ReviewCore) => {
    show(core)
    fireEvent.click(screen.getByRole('button', { name: /^See all/ }))
    return screen.getByRole('dialog')
  }
  const days = [
    rec(1),
    rec(2, { occurredAt: pushAt(2026, 11, 10, 3, 50), merchantRaw: MOVEMENT }),
    rec(3, { localDate: '2026-11-09', occurredAt: pushAt(2026, 11, 9, 7, 2) }),
    rec(4, { localDate: '2026-11-07', occurredAt: pushAt(2026, 11, 7, 8, 10) }),
    rec(5, { localDate: '2026-10-31', occurredAt: pushAt(2026, 10, 31, 12) }),
  ]

  it('groups the payments by day, today and yesterday by name', () => {
    const sheet = open(makeCore({ items: days }))

    expect(within(sheet).getByRole('heading', { name: 'To review (5)' })).toBeInTheDocument()
    expect(
      within(sheet)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(['Today · Tue 10 Nov', 'Yesterday · Mon 9 Nov', 'Sat 7 Nov', 'Sat 31 Oct'])
  })

  it('shows the time under the amount, since the heading gives the day, and does not repeat it in the note', () => {
    const sheet = open(makeCore({ items: days }))
    const rows = within(sheet).getAllByRole('listitem')

    expect(rows[0]).toHaveTextContent('−12,50 € money out09:41Cafe Example')
    expect(rows[1]).toHaveTextContent('03:50UnnamedNo merchant named')
    expect(names(rows[0]!)).toEqual(['Review Cafe Example, −12,50 €, 09:41', 'Add Cafe Example, −12,50 €'])
  })

  it('says what the list is and how to reach the rest, under the rows', () => {
    const sheet = open(makeCore({ items: days }))

    expect(
      within(sheet).getByText(/^From your bank's notifications\. Nothing is added until you add it\./),
    ).toHaveTextContent("Tap a payment to see the bank's message, change it, or choose “Don't add”.")
  })

  it('says it is a saved copy where the app cannot write', () => {
    const sheet = open(makeCore({ items: days, canWrite: false, submit: undefined }))

    expect(within(sheet).getAllByText('Saved copy. You can add these when you are back online.')).toHaveLength(1)
    expect(within(sheet).queryByText(/Tap a payment/)).not.toBeInTheDocument()
  })

  it('says all caught up once nothing is left', () => {
    const core = makeCore({ items: [rec(1), rec(2), rec(3), rec(4), rec(5)] })
    const { rerender } = show(core)
    fireEvent.click(screen.getByRole('button', { name: 'See all 5' }))

    rerender(wrap({ ...core, items: [], count: 0 }))

    expect(within(screen.getByRole('dialog')).getByText('All caught up').parentElement).toHaveTextContent(
      'All caught upNothing is waiting for a look.',
    )
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

/** A Tuesday morning, so a payment of 10 Nov reads "Today" whenever the suite runs. */
const NOW = new Date(2026, 10, 10, 12)

beforeEach(() => {
  viewport(true)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  localStorage.setItem('exp-review-card', 'open')
})

afterEach(() => {
  vi.useRealTimers()
  setMotionDisabledForTests(true)
  localStorage.clear()
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

    expect(await screen.findByRole('heading', { name: '1 to review −13 € going out' })).toBeInTheDocument()
  })

  it('keeps the sheet when its last payment is decided there, says all caught up, and lets it leave before the card goes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW })
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
    expect(within(sheet).getByText('All caught up')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /to review/ })).not.toBeInTheDocument()

    fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await act(async () => void (await vi.advanceTimersByTimeAsync(EXIT_MS.sheet + 10)))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('lets the sheet play its exit when it is closed with payments still waiting', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW })
    setMotionDisabledForTests(false)
    slot(makeCore({ items: [rec(1), rec(2), rec(3), rec(4), rec(5)] }))
    await act(async () => void (await vi.advanceTimersByTimeAsync(0)))
    fireEvent.click(await screen.findByRole('button', { name: 'See all 5' }))

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await act(async () => void (await vi.advanceTimersByTimeAsync(EXIT_MS.sheet + 10)))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^5 to review/ })).toBeInTheDocument()
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
    rec(1, {
      merchantRaw: 'PAYPROC*XY 77',
      amountCents: 1299,
      localDate: '2026-11-11',
      occurredAt: pushAt(2026, 11, 11, 7, 2),
      ...over,
    })
  const twoFit = { amountCents: 999, localDate: '2026-11-14', occurredAt: pushAt(2026, 11, 14, 7, 30) }
  const showPush = (
    over: Partial<RecommendationInfo> = {},
    core: Partial<ReviewCore> = {},
  ) => {
    const c = makeCore({ model: seriesModel, items: [push(over)], ...core })
    show(c)
    return c
  }

  it('is named by the series, says when it is due, and offers Review, never a one-tap Add', () => {
    showPush()
    const row = screen.getByRole('listitem')

    expect(within(row).getByText('Video Stream')).toBeInTheDocument()
    expect(within(row).getByText('Monthly, due 10 Nov').tagName).toBe('P')
    expect(within(row).queryByText('Add')).not.toBeInTheDocument()
    expect(within(row).getByText('Review')).toBeInTheDocument()
  })

  it('asks which monthly bill when two fit, and leaves the choice to the review view', () => {
    const core = showPush(twoFit)

    expect(screen.getByText('Which monthly bill?')).toHaveClass(styles.need!)
    expect(screen.queryByRole('button', { name: /Cloud Box|Music Plan/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Review PAYPROC\*XY/ }))

    const seed = vi.mocked(core.openForm).mock.calls[0]![0]
    expect(seed.seriesChoice?.map((o) => o.label)).toEqual(['Music Plan, due 14 Nov', 'Cloud Box, due 15 Nov'])
    expect(seed.fromSeries).toBeUndefined()
    expect(seed.intro?.reasons).toContain('it could be either of two monthly payments')
  })

  it('opens a payment two series fit with both offered, when "Add and next" reaches it', () => {
    const plain = newPlace(2, { amountCents: 450, localDate: '2026-11-13', occurredAt: pushAt(2026, 11, 13) })
    const core = makeCore({ model: seriesModel, items: [plain, push(twoFit)] })
    show(core)

    fireEvent.click(screen.getByRole('button', { name: /^Review BRAND NEW PLACE/ }))
    const first = vi.mocked(core.openForm).mock.calls[0]![0]
    expect(first.seriesChoice).toBeUndefined()
    const next = first.queue!.next()!

    expect(next.recommendationId).toBe(id(1))
    next.seriesChoice![1]!.pick()
    const picked = vi.mocked(core.openForm).mock.calls[1]![0]
    expect(picked).toMatchObject({ recommendationId: id(1), description: 'Cloud Box', categoryId: 2 })
    expect(picked.fromSeries).toBe(next.seriesChoice![1]!.seriesKey)
    expect(picked.seriesChoice).toBeUndefined()
  })

  it('asks the model for the whole history while the card is shown', () => {
    const gone = vi.fn()
    const watchHistory = vi.fn(() => gone)
    const { unmount } = render(wrap(makeCore({ model: { ...seriesModel, watchHistory } })))

    expect(watchHistory).toHaveBeenCalledTimes(1)
    unmount()
    expect(gone).toHaveBeenCalledTimes(1)
  })

  it('says nothing about monthly payments for a payment no series fits', () => {
    showPush({ amountCents: 1300 })

    expect(screen.queryByText(/Monthly|monthly/)).not.toBeInTheDocument()
  })
})
