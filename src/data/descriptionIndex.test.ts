import { describe, expect, it } from 'vitest'
import type { Transaction } from '../types'
import { buildDescriptionIndex, normalizeDescriptionKey } from './descriptionIndex'

function txn(
  partial: Partial<Transaction> & Pick<Transaction, 'id' | 'description' | 'date'>,
): Transaction {
  return {
    budgetMonth: '2026-01',
    accountId: 1,
    categoryId: 2,
    type: 'expense',
    amountCents: 100,
    cancelled: false,
    status: 'posted',
    ...partial,
  }
}

describe('normalizeDescriptionKey', () => {
  it('trims and lowercases', () => {
    expect(normalizeDescriptionKey('  Mercadona  ')).toBe('mercadona')
  })
})

describe('buildDescriptionIndex', () => {
  const transactions: Transaction[] = [
    txn({ id: 1, date: '2026-01-01', description: 'MERCADONA', categoryId: 10, accountId: 1 }),
    txn({ id: 2, date: '2026-02-01', description: 'Mercadona', categoryId: 20, accountId: 2 }),
    txn({ id: 3, date: '2026-01-15', description: 'Iberia', type: 'refund', categoryId: 30 }),
    txn({ id: 4, date: '2026-03-01', description: '   ', cancelled: false }),
    txn({ id: 5, date: '2026-03-02', description: 'Cancelled shop', cancelled: true }),
  ]

  const index = buildDescriptionIndex(transactions)

  it('uses most recent canonical label and template for duplicate keys', () => {
    const hit = index.resolve('mercadona')
    expect(hit?.label).toBe('Mercadona')
    expect(hit?.template).toEqual({ type: 'expense', categoryId: 20, accountId: 2 })
  })

  it('searches prefix case-insensitively and returns canonical casing', () => {
    expect(index.search('mer').map((s) => s.label)).toEqual(['Mercadona'])
  })

  it('excludes blank and cancelled descriptions', () => {
    expect(index.search('cancel')).toEqual([])
    expect(index.resolve('Cancelled shop')).toBeUndefined()
  })

  it('respects search limit', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      txn({ id: 100 + i, date: '2026-01-01', description: `Shop ${i}` }),
    )
    expect(buildDescriptionIndex(many).search('shop', 8)).toHaveLength(8)
  })
})
