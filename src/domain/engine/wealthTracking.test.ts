import { describe, expect, it } from 'vitest'
import type { GoalScenario, WealthAccount, WealthCheckin } from '../types'
import {
  checkinAssetsCents,
  checkinInvestedCents,
  checkinNetWorthCents,
  hasDebtEntries,
  latestCheckin,
  milestonesReached,
  planValueAtDate,
  planValueAtOffset,
  trackStatus,
  realToNominal,
  nominalToReal,
  yearOffsetFromDate,
} from './wealthTracking'
import { DEFAULT_INFLATION_RATE } from './projectionConstants'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeScenario(overrides: Partial<GoalScenario> = {}): GoalScenario {
  return {
    id: 1,
    name: 'Test',
    color: '#6366f1',
    sortOrder: 0,
    startInvestedCents: 10_000_000,
    monthlyContributionCents: 100_000,
    annualContributionGrowth: 0,
    expectedRealReturn: 0.07,
    horizonYears: 30,
    housePriceCents: 0,
    downPaymentFraction: 0,
    housePurchaseYear: null,
    transactionCostsCents: 0,
    mortgageTermYears: 0,
    mortgageRateAnnual: 0,
    houseAppreciationRate: 0.025,
    rentMonthlyCents: 0,
    annualSpendCents: 0,
    safeWithdrawalRate: 0.04,
    planStartDate: '2024-01-01',
    lifeEvents: [],
    isActive: false,
    ...overrides,
  }
}

function makeAccount(
  id: number,
  kind: WealthAccount['kind'],
  name = 'Account',
): WealthAccount {
  return { id, name, kind, sortOrder: 0, archived: false }
}

function makeCheckin(
  checkinDate: string,
  entries: Array<{ accountId: number; valueCents: number }>,
  id = 1,
): WealthCheckin {
  return { id, checkinDate, createdAt: '2024-01-01T00:00:00', entries }
}

// ─── yearOffsetFromDate ───────────────────────────────────────────────────────

describe('yearOffsetFromDate', () => {
  it('returns 0 for same date', () => {
    expect(yearOffsetFromDate('2024-01-01', '2024-01-01')).toBe(0)
  })

  it('returns ~1 for a year later', () => {
    const offset = yearOffsetFromDate('2024-01-01', '2025-01-01')
    expect(offset).toBeGreaterThan(0.99)
    expect(offset).toBeLessThan(1.01)
  })

  it('returns negative for a date before plan start', () => {
    const offset = yearOffsetFromDate('2025-01-01', '2024-07-01')
    expect(offset).toBeLessThan(0)
  })

  it('returns null for malformed dates', () => {
    expect(yearOffsetFromDate('not-a-date', '2024-01-01')).toBeNull()
    expect(yearOffsetFromDate('2024-01-01', 'nope')).toBeNull()
  })
})

// ─── planValueAtOffset ────────────────────────────────────────────────────────

describe('planValueAtOffset', () => {
  const points = [
    { year: 0, investedCents: 10_000_000 },
    { year: 1, investedCents: 11_900_000 },
    { year: 2, investedCents: 13_900_000 },
  ]

  it('returns year 0 value at offset 0', () => {
    expect(planValueAtOffset(points, 0)).toBe(10_000_000)
  })

  it('interpolates between year 0 and year 1 at offset 0.5', () => {
    const v = planValueAtOffset(points, 0.5)
    expect(v).toBeGreaterThan(10_000_000)
    expect(v).toBeLessThan(11_900_000)
  })

  it('returns null for empty points', () => {
    expect(planValueAtOffset([], 0.5)).toBeNull()
  })

  it('returns null when floor point is missing', () => {
    const sparse = [{ year: 2, investedCents: 13_900_000 }]
    expect(planValueAtOffset(sparse, 1)).toBeNull()
  })

  it('extrapolates backwards for negative offset', () => {
    const v = planValueAtOffset(points, -0.5)
    // Should be below year 0 value
    expect(v).toBeLessThan(10_000_000)
  })
})

// ─── planValueAtDate ──────────────────────────────────────────────────────────

