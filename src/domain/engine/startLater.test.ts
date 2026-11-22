import { describe, expect, it } from 'vitest'
import { randomPlans, samplePlan, SAMPLE_INFLATION as I, TEST_INFLATION_RATES } from '../../testing/samplePlan'
import type { GoalScenario } from '../types'
import { dateAtYears, yearsBetween } from './dates'
import { purchaseWithdrawalCents } from './investedStep'
import { projectNetWorth } from './projection'
import { rebaseline } from './rebaselinePatch'
import { onAxis, valueOnAxisAt } from './scenarioAxis'
import { scenarioToParams } from './scenarioProjection'
import { startLater, suggestedStart } from './startLater'
import { planValueAtDate } from './wealthTracking'

const project = (
  plan: GoalScenario,
  rate = I,
) => projectNetWorth(scenarioToParams(plan, rate))

/**
 * A copy of `plan` started on `date` from what is suggested off its own line. Some seeded plans cannot
 * afford their house, and their line is below nothing; the sheet would not offer those a balance, but the
 * engine's sums still have to hold, so the copy starts from the figure before it is floored at nothing.
 */
function laterCopy(
  plan: GoalScenario,
  date: string,
  rate = I,
): { copy: GoalScenario; lowerByCents: number } {
  const suggested = suggestedStart(plan, null, date, rate)!
  expect(suggested.from).toBe('own-line')
  const investedCents = suggested.cents - suggested.shortByCents
  return {
    copy: { ...plan, ...startLater(plan, { date, investedCents }, rate)!.patch },
    lowerByCents: suggested.lowerByCents,
  }
}

describe('suggestedStart', () => {
  const plan = samplePlan({ housePurchaseYear: null })
  const checkin = { investedCents: 9_000_000, date: '2028-01-01' }

  it('is the check-in’s balance for a date on its day', () => {
    expect(suggestedStart(plan, checkin, '2028-01-01', I)).toEqual({
      cents: 9_000_000,
      lowerByCents: 0,
      paidAtStartCents: 0,
      shortByCents: 0,
      from: 'checkin',
    })
  })

  it('does not use a check-in dated after the date, which says nothing about it', () => {
    const before = suggestedStart(plan, checkin, '2027-06-01', I)!
    expect(before.from).toBe('own-line')
    expect(before).toEqual(suggestedStart(plan, null, '2027-06-01', I))
  })

  it('carries the plan on from a check-in before the date, in the euros of that date, never above that line', () => {
    const restarted = { ...plan, ...rebaseline(plan, checkin, I).patch }
    const own = planValueAtDate(restarted, '2030-07-01', I)!
    const s = suggestedStart(plan, checkin, '2030-07-01', I)!
    expect(s.from).toBe('plan-from-checkin')
    expect(s.cents + s.lowerByCents).toBe(Math.round(own * (1 + I) ** yearsBetween('2028-01-01', '2030-07-01')))
    expect(s.lowerByCents).toBeGreaterThan(0)
  })

  it('is the plan’s own line on the date with no check-in since the plan started, a few cents under on an anniversary', () => {
    const own = Math.round(planValueAtDate(plan, '2031-01-01', I)! * 1.02 ** 5)
    const s = suggestedStart(plan, null, '2031-01-01', I)!
    expect(s.from).toBe('own-line')
    expect(s.cents + s.lowerByCents).toBe(own)
    expect(s.lowerByCents).toBeLessThanOrEqual(50)
    expect(suggestedStart(plan, { investedCents: 1, date: '2025-06-01' }, '2031-01-01', I)).toEqual(s)
  })

  it('has nothing to suggest without a start, before it, past the last year, or for a date that is not one', () => {
    expect(suggestedStart({ ...plan, planStartDate: null }, checkin, '2030-01-01', I)).toBeNull()
    expect(suggestedStart(plan, checkin, '2025-12-31', I)).toBeNull()
    expect(suggestedStart(plan, checkin, '2056-01-01', I)).not.toBeNull()
    expect(suggestedStart(plan, checkin, '2056-01-02', I)).toBeNull()
    expect(suggestedStart(plan, checkin, '2030-02-30', I)).toBeNull()
  })
})

