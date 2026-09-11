import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../hooks/useIsNativeDatePicker', () => ({ useIsNativeDatePicker: () => true }))

import { CheckinFormSheet } from './CheckinFormSheet'
import type { ExpenseActions } from '../../actions'
import type { WealthAccount } from '../../../types'

function makeAccount(id: number, kind: WealthAccount['kind'] = 'investment'): WealthAccount {
  return { id, name: `Account ${id}`, kind, sortOrder: id, archived: false }
}

function makeActions(): ExpenseActions {
  return {
    createWealthCheckin: vi.fn().mockResolvedValue({ id: 1, checkinDate: '2025-06-01', entries: [] }),
  } as unknown as ExpenseActions
}

describe('CheckinFormSheet', () => {
  it('shows empty state when no accounts exist', () => {
    render(<CheckinFormSheet accounts={[]} actions={makeActions()} />)
    expect(screen.getByText(/add at least one wealth account/i)).toBeInTheDocument()
  })

  it('renders input fields for each active account', () => {
    const accounts = [makeAccount(1), makeAccount(2, 'cash')]
    render(<CheckinFormSheet accounts={accounts} actions={makeActions()} />)
    expect(screen.getByLabelText(/value for account 1/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/value for account 2/i)).toBeInTheDocument()
  })

  it('renders date input defaulting to today', () => {
    render(<CheckinFormSheet accounts={[makeAccount(1)]} actions={makeActions()} />)
    const dateInput = screen.getByLabelText(/date/i)
    expect(dateInput).toBeInTheDocument()
    expect((dateInput as HTMLInputElement).type).toBe('date')
  })

  it('calls createWealthCheckin when form is submitted', async () => {
    const actions = makeActions()
    const user = userEvent.setup()
    render(<CheckinFormSheet accounts={[makeAccount(1)]} actions={actions} />)
    await user.click(screen.getByRole('button', { name: /save check-in/i }))
    expect(actions.createWealthCheckin).toHaveBeenCalled()
  })

  it('calls onDone when cancel is clicked', async () => {
    const onDone = vi.fn()
    const user = userEvent.setup()
    render(
      <CheckinFormSheet accounts={[makeAccount(1)]} actions={makeActions()} onDone={onDone} />,
    )
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onDone).toHaveBeenCalled()
  })

  it('skips archived accounts', () => {
    const archived: WealthAccount = { id: 2, name: 'Old account', kind: 'cash', sortOrder: 2, archived: true }
    render(<CheckinFormSheet accounts={[makeAccount(1), archived]} actions={makeActions()} />)
    expect(screen.queryByLabelText(/value for old account/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/value for account 1/i)).toBeInTheDocument()
  })

  it('renders note field', () => {
    render(<CheckinFormSheet accounts={[makeAccount(1)]} actions={makeActions()} />)
    expect(screen.getByPlaceholderText(/market correction/i)).toBeInTheDocument()
  })
})
