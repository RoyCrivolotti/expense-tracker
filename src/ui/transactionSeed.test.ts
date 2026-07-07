import { describe, it, expect, vi } from 'vitest'
import type { Transaction } from '../types'
import type { TransactionSeed } from './actions'
import {
  duplicateHint,
  isTransactionSeed,
  openAddModal,
  transactionToSeed,
} from './transactionSeed'

const validSeed: TransactionSeed = {
  description: 'Netflix',
  type: 'expense',
  accountId: 1,
  categoryId: 2,
  amountCents: 999,
  date: '2026-07-05',
  budgetMonth: '2026-07',
}

describe('isTransactionSeed', () => {
  it('accepts a valid seed', () => {
    expect(isTransactionSeed(validSeed)).toBe(true)
  })

  it('accepts a partial seed with date only', () => {
    expect(isTransactionSeed({ date: '2026-06-15', budgetMonth: '2026-06' })).toBe(true)
  })

  it('rejects a React click event shape', () => {
    expect(isTransactionSeed({ type: 'click', target: {}, preventDefault: () => {} })).toBe(false)
  })

  it('rejects undefined and null', () => {
    expect(isTransactionSeed(undefined)).toBe(false)
    expect(isTransactionSeed(null)).toBe(false)
  })
})

describe('openAddModal', () => {
  it('opens without seed when passed a click event', () => {
    const openModal = vi.fn()
    openAddModal(openModal, { type: 'click' })
    expect(openModal).toHaveBeenCalledWith({ mode: 'add' })
  })

  it('opens with seed when passed a valid seed', () => {
    const openModal = vi.fn()
    openAddModal(openModal, validSeed)
    expect(openModal).toHaveBeenCalledWith({ mode: 'add', seed: validSeed })
  })
})

describe('transactionToSeed', () => {
  const txn: Transaction = {
    id: 9,
    date: '2026-07-01',
    budgetMonth: '2026-07',
    description: 'Shop',
    accountId: 2,
    categoryId: 3,
    type: 'expense',
    amountCents: 1200,
    status: 'posted',
    cancelled: false,
  }

  it('copies editable fields without notes', () => {
    expect(transactionToSeed({ ...txn, notes: 'memo' })).toEqual({
      description: 'Shop',
      type: 'expense',
      accountId: 2,
      categoryId: 3,
      amountCents: 1200,
      date: '2026-07-01',
      budgetMonth: '2026-07',
    })
  })

  it('builds a duplicate hint from description', () => {
    expect(duplicateHint(txn)).toBe('Copied from Shop')
  })
})
