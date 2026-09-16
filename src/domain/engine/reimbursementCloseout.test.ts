import { describe, expect, it } from 'vitest'
import type { Flag, Transaction } from '../types'
import { groupTransactionsByFlag } from './flagGroups'
import { buildReimbursementDraft, settleIdsFor } from './reimbursementDraft'
import { buildSettledReport } from './expenseReport'

/**
 * The staging case that disagreed: a flag holding 108 € of expenses and a 20 € refund.
 * The claim document calls the refund "already reimbursed" and its outstanding 88 €, and
 * the Flagged card agrees. These pin the reimbursement flow to the same figure.
 */
const FLAG: Flag = {
  id: 1,
  name: 'Dummy',
  color: '#000',
  reimbursable: true,
  sortOrder: 0,
  active: true,
}

function row(id: number, type: Transaction['type'], amountCents: number): Transaction {
  return { ...unflagged(id, type, amountCents), flagId: 1 }
}

/** A row on no flag, which is how a recorded payment is stored. */
function unflagged(id: number, type: Transaction['type'], amountCents: number): Transaction {
  return {
    id,
    date: `2026-09-0${id}`,
    budgetMonth: '2026-09',
    description: `Row ${id}`,
    accountId: 1,
    categoryId: 1,
    type,
    amountCents,
    cancelled: false,
    status: 'posted',
  }
}

const EXPENSE_A = row(1, 'expense', 6_000)
const EXPENSE_B = row(2, 'expense', 4_800)
const CREDIT = row(3, 'refund', 2_000)
const ACCOUNTS = [{ id: 1, name: 'Cash', kind: 'debit' as const, settlement: 'immediate' as const, active: true }]

function draftFor(rows: Transaction[]) {
  const [group] = groupTransactionsByFlag(rows, [FLAG])
  if (!group) throw new Error('expected a flag group')
  const draft = buildReimbursementDraft(group, ACCOUNTS, 1)
  if (!draft) throw new Error('expected a draft')
  return { group, draft }
}

/** The rows as they stand once the payment's settle has landed. */
function afterSettling(rows: Transaction[], ids: number[], paymentId: number): Transaction[] {
  const settled = new Set(ids)
  return rows.map((t) => (settled.has(t.id) ? { ...t, settledBy: paymentId } : t))
}

describe('closing a claim that holds a refund', () => {
  const rows = [EXPENSE_A, EXPENSE_B, CREDIT]

  it('suggests the outstanding amount, not the gross of the lines', () => {
    const { group, draft } = draftFor(rows)

    expect(group.totalCents).toBe(8_800)
    expect(draft.amountCents).toBe(8_800)
  })

  it('still offers only the expenses as lines to tick', () => {
    const { draft } = draftFor(rows)

    expect(draft.candidates.map((t) => t.id)).toEqual([1, 2])
  })

  it('settles the refund along with the expenses when every line is covered', () => {
    const { draft } = draftFor(rows)

    expect(settleIdsFor(draft, [1, 2]).sort()).toEqual([1, 2, 3])
  })

  it('leaves nothing on the Flagged card afterwards', () => {
    // Before, the refund stayed behind on its own and the card showed the flag at -20 €.
    const { draft } = draftFor(rows)
    const after = afterSettling(rows, settleIdsFor(draft, [1, 2]), 99)

    expect(groupTransactionsByFlag(after, [FLAG])).toEqual([])
  })

  it('prints a claim whose outstanding is the payment that closed it', () => {
    const { draft } = draftFor(rows)
    const payment = unflagged(99, 'refund', draft.amountCents)
    const after = [...afterSettling(rows, settleIdsFor(draft, [1, 2]), 99), payment]

    const report = buildSettledReport(99, after, [FLAG], [])

    expect(report?.totalClaimedCents).toBe(10_800)
    expect(report?.creditedCents).toBe(2_000)
    expect(report?.outstandingCents).toBe(draft.amountCents)
  })
})

describe('covering only part of a claim that holds a refund', () => {
  const rows = [EXPENSE_A, EXPENSE_B, CREDIT]

  it('keeps the refund on the flag, where it goes on reducing what is left', () => {
    const { draft } = draftFor(rows)

    expect(settleIdsFor(draft, [1])).toEqual([1])
  })

  it('leaves the card showing what the sheet said was left', () => {
    const { draft } = draftFor(rows)
    const after = afterSettling(rows, settleIdsFor(draft, [1]), 99)
    const [group] = groupTransactionsByFlag(after, [FLAG])

    // 48 € of expense still open, less the 20 € already back.
    expect(group?.totalCents).toBe(2_800)
  })
})
