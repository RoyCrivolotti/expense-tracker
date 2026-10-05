import { describe, expect, it } from 'vitest'
import { computeSignals, MAX_SIGNALS } from './analyticsSignals'
import { makeCashRow as cashRow } from '../../testing/cashRow'
import type { Mover } from './movers'
import type { SpendingPace } from './spendingPace'

function pace(partial: Partial<SpendingPace> = {}): SpendingPace {
  return {
    open: true,
    dayOfMonth: 10,
    daysInMonth: 30,
    flexibleSpentCents: 20000,
    fixedSpentCents: 100000,
    flexibleBudgetCents: 45000,
    shouldBeTodayCents: 15000,
    projectedCents: 60000,
    lastMonthSameDayCents: 18000,
    ...partial,
  }
}

function mover(partial: Partial<Mover>): Mover {
  return { categoryId: 1, name: 'Groceries', currentCents: 0, baselineCents: 0, deltaCents: 0, ...partial }
}

describe('computeSignals', () => {
  it('warns when the open month projects over its flexible budget', () => {
    const signals = computeSignals({ pace: pace(), movers: [], cashRows: [] })
    expect(signals[0]).toMatchObject({ kind: 'pace', tone: 'warn', projectedCents: 60000 })
  })

  it('says a closed month nothing about pace', () => {
    const signals = computeSignals({ pace: pace({ open: false }), movers: [], cashRows: [] })
    expect(signals.find((s) => s.kind === 'pace')).toBeUndefined()
  })

  it('holds its tongue in the first days of the month', () => {
    // One grocery shop on day 2 extrapolates to a month of them — not a signal.
    const early = pace({ dayOfMonth: 2, projectedCents: 300000 })
    const signals = computeSignals({ pace: early, movers: [], cashRows: [] })
    expect(signals.find((s) => s.kind === 'pace')).toBeUndefined()
  })

  it('surfaces a mover only past the noise thresholds', () => {
    const quiet = mover({ baselineCents: 2000, currentCents: 9000, deltaCents: 7000 })
    const small = mover({ baselineCents: 50000, currentCents: 55000, deltaCents: 5000 })
    const real = mover({ categoryId: 3, name: 'Dining', baselineCents: 10000, currentCents: 16000, deltaCents: 6000 })
    const signals = computeSignals({ pace: pace({ open: false }), movers: [quiet, small, real], cashRows: [] })
    expect(signals[0]).toMatchObject({ kind: 'mover', categoryId: 3, pct: 60, tone: 'warn' })
  })

  it('points at the newest month whose statements are paid but cash is uncounted', () => {
    // January is also uncounted — likely from before counting began. Pointing
    // at it forever would make the banner permanent, so the newest wins.
    const rows = [
      cashRow({ month: '2026-01' }),
      cashRow({ month: '2026-02' }),
      cashRow({ month: '2026-03', unpaidLiabilityCents: 4000 }),
    ]
    const signals = computeSignals({ pace: pace({ open: false }), movers: [], cashRows: rows })
    expect(signals[0]).toMatchObject({ kind: 'cashReady', month: '2026-02' })
  })

  it('never calls the month under way ready to count', () => {
    const rows = [cashRow({ month: '2026-02' }), cashRow({ month: '2026-03' })]
    const signals = computeSignals({
      pace: pace({ open: false }),
      movers: [],
      cashRows: rows,
      openMonth: '2026-03',
    })
    expect(signals[0]).toMatchObject({ kind: 'cashReady', month: '2026-02' })
  })

  it('names a month with no card activity too, as the Cash banner does', () => {
    const rows = [cashRow({ month: '2026-02', cardCharges: new Map() })]
    const signals = computeSignals({ pace: pace({ open: false }), movers: [], cashRows: rows, openMonth: '2026-03' })
    expect(signals[0]).toMatchObject({ kind: 'cashReady', month: '2026-02' })
  })

  it('never exceeds the cap', () => {
    const signals = computeSignals({
      pace: pace(),
      movers: [mover({ baselineCents: 10000, currentCents: 20000, deltaCents: 10000 })],
      cashRows: [cashRow({})],
    })
    expect(signals.length).toBeLessThanOrEqual(MAX_SIGNALS)
    expect(signals.map((s) => s.kind)).toEqual(['pace', 'mover', 'cashReady'])
  })
})
