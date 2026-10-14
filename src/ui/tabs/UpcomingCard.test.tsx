import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { RecurringSuggestion } from '../../engine'
import { MoneyFormatProvider } from '../hooks/MoneyFormatProvider'
import type { TransactionSeed } from '../actions'
import type { Lookup } from '../format'
import { UpcomingCard } from './UpcomingCard'

vi.mock('../dates', () => ({ todayLocalIso: () => '2026-09-24' }))

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
    confidence: 1,
    occurrences: 6,
    leadDays: 1,
    ...overrides,
  }
}

function renderCard(
  suggestions: RecurringSuggestion[],
  { month = '2026-09', onAdd = () => {} }: { month?: string; onAdd?: (seed?: TransactionSeed) => void } = {},
) {
  return render(
    <MoneyFormatProvider currencyCode="EUR" numberLocale="en-US">
      <UpcomingCard suggestions={suggestions} month={month} lookup={lookup} onAdd={onAdd} />
    </MoneyFormatProvider>,
  )
}

describe('UpcomingCard', () => {
  it('shows a suggestion when predictedDate is today', () => {
    renderCard([makeSuggestion({ predictedDate: '2026-09-24' })])
    expect(screen.getByText('Netflix')).toBeDefined()
  })

  it('hides a suggestion when predictedDate is far in the future', () => {
    renderCard([makeSuggestion({ predictedDate: '2026-10-15' })])
    expect(screen.queryByText('Netflix')).toBeNull()
  })

  it('shows a suggestion when predictedDate is within leadDays ahead', () => {
    // predictedDate=Sep 27 is 3 days away; leadDays=5, so 3 ≤ 5 → visible
    renderCard([makeSuggestion({ predictedDate: '2026-09-27', leadDays: 5 })])
    expect(screen.getByText('Netflix')).toBeDefined()
  })

  it('hides a suggestion when predictedDate is beyond leadDays ahead', () => {
    // predictedDate=Sep 27 is 3 days away; leadDays=2, so 3 > 2 → hidden
    renderCard([makeSuggestion({ predictedDate: '2026-09-27', leadDays: 2 })])
    expect(screen.queryByText('Netflix')).toBeNull()
  })

  it('renders nothing when no suggestions are due', () => {
    const { container } = renderCard([makeSuggestion({ predictedDate: '2026-10-15' })])
    expect(container.firstChild).toBeNull()
  })

  describe('a charge for the month before the one on screen', () => {
    // 24 Sep with the October budget month on screen, as after the rollover.
    const previous = (overrides: Partial<RecurringSuggestion>) =>
      makeSuggestion({ description: 'Gym', predictedBudgetMonth: '2026-09', ...overrides })

    it('shows with the month it belongs to, and the current month does not', () => {
      renderCard(
        [
          previous({ predictedDate: '2026-09-20' }),
          makeSuggestion({ description: 'Rent', predictedDate: '2026-09-25', predictedBudgetMonth: '2026-10' }),
        ],
        { month: '2026-10' },
      )
      expect(screen.getByText('Gym')).toBeDefined()
      expect(screen.getByText('For Sep')).toBeDefined()
      expect(screen.getByText('Rent')).toBeDefined()
      expect(screen.getAllByText(/^For /)).toHaveLength(1)
    })

    it('stays for a week after its date and then goes', () => {
      renderCard([previous({ predictedDate: '2026-09-17' })], { month: '2026-10' })
      expect(screen.getByText('Gym')).toBeDefined()
    })

    it('is gone once it is more than a week overdue', () => {
      renderCard([previous({ predictedDate: '2026-09-16' })], { month: '2026-10' })
      expect(screen.queryByText('Gym')).toBeNull()
    })

    it('adds the transaction to its own budget month, on its own date', () => {
      const onAdd = vi.fn()
      renderCard([previous({ predictedDate: '2026-09-20' })], { month: '2026-10', onAdd })
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))
      expect(onAdd).toHaveBeenCalledWith(
        expect.objectContaining({ date: '2026-09-20', budgetMonth: '2026-09', description: 'Gym' }),
      )
    })
  })
})
