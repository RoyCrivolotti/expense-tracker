import { describe, expect, it } from 'vitest'
import type { Flag, Transaction } from '../types'
import { groupTransactionsByFlag, summarizeFlagGroups } from './flagGroups'

function flag(overrides: Partial<Flag> & { id: number }): Flag {
  return { name: `Flag ${overrides.id}`, color: '#6366f1', sortOrder: 0, active: true, ...overrides }
}

let seq = 0
function txn(overrides: Partial<Transaction> = {}): Transaction {
  seq += 1
  return {
    id: seq,
    date: '2026-05-01',
    budgetMonth: '2026-05',
    description: 'Hotel',
    accountId: 1,
    categoryId: 1,
    type: 'expense',
    amountCents: 10_000,
    cancelled: false,
    status: 'posted',
    ...overrides,
  }
}

describe('groupTransactionsByFlag', () => {
  it('groups transactions under the flag they carry', () => {
    const flags = [flag({ id: 1, name: 'Work travel' })]
    const groups = groupTransactionsByFlag([txn({ flagId: 1 }), txn({ flagId: 1 })], flags)

    expect(groups).toHaveLength(1)
    expect(groups[0]?.flag.name).toBe('Work travel')
    expect(groups[0]?.count).toBe(2)
    expect(groups[0]?.totalCents).toBe(20_000)
  })

  it('ignores unflagged transactions', () => {
    expect(groupTransactionsByFlag([txn(), txn()], [flag({ id: 1 })])).toEqual([])
  })

  it('returns groups in flag order, not transaction order', () => {
    const flags = [flag({ id: 2, sortOrder: 0 }), flag({ id: 1, sortOrder: 1 })]
    const groups = groupTransactionsByFlag([txn({ flagId: 1 }), txn({ flagId: 2 })], flags)

    expect(groups.map((g) => g.flag.id)).toEqual([2, 1])
  })

  it('omits a flag nothing is tagged with, so the card stays a work list', () => {
    const groups = groupTransactionsByFlag([txn({ flagId: 1 })], [flag({ id: 1 }), flag({ id: 2 })])

    expect(groups.map((g) => g.flag.id)).toEqual([1])
  })

  it('drops a transaction whose flag no longer exists instead of throwing', () => {
    // Happens for real: a flag deleted in another tab, or a stale offline snapshot.
    const groups = groupTransactionsByFlag([txn({ flagId: 99 }), txn({ flagId: 1 })], [flag({ id: 1 })])

    expect(groups).toHaveLength(1)
    expect(groups[0]?.count).toBe(1)
  })

  it('excludes cancelled transactions from both count and total', () => {
    const groups = groupTransactionsByFlag(
      [txn({ flagId: 1 }), txn({ flagId: 1, status: 'cancelled', cancelled: true })],
      [flag({ id: 1 })],
    )

    expect(groups[0]?.count).toBe(1)
    expect(groups[0]?.totalCents).toBe(10_000)
  })

  it('subtracts refunds from the total, matching the tab’s net spend line', () => {
    const groups = groupTransactionsByFlag(
      [txn({ flagId: 1, amountCents: 10_000 }), txn({ flagId: 1, type: 'refund', amountCents: 4_000 })],
      [flag({ id: 1 })],
    )

    expect(groups[0]?.count).toBe(2)
    expect(groups[0]?.totalCents).toBe(6_000)
  })

  it('keeps income and investment out of the total but still counts them', () => {
    const groups = groupTransactionsByFlag(
      [txn({ flagId: 1, type: 'income', amountCents: 50_000 }), txn({ flagId: 1, amountCents: 1_000 })],
      [flag({ id: 1 })],
    )

    expect(groups[0]?.count).toBe(2)
    expect(groups[0]?.totalCents).toBe(1_000)
  })

  it('never puts one transaction in two groups', () => {
    const groups = groupTransactionsByFlag(
      [txn({ flagId: 1 }), txn({ flagId: 2 })],
      [flag({ id: 1 }), flag({ id: 2 })],
    )
    const ids = groups.flatMap((g) => g.transactions.map((t) => t.id))

    expect(new Set(ids).size).toBe(ids.length)
  })

  it('drops an archived flag from the card, which is how a claim is settled', () => {
    // types.ts promises archiving removes a flag from the Flagged summary while
    // keeping its links. That is the feature's only "done" — the transactions
    // keep their flagId and stay findable through the "archived" filter option.
    const groups = groupTransactionsByFlag([txn({ flagId: 1 })], [flag({ id: 1, active: false })])

    expect(groups).toEqual([])
  })
})

describe('summarizeFlagGroups', () => {
  it('rolls every group up for the collapsed header', () => {
    const groups = groupTransactionsByFlag(
      [txn({ flagId: 1, amountCents: 2_500 }), txn({ flagId: 2, amountCents: 1_500 })],
      [flag({ id: 1 }), flag({ id: 2 })],
    )

    expect(summarizeFlagGroups(groups)).toEqual({ count: 2, totalCents: 4_000 })
  })

  it('is zero for no groups', () => {
    expect(summarizeFlagGroups([])).toEqual({ count: 0, totalCents: 0 })
  })
})