describe('planValueAtDate', () => {
  it('returns null when scenario has no planStartDate', () => {
    const scenario = makeScenario({ planStartDate: null })
    expect(planValueAtDate(scenario, '2025-01-01', DEFAULT_INFLATION_RATE)).toBeNull()
  })

  it('returns startInvestedCents at plan start date', () => {
    const scenario = makeScenario({ planStartDate: '2024-01-01' })
    const v = planValueAtDate(scenario, '2024-01-01', DEFAULT_INFLATION_RATE)
    expect(v).toBe(10_000_000)
  })

  it('returns a value greater than start after one year', () => {
    const scenario = makeScenario({ planStartDate: '2024-01-01' })
    const v = planValueAtDate(scenario, '2025-01-01', DEFAULT_INFLATION_RATE)
    expect(v).toBeGreaterThan(10_000_000)
  })

  it('returns null for malformed date', () => {
    const scenario = makeScenario({ planStartDate: '2024-01-01' })
    expect(planValueAtDate(scenario, 'bad', DEFAULT_INFLATION_RATE)).toBeNull()
  })
})

// ─── checkinInvestedCents / checkinNetWorthCents ──────────────────────────────

describe('checkinInvestedCents', () => {
  const accounts = [
    makeAccount(1, 'investment', 'Broker'),
    makeAccount(2, 'cash', 'Wise'),
    makeAccount(3, 'debt', 'Mortgage'),
  ]

  it('sums only investment-kind accounts', () => {
    const checkin = makeCheckin('2024-06-01', [
      { accountId: 1, valueCents: 50_000_000 },
      { accountId: 2, valueCents: 10_000_000 },
      { accountId: 3, valueCents: 30_000_000 },
    ])
    expect(checkinInvestedCents(checkin, accounts)).toBe(50_000_000)
  })

  it('returns 0 when no investment accounts have entries', () => {
    const checkin = makeCheckin('2024-06-01', [{ accountId: 2, valueCents: 10_000_000 }])
    expect(checkinInvestedCents(checkin, accounts)).toBe(0)
  })
})

describe('checkinAssetsCents and hasDebtEntries', () => {
  const mixed = [
    makeAccount(1, 'investment'),
    makeAccount(2, 'cash'),
    makeAccount(3, 'debt'),
  ]

  it('adds up everything owned and leaves the debt out, unlike net worth', () => {
    const checkin = makeCheckin('2026-01-01', [
      { accountId: 1, valueCents: 50_000_00 },
      { accountId: 2, valueCents: 10_000_00 },
      { accountId: 3, valueCents: 40_000_00 },
      { accountId: 9, valueCents: 1_00 },
    ])
    expect(checkinAssetsCents(checkin, mixed)).toBe(60_000_00)
    expect(checkinNetWorthCents(checkin, mixed)).toBe(20_000_00)
  })

  it('reports debt only when a check-in actually carries a debt balance', () => {
    const noDebt = makeCheckin('2026-01-01', [{ accountId: 1, valueCents: 1 }])
    const paidOff = makeCheckin('2026-02-01', [{ accountId: 3, valueCents: 0 }])
    const owing = makeCheckin('2026-03-01', [{ accountId: 3, valueCents: 5 }])
    expect(hasDebtEntries([noDebt, paidOff], mixed)).toBe(false)
    expect(hasDebtEntries([noDebt, owing], mixed)).toBe(true)
    expect(hasDebtEntries([owing], [makeAccount(1, 'investment')])).toBe(false)
  })
})

describe('checkinNetWorthCents', () => {
  const accounts = [
    makeAccount(1, 'investment', 'Broker'),
    makeAccount(2, 'cash', 'Wise'),
    makeAccount(3, 'debt', 'Mortgage'),
    makeAccount(4, 'other_asset', 'Car'),
  ]

  it('subtracts debt accounts and sums the rest', () => {
    const checkin = makeCheckin('2024-06-01', [
      { accountId: 1, valueCents: 50_000_000 },
      { accountId: 2, valueCents: 10_000_000 },
      { accountId: 3, valueCents: 20_000_000 },
      { accountId: 4, valueCents: 5_000_000 },
    ])
    // 50 + 10 - 20 + 5 = 45
    expect(checkinNetWorthCents(checkin, accounts)).toBe(45_000_000)
  })
})

// ─── trackStatus ─────────────────────────────────────────────────────────────