describe('startLater', () => {
  const plan = samplePlan({ lifeEvents: [{ year: 2, amountCents: 1_000_000, label: 'Gift' }] })

  it('is a re-baseline to a date that need not be a check-in, the source left as it was', () => {
    const at = { date: '2029-01-01', investedCents: 12_000_000 }
    const r = startLater(plan, at, I)!
    expect(r).toEqual(rebaseline(plan, at, I))
    expect(r.patch.planStartDate).toBe('2029-01-01')
    expect(r.patch.startInvestedCents).toBe(12_000_000)
    expect(r.droppedLifeEvents.map((e) => e.label)).toEqual(['Gift'])
    expect(plan.planStartDate).toBe('2026-01-01')
  })

  it('refuses what has nothing to start from: no start, a date before it, past its last year, or not a date', () => {
    const at = (date: string) => ({ date, investedCents: 12_000_000 })
    expect(startLater({ ...plan, planStartDate: null }, at('2029-01-01'), I)).toBeNull()
    expect(startLater(plan, at('2025-12-31'), I)).toBeNull()
    expect(startLater(plan, at('2056-01-02'), I)).toBeNull()
    expect(startLater(plan, at('2029-02-30'), I)).toBeNull()
    expect(startLater(plan, at('2056-01-01'), I)).not.toBeNull()
  })
})

/**
 * The most a copy started on an anniversary of its source strays from it at any whole year, either way,
 * in cents of the origin's euros. Each scenario rounds every year's saving and every restated amount
 * (events, the house, the loan) to a cent in its own euros and compounds them, the reading rounds once
 * more when it brings the copy to the origin's euros, and the suggestion keeps a few cents under the line
 * so that rounding never puts the copy above it: 62 cents was the most measured, over 300 seeded plans
 * started 1, 4 and 9 years in at inflation of -1%, 0, 2% and 5%, horizons of 15 to 40 years and returns
 * up to 8%.
 */
const TAIL_CENTS = 70

describe('a copy started on an anniversary of its source draws on the source’s line', () => {
  it('holds for seeded plans at any inflation, invested and net worth, in the origin’s euros', () => {
    const cases = TEST_INFLATION_RATES.flatMap((rate) =>
      randomPlans(41, 100).flatMap((plan) =>
        [1, 4, 9].filter((k) => k < plan.horizonYears).map((k) => ({ rate, plan, k })),
      ),
    )
    for (const { rate, plan, k } of cases) {
      const source = project(plan, rate)
      const later = project(laterCopy(plan, dateAtYears(plan.planStartDate!, k), rate).copy, rate)
      for (let year = k; year <= plan.horizonYears; year++) {
        const gap = (field: 'invested' | 'netWorth') =>
          Math.abs(valueOnAxisAt(later, k, rate, year, field)! - valueOnAxisAt(source, 0, rate, year, field)!)
        expect(Math.max(gap('invested'), gap('netWorth'))).toBeLessThanOrEqual(TAIL_CENTS)
      }
    }
  })

  it('holds for the drawn points too, with a house bought before the new start and one after', () => {
    for (const purchase of [3, 12]) {
      const plan = samplePlan({
        housePurchaseYear: purchase,
        lifeEvents: [
          { year: 2, amountCents: 2_000_000, label: 'Before' },
          { year: 6, amountCents: 1_500_000, label: 'On the day' },
          { year: 15, amountCents: -3_000_000, label: 'After' },
        ],
        contributionSchedule: [
          { from: '2028-05', monthlyCents: 150_000 },
          { from: '2040-01', monthlyCents: 50_000 },
        ],
      })
      const own = onAxis(project(plan), 0, I).filter((p) => p.xIndex >= 6)
      const drawn = onAxis(project(laterCopy(plan, '2032-01-01').copy), 6, I).filter(
        (p) => p.xIndex <= plan.horizonYears,
      )
      // The event on the copy's first day is already in its starting balance, so the copy has one point there.
      expect(own.filter((p) => p.xIndex === 6)).toHaveLength(2)
      const ownAfterStart = own.filter((p, i) => !(p.xIndex === 6 && own[i + 1]?.xIndex === 6))
      expect(drawn.map((p) => p.xIndex)).toEqual(ownAfterStart.map((p) => p.xIndex))
      drawn.forEach((p, i) => expect(Math.abs(p.value - ownAfterStart[i]!.value)).toBeLessThanOrEqual(TAIL_CENTS))
    }
  })
})

