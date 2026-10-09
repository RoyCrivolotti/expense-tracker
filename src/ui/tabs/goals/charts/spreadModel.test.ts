import { describe, expect, it } from 'vitest'
import { EU_MONEY_FORMAT } from '../../../../engine/money'
import { projectNetWorth, replayMarket, scenarioToParams } from '../../../../engine'
import { samplePlan, SAMPLE_INFLATION } from '../../../../testing/samplePlan'
import {
  fiRow,
  milestoneRows,
  rangeLabel,
  spreadCaption,
  spreadHeadline,
  spreadKey,
  spreadSeries,
  spreadWarning,
  yearLabel,
} from './spreadModel'

const I = SAMPLE_INFLATION
const plan = samplePlan()
const params = scenarioToParams(plan, I)
const points = projectNetWorth(params)
const money = (cents: number) => `${Math.round(cents / 100).toLocaleString('de-DE')} €`
const result = replayMarket({ params, volatility: 0.15, runs: 2_000, milestonesCents: [10_000_000, 100_000_000] })

describe('yearLabel', () => {
  it('is the calendar year with a start date, and the year of the plan without one', () => {
    expect(yearLabel(13, '2026-01-01')).toBe('2039')
    expect(yearLabel(0, '2026-07-15')).toBe('2026')
    expect(yearLabel(13, null)).toBe('year 13')
  })
})

describe('rangeLabel', () => {
  const at = (lo: number, hi: number) => rangeLabel(lo, hi, '2026-01-01', 30)

  it('names the years a range runs from and to, and one year once', () => {
    expect(at(18, 23)).toBe('2044 to 2049')
    expect(at(18, 18)).toBe('2044')
  })

  it('says a range that runs past the plan\'s end does so, and one that never starts does too', () => {
    expect(at(23, Infinity)).toBe('2049 to after 2056')
    expect(at(Infinity, Infinity)).toBe('not within 30 years')
  })

  it('counts years of the plan when it has no start date', () => {
    expect(rangeLabel(5, 9, null, 30)).toBe('year 5 to year 9')
    expect(rangeLabel(5, Infinity, null, 30)).toBe('year 5 to after year 30')
  })
})

describe('milestoneRows', () => {
  const rows = milestoneRows({
    milestones: [{ amountCents: 10_000_000, label: '' }, { amountCents: 100_000_000, label: 'A million' }],
    result,
    planStartDate: '2026-01-01',
    years: 30,
    money,
  })

  it('names each milestone with its amount, as the other milestone views do', () => {
    expect(rows.map((r) => r.label)).toEqual(['100.000 €', 'A million (1.000.000 €)'])
  })

  it('gives the middle half and the 8 in 10 as years, and how many of 100 runs get there', () => {
    expect(rows[0]!.middle).toMatch(/^\d{4}( to \d{4})?$/)
    expect(rows[0]!.wide).toMatch(/^\d{4}( to \d{4})?$/)
    expect(rows[0]!.gets).toBe('100 of 100')
    expect(rows[1]!.gets).toMatch(/^\d+ of 100$/)
    expect(Number(rows[1]!.gets.split(' ')[0])).toBeLessThan(100)
  })

  it('is empty without milestones', () => {
    expect(milestoneRows({ milestones: [], result, planStartDate: null, years: 30, money })).toEqual([])
  })
})

describe('fiRow', () => {
  const withFi = replayMarket({ params, volatility: 0.15, runs: 2_000, fiTargetCents: 75_000_000 })

  it('says the FI target in the plan\'s money, with its years and how many runs get there', () => {
    const row = fiRow({ result: withFi, planStartDate: '2026-01-01', years: 30, money, targetCents: 75_000_000 })!
    expect(row.label).toBe("FI target (750.000 € in the plan's money)")
    expect(row.middle).toMatch(/^\d{4}( to (after )?\d{4})?$|^not within 30 years$/)
    expect(row.gets).toMatch(/^\d+ of 100$/)
  })

  it('has no row when there is no target', () => {
    expect(fiRow({ result, planStartDate: null, years: 30, money, targetCents: 0 })).toBeNull()
  })
})

describe('spreadSeries', () => {
  const series = spreadSeries({ plan: points, result, inflationRate: I, nominal: false })

  it('draws the plan, the middle run, the middle half as a band, and the tenth and the ninetieth as dashed lines', () => {
    expect(series.map((s) => s.id)).toEqual(['p90', 'p10', 'band', 'median', 'plan'])
    expect(series.find((s) => s.id === 'plan')!.values).toEqual(points.map((p) => p.investedCents))
    expect(series.find((s) => s.id === 'median')!.values).toEqual(result.after.p50)
    expect(series.find((s) => s.id === 'band')!.band).toMatchObject({ lo: result.after.p25, hi: result.after.p75 })
    expect(series.find((s) => s.id === 'p90')).toMatchObject({ dashed: true, values: result.after.p90 })
    expect(series.find((s) => s.id === 'p10')).toMatchObject({ dashed: true, values: result.after.p10 })
  })

  it('rises to the value before a house payment and drops to the one after, as the plan\'s line does', () => {
    expect(series.find((s) => s.id === 'plan')!.preStep).toEqual(points.map((p) => p.preEventInvestedCents))
    expect(series.find((s) => s.id === 'median')!.preStep).toEqual(result.before.p50)
    expect(series.find((s) => s.id === 'band')!.band!.loPre).toEqual(result.before.p25)
  })

  it('is the same lines in the money of each year in the nominal view', () => {
    const nominal = spreadSeries({ plan: points, result, inflationRate: I, nominal: true })
    const plan30 = nominal.find((s) => s.id === 'plan')!.values[30]!
    expect(plan30).toBe(Math.round(points[30]!.investedCents * Math.pow(1 + I, 30)))
    expect(nominal.find((s) => s.id === 'median')!.values[10]).toBe(Math.round(result.after.p50[10]! * Math.pow(1 + I, 10)))
  })
})

