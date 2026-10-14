import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { RecurringSuggestion } from '../../engine'
import { MoneyFormatProvider } from '../hooks/MoneyFormatProvider'
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

function renderCard(suggestions: RecurringSuggestion[]) {
  return render(
    <MoneyFormatProvider currencyCode="EUR" numberLocale="en-US">
      <UpcomingCard suggestions={suggestions} lookup={lookup} onAdd={() => {}} />
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
})
