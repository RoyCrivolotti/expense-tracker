import type { RecommendationInfo } from '../data/recommendationsApi'
import { merchantKeyOf } from '../domain/capture/merchants'
import type { ExpenseModel } from '../ui/useExpenseData'
import { buildExpenseModel } from '../ui/buildExpenseModel'
import { makeDataset, makeTransaction } from './factories'

const pad = (n: number) => String(n).padStart(2, '0')

/** The phone's own clock as the Worker writes it (an hour ahead of UTC), the same in any zone the test runs in. */
export const pushAt = (
  y: number,
  m: number,
  d: number,
  h = 9,
  min = 41,
): string => `${y}-${pad(m)}-${pad(d)}T${pad(h)}:${pad(min)}:07+01:00`

/** When a push dated `pushAt(...)` reaches the server, as a UTC instant. */
export const arrivedAt = (
  y: number,
  m: number,
  d: number,
  h = 9,
  min = 41,
): string => new Date(Date.UTC(y, m - 1, d, h - 1, min, 8)).toISOString()

/** A recommendation for a known merchant on an ordinary mid-month morning, with anything overridden. Invented data. */
export function makeRecommendation(over: Partial<RecommendationInfo> = {}): RecommendationInfo {
  const rec = {
    id: '0b0c0d0e-1111-4222-8333-444455556661',
    accountId: 1,
    amountCents: 1250,
    currency: 'EUR',
    localDate: '2026-11-10',
    occurredAt: pushAt(2026, 11, 10),
    createdAt: arrivedAt(2026, 11, 10, 9, 42),
    merchantRaw: 'CAFE EXAMPLE 0042',
    descriptionSuggested: null,
    suggestedType: 'expense' as const,
    ...over,
  }
  // What the list says of the text, worked out as the server does, so a test that gives a whole message gets its flag.
  return { named: merchantKeyOf(rec.merchantRaw) !== null, ...rec }
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
        { id: 3, name: 'Archived Card', kind: 'credit', settlement: 'deferred', active: false },
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

/** Three monthly charges of one series, on the given day of Aug, Sep and Oct 2026, with ids from `firstId`. */
function monthly(
  firstId: number,
  day: number,
  over: Parameters<typeof makeTransaction>[0],
) {
  return ['08', '09', '10'].map((m, i) =>
    makeTransaction({
      id: firstId + i,
      date: `2026-${m}-${pad(day)}`,
      budgetMonth: `2026-${m}`,
      ...over,
    }),
  )
}

/**
 * `makeReviewModel` with monthly series waiting for their November charge: Video Stream (12,99 on the 10th, Main
 * Debit, Groceries), Gym (25,00 on the 12th, Travel Credit, Eating out), and two at 9,99 due the same week (Music Plan
 * on the 14th and Cloud Box on the 15th), and an investment, Index Plan (400,00 on the 20th, Main Debit). Invented data.
 */
export function makeSeriesModel(): ExpenseModel {
  const base = makeReviewModel().dataset
  return buildExpenseModel(
    makeDataset({
      categories: base.categories,
      accounts: base.accounts,
      transactions: [
        ...base.transactions,
        ...monthly(100, 10, { description: 'Video Stream', accountId: 1, categoryId: 2, amountCents: 1299 }),
        ...monthly(110, 12, { description: 'Gym', accountId: 2, categoryId: 1, amountCents: 2500 }),
        ...monthly(120, 14, { description: 'Music Plan', accountId: 1, categoryId: 2, amountCents: 999 }),
        ...monthly(130, 15, { description: 'Cloud Box', accountId: 1, categoryId: 2, amountCents: 999 }),
        ...monthly(140, 20, {
          description: 'Index Plan',
          accountId: 1,
          categoryId: 2,
          amountCents: 40000,
          type: 'investment',
        }),
      ],
    }),
  )
}
