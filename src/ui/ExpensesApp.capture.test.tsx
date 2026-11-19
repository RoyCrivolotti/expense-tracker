import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { LEDGER_MODE_KEY } from '../config/ledgerMode'
import type { ExpenseDataSource } from '../data/dataSource'
import * as cardsApi from '../data/captureCardsApi'
import * as decisionsApi from '../data/recommendationDecisionsApi'
import * as api from '../data/recommendationsApi'
import { allGroupsGranted } from '../domain/accessGroups'
import type { ExpenseDataset } from '../types'
import { makeDataset, makeTransaction } from '../testing/factories'
import { makeRecommendation, makeReviewModel } from '../testing/reviewKit'
import { ExpensesApp } from './ExpensesApp'
import { setMotionDisabledForTests } from './hooks/motion'
import { ToastProvider } from './hooks/ToastProvider'
import { UNDO_MS } from './capture/usePendingAction'
import { RETURN_THROTTLE_MS } from './capture/useReloadOnReturn'

vi.mock('../data/captureCardsApi', async (original) => ({ ...(await original<typeof cardsApi>()), fetchCardLinks: vi.fn(), linkCard: vi.fn() }))
vi.mock('../data/recommendationDecisionsApi', () => ({ dismissRecommendation: vi.fn(), linkRecommendation: vi.fn() }))
vi.mock('../data/recommendationsApi', async (original) => ({
  ...(await original<typeof api>()),
  fetchRecommendations: vi.fn(),
  submitRecommendation: vi.fn(),
}))

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
})

const dataset: ExpenseDataset = makeDataset({ ...makeReviewModel().dataset, transactions: [...makeReviewModel().dataset.transactions] })
const KNOWN = '0b0c0d0e-1111-4222-8333-444455556661'
const NEW = '0b0c0d0e-1111-4222-8333-444455556662'
const known = makeRecommendation({ id: KNOWN })
const unknown = makeRecommendation({ id: NEW, merchantRaw: 'BRAND NEW PLACE', amountCents: 800, localDate: '2026-11-09' })

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
  localStorage.clear()
  localStorage.setItem(LEDGER_MODE_KEY, 'off')
  setMotionDisabledForTests(true)
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.mocked(api.fetchRecommendations).mockResolvedValue({ recommendations: [known, unknown], next: null, openCount: 2 })
  vi.mocked(api.submitRecommendation).mockImplementation(() => Promise.resolve(makeTransaction({ id: 77, description: 'Cafe Example', accountId: 1, categoryId: 1 })))
})
afterEach(() => {
  vi.useRealTimers()
  vi.resetAllMocks()
})

