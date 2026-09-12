import { describe, expect, it } from 'vitest'
import type { Account, Transaction } from '../types'
import { makeFlag } from '../../testing/factories'
import {
  buildSettlementDraft,
  dominantCategoryId,
  selectedTotalCents,
  settlementAccountId,
} from './claimSettlement'
import type { FlagGroup } from './flagGroups'
import { netSpendCents } from './transactions'

const WORK = makeFlag({ id: 1, name: 'Work travel' })

function account(id: number, overrides: Partial<Account> = {}): Account {
  return { id, name: `Account ${id}`, kind: 'debit', settlement: 'immediate', active: true, ...overrides }
}
const CARD = account(9, { kind: 'credit', settlement: 'deferred' })

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

describe('buildSettlementDraft', () => {
  it('offers every outstanding row, ticked, oldest first', () => {
    const draft = buildSettlementDraft(
      group([txn(2, { date: '2026-05-09' }), txn(1, { date: '2026-05-02' })]),
      [account(1)],
      1,
    )

    // Oldest first matches the claim document, which is what you read down
    // while deciding what the employer actually paid.
    expect(draft?.candidates.map((t) => t.id)).toEqual([1, 2])
    expect(draft?.selectedIds).toEqual([1, 2])
  })

  it('opens on the full claim, since covering all of it is the common case', () => {
    const draft = buildSettlementDraft(group([txn(1), txn(2)]), [account(1)], 1)

    expect(draft?.amountCents).toBe(20_000)
  })

  it('names the claim it settles', () => {
    expect(buildSettlementDraft(group([txn(1)]), [account(1)], 1)?.description).toBe(
      'Reimbursement — Work travel',
    )
  })

  it('refuses a claim with nothing outstanding', () => {
    // The total is already net of anything reimbursed, so this would open on
    // 0,00 € — which the sheet then refuses to record.
    const settled = group([txn(1), txn(2, { type: 'refund' })])

    expect(buildSettlementDraft(settled, [account(1)], 1)).toBeNull()
  })
})

describe('buildSettlementDraft — what can be selected', () => {
  it('offers expenses only, never a refund', () => {
    // A vendor refund already reduces what is owed and is not a line an
    // employer reimburses. Offering it let the selected total go negative, at
    // which point the sheet proposed recording a payment of minus six euros.
    const draft = buildSettlementDraft(
      group([txn(1, { amountCents: 10_000 }), txn(2, { amountCents: 4_000, type: 'refund' })]),
      [account(1)],
      1,
    )

    expect(draft?.candidates.map((t) => t.id)).toEqual([1])
    expect(draft?.amountCents).toBe(10_000)
  })

  it('refuses a claim whose only rows are refunds', () => {
    const draft = buildSettlementDraft(
      group([txn(1, { amountCents: 4_000, type: 'refund' }), txn(2, { amountCents: 10_000 })]),
      [account(1)],
      1,
    )

    expect(draft?.candidates).toHaveLength(1)
  })
})

describe('selectedTotalCents', () => {
  it('totals only the ticked rows', () => {
    const rows = [txn(1, { amountCents: 10_000 }), txn(2, { amountCents: 4_000 })]

    expect(selectedTotalCents(rows, [1])).toBe(10_000)
  })

  it('subtracts a ticked refund', () => {
    const rows = [txn(1, { amountCents: 10_000 }), txn(2, { amountCents: 4_000, type: 'refund' })]

    expect(selectedTotalCents(rows, [1, 2])).toBe(6_000)
  })

  it('is zero when nothing is ticked', () => {
    expect(selectedTotalCents([txn(1)], [])).toBe(0)
  })
})

describe('settlementAccountId', () => {
  it('never picks a deferred card, even when it is the default', () => {
    // On a deferred account the refund derives as `forecast`, and
    // cashReconciliation then books it as negative unpaid card liability rather
    // than cash in — leaving the gap this exists to close open.
    expect(settlementAccountId([CARD, account(2)], 9)).toBe(2)
  })

  it('honours the default account when it settles immediately', () => {
    expect(settlementAccountId([account(1), account(2)], 2)).toBe(2)
  })

  it('skips archived accounts', () => {
    expect(settlementAccountId([account(1, { active: false }), account(2)], 1)).toBe(2)
  })

  it('falls back to any active account when none settle immediately', () => {
    // Degraded rather than zero: the sheet still lets you fix it.
    expect(settlementAccountId([CARD], 9)).toBe(9)
  })
})

describe('dominantCategoryId', () => {
  it('picks the category the selection spent most in', () => {
    const rows = [
      txn(1, { categoryId: 3, amountCents: 5_000 }),
      txn(2, { categoryId: 7, amountCents: 40_000 }),
    ]

    expect(dominantCategoryId(rows)).toBe(7)
  })

  it('breaks a tie on the lowest id, so the same selection prefills the same way twice', () => {
    const rows = [
      txn(1, { categoryId: 7, amountCents: 10_000 }),
      txn(2, { categoryId: 3, amountCents: 10_000 }),
    ]

    expect(dominantCategoryId(rows)).toBe(3)
  })

  it('ignores refunds when weighing categories', () => {
    const rows = [
      txn(1, { categoryId: 3, amountCents: 30_000 }),
      txn(2, { categoryId: 7, amountCents: 20_000, type: 'refund' }),
      txn(3, { categoryId: 7, amountCents: 1_000 }),
    ]

    expect(dominantCategoryId(rows)).toBe(3)
  })
})