describe('trackStatus', () => {
  const accounts = [makeAccount(1, 'investment', 'Broker')]

  it('returns null when scenario has no planStartDate', () => {
    const scenario = makeScenario({ planStartDate: null })
    const checkin = makeCheckin('2025-01-01', [{ accountId: 1, valueCents: 15_000_000 }])
    expect(trackStatus(checkin, scenario, accounts, DEFAULT_INFLATION_RATE)).toBeNull()
  })

  it('returns positive delta when actual > projected, in the plan\'s money', () => {
    const scenario = makeScenario({ planStartDate: '2024-01-01' })
    const projected = planValueAtDate(scenario, '2025-01-01', DEFAULT_INFLATION_RATE)!
    // A broker balance a year on is nominal; 5M ahead in today's money is a little more.
    const actual = realToNominal(projected + 5_000_000, '2024-01-01', '2025-01-01', DEFAULT_INFLATION_RATE)
    const checkin = makeCheckin('2025-01-01', [{ accountId: 1, valueCents: actual }])
    const status = trackStatus(checkin, scenario, accounts, DEFAULT_INFLATION_RATE)
    expect(status).not.toBeNull()
    expect(status!.actualInvestedCents).toBe(actual)
    expect(status!.actualRealInvestedCents).toBeCloseTo(projected + 5_000_000, -1)
    expect(status!.deltaCents).toBeCloseTo(5_000_000, -1)
    expect(status!.deltaMonths).toBeGreaterThan(0)
  })

  it('returns negative delta when actual < projected, and a nominal match reads as behind', () => {
    const scenario = makeScenario({ planStartDate: '2024-01-01' })
    const projected = planValueAtDate(scenario, '2025-01-01', DEFAULT_INFLATION_RATE)!
    const actual = realToNominal(projected - 3_000_000, '2024-01-01', '2025-01-01', DEFAULT_INFLATION_RATE)
    const status = trackStatus(makeCheckin('2025-01-01', [{ accountId: 1, valueCents: actual }]), scenario, accounts, DEFAULT_INFLATION_RATE)
    expect(status!.deltaCents).toBeCloseTo(-3_000_000, -1)
    expect(status!.deltaMonths).toBeLessThan(0)
    // The plan's figure is in today's money; a balance that only matches it nominally
    // has lost a year of inflation.
    const nominalMatch = trackStatus(makeCheckin('2025-01-01', [{ accountId: 1, valueCents: projected }]), scenario, accounts, DEFAULT_INFLATION_RATE)
    expect(nominalMatch!.deltaCents).toBeLessThan(0)
  })

  it('brings a check-in back at the inflation it is given, and reads the plan the same way', () => {
    const scenario = makeScenario({ planStartDate: '2024-01-01' })
    const rate = 0.05
    const projected = planValueAtDate(scenario, '2025-01-01', rate)!
    // A balance exactly on plan in the money of the day: one year of 5% on the plan's figure.
    const onPlan = realToNominal(projected, '2024-01-01', '2025-01-01', rate)
    const status = trackStatus(makeCheckin('2025-01-01', [{ accountId: 1, valueCents: onPlan }]), scenario, accounts, rate)
    expect(status!.deltaCents).toBeCloseTo(0, -1)
    // The same balance against a plan that assumes 2% is not on plan: it is a little ahead.
    const at2 = trackStatus(makeCheckin('2025-01-01', [{ accountId: 1, valueCents: onPlan }]), scenario, accounts, 0.02)
    expect(at2!.deltaCents).toBeGreaterThan(0)
  })

  it('converts between today\'s money and the money of a later day, and leaves the start alone', () => {
    expect(realToNominal(100_000_00, '2024-01-01', '2024-01-01', DEFAULT_INFLATION_RATE)).toBe(100_000_00)
    expect(nominalToReal(realToNominal(100_000_00, '2024-01-01', '2026-01-01', DEFAULT_INFLATION_RATE), '2024-01-01', '2026-01-01', DEFAULT_INFLATION_RATE)).toBe(100_000_00)
    expect(realToNominal(100_000_00, '2024-01-01', '2025-01-01', 0.05)).toBeCloseTo(105_000_00, -4)
    // A check-in before the plan start is not deflated into the future.
    expect(nominalToReal(100_000_00, '2024-01-01', '2023-01-01', DEFAULT_INFLATION_RATE)).toBe(100_000_00)
  })

  it('exposes projectedInvestedCents and actualInvestedCents', () => {
    const scenario = makeScenario({ planStartDate: '2024-01-01' })
    const checkin = makeCheckin('2024-01-01', [{ accountId: 1, valueCents: 10_000_000 }])
    const status = trackStatus(checkin, scenario, accounts, DEFAULT_INFLATION_RATE)
    expect(status!.projectedInvestedCents).toBe(10_000_000)
    expect(status!.actualInvestedCents).toBe(10_000_000)
    expect(status!.deltaCents).toBe(0)
  })
})

