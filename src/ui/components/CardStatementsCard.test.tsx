import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Account, AccountStatement } from '../../types'
import { makeDataset, makeTransaction } from '../../testing/factories'
import { makeActions } from '../../testing/makeActions'
import { CardStatementsCard } from './CardStatementsCard'

// The native date input takes a new value in one step; the popover fallback has to be
// clicked through.
vi.mock('../hooks/isNativeDatePicker', () => ({ isNativeDatePicker: () => true }))

const ACCOUNTS: Account[] = [
  { id: 1, name: 'Main Debit', kind: 'debit', settlement: 'immediate', active: true },
  { id: 2, name: 'Iberia Icon', kind: 'credit', settlement: 'deferred', active: true },
]

const PAID_JUNE: AccountStatement = { accountId: 2, yearMonth: '2026-06', paid: true, paidOn: '2026-06-15' }

/** One June charge on the card, which is what gives its statement something to settle. */
function datasetWith(statements: AccountStatement[] = []) {
  return makeDataset({
    accounts: ACCOUNTS,
    transactions: [
      makeTransaction({
        id: 1,
        accountId: 2,
        date: '2026-06-03',
        budgetMonth: '2026-06',
        amountCents: 137_345,
      }),
    ],
    accountStatements: statements,
  })
}

async function openSheet(statements: AccountStatement[] = [], actions = makeActions()) {
  const user = userEvent.setup()
  render(<CardStatementsCard dataset={datasetWith(statements)} month="2026-06" actions={actions} />)
  await user.click(screen.getByRole('button', { name: 'Iberia Icon statement' }))
  return { user, actions, sheet: screen.getByRole('dialog', { name: 'Iberia Icon statement' }) }
}

describe('CardStatementsCard', () => {
  beforeEach(() => {
    // Marking a statement paid dates it today, so the day has to hold still.
    vi.setSystemTime(new Date(2026, 5, 20, 12))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('opens the pressed card statement and marks it paid today', async () => {
    const { user, actions, sheet } = await openSheet()

    expect(within(sheet).getByText('June 2026')).toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: 'Due' }))

    expect(actions.setStatementPaid).toHaveBeenCalledWith(2, '2026-06', true, '2026-06-20')
  })

  it('marks a paid statement due again, without a paid date, and closes the sheet', async () => {
    const { user, actions, sheet } = await openSheet([PAID_JUNE])

    await user.click(within(sheet).getByRole('button', { name: 'Paid' }))

    expect(actions.setStatementPaid).toHaveBeenCalledWith(2, '2026-06', false, undefined)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('moves the paid date to the day that was picked', async () => {
    const { actions, sheet } = await openSheet([PAID_JUNE])

    fireEvent.change(within(sheet).getByLabelText('Statement paid on'), {
      target: { value: '2026-06-18' },
    })

    await waitFor(() =>
      expect(actions.setStatementPaid).toHaveBeenCalledWith(2, '2026-06', true, '2026-06-18'),
    )
  })

  it('locks the row and the sheet until the save comes back', async () => {
    let finish!: () => void
    const actions = makeActions({
      setStatementPaid: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve
          }),
      ),
    })
    const { user, sheet } = await openSheet([], actions)
    const toggle = within(sheet).getByRole('button', { name: 'Due' })
    const row = screen.getByRole('button', { name: 'Iberia Icon statement' })

    await user.click(toggle)
    expect(toggle).toBeDisabled()
    expect(row).toBeDisabled()

    finish()
    await waitFor(() => expect(toggle).toBeEnabled())
    expect(row).toBeEnabled()
  })

  it('closes without saving anything', async () => {
    const { user, actions, sheet } = await openSheet()

    await user.click(within(sheet).getByRole('button', { name: 'Close' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(actions.setStatementPaid).not.toHaveBeenCalled()
  })

  it('offers no sheet for a statement with nothing to settle', () => {
    render(
      <CardStatementsCard
        dataset={makeDataset({ accounts: ACCOUNTS })}
        month="2026-06"
        actions={makeActions()}
      />,
    )

    expect(screen.getByLabelText('Iberia Icon statement')).toHaveTextContent('Nothing to settle')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('offers no sheet without a way to save', () => {
    render(<CardStatementsCard dataset={datasetWith()} month="2026-06" />)

    expect(screen.getByLabelText('Iberia Icon statement')).toHaveTextContent('Due')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
