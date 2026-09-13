import { describe, expect, it, vi } from 'vitest'
import type { NewTransaction } from '../../data/dataSource'
import { makeActions } from '../../testing/makeActions'
import { makeTransaction } from '../../testing/factories'
import { recordReimbursement } from './recordReimbursement'

const payment: NewTransaction = {
  date: '2026-06-14',
  budgetMonth: '2026-06',
  description: 'Reimbursement — Work travel',
  accountId: 1,
  categoryId: 3,
  type: 'refund',
  amountCents: 12_000,
  cancelled: false,
}

describe('recordReimbursement', () => {
  it('stamps the rows it covered with the payment that cleared them', async () => {
    const created = makeTransaction({ id: 99, type: 'refund' })
    const actions = makeActions({ createTransaction: vi.fn().mockResolvedValue(created) })

    await recordReimbursement(actions, payment, [1, 2])

    expect(actions.createTransaction).toHaveBeenCalledWith(payment)
    expect(actions.updateTransactions).toHaveBeenCalledWith([1, 2], { settledBy: 99 })
  })

  it('creates the payment without a flag, so it cannot subtract twice', () => {
    // The rows it settles leave the Flagged card on their own. A flagged refund
    // would then net against what is left, reading as over-paid by its own
    // settlement.
    expect(payment).not.toHaveProperty('flagId')
  })

  it('deletes the payment again when the rows cannot be stamped', async () => {
    // Otherwise a failed link leaves money in the books that reimburses nothing,
    // and the claim still showing as fully owed.
    const deleteTransaction = vi.fn().mockResolvedValue(undefined)
    const actions = makeActions({
      createTransaction: vi.fn().mockResolvedValue(makeTransaction({ id: 99 })),
      updateTransactions: vi.fn().mockRejectedValue(new Error('network down')),
      deleteTransaction,
    })

    await expect(recordReimbursement(actions, payment, [1, 2])).rejects.toThrow('network down')
    expect(deleteTransaction).toHaveBeenCalledWith(99)
  })

  it('surfaces the original failure even when the rollback also fails', async () => {
    const actions = makeActions({
      createTransaction: vi.fn().mockResolvedValue(makeTransaction({ id: 99 })),
      updateTransactions: vi.fn().mockRejectedValue(new Error('network down')),
      deleteTransaction: vi.fn().mockRejectedValue(new Error('also down')),
    })
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(recordReimbursement(actions, payment, [1, 2])).rejects.toThrow('network down')

    logged.mockRestore()
  })

  it('records a payment covering nothing without touching any row', async () => {
    const actions = makeActions({
      createTransaction: vi.fn().mockResolvedValue(makeTransaction({ id: 99 })),
    })

    await recordReimbursement(actions, payment, [])

    expect(actions.updateTransactions).not.toHaveBeenCalled()
  })
})
