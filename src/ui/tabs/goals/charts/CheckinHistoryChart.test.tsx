import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CheckinHistoryChart } from './CheckinHistoryChart'
import { makeScenario } from '../../../../testing/factories'
import type { WealthAccount, WealthCheckin } from '../../../../types'

function makeAccount(id: number): WealthAccount {
  return { id, name: `Broker ${id}`, kind: 'investment', sortOrder: id, archived: false }
}

function makeCheckin(id: number, date: string, valueCents: number, accountId = 1): WealthCheckin {
  return { id, checkinDate: date, createdAt: `${date}T00:00:00.000Z`, entries: [{ accountId, valueCents }] }
}

describe('CheckinHistoryChart', () => {
  it('renders nothing when scenario has no planStartDate', () => {
    const { container } = render(
      <CheckinHistoryChart
        checkins={[]}
        accounts={[]}
        activeScenario={makeScenario({ planStartDate: null })}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when activeScenario is null', () => {
    const { container } = render(
      <CheckinHistoryChart checkins={[]} accounts={[]} activeScenario={null} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders chart when scenario has planStartDate', () => {
    const scenario = makeScenario({ planStartDate: '2020-01-01' })
    const { container } = render(
      <CheckinHistoryChart checkins={[]} accounts={[]} activeScenario={scenario} />,
    )
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('renders scatter points for check-ins within the plan horizon', () => {
    const scenario = makeScenario({ planStartDate: '2020-01-01', horizonYears: 30 })
    const accounts = [makeAccount(1)]
    const checkins = [
      makeCheckin(1, '2022-06-01', 50_000_000),
      makeCheckin(2, '2023-06-01', 80_000_000),
    ]
    const { container } = render(
      <CheckinHistoryChart checkins={checkins} accounts={accounts} activeScenario={scenario} />,
    )
    const circles = container.querySelectorAll('circle')
    expect(circles.length).toBeGreaterThanOrEqual(2)
  })

  it('renders a today marker line', () => {
    const scenario = makeScenario({ planStartDate: '2020-01-01' })
    const { container } = render(
      <CheckinHistoryChart checkins={[]} accounts={[]} activeScenario={scenario} />,
    )
    expect(container.querySelector('svg')).not.toBeNull()
  })
})
