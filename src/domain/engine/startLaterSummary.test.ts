import { describe, expect, it } from 'vitest'
import { samplePlan, SAMPLE_INFLATION as I } from '../../testing/samplePlan'
import type { GoalScenario } from '../types'
import { EU_MONEY_FORMAT } from './money'
import { startLater, suggestedStart } from './startLater'
import {
  cannotPayLine,
  gapText,
  outcomeLine,
  paidAtStartNames,
  startLaterSummary,
  type CopyContext,
} from './startLaterSummary'
import type { CopyOutcome } from './copyOutcome'

/** ISO dates as they are, so a line is read without a locale in the way. */
const ctx = (
  start: string,
  today = '2026-11-21',
  sourceName = 'Sample plan',
): CopyContext => ({
  start,
  today,
  sourceName,
  format: EU_MONEY_FORMAT,
  formatDate: (iso) => iso,
})

function linesFor(
  plan: GoalScenario,
  date: string,
  today?: string,
): string[] {
  const s = suggestedStart(plan, null, date, I)!
  return startLaterSummary(startLater(plan, { date, investedCents: s.cents }, I)!, ctx(date, today))
}

describe('gapText', () => {
  it('says months in words, and days under a month', () => {
    expect(gapText('2033-07-03', '2034-01-01')).toBe('six months')
    expect(gapText('2030-12-01', '2031-01-01')).toBe('one month')
    expect(gapText('2030-12-20', '2031-01-01')).toBe('12 days')
    expect(gapText('2030-12-31', '2031-01-01')).toBe('1 day')
    expect(gapText('2030-01-02', '2031-01-01')).toBe('twelve months')
  })
})

describe('startLaterSummary', () => {
  it('says a house the copy buys sooner, with both dates, and what that does to net worth and invested', () => {
    const lines = linesFor(samplePlan(), '2026-07-03')
    expect(lines).toContain(
      'House (2034-01-01) is bought on 2033-07-03, six months earlier, because the copy counts its years from its own start.',
    )
    expect(lines).toContain(
      "Because the copy buys the house sooner, it owns it for longer, so its net worth can read higher than Sample plan's. Compare invested to see like with like.",
    )
    expect(lines).toContain(
      "Paying for the house sooner also means that money stops growing sooner, so the copy's invested balance reads lower than Sample plan's from then on.",
    )
    expect(lines.some((l) => l.startsWith('Plan years are whole'))).toBe(false)
  })

  it('says nothing about the house when the copy buys it on the same day as its source', () => {
    const lines = linesFor(samplePlan(), '2027-01-01')
    expect(lines.some((l) => l.includes('House') || l.includes('net worth'))).toBe(false)
  })

  it('says a cost the copy pays sooner is paid, and an inflow it receives later moves, with the whole-years line', () => {
    const plan = samplePlan({
      housePurchaseYear: null,
      lifeEvents: [
        { year: 3, amountCents: -2_000_000, label: 'Car' },
        { year: 4, amountCents: 1_000_000, label: 'Gift' },
      ],
    })
    const lines = linesFor(plan, '2026-07-03')
    expect(lines).toContain(
      'Car (2029-01-01) is paid on 2028-07-03, six months earlier, because the copy counts its years from its own start.',
    )
    expect(lines).toContain('Gift moves from 2030-01-01 to 2030-07-03.')
    expect(lines).toContain('Plan years are whole, so a later date lands on the next anniversary of the new start.')
  })

  it('says a cost in the copy’s first year is paid at its start', () => {
    const plan = samplePlan({
      housePurchaseYear: null,
      lifeEvents: [{ year: 1, amountCents: -2_000_000, label: 'Car' }],
    })
    expect(linesFor(plan, '2026-07-03')).toContain(
      'Car (2027-01-01) is paid on 2026-07-03, six months earlier, because the copy counts its years from its own start.',
    )
  })

  it('says a cost before the start is in the balance, or taken to be when its date is still to come', () => {
    const plan = samplePlan({
      housePurchaseYear: null,
      lifeEvents: [{ year: 1, amountCents: -2_000_000, label: 'Car' }],
    })
    expect(linesFor(plan, '2028-03-01', '2027-06-01')).toContain(
      "Car (2027-01-01) is before the new start, so it's already in the starting balance.",
    )
    expect(linesFor(plan, '2028-03-01', '2026-11-21')).toContain(
      'Car (2027-01-01) is before the new start, so the copy takes it to be in the starting balance.',
    )
    // An unnamed event is called by its amount.
    const unnamed = samplePlan({
      housePurchaseYear: null,
      lifeEvents: [{ year: 1, amountCents: -2_000_000, label: '' }],
    })
    expect(
      linesFor(unnamed, '2028-03-01').some((l) => l.startsWith('-20.000,00 € (2027-01-01) is before the new start')),
    ).toBe(true)
  })

  it('counts a cost dated today as having happened, and a house bought on the start itself as not bought sooner', () => {
    const car = samplePlan({
      housePurchaseYear: null,
      lifeEvents: [{ year: 1, amountCents: -2_000_000, label: 'Car' }],
    })
    expect(linesFor(car, '2028-03-01', '2027-01-01')).toContain(
      "Car (2027-01-01) is before the new start, so it's already in the starting balance.",
    )
    const lines = linesFor(samplePlan({ housePurchaseYear: 2 }), '2028-01-01')
    expect(lines.some((l) => l.includes('net worth') || l.startsWith('House ('))).toBe(false)
    expect(lines.some((l) => l.startsWith('The house purchase (2028-01-01) is behind the new start'))).toBe(true)
  })

  it('holds a house behind the start as owned, without the check-in screen’s advice to re-baseline', () => {
    const lines = linesFor(samplePlan({ housePurchaseYear: 2 }), '2028-07-03')
    const owned = lines.find((l) => l.startsWith('The house purchase (2028-01-01) is behind the new start'))
    expect(owned).toBeDefined()
    expect(owned).not.toContain('re-baseline')
    expect(lines.some((l) => l.includes('net worth'))).toBe(false)
  })

  it('says a house in the copy’s first year is bought at its start and then owned, with no "behind" for a date after it', () => {
    const lines = linesFor(samplePlan({ housePurchaseYear: 1, startInvestedCents: 20_000_000 }), '2026-07-03')
    expect(lines).toContain(
      'House (2027-01-01) is bought on 2026-07-03, six months earlier, because the copy counts its years from its own start.',
    )
    expect(lines.some((l) => l.startsWith('The plan holds the house as owned from day one'))).toBe(true)
    expect(lines.some((l) => l.includes('is behind the new start'))).toBe(false)
  })
})

