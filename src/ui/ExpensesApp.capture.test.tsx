import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { LEDGER_MODE_KEY } from '../config/ledgerMode'
import type { ExpenseDataSource } from '../data/dataSource'
import * as api from '../data/recommendationsApi'
import { allGroupsGranted } from '../domain/accessGroups'
import type { ExpenseDataset } from '../types'
import { makeDataset, makeTransaction } from '../testing/factories'
import { makeRecommendation, makeReviewModel } from '../testing/reviewKit'
import { ExpensesApp } from './ExpensesApp'
import { setMotionDisabledForTests } from './hooks/motion'
import { ToastProvider } from './hooks/ToastProvider'
import { UNDO_MS } from './capture/usePendingAction'

vi.mock('../data/recommendationsApi', async (original) => ({
  ...(await original<typeof api>()),
  fetchRecommendations: vi.fn(),
  submitRecommendation: vi.fn(),
  dismissRecommendation: vi.fn(),
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
  window.history.replaceState(null, '', '/')
})

describe('payments to review on the Dashboard', () => {
  it('shows no card, no badge and reads nothing with the capture flag off', async () => {
    open()

    await screen.findByText('Income')
    expect(screen.queryByText(/payments? to review/)).not.toBeInTheDocument()
    expect(api.fetchRecommendations).not.toHaveBeenCalled()
  })

  it('shows the card at the top and a count on the Dashboard tab, and the Settings badge keeps its own meaning', async () => {
    window.history.replaceState(null, '', '/?capture=on')
    open()

    expect(await screen.findByRole('heading', { name: '2 payments to review' })).toBeInTheDocument()
    expect(screen.getAllByLabelText('2 payments to review').length).toBeGreaterThan(0)
    expect(screen.queryByLabelText(/pending access requests/)).not.toBeInTheDocument()
  })

  it('adds a known merchant with one tap after the undo window, and the count drops', async () => {
    window.history.replaceState(null, '', '/?capture=on')
    open()
    await screen.findByRole('heading', { name: '2 payments to review' })

    fireEvent.click(screen.getByRole('button', { name: 'Add Cafe Example' }))

    expect(screen.getByRole('status')).toHaveTextContent('Added · Cafe Example')
    expect(screen.getByRole('status')).toHaveTextContent('Eating out')
    expect(api.submitRecommendation).not.toHaveBeenCalled()
    // The server no longer lists it once it is decided.
    vi.mocked(api.fetchRecommendations).mockResolvedValue({ recommendations: [unknown], next: null, openCount: 1 })
    await act(async () => void (await vi.advanceTimersByTimeAsync(UNDO_MS)))
    expect(api.submitRecommendation).toHaveBeenCalledWith(KNOWN, expect.objectContaining({ amountCents: 1250, categoryId: 1, accountId: 1, type: 'expense' }))
    expect(await screen.findByRole('heading', { name: '1 payment to review' })).toBeInTheDocument()
  })

  it('takes a one tap back with Undo and sends nothing', async () => {
    window.history.replaceState(null, '', '/?capture=on')
    open()
    await screen.findByRole('heading', { name: '2 payments to review' })

    fireEvent.click(screen.getByRole('button', { name: 'Add Cafe Example' }))
    fireEvent.click(within(screen.getByRole('status')).getByRole('button', { name: 'Undo' }))
    await act(async () => void (await vi.advanceTimersByTimeAsync(UNDO_MS * 2)))

    expect(api.submitRecommendation).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: '2 payments to review' })).toBeInTheDocument()
  })

  it('opens the add form for a payment in doubt, with only what the push said, and saves it through the recommendation', async () => {
    window.history.replaceState(null, '', '/?capture=on')
    open()
    await screen.findByRole('heading', { name: '2 payments to review' })

    fireEvent.click(screen.getByRole('button', { name: 'Review' }))

    const form = (await screen.findByRole('dialog')).querySelector('form')!
    expect(within(form).getByLabelText(/amount/i)).toHaveValue('8,00')
    expect(within(form).getByLabelText(/description/i)).toHaveValue('')
    fireEvent.change(within(form).getByLabelText(/description/i), { target: { value: 'Bakery' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Add transaction' }))

    await waitFor(() => expect(api.submitRecommendation).toHaveBeenCalledWith(NEW, expect.objectContaining({ amountCents: 800, description: 'Bakery', date: '2026-11-09' })))
  })

  it('moves on to the next payment when the form is saved, and ends the queue at the last', async () => {
    window.history.replaceState(null, '', '/?capture=on')
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
    fireEvent.change(within(form).getByLabelText(/description/i), { target: { value: 'Bakery' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Add and next (1 left)' }))

    await waitFor(() => expect(within(screen.getByRole('dialog').querySelector('form')!).getByLabelText(/amount/i)).toHaveValue('4,50'))
    form = screen.getByRole('dialog').querySelector('form')!
    expect(within(form).getByRole('button', { name: 'Add transaction' })).toBeInTheDocument()
  })
})
