import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CheckinList } from './CheckinList'
import { makeScenario } from '../../../testing/factories'
import type { ExpenseActions } from '../../actions'
import type { WealthAccount, WealthCheckin } from '../../../types'

function makeAccount(id: number, kind: WealthAccount['kind'] = 'investment'): WealthAccount {
  return { id, name: `Broker ${id}`, kind, sortOrder: id, archived: false }
}

function makeCheckin(
  id: number,
  date: string,
  entries: { accountId: number; valueCents: number }[],
  note?: string,
): WealthCheckin {
  return { id, checkinDate: date, createdAt: `${date}T00:00:00.000Z`, entries, ...(note ? { note } : {}) }
}

function makeActions(): ExpenseActions {
  return {
    deleteWealthCheckin: vi.fn().mockResolvedValue(undefined),
  } as unknown as ExpenseActions
}

describe('CheckinList', () => {
  it('shows empty state when no check-ins', () => {
    render(
      <CheckinList
        checkins={[]}
        accounts={[]}
        activeScenario={null}
        actions={makeActions()}
      />,
    )
    expect(screen.getByText(/no check-ins yet/i)).toBeInTheDocument()
  })

  it('renders check-in entries sorted newest first', () => {
    const accounts = [makeAccount(1)]
    const checkins = [
      makeCheckin(1, '2025-01-01', [{ accountId: 1, valueCents: 100_000_00 }]),
      makeCheckin(2, '2025-06-01', [{ accountId: 1, valueCents: 200_000_00 }]),
    ]
    render(
      <CheckinList
        checkins={checkins}
        accounts={accounts}
        activeScenario={null}
        actions={makeActions()}
      />,
    )
    const items = screen.getAllByText(/broker/i)
    expect(items.length).toBeGreaterThan(0)
  })

  it('shows note when present', () => {
    const accounts = [makeAccount(1)]
    const checkins = [makeCheckin(1, '2025-06-01', [], 'Test note here')]
    render(
      <CheckinList
        checkins={checkins}
        accounts={accounts}
        activeScenario={null}
        actions={makeActions()}
      />,
    )
    expect(screen.getByText('Test note here')).toBeInTheDocument()
  })

  it('shows on/off-track delta when scenario has planStartDate', () => {
    const scenario = makeScenario({
      planStartDate: '2020-01-01',
      monthlyContributionCents: 100_000,
    })
    const accounts = [makeAccount(1)]
    const checkins = [makeCheckin(1, '2025-06-01', [{ accountId: 1, valueCents: 999_999_99 }])]
    render(
      <CheckinList
        checkins={checkins}
        accounts={accounts}
        activeScenario={scenario}
        actions={makeActions()}
      />,
    )
    expect(screen.getByText(/history/i)).toBeInTheDocument()
  })
})
