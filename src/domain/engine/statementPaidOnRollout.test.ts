import { describe, expect, it } from 'vitest'
import type { Account, AccountStatement } from '../types'
import type { CashRow } from './cashReconciliation'
import { buildStatementPayments } from './statementPayments'
import { buildTransactionListRows } from './transactionListRows'

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

describe('statement paidOn rollout', () => {
  it('hides legacy paid rows until paidOn is stored', () => {
    const legacy: AccountStatement[] = [{ accountId: 2, yearMonth: '2026-06', paid: true }]
    expect(buildStatementPayments(legacy, cashRows, accounts, 1)).toHaveLength(0)

    const backfilled: AccountStatement[] = [
      { accountId: 2, yearMonth: '2026-06', paid: true, paidOn: '2026-07-15' },
    ]
    const rows = buildTransactionListRows(
      [],
      { month: '2026-07' },
      backfilled,
      cashRows,
      accounts,
      { defaultAccountId: 1 },
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.kind).toBe('statement-payment')
  })

  it('prefers a user-edited paidOn over backfilled values', () => {
    const statements: AccountStatement[] = [
      { accountId: 2, yearMonth: '2026-06', paid: true, paidOn: '2026-07-13' },
    ]
    const rows = buildStatementPayments(statements, cashRows, accounts, 1)
    expect(rows[0]?.date).toBe('2026-07-13')
  })
})
