import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as decisionsApi from '../../data/recommendationDecisionsApi'
import { buildMerchantIndex } from '../../domain/capture/review'
import { makeDataset, makeFlag, makeLabel, makeTransaction } from '../../testing/factories'
import { makeActions } from '../../testing/makeActions'
import { makeRecommendation, makeReviewModel } from '../../testing/reviewKit'
import type { SeriesFit, SeriesHint } from '../../domain/capture/seriesMatch'
import type { ExpenseActions, TransactionSeed } from '../actions'
import { buildExpenseModel } from '../buildExpenseModel'
import { describeRecommendation } from '../capture/reviewFields'
import { queuedSeed, WaitingList, type QueueSteps } from '../capture/reviewQueue'
import { EXIT_MS, setMotionDisabledForTests } from '../hooks/motion'
import { MoneyFormatProvider } from '../hooks/MoneyFormatProvider'
import { TransactionModal } from './TransactionModal'
import pagerStyles from './QueuePager.module.css'

// The card question is a lazy chunk; nothing here has a card to ask about.
vi.mock('../capture/CardQuestion', () => ({ default: () => null }))
vi.mock('../../data/recommendationDecisionsApi', () => ({
  dismissRecommendation: vi.fn(),
  linkRecommendation: vi.fn(),
}))

const base = makeReviewModel().dataset
const model = buildExpenseModel(
  makeDataset({
    ...base,
    flags: [makeFlag({ id: 1, name: 'Work travel' }), makeFlag({ id: 2, name: 'Tax deductible', sortOrder: 1 })],
    labels: [makeLabel({ id: 1, name: 'Japan trip' }), makeLabel({ id: 2, name: 'Work trip', sortOrder: 1 })],
  }),
)
const merchants = buildMerchantIndex(model.dataset.transactions)
const ID = (n: number) => `0b0c0d0e-1111-4222-8333-${String(n).padStart(12, '0')}`
/**
 * Every payment a different amount, merchant and day, so a field from one cannot pass for another's. Filed under a
 * category, so it can be added as it came.
 */
const view = (n: number) => ({
  ...describeRecommendation(
    makeRecommendation({
      id: ID(n),
      merchantRaw: `PLACE ${n}`,
      amountCents: 1000 * n + n,
      localDate: `2026-11-${String(10 + n).padStart(2, '0')}`,
    }),
    model,
    merchants,
  ),
  categoryId: 1,
})

/** The review sheet over `count` payments, opened on payment `at`, moving between them as the app does. */
function openSheet(
  count: number,
  at: number,
  over: Partial<ExpenseActions> = {},
  shape: (
    v: ReturnType<typeof view>,
    n: number,
  ) => ReturnType<typeof view> = (v) => v,
) {
  const views = Array.from({ length: count }, (_, i) => shape(view(i + 1), i + 1))
  const list = new WaitingList()
  list.set(views)
  const steps: QueueSteps = {
    dontAdd: vi.fn(),
    rememberFor: () => () => Promise.resolve(null),
    choose: vi.fn(),
    intro: (v) => ({ arrived: v.date, amount: '', message: v.rec.merchantRaw, reasons: [], notes: [] }),
  }
  const actions = makeActions({
    submitRecommendation: vi.fn((id: string) => Promise.resolve(makeTransaction({ id: 500 + Number(id.slice(-2)) }))),
    ...over,
  })
  const onClose = vi.fn()
  function Sheet() {
    const [seed, setSeed] = useState<TransactionSeed | undefined>(() => queuedSeed(views[at - 1]!, list, steps))
    if (!seed) return null
    const wired = { ...actions, onAdd: (s?: TransactionSeed) => setSeed(s) }
    return (
      <MoneyFormatProvider currencyCode="EUR" numberLocale="de-DE">
        <TransactionModal
          model={model}
          actions={wired}
          editing={null}
          seed={seed}
          onClose={() => {
            onClose()
            setSeed(undefined)
          }}
        />
      </MoneyFormatProvider>
    )
  }
  const rendered = render(<Sheet />)
  return { ...rendered, actions, onClose, steps, list, views }
}

/** The form of the payment on screen. The others are kept, hidden. */
const shown = () => within(document.querySelector<HTMLElement>('form:not([hidden])')!)
const counter = () => screen.getByText(/\d+ of \d+/)
const previousArrow = () => screen.getByRole('button', { name: 'Previous payment' })
const nextArrow = () => screen.getByRole('button', { name: 'Next payment' })
const amount = () => shown().getByLabelText<HTMLInputElement>(/amount/i).value

