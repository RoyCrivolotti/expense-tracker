import { describe, expect, it } from 'vitest'
import type { Account, ExpenseSettings, Transaction } from '../types'
import { computeCashReconciliation } from './cashReconciliation'

const settings: ExpenseSettings = {
  openingCashCents: 100000,
  openingInvestmentCents: 0,
  liquidNetWorthCents: 0,
  defaultAccountId: null,
}

const accounts: Account[] = [
  { id: 1, name: 'Debit', kind: 'debit', settlement: 'immediate', active: true },
  { id: 2, name: 'Card', kind: 'credit', settlement: 'deferred', active: true },
]

function txn(partial: Partial<Transaction> & Pick<Transaction, 'budgetMonth' | 'type'>): Transaction {
  return {
    id: 1,
    date: `${partial.budgetMonth}-01`,
    description: partial.description ?? 'Test',
    accountId: partial.accountId ?? 1,
    categoryId: partial.categoryId ?? 1,
    amountCents: partial.amountCents ?? 1000,
    cancelled: partial.cancelled ?? false,
    status: partial.status ?? 'posted',
    ...partial,
  }
}

describe('computeCashReconciliation', () => {
  it('starts from opening cash and applies immediate debits in month order', () => {
    const rows = computeCashReconciliation(
      [
        txn({ budgetMonth: '2026-01', type: 'income', amountCents: 500000, accountId: 1 }),
        txn({ budgetMonth: '2026-01', type: 'expense', amountCents: 50000, accountId: 1 }),
      ],
      accounts,
      settings,
      [],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.expectedCashCents).toBe(550000)
    expect(rows[0]!.cashMovementCents).toBe(450000)
  })

  it('leaves deferred card charges out of cash until the statement is posted', () => {
    const rows = computeCashReconciliation(
      [
        txn({
          budgetMonth: '2026-01',
          type: 'expense',
          amountCents: 30000,
          accountId: 2,
          status: 'forecast',
        }),
      ],
      accounts,
      settings,
      [],
    )
    expect(rows[0]!.expectedCashCents).toBe(100000)
    expect(rows[0]!.unpaidLiabilityCents).toBe(30000)
  })

  it('subtracts paid deferred statements from expected cash', () => {
    const rows = computeCashReconciliation(
      [
        txn({
          budgetMonth: '2026-01',
          type: 'expense',
          amountCents: 30000,
          accountId: 2,
          status: 'posted',
        }),
      ],
      accounts,
      settings,
      [],
    )
    expect(rows[0]!.expectedCashCents).toBe(70000)
    expect(rows[0]!.unpaidLiabilityCents).toBe(0)
  })

  it('computes gap when actual cash is recorded', () => {
    const rows = computeCashReconciliation(
      [txn({ budgetMonth: '2026-01', type: 'income', amountCents: 100000, accountId: 1 })],
      accounts,
      settings,
      [{ yearMonth: '2026-01', actualCashCents: 210000 }],
    )
    expect(rows[0]!.actualCashCents).toBe(210000)
    expect(rows[0]!.gapCents).toBe(10000)
  })

  it('returns null gap when no actual cash is entered', () => {
    const rows = computeCashReconciliation([], accounts, settings, [])
    expect(rows).toHaveLength(0)
  })

  it('includes months that only have a cash actual recorded', () => {
    const rows = computeCashReconciliation([], accounts, settings, [
      { yearMonth: '2026-02', actualCashCents: 150000 },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]!.month).toBe('2026-02')
    expect(rows[0]!.gapCents).toBe(50000)
    expect(rows[0]!.carryoverGapCents).toBeNull()
    expect(rows[0]!.monthGapCents).toBe(50000)
  })

  it('splits gap into carryover and this-month drift', () => {
    const rows = computeCashReconciliation(
      [],
      accounts,
      settings,
      [
        { yearMonth: '2026-05', actualCashCents: 90000 },
        { yearMonth: '2026-06', actualCashCents: 85000 },
      ],
    )
    expect(rows).toHaveLength(2)
    expect(rows[0]!.gapCents).toBe(-10000)
    expect(rows[0]!.carryoverGapCents).toBeNull()
    expect(rows[0]!.monthGapCents).toBe(-10000)
    expect(rows[1]!.carryoverGapCents).toBe(-10000)
    expect(rows[1]!.monthGapCents).toBe(-5000)
    expect(rows[1]!.gapCents).toBe(-15000)
  })
})
