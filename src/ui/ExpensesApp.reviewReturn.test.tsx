import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LEDGER_MODE_KEY } from '../config/ledgerMode'
import type { ExpenseDataSource } from '../data/dataSource'
import type * as cardsApi from '../data/captureCardsApi'
import * as decisionsApi from '../data/recommendationDecisionsApi'
import * as api from '../data/recommendationsApi'
import { allGroupsGranted } from '../domain/accessGroups'
import type { RecommendationInfo } from '../data/recommendationsApi'
import type { ExpenseDataset } from '../types'
import { makeDataset, makeTransaction } from '../testing/factories'
import { makeRecommendation, makeReviewModel } from '../testing/reviewKit'
import { ExpensesApp } from './ExpensesApp'
import { EXIT_MS, setMotionDisabledForTests } from './hooks/motion'
import { ToastProvider } from './hooks/ToastProvider'

vi.mock('../data/captureCardsApi', async (original) => ({
  ...(await original<typeof cardsApi>()),
  fetchCardLinks: vi.fn(),
  linkCard: vi.fn(),
}))
vi.mock('../data/recommendationDecisionsApi', () => ({ dismissRecommendation: vi.fn(), linkRecommendation: vi.fn() }))
vi.mock('../data/recommendationsApi', async (original) => ({
  ...(await original<typeof api>()),
  fetchRecommendations: vi.fn(),
  submitRecommendation: vi.fn(),
}))

function phone() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      // A phone: the card shows three rows, so five waiting need See all.
      matches: query.includes('max-width'),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

const dataset: ExpenseDataset = makeDataset({
  ...makeReviewModel().dataset,
  transactions: [...makeReviewModel().dataset.transactions],
})

const NAMES = ['ALPHA', 'BRAVO', 'CHARLIE', 'DELTA', 'ECHO', 'FOXTROT', 'GOLF']

/** Payments no merchant is known for, so each row opens the review form. One a day, newest first. */
function waiting(n: number) {
  return Array.from({ length: n }, (_, i) =>
    makeRecommendation({
      id: `0b0c0d0e-1111-4222-8333-4444555566${String(i + 10)}`,
      merchantRaw: `${NAMES[i]!} PLACE`,
      amountCents: 100 * (i + 1),
      localDate: `2026-11-${String(20 - i).padStart(2, '0')}`,
    }),
  )
}

function source(): ExpenseDataSource {
  return { canWrite: true, load: vi.fn().mockResolvedValue(dataset) }
}

const open = () =>
  render(
    <ToastProvider>
      <ExpensesApp source={source()} hubGrants={allGroupsGranted()} />
    </ToastProvider>,
  )

beforeEach(() => {
  phone()
  localStorage.clear()
  localStorage.setItem(LEDGER_MODE_KEY, 'off')
  localStorage.setItem('exp-review-card', 'open')
  setMotionDisabledForTests(true)
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.mocked(decisionsApi.dismissRecommendation).mockResolvedValue(undefined)
})
afterEach(() => {
  vi.useRealTimers()
  vi.resetAllMocks()
  setMotionDisabledForTests(true)
})

const list = () => screen.queryByRole('dialog', { name: /^To review/ })
const form = () => screen.queryByRole('dialog', { name: /payment/i })

/** The Dashboard with `n` waiting, the full list open and scrolled, and the payment at `row` (0-based) opened from it. */
/**
 * The server answers with `open` and settles a saved or not added payment as the real routes do, so a read after
 * the decision no longer lists it. A read takes a moment, as over a network, so it lands after the form has closed.
 */
function serverSettles(open: RecommendationInfo[]) {
  const answer = () => ({ recommendations: [...open], next: null, openCount: open.length })
  vi.mocked(api.fetchRecommendations).mockImplementation(() => {
    const now = answer()
    return new Promise((done) => setTimeout(() => done(now), 30))
  })
  const settle = (id: string) => {
    const at = open.findIndex((r) => r.id === id)
    if (at >= 0) open.splice(at, 1)
  }
  vi.mocked(api.submitRecommendation).mockImplementation((id) => {
    settle(id)
    return Promise.resolve(makeTransaction({ id: 77, description: 'Saved', accountId: 1, categoryId: 1 }))
  })
  vi.mocked(decisionsApi.dismissRecommendation).mockImplementation((id) => {
    settle(id)
    return Promise.resolve()
  })
}

/** Saves the payment on screen with the first category, by whichever button the form offers for it. */
function save() {
  const select = within(shownForm()).getByLabelText<HTMLSelectElement>('Category')
  fireEvent.change(select, { target: { value: select.options[1]!.value } })
  fireEvent.click(within(shownForm()).getByRole('button', { name: /^Add (and next|transaction)/ }))
}

/** The payment's form on screen: the ones visited before stay mounted, hidden, until the sheet closes. */
function shownForm(): HTMLElement {
  return [...form()!.querySelectorAll('form')].find((f) => f.closest('[hidden]') === null)!
}

