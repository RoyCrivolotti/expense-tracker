import { describe, expect, it } from 'vitest'
import { EU_MONEY_FORMAT } from '../../../engine'
import { contributionPhrase } from './contributionText'

describe('contributionPhrase', () => {
  it('is the monthly amount alone for a scenario that never changes it', () => {
    expect(contributionPhrase({ monthlyContributionCents: 1_500_00, contributionSchedule: [] }, EU_MONEY_FORMAT)).toBe(
      '1.500,00 €/mo',
    )
  })

  it('reads a scenario cached before the schedule existed as never changing it', () => {
    expect(
      contributionPhrase({ monthlyContributionCents: 1_500_00 } as never, EU_MONEY_FORMAT),
    ).toBe('1.500,00 €/mo')
  })

  it('names one change with its month', () => {
    expect(
      contributionPhrase(
        { monthlyContributionCents: 1_500_00, contributionSchedule: [{ from: '2028-03', monthlyCents: 2_500_00 }] },
        EU_MONEY_FORMAT,
      ),
    ).toBe("1.500,00 €/mo, then 2.500,00 €/mo from Mar '28")
  })

  it('lists several in order, joining the last with "and", and a pause as an amount of nothing', () => {
    expect(
      contributionPhrase(
        {
          monthlyContributionCents: 1_500_00,
          contributionSchedule: [
            { from: '2027-01', monthlyCents: 2_000_00 },
            { from: '2028-03', monthlyCents: 2_500_00 },
            { from: '2030-01', monthlyCents: 0 },
          ],
        },
        EU_MONEY_FORMAT,
      ),
    ).toBe("1.500,00 €/mo, then 2.000,00 €/mo from Jan '27, 2.500,00 €/mo from Mar '28 and 0,00 €/mo from Jan '30")
  })
})