/** Plans whose yearly saving is large against the balance, where a mid-year start cuts the most off the line's corners. */
const HEAVY_SAVERS = [
  samplePlan({
    housePurchaseYear: null,
    lifeEvents: [],
    startInvestedCents: 10_000_000,
    monthlyContributionCents: 500_000,
    expectedRealReturn: 0.05,
  }),
  samplePlan({
    housePurchaseYear: null,
    lifeEvents: [],
    startInvestedCents: 2_000_000,
    monthlyContributionCents: 500_000,
    expectedRealReturn: 0.07,
  }),
  samplePlan({
    housePurchaseYear: null,
    lifeEvents: [],
    startInvestedCents: 3_000_000,
    monthlyContributionCents: 300_000,
    expectedRealReturn: 0.06,
    contributionSchedule: [{ from: '2029-07', monthlyCents: 600_000 }],
  }),
]

/** Both lines' anniversaries in the overlap, in the source's years, and every month between when asked. */
function readings(
  offset: number,
  end: number,
  everyMonth = true,
): number[] {
  const months = everyMonth
    ? Array.from({ length: Math.floor((end - offset) * 12) + 1 }, (_, m) => offset + m / 12)
    : []
  const own = Array.from({ length: Math.floor(end - offset) + 1 }, (_, k) => offset + k)
  const theirs = Array.from({ length: Math.floor(end) + 1 }, (_, y) => y).filter((y) => y > offset)
  return [...months, ...own, ...theirs].filter((t) => t <= end)
}

/**
 * What the copy's cautious placing of steps can take off it at axis year `t`, in the source's euros. A
 * cost dated at source year `y` is paid on the copy's anniversary in the year before, so until `y` the
 * copy is under by the cost and its return, and from then on by at most a year of return on it,
 * compounding. An inflow comes on the copy's anniversary in the year after, the same way round. Returns
 * the reading for any `t`, with the steps worked out once.
 */
function movedSteps(
  plan: GoalScenario,
  rate: number,
  offset: number,
): (t: number) => number {
  const r = plan.expectedRealReturn
  const house = plan.housePurchaseYear
    ? [{ year: plan.housePurchaseYear, cents: -purchaseWithdrawalCents(scenarioToParams(plan, rate)) }]
    : []
  const steps = [...plan.lifeEvents.map((e) => ({ year: e.year, cents: e.amountCents })), ...house].filter(
    (s) => s.year > offset,
  )
  return (t) =>
    steps.reduce((sum, s) => {
      const size = Math.abs(s.cents)
      // Paid from the year before a cost's date, received up to a year after an inflow's.
      const from = s.cents < 0 ? s.year - 1 : s.year
      if (t < from) return sum
      return sum + (t < from + 1 ? size * (1 + r) : size * r * Math.pow(1 + r, t - from - 1))
    }, 0)
}

/**
 * Where to read a copy against its source. The gap is straight between the anniversaries of either line,
 * so those (and the day before each, as a line is already past a step on its anniversary) are where it is
 * largest; `everyMonth` adds the months between too, for the plans written out by hand.
 */
function readingsWithSteps(
  offset: number,
  end: number,
  everyMonth: boolean,
): number[] {
  return readings(offset, end, everyMonth).flatMap((t) => (t - 1e-6 > offset ? [t, t - 1e-6] : [t]))
}