beforeEach(() => setMotionDisabledForTests(true))
afterEach(() => vi.useRealTimers())

describe('the review sheet’s pager', () => {
  it('says where the payment sits, and its arrows stop at either end', () => {
    openSheet(4, 2)
    expect(counter()).toHaveTextContent('Payment 2 of 4')
    expect(amount()).toBe('20,02')

    fireEvent.click(previousArrow())
    expect(counter()).toHaveTextContent('1 of 4')
    expect(amount()).toBe('10,01')
    expect(previousArrow()).toBeDisabled()
    expect(nextArrow()).toBeEnabled()

    for (let i = 0; i < 3; i++) fireEvent.click(nextArrow())
    expect(counter()).toHaveTextContent('4 of 4')
    expect(amount()).toBe('40,04')
    expect(nextArrow()).toBeDisabled()
    expect(previousArrow()).toBeEnabled()
  })

  it('counts on the save button every other payment still waiting, so the two always agree', () => {
    openSheet(4, 3)
    expect(shown().getByRole('button', { name: 'Add and next (3 left)' })).toBeInTheDocument()
    fireEvent.click(nextArrow())
    expect(shown().getByRole('button', { name: 'Add and next (3 left)' })).toBeInTheDocument()
  })

  it('is not there with one payment waiting', () => {
    openSheet(1, 1)
    expect(screen.queryByRole('button', { name: /payment$/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/\d+ of \d+/)).not.toBeInTheDocument()
    expect(shown().getByRole('button', { name: 'Add transaction' })).toBeInTheDocument()
  })

  it('moves without deciding: nothing is added or put aside', () => {
    const { actions, steps } = openSheet(3, 1)
    fireEvent.click(nextArrow())
    fireEvent.click(nextArrow())
    fireEvent.click(previousArrow())
    expect(actions.submitRecommendation).not.toHaveBeenCalled()
    expect(steps.dontAdd).not.toHaveBeenCalled()
    expect(counter()).toHaveTextContent('2 of 3')
  })

  it('is a group of real buttons, with the count announced as it changes', () => {
    openSheet(3, 2)
    const group = screen.getByRole('group', { name: 'Payments to review' })
    expect(within(group).getAllByRole('button')).toHaveLength(2)
    expect(counter()).toHaveAttribute('aria-live', 'polite')
    expect(counter()).toHaveAttribute('aria-atomic', 'true')
  })

  it('keeps the cursor on the arrow pressed, and moves it to the other arrow at the end of the list', () => {
    openSheet(3, 2)
    nextArrow().focus()
    fireEvent.click(nextArrow())
    expect(nextArrow()).toBeDisabled()
    expect(previousArrow()).toHaveFocus()
    fireEvent.click(previousArrow())
    expect(previousArrow()).toHaveFocus()
  })

  it('does not take the arrow keys from a field being typed in', () => {
    openSheet(3, 2)
    const field = shown().getByLabelText(/amount/i)
    fireEvent.keyDown(field, { key: 'ArrowRight' })
    fireEvent.keyDown(field, { key: 'ArrowLeft' })
    expect(counter()).toHaveTextContent('2 of 3')
  })

  it('is not on the installment step, and comes back with the fields', () => {
    openSheet(3, 2)
    fireEvent.click(shown().getByRole('button', { name: /no plan/i }))
    expect(screen.queryByRole('group', { name: 'Payments to review' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(counter()).toHaveTextContent('2 of 3')
  })
})

describe('deciding a payment with the pager', () => {
  it('shows the one after it once one is added, then the one before at the end, and never a decided one', async () => {
    const { actions } = openSheet(3, 2)
    fireEvent.click(shown().getByRole('button', { name: 'Add and next (2 left)' }))
    await waitFor(() => expect(amount()).toBe('30,03'))
    expect(counter()).toHaveTextContent('2 of 2')
    expect(shown().getByRole('button', { name: 'Add and next (1 left)' })).toBeInTheDocument()

    fireEvent.click(previousArrow())
    expect(amount()).toBe('10,01')
    expect(counter()).toHaveTextContent('1 of 2')

    fireEvent.click(nextArrow())
    fireEvent.click(shown().getByRole('button', { name: 'Add and next (1 left)' }))
    await waitFor(() => expect(amount()).toBe('10,01'))
    expect(screen.queryByRole('group', { name: 'Payments to review' })).not.toBeInTheDocument()
    expect(vi.mocked(actions.submitRecommendation!).mock.calls.map((c) => c[0])).toEqual([ID(2), ID(3)])
  })

  it('moves on from Don’t add the same way, and closes after the last', () => {
    const { steps, onClose, views } = openSheet(2, 2)
    fireEvent.click(shown().getByRole('button', { name: "Don't add" }))
    expect(steps.dontAdd).toHaveBeenCalledWith(views[1])
    expect(amount()).toBe('10,01')
    fireEvent.click(shown().getByRole('button', { name: "Don't add" }))
    expect(onClose).toHaveBeenCalled()
  })

  it('counts a payment that arrives while the sheet is open, and keeps its place', () => {
    const { list, views } = openSheet(3, 2)
    act(() => list.set([view(9), ...views]))
    expect(counter()).toHaveTextContent('3 of 4')
    expect(amount()).toBe('20,02')
  })

  it('waits for a save before moving, so the sheet stays on the payment being added', async () => {
    let finish: (value: never) => void = () => {}
    const submitRecommendation = vi.fn(() => new Promise<never>((resolve) => (finish = resolve)))
    openSheet(3, 2, { submitRecommendation })
    fireEvent.click(shown().getByRole('button', { name: 'Add and next (2 left)' }))
    await waitFor(() => expect(nextArrow()).toBeDisabled())
    expect(previousArrow()).toBeDisabled()
    await act(() => {
      finish(makeTransaction({ id: 9 }) as never)
      return Promise.resolve()
    })
    await waitFor(() => expect(amount()).toBe('30,03'))
  })

  it('stays on the payment moved to when a link started on the one before lands', async () => {
    let linked: () => void = () => {}
    vi.mocked(decisionsApi.linkRecommendation).mockImplementation(
      () => new Promise<void>((resolve) => (linked = resolve)),
    )
    const possibleMatch = { transactionId: 7, description: 'Lunch', date: '2026-11-12' }
    openSheet(3, 2, {}, (v, n) => (n === 2 ? { ...v, rec: { ...v.rec, possibleMatch } } : v))
    fireEvent.click(await screen.findByRole('button', { name: 'Link instead' }))
    fireEvent.click(previousArrow())
    expect(amount()).toBe('10,01')

    await act(() => {
      linked()
      return Promise.resolve()
    })

    // Payment 2 is decided; the sheet stays where the person went rather than jumping to payment 3.
    expect(amount()).toBe('10,01')
    expect(counter()).toHaveTextContent('1 of 2')
  })

  it('does not carry an error to the next payment', async () => {
    openSheet(3, 2)
    fireEvent.change(shown().getByLabelText(/amount/i), { target: { value: '0' } })
    fireEvent.click(shown().getByRole('button', { name: 'Add and next (2 left)' }))
    expect(await shown().findByRole('alert')).toHaveTextContent('Enter an amount greater than zero')
    fireEvent.click(nextArrow())
    expect(shown().queryByRole('alert')).not.toBeInTheDocument()
  })
})

/** A monthly series a payment of 10,01 fits. */
const fit = (key: string): SeriesFit => ({
  seriesKey: key,
  description: `Series ${key}`,
  accountId: 1,
  categoryId: 1,
  type: 'expense',
  amountCents: 1001,
  usualDate: '2026-11-11',
  daysFromUsual: 0,
})

/**
 * The sheet over two payments, the first of which two series fit, so the form asks which. Picking one opens the payment
 * again filled from it, as the app does. `start` is the series the sheet was opened with, as when the card asked.
 */
function openWithSeries(start?: SeriesFit) {
  const series = [fit('s1'), fit('s2')]
  const describe = (hint?: SeriesHint) =>
    describeRecommendation(
      makeRecommendation({ id: ID(1), merchantRaw: 'PLACE 1', amountCents: 1001, localDate: '2026-11-11' }),
      model,
      merchants,
      hint,
    )
  const views = [{ ...describe({ kind: 'choose', series }), categoryId: 1 }, view(2)]
  const list = new WaitingList()
  list.set(views)
  const opener: { open: (seed: TransactionSeed) => void } = { open: () => {} }
  const steps: QueueSteps = {
    dontAdd: vi.fn(),
    rememberFor: () => () => Promise.resolve(null),
    choose: (
      _,
      picked,
    ) => opener.open(queuedSeed(describe({ kind: 'series', series: picked }), list, steps)),
    intro: (v) => ({ arrived: v.date, amount: '', message: v.rec.merchantRaw, reasons: [], notes: [] }),
  }
  const first = start ? describe({ kind: 'series', series: start }) : views[0]!
  const actions = makeActions({})
  function Sheet() {
    const [seed, setSeed] = useState<TransactionSeed | undefined>(() => queuedSeed(first, list, steps))
    useEffect(() => {
      opener.open = setSeed
    }, [])
    if (!seed) return null
    return (
      <MoneyFormatProvider currencyCode="EUR" numberLocale="de-DE">
        <TransactionModal
          model={model}
          actions={{ ...actions, onAdd: (s?: TransactionSeed) => setSeed(s) }}
          editing={null}
          seed={seed}
          onClose={vi.fn()}
        />
      </MoneyFormatProvider>
    )
  }
  render(<Sheet />)
  /** The card picking a series for the first payment while the sheet is open on it. */
  return { pick: (key: string) => act(() => steps.choose(views[0]!, fit(key))) }
}

describe('a payment two monthly series fit', () => {
  const description = () => shown().getByLabelText<HTMLInputElement>(/^description$/i)

  it('keeps the series picked in the form, and what was typed after, across a move away and back', async () => {
    openWithSeries()
    fireEvent.click(await screen.findByRole('button', { name: /Fill in as Series s1/ }))
    expect(description()).toHaveValue('Series s1')
    fireEvent.change(description(), { target: { value: 'Typed for A' } })
    fireEvent.click(nextArrow())
    expect(amount()).toBe('20,02')
    fireEvent.click(previousArrow())
    expect(description()).toHaveValue('Typed for A')
    expect(screen.queryByRole('button', { name: /Fill in as/ })).not.toBeInTheDocument()
  })

  it('keeps the series the card picked when the sheet opened, across a move away and back', () => {
    openWithSeries(fit('s2'))
    fireEvent.change(description(), { target: { value: 'Typed for A' } })
    fireEvent.click(nextArrow())
    fireEvent.click(previousArrow())
    expect(description()).toHaveValue('Typed for A')
  })

  it('asks before closing over what was typed for it after moving away', () => {
    openWithSeries(fit('s1'))
    fireEvent.change(description(), { target: { value: 'Typed for A' } })
    fireEvent.click(nextArrow())
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.getByText('Discard unsaved changes?')).toBeInTheDocument()
  })

  it('starts afresh when another series is picked for it', () => {
    const { pick } = openWithSeries(fit('s1'))
    fireEvent.change(description(), { target: { value: 'Typed for A' } })
    pick('s2')
    expect(description()).toHaveValue('Series s2')
  })
})

describe('what was typed for each payment', () => {
  /** Every field the form has, given one value for payment 1 and another for payment 2. */
  async function fill(
    values: { type: string; amount: string; description: string; category: string; account: string; note: string },
    picks: { day: string; month: string; label: RegExp; flag: RegExp },
  ) {
    const user = userEvent.setup()
    const form = shown()
    fireEvent.click(form.getByRole('button', { name: values.type }))
    fireEvent.change(form.getByLabelText(/amount/i), { target: { value: values.amount } })
    fireEvent.change(form.getByLabelText(/^description$/i), { target: { value: values.description } })
    fireEvent.change(form.getByLabelText('Category'), { target: { value: values.category } })
    fireEvent.change(form.getByLabelText('Account'), { target: { value: values.account } })
    await user.click(form.getByRole('button', { name: 'Date' }))
    await user.click(screen.getByRole('button', { name: picks.day }))
    await user.click(form.getByRole('button', { name: 'Budget month' }))
    await user.click(screen.getByRole('button', { name: picks.month }))
    fireEvent.click(form.getByRole('button', { name: /add note/i }))
    fireEvent.change(form.getByLabelText(/note/i), { target: { value: values.note } })
    await user.click(form.getByRole('button', { name: 'No labels' }))
    await user.click(screen.getByRole('button', { name: picks.label }))
    await user.click(screen.getByRole('button', { name: 'Done' }))
    await user.click(form.getByRole('button', { name: /No flag/ }))
    await user.click(screen.getByRole('button', { name: picks.flag }))
  }

  const A = { type: 'Refund', amount: '71,17', description: 'Alpha', category: '2', account: '2', note: 'note A' }
  const B = { type: 'Income', amount: '82,28', description: 'Bravo', category: '1', account: '1', note: 'note B' }

  function expectShown(v: typeof A) {
    const form = shown()
    expect(form.getByLabelText(/amount/i)).toHaveValue(v.amount)
    expect(form.getByLabelText(/^description$/i)).toHaveValue(v.description)
    expect(form.getByLabelText('Category')).toHaveValue(v.category)
    expect(form.getByLabelText('Account')).toHaveValue(v.account)
    expect(form.getByLabelText(/note/i)).toHaveValue(v.note)
  }

  it('keeps each payment’s own fields while the sheet is open, and adds each with its own', async () => {
    const setTransactionLabels = vi.fn().mockResolvedValue(undefined)
    const uploadAttachment = vi.fn().mockResolvedValue(undefined)
    const { actions, container } = openSheet(3, 1, { setTransactionLabels, uploadAttachment })
    await fill(A, { day: '3 November 2026', month: 'Dec 2026', label: /Japan trip/, flag: /Work travel/ })
    const file = new File(['a'], 'a.jpg', { type: 'image/jpeg' })
    const input = container.ownerDocument.querySelector<HTMLInputElement>('form:not([hidden]) input[type=file]')!
    await userEvent.upload(input, file)

    fireEvent.click(nextArrow())
    // Payment 2 opens as it came, nothing of payment 1's on it.
    expect(amount()).toBe('20,02')
    expect(shown().getByRole('button', { name: 'No labels' })).toBeInTheDocument()
    expect(shown().getByRole('button', { name: /No flag/ })).toBeInTheDocument()
    expect(shown().queryByText('a.jpg')).not.toBeInTheDocument()
    await fill(B, { day: '4 November 2026', month: 'Oct 2026', label: /Work trip/, flag: /Tax deductible/ })

    fireEvent.click(previousArrow())
    expectShown(A)
    expect(shown().getByRole('button', { name: '1 label' })).toBeInTheDocument()
    expect(shown().getByRole('button', { name: /Work travel/ })).toBeInTheDocument()
    fireEvent.click(nextArrow())
    expectShown(B)

    fireEvent.click(shown().getByRole('button', { name: 'Add and next (2 left)' }))
    await waitFor(() => expect(actions.submitRecommendation).toHaveBeenCalledTimes(1))
    expect(actions.submitRecommendation).toHaveBeenCalledWith(
      ID(2),
      expect.objectContaining({
        type: 'income',
        amountCents: 8228,
        description: 'Bravo',
        categoryId: 1,
        accountId: 1,
        date: '2026-11-04',
        budgetMonth: '2026-10',
        notes: 'note B',
        flagId: 2,
      }),
      false,
    )
    await waitFor(() => expect(setTransactionLabels).toHaveBeenCalledWith(502, [2]))
    expect(uploadAttachment).not.toHaveBeenCalled()

    // Payment 3 took its place; payment 1 is still as it was left.
    await waitFor(() => expect(amount()).toBe('30,03'))
    fireEvent.click(previousArrow())
    expectShown(A)
    fireEvent.click(shown().getByRole('button', { name: 'Add and next (1 left)' }))
    await waitFor(() => expect(actions.submitRecommendation).toHaveBeenCalledTimes(2))
    expect(vi.mocked(actions.submitRecommendation!).mock.calls[1]).toEqual([
      ID(1),
      expect.objectContaining({
        type: 'refund',
        amountCents: 7117,
        description: 'Alpha',
        categoryId: 2,
        accountId: 2,
        date: '2026-11-03',
        budgetMonth: '2026-12',
        notes: 'note A',
        flagId: 1,
      }),
      false,
    ])
    await waitFor(() => expect(setTransactionLabels).toHaveBeenCalledWith(501, [1]))
    expect(uploadAttachment).toHaveBeenCalledOnce()
    expect(uploadAttachment).toHaveBeenCalledWith(501, file)
    // Every field of two payments through the real pickers: about a second here, over five on a CI runner.
  }, 20_000)

  it('keeps a plan being set up with its own payment', () => {
    openSheet(2, 1)
    fireEvent.click(shown().getByRole('button', { name: /no plan/i }))
    fireEvent.click(screen.getByRole('button', { name: 'New plan' }))
    fireEvent.change(screen.getByLabelText('Total installments'), { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    const planned = shown().queryByRole('button', { name: /no plan/i })
    expect(planned).not.toBeInTheDocument()

    fireEvent.click(nextArrow())
    expect(shown().getByRole('button', { name: /no plan/i })).toBeInTheDocument()
    fireEvent.click(previousArrow())
    expect(shown().queryByRole('button', { name: /no plan/i })).not.toBeInTheDocument()
  })

  it('asks before closing over a change made to a payment moved away from, and discards them all on Discard', () => {
    const { onClose } = openSheet(3, 1)
    fireEvent.change(shown().getByLabelText(/^description$/i), { target: { value: 'Changed' } })
    fireEvent.click(nextArrow())
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.getByText('Discard unsaved changes?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('closes at once when no payment holds a change', () => {
    const { onClose } = openSheet(3, 1)
    fireEvent.click(nextArrow())
    fireEvent.click(nextArrow())
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('holds the arrows while a picker is open, so it closes on the payment it belongs to', async () => {
    const user = userEvent.setup()
    openSheet(3, 2)
    await user.click(shown().getByRole('button', { name: 'No labels' }))
    expect(nextArrow()).toBeDisabled()
    await user.click(screen.getByRole('button', { name: /Japan trip/ }))
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(nextArrow()).toBeEnabled()
    fireEvent.click(nextArrow())
    expect(shown().getByRole('button', { name: 'No labels' })).toBeInTheDocument()
    fireEvent.click(previousArrow())
    expect(shown().getByRole('button', { name: '1 label' })).toBeInTheDocument()
  })
})

describe('the move between payments, with motion on', () => {
  beforeEach(() => {
    setMotionDisabledForTests(false)
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })
  afterEach(() => setMotionDisabledForTests(true))

  const page = () => document.querySelector('form')!.parentElement!

  it('slides the payment out and the other in from the far side, and a second press meanwhile does nothing', () => {
    openSheet(3, 1)
    fireEvent.click(nextArrow())
    expect(page()).toHaveClass(pagerStyles.pageOut!)
    expect(page()).toHaveAttribute('inert')
    expect(page()).toHaveAttribute('data-dir', 'next')
    fireEvent.click(nextArrow())
    act(() => void vi.advanceTimersByTime(EXIT_MS.fade))
    expect(page()).toHaveClass(pagerStyles.pageIn!)
    expect(page()).not.toHaveAttribute('inert')
    expect(amount()).toBe('20,02')
    // A press while it arrives is the second tap of the same double tap.
    fireEvent.click(nextArrow())
    expect(page()).toHaveClass(pagerStyles.pageIn!)
    // Let go once the arrival has played, which jsdom does not play.
    act(() => void vi.advanceTimersByTime(EXIT_MS.sheet * 2))
    expect(page()).not.toHaveClass(pagerStyles.pageIn!)
    expect(counter()).toHaveTextContent('2 of 3')
    fireEvent.click(nextArrow())
    expect(page()).toHaveClass(pagerStyles.pageOut!)
  })

  it('mirrors the move for the previous payment', () => {
    openSheet(3, 2)
    fireEvent.click(previousArrow())
    expect(page()).toHaveAttribute('data-dir', 'previous')
    act(() => void vi.advanceTimersByTime(EXIT_MS.fade))
    expect(amount()).toBe('10,01')
  })
})

describe('the move between payments, for someone who asked for less movement', () => {
  beforeEach(() => {
    setMotionDisabledForTests(false)
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    setMotionDisabledForTests(true)
  })

  it('moves at once, and a double tap still moves once', () => {
    openSheet(4, 1)
    fireEvent.click(nextArrow())
    expect(amount()).toBe('20,02')
    expect(document.querySelector('form')!.parentElement).not.toHaveClass(pagerStyles.pageOut!)
    fireEvent.click(nextArrow())
    expect(counter()).toHaveTextContent('2 of 4')
    act(() => void vi.advanceTimersByTime(300))
    fireEvent.click(nextArrow())
    expect(counter()).toHaveTextContent('3 of 4')
  })
})

describe('the ordinary add and edit sheets', () => {
  it('have no pager', () => {
    const actions = makeActions({})
    const { unmount } = render(
      <MoneyFormatProvider currencyCode="EUR" numberLocale="de-DE">
        <TransactionModal model={model} actions={actions} editing={null} onClose={vi.fn()} />
      </MoneyFormatProvider>,
    )
    expect(screen.queryByRole('group', { name: 'Payments to review' })).not.toBeInTheDocument()
    unmount()
    render(
      <MoneyFormatProvider currencyCode="EUR" numberLocale="de-DE">
        <TransactionModal model={model} actions={actions} editing={makeTransaction({ id: 4 })} onClose={vi.fn()} />
      </MoneyFormatProvider>,
    )
    expect(screen.queryByRole('group', { name: 'Payments to review' })).not.toBeInTheDocument()
    expect(document.querySelectorAll('form')).toHaveLength(1)
  })
})
