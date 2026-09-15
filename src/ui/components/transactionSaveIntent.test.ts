import { describe, expect, it, vi } from 'vitest'
import type { NewTransaction } from '../../data/dataSource'
import { makeActions } from '../../testing/makeActions'
import { makeTransaction } from '../../testing/factories'
import { createTransactionWithIntent, updateTransactionWithIntent } from './transactionSaveIntent'

const input: NewTransaction = {
  date: '2026-01-15',
  budgetMonth: '2026-01',
  description: 'Iphone, Cetelam',
  accountId: 1,
  categoryId: 2,
  type: 'expense',
  amountCents: -5783,
  cancelled: false,
}

describe('createTransactionWithIntent', () => {
  it('creates a plan then links the transaction to it for a new plan intent', async () => {
    const createInstallmentPlan = vi.fn().mockResolvedValue({ id: 9 })
    const createTransaction = vi.fn().mockResolvedValue(undefined)
    const actions = makeActions({ createInstallmentPlan, createTransaction })

    await createTransactionWithIntent(actions, input, {
      kind: 'new',
      totalCount: 24,
      installmentIndex: 14,
    })

    expect(createInstallmentPlan).toHaveBeenCalledTimes(1)
    expect(createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ planId: 9, installmentIndex: 14 }),
    )
  })

  it('rolls back the created plan when linking the transaction fails', async () => {
    const createInstallmentPlan = vi.fn().mockResolvedValue({ id: 9 })
    const createTransaction = vi.fn().mockRejectedValue(new Error('network down'))
    const deleteInstallmentPlan = vi.fn().mockResolvedValue(undefined)
    const actions = makeActions({ createInstallmentPlan, createTransaction, deleteInstallmentPlan })

    await expect(
      createTransactionWithIntent(actions, input, {
        kind: 'new',
        totalCount: 24,
        installmentIndex: 14,
      }),
    ).rejects.toThrow('network down')

    expect(deleteInstallmentPlan).toHaveBeenCalledWith(9)
  })

  it('does not swallow the original error if the rollback delete also fails', async () => {
    const createInstallmentPlan = vi.fn().mockResolvedValue({ id: 9 })
    const createTransaction = vi.fn().mockRejectedValue(new Error('network down'))
    const deleteInstallmentPlan = vi.fn().mockRejectedValue(new Error('delete also failed'))
    const actions = makeActions({ createInstallmentPlan, createTransaction, deleteInstallmentPlan })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      createTransactionWithIntent(actions, input, {
        kind: 'new',
        totalCount: 24,
        installmentIndex: 14,
      }),
    ).rejects.toThrow('network down')

    consoleError.mockRestore()
  })

  it('splits an evenly-divisible total across installments for both the plan and the transaction', async () => {
    const createInstallmentPlan = vi.fn().mockResolvedValue({ id: 9 })
    const createTransaction = vi.fn().mockResolvedValue(undefined)
    const actions = makeActions({ createInstallmentPlan, createTransaction })

    await createTransactionWithIntent(
      actions,
      { ...input, amountCents: -54369 },
      { kind: 'new', totalCount: 3, installmentIndex: 1, splitTotal: true },
    )

    expect(createInstallmentPlan).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 18123 }))
    expect(createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: -18123, planId: 9, installmentIndex: 1 }),
    )
  })

  /**
   * A plan stores one amountCents and installments.ts emits it for every installment,
   * so the only thing that matters is whether the whole schedule adds up to what was
   * entered. It previously did not: Math.round made 100.00 over 7 collect 100.03.
   */
  it.each([
    { totalCents: 1000, count: 3, firstCents: 334, restCents: 333 },
    { totalCents: 10000, count: 7, firstCents: 1432, restCents: 1428 },
    { totalCents: 5000, count: 6, firstCents: 835, restCents: 833 },
    { totalCents: 9999, count: 3, firstCents: 3333, restCents: 3333 },
  ])(
    'splits $totalCents over $count installments without inventing or losing a cent',
    async ({ totalCents, count, firstCents, restCents }) => {
      const createInstallmentPlan = vi.fn().mockResolvedValue({ id: 9 })
      const createTransaction = vi.fn().mockResolvedValue(undefined)
      const actions = makeActions({ createInstallmentPlan, createTransaction })

      await createTransactionWithIntent(
        actions,
        { ...input, amountCents: totalCents },
        { kind: 'new', totalCount: count, installmentIndex: 1, splitTotal: true },
      )

      expect(createInstallmentPlan).toHaveBeenCalledWith(
        expect.objectContaining({ amountCents: restCents }),
      )
      expect(createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ amountCents: firstCents }),
      )
      // The property under test, stated directly: this installment plus the remaining
      // (count - 1) at the plan's stored amount must equal the entered total.
      expect(firstCents + restCents * (count - 1)).toBe(totalCents)
    },
  )

  it('leaves the remainder cents on the installment being recorded now', async () => {
    const createInstallmentPlan = vi.fn().mockResolvedValue({ id: 9 })
    const createTransaction = vi.fn().mockResolvedValue(undefined)
    const actions = makeActions({ createInstallmentPlan, createTransaction })

    await createTransactionWithIntent(
      actions,
      { ...input, amountCents: 1000 },
      { kind: 'new', totalCount: 3, installmentIndex: 1, splitTotal: true },
    )

    const planAmount = (createInstallmentPlan.mock.calls[0]?.[0] as { amountCents: number })
      .amountCents
    const txnAmount = (createTransaction.mock.calls[0]?.[0] as { amountCents: number }).amountCents
    expect(txnAmount - planAmount).toBe(1)
  })

  it('keeps the full amount per installment when splitTotal is not set', async () => {
    const createInstallmentPlan = vi.fn().mockResolvedValue({ id: 9 })
    const createTransaction = vi.fn().mockResolvedValue(undefined)
    const actions = makeActions({ createInstallmentPlan, createTransaction })

    await createTransactionWithIntent(actions, input, {
      kind: 'new',
      totalCount: 24,
      installmentIndex: 14,
    })

    expect(createInstallmentPlan).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 5783 }))
    expect(createTransaction).toHaveBeenCalledWith(expect.objectContaining({ amountCents: -5783 }))
  })

  it('links to an existing plan without creating a new one', async () => {
    const createInstallmentPlan = vi.fn()
    const createTransaction = vi.fn().mockResolvedValue(undefined)
    const actions = makeActions({ createInstallmentPlan, createTransaction })

    await createTransactionWithIntent(actions, input, { kind: 'link', planId: 3, installmentIndex: 5 })

    expect(createInstallmentPlan).not.toHaveBeenCalled()
    expect(createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ planId: 3, installmentIndex: 5 }),
    )
  })

  it('creates a plain transaction with no intent', async () => {
    const createTransaction = vi.fn().mockResolvedValue(undefined)
    const actions = makeActions({ createTransaction })

    await createTransactionWithIntent(actions, input)

    expect(createTransaction).toHaveBeenCalledWith(input)
  })
})

