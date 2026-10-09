import { describe, expect, it } from 'vitest'
import { makeScenario, makeTransaction, makeWealthAccount, makeWealthCheckin } from '../../testing/factories'
import { samplePlan, SAMPLE_INFLATION } from '../../testing/samplePlan'
import { plannedMonthlyAt } from './contributionSchedule'
import { dateAtYears } from './dates'
import { splitGap, startExplainsGap, wholeEuros, type GapSplit } from './gapSplit'
import { projectNetWorth } from './projection'
import { scenarioToParams } from './scenarioProjection'
import { trackStatus, yearOffsetFromDate } from './wealthTracking'
import type { GoalScenario } from '../types'

const I = SAMPLE_INFLATION
const START = '2026-01-01'
const accounts = [makeWealthAccount({ id: 1, kind: 'investment' }), makeWealthAccount({ id: 2, kind: 'cash' })]

/** A plan with nothing to be paid in and no house: only the starting amount grows. */
const still = (over: Partial<GoalScenario> = {}) =>
  samplePlan({ monthlyContributionCents: 0, contributionSchedule: [], housePurchaseYear: null, lifeEvents: [], planStartDate: START, ...over })
/** A plan that pays in 1.000 a month and has no house. */
const paying = (over: Partial<GoalScenario> = {}) =>
  samplePlan({ housePurchaseYear: null, lifeEvents: [], planStartDate: START, ...over })

const years = (date: string) => yearOffsetFromDate(START, date)!
const toNominal = (real: number, date: string) => Math.round(real * Math.pow(1 + I, years(date)))
const checkin = (id: number, date: string, nominal: number) =>
  makeWealthCheckin({ id, checkinDate: date, entries: [{ accountId: 1, valueCents: nominal }, { accountId: 2, valueCents: 0 }] })
const deposit = (date: string, amountCents: number) =>
  makeTransaction({ date, budgetMonth: date.slice(0, 7), type: 'investment', amountCents })

/**
 * The plan's own path with the monthly amounts paid continuously, summed in small steps: a second
 * way of getting what the engine gets in closed form. Events are not in it, so it is for plans without.
 */
function ownPath(plan: GoalScenario, to: number): number {
  const r = plan.expectedRealReturn
  const steps = Math.max(1, Math.round(to * 730))
  const dt = to / steps
  let flows = 0
  for (let j = 0; j < steps; j++) {
    const tau = (j + 0.5) * dt
    const monthly = plannedMonthlyAt(plan, dateAtYears(START, tau))
    flows += 12 * monthly * Math.pow(1 + I, -tau) * Math.pow(1 + r, to - tau) * dt
  }
  return plan.startInvestedCents * Math.pow(1 + r, to) + flows
}

function split(plan: GoalScenario, checkins: ReturnType<typeof checkin>[], transactions = [] as ReturnType<typeof deposit>[]): GapSplit {
  const out = splitGap(plan, checkins, accounts, transactions, I)
  if (out.kind !== 'split') throw new Error(`no split: ${out.reason}`)
  return out
}

const sum = (s: GapSplit) => s.parts.timing + s.parts.start + s.parts.saving + s.parts.market

describe('splitGap: the four parts are the gap', () => {
  function rng(seed: number) {
    let s = seed
    return () => {
      s = (s * 1664525 + 1013904223) % 4294967296
      return s / 4294967296
    }
  }

  it('add up to the gap to the cent, and the gap is what the status says, on random plans and histories', () => {
    const rand = rng(7)
    for (let n = 0; n < 80; n++) {
      const plan = samplePlan({
        id: 1,
        planStartDate: START,
        startInvestedCents: Math.round(1_000_000 + rand() * 20_000_000),
        monthlyContributionCents: Math.round(rand() * 300_000),
        expectedRealReturn: rand() * 0.09,
        housePurchaseYear: [null, 3, 6][Math.floor(rand() * 3)]!,
        lifeEvents: rand() < 0.5 ? [{ year: 4, amountCents: Math.round((rand() - 0.5) * 4_000_000), label: 'Event' }] : [],
        contributionSchedule: rand() < 0.4 ? [{ from: '2028-03', monthlyCents: Math.round(rand() * 300_000) }] : [],
      })
      const dates = ['2026-03-17', '2027-02-09', '2028-05-30', '2029-10-12', '2031-01-01'].slice(0, 2 + Math.floor(rand() * 4))
      const checkins = dates.map((d, k) => checkin(k + 1, d, Math.round(rand() * 40_000_000)))
      const flows = dates.slice(1).flatMap((d, k) => (rand() < 0.7 ? [deposit(d.replace(/-\d\d$/, '-02'), Math.round((rand() - 0.2) * 3_000_000))] : []).slice(0, 1 + k % 2))
      const out = splitGap(plan, checkins, accounts, flows, I)
      if (out.kind !== 'split') continue
      const last = checkins[checkins.length - 1]!
      const status = trackStatus(last, plan, accounts, I)!
      expect(out.gapCents).toBe(status.deltaCents)
      for (const part of Object.values(out.parts)) expect(Number.isInteger(part)).toBe(true)
      expect(sum(out)).toBe(out.gapCents)
    }
  })
})

