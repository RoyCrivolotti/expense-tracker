import { describe, expect, it } from 'vitest'
import { filterTransactions, latestTransactions, recentlyAdded } from './transactions'
import type { Transaction } from '../types'

function txn(
  id: number,
  date: string,
  createdAt?: string,
): Transaction {
  return {
    id,
    date,
    budgetMonth: date.slice(0, 7),
    description: `Txn ${id}`,
    accountId: 1,
    categoryId: 1,
    type: 'expense',
    amountCents: 100,
    cancelled: false,
    status: 'posted',
    ...(createdAt ? { createdAt } : {}),
  }
}

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

describe('latestTransactions', () => {
  it('returns newest by calendar date globally', () => {
    const rows = [txn(1, '2026-01-05'), txn(2, '2026-03-01'), txn(3, '2026-02-10')]
    expect(latestTransactions(rows, 2).map((t) => t.id)).toEqual([2, 3])
  })
})

describe('recentlyAdded', () => {
  it('ranks backdated rows by createdAt not transaction date', () => {
    const rows = [
      txn(1, '2026-06-20', '2026-06-01T10:00:00Z'),
      txn(2, '2026-06-01', '2026-06-20T15:00:00Z'),
    ]
    expect(recentlyAdded(rows, 1).map((t) => t.id)).toEqual([2])
    expect(latestTransactions(rows, 1).map((t) => t.id)).toEqual([1])
  })

  it('falls back to id when createdAt is missing', () => {
    const rows = [txn(1, '2026-01-01'), txn(2, '2026-01-01')]
    expect(recentlyAdded(rows).map((t) => t.id)).toEqual([2, 1])
  })
})