describe('updateTransactionWithIntent', () => {
  it('rolls back the created plan when updating the transaction fails', async () => {
    const createInstallmentPlan = vi.fn().mockResolvedValue({ id: 11 })
    const updateTransaction = vi.fn().mockRejectedValue(new Error('conflict'))
    const deleteInstallmentPlan = vi.fn().mockResolvedValue(undefined)
    const actions = makeActions({ createInstallmentPlan, updateTransaction, deleteInstallmentPlan })

    await expect(
      updateTransactionWithIntent(actions, 42, input, {
        kind: 'new',
        totalCount: 12,
        installmentIndex: 1,
      }),
    ).rejects.toThrow('conflict')

    expect(deleteInstallmentPlan).toHaveBeenCalledWith(11)
  })

  it('unlinks a transaction from its plan', async () => {
    const updateTransaction = vi.fn().mockResolvedValue(undefined)
    const actions = makeActions({ updateTransaction })

    await updateTransactionWithIntent(actions, 42, input, { kind: 'unlink' })

    expect(updateTransaction).toHaveBeenCalledWith(42, expect.objectContaining({ planId: null }))
  })
})

describe('createTransactionWithIntent — the created row', () => {
  it('resolves with the stored transaction, so receipts can target its id', async () => {
    const created = makeTransaction({ id: 42 })
    const actions = makeActions({ createTransaction: vi.fn().mockResolvedValue(created) })

    await expect(createTransactionWithIntent(actions, input)).resolves.toBe(created)
  })

  it('resolves with the stored transaction on the link-to-existing-plan path', async () => {
    const created = makeTransaction({ id: 43 })
    const actions = makeActions({ createTransaction: vi.fn().mockResolvedValue(created) })

    await expect(
      createTransactionWithIntent(actions, input, {
        kind: 'link',
        planId: 3,
        installmentIndex: 2,
      }),
    ).resolves.toBe(created)
  })

  it('resolves with the stored transaction on the new-plan path', async () => {
    const created = makeTransaction({ id: 44 })
    const actions = makeActions({
      createInstallmentPlan: vi.fn().mockResolvedValue({ id: 9 }),
      createTransaction: vi.fn().mockResolvedValue(created),
    })

    await expect(
      createTransactionWithIntent(actions, input, {
        kind: 'new',
        totalCount: 12,
        installmentIndex: 1,
        splitTotal: false,
      }),
    ).resolves.toBe(created)
  })

  it('still rolls the orphaned plan back when linking fails', async () => {
    // Guards the `return await` in createPlanAndLink: returning the promise
    // unawaited settles it outside the try, so this cleanup would never run and
    // a failed link would leave a plan with no payments behind it.
    const deleteInstallmentPlan = vi.fn().mockResolvedValue(undefined)
    const actions = makeActions({
      createInstallmentPlan: vi.fn().mockResolvedValue({ id: 9 }),
      createTransaction: vi.fn().mockRejectedValue(new Error('link failed')),
      deleteInstallmentPlan,
    })

    await expect(
      createTransactionWithIntent(actions, input, {
        kind: 'new',
        totalCount: 12,
        installmentIndex: 1,
        splitTotal: false,
      }),
    ).rejects.toThrow('link failed')
    expect(deleteInstallmentPlan).toHaveBeenCalledWith(9)
  })
})