describe('a copy started part way through a year never reads above its source', () => {
  /** Every reading of the copy against its source: never above it, and under it by no more than its cautious choices cost. */
  function neverAboveAt(
    plan: GoalScenario,
    rate: number,
    part: number,
    everyMonth: boolean,
  ) {
    const date = dateAtYears(plan.planStartDate!, part)
    const offset = yearsBetween(plan.planStartDate!, date)
    const { copy, lowerByCents } = laterCopy(plan, date, rate)
    const source = project(plan, rate)
    const later = project(copy, rate)
    // The copy from a balance that much higher: what lowering it for the corners costs at each reading.
    const lifted = project({ ...copy, startInvestedCents: copy.startInvestedCents + lowerByCents }, rate)
    // Even from the line's value a copy pays its saving from its own anniversaries, where the line
    // spreads each year's over that year, so it can sit under by up to half a year of it.
    const halfYear = Math.max(...source.map((p) => p.annualContributionCents)) / 2
    const moved = movedSteps(plan, rate, offset)
    for (const t of readingsWithSteps(offset, plan.horizonYears, everyMonth)) {
      const was = valueOnAxisAt(source, 0, rate, t)!
      const now = valueOnAxisAt(later, offset, rate, t)!
      expect(now).toBeLessThanOrEqual(was)
      expect(was - now).toBeLessThanOrEqual(
        valueOnAxisAt(lifted, offset, rate, t)! - now + halfYear + moved(t) + TAIL_CENTS,
      )
    }
  }

  const PARTS = [0.25, 0.5, 0.75, 2.5, 6.4]

  it('every month, for heavy savers and plans with a house, a cost and a gift ahead, at any inflation', () => {
    const byHand = [
      ...HEAVY_SAVERS,
      samplePlan(),
      samplePlan({
        housePurchaseYear: null,
        lifeEvents: [
          { year: 2, amountCents: -2_000_000, label: 'Car' },
          { year: 5, amountCents: 3_000_000, label: 'Gift' },
        ],
      }),
    ]
    for (const rate of TEST_INFLATION_RATES)
      for (const plan of byHand) for (const part of PARTS) neverAboveAt(plan, rate, part, true)
  })

  it('at every anniversary of either line, for seeded plans with houses and events either side of the start, at any inflation', () => {
    for (const rate of TEST_INFLATION_RATES)
      for (const plan of randomPlans(7, 20)) for (const part of PARTS) neverAboveAt(plan, rate, part, false)
  })

  it('buys a house that is ahead on the copy’s anniversary before the purchase, so it reads under and not above', () => {
    // The sample plan buys on 1 January 2034; a copy from 3 July 2026 buys on 3 July 2033 and says so.
    const plan = samplePlan()
    const { copy } = laterCopy(plan, '2026-07-03')
    expect(copy.housePurchaseYear).toBe(7)
    const offset = yearsBetween('2026-01-01', '2026-07-03')
    const gap = (t: number) => valueOnAxisAt(project(copy), offset, I, t)! - valueOnAxisAt(project(plan), 0, I, t)!
    // Before it buys it is level with the source; from its purchase to the source's it is under by the payment.
    expect(gap(7.4)).toBeLessThanOrEqual(0)
    expect(gap(7.4)).toBeGreaterThan(-50_000)
    expect(gap(7.6)).toBeLessThan(-6_000_000)
    // Then it is under by half a year's return on the payment, compounding: 1.444 € in 2034, 4.207 € by 2056.
    for (const [t, euros] of [
      [8, 1_444],
      [8.5, 1_620],
      [14, 1_932],
      [30, 4_207],
    ] as const) {
      expect(Math.round(gap(t) / 100)).toBe(-euros)
    }
  })

  it('pays a cost that is ahead early, and an inflow that is ahead late, which both read under', () => {
    const plan = samplePlan({
      housePurchaseYear: null,
      lifeEvents: [
        { year: 2, amountCents: -2_000_000, label: 'Car' },
        { year: 4, amountCents: 1_000_000, label: 'Gift' },
      ],
    })
    const { copy } = laterCopy(plan, '2026-07-03')
    expect(copy.lifeEvents.map((e) => [e.label, e.year])).toEqual([
      ['Car', 1],
      ['Gift', 4],
    ])
  })

  it('takes a cost dated in the copy’s first year off its starting balance, counting it as already paid', () => {
    const plan = samplePlan({
      housePurchaseYear: null,
      lifeEvents: [{ year: 1, amountCents: -2_000_000, label: 'Car' }],
    })
    const date = '2026-07-03'
    const s = suggestedStart(plan, null, date, I)!
    expect(s.paidAtStartCents).toBe(Math.round(2_000_000 * 1.02 ** yearsBetween('2026-01-01', date)))
    expect(startLater(plan, { date, investedCents: s.cents }, I)!.droppedLifeEvents.map((e) => e.label)).toEqual([
      'Car',
    ])
    expect(s.cents + s.lowerByCents + s.paidAtStartCents).toBe(
      Math.round(planValueAtDate(plan, date, I)! * 1.02 ** yearsBetween('2026-01-01', date)),
    )
  })

  it('takes the down payment and fees of a house in the copy’s first year off its balance, from the line or a check-in on the day', () => {
    const plan = samplePlan({ housePurchaseYear: 1, startInvestedCents: 20_000_000 })
    const date = '2026-07-03'
    const factor = 1.02 ** yearsBetween('2026-01-01', date)
    const paid = Math.round(purchaseWithdrawalCents(scenarioToParams(plan, I)) * factor)
    const s = suggestedStart(plan, null, date, I)!
    expect(s.paidAtStartCents).toBe(paid)
    expect(s.cents + s.lowerByCents + s.paidAtStartCents).toBe(Math.round(planValueAtDate(plan, date, I)! * factor))
    expect(startLater(plan, { date, investedCents: s.cents }, I)!.patch.housePurchaseYear).toBe(0)
    const onTheDay = suggestedStart(plan, { investedCents: 25_000_000, date }, date, I)!
    expect(onTheDay).toEqual({
      cents: 25_000_000 - paid,
      lowerByCents: 0,
      paidAtStartCents: paid,
      shortByCents: 0,
      from: 'checkin',
    })
  })

  it('counts what is dated by the start but still ahead on the check-in’s line as paid, not as the line being lowered', () => {
    // The check-in's restart pays the car (1 Jan 2028) on its own next anniversary, 1 Jul 2028, after the copy's start.
    const checkin = { investedCents: 5_500_000, date: '2026-07-01' }
    const date = '2028-03-01'
    for (const rate of TEST_INFLATION_RATES) {
      const factor = (1 + rate) ** yearsBetween('2026-01-01', date)
      const bare = suggestedStart(samplePlan({ housePurchaseYear: null }), checkin, date, rate)!
      const car = suggestedStart(
        samplePlan({ housePurchaseYear: null, lifeEvents: [{ year: 2, amountCents: -2_000_000, label: 'Car' }] }),
        checkin,
        date,
        rate,
      )!
      expect(car.paidAtStartCents).toBe(Math.round(2_000_000 * factor))
      // The lowering is what the corners need, a few hundred euros here; before, it also took the car's 20.000 €.
      expect(car.lowerByCents).toBeLessThanOrEqual(bare.lowerByCents + 100)
      expect(Math.abs(bare.cents - car.cents - car.paidAtStartCents)).toBeLessThanOrEqual(bare.lowerByCents + 100)
      // An inflow that is ahead on the line the same way is in the copy's balance too, so it starts higher, less
      // what the gift earns in the copy in the four months before the line receives it (at most 5% of a year's 7%).
      const gift = suggestedStart(
        samplePlan({ housePurchaseYear: null, lifeEvents: [{ year: 2, amountCents: 1_000_000, label: 'Gift' }] }),
        checkin,
        date,
        rate,
      )!
      expect(gift.paidAtStartCents).toBe(0)
      const added = gift.cents - bare.cents
      expect(added).toBeGreaterThan(Math.round(1_000_000 * factor) * 0.97 - bare.lowerByCents)
      expect(added).toBeLessThanOrEqual(Math.round(1_000_000 * factor) + 100)
    }
  })

  it('counts a cost dated on the start itself as paid there, and none on the day the check-in’s line pays it', () => {
    const plan = samplePlan({
      housePurchaseYear: null,
      lifeEvents: [{ year: 2, amountCents: -2_000_000, label: 'Car' }],
    })
    const checkin = { investedCents: 5_500_000, date: '2026-07-01' }
    for (const rate of TEST_INFLATION_RATES) {
      // On 1 Jan 2028 itself: the copy holds it as paid, the line pays it on 1 Jul 2028.
      const onTheDay = suggestedStart(plan, checkin, '2028-01-01', rate)!
      expect(onTheDay.paidAtStartCents).toBe(Math.round(2_000_000 * (1 + rate) ** 2))
      // On 1 Jul 2028, the check-in's anniversary: the line has paid it that morning, so it is in the line's value.
      const paidByLine = suggestedStart(plan, checkin, '2028-07-01', rate)!
      expect(paidByLine.paidAtStartCents).toBe(0)
      expect(paidByLine.lowerByCents).toBeLessThan(50_000)
    }
  })

  it('lets a copy hold an inflow the check-in’s line receives later only until it does, then never reads above that line', () => {
    // The gift (1 Jan 2028) is in the copy's balance from 1 Mar 2028; the line receives it on 1 Jul 2028.
    const plan = samplePlan({
      housePurchaseYear: null,
      lifeEvents: [{ year: 2, amountCents: 5_000_000, label: 'Gift' }],
    })
    const checkin = { investedCents: 5_500_000, date: '2026-07-01' }
    const date = '2028-03-01'
    for (const rate of TEST_INFLATION_RATES) {
      const s = suggestedStart(plan, checkin, date, rate)!
      const copy = project({ ...plan, ...startLater(plan, { date, investedCents: s.cents }, rate)!.patch }, rate)
      const line = project({ ...plan, ...rebaseline(plan, checkin, rate).patch }, rate)
      const offset = yearsBetween(checkin.date, date)
      // From the line's receiving it on, on its anniversaries and the copy's, and the moment before each.
      const times = [2, 3, 4, 5, 10, offset + 1, offset + 2, offset + 5]
        .flatMap((t) => [t, t - 1e-6])
        .filter((t) => t >= 2)
      for (const t of times) {
        expect(valueOnAxisAt(copy, offset, rate, t)! - valueOnAxisAt(line, 0, rate, t)!).toBeLessThanOrEqual(70)
      }
    }
  })

  it('never reads above the check-in’s line once that line has received an inflow the copy started with', () => {
    // A heavy saver, so a copy started part way through a year needs its corner lowering, with the check-in two and a
    // half years after the source's start. The lowering is set just before the line receives the gift, where the copy
    // is ahead by what the gift has earned in it; after that the copy stays under the line.
    const plan = samplePlan({
      planStartDate: '2024-01-01',
      housePurchaseYear: null,
      startInvestedCents: 100_000,
      monthlyContributionCents: 500_000,
      lifeEvents: [{ year: 4, amountCents: 1_000_000, label: 'Gift' }],
    })
    const checkin = { investedCents: 16_000_000, date: '2026-07-01' }
    const date = '2028-03-01'
    for (const rate of TEST_INFLATION_RATES) {
      const s = suggestedStart(plan, checkin, date, rate)!
      const copy = project({ ...plan, ...startLater(plan, { date, investedCents: s.cents }, rate)!.patch }, rate)
      const line = project({ ...plan, ...rebaseline(plan, checkin, rate).patch }, rate)
      const offset = yearsBetween(checkin.date, date)
      // From 1 Jul 2028 on, when the line has the gift too (until then the copy is ahead by it, as it should be).
      const corners = [2, 3, 4, 5, 6, 7].concat([1, 2, 3, 4, 5].map((k) => offset + k))
      for (const t of corners.flatMap((c) => [c, c - 1e-6]).filter((t) => t >= 2)) {
        expect(valueOnAxisAt(copy, offset, rate, t)! - valueOnAxisAt(line, 0, rate, t)!).toBeLessThanOrEqual(70)
      }
    }
  })

  it('does the same for a house dated by the start that the check-in’s line buys after it', () => {
    const plan = samplePlan({ housePurchaseYear: 2, startInvestedCents: 20_000_000 })
    const checkin = { investedCents: 21_000_000, date: '2026-07-01' }
    const date = '2028-03-01'
    const factor = 1.02 ** yearsBetween('2026-01-01', date)
    const s = suggestedStart(plan, checkin, date, I)!
    expect(s.paidAtStartCents).toBe(Math.round(purchaseWithdrawalCents(scenarioToParams(plan, I)) * factor))
    expect(s.lowerByCents).toBeLessThan(100_000)
    expect(startLater(plan, { date, investedCents: s.cents }, I)!.patch.housePurchaseYear).toBe(0)
  })

  it('says by how much a balance cannot pay for a house in the copy’s first year, and suggests nothing below nothing', () => {
    // The sample plan with its house a year in has about 57.000 € on 3 July 2026 and owes 67.253 € for it.
    const s = suggestedStart(samplePlan({ housePurchaseYear: 1 }), null, '2026-07-03', I)!
    expect(s).toMatchObject({ cents: 0, paidAtStartCents: 6_725_265, shortByCents: 947_113 })
    const broke = suggestedStart(
      samplePlan({ housePurchaseYear: 1, startInvestedCents: 1_000_000 }),
      null,
      '2026-07-03',
      I,
    )!
    expect(broke).toMatchObject({ cents: 0, shortByCents: 5_088_299 })
    expect(
      suggestedStart(samplePlan({ housePurchaseYear: 1, startInvestedCents: 20_000_000 }), null, '2026-07-03', I)!
        .shortByCents,
    ).toBe(0)
  })

  it('leaves the re-baseline at a check-in as it was: a cost still goes to the next anniversary there', () => {
    const plan = samplePlan({
      housePurchaseYear: null,
      lifeEvents: [{ year: 2, amountCents: -2_000_000, label: 'Car' }],
    })
    expect(rebaseline(plan, { date: '2026-07-03', investedCents: 6_000_000 }, I).patch.lifeEvents[0]!.year).toBe(2)
  })

  it('starts lower by what the worst corner needs: about 540 € for 100.000 € and 5.000 € a month, six months in', () => {
    const { lowerByCents } = laterCopy(HEAVY_SAVERS[0]!, dateAtYears('2026-01-01', 0.5))
    expect(lowerByCents).toBeGreaterThan(50_000)
    expect(lowerByCents).toBeLessThan(60_000)
  })
})

