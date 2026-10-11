import { describe, expect, it } from 'vitest'
import { samplePlan, SAMPLE_INFLATION } from '../../testing/samplePlan'
import { projectNetWorth } from './projection'
import { planLineOf, planValueAt, planValueBefore } from './planLine'
import { scenarioToParams } from './scenarioProjection'
import { realToNominal, trackStatus, yearOffsetFromDate } from './wealthTracking'
import type { WealthAccount, WealthCheckin } from '../types'

const accounts: WealthAccount[] = [{ id: 1, name: 'Broker', kind: 'investment', sortOrder: 1, archived: false }]
const plan = samplePlan({ id: 1, isActive: true })
const line = planLineOf(projectNetWorth(scenarioToParams(plan, SAMPLE_INFLATION)))

/** The status of a check-in whose balance is `realCents` in the plan's money on `date`. */
function statusFor(date: string, realCents: number) {
  const nominal = realToNominal(realCents, '2026-01-01', date, SAMPLE_INFLATION)
  const checkin: WealthCheckin = { id: 1, checkinDate: date, createdAt: `${date}T00:00:00Z`, entries: [{ accountId: 1, valueCents: nominal }] }
  return trackStatus(checkin, plan, accounts, SAMPLE_INFLATION)!
}
const lineOn = (date: string) => planValueAt(line, yearOffsetFromDate('2026-01-01', date)!)!

describe('trackStatus around the house payment on 1 January 2034', () => {
  it('is on track, against the line itself, for someone on plan the week before', () => {
    const status = statusFor('2033-12-25', lineOn('2033-12-25'))
    expect(status.onTrack).toBe(true)
    expect(status.nearStep).toBeNull()
    expect(status.deltaCents).toBeLessThanOrEqual(5)
    expect(status.deltaCents).toBeGreaterThanOrEqual(-5)
  })

  it('reads a payment made a fortnight early against the plan with it made, not as 70.000 behind', () => {
    // The plan has the portfolio at its pre-payment value on 18 December; this one has already paid.
    const date = '2033-12-18'
    const offset = yearOffsetFromDate('2026-01-01', date)!
    const paid = lineOn(date) - (planValueBefore(line, 8)! - planValueAt(line, 8)!)
    const status = statusFor(date, paid)
    expect(offset).toBeLessThan(8)
    expect(status.nearStep).toEqual({ date: '2034-01-01', counted: 'made' })
    expect(status.onTrack).toBe(true)
    expect(Math.abs(status.deltaCents)).toBeLessThan(300_000)
    expect(status.deltaMonths).toBeNull()
    expect(status.monthsReason).toBeNull()
  })

  it('reads a payment not yet made a fortnight late against the plan without it', () => {
    const date = '2034-01-15'
    const notYet = lineOn(date) + (planValueBefore(line, 8)! - planValueAt(line, 8)!)
    const status = statusFor(date, notYet)
    expect(status.nearStep).toEqual({ date: '2034-01-01', counted: 'not-made' })
    expect(status.onTrack).toBe(true)
    expect(Math.abs(status.deltaCents)).toBeLessThan(300_000)
  })

  it('reads a check-in on the anniversary itself that has not paid yet as on track', () => {
    const status = statusFor('2034-01-01', planValueBefore(line, 8)!)
    expect(status.onTrack).toBe(true)
    expect(status.nearStep?.counted).toBe('not-made')
  })

  it('does not guess for a balance that is on neither path, and gives the gap in money with no months', () => {
    const date = '2033-12-18'
    // 20.000 under the line is nearer the line than the plan with the payment made (about 70.000 under it).
    const status = statusFor(date, lineOn(date) - 2_000_000)
    expect(status.nearStep).toBeNull()
    expect(status.onTrack).toBe(false)
    expect(status.deltaCents).toBeLessThan(0)
  })

  it('keeps the plain reading further than a month from the anniversary', () => {
    // The line still climbs about 3.000 before the payment, so 1.500 ahead is a lead it reaches in the stretch.
    const status = statusFor('2033-11-01', lineOn('2033-11-01') + 150_000)
    expect(status.nearStep).toBeNull()
    expect(status.deltaMonths).not.toBeNull()
  })
})
