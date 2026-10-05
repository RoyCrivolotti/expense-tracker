import { describe, expect, it } from 'vitest'
import type { ExpenseSettings, Transaction } from '../types'
import { defaultExpenseSettings } from './defaults'
import type { CashRow } from './cashReconciliation'
import { balancesAtCost, cashBridge, monthCloseStatus } from './cashClose'

function row(partial: Partial<CashRow>): CashRow {
  return {
    month: '2026-02',
    incomeCents: 300000,
    debitExpenseCents: 120000,
    cardCharges: new Map([[2, { chargeCents: 30000, paid: true }]]),
    investmentsCents: 40000,
    cashMovementCents: 110000,
    expectedCashCents: 950000,
    actualCashCents: null,
    gapCents: null,
    carryoverGapCents: null,
    monthGapCents: null,
    unpaidLiabilityCents: 0,
    reconciled: false,
    ...partial,
  }
}

describe('monthCloseStatus', () => {
  it('maps the four states', () => {
    expect(monthCloseStatus(row({ actualCashCents: 949800, monthGapCents: -200 }))).toBe('counted')
    expect(monthCloseStatus(row({ actualCashCents: 940000, monthGapCents: -10000 }))).toBe('drift')
    expect(monthCloseStatus(row({}))).toBe('ready')
    expect(monthCloseStatus(row({ unpaidLiabilityCents: 5000 }))).toBe('waiting')
  })

  it('treats the tolerance as inclusive', () => {
    expect(monthCloseStatus(row({ actualCashCents: 1, monthGapCents: 500 }))).toBe('counted')
    expect(monthCloseStatus(row({ actualCashCents: 1, monthGapCents: 501 }))).toBe('drift')
  })
})

describe('cashBridge', () => {
  it('walks from opening cash to expected cash, and the walk adds up', () => {
    const segments = cashBridge(row({}))
    expect(segments.map((s) => s.key)).toEqual([
      'opening',
      'income',
      'debit',
      'cards',
      'invested',
      'expected',
    ])
    const opening = segments[0]!.cents
    const moves = segments.slice(1, -1).reduce((s, seg) => s + seg.cents, 0)
    expect(opening + moves).toBe(segments[segments.length - 1]!.cents)
  })

  it('leaves unpaid statements out of the walk', () => {
    const segments = cashBridge(
      row({ cardCharges: new Map([[2, { chargeCents: 30000, paid: false }]]) }),
    )
    expect(segments.find((s) => s.key === 'cards')?.cents).toBe(0)
  })
})

describe('balancesAtCost', () => {
  const settings: ExpenseSettings = {
    ...defaultExpenseSettings(),
    openingCashCents: 800000,
    openingInvestmentCents: 1200000,
  }
  const invest = (m: string, cents: number): Transaction => ({
    id: Math.random(),
    date: `${m}-03`,
    budgetMonth: m,
    description: 'Fund',
    accountId: 1,
    categoryId: 1,
    type: 'investment',
    amountCents: cents,
    cancelled: false,
    status: 'posted',
  })

  it('prefers the counted cash and totals contributions through the month', () => {
    const rows = [row({ month: '2026-01', expectedCashCents: 900000, actualCashCents: 898000 })]
    const b = balancesAtCost(rows, settings, [invest('2026-01', 40000), invest('2026-02', 40000)], '2026-01')
    expect(b.cashCents).toBe(898000)
    expect(b.investedAtCostCents).toBe(1200000 + 40000)
  })

  it('falls back to the opening balances before any row', () => {
    const b = balancesAtCost([], settings, [], '2026-01')
    expect(b.cashCents).toBe(800000)
    expect(b.investedAtCostCents).toBe(1200000)
  })
})
