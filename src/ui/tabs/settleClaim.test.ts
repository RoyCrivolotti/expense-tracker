import { describe, expect, it, vi } from 'vitest'
import type { Account, Transaction } from '../../types'
import { makeDataset, makeFlag } from '../../testing/factories'
import type { FlagGroup } from '../../domain/engine/flagGroups'
import { netSpendCents } from '../../domain/engine/transactions'
import { settleClaim } from './settleClaim'

const WORK = makeFlag({ id: 4, name: 'Work travel' })

const DEBIT: Account = {
  id: 1,
  name: 'Main Debit',
  kind: 'debit',
  settlement: 'immediate',
  active: true,
}
const CARD: Account = {
  id: 2,
  name: 'Travel Card',
  kind: 'credit',
  settlement: 'deferred',
  active: true,
}

function txn(id: number, overrides: Partial<Transaction> = {}): Transaction {
  return {
    id,
    date: '2026-05-02',
    budgetMonth: '2026-05',
    description: 'Hotel',
    accountId: 2,
    categoryId: 3,
    type: 'expense',
    amountCents: 10_000,
    cancelled: false,
    status: 'posted',
    flagId: 4,
    ...overrides,
  }
}

function group(transactions: Transaction[]): FlagGroup {
  return {
    flag: WORK,
    transactions,
    count: transactions.length,
    totalCents: netSpendCents(transactions),
  }
}

describe('settleClaim', () => {
  it('opens the add form as a refund carrying the claim’s flag', () => {
    const onAdd = vi.fn()

    settleClaim(group([txn(1)]), makeDataset({ accounts: [DEBIT, CARD] }), onAdd)

    // `refund`, not `income`: the money has to net against the spending rather
    // than read as earnings. And the flag has to travel with it, or the
    // settlement lands outside the group it settles.
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'refund',
        flagId: 4,
        amountCents: 10_000,
        description: 'Reimbursement — Work travel',
      }),
      expect.any(String),
    )
  })

  it('routes the money to a debit account even when the claim was paid on a card', () => {
    const onAdd = vi.fn()

    settleClaim(group([txn(1, { accountId: 2 })]), makeDataset({ accounts: [DEBIT, CARD] }), onAdd)

    expect(onAdd.mock.calls[0]![0]).toMatchObject({ accountId: 1 })
  })

  it('explains both surprising prefills in the modal subtitle', () => {
    const onAdd = vi.fn()

    settleClaim(group([txn(1)]), makeDataset({ accounts: [DEBIT, CARD] }), onAdd)

    // The credit lands in one category rather than split across the claim's,
    // and in the month it is paid rather than the month of the spending.
    const hint = onAdd.mock.calls[0]![1] as string
    expect(hint).toContain('Work travel')
    expect(hint).toContain('largest category')
    expect(hint).toContain("this month's budget")
  })

  it('does nothing when there is nothing left outstanding', () => {
    const onAdd = vi.fn()
    const settled = group([txn(1), txn(2, { type: 'refund' })])

    settleClaim(settled, makeDataset({ accounts: [DEBIT] }), onAdd)

    expect(onAdd).not.toHaveBeenCalled()
  })
})
