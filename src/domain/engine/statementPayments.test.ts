import { describe, expect, it } from 'vitest'
import type { Account, AccountStatement } from '../types'
import type { CashRow } from './cashReconciliation'
import { buildStatementPayments } from './statementPayments'

const accounts: Account[] = [
  { id: 1, name: 'Debit', kind: 'debit', settlement: 'immediate', active: true },
  { id: 2, name: 'Iberia Icon', kind: 'credit', settlement: 'deferred', active: true },
]

const cashRows: CashRow[] = [
  {
    month: '2026-06',
    incomeCents: 0,
    debitExpenseCents: 0,
    cardCharges: new Map([[2, { chargeCents: 137345, paid: true }]]),
    investmentsCents: 0,
    cashMovementCents: -137345,
    expectedCashCents: 0,
    actualCashCents: null,
    gapCents: null,
    carryoverGapCents: null,
    monthGapCents: null,
    unpaidLiabilityCents: 0,
  },
]

describe('buildStatementPayments', () => {
  it('builds a payment row when statement is paid with paidOn', () => {
    const statements: AccountStatement[] = [
      { accountId: 2, yearMonth: '2026-06', paid: true, paidOn: '2026-06-15' },
    ]
    const rows = buildStatementPayments(statements, cashRows, accounts, 1)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      kind: 'statement-payment',
      date: '2026-06-15',
      budgetMonth: '2026-06',
      amountCents: 137345,
      debitAccountId: 1,
      cardName: 'Iberia Icon',
    })
  })

  it('omits unpaid or missing paidOn statements', () => {
    const statements: AccountStatement[] = [
      { accountId: 2, yearMonth: '2026-06', paid: false },
      { accountId: 2, yearMonth: '2026-07', paid: true },
    ]
    expect(buildStatementPayments(statements, cashRows, accounts, 1)).toHaveLength(0)
  })
})