describe('splitGap: each kind of difference lands in its own part', () => {
  const a = '2026-03-01'
  const b = '2028-03-01'
  const growth = (plan: GoalScenario) => Math.pow(1 + plan.expectedRealReturn, years(b) - years(a))

  it('a start that was off is the start part, grown at the plan return, and nothing else moves', () => {
    const plan = still()
    const m = ownPath(plan, years(a))
    const d = -0.1 * m // started ten percent short
    const out = split(plan, [checkin(1, a, toNominal(m + d, a)), checkin(2, b, toNominal((m + d) * growth(plan), b))])
    expect(Math.abs(out.parts.start - d * growth(plan))).toBeLessThanOrEqual(3)
    expect(Math.abs(out.parts.saving)).toBeLessThanOrEqual(3)
    expect(Math.abs(out.parts.market)).toBeLessThanOrEqual(4)
    expect(out.merged).toBeNull()
  })

  it('a deposit nobody planned is the saving part, in the money of its day and grown to the check-in', () => {
    const plan = still()
    const m = ownPath(plan, years(a))
    const when = '2027-02-10'
    const real = 5_000_000 / Math.pow(1 + I, years(when))
    const reached = m * growth(plan) + real * Math.pow(1 + plan.expectedRealReturn, years(b) - years(when))
    const out = split(plan, [checkin(1, a, toNominal(m, a)), checkin(2, b, toNominal(reached, b))], [deposit(when, 5_000_000)])
    const expected = real * Math.pow(1 + plan.expectedRealReturn, years(b) - years(when))
    expect(Math.abs(out.parts.saving - expected)).toBeLessThanOrEqual(4)
    expect(Math.abs(out.parts.start)).toBeLessThanOrEqual(3)
    expect(Math.abs(out.parts.market)).toBeLessThanOrEqual(5)
  })

  it('a market that paid less is the market part, and a crash is a large one', () => {
    const plan = still()
    const m = ownPath(plan, years(a))
    const out = split(plan, [checkin(1, a, toNominal(m, a)), checkin(2, b, toNominal(m * growth(plan) * 0.7, b))])
    expect(Math.abs(out.parts.market - -0.3 * m * growth(plan))).toBeLessThanOrEqual(5)
    expect(Math.abs(out.parts.saving)).toBeLessThanOrEqual(3)
    expect(Math.abs(out.parts.start)).toBeLessThanOrEqual(3)
  })

  it('stopping the monthly investing is less saving than planned, and says it cannot tell it from the market', () => {
    const plan = paying()
    const m = ownPath(plan, years(a))
    const planned = ownPath(plan, years(b)) - m * growth(plan)
    // Balance grows at the plan's return from where it was, and nothing is put in.
    const out = split(plan, [checkin(1, a, toNominal(m, a)), checkin(2, b, toNominal(m * growth(plan), b))])
    expect(out.merged).toBe('none-recorded')
    expect(Math.abs(out.parts.saving + out.parts.market - -planned) / planned).toBeLessThan(1e-3)
    expect(Math.abs(out.parts.start)).toBeLessThanOrEqual(3)
  })

  it('investing exactly as planned, month by month, leaves only the way the plan counts time', () => {
    const plan = paying()
    const m = ownPath(plan, years(a))
    const months = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06', '2027-07', '2027-08', '2027-09', '2027-10', '2027-11', '2027-12', '2028-01', '2028-02', '2028-03']
    const flows = months.map((month) => deposit(`${month}-01`, 100_000 * Math.round(Math.pow(1 + I, years(`${month}-01`)))) )
    const recorded = flows.reduce((s, f) => s + (f.amountCents / Math.pow(1 + I, years(f.date))) * Math.pow(1 + plan.expectedRealReturn, years(b) - years(f.date)), 0)
    const reached = m * growth(plan) + recorded
    const out = split(plan, [checkin(1, a, toNominal(m, a)), checkin(2, b, toNominal(reached, b))], flows)
    expect(out.merged).toBeNull()
    expect(out.recordedShort).toBe(false)
    expect(Math.abs(out.parts.start)).toBeLessThanOrEqual(3)
    expect(Math.abs(out.parts.market)).toBeLessThanOrEqual(5)
    // Twelve euros paid on the first of each month against the same paid continuously.
    expect(Math.abs(out.parts.saving)).toBeLessThan(0.01 * recorded)
    expect(sum(out)).toBe(out.gapCents)
  })

  it('records less than half of what was planned: both parts stay, with a note', () => {
    const plan = paying()
    const m = ownPath(plan, years(a))
    const flows = [deposit('2027-01-02', 400_000)]
    const reached = m * growth(plan) + (400_000 / Math.pow(1 + I, years('2027-01-02'))) * Math.pow(1 + plan.expectedRealReturn, years(b) - years('2027-01-02'))
    const out = split(plan, [checkin(1, a, toNominal(m, a)), checkin(2, b, toNominal(reached, b))], flows)
    expect(out.merged).toBeNull()
    expect(out.recordedShort).toBe(true)
  })

  // One deposit worth `share` of what the plan invests over the window, in the plan's euros at the end of it.
  const withShare = (share: number) => {
    const plan = paying()
    const m = ownPath(plan, years(a))
    const planned = ownPath(plan, years(b)) - m * growth(plan)
    const date = '2027-01-02'
    const grown = Math.pow(1 + plan.expectedRealReturn, years(b) - years(date))
    const nominal = Math.round((share * planned * Math.pow(1 + I, years(date))) / grown)
    const reached = m * growth(plan) + (nominal / Math.pow(1 + I, years(date))) * grown
    return split(plan, [checkin(1, a, toNominal(m, a)), checkin(2, b, toNominal(reached, b))], [deposit(date, nominal)])
  }

  it('says the unrecorded part counts as the market whenever the saving reads as less than planned, not only below half', () => {
    // 60% recorded: the saving row says "Investing less than planned", so the note that explains where the rest went shows.
    expect(withShare(0.6).merged).toBeNull()
    expect(withShare(0.6).recordedShort).toBe(true)
    expect(withShare(0.8).recordedShort).toBe(true)
  })

  it('says nothing when the saving is within a planned month of the plan, which the row calls about as planned', () => {
    const near = withShare(0.98)
    expect(near.recordedShort).toBe(false)
    expect(withShare(1).recordedShort).toBe(false)
  })

  it('says nothing for more than planned, whatever the share', () => {
    expect(withShare(1.5).recordedShort).toBe(false)
  })
})

