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

describe('filterTransactions — flagId', () => {
  const rows = [
    { ...txn(1, '2026-06-01'), flagId: 7 },
    { ...txn(2, '2026-06-02'), flagId: 8 },
    txn(3, '2026-06-03'),
  ]

  it('narrows to one flag', () => {
    expect(filterTransactions(rows, { flagId: 7 }).map((t) => t.id)).toEqual([1])
  })

  it("'none' narrows to unflagged transactions", () => {
    expect(filterTransactions(rows, { flagId: 'none' }).map((t) => t.id)).toEqual([3])
  })

  it('returns everything when no flag filter is set', () => {
    expect(filterTransactions(rows, {})).toHaveLength(3)
  })
})

describe('filterTransactions — labelIds', () => {
  const rows = [
    { ...txn(1, '2026-06-01'), labelIds: [1] },
    { ...txn(2, '2026-06-02'), labelIds: [2] },
    { ...txn(3, '2026-06-03'), labelIds: [1, 2] },
    txn(4, '2026-06-04'),
  ]

  it('returns everything when no label filter is set', () => {
    expect(filterTransactions(rows, {})).toHaveLength(4)
  })

  it('returns everything when the label filter is an empty array', () => {
    expect(filterTransactions(rows, { labelIds: [] })).toHaveLength(4)
  })

  it('narrows to transactions carrying the one selected label', () => {
    expect(filterTransactions(rows, { labelIds: [1] }).map((t) => t.id)).toEqual([3, 1])
  })

  it('matches any selected label, not all of them (OR)', () => {
    expect(filterTransactions(rows, { labelIds: [1, 2] }).map((t) => t.id)).toEqual([3, 2, 1])
  })

  it('never matches a label-less transaction against a non-empty filter', () => {
    expect(filterTransactions(rows, { labelIds: [1, 2] }).map((t) => t.id)).not.toContain(4)
  })

  it('combines with the flag filter by AND, while labels themselves stay OR', () => {
    const mixed = [
      { ...txn(1, '2026-06-01'), flagId: 9, labelIds: [1] },
      { ...txn(2, '2026-06-02'), flagId: 9, labelIds: [2] },
      { ...txn(3, '2026-06-03'), flagId: 10, labelIds: [1] },
    ]
    expect(filterTransactions(mixed, { flagId: 9, labelIds: [1, 2] }).map((t) => t.id)).toEqual([2, 1])
  })
})
