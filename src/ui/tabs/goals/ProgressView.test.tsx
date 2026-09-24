import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { ProgressView } from './ProgressView'
import { makeScenario, makeWealthAccount, makeWealthCheckin } from '../../../testing/factories'
import { makeActions } from '../../../testing/makeActions'
import { planValueAtDate } from '../../../engine'

beforeAll(() => {
  // The check-in chart's tooltip reads a media query; jsdom has no matchMedia.
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

describe('ProgressView', () => {
  it('sends the user to Setup when there is no account to log against', () => {
    const onOpenSetup = vi.fn()
    render(
      <ProgressView
        accounts={[makeWealthAccount({ id: 1, archived: true })]}
        checkins={[]}
        milestones={[]}
        reached={new Map()}
        plan={null}
        actions={makeActions()}
        canWrite
        onOpenSetup={onOpenSetup}
      />,
    )

    expect(screen.queryByRole('button', { name: '+ Log check-in' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Set up accounts' }))
    expect(onOpenSetup).toHaveBeenCalled()
  })

  it('offers to log a check-in once an account exists, and keeps setup elsewhere', () => {
    render(
      <ProgressView
        accounts={[makeWealthAccount({ id: 1 })]}
        checkins={[]}
        milestones={[]}
        reached={new Map()}
        plan={null}
        actions={makeActions()}
        canWrite
      />,
    )

    expect(screen.getByRole('button', { name: '+ Log check-in' })).toBeInTheDocument()
    expect(screen.queryByText('Wealth accounts')).not.toBeInTheDocument()
    expect(screen.queryByText('Milestones')).not.toBeInTheDocument()
  })

  it('re-baselines the plan from the latest check-in when the steady-gap button is pressed', () => {
    const actions = makeActions()
    const plan = makeScenario({ id: 7, isActive: true, planStartDate: '2025-01-01' })
    const accounts = [makeWealthAccount({ id: 1, kind: 'investment' })]
    const behind = (id: number, date: string) =>
      makeWealthCheckin({
        id,
        checkinDate: date,
        entries: [{ accountId: 1, valueCents: planValueAtDate(plan, date)! - 50_000_00 }],
      })
    const checkins = [behind(1, '2026-01-01'), behind(2, '2026-04-01'), behind(3, '2026-07-15')]
    render(
      <ProgressView
        accounts={accounts}
        checkins={checkins}
        milestones={[]}
        reached={new Map()}
        plan={plan}
        actions={actions}
        canWrite
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Re-baseline from latest check-in' }))

    expect(actions.updateScenario).toHaveBeenCalledWith(7, {
      startInvestedCents: planValueAtDate(plan, '2026-07-15')! - 50_000_00,
      planStartDate: '2026-07-15',
    })
  })

  it('offers nothing to log in a read-only session', () => {
    render(
      <ProgressView
        accounts={[]}
        checkins={[]}
        milestones={[]}
        reached={new Map()}
        plan={null}
        actions={undefined}
        canWrite={false}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Set up accounts' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Log check-in' })).not.toBeInTheDocument()
  })
})