describe('splitGap: a plan flow the plan makes on an anniversary', () => {
  const house = samplePlan({ housePurchaseYear: 2, lifeEvents: [], planStartDate: START })

  it('a week before the house payment, someone exactly on plan has no timing part to speak of', () => {
    const line = projectNetWorth(scenarioToParams(house, I))
    const before = '2027-12-25'
    const t = years(before)
    const pre = line.find((p) => p.year === 2)!.preEventInvestedCents
    const prior = line.find((p) => p.year === 1)!.investedCents
    const real = prior + (pre - prior) * (t - 1)
    const out = split(house, [checkin(1, '2026-03-01', toNominal(ownPath({ ...house, housePurchaseYear: null }, years('2026-03-01')), '2026-03-01')), checkin(2, before, toNominal(real, before))])
    const payment = pre - line.find((p) => p.year === 2)!.investedCents
    expect(payment).toBeGreaterThan(5_000_000)
    expect(Math.abs(out.parts.timing)).toBeLessThan(0.02 * payment)
    expect(sum(out)).toBe(out.gapCents)
  })

  /** The house plan with nothing paid in monthly, so the payment is the only flow, and what it takes out of the plan's own path. */
  const bought = samplePlan({ housePurchaseYear: 2, lifeEvents: [], planStartDate: START, monthlyContributionCents: 0, contributionSchedule: [] })
  const payment = () => {
    const line = projectNetWorth(scenarioToParams(bought, I))
    return line.find((p) => p.year === 2)!.preEventInvestedCents - line.find((p) => p.year === 2)!.investedCents
  }

  it('after the payment, someone who paid it as planned is on plan: the payment is a flow of the plan, in no part', () => {
    const first = '2027-03-01'
    const when = '2028-01-03'
    const last = '2028-03-01'
    const r = bought.expectedRealReturn
    const before = ownPath({ ...bought, housePurchaseYear: null }, years(first))
    const reached = before * Math.pow(1 + r, years(last) - years(first)) - payment() * Math.pow(1 + r, years(last) - 2)
    const paid = Math.round(payment() * Math.pow(1 + I, years(when)))
    const out = split(bought, [checkin(1, first, toNominal(before, first)), checkin(2, last, toNominal(reached, last))], [deposit(when, -paid)])
    expect(out.merged).toBeNull()
    for (const part of [out.parts.start, out.parts.saving, out.parts.market]) expect(Math.abs(part)).toBeLessThan(0.02 * payment())
    expect(Math.abs(out.parts.timing)).toBeLessThan(0.02 * payment())
  })

  it('a house bought a fortnight before its anniversary is read as bought, in the plan and in the split', () => {
    const first = '2027-03-01'
    const when = '2027-12-10'
    const last = '2027-12-18'
    const r = bought.expectedRealReturn
    const before = ownPath({ ...bought, housePurchaseYear: null }, years(first))
    const reached = before * Math.pow(1 + r, years(last) - years(first)) - payment() * Math.pow(1 + r, years(last) - 2)
    const paid = Math.round(payment() * Math.pow(1 + I, years(when)))
    const status = trackStatus(checkin(2, last, toNominal(reached, last)), bought, accounts, I)!
    expect(status.nearStep?.counted).toBe('made')
    const out = split(bought, [checkin(1, first, toNominal(before, first)), checkin(2, last, toNominal(reached, last))], [deposit(when, -paid)])
    expect(Math.abs(out.parts.timing)).toBeLessThan(0.02 * payment())
    expect(Math.abs(out.parts.saving)).toBeLessThan(0.02 * payment())
  })

  it('a house payment the account shows but no transaction records is held with the saving and the market', () => {
    const after = '2028-03-01'
    const first = '2027-03-01'
    const real = (projectNetWorth(scenarioToParams(house, I)).find((p) => p.year === 2)!.investedCents)
    const out = split(house, [checkin(1, first, toNominal(real * 0.6, first)), checkin(2, after, toNominal(real * 0.65, after))], [deposit('2027-06-01', 100_000)])
    expect(out.merged).toBe('event-unrecorded')
  })

  it('the same payment recorded as a withdrawal near its date is told apart', () => {
    const after = '2028-03-01'
    const first = '2027-03-01'
    const line = projectNetWorth(scenarioToParams(house, I))
    const payment = line.find((p) => p.year === 2)!.preEventInvestedCents - line.find((p) => p.year === 2)!.investedCents
    const nominalPayment = Math.round(payment * Math.pow(1 + I, 2))
    // A year of 5% on 120.000, less the payment, plus the 1.000 put in: nothing out of the ordinary.
    const reached = Math.round(12_000_000 * 1.05 - nominalPayment + 100_000)
    const out = split(house, [checkin(1, first, 12_000_000), checkin(2, after, reached)], [deposit('2028-01-03', -nominalPayment), deposit('2027-06-01', 100_000)])
    expect(out.merged).toBeNull()
  })
})

