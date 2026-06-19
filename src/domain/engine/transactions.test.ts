import { describe, expect, it } from 'vitest'
import { filterTransactions } from './transactions'
import type { Transaction } from '../types'

const sample: Transaction[] = [
  {
    id: 1,
    date: '2026-01-05',
    budgetMonth: '2026-01',
    description: 'A',
    accountId: 1,
    categoryId: 1,
    type: 'expense',
    amountCents: 100,
    cancelled: false,
    status: 'posted',
  },
  {
    id: 2,
    date: '2026-02-10',
    budgetMonth: '2026-02',
    description: 'B',
    accountId: 2,
    categoryId: 1,
    type: 'income',
    amountCents: 200,
    cancelled: false,
    status: 'posted',
  },
]

describe('filterTransactions date range', () => {
  it('filters by calendar date when dateFrom/dateTo set', () => {
    const out = filterTransactions(sample, { dateFrom: '2026-01-01', dateTo: '2026-01-31' })
    expect(out.map((t) => t.id)).toEqual([1])
  })

  it('filters by account and type', () => {
    const out = filterTransactions(sample, { accountId: 2, type: 'income' })
    expect(out.map((t) => t.id)).toEqual([2])
  })
})
