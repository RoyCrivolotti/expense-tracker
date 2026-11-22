import { describe, expect, it } from 'vitest'
import { FIRST_PAYMENTS, showBudgetMonthLine, showDescriptionLine, showFirstPaymentLine } from './formTips'

describe('the first-payment line', () => {
  it('shows on a new payment while the account has none', () => {
    expect(showFirstPaymentLine(0, false)).toBe(true)
  })
  it('is gone once there is one payment, and never shows on an edit', () => {
    expect(showFirstPaymentLine(1, false)).toBe(false)
    expect(showFirstPaymentLine(0, true)).toBe(false)
  })
})

describe('the description line', () => {
  it('shows for the first ten payments and leaves at the tenth saved', () => {
    expect(showDescriptionLine(0, false)).toBe(true)
    expect(showDescriptionLine(FIRST_PAYMENTS - 1, false)).toBe(true)
    expect(showDescriptionLine(FIRST_PAYMENTS, false)).toBe(false)
    expect(showDescriptionLine(5000, false)).toBe(false)
  })
  it('does not show on an edit', () => {
    expect(showDescriptionLine(3, true)).toBe(false)
  })
})

describe('the budget month line', () => {
  it('shows only when the budget month is not the date’s month', () => {
    expect(showBudgetMonthLine(2, '2026-03-31', '2026-04', false)).toBe(true)
    expect(showBudgetMonthLine(2, '2026-03-31', '2026-03', false)).toBe(false)
    expect(showBudgetMonthLine(2, '2026-12-31', '2027-01', false)).toBe(true)
  })
  it('leaves after the first ten payments', () => {
    expect(showBudgetMonthLine(FIRST_PAYMENTS - 1, '2026-03-31', '2026-04', false)).toBe(true)
    expect(showBudgetMonthLine(FIRST_PAYMENTS, '2026-03-31', '2026-04', false)).toBe(false)
  })
  it('does not show on an edit, which keeps the month it has', () => {
    expect(showBudgetMonthLine(2, '2026-03-31', '2026-04', true)).toBe(false)
  })
})
