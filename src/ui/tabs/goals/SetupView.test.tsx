import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SetupView } from './SetupView'
import { defaultExpenseSettings } from '../../../engine'
import { makeWealthAccount } from '../../../testing/factories'
import { makeActions } from '../../../testing/makeActions'

describe('SetupView', () => {
  it('shows the milestone editor and the wealth accounts', () => {
    render(
      <SetupView
        accounts={[makeWealthAccount({ id: 1, name: 'Broker' })]}
        checkins={[]}
        settings={defaultExpenseSettings()}
        actions={makeActions()}
        onSettingsChange={vi.fn()}
      />,
    )

    expect(screen.getByText('Milestones')).toBeInTheDocument()
    expect(screen.getByText('Wealth accounts')).toBeInTheDocument()
    expect(screen.getByText('Broker')).toBeInTheDocument()
  })

  it('says so in a read-only session instead of offering editors', () => {
    render(
      <SetupView
        accounts={[]}
        checkins={[]}
        settings={defaultExpenseSettings()}
        actions={undefined}
        onSettingsChange={undefined}
      />,
    )

    expect(screen.getByText(/Read-only session/)).toBeInTheDocument()
    expect(screen.queryByText('Wealth accounts')).not.toBeInTheDocument()
  })
})
