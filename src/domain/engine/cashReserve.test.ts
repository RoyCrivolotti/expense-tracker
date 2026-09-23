import { describe, expect, it } from 'vitest'
import { averageMonthlySpendCents, cashReserve, checkinCashCents } from './cashReserve'
import { makeTransaction, makeWealthAccount, makeWealthCheckin } from '../../testing/factories'

const accounts = [
  makeWealthAccount({ id: 1, kind: 'investment' }),
  makeWealthAccount({ id: 2, kind: 'cash' }),
  makeWealthAccount({ id: 3, kind: 'cash' }),
]
const checkin = makeWealthCheckin({
  entries: [
    { accountId: 1, valueCents: 900_000_00 },
    { accountId: 2, valueCents: 8_000_00 },
    { accountId: 3, valueCents: 4_000_00 },
  ],
})

function spend(month: string, cents: number) {
  return makeTransaction({ budgetMonth: month, date: `${month}-10`, type: 'expense', amountCents: cents })
}

describe('checkinCashCents', () => {
  it('adds up the cash accounts only', () => {
    expect(checkinCashCents(checkin, accounts)).toBe(12_000_00)
  })
})

describe('averageMonthlySpendCents', () => {
  it('averages expenses over the months that have any, ignoring income and investing', () => {
    const txns = [
      spend('2026-06', 2_000_00),
      spend('2026-07', 4_000_00),
      makeTransaction({ budgetMonth: '2026-07', type: 'income', amountCents: 9_000_00 }),
      makeTransaction({ budgetMonth: '2026-07', type: 'investment', amountCents: 1_000_00 }),
    ]
    expect(averageMonthlySpendCents(txns)).toBe(3_000_00)
    expect(averageMonthlySpendCents([])).toBeNull()
  })

  it('looks back twelve months at most', () => {
    const txns = Array.from({ length: 14 }, (_, i) =>
      spend(`2025-${String(i + 1).padStart(2, '0')}`.replace('2025-13', '2026-01').replace('2025-14', '2026-02'), i < 2 ? 100_000_00 : 1_000_00),
    )
    expect(averageMonthlySpendCents(txns)).toBe(1_000_00)
  })
})

describe('cashReserve', () => {
  it('turns the cash balance into months of spending against the target', () => {
    const r = cashReserve(checkin, accounts, [spend('2026-06', 3_000_00), spend('2026-07', 3_000_00)], 6)!
    expect(r.cashCents).toBe(12_000_00)
    expect(r.monthlySpendCents).toBe(3_000_00)
    expect(r.monthsCovered).toBe(4)
    expect(r.targetMonths).toBe(6)
  })

  it('has no months to report without spending, and nothing at all without a cash account', () => {
    expect(cashReserve(checkin, accounts, [], 6)!.monthsCovered).toBeNull()
    expect(cashReserve(checkin, [accounts[0]!], [], 6)).toBeNull()
  })
})