/**
 * Net worth goes the other way. A copy that buys a house that is still ahead buys it on its anniversary
 * before the purchase, so it owns the house sooner: bought at that date's lower price, worth more from
 * then on, and its loan paid down from earlier. Invested reads under (the payment leaves sooner), net
 * worth reads over. With whole plan years no placement makes both read under, so it is stated in
 * docs/GOALS-MODEL.md instead. These pin the direction and the size, so a change either way is noticed.
 */
describe('a copy that buys a house still ahead reads above its source on net worth', () => {
  const netGap = (
    plan: GoalScenario,
    date: string,
    rate: number,
  ) => {
    const offset = yearsBetween(plan.planStartDate!, date)
    const { copy } = laterCopy(plan, date, rate)
    const source = project(plan, rate)
    const later = project(copy, rate)
    return (t: number) =>
      valueOnAxisAt(later, offset, rate, t, 'netWorth')! - valueOnAxisAt(source, 0, rate, t, 'netWorth')!
  }

  it('by about 9.900 € a year after the purchase and 860 € by year 30 for the sample plan at 2%, more at -1%', () => {
    const at2 = netGap(samplePlan(), '2027-02-10', 0.02)
    expect(Math.round(at2(9) / 100)).toBe(9_916)
    expect(Math.round(at2(30) / 100)).toBe(864)
    const atMinus1 = netGap(samplePlan(), '2027-02-10', -0.01)
    expect(Math.round(atMinus1(9) / 100)).toBe(15_562)
    expect(Math.round(atMinus1(30) / 100)).toBe(17_850)
  })

  it('by at most a fifth of the larger of the source’s net worth and its starting balance, for seeded plans', () => {
    // Measured: 16,3% at worst, in the months just after the purchase, when the source's net worth is small.
    let above = 0
    for (const rate of TEST_INFLATION_RATES) {
      for (const plan of randomPlans(7, 20).filter((p) => (p.housePurchaseYear ?? 0) > 0.25)) {
        const date = dateAtYears(plan.planStartDate!, 0.25)
        const gap = netGap(plan, date, rate)
        const source = project(plan, rate)
        const offset = yearsBetween(plan.planStartDate!, date)
        const worst = Math.max(
          ...readings(offset, plan.horizonYears).map(
            (t) => gap(t) / Math.max(Math.abs(valueOnAxisAt(source, 0, rate, t, 'netWorth')!), plan.startInvestedCents),
          ),
        )
        expect(worst).toBeLessThan(0.2)
        if (worst > 0) above += 1
      }
    }
    expect(above).toBeGreaterThan(0)
  })
})
