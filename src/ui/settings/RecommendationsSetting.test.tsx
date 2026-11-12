import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../data/apiClient'
import * as api from '../../data/recommendationsApi'
import { makeActions } from '../../testing/makeActions'
import { makeTransaction } from '../../testing/factories'
import { MoneyFormatProvider } from '../hooks/MoneyFormatProvider'
import type { ExpenseModel } from '../useExpenseData'
import { RecommendationsSetting } from './RecommendationsSetting'

vi.mock('../../data/recommendationsApi', async (original) => ({
  ...(await original<typeof api>()),
  fetchRecommendations: vi.fn(),
  dismissRecommendation: vi.fn(),
  linkRecommendation: vi.fn(),
}))

const typed = makeTransaction({ id: 5, description: 'Lunch', accountId: 1, amountCents: 1250, date: '2026-11-10' })
const model = {
  dataset: { transactions: [typed] },
  lookup: { accountName: (id: number) => (id === 1 ? 'Everyday card' : '') },
} as unknown as ExpenseModel

const rec = (id: string, over: Partial<api.RecommendationInfo> = {}): api.RecommendationInfo => ({
  id,
  accountId: 1,
  amountCents: 1250,
  currency: 'EUR',
  localDate: '2026-11-10',
  occurredAt: '2026-11-10T09:41:07.000Z',
  merchantRaw: 'CAFE EXAMPLE',
  descriptionSuggested: null,
  suggestedType: 'expense',
  ...over,
})
const A = '0b0c0d0e-1111-4222-8333-444455556661'
const B = '0b0c0d0e-1111-4222-8333-444455556662'
const C = '0b0c0d0e-1111-4222-8333-444455556663'
const page = (...recommendations: api.RecommendationInfo[]): api.RecommendationPage => ({
  recommendations,
  next: null,
  openCount: recommendations.length,
})

const show = (actions = makeActions()) =>
  render(
    <MoneyFormatProvider currencyCode="EUR" numberLocale="de-DE">
      <RecommendationsSetting model={model} actions={actions} />
    </MoneyFormatProvider>,
  )

beforeEach(() => {
  vi.mocked(api.dismissRecommendation).mockResolvedValue(undefined)
  vi.mocked(api.linkRecommendation).mockResolvedValue(undefined)
})
afterEach(() => vi.resetAllMocks())

