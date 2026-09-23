import { describe, expect, it } from 'vitest'
import { docsCaptureWealthAccounts, docsCaptureWealthCheckins } from './docsCaptureWealth'
import { docsCaptureGoalScenarios } from './docsCaptureGoalScenarios'
import { todayIso } from '../ui/components/transactionFormState'

describe('docs-capture wealth seed', () => {
  it('logs three check-ins against both accounts, the last one today', () => {
    const accounts = docsCaptureWealthAccounts()
    const checkins = docsCaptureWealthCheckins()

    expect(checkins).toHaveLength(3)
    expect(checkins[2]!.checkinDate).toBe(todayIso())
    for (const c of checkins) {
      expect(c.entries.map((e) => e.accountId)).toEqual(accounts.map((a) => a.id))
    }
  })

  it('dates every check-in after the seeded plan starts, so both Progress charts show them', () => {
    const planStart = docsCaptureGoalScenarios()[0]!.planStartDate!
    for (const c of docsCaptureWealthCheckins()) {
      expect(c.checkinDate > planStart).toBe(true)
    }
  })
})
