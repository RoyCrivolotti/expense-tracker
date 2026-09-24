import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { CheckinHistoryChart } from './CheckinHistoryChart'
import { nearestScatterValue, buildCheckinTooltip, realCheckinPoints } from './checkinChartUtils'
import { makeScenario } from '../../../../testing/factories'
import { EU_MONEY_FORMAT } from '../../../../engine/money'
import type { WealthAccount, WealthCheckin } from '../../../../types'

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
})

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
        plan={makeScenario({ planStartDate: null })}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when plan is null', () => {
    const { container } = render(
      <CheckinHistoryChart checkins={[]} accounts={[]} plan={null} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders chart when scenario has planStartDate', () => {
    const scenario = makeScenario({ planStartDate: '2020-01-01' })
    const { container } = render(
      <CheckinHistoryChart checkins={[]} accounts={[]} plan={scenario} />,
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
      <CheckinHistoryChart checkins={checkins} accounts={accounts} plan={scenario} />,
    )
    const circles = container.querySelectorAll('circle')
    expect(circles.length).toBeGreaterThanOrEqual(2)
  })

  it('renders a today marker line', () => {
    const scenario = makeScenario({ planStartDate: '2020-01-01' })
    const { container } = render(
      <CheckinHistoryChart checkins={[]} accounts={[]} plan={scenario} />,
    )
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('opens on a one-year window for a plan that just started, and widens on request', () => {
    const start = new Date()
    start.setMonth(start.getMonth() - 2)
    const scenario = makeScenario({ planStartDate: start.toISOString().slice(0, 10), horizonYears: 30 })
    render(<CheckinHistoryChart checkins={[]} accounts={[]} plan={scenario} />)

    expect(screen.getByRole('radio', { name: '1Y' })).toBeChecked()

    fireEvent.click(screen.getByRole('radio', { name: '5Y' }))
    expect(screen.getByRole('radio', { name: '5Y' })).toBeChecked()
  })

  it('opens wide enough to keep today off the right edge of an older plan', () => {
    const scenario = makeScenario({ planStartDate: '2020-01-01', horizonYears: 30 })
    render(<CheckinHistoryChart checkins={[]} accounts={[]} plan={scenario} />)
    expect(screen.getByRole('radio', { name: '10Y' })).toBeChecked()
  })

  it('renders a legend with Plan and Actual entries', () => {
    const scenario = makeScenario({ planStartDate: '2020-01-01' })
    const accounts = [makeAccount(1)]
    const checkins = [makeCheckin(1, '2022-06-01', 50_000_000)]
    const { container } = render(
      <CheckinHistoryChart checkins={checkins} accounts={accounts} plan={scenario} />,
    )
    const legendItems = container.querySelectorAll('ul li')
    const labels = [...legendItems].map((li) => li.textContent)
    expect(labels).toContain('Plan')
    expect(labels).toContain('Actual')
  })
})

describe('nearestScatterValue', () => {
  it('returns the value of the nearest point within 0.5 of the index', () => {
    const points = [
      { xIndex: 2.3, value: 100 },
      { xIndex: 5.1, value: 200 },
    ]
    expect(nearestScatterValue(points, 2)).toBe(100)
    expect(nearestScatterValue(points, 5)).toBe(200)
  })

  it('returns null when no point is within 0.5', () => {
    const points = [{ xIndex: 3.8, value: 100 }]
    expect(nearestScatterValue(points, 5)).toBeNull()
  })

  it('returns null for an empty points array', () => {
    expect(nearestScatterValue([], 0)).toBeNull()
  })

  it('picks the closest point when multiple are within range', () => {
    const points = [
      { xIndex: 2.4, value: 100 },
      { xIndex: 2.1, value: 200 },
    ]
    expect(nearestScatterValue(points, 2)).toBe(200)
  })
})

describe('buildCheckinTooltip', () => {
  const format = EU_MONEY_FORMAT

  it('returns Plan line for the given year index', () => {
    const result = buildCheckinTooltip(1, ['Year 0', 'Year 1', 'Year 2'], [100_000, 200_000, 300_000], [], format)
    expect(result.title).toBe('Year 1')
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.label).toBe('Plan')
  })

  it('includes Actual line when a scatter point is nearby', () => {
    const scatter = [{ xIndex: 1.2, value: 180_000 }]
    const result = buildCheckinTooltip(1, ['Year 0', 'Year 1'], [100_000, 200_000], scatter, format)
    expect(result.lines).toHaveLength(2)
    expect(result.lines[1]!.label).toBe('Actual')
  })

  it('omits Actual line when no scatter point is nearby', () => {
    const scatter = [{ xIndex: 5, value: 180_000 }]
    const result = buildCheckinTooltip(1, ['Year 0', 'Year 1'], [100_000, 200_000], scatter, format)
    expect(result.lines).toHaveLength(1)
  })
})

describe('realCheckinPoints', () => {
  const accounts = [makeAccount(1)]

  it('brings a balance to the plan\'s money, so one exactly on plan sits on the line', () => {
    // Two years at the assumed 2% inflation: 104.040 in the money of the day is 100.000 of the start's.
    const points = realCheckinPoints([makeCheckin(1, '2027-01-01', 104_040_00)], accounts, '2025-01-01', 10, 1)
    expect(points).toHaveLength(1)
    expect(points[0]!.value).toBeGreaterThan(99_900_00)
    expect(points[0]!.value).toBeLessThan(100_100_00)
    // Not the raw balance: leaving it nominal would read as ahead of a plan it is exactly on.
    expect(points[0]!.value).not.toBe(104_040_00)
    expect(points[0]!.xIndex).toBeCloseTo(2, 1)
  })

  it('leaves out check-ins before the plan starts or past the window, and scales x by the step', () => {
    const checkins = [
      makeCheckin(1, '2024-06-01', 50_000_00),
      makeCheckin(2, '2026-01-01', 60_000_00),
      makeCheckin(3, '2031-01-01', 90_000_00),
    ]
    const points = realCheckinPoints(checkins, accounts, '2025-01-01', 3, 0.5)
    expect(points).toHaveLength(1)
    expect(points[0]!.xIndex).toBeCloseTo(2, 1)
  })
})
