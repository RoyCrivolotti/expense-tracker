import { describe, expect, it } from 'vitest'
import { samplePlan, SAMPLE_INFLATION } from '../../../../testing/samplePlan'
import { crossingYears, dateAtYears, resolveMoneyFormat, scenarioToParams } from '../../../../engine'
import { endNoteFor, inText, pickCrossings, type PickLine } from './milestonePick'

const I = SAMPLE_INFLATION
const START = '2026-01-01'
const eur = resolveMoneyFormat('EUR', 'de-DE')
const plan = samplePlan({ planStartDate: START, housePurchaseYear: null, lifeEvents: [] })
const params = scenarioToParams(plan, I)
const line = (over: Partial<PickLine> = {}): PickLine => ({ id: 'a', name: 'Plan A', color: '#123456', params, planStartDate: START, ...over })
const years = Array.from({ length: plan.horizonYears + 1 }, (_, i) => i)
const AMOUNT = 20_000_000

describe('inText', () => {
  it.each([
    [0, 'now'],
    [-3, 'now'],
    [5, 'in 5 months'],
    [1, 'in 1 month'],
    [12, 'in 1 year'],
    [24, 'in 2 years'],
    [198, 'in 16 years 6 months'],
    [13, 'in 1 year 1 month'],
  ])('says %i months as %s', (months, text) => {
    expect(inText(months)).toBe(text)
  })
})

describe('pickCrossings', () => {
  const base = { amountCents: AMOUNT, inflationRate: I, years, today: '2026-10-11', locale: 'en' }

  it('dots a path on the milestone line in Purchasing power, at the amount less the inflation so far, labelled with the calendar year', () => {
    const t = crossingYears(params, AMOUNT, I)!
    expect(t).toBeGreaterThan(0)
    const { dots, rows } = pickCrossings({ ...base, lines: [line()], nominalMode: false })
    expect(dots).toHaveLength(1)
    expect(dots[0]!.index).toBeCloseTo(t, 6)
    expect(dots[0]!.value).toBeCloseTo(AMOUNT / Math.pow(1 + I, t), 3)
    expect(dots[0]!.label).toBe(dateAtYears(START, t).slice(0, 4))
    expect(dots[0]!.color).toBe('#123456')
    expect(rows[0]!.text).toMatch(/^[A-Z][a-z]{2} \d{4}, in \d+ years?/)
  })

  it('dots it at the amount itself in Nominal', () => {
    const { dots } = pickCrossings({ ...base, lines: [line()], nominalMode: true })
    expect(dots[0]!.value).toBe(AMOUNT)
  })

  it('says a path that never gets there does not, and leaves it undotted', () => {
    const { dots, rows } = pickCrossings({ ...base, amountCents: 900_000_000_000, lines: [line()], nominalMode: false })
    expect(dots).toEqual([])
    expect(rows[0]!.text).toBe('not within its horizon')
  })

  it('keeps a row but no dot when the crossing is outside the years drawn', () => {
    const t = crossingYears(params, AMOUNT, I)!
    const window = years.filter((y) => y <= Math.floor(t) - 1)
    const { dots, rows } = pickCrossings({ ...base, years: window, lines: [line()], nominalMode: false })
    expect(dots).toEqual([])
    expect(rows).toHaveLength(1)
    expect(rows[0]!.text).toContain(',')
  })

  it('names the year of the path by its own plan start, and says the year offset when it has no start', () => {
    const later = pickCrossings({ ...base, lines: [line({ planStartDate: '2030-06-01' })], nominalMode: false })
    const t = crossingYears(params, AMOUNT, I)!
    expect(later.dots[0]!.label).toBe(dateAtYears('2030-06-01', t).slice(0, 4))
    const none = pickCrossings({ ...base, lines: [line({ planStartDate: null })], nominalMode: false })
    expect(none.dots[0]!.label).toBe(`year ${Math.round(t * 10) / 10}`)
    expect(none.rows[0]!.text).toBe(`year ${Math.round(t * 10) / 10}`)
  })

  it('gives one dot and one row for each path, in the order given', () => {
    const richer = scenarioToParams(samplePlan({ planStartDate: START, housePurchaseYear: null, lifeEvents: [], startInvestedCents: 40_000_000 }), I)
    const out = pickCrossings({ ...base, lines: [line({ id: 'a' }), line({ id: 'b', name: 'Richer', params: richer })], nominalMode: false })
    expect(out.rows.map((r) => r.id)).toEqual(['a', 'b'])
    expect(out.dots).toHaveLength(2)
    expect(out.dots[1]!.index).toBeLessThan(out.dots[0]!.index)
  })
})

describe('endNoteFor', () => {
  const base = { amountCents: AMOUNT, inflationRate: I, years, planStartDate: START, format: eur }

  it('says what the amount is worth at the end in the plan\'s money, in Purchasing power, at the height the line ends at', () => {
    const note = endNoteFor({ ...base, nominalMode: false })!
    expect(note.index).toBe(years.length - 1)
    expect(note.value).toBeCloseTo(AMOUNT / Math.pow(1 + I, plan.horizonYears), 3)
    expect(note.lines).toHaveLength(2)
    expect(note.below).toBe(true)
    expect(note.lines[0]).toMatch(/on account$/)
    expect(note.lines[1]).toMatch(/^= .* in 2026 euros$/)
  })

  it('says only the amount in Nominal, where the line is level at it', () => {
    const note = endNoteFor({ ...base, nominalMode: true })!
    expect(note.value).toBe(AMOUNT)
    expect(note.lines).toHaveLength(1)
    expect(note.below).toBeUndefined()
  })

  it('has no note with no years drawn', () => {
    expect(endNoteFor({ ...base, years: [], nominalMode: true })).toBeUndefined()
  })
})