describe('splitGap: a recorded flow is the plan\'s house payment only when it matches in direction, date and size', () => {
  const house = samplePlan({ housePurchaseYear: 2, lifeEvents: [], planStartDate: START })
  const first = '2027-03-01'
  const after = '2028-03-01'
  const line = projectNetWorth(scenarioToParams(house, I))
  const payment = line.find((p) => p.year === 2)!.preEventInvestedCents - line.find((p) => p.year === 2)!.investedCents
  const nominalPayment = Math.round(payment * Math.pow(1 + I, 2))
  // The account shows the payment taken out (and the 1.000 a month put in): the anniversary is 1 January 2028.
  const reached = Math.round(12_000_000 * 1.05 - nominalPayment + 100_000)
  const merged = (date: string, amount: number) =>
    split(house, [checkin(1, first, 12_000_000), checkin(2, after, reached)], [deposit(date, amount), deposit('2027-06-01', 100_000)]).merged

  it('counts a withdrawal of the payment near its date', () => {
    expect(merged('2028-01-03', -nominalPayment)).toBeNull()
  })

  it('does not count a deposit of that size, which goes the other way', () => {
    expect(merged('2028-01-03', nominalPayment)).toBe('event-unrecorded')
  })

  it('counts one 44 days from the anniversary and not one 46 days from it', () => {
    expect(merged('2028-02-14', -nominalPayment)).toBeNull()
    expect(merged('2028-02-16', -nominalPayment)).toBe('event-unrecorded')
    expect(merged('2027-11-18', -nominalPayment)).toBeNull()
    expect(merged('2027-11-16', -nominalPayment)).toBe('event-unrecorded')
  })

  it('counts one for half of it or more and not one for a little under half', () => {
    expect(merged('2028-01-03', -Math.round(0.51 * nominalPayment))).toBeNull()
    expect(merged('2028-01-03', -Math.round(0.49 * nominalPayment))).toBe('event-unrecorded')
  })
})