describe('paidAtStartNames and cannotPayLine', () => {
  it('names what the copy pays at its start, the house first, and says what it is short by', () => {
    const plan = samplePlan({
      housePurchaseYear: 1,
      lifeEvents: [
        { year: 1, amountCents: -500_000, label: 'Car' },
        { year: 5, amountCents: -100_000, label: 'Later' },
      ],
    })
    const r = startLater(plan, { date: '2026-07-03', investedCents: 0 }, I)!
    const names = paidAtStartNames(r, '2026-07-03', EU_MONEY_FORMAT)
    expect(names).toEqual(['House', 'Car'])
    expect(cannotPayLine(names, 1_230_000, ctx('2026-07-03'))).toBe(
      "The plan can't pay for House and Car by 2026-07-03: it's 12.300 € short on that date.",
    )
    expect(cannotPayLine([], 100, ctx('2026-07-03'))).toContain('for what it pays at the start by')
  })
})

describe('paidAtStartNames on the start itself', () => {
  it('leaves out a cost dated on the start, which is in the balance rather than paid there', () => {
    const plan = samplePlan({ housePurchaseYear: null, lifeEvents: [{ year: 1, amountCents: -500_000, label: 'Car' }] })
    expect(
      paidAtStartNames(startLater(plan, { date: '2027-01-01', investedCents: 0 }, I)!, '2027-01-01', EU_MONEY_FORMAT),
    ).toEqual([])
    expect(
      paidAtStartNames(startLater(plan, { date: '2026-12-31', investedCents: 0 }, I)!, '2026-12-31', EU_MONEY_FORMAT),
    ).toEqual(['Car'])
  })
})

describe('outcomeLine', () => {
  const base: CopyOutcome = {
    netWorthAbove: null,
    endDate: '2056-01-01',
    investedGapCents: -24_945_100,
    netWorthGapCents: -1_000_000,
    sourceInvestedCents: 349_523_800,
    origin: '2026-05-01',
  }
  const say = (o: Partial<CopyOutcome>) =>
    outcomeLine({ ...base, ...o }, { sourceName: 'Path C', format: EU_MONEY_FORMAT })

  it('names the euros of the calendar’s origin, which can be another scenario’s start than the source’s', () => {
    expect(say({ origin: '2024-06-01' })).toBe(
      "In short: in 2056 its invested balance is about 249.451 € (7%) under Path C's, in 2024 euros.",
    )
  })

  it('leaves invested out when either has no figure on the day, and says nothing at all with nothing to say', () => {
    expect(
      say({ netWorthAbove: { from: '2031-02', until: '2035-09' }, investedGapCents: null, netWorthGapCents: null }),
    ).toBe("In short: its net worth reads higher than Path C's from Feb 2031 to Sep 2035.")
    expect(say({ investedGapCents: null })).toBeNull()
    expect(say({ sourceInvestedCents: null })).toBeNull()
  })

  it('says when net worth reads higher and where invested ends, in the euros of the source’s start', () => {
    expect(say({ netWorthAbove: { from: '2031-02', until: '2035-09' } })).toBe(
      "In short: its net worth reads higher than Path C's from Feb 2031 to Sep 2035, then lower. In 2056 its invested balance is about 249.451 € (7%) under Path C's, in 2026 euros.",
    )
  })

  it('leaves out "then lower" when net worth is still higher at the end, and says over for invested above', () => {
    expect(
      say({
        netWorthAbove: { from: '2028-11', until: '2056-01' },
        netWorthGapCents: 5_000_000,
        investedGapCents: 2_587_900,
        sourceInvestedCents: 362_821_500,
      }),
    ).toBe(
      "In short: its net worth reads higher than Path C's from Nov 2028 to Jan 2056. In 2056 its invested balance is about 25.879 € (1%) over Path C's, in 2026 euros.",
    )
  })

  it('says only where invested ends when net worth never reads higher, and "within" for a gap under half a percent', () => {
    expect(say({ investedGapCents: -1_000_000 })).toBe(
      "In short: in 2056 its invested balance is within 0,5% of Path C's.",
    )
  })
})
