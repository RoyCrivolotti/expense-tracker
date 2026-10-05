import type { CashRow } from '../engine'

export function makeCashRow(partial: Partial<CashRow> = {}): CashRow {
  return {
    month: '2026-02',
    incomeCents: 0,
    debitExpenseCents: 0,
    cardCharges: new Map(),
    investmentsCents: 0,
    cashMovementCents: 0,
    expectedCashCents: 0,
    actualCashCents: null,
    gapCents: null,
    carryoverGapCents: null,
    monthGapCents: null,
    unpaidLiabilityCents: 0,
    reconciled: false,
    ...partial,
  }
}
