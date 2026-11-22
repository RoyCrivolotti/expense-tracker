import { describe, expect, it } from 'vitest'
import { EU_MONEY_FORMAT, SCENARIO_NAME_MAX_LENGTH, suggestedStart } from '../../../engine'
import { makeScenario } from '../../../testing/factories'
import { samplePlan, SAMPLE_INFLATION as I, TEST_INFLATION_RATES } from '../../../testing/samplePlan'
import type { NewGoalScenario } from '../../../data/dataSource'
import { scenarioToDraft } from './scenarioDraft'
import { startLater } from '../../../engine'
import { comparisonRows } from './charts/comparisonRows'
import {
  checkinOnOrBefore,
  copyName,
  defaultStartDate,
  outcomeOnTable,
  ownsHouseBy,
  startLaterView,
  startRefusal,
  type StartLaterInputs,
} from './startLaterModel'

const iso = (d: string) => d

function inputs(
  source: NewGoalScenario,
  over: Partial<StartLaterInputs> = {},
): StartLaterInputs {
  return {
    source,
    checkins: [],
    scenarios: [makeScenario({ id: 1, color: '#6366f1' }), makeScenario({ id: 2, color: '#10b981' })],
    inflationRate: I,
    today: '2026-11-21',
    format: EU_MONEY_FORMAT,
    formatDate: iso,
    ...over,
  }
}

const plan = scenarioToDraft(samplePlan({ housePurchaseYear: null }))
const choose = (
  date: string,
  typedCents: number | null = null,
  typedName: string | null = null,
) => ({ date, typedCents, typedName })

describe('startRefusal', () => {
  it('refuses a source with no start, a date before it, and a date past its last year, naming the year', () => {
    expect(startRefusal({ ...plan, planStartDate: null }, '2028-01-01', iso)).toBe(
      'Sample plan has no start date. Set one under Plan start first.',
    )
    expect(startRefusal(plan, '2025-12-31', iso)).toBe("Pick a date on or after Sample plan's start, 2026-01-01.")
    expect(startRefusal(plan, '2056-01-02', iso)).toBe("Pick a date before Sample plan's last year, 2056.")
    expect(startRefusal(plan, '2056-01-01', iso)).toBeNull()
    expect(startRefusal(plan, '2026-01-01', iso)).toBeNull()
  })
})

describe('the date and the name it starts with', () => {
  const checkins = [
    { investedCents: 1, date: '2026-03-01' },
    { investedCents: 2, date: '2026-09-01' },
    { investedCents: 3, date: '2026-06-01' },
  ]
  it('opens on the latest check-in, else today, and reads the latest check-in on or before a date', () => {
    expect(defaultStartDate(checkins, '2026-11-21')).toBe('2026-09-01')
    expect(defaultStartDate([], '2026-11-21')).toBe('2026-11-21')
    expect(checkinOnOrBefore(checkins, '2026-08-31')?.investedCents).toBe(3)
    expect(checkinOnOrBefore(checkins, '2026-02-01')).toBeNull()
  })

  it('names the copy after its source and the year, inside the longest name a scenario may have', () => {
    expect(copyName('Path B', '2028-11-15')).toBe('Path B, from 2028')
    const long = copyName('x'.repeat(SCENARIO_NAME_MAX_LENGTH), '2028-11-15')
    expect(long).toHaveLength(SCENARIO_NAME_MAX_LENGTH)
    expect(long.endsWith(', from 2028')).toBe(true)
  })
})