describe('payments to review on the Dashboard', () => {
  it('shows no card and no badge when nothing is open', async () => {
    vi.mocked(api.fetchRecommendations).mockResolvedValue({ recommendations: [], next: null, openCount: 0 })
    open()

    await screen.findByText('Income')
    await waitFor(() => expect(api.fetchRecommendations).toHaveBeenCalled())
    // Give the card's lazy chunk every chance to mount, so its absence is not a slow import.
    await import('./capture/ReviewCard')
    for (let i = 0; i < 3; i++) await act(async () => void (await vi.advanceTimersByTimeAsync(50)))

    expect(screen.queryByRole('heading', { name: /to review|caught up/i })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/payments? to review/)).not.toBeInTheDocument()
  })

  it('shows the card at the top and a count on the Dashboard tab, and the Settings badge keeps its own meaning', async () => {
    open()

    expect(await screen.findByRole('heading', { name: '2 payments to review' })).toBeInTheDocument()
    expect(screen.getAllByLabelText('2 payments to review').length).toBeGreaterThan(0)
    expect(screen.queryByLabelText(/pending access requests/)).not.toBeInTheDocument()
  })

  it('shows a payment that arrived while the app was open when the person refreshes', async () => {
    vi.mocked(api.fetchRecommendations).mockResolvedValueOnce({ recommendations: [known], next: null, openCount: 1 })
    open()
    expect(await screen.findByRole('heading', { name: '1 payment to review' })).toBeInTheDocument()

    // A second payment is captured on the server; the app is not restarted.
    vi.mocked(api.fetchRecommendations).mockResolvedValue({ recommendations: [known, unknown], next: null, openCount: 2 })
    fireEvent.click(screen.getByRole('button', { name: 'Refresh data' }))

    expect(await screen.findByRole('heading', { name: '2 payments to review' })).toBeInTheDocument()
  })

  describe('when the app returns to the foreground', () => {
    const comeBack = () => {
      act(() => void vi.advanceTimersByTime(RETURN_THROTTLE_MS))
      act(() => void document.dispatchEvent(new Event('visibilitychange')))
    }
    const reads = () => vi.mocked(api.fetchRecommendations).mock.calls.length

    it('reads the list again', async () => {
      open()
      await screen.findByRole('heading', { name: '2 payments to review' })
      const before = reads()

      comeBack()

      await waitFor(() => expect(reads()).toBe(before + 1))
    })

    it('waits while the add form is open on a payment, and reads once when it closes', async () => {
      open()
      await screen.findByRole('heading', { name: '2 payments to review' })
      fireEvent.click(screen.getByRole('button', { name: 'Review' }))
      const dialog = await screen.findByRole('dialog')
      const before = reads()

      comeBack()
      await act(async () => void (await vi.advanceTimersByTimeAsync(50)))
      expect(reads()).toBe(before)
      fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))

      await waitFor(() => expect(reads()).toBe(before + 1))
    })

    it('waits while the queue sheet is open, and reads once when it closes', async () => {
      const seven = [KNOWN, NEW, ...[3, 4, 5, 6, 7].map((n) => `0b0c0d0e-1111-4222-8333-44445555666${n}`)].map((id) => makeRecommendation({ id, merchantRaw: `PLACE ${id.slice(-1)}` }))
      vi.mocked(api.fetchRecommendations).mockResolvedValue({ recommendations: seven, next: null, openCount: 7 })
      open()
      await screen.findByRole('heading', { name: '7 payments to review' })
      fireEvent.click(screen.getByRole('button', { name: /See all/ }))
      const dialog = await screen.findByRole('dialog')
      const before = reads()

      comeBack()
      await act(async () => void (await vi.advanceTimersByTimeAsync(50)))
      expect(reads()).toBe(before)
      fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))

      await waitFor(() => expect(reads()).toBe(before + 1))
    })
  })

  it('adds a known merchant with one tap after the undo window, and the count drops', async () => {
    open()
    await screen.findByRole('heading', { name: '2 payments to review' })

    fireEvent.click(screen.getByRole('button', { name: 'Add Cafe Example' }))

    expect(screen.getByRole('status')).toHaveTextContent('Added · Cafe Example')
    expect(screen.getByRole('status')).toHaveTextContent('Eating out')
    expect(api.submitRecommendation).not.toHaveBeenCalled()
    // The server no longer lists it once it is decided.
    vi.mocked(api.fetchRecommendations).mockResolvedValue({ recommendations: [unknown], next: null, openCount: 1 })
    await act(async () => void (await vi.advanceTimersByTimeAsync(UNDO_MS)))
    expect(api.submitRecommendation).toHaveBeenCalledWith(KNOWN, expect.objectContaining({ amountCents: 1250, categoryId: 1, accountId: 1, type: 'expense' }), undefined)
    expect(await screen.findByRole('heading', { name: '1 payment to review' })).toBeInTheDocument()
  })

  it('takes a one tap back with Undo and sends nothing', async () => {
    open()
    await screen.findByRole('heading', { name: '2 payments to review' })

    fireEvent.click(screen.getByRole('button', { name: 'Add Cafe Example' }))
    fireEvent.click(within(screen.getByRole('status')).getByRole('button', { name: 'Undo' }))
    await act(async () => void (await vi.advanceTimersByTimeAsync(UNDO_MS * 2)))

    expect(api.submitRecommendation).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: '2 payments to review' })).toBeInTheDocument()
  })

  it('opens the add form for a payment in doubt, with only what the push said, and saves it through the recommendation', async () => {
    open()
    await screen.findByRole('heading', { name: '2 payments to review' })

    fireEvent.click(screen.getByRole('button', { name: 'Review' }))

    const form = (await screen.findByRole('dialog')).querySelector('form')!
    expect(within(form).getByLabelText(/amount/i)).toHaveValue('8,00')
    expect(within(form).getByLabelText(/^description$/i)).toHaveValue('BRAND NEW PLACE')
    fireEvent.change(within(form).getByLabelText(/^description$/i), { target: { value: 'Bakery' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Add transaction' }))

    await waitFor(() => expect(api.submitRecommendation).toHaveBeenCalledWith(NEW, expect.objectContaining({ amountCents: 800, description: 'Bakery', date: '2026-11-09' }), false))
  })

  it('moves on to the next payment when the form is saved, and ends the queue at the last', async () => {
    vi.mocked(api.fetchRecommendations).mockResolvedValue({
      recommendations: [unknown, makeRecommendation({ id: KNOWN, merchantRaw: 'OTHER NEW PLACE', amountCents: 450 })],
      next: null,
      openCount: 2,
    })
    open()
    await screen.findByRole('heading', { name: '2 payments to review' })

    fireEvent.click(screen.getAllByRole('button', { name: 'Review' })[0]!)
    let form = (await screen.findByRole('dialog')).querySelector('form')!
    expect(within(form).getByRole('button', { name: 'Add and next (1 left)' })).toBeInTheDocument()
    fireEvent.change(within(form).getByLabelText(/^description$/i), { target: { value: 'Bakery' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Add and next (1 left)' }))

    await waitFor(() => expect(within(screen.getByRole('dialog').querySelector('form')!).getByLabelText(/amount/i)).toHaveValue('4,50'))
    form = screen.getByRole('dialog').querySelector('form')!
    expect(within(form).getByRole('button', { name: 'Add transaction' })).toBeInTheDocument()
  })

  it('asks which account a new card is, remembers the answer when the payment is saved, and uses it for the payment', async () => {
    vi.mocked(api.fetchRecommendations).mockResolvedValue({
      recommendations: [{ ...unknown, accountId: null, card: { source: 'iberia', digits: '4821' } }],
      next: null,
      openCount: 1,
    })
    vi.mocked(cardsApi.fetchCardLinks).mockResolvedValue({ cards: [{ source: 'iberia', digitsKind: 'card', digits: '1234', accountId: 2 }], waiting: [] })
    vi.mocked(cardsApi.linkCard).mockResolvedValue(undefined)
    open()
    fireEvent.click(await screen.findByRole('button', { name: 'Review' }))
    const form = (await screen.findByRole('dialog')).querySelector('form')!

    fireEvent.change(await screen.findByLabelText('Account for the card ending 4821'), { target: { value: '2' } })
    expect(await screen.findByRole('option', { name: 'Travel Credit (also card 1234)' })).toBeInTheDocument()
    fireEvent.click(within(form).getByRole('button', { name: 'Add transaction' }))

    await waitFor(() => expect(api.submitRecommendation).toHaveBeenCalledWith(NEW, expect.objectContaining({ accountId: 2, amountCents: 800 }), false))
    expect(cardsApi.linkCard).toHaveBeenCalledWith('iberia', '4821', 2)
    // The card is remembered once the payment is saved, so a failed save leaves no link.
    expect(vi.mocked(api.submitRecommendation).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(cardsApi.linkCard).mock.invocationCallOrder[0]!)
  })

  it('does not let the payment be saved until the card is answered, so the account is never a guess', async () => {
    vi.mocked(api.fetchRecommendations).mockResolvedValue({
      recommendations: [{ ...unknown, accountId: null, card: { source: 'iberia', digits: '4821' } }],
      next: null,
      openCount: 1,
    })
    vi.mocked(cardsApi.fetchCardLinks).mockResolvedValue({ cards: [], waiting: [] })
    open()
    fireEvent.click(await screen.findByRole('button', { name: 'Review' }))
    const form = (await screen.findByRole('dialog')).querySelector('form')!

    expect(within(form).getByLabelText('Account')).toHaveDisplayValue('Pick an account')
    fireEvent.click(within(form).getByRole('button', { name: 'Add transaction' }))

    const question = screen.getByText(/Which account is the card/).closest('fieldset')!
    expect(await within(question).findByRole('alert')).toHaveTextContent('Choose the account for the card ending 4821 first')
    expect(screen.getAllByText('Choose the account for the card ending 4821 first')).toHaveLength(1)
    expect(screen.getByLabelText('Account for the card ending 4821')).toHaveFocus()
    expect(api.submitRecommendation).not.toHaveBeenCalled()
    expect(cardsApi.linkCard).not.toHaveBeenCalled()
  })

  it('still says why nothing was saved when the installment view is open and the question is not on screen', async () => {
    vi.mocked(api.fetchRecommendations).mockResolvedValue({
      recommendations: [{ ...unknown, accountId: null, card: { source: 'iberia', digits: '4821' } }],
      next: null,
      openCount: 1,
    })
    vi.mocked(cardsApi.fetchCardLinks).mockResolvedValue({ cards: [], waiting: [] })
    open()
    fireEvent.click(await screen.findByRole('button', { name: 'Review' }))
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByText(/Which account is the card/)

    fireEvent.click(within(dialog).getByRole('button', { name: /no plan/i }))
    expect(within(dialog).queryByText(/Which account is the card/)).not.toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add transaction' }))

    expect(await within(dialog).findByText('Choose the account for the card ending 4821 first')).toBeInTheDocument()
    expect(api.submitRecommendation).not.toHaveBeenCalled()
  })

  it('does not ask about a card whose account is known', async () => {
    vi.mocked(api.fetchRecommendations).mockResolvedValue({ recommendations: [{ ...unknown, accountId: 1, card: { source: 'iberia', digits: '4821' } }], next: null, openCount: 1 })
    open()

    fireEvent.click(await screen.findByRole('button', { name: 'Review' }))

    await screen.findByRole('dialog')
    expect(screen.queryByText(/Which account is the card/)).not.toBeInTheDocument()
  })

  it('sends a payment the server says is already typed to Review, offers to link it, and links it to that row', async () => {
    vi.mocked(decisionsApi.linkRecommendation).mockResolvedValue(undefined)
    vi.mocked(api.fetchRecommendations).mockResolvedValue({
      recommendations: [{ ...known, possibleMatch: { transactionId: 41, description: 'Cafe', date: '2026-11-09' } }],
      next: null,
      openCount: 1,
    })
    open()
    await screen.findByRole('heading', { name: '1 payment to review' })

    expect(screen.queryByRole('button', { name: 'Add Cafe Example' })).not.toBeInTheDocument()
    expect(screen.getByText('May be entered already')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Already entered as Cafe? Link' }))
    await act(async () => void (await vi.advanceTimersByTimeAsync(UNDO_MS)))

    expect(decisionsApi.linkRecommendation).toHaveBeenCalledWith(KNOWN, 41)
    expect(api.submitRecommendation).not.toHaveBeenCalled()
  })

  it('still adds a known merchant with one tap when the server names no match', async () => {
    vi.mocked(api.fetchRecommendations).mockResolvedValue({ recommendations: [{ ...known, possibleMatch: null }], next: null, openCount: 1 })
    open()
    await screen.findByRole('heading', { name: '1 payment to review' })

    expect(screen.getByRole('button', { name: 'Add Cafe Example' })).toBeInTheDocument()
  })

  describe('when the server finds a typed row at submit that the list did not', () => {
    const MATCH = { transactionId: 41, description: 'Cafe', date: '2026-11-09' }
    const tapAdd = async () => {
      vi.mocked(api.fetchRecommendations).mockResolvedValue({ recommendations: [known], next: null, openCount: 1 })
      vi.mocked(api.submitRecommendation).mockRejectedValueOnce(new api.PossibleDuplicateError(MATCH))
      open()
      await screen.findByRole('heading', { name: '1 payment to review' })
      fireEvent.click(screen.getByRole('button', { name: 'Add Cafe Example' }))
      await act(async () => void (await vi.advanceTimersByTimeAsync(UNDO_MS)))
    }

    it('puts the payment back in Review with the Link offer, and no error', async () => {
      await tapAdd()

      expect(await screen.findByRole('button', { name: 'Already entered as Cafe? Link' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Add Cafe Example' })).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { name: '1 payment to review' })).toBeInTheDocument()
      expect(screen.queryByText(/Couldn't/)).not.toBeInTheDocument()
      expect(screen.getByRole('status')).toHaveTextContent('you may have entered this already')
    })

    it('links the returned payment to that row', async () => {
      vi.mocked(decisionsApi.linkRecommendation).mockResolvedValue(undefined)
      await tapAdd()

      fireEvent.click(await screen.findByRole('button', { name: 'Already entered as Cafe? Link' }))
      await act(async () => void (await vi.advanceTimersByTimeAsync(UNDO_MS)))

      expect(decisionsApi.linkRecommendation).toHaveBeenCalledWith(KNOWN, 41)
    })

    it('adds it from Review without asking again, since the person has now seen the match', async () => {
      await tapAdd()

      fireEvent.click(await screen.findByRole('button', { name: 'Review' }))
      const form = (await screen.findByRole('dialog')).querySelector('form')!
      fireEvent.click(within(form).getByRole('button', { name: 'Add transaction' }))

      await waitFor(() => expect(api.submitRecommendation).toHaveBeenLastCalledWith(KNOWN, expect.anything(), true))
    })
  })
})

