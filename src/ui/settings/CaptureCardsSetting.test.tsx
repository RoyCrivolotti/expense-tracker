import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as api from '../../data/captureCardsApi'
import * as recs from '../../data/recommendationsApi'
import { makeReviewModel } from '../../testing/reviewKit'
import { CaptureCardsSetting } from './CaptureCardsSetting'

vi.mock('../../data/captureCardsApi', async (original) => ({ ...(await original<typeof api>()), fetchCardLinks: vi.fn(), unlinkCard: vi.fn() }))
vi.mock('../../data/recommendationsApi', async (original) => ({ ...(await original<typeof recs>()), announceRecommendationsChanged: vi.fn() }))
afterEach(() => vi.resetAllMocks())

const model = makeReviewModel()
const link = (over: Partial<api.CardLink> = {}): api.CardLink => ({ source: 'iberia', digitsKind: 'card', digits: '4821', accountId: 1, ...over })
const read = (cards: api.CardLink[], waiting: api.WaitingCard[] = []) => vi.mocked(api.fetchCardLinks).mockResolvedValue({ cards, waiting })

describe('the linked cards list', () => {
  it('says when no card is linked', async () => {
    read([])
    render(<CaptureCardsSetting model={model} />)

    expect(await screen.findByText('No cards linked yet.')).toBeInTheDocument()
  })

  it('shows each card with its bank app, digits and account, several to one account', async () => {
    read([link(), link({ digits: '1234' }), link({ source: 'santander', digitsKind: 'account', digits: '7777', accountId: 2 })])
    render(<CaptureCardsSetting model={model} />)

    expect(await screen.findByText('Iberia card ending 4821')).toBeInTheDocument()
    expect(screen.getByText('Iberia card ending 1234')).toBeInTheDocument()
    expect(screen.getByText('Santander account ending 7777')).toBeInTheDocument()
    expect(screen.getAllByText('Main Debit')).toHaveLength(2)
    expect(screen.getByText('Travel Credit')).toBeInTheDocument()
  })

  it('says so when the account was deleted', async () => {
    read([link({ accountId: 99 })])
    render(<CaptureCardsSetting model={model} />)

    expect(await screen.findByText('An account that was deleted')).toBeInTheDocument()
  })

  it('counts the cards waiting for an account, in the singular and the plural', async () => {
    read([], [{ source: 'iberia', digits: '5533', count: 1 }])
    const { unmount } = render(<CaptureCardsSetting model={model} />)
    expect(await screen.findByRole('status')).toHaveTextContent('1 card is waiting for an account: Iberia card ending 5533 (1 payment).')
    unmount()

    read([], [{ source: 'iberia', digits: '5533', count: 3 }, { source: 'santander', digits: '6644', count: 1 }])
    render(<CaptureCardsSetting model={model} />)
    expect(await screen.findByRole('status')).toHaveTextContent('2 cards are waiting for an account: Iberia card ending 5533 (3 payments), Santander card ending 6644 (1 payment).')
  })

  it('removes a link, reads the list again and tells the review card', async () => {
    vi.mocked(api.fetchCardLinks).mockResolvedValueOnce({ cards: [link()], waiting: [] }).mockResolvedValueOnce({ cards: [], waiting: [{ source: 'iberia', digits: '4821', count: 2 }] })
    vi.mocked(api.unlinkCard).mockResolvedValue(undefined)
    render(<CaptureCardsSetting model={model} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Remove Iberia card ending 4821' }))

    expect(await screen.findByText('No cards linked yet.')).toBeInTheDocument()
    expect(api.unlinkCard).toHaveBeenCalledWith(link())
    expect(recs.announceRecommendationsChanged).toHaveBeenCalledOnce()
    expect(screen.getByRole('status')).toHaveTextContent('waiting')
  })

  it('shows why a remove failed and keeps the link', async () => {
    read([link()])
    vi.mocked(api.unlinkCard).mockRejectedValue(new Error('Card link not found'))
    render(<CaptureCardsSetting model={model} />)

    fireEvent.click(await screen.findByRole('button', { name: /^Remove/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Card link not found')
    expect(screen.getByText('Iberia card ending 4821')).toBeInTheDocument()
  })

  it('shows why the list could not be read, plainly when the failure is not an Error', async () => {
    vi.mocked(api.fetchCardLinks).mockRejectedValue('boom')
    render(<CaptureCardsSetting model={model} />)

    await waitFor(() => expect(within(document.body).getByRole('alert')).toHaveTextContent('Something went wrong'))
  })
})
