import { describe, expect, it } from 'vitest'
import { EU_MONEY_FORMAT, planFromToday, planValueAtDate, realToNominal } from '../../../../engine'
import { makeScenario } from '../../../../testing/factories'
import { scenarioToDraft } from '../scenarioDraft'
import { comparisonRows } from './comparisonRows'

describe('comparisonRows names', () => {
  const original = makeScenario({ id: 1, name: 'Path A: Invest only' })
  const copy = makeScenario({ id: 2, name: 'Path A: Invest only (copy)' })
  const other = makeScenario({ id: 3, name: 'Path B: House now' })
  const draft = scenarioToDraft(original)

  it('cuts a name at its colon when nobody else would be given the same one', () => {
    const rows = comparisonRows([original, other], draft, EU_MONEY_FORMAT, 0.02, false)

    expect(rows.map((r) => r.name)).toEqual(['Path A', 'Path B'])
  })

  it('keeps the full name of a copy and its original, which would both be Path A', () => {
    const rows = comparisonRows([original, copy, other], draft, EU_MONEY_FORMAT, 0.02, true)

    expect(rows.map((r) => r.name)).toEqual([
      'Path A: Invest only',
      'Path A: Invest only (copy)',
      'Path B',
      'Path A: Invest only (editing)',
    ])
  })
})

describe('comparisonRows FI for a plan and its restart', () => {
  const plan = makeScenario({ id: 1, name: 'Path A', isActive: true, planStartDate: '2024-01-01', housePurchaseYear: null, annualSpendCents: 3_000_000, safeWithdrawalRate: 0.04 })
  const draft = scenarioToDraft(plan)
  const onLine = (date: string) => realToNominal(planValueAtDate(plan, date, 0.02)!, '2024-01-01', date, 0.02)

  it('gives both as a month, the same one for a restart exactly on the plan, instead of years counted from two starts', () => {
    const date = '2027-03-05'
    const rows = comparisonRows([plan], draft, EU_MONEY_FORMAT, 0.02, false, null, planFromToday(plan, { investedCents: onLine(date), date }, 0.02))
    expect(rows.map((r) => r.name)).toEqual(['Path A', 'Path A, from today'])
    expect(rows[0]!.fi).toMatch(/^around [A-Z][a-z]{2} 20\d\d$/)
    expect(rows[1]!.fi).toBe(rows[0]!.fi)
  })

  it('shows the restart of a plan that is behind as the later month it is, not as a year sooner', () => {
    const date = '2027-03-05'
    const behind = planFromToday(plan, { investedCents: Math.round(onLine(date) * 0.7), date }, 0.02)
    const rows = comparisonRows([plan], draft, EU_MONEY_FORMAT, 0.02, false, null, behind)
    const month = (text: string) => new Date(`1 ${text.replace('around ', '')} UTC`).getTime()
    expect(month(rows[1]!.fi)).toBeGreaterThan(month(rows[0]!.fi))
  })

  it('leaves the years as they were without a restart, and for the other rows', () => {
    const rows = comparisonRows([plan, makeScenario({ id: 2, name: 'Path B', planStartDate: '2024-01-01' })], draft, EU_MONEY_FORMAT, 0.02, false)
    expect(rows.every((r) => /^(year \d+|now|not in horizon)$/.test(r.fi))).toBe(true)
  })
})