describe('startLaterView', () => {
  it('says where the balance came from in each case', () => {
    const checkin = { investedCents: 9_000_000, date: '2028-01-01' }
    const onDay = startLaterView(inputs(plan, { checkins: [checkin] }), choose('2028-01-01'))
    expect(onDay.sourceLine).toBe('Your investments in your check-in of 2028-01-01.')
    expect(onDay.balanceCents).toBe(9_000_000)
    const carried = startLaterView(inputs(plan, { checkins: [checkin] }), choose('2029-07-01'))
    expect(carried.sourceLine).toMatch(
      /^Sample plan, carried on from your check-in of 2028-01-01, has about [\d.]+ € on that date\.$/,
    )
    const own = startLaterView(inputs(plan), choose('2029-07-01'))
    expect(own.sourceLine).toBe("Sample plan's own line on that date.")
    expect(own.balanceHint).toBe('in 2029 euros')
    const refused = startLaterView(inputs(plan), choose('2020-01-01'))
    expect(refused.refusal).not.toBeNull()
    expect(refused.sourceLine).toBe('Type what you expect to have invested on that date.')
    expect(refused.input).toBeNull()
  })

  it('follows the suggestion as the date moves until a balance is typed, then keeps the typed one and offers the suggestion back', () => {
    const a = startLaterView(inputs(plan), choose('2028-01-01'))
    const b = startLaterView(inputs(plan), choose('2030-01-01'))
    expect(b.balanceCents).not.toBe(a.balanceCents)
    expect(b.balanceCents).toBe(suggestedStart(plan, null, '2030-01-01', I)!.cents)
    expect(b.useCents).toBeNull()
    const typed = startLaterView(inputs(plan), choose('2030-01-01', 12_345_600))
    expect(typed.balanceCents).toBe(12_345_600)
    expect(typed.useCents).toBe(b.balanceCents)
    expect(typed.input?.startInvestedCents).toBe(12_345_600)
    // Typed to the suggestion itself, there is nothing to offer back.
    expect(startLaterView(inputs(plan), choose('2030-01-01', b.balanceCents)).useCents).toBeNull()
  })

  it('makes a copy that is not the plan, in a colour no scenario has, last in the list, named as typed', () => {
    const view = startLaterView(inputs(scenarioToDraft(samplePlan())), choose('2028-11-15', null, '  House later  '))
    expect(view.input).not.toBeNull()
    expect(view.input).not.toHaveProperty('isActive')
    expect(view.input).not.toHaveProperty('id')
    expect(view.input!.name).toBe('House later')
    expect(view.input!.sortOrder).toBe(2)
    expect(['#6366f1', '#10b981']).not.toContain(view.input!.color)
    expect(view.input!.planStartDate).toBe('2028-11-15')
    expect(startLaterView(inputs(plan), choose('2028-11-15', null, '   ')).input).toBeNull()
  })

  it('says how far under the line the suggestion is only when it is more than a few euros', () => {
    // A heavy saver started half way through a year needs a lowering worth saying.
    const saver = scenarioToDraft(
      samplePlan({ housePurchaseYear: null, startInvestedCents: 100_000, monthlyContributionCents: 500_000 }),
    )
    const lowered = startLaterView(inputs(saver), choose('2026-07-03'))
    expect(lowered.lowerLine).toMatch(
      /^That's [\d.]+ € less than Sample plan has on that date\. A copy that starts part way through Sample plan's year/,
    )
    expect(startLaterView(inputs(plan), choose('2027-01-01')).lowerLine).toBeNull()
  })

  it('offers no balance a plan cannot pay at the start, and waits for one to be typed', () => {
    const broke = scenarioToDraft(samplePlan({ housePurchaseYear: 1 }))
    const view = startLaterView(inputs(broke), choose('2026-07-03'))
    expect(view.sourceLine).toBe("The plan can't pay for House by 2026-07-03: it's 9.471 € short on that date.")
    expect(view.balanceCents).toBe(0)
    expect(view.input).toBeNull()
    expect(view.balanceHint).toBe('in 2026 euros, after buying the house')
    expect(startLaterView(inputs(broke), choose('2026-07-03', 5_000_000)).input).not.toBeNull()
  })

  it('says a check-in is taken as after buying for a source that owns its house by then, and offers its own line', () => {
    const owner = scenarioToDraft(samplePlan({ housePurchaseYear: 0, startInvestedCents: 2_000_000 }))
    for (const inflationRate of TEST_INFLATION_RATES) {
      const view = startLaterView(
        inputs(owner, { inflationRate, checkins: [{ investedCents: 9_000_000, date: '2026-06-01' }] }),
        choose('2028-01-01'),
      )
      const own = suggestedStart(owner, null, '2028-01-01', inflationRate)!.cents
      expect(view.houseNote?.cents).toBe(own)
      expect(view.houseNote?.text).toMatch(
        /^This counts your check-in as after buying the house, as Sample plan has it\. If you have not bought it, Sample plan's own line has about [\d.]+ € on that date\.$/,
      )
      expect(view.balanceCents).toBeGreaterThan(own)
    }
    // Not for a source that buys after the check-in, nor for one read off its own line.
    expect(
      startLaterView(
        inputs(scenarioToDraft(samplePlan()), { checkins: [{ investedCents: 9_000_000, date: '2026-06-01' }] }),
        choose('2028-01-01'),
      ).houseNote,
    ).toBeNull()
    expect(startLaterView(inputs(owner), choose('2028-01-01')).houseNote).toBeNull()
  })

  it('sums up what the copy comes to, and lists what changes', () => {
    const view = startLaterView(inputs(scenarioToDraft(samplePlan())), choose('2026-07-03'))
    expect(view.outcome).toMatch(/^In short: its net worth reads higher than Sample plan's from /)
    expect(view.lines.some((l) => l.startsWith('House (2034-01-01) is bought on 2033-07-03'))).toBe(true)
  })
})

describe('ownsHouseBy', () => {
  it('is true from the start for a house owned then, from the purchase on for one bought later, and never without one', () => {
    expect(ownsHouseBy({ housePurchaseYear: 0, planStartDate: '2026-01-01' }, '2026-01-01')).toBe(true)
    expect(ownsHouseBy({ housePurchaseYear: 8, planStartDate: '2026-01-01' }, '2033-12-31')).toBe(false)
    expect(ownsHouseBy({ housePurchaseYear: 8, planStartDate: '2026-01-01' }, '2034-01-01')).toBe(true)
    expect(ownsHouseBy({ housePurchaseYear: null, planStartDate: '2026-01-01' }, '2040-01-01')).toBe(false)
    expect(ownsHouseBy({ housePurchaseYear: 0, planStartDate: null }, '2040-01-01')).toBe(false)
  })
})

describe('the sum-up, read where the table reads', () => {
  it('quotes the gap the table shows once the copy is made, with an earlier scenario setting the calendar and the year', () => {
    const a = samplePlan({
      id: 1,
      name: 'Path A',
      planStartDate: '2024-06-01',
      horizonYears: 28,
      housePurchaseYear: null,
      color: '#6366f1',
    })
    const b = samplePlan({ id: 2, name: 'Path B', isActive: false, color: '#10b981' })
    for (const inflationRate of TEST_INFLATION_RATES) {
      const view = inputs(scenarioToDraft(b), { scenarios: [a, b], inflationRate })
      const date = '2028-03-15'
      const s = suggestedStart(b, null, date, inflationRate)!
      const made = startLater(b, { date, investedCents: s.cents }, inflationRate)!
      const outcome = outcomeOnTable(view, made)!
      const copy = { ...b, ...made.patch, id: 3, name: 'Path B, from 2028', isActive: false }
      const rows = comparisonRows([a, b, copy], scenarioToDraft(copy), EU_MONEY_FORMAT, inflationRate, false)
      const row = (name: string) => rows.find((r) => r.name === name)!
      expect(outcome.origin).toBe('2024-06-01')
      // Path A ends first, so the table rests on its last year, 2052, which is not Path B's own end.
      expect(outcome.endDate.slice(0, 4)).toBe('2052')
      expect(row('Path B').atYear).toBe(28)
      expect(outcome.investedGapCents).toBe(row('Path B, from 2028').investedCents! - row('Path B').investedCents!)
      expect(outcome.netWorthGapCents).toBe(row('Path B, from 2028').netWorthCents! - row('Path B').netWorthCents!)
      expect(startLaterView(view, choose(date)).outcome).toMatch(/In 2052 its invested balance /)
    }
  })

  it('says nothing about a copy no one can make yet, from a balance that is neither offered nor typed', () => {
    const broke = scenarioToDraft(samplePlan({ housePurchaseYear: 1 }))
    expect(startLaterView(inputs(broke), choose('2026-07-03')).outcome).toBeNull()
    expect(startLaterView(inputs(broke), choose('2026-07-03', 9_000_000)).outcome).not.toBeNull()
  })

  it('says the balance is after buying for a house owned from day one too', () => {
    const owner = scenarioToDraft(samplePlan({ housePurchaseYear: 0 }))
    expect(startLaterView(inputs(owner), choose('2028-03-01')).balanceHint).toBe(
      'in 2028 euros, after buying the house',
    )
    expect(startLaterView(inputs(plan), choose('2028-03-01')).balanceHint).toBe('in 2028 euros')
  })
})
