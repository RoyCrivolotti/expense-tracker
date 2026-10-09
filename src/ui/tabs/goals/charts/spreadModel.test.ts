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
} from './spreadModel'

const I = SAMPLE_INFLATION
const plan = samplePlan()
const params = scenarioToParams(plan, I)
const points = projectNetWorth(params)
const money = (cents: number) => `${Math.round(cents / 100).toLocaleString('de-DE')} €`
const result = replayMarket({ params, volatility: 0.15, runs: 2_000, milestonesCents: [10_000_000, 100_000_000] })

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

  it('names each milestone with its amount, as the other milestone views do, and says they are amounts on the account', () => {
    expect(rows.map((r) => r.label)).toEqual(['100.000 € on your account', 'A million (1.000.000 €) on your account'])
  })

  it('gives the middle half and the 8 in 10 as years, and how many of 100 runs get there', () => {
    expect(rows[0]!.middle).toMatch(/^\d{4}( to \d{4})?$/)
    expect(rows[0]!.wide).toMatch(/^\d{4}( to \d{4})?$/)
    expect(rows[0]!.gets).toBe('100 of 100')
    expect(rows[1]!.gets).toMatch(/^\d+ of 100$/)
    expect(Number(rows[1]!.gets.split(' ')[0])).toBeLessThan(100)
  })

  it('never says 0 or 100 of 100 for a share that is not, so a risk is not rounded away', () => {
    const shared = (share: number) =>
      milestoneRows({
        milestones: [{ amountCents: 10_000_000, label: '' }],
        result: { ...result, milestones: [{ ...result.milestones[0]!, share }] },
        planStartDate: null,
        years: 30,
        money,
      })[0]!.gets
    expect(shared(0.9996)).toBe('99 of 100')
    expect(shared(0.0004)).toBe('1 of 100')
    expect(shared(1)).toBe('100 of 100')
    expect(shared(0)).toBe('0 of 100')
    expect(shared(0.855)).toBe('86 of 100')
  })

  it('is empty without milestones', () => {
    expect(milestoneRows({ milestones: [], result, planStartDate: null, years: 30, money })).toEqual([])
  })
})

describe('fiRow', () => {
  const withFi = replayMarket({ params, volatility: 0.15, runs: 2_000, fiTargetCents: 75_000_000 })

  it('says the FI target in the plan\'s euros, as every other screen names them, with its years and how many runs get there', () => {
    const row = fiRow({ result: withFi, planStartDate: '2026-01-01', years: 30, money, targetCents: 75_000_000 })!
    expect(row.label).toBe('FI target (750.000 € in 2026 euros)')
    expect(row.middle).toMatch(/^\d{4}( to (after )?\d{4})?$|^not within 30 years$/)
    expect(row.gets).toMatch(/^\d+ of 100$/)
  })

  it('names the euros of today for a plan with no start date', () => {
    const row = fiRow({ result: withFi, planStartDate: null, years: 30, money, targetCents: 75_000_000 })!
    expect(row.label).toBe("FI target (750.000 € in today's euros)")
  })

  it('has no row when there is no target', () => {
    expect(fiRow({ result, planStartDate: null, years: 30, money, targetCents: 0 })).toBeNull()
  })

  it('does not round a run in a thousand that never gets there up to all of them', () => {
    const near = { ...withFi, fi: { ...withFi.fi!, share: 0.9991 } }
    expect(fiRow({ result: near, planStartDate: null, years: 30, money, targetCents: 75_000_000 })!.gets).toBe('99 of 100')
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
  const headline = (over = {}) => spreadHeadline({ result, plan: points, money, moneyLabel: '2026 euros', nominal: false, runs: 10_000, format: EU_MONEY_FORMAT, ...over })

  it('opens by saying what a run is, before the figures use the word', () => {
    expect(headline()).toMatch(/^The plan replayed in 10\.000 different markets, each one a run\. In year 30/)
    expect(headline({ runs: 2_000 })).toContain('replayed in 2.000 different markets')
  })

  it('says it is the luckiest and the unluckiest tenth of runs', () => {
    expect(headline()).toContain('the luckiest tenth of runs above')
    expect(headline()).toContain('the unluckiest tenth of runs below')
  })

  it('says where the middle run and the two tenths end, against the plan\'s line, in the money it is drawn in', () => {
    const text = headline()
    expect(text).toContain('In year 30, in 2026 euros')
    expect(text).toContain(`the middle run ends at ${money(result.after.p50[30]!)}`)
    expect(text).toContain(`the plan's line at ${money(points[30]!.investedCents)}`)
    expect(text).toContain(`the luckiest tenth of runs above ${money(result.after.p90[30]!)}`)
    expect(text).toContain(`the unluckiest tenth of runs below ${money(result.after.p10[30]!)}`)
  })

  it('names the euros of the year in the nominal view and says the line is in them too', () => {
    const text = headline({ moneyLabel: 'euros on your account in 2056', nominal: true, inflationRate: I })
    expect(text).toContain('euros on your account in 2056')
    const grown = (cents: number) => money(Math.round(cents * Math.pow(1 + I, 30)))
    expect(text).toContain(`the middle run ends at ${grown(result.after.p50[30]!)}`)
    expect(text).toContain(`the plan's line at ${grown(points[30]!.investedCents)}`)
    expect(text).toContain(`the luckiest tenth of runs above ${grown(result.after.p90[30]!)}`)
    expect(text).toContain(`the unluckiest tenth of runs below ${grown(result.after.p10[30]!)}`)
  })

  it('never says average', () => {
    expect(headline({ moneyLabel: 'x' }).toLowerCase()).not.toContain('average')
  })
})

describe('spreadCaption', () => {
  const caption = (over = {}) => spreadCaption({ runs: 5_000, volatility: 0.15, realReturn: 0.05, format: EU_MONEY_FORMAT, chartMoney: '2026 euros', tableMoney: '2026 euros', ...over })
  const text = caption()

  it('says which euros the chart is in and which the table is in, since they are not the same', () => {
    expect(text).toContain('The chart is in 2026 euros. In the table, milestone amounts are on your account and the FI target is in 2026 euros.')
    expect(caption({ chartMoney: 'euros on your account in each year', tableMoney: "today's euros" })).toContain(
      "The chart is in euros on your account in each year. In the table, milestone amounts are on your account and the FI target is in today's euros.",
    )
  })

  it('says nothing about a table when there is none', () => {
    const none = caption({ tableMoney: null })
    expect(none).toContain('The chart is in 2026 euros.')
    expect(none).not.toContain('In the table')
  })

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

  it('says where the bounce is set', () => {
    expect(text).toContain('a bounce of 15,0% (the Market bounce in Assumptions)')
  })
})

describe('spreadWarning', () => {
  it('speaks at one run in twenty, from the first year it holds, and not below it', () => {
    expect(spreadWarning({ ...result, belowZero: [0, 0.049, 0.049] })).toBeNull()
    expect(spreadWarning({ ...result, belowZero: [0, 0.049, 0.05, 0.4] })).toBe(
      'In 5% of the runs the portfolio is below nothing from year 2: the house payment or an event takes more than it holds when the market is unkind.',
    )
  })

  it('does not round nearly all of the runs up to all of them', () => {
    expect(spreadWarning({ ...result, belowZero: [0, 0.9996] })).toContain('In 99% of the runs')
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
