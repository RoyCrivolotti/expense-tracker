import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('../../hooks/isNativeDatePicker', () => ({ isNativeDatePicker: () => true }))

import { CheckinFormSheet } from './CheckinFormSheet'
import { todayIso } from '../../components/transactionFormState'
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

  it('caps the date field at today so a check-in cannot be future-dated', () => {
    render(<CheckinFormSheet accounts={[makeAccount(1)]} actions={makeActions()} />)
    const dateInput = screen.getByLabelText<HTMLInputElement>(/date/i)
    expect(dateInput.max).toBe(todayIso())
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

describe('CheckinFormSheet when the save fails', () => {
  it('says so, instead of just re-enabling the button', async () => {
    // The whole Goals tab had no catch anywhere, so a rejected save was an unhandled
    // promise and the only feedback was the spinner stopping. The server refuses a
    // future-dated check-in, which a clock past its slack is enough to reach.
    const actions = {
      createWealthCheckin: vi.fn().mockRejectedValue(new Error('checkinDate cannot be in the future')),
    } as unknown as ExpenseActions
    render(<CheckinFormSheet accounts={[makeAccount(1)]} actions={actions} />)

    await userEvent.click(screen.getByRole('button', { name: /save check-in/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('checkinDate cannot be in the future')
    expect(screen.getByRole('button', { name: /save check-in/i })).toBeEnabled()
  })

  it('does not leave a stale message on the next attempt', async () => {
    const createWealthCheckin = vi
      .fn()
      .mockRejectedValueOnce(new Error('checkinDate cannot be in the future'))
      .mockResolvedValueOnce({ id: 1, checkinDate: '2026-01-01', entries: [] })
    const actions = { createWealthCheckin } as unknown as ExpenseActions
    const onDone = vi.fn()
    render(<CheckinFormSheet accounts={[makeAccount(1)]} actions={actions} onDone={onDone} />)

    await userEvent.click(screen.getByRole('button', { name: /save check-in/i }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /save check-in/i }))
    await vi.waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('CheckinFormSheet east of UTC', () => {
  // 08:00 on the 16th in Auckland is still the 15th in UTC. A UTC-based "today" caps the
  // field a day short there, so the user cannot log the day they are actually living in.
  const original = process.env.TZ

  beforeAll(() => {
    process.env.TZ = 'Pacific/Auckland'
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-15T20:00:00Z'))
  })

  afterAll(() => {
    vi.useRealTimers()
    process.env.TZ = original
  })

  it('defaults to and caps at the local date, not the UTC one', () => {
    render(<CheckinFormSheet accounts={[makeAccount(1)]} actions={makeActions()} />)
    const dateInput = screen.getByLabelText<HTMLInputElement>(/date/i)

    expect(dateInput.value).toBe('2026-09-16')
    expect(dateInput.max).toBe('2026-09-16')
  })
})
