import { describe, expect, it, vi } from 'vitest'
import type { NewTransaction } from '../../data/dataSource'
import { makeActions } from '../../testing/makeActions'
import { makeTransaction } from '../../testing/factories'
import {
  ReimbursementSettleError,
  recordReimbursement,
  reimbursementFailureCopy,
} from './recordReimbursement'

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

describe('ReimbursementSettleError', () => {
  it('reports a clean rollback when the compensating delete succeeds', async () => {
    const actions = makeActions({
      createTransaction: vi.fn().mockResolvedValue({ id: 7 }),
      updateTransactions: vi.fn().mockRejectedValue(new Error('network down')),
      deleteTransaction: vi.fn().mockResolvedValue(undefined),
    })

    const err = await recordReimbursement(actions, payment, [1]).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(ReimbursementSettleError)
    expect((err as ReimbursementSettleError).rolledBack).toBe(true)
  })

  it('reports an unconfirmed rollback when the compensating delete also fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const actions = makeActions({
      createTransaction: vi.fn().mockResolvedValue({ id: 7 }),
      updateTransactions: vi.fn().mockRejectedValue(new Error('network down')),
      deleteTransaction: vi.fn().mockRejectedValue(new Error('delete failed')),
    })

    const err = await recordReimbursement(actions, payment, [1]).catch((e: unknown) => e)

    expect((err as ReimbursementSettleError).rolledBack).toBe(false)
    // The original cause still surfaces — the subclass must not mask it.
    expect((err as Error).message).toBe('network down')
    consoleError.mockRestore()
  })

  it('carries the settle error status through, so 409 can be told apart', async () => {
    const conflict = Object.assign(new Error('Already settled'), { status: 409 })
    const actions = makeActions({
      createTransaction: vi.fn().mockResolvedValue({ id: 7 }),
      updateTransactions: vi.fn().mockRejectedValue(conflict),
      deleteTransaction: vi.fn().mockResolvedValue(undefined),
    })

    const err = await recordReimbursement(actions, payment, [1]).catch((e: unknown) => e)

    expect((err as ReimbursementSettleError).status).toBe(409)
  })
})

describe('reimbursementFailureCopy', () => {
  it('never claims nothing was recorded when the rollback is unconfirmed', () => {
    const err = new ReimbursementSettleError(new Error('network down'), false)

    const copy = reimbursementFailureCopy(err)

    expect(copy).not.toMatch(/nothing was recorded/i)
    expect(copy).toMatch(/may still exist/i)
    expect(copy).toMatch(/Past reports/i)
  })

  it('does not tell the user to just try again on a conflict', () => {
    const conflict = new ReimbursementSettleError(
      Object.assign(new Error('Already settled'), { status: 409 }),
      true,
    )

    const copy = reimbursementFailureCopy(conflict)

    // Retrying the same selection fails identically, so "try again" would be wrong.
    expect(copy).not.toMatch(/try again/i)
    expect(copy).toMatch(/refresh/i)
  })

  it('keeps the plain message when the rollback was clean', () => {
    const err = new ReimbursementSettleError(new Error('network down'), true)

    expect(reimbursementFailureCopy(err)).toBe('network down. Nothing was recorded — try again.')
  })

  it('falls back for an error that never reached the settle step', () => {
    expect(reimbursementFailureCopy(new Error('offline'))).toBe(
      'offline. Nothing was recorded — try again.',
    )
  })
})
