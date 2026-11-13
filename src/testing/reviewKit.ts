import type { RecommendationInfo } from '../data/recommendationsApi'
import type { ExpenseModel } from '../ui/useExpenseData'
import { buildExpenseModel } from '../ui/buildExpenseModel'
import { makeDataset, makeTransaction } from './factories'

/** A local time as an ISO instant, so a test reads the same in any time zone. */
export const localInstant = (y: number, m: number, d: number, h = 9, min = 41): string => new Date(y, m - 1, d, h, min).toISOString()

/** A recommendation for a known merchant on an ordinary mid-month morning, with anything overridden. Invented data. */
export function makeRecommendation(over: Partial<RecommendationInfo> = {}): RecommendationInfo {
  return {
    id: '0b0c0d0e-1111-4222-8333-444455556661',
    accountId: 1,
    amountCents: 1250,
    currency: 'EUR',
    localDate: '2026-11-10',
    occurredAt: localInstant(2026, 11, 10),
    createdAt: localInstant(2026, 11, 10, 9, 42),
    merchantRaw: 'CAFE EXAMPLE 0042',
    descriptionSuggested: null,
    suggestedType: 'expense',
    ...over,
  }
}

/** A model with one debit account, one card, two categories and two typed rows for "Cafe Example". */
export function makeReviewModel(): ExpenseModel {
  return buildExpenseModel(
    makeDataset({
      categories: [
        { id: 1, name: 'Eating out', monthlyBudgetCents: 0, sortOrder: 1, active: true },
        { id: 2, name: 'Groceries', monthlyBudgetCents: 0, sortOrder: 2, active: true },
        { id: 3, name: 'Old category', monthlyBudgetCents: 0, sortOrder: 3, active: false },
      ],
      accounts: [
        { id: 1, name: 'Main Debit', kind: 'debit', settlement: 'immediate', active: true },
        { id: 2, name: 'Travel Credit', kind: 'credit', settlement: 'deferred', active: true },
      ],
      transactions: [
        makeTransaction({ id: 1, description: 'Cafe Example', categoryId: 1, date: '2026-10-02', amountCents: 350 }),
        makeTransaction({ id: 2, description: 'Cafe Example', categoryId: 1, date: '2026-10-20', amountCents: 400 }),
        makeTransaction({ id: 3, description: 'Archive Shop', categoryId: 3, date: '2026-10-03' }),
        makeTransaction({ id: 4, description: 'Archive Shop', categoryId: 3, date: '2026-10-04' }),
        makeTransaction({ id: 5, description: 'Once Shop', categoryId: 2, date: '2026-10-05' }),
      ],
    }),
  )
}