async function openFromList(
  n: number,
  row: number,
) {
  serverSettles(waiting(n))
  open()
  await screen.findByRole('heading', { name: new RegExp(`^${n} to review`) })
  fireEvent.click(screen.getByRole('button', { name: `See all ${n}` }))
  const sheet = await screen.findByRole('dialog', { name: `To review (${n})` })
  // The sheet itself is what scrolls.
  sheet.scrollTop = 240
  fireEvent.click(within(sheet).getByRole('button', { name: new RegExp(`^Review ${NAMES[row]!} PLACE,`, 'i') }))
  await waitFor(() => expect(form()).toBeInTheDocument())
  return { sheet }
}

function dontAdd(times: number) {
  for (let i = 0; i < times; i++) fireEvent.click(within(form()!).getByRole('button', { name: "Don't add" }))
}

/** A finger dragged down a sheet, as the Modal tests do it: jsdom has no TouchEvent, and the hook reads `touches[0]`. */
function swipeDown(sheet: HTMLElement) {
  Object.defineProperty(sheet, 'offsetHeight', { value: 400, configurable: true })
  Object.defineProperty(sheet, 'scrollTop', { value: 0, writable: true })
  const touch = (
    type: string,
    clientY: number,
  ) => {
    const event = new Event(type, { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'touches', { value: [{ clientY }] })
    act(() => void sheet.dispatchEvent(event))
  }
  let now = 0
  const clock = vi.spyOn(performance, 'now').mockImplementation(() => now)
  touch('touchstart', 0)
  now += 1000
  touch('touchmove', 200)
  touch('touchend', 200)
  clock.mockRestore()
}

const rowsIn = (sheet: HTMLElement) =>
  within(sheet)
    .queryAllByRole('button', { name: /^Review \w+ PLACE,/i })
    .map((b) => /^Review (\w+)/i.exec(b.getAttribute('aria-label')!)![1]!.toUpperCase())

describe('closing a payment opened from the full list', () => {
  it('shows the list again, where it was, after the close cross', async () => {
    const { sheet } = await openFromList(7, 3)

    fireEvent.click(within(form()!).getByRole('button', { name: 'Close' }))

    await waitFor(() => expect(form()).not.toBeInTheDocument())
    expect(list()).toBe(sheet)
    expect(sheet.scrollTop).toBe(240)
    expect(rowsIn(sheet)).toEqual(NAMES)
  })

  it('closes only the payment on Escape, then the list on a second Escape', async () => {
    await openFromList(5, 0)

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(form()).not.toBeInTheDocument())
    expect(list()).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(list()).not.toBeInTheDocument())
    expect(screen.getByRole('heading', { name: /^5 to review/ })).toBeInTheDocument()
  })

  it('closes only the payment on a swipe down, and a swipe on the list under it does nothing', async () => {
    const { sheet } = await openFromList(6, 5)

    swipeDown(sheet)
    expect(form()).toBeInTheDocument()
    swipeDown(form()!)

    await waitFor(() => expect(form()).not.toBeInTheDocument())
    expect(list()).toBe(sheet)
  })

  it('leaves out the payments decided in between, two in a row', async () => {
    const { sheet } = await openFromList(6, 2)

    dontAdd(2)
    await waitFor(() => expect(within(form()!).getByLabelText(/amount/i)).toHaveValue('5,00'))
    fireEvent.click(within(form()!).getByRole('button', { name: 'Close' }))

    await waitFor(() => expect(form()).not.toBeInTheDocument())
    expect(list()).toBe(sheet)
    expect(rowsIn(sheet)).toEqual(['ALPHA', 'BRAVO', 'ECHO', 'FOXTROT'])
    expect(within(sheet).getByRole('heading', { name: 'To review (4)' })).toBeInTheDocument()
  })

  it('does not come back empty: deciding the last one there closes both and lands on the Dashboard', async () => {
    await openFromList(5, 0)

    dontAdd(5)

    await waitFor(() => expect(form()).not.toBeInTheDocument())
    await waitFor(() => expect(list()).not.toBeInTheDocument())
    expect(screen.queryByText('All caught up')).not.toBeInTheDocument()
  })

  it('stands the list down while the payment is on top of it: inert, out of reach of Tab and Escape', async () => {
    const { sheet } = await openFromList(5, 1)

    expect(sheet.closest('[inert]')).not.toBeNull()
    expect(form()!.closest('[inert]')).toBeNull()
    expect(form()!.contains(document.activeElement)).toBe(true)

    fireEvent.click(within(form()!).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(form()).not.toBeInTheDocument())

    expect(sheet.closest('[inert]')).toBeNull()
    expect(sheet.contains(document.activeElement)).toBe(true)
  })

  it('gives the focus back to the row it was opened from when that row is still there', async () => {
    const { sheet } = await openFromList(5, 1)
    const opener = within(sheet).getByRole('button', { name: /^Review BRAVO PLACE,/i })
    const focus = vi.spyOn(opener, 'focus')

    fireEvent.click(within(form()!).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(form()).not.toBeInTheDocument())

    expect(document.activeElement).toBe(opener)
    // Without moving the list: the row may have been scrolled half out of view, and the place is what comes back.
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: true })
  })

  it('gives the focus to the list heading when the row it was opened from was decided', async () => {
    const { sheet } = await openFromList(5, 1)

    dontAdd(1)
    fireEvent.click(within(form()!).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(form()).not.toBeInTheDocument())

    expect(document.activeElement).toBe(within(sheet).getByRole('heading', { name: 'To review (4)' }))
  })

  it('leaves out the payments saved with Add and next, and keeps the rest in order', async () => {
    const { sheet } = await openFromList(7, 4)

    for (const amount of ['6,00', '7,00']) {
      save()
      await waitFor(() => expect(within(form()!).getByLabelText(/amount/i)).toHaveValue(amount))
    }
    fireEvent.click(within(form()!).getByRole('button', { name: 'Close' }))
    // Only in jsdom does the form ask before dropping the payment it moved on to; a browser closes it at once.
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Discard' }))

    await waitFor(() => expect(form()).not.toBeInTheDocument())
    expect(list()).toBe(sheet)
    // The two saved leave with the read that follows the saves.
    await waitFor(() => expect(rowsIn(sheet)).toEqual(['ALPHA', 'BRAVO', 'CHARLIE', 'DELTA', 'GOLF']))
    expect(api.submitRecommendation).toHaveBeenCalledTimes(2)
  })

  it('closes both when the last one there is saved, though the list learns of the save after the form has closed', async () => {
    await openFromList(5, 0)

    dontAdd(4)
    await waitFor(() => expect(within(form()!).getByRole('button', { name: 'Add transaction' })).toBeInTheDocument())
    save()

    await waitFor(() => expect(form()).not.toBeInTheDocument())
    await waitFor(() => expect(list()).not.toBeInTheDocument())
    expect(screen.queryByText('All caught up')).not.toBeInTheDocument()
    expect(api.submitRecommendation).toHaveBeenCalledTimes(1)
  })

  it('closes both when every one is saved after moving through them with the arrows', async () => {
    await openFromList(5, 2)

    fireEvent.click(within(form()!).getByRole('button', { name: 'Next payment' }))
    fireEvent.click(within(form()!).getByRole('button', { name: 'Previous payment' }))
    fireEvent.click(within(form()!).getByRole('button', { name: 'Previous payment' }))
    for (let left = 5; left > 0; left--) {
      await waitFor(() =>
        expect(within(form()!).getByRole('button', { name: /^Add (and next|transaction)/ })).toBeEnabled(),
      )
      save()
      if (left > 1) await waitFor(() => expect(api.submitRecommendation).toHaveBeenCalledTimes(6 - left))
    }

    await waitFor(() => expect(form()).not.toBeInTheDocument())
    await waitFor(() => expect(list()).not.toBeInTheDocument())
    expect(api.submitRecommendation).toHaveBeenCalledTimes(5)
  })

  it('stays open, saying all caught up, when its own one-tap buttons empty it with no form', async () => {
    // A payment the app knows: its row adds with one tap, and the list is emptied without the form.
    const known = makeRecommendation({ id: '0b0c0d0e-1111-4222-8333-444455556699' })
    serverSettles([known, ...waiting(4)])
    open()
    await screen.findByRole('heading', { name: /^5 to review/ })
    fireEvent.click(screen.getByRole('button', { name: 'See all 5' }))
    const sheet = await screen.findByRole('dialog', { name: 'To review (5)' })
    fireEvent.click(within(sheet).getByRole('button', { name: /^Review ALPHA PLACE,/i }))
    await waitFor(() => expect(form()).toBeInTheDocument())
    dontAdd(4)
    fireEvent.click(within(form()!).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(form()).not.toBeInTheDocument())

    fireEvent.click(within(sheet).getByRole('button', { name: /^Add Cafe Example/ }))

    expect(list()).toBe(sheet)
    expect(within(sheet).getByText('All caught up')).toBeInTheDocument()
  })

  it('lets both sheets play their exit when the last one is decided, the list as it was, with motion on', async () => {
    setMotionDisabledForTests(false)
    await openFromList(5, 0)

    dontAdd(5)

    const leaving = list()!
    expect(leaving.closest('[inert]')).not.toBeNull()
    expect(within(leaving).queryByText('All caught up')).not.toBeInTheDocument()
    expect(rowsIn(leaving)).toEqual(['ECHO'])
    await act(async () => void (await vi.advanceTimersByTimeAsync(EXIT_MS.sheet + 20)))
    expect(form()).not.toBeInTheDocument()
    expect(list()).not.toBeInTheDocument()
  })
})

describe('closing a payment opened from the Dashboard card', () => {
  it('lands on the Dashboard as before, with no list', async () => {
    vi.mocked(api.fetchRecommendations).mockResolvedValue({ recommendations: waiting(5), next: null, openCount: 5 })
    open()
    await screen.findByRole('heading', { name: /^5 to review/ })

    fireEvent.click(screen.getByRole('button', { name: /^Review ALPHA PLACE,/i }))
    await waitFor(() => expect(form()).toBeInTheDocument())
    dontAdd(1)
    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => expect(form()).not.toBeInTheDocument())
    expect(list()).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^4 to review/ })).toBeInTheDocument()
  })
})
