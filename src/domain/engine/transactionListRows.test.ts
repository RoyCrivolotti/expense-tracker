import { describe, expect, it } from 'vitest'
import type { Account, AccountStatement, Transaction } from '../types'
import type { CashRow } from './cashReconciliation'
import { buildTransactionListRows, groupListRowsByDay } from './transactionListRows'

const accounts: Account[] = [
  { id: 1, name: 'Debit', kind: 'debit', settlement: 'immediate', active: true },
  { id: 2, name: 'Card', kind: 'credit', settlement: 'deferred', active: true },
]

function txn(partial: Partial<Transaction> & Pick<Transaction, 'budgetMonth'>): Transaction {
  return {
    id: partial.id ?? 1,
    date: partial.date ?? `${partial.budgetMonth}-02`,
    description: partial.description ?? 'Coffee',
    accountId: partial.accountId ?? 1,
    categoryId: 1,
    type: partial.type ?? 'expense',
    amountCents: partial.amountCents ?? 500,
    cancelled: false,
    status: 'posted',
    ...partial,
  }
}

const cashRows: CashRow[] = [
  {
    month: '2026-06',
    incomeCents: 0,
    debitExpenseCents: 500,
    cardCharges: new Map([[2, { chargeCents: 30000, paid: true }]]),
    investmentsCents: 0,
    cashMovementCents: -30500,
    expectedCashCents: 0,
    actualCashCents: null,
    gapCents: null,
    carryoverGapCents: null,
    monthGapCents: null,
    unpaidLiabilityCents: 0,
    reconciled: false,
  },
]

describe('buildTransactionListRows', () => {
  it('merges transactions with paid statement rows for the budget month', () => {
    const statements: AccountStatement[] = [
      { accountId: 2, yearMonth: '2026-06', paid: true, paidOn: '2026-06-15' },
    ]
    const rows = buildTransactionListRows(
      [txn({ budgetMonth: '2026-06', id: 10 })],
      { month: '2026-06' },
      statements,
      cashRows,
      accounts,
      { defaultAccountId: 1 },
    )
    expect(rows).toHaveLength(2)
    expect(rows.some((r) => r.kind === 'statement-payment')).toBe(true)
  })

  it('hides statement payment when toggled due', () => {
    const rows = buildTransactionListRows(
      [],
      { month: '2026-06' },
      [{ accountId: 2, yearMonth: '2026-06', paid: false }],
      cashRows,
      accounts,
      { defaultAccountId: 1 },
    )
    expect(rows).toHaveLength(0)
  })

  it('shows payment in paidOn calendar month even when budget month differs', () => {
    const mayCashRows: CashRow[] = [
      {
        month: '2026-05',
        incomeCents: 0,
        debitExpenseCents: 500,
        cardCharges: new Map([[2, { chargeCents: 30000, paid: true }]]),
        investmentsCents: 0,
        cashMovementCents: -30500,
        expectedCashCents: 0,
        actualCashCents: null,
        gapCents: null,
        carryoverGapCents: null,
        monthGapCents: null,
        unpaidLiabilityCents: 0,
        reconciled: false,
      },
    ]
    const statements: AccountStatement[] = [
      { accountId: 2, yearMonth: '2026-05', paid: true, paidOn: '2026-07-15' },
    ]
    const rows = buildTransactionListRows(
      [],
      { month: '2026-07' },
      statements,
      mayCashRows,
      accounts,
      { defaultAccountId: 1 },
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.kind).toBe('statement-payment')
  })

  it('shows payment when filtering by deferred card account', () => {
    const statements: AccountStatement[] = [
      { accountId: 2, yearMonth: '2026-06', paid: true, paidOn: '2026-06-15' },
    ]
    const rows = buildTransactionListRows(
      [],
      { month: '2026-06', accountId: 2 },
      statements,
      cashRows,
      accounts,
      { defaultAccountId: 1 },
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.kind).toBe('statement-payment')
  })

  it('groups statement payments with same-day transactions', () => {
    const statements: AccountStatement[] = [
      { accountId: 2, yearMonth: '2026-06', paid: true, paidOn: '2026-06-15' },
    ]
    const rows = buildTransactionListRows(
      [txn({ budgetMonth: '2026-06', id: 10, date: '2026-06-15' })],
      { month: '2026-06' },
      statements,
      cashRows,
      accounts,
      { defaultAccountId: 1 },
    )
    expect(rows).toHaveLength(2)
    const groups = groupListRowsByDay(rows)
    expect(groups).toHaveLength(1)
    expect(groups[0]?.date).toBe('2026-06-15')
    expect(groups[0]?.rows.map((r) => r.kind)).toEqual(['transaction', 'statement-payment'])
  })

  it('hides budget-month settlement until paidOn falls in the filtered month', () => {
    const statements: AccountStatement[] = [
      { accountId: 2, yearMonth: '2026-06', paid: true, paidOn: '2026-07-15' },
    ]
    const juneRows = buildTransactionListRows(
      [],
      { month: '2026-06' },
      statements,
      cashRows,
      accounts,
      { defaultAccountId: 1 },
    )
    expect(juneRows).toHaveLength(0)

    const julyRows = buildTransactionListRows(
      [],
      { month: '2026-07' },
      statements,
      cashRows,
      accounts,
      { defaultAccountId: 1 },
    )
    expect(julyRows).toHaveLength(1)
    expect(julyRows[0]?.kind).toBe('statement-payment')
    expect(groupListRowsByDay(julyRows)[0]?.date).toBe('2026-07-15')
  })
})