describe('splitGap: when saving and the market cannot be told apart', () => {
  it('an account opened with a late transfer reads far too high a return, so it is held as one', () => {
    const plan = paying()
    const out = split(
      plan,
      [checkin(1, '2026-01-01', 0), checkin(2, '2026-01-31', 1_020_000), checkin(3, '2027-01-01', 1_100_000)],
      [deposit('2026-01-30', 1_000_000)],
    )
    expect(out.merged).toBe('too-high')
  })

  it('does not hold a plan that expects nothing to be invested for having none recorded', () => {
    const plan = still()
    const out = split(plan, [checkin(1, '2026-03-01', 5_000_000), checkin(2, '2027-03-01', 5_300_000)])
    expect(out.merged).toBeNull()
  })

  it('notes an investment account that was opened or closed between the two check-ins', () => {
    const plan = still()
    const two = makeWealthAccount({ id: 3, kind: 'investment' })
    const opened = makeWealthCheckin({ id: 2, checkinDate: '2027-03-01', entries: [{ accountId: 1, valueCents: 5_000_000 }, { accountId: 3, valueCents: 400_000 }] })
    const out = splitGap(plan, [checkin(1, '2026-03-01', 5_000_000), opened], [...accounts, two], [], I)
    expect(out.kind === 'split' && out.accountsChanged).toBe(true)
    const same = split(plan, [checkin(1, '2026-03-01', 5_000_000), checkin(2, '2027-03-01', 5_300_000)])
    expect(same.accountsChanged).toBe(false)
  })
})

