import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as api from '../../data/captureCardsApi'
import type { Account } from '../../types'
import type { SeedCard } from '../actions'
import CardQuestion from './CardQuestion'
import { otherCardsOf } from './cardLinks'

vi.mock('../../data/captureCardsApi', async (original) => ({ ...(await original<typeof api>()), fetchCardLinks: vi.fn() }))
afterEach(() => vi.resetAllMocks())

const accounts: Account[] = [
  { id: 1, name: 'Main Debit', kind: 'debit', settlement: 'immediate', active: true },
  { id: 2, name: 'Travel Credit', kind: 'credit', settlement: 'deferred', active: true },
  { id: 3, name: 'Closed', kind: 'debit', settlement: 'immediate', active: false },
]
const seedCard = (): SeedCard => ({ source: 'iberia', digits: '4821', answer: { accountId: null, remember: true }, unanswered: 'Choose the account first', remember: vi.fn() })
const links = (cards: api.CardLink[]) => vi.mocked(api.fetchCardLinks).mockResolvedValue({ cards, waiting: [] })

describe('the question about a card', () => {
  it('asks which account the card is, with nothing chosen, the open accounts and remembering on', () => {
    links([])
    render(<CardQuestion card={seedCard()} accounts={accounts} onPick={vi.fn()} />)

    expect(screen.getByText('Which account is the card ending 4821?')).toBeInTheDocument()
    const select = screen.getByLabelText('Account for the card ending 4821')
    expect(select).toHaveValue('')
    expect([...(select as HTMLSelectElement).options].map((o) => o.text)).toEqual(['Pick an account', 'Main Debit', 'Travel Credit'])
    expect(screen.getByRole('checkbox', { name: 'Remember this card' })).toBeChecked()
  })

  it('moves the form to the account picked and records the answer for the save', () => {
    links([])
    const card = seedCard()
    const onPick = vi.fn()
    render(<CardQuestion card={card} accounts={accounts} onPick={onPick} />)

    fireEvent.change(screen.getByLabelText('Account for the card ending 4821'), { target: { value: '2' } })

    expect(onPick).toHaveBeenCalledWith(2)
    expect(card.answer).toEqual({ accountId: 2, remember: true })
  })

  it('does not move the form when the choice is cleared', () => {
    links([])
    const card = seedCard()
    const onPick = vi.fn()
    render(<CardQuestion card={card} accounts={accounts} onPick={onPick} />)
    const select = screen.getByLabelText('Account for the card ending 4821')
    fireEvent.change(select, { target: { value: '1' } })
    onPick.mockClear()

    fireEvent.change(select, { target: { value: '' } })

    expect(onPick).not.toHaveBeenCalled()
    expect(card.answer.accountId).toBeNull()
  })

  it('lets the person not remember it', () => {
    links([])
    const card = seedCard()
    render(<CardQuestion card={card} accounts={accounts} onPick={vi.fn()} />)

    fireEvent.click(screen.getByRole('checkbox', { name: 'Remember this card' }))

    expect(card.answer.remember).toBe(false)
  })

  it('says which accounts already have a card, and that choosing one adds this card and keeps the old', async () => {
    links([{ source: 'iberia', digitsKind: 'card', digits: '1234', accountId: 1 }])
    render(<CardQuestion card={seedCard()} accounts={accounts} onPick={vi.fn()} />)

    expect(await screen.findByRole('option', { name: 'Main Debit (also has card ending 1234)' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Travel Credit' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Account for the card ending 4821'), { target: { value: '1' } })

    expect(screen.getByText(/adds the card ending 4821 and keeps the one ending 1234/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Remember this card' }))
    expect(screen.queryByText(/keeps the one ending/)).not.toBeInTheDocument()
  })

  it('works without the hint when the links cannot be read', async () => {
    vi.mocked(api.fetchCardLinks).mockRejectedValue(new Error('offline'))
    render(<CardQuestion card={seedCard()} accounts={accounts} onPick={vi.fn()} />)

    expect(await screen.findByRole('option', { name: 'Main Debit' })).toBeInTheDocument()
  })
})

describe('otherCardsOf', () => {
  const found: api.CardLink[] = [
    { source: 'iberia', digitsKind: 'card', digits: '1234', accountId: 1 },
    { source: 'iberia', digitsKind: 'card', digits: '4821', accountId: 1 },
    { source: 'santander', digitsKind: 'card', digits: '4821', accountId: 1 },
    { source: 'iberia', digitsKind: 'card', digits: '9999', accountId: 2 },
  ]

  it("lists the account's other cards, not this one, and counts the same digits from another bank app as another card", () => {
    expect(otherCardsOf(found, 1, { source: 'iberia', digits: '4821' })).toEqual(['1234', '4821'])
    expect(otherCardsOf(found, 2, { source: 'iberia', digits: '4821' })).toEqual(['9999'])
    expect(otherCardsOf(found, 3, { source: 'iberia', digits: '4821' })).toEqual([])
  })
})