describe('spreadHeadline', () => {
  it('says where the middle run and the two tenths end, against the plan\'s line, in the money it is drawn in', () => {
    const text = spreadHeadline({ result, plan: points, money, moneyLabel: '2026 euros', nominal: false })
    expect(text).toContain('In year 30, in 2026 euros')
    expect(text).toContain(`the middle run ends at ${money(result.after.p50[30]!)}`)
    expect(text).toContain(`the plan's line at ${money(points[30]!.investedCents)}`)
    expect(text).toContain(`the luckiest tenth above ${money(result.after.p90[30]!)}`)
    expect(text).toContain(`the unluckiest tenth below ${money(result.after.p10[30]!)}`)
  })

  it('names the euros of the year in the nominal view and says the line is in them too', () => {
    const text = spreadHeadline({ result, plan: points, money, moneyLabel: 'euros on your account in 2056', nominal: true, inflationRate: I })
    expect(text).toContain('euros on your account in 2056')
    const grown = (cents: number) => money(Math.round(cents * Math.pow(1 + I, 30)))
    expect(text).toContain(`the middle run ends at ${grown(result.after.p50[30]!)}`)
    expect(text).toContain(`the plan's line at ${grown(points[30]!.investedCents)}`)
    expect(text).toContain(`the luckiest tenth above ${grown(result.after.p90[30]!)}`)
    expect(text).toContain(`the unluckiest tenth below ${grown(result.after.p10[30]!)}`)
  })

  it('never says average', () => {
    expect(spreadHeadline({ result, plan: points, money, moneyLabel: 'x', nominal: false }).toLowerCase()).not.toContain('average')
  })
})

describe('spreadCaption', () => {
  const text = spreadCaption({ runs: 5_000, volatility: 0.15, realReturn: 0.05, format: EU_MONEY_FORMAT })

  it('says what is replayed: the same plan with a different market each time, and how many times', () => {
    expect(text).toContain('5.000 runs')
    expect(text).toContain('the typical 5,0% a year')
    expect(text).toContain('a bounce of 15,0%')
  })

  it('says what stays as planned, and that the picture is the same every time it is drawn', () => {
    expect(text).toContain('Only the market changes')
    expect(text).toContain('saving, the house, the events and the inflation are as planned')
    expect(text).toContain('the same every time')
  })

  it('says what the shading is: where half of the runs end, and 8 in 10', () => {
    expect(text).toContain('half of the runs end in the shaded middle')
    expect(text).toContain('8 in 10 between the dashed lines')
  })
})

describe('spreadWarning', () => {
  it('speaks at one run in twenty, from the first year it holds, and not below it', () => {
    expect(spreadWarning({ ...result, belowZero: [0, 0.049, 0.049] })).toBeNull()
    expect(spreadWarning({ ...result, belowZero: [0, 0.049, 0.05, 0.4] })).toBe(
      'In 5% of the runs the portfolio is below nothing from year 2: the house payment or an event takes more than it holds when the market is unkind.',
    )
  })

  it('says nothing for a plan where the portfolio holds', () => {
    expect(spreadWarning(result)).toBeNull()
  })

  it('says how many runs run out of money, and from which year, when it is more than one in twenty', () => {
    const thin = scenarioToParams(samplePlan({ startInvestedCents: 1_000_000, monthlyContributionCents: 0, housePurchaseYear: 3 }), I)
    const out = replayMarket({ params: thin, volatility: 0.15, runs: 500 })
    const text = spreadWarning(out)!
    expect(text).toMatch(/In \d+% of the runs the portfolio is below nothing from year 3/)
    expect(text).toContain('the house payment or an event takes more than it holds')
  })
})

describe('spreadKey', () => {
  const draft = { ...plan }
  const key = (over = {}) => spreadKey({ ...draft, ...over }, I, 0.15, 5_000)

  it('is the same for a draft that differs only in what the replay does not read: the name and the colour', () => {
    expect(key({ name: 'Another name', color: '#123456', sortOrder: 9 })).toBe(key())
  })

  it('differs for each thing the replay reads', () => {
    for (const over of [
      { startInvestedCents: 6_000_000 },
      { monthlyContributionCents: 120_000 },
      { expectedRealReturn: 0.06 },
      { horizonYears: 25 },
      { housePurchaseYear: 9 },
      { housePriceCents: 31_000_000 },
      { lifeEvents: [{ year: 5, amountCents: 100_000, label: 'x' }] },
      { annualSpendCents: 3_100_000 },
      { safeWithdrawalRate: 0.035 },
    ]) {
      expect(key(over)).not.toBe(key())
    }
    expect(spreadKey(draft, 0.03, 0.15, 5_000)).not.toBe(key())
    expect(spreadKey(draft, I, 0.11, 5_000)).not.toBe(key())
    expect(spreadKey(draft, I, 0.15, 2_000)).not.toBe(key())
  })
})