describe('the list', () => {
  it('says when there is nothing to review', async () => {
    vi.mocked(api.fetchRecommendations).mockResolvedValue(page())
    show()

    expect(await screen.findByText('Nothing to review.')).toBeInTheDocument()
  })

  it('groups by day with the merchant text, account and a count', async () => {
    vi.mocked(api.fetchRecommendations).mockResolvedValue(
      page(rec(A), rec(B, { localDate: '2026-11-09', merchantRaw: 'SHOP TWO', accountId: null })),
    )
    show()

    expect(await screen.findByText('CAFE EXAMPLE')).toBeInTheDocument()
    expect(screen.getByText('SHOP TWO')).toBeInTheDocument()
    expect(screen.getByText('10 Nov')).toBeInTheDocument()
    expect(screen.getByText('9 Nov')).toBeInTheDocument()
    expect(screen.getByText(/Everyday card/)).toBeInTheDocument()
    expect(screen.getByText('2 to review')).toBeInTheDocument()
  })

  it('shows chips for what needs a look and a placeholder for a bare payment', async () => {
    vi.mocked(api.fetchRecommendations).mockResolvedValue(
      page(rec(A, { amountCents: null, merchantRaw: null, suggestedType: null })),
    )
    show()

    expect(await screen.findByText('Payment')).toBeInTheDocument()
    expect(screen.getByText('Incomplete')).toBeInTheDocument()
    expect(screen.getByText('Pick a type')).toBeInTheDocument()
  })

  it('shows a payment in another currency with its own code, never as euros', async () => {
    vi.mocked(api.fetchRecommendations).mockResolvedValue(page(rec(A, { currency: 'USD', amountCents: 1250 })))
    show()

    expect(await screen.findByText('US$12.50')).toBeInTheDocument()
    expect(screen.getByText('In USD')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('€')
  })

  it('offers a retry when the first read fails, and clears the error once it works', async () => {
    vi.mocked(api.fetchRecommendations)
      .mockRejectedValueOnce(new ApiError('Request failed (500)', 500))
      .mockResolvedValueOnce(page(rec(A)))
    show()

    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('CAFE EXAMPLE')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('clears a failed Show more when the next read works', async () => {
    vi.mocked(api.fetchRecommendations)
      .mockResolvedValueOnce({ recommendations: [rec(A)], next: 'cursor', openCount: 2 })
      .mockRejectedValueOnce(new ApiError('Request failed (503)', 503))
      .mockResolvedValueOnce({ recommendations: [rec(B)], next: null, openCount: 1 })
    show()
    fireEvent.click(await screen.findByRole('button', { name: 'Show more' }))
    await screen.findByRole('alert')

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('keeps the rows Show more loaded when one is decided', async () => {
    vi.mocked(api.fetchRecommendations)
      .mockResolvedValueOnce({ recommendations: [rec(A)], next: 'c1', openCount: 3 })
      .mockResolvedValueOnce({ recommendations: [rec(B, { merchantRaw: 'SHOP TWO' })], next: 'c2', openCount: 3 })
      .mockResolvedValueOnce({ recommendations: [rec(B, { merchantRaw: 'SHOP TWO' })], next: 'c2', openCount: 2 })
      .mockResolvedValueOnce({ recommendations: [rec(C, { merchantRaw: 'SHOP THREE' })], next: null, openCount: 2 })
    show()
    fireEvent.click(await screen.findByRole('button', { name: 'Show more' }))
    await screen.findByText('SHOP TWO')

    fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss' })[0]!)

    expect(await screen.findByText('SHOP THREE')).toBeInTheDocument()
    expect(screen.getByText('SHOP TWO')).toBeInTheDocument()
    expect(screen.queryByText('CAFE EXAMPLE')).not.toBeInTheDocument()
  })

  it('shows the reason when the list cannot be read', async () => {
    vi.mocked(api.fetchRecommendations).mockRejectedValue(new ApiError('Request failed (500)', 500))
    show()

    expect(await screen.findByRole('alert')).toHaveTextContent('Request failed (500)')
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument()
  })

  it('shows a plain message when the failure is not an Error', async () => {
    vi.mocked(api.fetchRecommendations).mockRejectedValue('boom')
    show()

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong')
  })

  it('reads the next page on Show more and appends it', async () => {
    vi.mocked(api.fetchRecommendations)
      .mockResolvedValueOnce({ recommendations: [rec(A)], next: 'cursor', openCount: 2 })
      .mockResolvedValueOnce({ recommendations: [rec(B, { merchantRaw: 'SHOP TWO' })], next: null, openCount: 2 })
    show()

    fireEvent.click(await screen.findByRole('button', { name: 'Show more' }))

    expect(await screen.findByText('SHOP TWO')).toBeInTheDocument()
    expect(api.fetchRecommendations).toHaveBeenLastCalledWith('cursor')
    expect(screen.getByText('CAFE EXAMPLE')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument()
  })

  it('keeps what is shown and says why when the next page fails', async () => {
    vi.mocked(api.fetchRecommendations)
      .mockResolvedValueOnce({ recommendations: [rec(A)], next: 'cursor', openCount: 2 })
      .mockRejectedValueOnce(new ApiError('Request failed (503)', 503))
    show()

    fireEvent.click(await screen.findByRole('button', { name: 'Show more' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Request failed (503)')
    expect(screen.getByText('CAFE EXAMPLE')).toBeInTheDocument()
  })
})

describe('deciding', () => {
  it('opens the add form seeded from the recommendation', async () => {
    vi.mocked(api.fetchRecommendations).mockResolvedValue(page(rec(A, { descriptionSuggested: 'Cafe' })))
    const actions = makeActions()
    show(actions)

    fireEvent.click(await screen.findByRole('button', { name: /CAFE EXAMPLE/ }))

    expect(actions.onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ recommendationId: A, amountCents: 1250, date: '2026-11-10', description: 'Cafe' }),
    )
  })

  it('is read-only without write actions', async () => {
    vi.mocked(api.fetchRecommendations).mockResolvedValue(page(rec(A)))
    render(
      <MoneyFormatProvider currencyCode="EUR" numberLocale="de-DE">
        <RecommendationsSetting model={model} actions={undefined} />
      </MoneyFormatProvider>,
    )

    expect(await screen.findByText('CAFE EXAMPLE')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /CAFE EXAMPLE/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Link' })).not.toBeInTheDocument()
  })

  it('dismisses and reads the list again', async () => {
    vi.mocked(api.fetchRecommendations).mockResolvedValueOnce(page(rec(A))).mockResolvedValueOnce(page())
    show()

    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss' }))

    expect(await screen.findByText('Nothing to review.')).toBeInTheDocument()
    expect(api.dismissRecommendation).toHaveBeenCalledWith(A)
  })

  it('offers to link the one typed row that fits, and links it', async () => {
    vi.mocked(api.fetchRecommendations).mockResolvedValueOnce(page(rec(A))).mockResolvedValueOnce(page())
    show()

    expect(await screen.findByText('Already entered as Lunch?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Link' }))

    expect(await screen.findByText('Nothing to review.')).toBeInTheDocument()
    expect(api.linkRecommendation).toHaveBeenCalledWith(A, 5)
  })

  it('offers no link when no typed row fits', async () => {
    vi.mocked(api.fetchRecommendations).mockResolvedValue(page(rec(A, { amountCents: 999 })))
    show()

    await screen.findByText('CAFE EXAMPLE')
    expect(screen.queryByRole('button', { name: 'Link' })).not.toBeInTheDocument()
  })

  it('shows a refused decision and keeps the row', async () => {
    vi.mocked(api.fetchRecommendations).mockResolvedValue(page(rec(A)))
    vi.mocked(api.dismissRecommendation).mockRejectedValue(new ApiError('This recommendation was already decided', 409))
    show()

    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('already decided')
  })

  it('reads the list again when one is decided in the add form', async () => {
    vi.mocked(api.fetchRecommendations).mockResolvedValueOnce(page(rec(A))).mockResolvedValueOnce(page())
    show()
    await screen.findByText('CAFE EXAMPLE')

    act(() => api.announceRecommendationsChanged())

    expect(await screen.findByText('Nothing to review.')).toBeInTheDocument()
  })
})
