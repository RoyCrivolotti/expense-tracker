import { describe, expect, it } from 'vitest'
import { DEFAULT_HORIZON_YEARS, DEFAULT_REAL_RETURN } from '../../../engine'
import { makeDataset, makeWealthAccount, makeWealthCheckin } from '../../../testing/factories'
import { todayIso } from '../../components/transactionFormState'
import { draftFromDataset } from './goalsDefaults'

describe('draftFromDataset', () => {
  it('starts from the latest check-in, on the day it was taken', () => {
    const broker = makeWealthAccount({ id: 1, kind: 'investment' })
    const savings = makeWealthAccount({ id: 2, kind: 'cash' })
    const dataset = makeDataset({
      wealthAccounts: [broker, savings],
      wealthCheckins: [
        makeWealthCheckin({
          id: 1,
          checkinDate: '2026-08-05',
          entries: [
            { accountId: 1, valueCents: 11_000_000 },
            { accountId: 2, valueCents: 6_000_000 },
          ],
        }),
        makeWealthCheckin({
          id: 2,
          checkinDate: '2026-09-11',
          entries: [
            { accountId: 1, valueCents: 11_700_000 },
            { accountId: 2, valueCents: 6_900_000 },
          ],
        }),
      ],
    })

    const draft = draftFromDataset(dataset, 40_000)

    // Invested only: the plan projects the portfolio, and cash is not part of it.
    expect(draft.startInvestedCents).toBe(11_700_000)
    expect(draft.planStartDate).toBe('2026-09-11')
    expect(draft.monthlyContributionCents).toBe(40_000)
  })

  it('never seeds a contribution below zero', () => {
    expect(draftFromDataset(makeDataset(), -40_000).monthlyContributionCents).toBe(0)
  })

  it('starts from zero today when nothing has been checked in yet', () => {
    const draft = draftFromDataset(makeDataset(), 0)

    expect(draft.startInvestedCents).toBe(0)
    expect(draft.planStartDate).toBe(todayIso())
    expect(draft.name).toBe('New plan')
    expect(draft.expectedRealReturn).toBe(DEFAULT_REAL_RETURN)
    expect(draft.horizonYears).toBe(DEFAULT_HORIZON_YEARS)
    expect(draft.housePurchaseYear).toBeNull()
    expect(draft.lifeEvents).toEqual([])
  })
})
