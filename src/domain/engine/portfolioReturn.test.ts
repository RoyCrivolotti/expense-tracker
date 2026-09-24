import { describe, expect, it } from 'vitest'
import { portfolioReturn } from './portfolioReturn'
import { makeTransaction, makeWealthAccount, makeWealthCheckin } from '../../testing/factories'

const accounts = [makeWealthAccount({ id: 1, kind: 'investment' }), makeWealthAccount({ id: 2, kind: 'cash' })]

function checkin(id: number, date: string, invested: number, cash = 0) {
  return makeWealthCheckin({
    id,
    checkinDate: date,
    entries: [
      { accountId: 1, valueCents: invested },
      { accountId: 2, valueCents: cash },
    ],
  })
}

function contribution(date: string, amountCents: number) {
  return makeTransaction({ date, budgetMonth: date.slice(0, 7), type: 'investment', amountCents })
}

describe('portfolioReturn', () => {
  it('needs two check-ins at least a month apart', () => {
    expect(portfolioReturn([checkin(1, '2026-01-01', 100)], accounts, [])).toBeNull()
    expect(
      portfolioReturn([checkin(1, '2026-01-01', 100), checkin(2, '2026-01-20', 110)], accounts, []),
    ).toBeNull()
  })

  it('is the plain growth when nothing was added', () => {
    const r = portfolioReturn(
      [checkin(1, '2025-01-01', 100_000_00), checkin(2, '2026-01-01', 110_000_00)],
      accounts,
      [],
    )!
    expect(r.periodReturn).toBeCloseTo(0.1, 6)
    expect(r.annualised).toBeCloseTo(0.1, 3)
    expect(r.contributionsCents).toBe(0)
  })

  it('takes contributions out, weighted by how long they were in', () => {
    // 100k grew to 110k, but 10k went in halfway: no return at all.
    const r = portfolioReturn(
      [checkin(1, '2025-01-01', 100_000_00), checkin(2, '2026-01-01', 110_000_00)],
      accounts,
      [contribution('2025-07-02', 10_000_00)],
    )!
    expect(r.periodReturn).toBeCloseTo(0, 6)
    expect(r.contributionsCents).toBe(10_000_00)
  })

  it('ignores cash balances, cancelled and forecast flows, and flows outside the period', () => {
    const r = portfolioReturn(
      [checkin(1, '2025-01-01', 100_000_00, 50_000_00), checkin(2, '2026-01-01', 110_000_00, 1_00)],
      accounts,
      [
        makeTransaction({ date: '2025-06-01', type: 'investment', amountCents: 5_000_00, status: 'cancelled', cancelled: true }),
        makeTransaction({ date: '2025-06-01', type: 'investment', amountCents: 5_000_00, status: 'forecast' }),
        contribution('2024-12-31', 5_000_00),
        contribution('2026-01-02', 5_000_00),
      ],
    )!
    expect(r.periodReturn).toBeCloseTo(0.1, 6)
  })

  it('does not annualise less than a year, and compounds more than one', () => {
    const half = portfolioReturn(
      [checkin(1, '2026-01-01', 100_000_00), checkin(2, '2026-07-01', 105_000_00)],
      accounts,
      [],
    )!
    expect(half.annualised).toBeNull()
    expect(half.periodReturn).toBeCloseTo(0.05, 6)

    const two = portfolioReturn(
      [checkin(1, '2024-01-01', 100_000_00), checkin(2, '2026-01-01', 121_000_00)],
      accounts,
      [],
    )!
    expect(two.annualised).toBeCloseTo(0.1, 2)
  })

  it('gives up when there was nothing invested to earn on', () => {
    expect(
      portfolioReturn([checkin(1, '2025-01-01', 0), checkin(2, '2026-01-01', 0)], accounts, []),
    ).toBeNull()
    // Money appeared that no transaction accounts for: nothing honest can be said.
    expect(
      portfolioReturn([checkin(1, '2025-01-01', 0), checkin(2, '2026-01-01', 50_000_00)], accounts, []),
    ).toBeNull()
  })

  it('chains the stretches between check-ins', () => {
    // Up 10%, then down 5%: one unit left in from the start is worth 1.1 × 0.95.
    const r = portfolioReturn(
      [
        checkin(1, '2025-01-01', 100_000_00),
        checkin(2, '2025-07-01', 110_000_00),
        checkin(3, '2026-01-01', 104_500_00),
      ],
      accounts,
      [],
    )!
    expect(r.periodReturn).toBeCloseTo(1.1 * 0.95 - 1, 6)
    expect(r.periods).toBe(2)
  })

  it('is not swayed by when the money went in, unlike a single-period figure', () => {
    // The portfolio halved, then a large contribution landed and the market went flat.
    // Time-weighted that is −50%; measured start to end in one go it would read about
    // −33%, because the late money dilutes the loss.
    const r = portfolioReturn(
      [
        checkin(1, '2025-01-01', 100_000_00),
        checkin(2, '2025-07-01', 50_000_00),
        checkin(3, '2026-01-01', 150_000_00),
      ],
      accounts,
      [contribution('2025-07-02', 100_000_00)],
    )!
    expect(r.periodReturn).toBeCloseTo(-0.5, 6)
    expect(r.contributionsCents).toBe(100_000_00)
  })

  it('treats a negative investment as money taken back out', () => {
    // 100k, 50k sold to cash halfway, 50k left: no return, not a 50% loss.
    const r = portfolioReturn(
      [checkin(1, '2025-01-01', 100_000_00), checkin(2, '2026-01-01', 50_000_00)],
      accounts,
      [contribution('2025-07-02', -50_000_00)],
    )!
    expect(r.periodReturn).toBeCloseTo(0, 6)
    expect(r.contributionsCents).toBe(-50_000_00)
  })

  it('skips the stretches before the portfolio opened', () => {
    const r = portfolioReturn(
      [
        checkin(1, '2025-01-01', 0),
        checkin(2, '2025-04-01', 0),
        checkin(3, '2026-01-01', 110_000_00),
      ],
      accounts,
      [contribution('2025-04-02', 100_000_00)],
    )!
    expect(r.periods).toBe(1)
    expect(r.periodReturn).toBeCloseTo(0.1, 2)
    // The period starts where the money did, so the yearly rate is not spread over the
    // empty months before it.
    expect(r.startDate).toBe('2025-04-01')
    expect(r.annualised).toBeNull()
  })
})
