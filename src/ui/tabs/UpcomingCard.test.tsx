import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RecurringSuggestion } from '../../engine'
import { MoneyFormatProvider } from '../hooks/MoneyFormatProvider'
import type { TransactionSeed } from '../actions'
import type { Lookup } from '../format'
import { UpcomingCard } from './UpcomingCard'

const DISMISSED_KEY = 'expense:dismissed-recurring'

const lookup: Lookup = {
  category: () => undefined,
  account: () => undefined,
  flag: () => undefined,
  label: () => undefined,
  attachments: () => [],
  categoryName: () => 'Subscriptions',
  accountName: () => 'Santander',
  installmentPlan: () => undefined,
  settlementFor: () => undefined,
  settledBy: () => [],
}

function makeSuggestion(overrides: Partial<RecurringSuggestion> = {}): RecurringSuggestion {
  return {
    description: 'Netflix',
    type: 'expense',
    accountId: 1,
    categoryId: 1,
    amountCents: 1500,
    predictedDate: '2026-09-24',
    predictedBudgetMonth: '2026-09',
    frequency: 'monthly',
    leadDays: 1,
    ...overrides,
  }
}

function renderCard(
  suggestions: RecurringSuggestion[],
  { currentMonth = '2026-09', onAdd = () => {} }: { currentMonth?: string; onAdd?: (seed?: TransactionSeed) => void } = {},
) {
  return render(
    <MoneyFormatProvider currencyCode="EUR" numberLocale="en-US">
      <UpcomingCard suggestions={suggestions} currentMonth={currentMonth} lookup={lookup} onAdd={onAdd} />
    </MoneyFormatProvider>,
  )
}

describe('UpcomingCard', () => {
  beforeEach(() => localStorage.clear())

  it('lists each suggestion with its category, amount and date', () => {
    renderCard([makeSuggestion({ amountCents: 1599 })])
    const info = screen.getByText('Netflix').parentElement!
    expect(info.textContent).toMatch(/^NetflixSubscriptions · .*15\.99.* · .* · Monthly$/)
  })

  it('renders nothing when there is nothing to suggest', () => {
    const { container } = renderCard([])
    expect(container.firstChild).toBeNull()
  })

  describe('a charge that files under another budget month', () => {
    it('is marked with its own month, and one for the current month is not', () => {
      renderCard(
        [
          makeSuggestion({ description: 'Gym', predictedDate: '2026-09-20', predictedBudgetMonth: '2026-09' }),
          makeSuggestion({ description: 'Rent', predictedDate: '2026-09-25', predictedBudgetMonth: '2026-10' }),
        ],
        { currentMonth: '2026-10' },
      )
      expect(screen.getByText('For Sep')).toBeDefined()
      expect(screen.getAllByText(/^For /)).toHaveLength(1)
    })

    it('names the month before the year turns', () => {
      renderCard([makeSuggestion({ predictedBudgetMonth: '2026-12' })], { currentMonth: '2027-01' })
      expect(screen.getByText('For Dec')).toBeDefined()
    })

    it('names a month ahead as well, for a charge that is due just before the month changes', () => {
      renderCard([makeSuggestion({ predictedBudgetMonth: '2026-10' })], { currentMonth: '2026-09' })
      expect(screen.getByText('For Oct')).toBeDefined()
    })
  })

  describe('adding a suggestion', () => {
    it('seeds the whole transaction, filed under the suggestion own budget month on its own date', () => {
      const onAdd = vi.fn()
      renderCard(
        [
          makeSuggestion({
            description: 'Payroll',
            type: 'income',
            accountId: 3,
            categoryId: 8,
            amountCents: 320_000,
            predictedDate: '2026-09-25',
            predictedBudgetMonth: '2026-10',
          }),
        ],
        { onAdd },
      )
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))
      expect(onAdd).toHaveBeenCalledWith({
        description: 'Payroll',
        type: 'income',
        accountId: 3,
        categoryId: 8,
        amountCents: 320_000,
        date: '2026-09-25',
        budgetMonth: '2026-10',
      })
    })
  })

  describe('dismissing a suggestion', () => {
    it('hides it and keeps it hidden the next time the card is shown', () => {
      const { unmount } = renderCard([makeSuggestion()])
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
      expect(screen.queryByText('Netflix')).toBeNull()
      unmount()
      renderCard([makeSuggestion()])
      expect(screen.queryByText('Netflix')).toBeNull()
    })

    it.each([
      ['category', { categoryId: 3 }],
      ['account', { accountId: 2 }],
      ['type', { type: 'income' as const }],
      ['budget month', { predictedBudgetMonth: '2026-10' }],
    ])('does not hide the same text when the %s differs', (_name, other) => {
      const { unmount } = renderCard([makeSuggestion()])
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
      unmount()
      renderCard([makeSuggestion(other)])
      expect(screen.getByText('Netflix')).toBeDefined()
    })

    it('hides only the one that was dismissed when two share a name', () => {
      renderCard([makeSuggestion({ categoryId: 7 }), makeSuggestion({ categoryId: 3, amountCents: 2400 })])
      fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss' })[0]!)
      expect(screen.getAllByText('Netflix')).toHaveLength(1)
    })

    it('still honours a dismissal saved under the key from before it carried the category', () => {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(['Netflix|1|2026-09']))
      renderCard([makeSuggestion()])
      expect(screen.queryByText('Netflix')).toBeNull()
    })

    it('does not carry over to the same series in another budget month', () => {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(['Netflix|1|1|expense|2026-08']))
      renderCard([makeSuggestion()])
      expect(screen.getByText('Netflix')).toBeDefined()
    })

    it('shows the card as usual when the saved dismissals cannot be read', () => {
      localStorage.setItem(DISMISSED_KEY, '{not json')
      renderCard([makeSuggestion()])
      expect(screen.getByText('Netflix')).toBeDefined()
    })
  })
})