describe('splitGap: the edges of its window', () => {
  it('needs the check-ins to be 30 days apart: 29 is too close and 30 is enough', () => {
    const plan = still()
    const at = (last: string) => splitGap(plan, [checkin(1, '2026-03-01', 5_100_000), checkin(2, last, 5_110_000)], accounts, [], I)
    expect(at('2026-03-30')).toEqual({ kind: 'unavailable', reason: 'too-close' })
    expect(at('2026-03-31')).toMatchObject({ kind: 'split' })
  })

  it('leaves out a flow dated the first check-in\'s day, which that balance already holds, and takes one the day after', () => {
    const plan = paying()
    const checkins = [checkin(1, '2026-03-01', 5_100_000), checkin(2, '2027-03-01', 5_900_000)]
    // None counted: the plan invests, nothing is recorded in the window, so the saving and the market are held together.
    expect(split(plan, checkins, [deposit('2026-03-01', 100_000)]).merged).toBe('none-recorded')
    expect(split(plan, checkins, [deposit('2026-03-02', 100_000)]).merged).not.toBe('none-recorded')
  })

  it('takes one dated the last check-in\'s day, and leaves out one the day after', () => {
    const plan = paying()
    const checkins = [checkin(1, '2026-03-01', 5_100_000), checkin(2, '2027-03-01', 5_900_000)]
    expect(split(plan, checkins, [deposit('2027-03-01', 100_000)]).merged).not.toBe('none-recorded')
    expect(split(plan, checkins, [deposit('2027-03-02', 100_000)]).merged).toBe('none-recorded')
  })

  it('does not count an archived investment account as one that was opened or closed', () => {
    const plan = still()
    const archived = makeWealthAccount({ id: 3, kind: 'investment', archived: true })
    const opened = makeWealthCheckin({ id: 2, checkinDate: '2027-03-01', entries: [{ accountId: 1, valueCents: 5_000_000 }, { accountId: 3, valueCents: 400_000 }] })
    const out = splitGap(plan, [checkin(1, '2026-03-01', 5_000_000), opened], [...accounts, archived], [], I)
    expect(out.kind === 'split' && out.accountsChanged).toBe(false)
  })
})

describe('splitGap: what it says about itself', () => {
  it('names the check-ins it measures from and to, the verdict, and what a planned month is in the plan’s money', () => {
    const plan = paying()
    const out = split(plan, [checkin(1, '2026-03-01', 5_200_000), checkin(2, '2027-03-01', 20_000_000)], [deposit('2026-06-01', 100_000)])
    expect(out.fromDate).toBe('2026-03-01')
    expect(out.toDate).toBe('2027-03-01')
    expect(out.verdict).toBe('ahead')
    expect(out.plannedMonthCents).toBe(Math.round(100_000 / Math.pow(1 + I, years('2027-03-01'))))
  })

  it('says the first check-in came more than a month after the start, so the first part is what happened before it', () => {
    const plan = still()
    const late = split(plan, [checkin(1, '2026-04-01', 5_100_000), checkin(2, '2027-04-01', 5_300_000)])
    const prompt = split(plan, [checkin(1, '2026-01-10', 5_100_000), checkin(2, '2027-04-01', 5_300_000)])
    expect(late.beforeFirstCheckin).toBe(true)
    expect(prompt.beforeFirstCheckin).toBe(false)
  })

  it('measures from the first check-in on or after the start and leaves the ones before it out', () => {
    const plan = still()
    const out = split(plan, [checkin(1, '2025-06-01', 1_000_000), checkin(2, '2026-03-01', 5_100_000), checkin(3, '2027-03-01', 5_300_000)])
    expect(out.fromDate).toBe('2026-03-01')
  })

  it('uses the one logged last when two check-ins are on a day', () => {
    const plan = still()
    const wrong = makeWealthCheckin({ id: 5, checkinDate: '2026-03-01', createdAt: '2026-03-01T08:00:00Z', entries: [{ accountId: 1, valueCents: 9_000_000 }] })
    const right = makeWealthCheckin({ id: 6, checkinDate: '2026-03-01', createdAt: '2026-03-01T09:00:00Z', entries: [{ accountId: 1, valueCents: 5_100_000 }] })
    const out = split(plan, [wrong, right, checkin(7, '2027-03-01', 5_300_000)])
    const alone = split(plan, [right, checkin(7, '2027-03-01', 5_300_000)])
    expect(out.parts).toEqual(alone.parts)
  })
})

describe('splitGap: when there is nothing to split', () => {
  const two = [checkin(1, '2026-03-01', 5_100_000), checkin(2, '2027-03-01', 5_300_000)]
  it.each([
    ['no start date', still({ planStartDate: null }), two, 'no-start'],
    ['one check-in', still(), [two[0]!], 'few-checkins'],
    ['a second one only a few days later', still(), [checkin(1, '2026-03-01', 5_100_000), checkin(2, '2026-03-12', 5_110_000)], 'too-close'],
    ['a latest check-in past the plan’s last year', still({ horizonYears: 1 }), two, 'past-horizon'],
    ['every check-in before the start', still(), [checkin(1, '2025-03-01', 5_100_000), checkin(2, '2025-09-01', 5_300_000)], 'few-checkins'],
  ] as const)('says why for %s', (_name, plan, checkins, reason) => {
    expect(splitGap(plan, [...checkins], accounts, [], I)).toEqual({ kind: 'unavailable', reason })
  })
})

