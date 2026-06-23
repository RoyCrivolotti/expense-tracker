import { describe, it, expect, vi } from 'vitest'
import type { TransactionSeed } from './actions'
import { isTransactionSeed, openAddModal } from './transactionSeed'

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