// ─── latestCheckin ────────────────────────────────────────────────────────────

describe('latestCheckin', () => {
  it('returns null for empty list', () => {
    expect(latestCheckin([])).toBeNull()
  })

  it('returns the checkin with the latest date', () => {
    const checkins = [
      makeCheckin('2024-01-01', [], 1),
      makeCheckin('2025-06-01', [], 2),
      makeCheckin('2024-12-31', [], 3),
    ]
    expect(latestCheckin(checkins)!.id).toBe(2)
  })
})

// ─── milestonesReached ────────────────────────────────────────────────────────

describe('milestonesReached', () => {
  const accounts = [makeAccount(1, 'investment', 'Broker'), makeAccount(2, 'cash', 'Wise')]
  const milestones = [
    { amountCents: 10_000_000, label: 'First' },
    { amountCents: 50_000_000, label: 'Second' },
  ]
  const invested = (date: string, cents: number, id: number) =>
    makeCheckin(date, [{ accountId: 1, valueCents: cents }], id)

  it('returns an empty map when there are no milestones', () => {
    expect(milestonesReached([], [invested('2024-06-01', 90_000_000, 1)], accounts).size).toBe(0)
  })

  it('returns an empty map when there are no check-ins', () => {
    expect(milestonesReached(milestones, [], accounts).size).toBe(0)
  })

  it('records the earliest check-in at or above each milestone', () => {
    const checkins = [
      invested('2024-01-01', 5_000_000, 1),
      invested('2024-06-01', 20_000_000, 2),
      invested('2025-01-01', 60_000_000, 3),
    ]
    const reached = milestonesReached(milestones, checkins, accounts)
    expect(reached.get(10_000_000)).toBe('2024-06-01')
    expect(reached.get(50_000_000)).toBe('2025-01-01')
  })

  it('treats a value exactly on the milestone as reached', () => {
    const reached = milestonesReached(milestones, [invested('2024-06-01', 10_000_000, 1)], accounts)
    expect(reached.get(10_000_000)).toBe('2024-06-01')
  })

  it('omits milestones no check-in ever reached', () => {
    const reached = milestonesReached(milestones, [invested('2024-06-01', 20_000_000, 1)], accounts)
    expect(reached.has(50_000_000)).toBe(false)
  })

  it('keeps the first date even when a later check-in also clears the milestone', () => {
    const checkins = [
      invested('2024-06-01', 20_000_000, 1),
      invested('2025-01-01', 30_000_000, 2),
    ]
    expect(milestonesReached(milestones, checkins, accounts).get(10_000_000)).toBe('2024-06-01')
  })

  it('keeps a milestone reached even if a later check-in falls back below it', () => {
    const checkins = [
      invested('2024-06-01', 20_000_000, 1),
      invested('2025-01-01', 5_000_000, 2),
    ]
    expect(milestonesReached(milestones, checkins, accounts).get(10_000_000)).toBe('2024-06-01')
  })

  it('reads dates in chronological order regardless of input order', () => {
    const checkins = [
      invested('2025-01-01', 60_000_000, 2),
      invested('2024-06-01', 20_000_000, 1),
    ]
    expect(milestonesReached(milestones, checkins, accounts).get(10_000_000)).toBe('2024-06-01')
  })

  it('measures the invested portfolio only, ignoring cash', () => {
    const checkin = makeCheckin(
      '2024-06-01',
      [
        { accountId: 1, valueCents: 5_000_000 },
        { accountId: 2, valueCents: 90_000_000 },
      ],
      1,
    )
    expect(milestonesReached(milestones, [checkin], accounts).size).toBe(0)
  })
})
