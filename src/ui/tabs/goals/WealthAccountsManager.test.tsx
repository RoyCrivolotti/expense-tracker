import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { WealthAccountsManager } from './WealthAccountsManager'
import type { ExpenseActions } from '../../actions'
import type { WealthAccount } from '../../../types'

function makeAccount(id: number): WealthAccount {
  return { id, name: `Broker ${id}`, kind: 'investment', sortOrder: id, archived: false }
}

function makeActions(): ExpenseActions {
  return {
    createWealthAccount: vi.fn().mockResolvedValue(makeAccount(99)),
    deleteWealthAccount: vi.fn().mockResolvedValue(undefined),
  } as unknown as ExpenseActions
}

describe('WealthAccountsManager', () => {
  it('renders existing accounts', () => {
    render(<WealthAccountsManager accounts={[makeAccount(1)]} actions={makeActions()} />)
    expect(screen.getByText('Broker 1')).toBeInTheDocument()
  })

  it('shows empty list and add button when no accounts', () => {
    render(<WealthAccountsManager accounts={[]} actions={makeActions()} />)
    expect(screen.getByRole('button', { name: /add account/i })).toBeInTheDocument()
  })

  it('shows form when add account is clicked', async () => {
    const user = userEvent.setup()
    render(<WealthAccountsManager accounts={[]} actions={makeActions()} />)
    await user.click(screen.getByRole('button', { name: /add account/i }))
    expect(screen.getByPlaceholderText(/account name/i)).toBeInTheDocument()
  })

  it('hides form on cancel', async () => {
    const user = userEvent.setup()
    render(<WealthAccountsManager accounts={[]} actions={makeActions()} />)
    await user.click(screen.getByRole('button', { name: /add account/i }))
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.queryByPlaceholderText(/account name/i)).not.toBeInTheDocument()
  })

  it('calls createWealthAccount when form is submitted with a name', async () => {
    const actions = makeActions()
    const user = userEvent.setup()
    render(<WealthAccountsManager accounts={[]} actions={actions} />)
    await user.click(screen.getByRole('button', { name: /add account/i }))
    await user.type(screen.getByPlaceholderText(/account name/i), 'My Broker')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(actions.createWealthAccount).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'My Broker', kind: 'investment' }),
    )
  })

  it('calls deleteWealthAccount when delete button is clicked', async () => {
    const actions = makeActions()
    const user = userEvent.setup()
    render(<WealthAccountsManager accounts={[makeAccount(1)]} actions={actions} />)
    await user.click(screen.getByRole('button', { name: /delete broker 1/i }))
    expect(actions.deleteWealthAccount).toHaveBeenCalledWith(1)
  })

  it('kind badge shows correct label for investment accounts', () => {
    render(<WealthAccountsManager accounts={[makeAccount(1)]} actions={makeActions()} />)
    expect(screen.getByText('Investment')).toBeInTheDocument()
  })
})
