import { describe, expect, it } from 'vitest'
import type { Account, Transaction } from '../types'
import { makeFlag } from '../../testing/factories'
import { buildSettlementSeed } from './claimSettlement'
import type { FlagGroup } from './flagGroups'
import { netSpendCents } from './transactions'

const WORK = makeFlag({ id: 1, name: 'Work travel' })

function account(id: number, overrides: Partial<Account> = {}): Account {
  return { id, name: `Account ${id}`, kind: 'debit', settlement: 'immediate', active: true, ...overrides }
}

function txn(id: number, overrides: Partial<Transaction> = {}): Transaction {
  return {
    id,
    date: '2026-05-02',
    budgetMonth: '2026-05',
    description: `Txn ${id}`,
    accountId: 1,
    categoryId: 1,
    type: 'expense',
    amountCents: 10_000,
    cancelled: false,
    status: 'posted',
    flagId: 1,
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

const CARD = account(9, { kind: 'credit', settlement: 'deferred' })

describe('buildSettlementSeed', () => {
  it('prefills what is still outstanding, not what was originally claimed', () => {
    const seed = buildSettlementSeed(
      group([txn(1, { amountCents: 10_000 }), txn(2, { amountCents: 4_000, type: 'refund' })]),
      [account(1)],
      1,
    )

    expect(seed?.amountCents).toBe(6_000)
  })

  it('names the claim it settles', () => {
    const seed = buildSettlementSeed(group([txn(1)]), [account(1)], 1)

    expect(seed?.description).toBe('Reimbursement — Work travel')
  })

  it('refuses to prefill a claim with nothing outstanding', () => {
    // totalCents is already net of anything reimbursed, so a settled claim would
    // prefill 0,00 € — which the form then rejects for being zero.
    const settled = group([txn(1, { amountCents: 10_000 }), txn(2, { amountCents: 10_000, type: 'refund' })])

    expect(buildSettlementSeed(settled, [account(1)], 1)).toBeNull()
  })

  describe('the account the money lands in', () => {
    it('never picks a deferred card, even when it is the default', () => {
      // On a deferred account the refund derives as `forecast`, and from there
      // cashReconciliation books it as negative unpaid card liability rather
      // than cash in — leaving the actual-cash gap this exists to close open.
      const seed = buildSettlementSeed(group([txn(1)]), [CARD, account(2)], 9)

      expect(seed?.accountId).toBe(2)
    })

    it('honours the default account when it settles immediately', () => {
      const seed = buildSettlementSeed(group([txn(1)]), [account(1), account(2)], 2)

      expect(seed?.accountId).toBe(2)
    })

    it('skips archived accounts', () => {
      const seed = buildSettlementSeed(
        group([txn(1)]),
        [account(1, { active: false }), account(2)],
        1,
      )

      expect(seed?.accountId).toBe(2)
    })

    it('falls back to any active account when none settle immediately', () => {
      // Degraded rather than zero: the user can still fix it in the modal.
      const seed = buildSettlementSeed(group([txn(1)]), [CARD], 9)

      expect(seed?.accountId).toBe(9)
    })
  })

  describe('the category it is booked against', () => {
    it('picks the category the claim spent most in', () => {
      const seed = buildSettlementSeed(
        group([
          txn(1, { categoryId: 3, amountCents: 5_000 }),
          txn(2, { categoryId: 7, amountCents: 40_000 }),
          txn(3, { categoryId: 3, amountCents: 5_000 }),
        ]),
        [account(1)],
        1,
      )

      expect(seed?.categoryId).toBe(7)
    })

    it('breaks a tie on the lowest id, so the same claim prefills the same way twice', () => {
      const seed = buildSettlementSeed(
        group([
          txn(1, { categoryId: 7, amountCents: 10_000 }),
          txn(2, { categoryId: 3, amountCents: 10_000 }),
        ]),
        [account(1)],
        1,
      )

      expect(seed?.categoryId).toBe(3)
    })

    it('ignores refunds when weighing categories', () => {
      // A credit booked against one category should not make that category look
      // like where the spending happened.
      const seed = buildSettlementSeed(
        group([
          txn(1, { categoryId: 3, amountCents: 30_000 }),
          txn(2, { categoryId: 7, amountCents: 20_000, type: 'refund' }),
          txn(3, { categoryId: 7, amountCents: 1_000 }),
        ]),
        [account(1)],
        1,
      )

      expect(seed?.categoryId).toBe(3)
    })
  })
})