describe('wholeEuros', () => {
  it('rounds each part to whole euros so that the parts still add up to the total in whole euros', () => {
    const parts = [123_456, 99_950, -50_050, 333_333]
    const total = Math.round(parts.reduce((s, p) => s + p, 0) / 100)
    const shown = wholeEuros(parts)
    expect(shown.reduce((s, p) => s + p, 0)).toBe(total)
    shown.forEach((euros, k) => expect(Math.abs(euros * 100 - parts[k]!)).toBeLessThan(100))
  })

  it('leaves a part that is already whole euros alone, and works for negatives and zero', () => {
    expect(wholeEuros([300_000, -100_000, 0])).toEqual([3000, -1000, 0])
    expect(wholeEuros([])).toEqual([])
    const shown = wholeEuros([-150, -150, -150])
    expect(shown.reduce((s, p) => s + p, 0)).toBe(Math.round(-450 / 100))
  })
})

describe('the scenarios the oracles use are what they say', () => {
  it('has a plan with nothing to pay in and a plan that pays', () => {
    expect(still().monthlyContributionCents).toBe(0)
    expect(paying().monthlyContributionCents).toBe(100_000)
    expect(makeScenario().planStartDate).toBeDefined()
  })
})

describe('startExplainsGap', () => {
  const base: GapSplit = {
    kind: 'split',
    gapCents: -5_000_000,
    verdict: 'behind',
    fromDate: '2026-03-01',
    toDate: '2027-03-01',
    beforeFirstCheckin: false,
    parts: { timing: 0, start: -4_900_000, saving: -50_000, market: -50_000 },
    merged: null,
    recordedShort: false,
    accountsChanged: false,
    plannedMonthCents: 100_000,
  }
  const with_ = (over: Partial<GapSplit>, parts: Partial<GapSplit['parts']> = {}): GapSplit => ({ ...base, ...over, parts: { ...base.parts, ...parts } })

  it('is true when the start is about the size of a gap that is worth several planned months', () => {
    expect(startExplainsGap(base)).toBe(true)
    expect(startExplainsGap(with_({ gapCents: 5_000_000, verdict: 'ahead' }, { start: 4_000_000 }))).toBe(true)
  })

  it('is false when the gap is small, since a few planned months of it is noise', () => {
    expect(startExplainsGap(with_({ gapCents: -250_000 }, { start: -240_000 }))).toBe(false)
  })

  it('is false when the plan is paused: there is no planned month to count it in', () => {
    expect(startExplainsGap(with_({ plannedMonthCents: 0 }))).toBe(false)
  })

  it('is false when the start is on the other side of the gap, or much larger than it because saving made it up', () => {
    expect(startExplainsGap(with_({}, { start: 4_900_000 }))).toBe(false)
    expect(startExplainsGap(with_({ gapCents: -500_000 }, { start: -9_400_000 }))).toBe(false)
  })

  it('is false when the start is a small part of the gap', () => {
    expect(startExplainsGap(with_({}, { start: -1_000_000, saving: -4_000_000 }))).toBe(false)
  })

  it('draws the lines where it says: the start between half and one and a half times the gap, the gap at least three planned months', () => {
    // A gap of 5.000.000 cents: the start at 49% and 51% of it, 149% and 151%.
    const startAt = (share: number) => startExplainsGap(with_({}, { start: -Math.round(5_000_000 * share) }))
    expect([startAt(0.49), startAt(0.5), startAt(0.51)]).toEqual([false, true, true])
    expect([startAt(1.49), startAt(1.5), startAt(1.51)]).toEqual([true, true, false])
    // A planned month of 100.000 cents: a gap of 299.000 is under three of them, 300.000 is three.
    const gapOf = (cents: number) => startExplainsGap(with_({ gapCents: -cents }, { start: -cents }))
    expect([gapOf(299_000), gapOf(300_000), gapOf(301_000)]).toEqual([false, true, true])
  })
})
