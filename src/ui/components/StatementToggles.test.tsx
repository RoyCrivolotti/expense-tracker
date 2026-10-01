import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Account, AccountStatement } from '../../types'
import { makeDataset, makeTransaction } from '../../testing/factories'
import { buildLookup } from '../format'
import { EXIT_MS, setMotionDisabledForTests } from '../hooks/motion'
import type { ExpenseModel } from '../useExpenseData'
import { StatementToggles } from './StatementToggles'

// The native date input takes a new value in one step; the popover fallback has to be
// clicked through.
vi.mock('../hooks/isNativeDatePicker', () => ({ isNativeDatePicker: () => true }))

const ACCOUNTS: Account[] = [
  { id: 1, name: 'Main Debit', kind: 'debit', settlement: 'immediate', active: true },
  { id: 2, name: 'Iberia Icon', kind: 'credit', settlement: 'deferred', active: true },
]

const PAID_JUNE: AccountStatement = { accountId: 2, yearMonth: '2026-06', paid: true, paidOn: '2026-06-15' }

/** Only June has a charge on the card, so May's statement has nothing to open. */
function modelWith(statements: AccountStatement[] = []): ExpenseModel {
  const dataset = makeDataset({
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
  return {
    dataset,
    lookup: buildLookup(dataset),
    descriptionIndex: { search: () => [], resolve: () => undefined },
    months: ['2026-05', '2026-06'],
  }
}

async function openJune(statements: AccountStatement[] = [], onToggle = vi.fn().mockResolvedValue(undefined)) {
  const user = userEvent.setup()
  render(<StatementToggles model={modelWith(statements)} onToggle={onToggle} />)
  await user.click(screen.getByRole('button', { name: 'June 2026 statement' }))
  return { user, onToggle, sheet: screen.getByRole('dialog', { name: 'Iberia Icon statement' }) }
}

describe('StatementToggles', () => {
  beforeEach(() => {
    // Marking a statement paid dates it today, so the day has to hold still.
    vi.setSystemTime(new Date(2026, 5, 20, 12))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('opens the sheet of the month that was pressed and marks it paid today, then closes', async () => {
    const { user, onToggle, sheet } = await openJune()

    expect(within(sheet).getByText('June 2026')).toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: 'Mark as paid' }))

    expect(onToggle).toHaveBeenCalledWith(2, '2026-06', true, '2026-06-20')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('marks a paid month due again, without a paid date, and closes the sheet', async () => {
    const { user, onToggle, sheet } = await openJune([PAID_JUNE])

    await user.click(within(sheet).getByRole('button', { name: 'Mark as due' }))

    expect(onToggle).toHaveBeenCalledWith(2, '2026-06', false, undefined)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('moves the paid date to the day that was picked', async () => {
    const { onToggle, sheet } = await openJune([PAID_JUNE])

    fireEvent.change(within(sheet).getByLabelText('Statement paid on'), {
      target: { value: '2026-06-18' },
    })

    await waitFor(() => expect(onToggle).toHaveBeenCalledWith(2, '2026-06', true, '2026-06-18'))
  })

  it('locks the month and the sheet until the save comes back', async () => {
    let finish!: () => void
    const onToggle = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    const { user, sheet } = await openJune([], onToggle)
    const markPaid = within(sheet).getByRole('button', { name: 'Mark as paid' })
    const month = screen.getByRole('button', { name: 'June 2026 statement' })

    await user.click(markPaid)
    expect(markPaid).toBeDisabled()
    expect(month).toBeDisabled()

    finish()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(month).toBeEnabled()
  })

  it('closes without saving anything', async () => {
    const { user, onToggle, sheet } = await openJune()

    await user.click(within(sheet).getByRole('button', { name: 'Close' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('offers no sheet for a month with nothing to settle', () => {
    render(<StatementToggles model={modelWith()} onToggle={vi.fn()} />)

    expect(screen.getByLabelText('May 2026 statement')).toHaveTextContent('Nothing to settle')
    expect(screen.queryByRole('button', { name: 'May 2026 statement' })).not.toBeInTheDocument()
  })
})

describe('StatementToggles — the sheet while it leaves', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date(2026, 5, 20, 12))
    vi.useFakeTimers()
    setMotionDisabledForTests(false)
  })
  afterEach(() => {
    vi.useRealTimers()
    setMotionDisabledForTests(true)
  })

  it('keeps showing what the sheet said when it closed, even if the statement changes underneath it', async () => {
    const onToggle = vi.fn().mockResolvedValue(undefined)
    const { rerender } = render(<StatementToggles model={modelWith([PAID_JUNE])} onToggle={onToggle} />)

    fireEvent.click(screen.getByRole('button', { name: 'June 2026 statement' }))
    let sheet = screen.getByRole('dialog', { name: 'Iberia Icon statement' })
    expect(within(sheet).getByRole('button', { name: 'Mark as due' })).toBeInTheDocument()

    fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }))

    // An unrelated change (a background refresh, say) lands while the sheet is mid-exit.
    // Read live, "Mark as due" would flip to "Mark as paid" here, mid-fade, instead of
    // staying as it was.
    rerender(<StatementToggles model={modelWith([])} onToggle={onToggle} />)
    sheet = screen.getByRole('dialog', { name: 'Iberia Icon statement' })
    expect(within(sheet).getByRole('button', { name: 'Mark as due' })).toBeInTheDocument()

    await act(() => vi.advanceTimersByTimeAsync(EXIT_MS.sheet))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps saying "Mark as paid" while it leaves after marking the statement paid', async () => {
    const onToggle = vi.fn().mockResolvedValue(undefined)
    const { rerender } = render(<StatementToggles model={modelWith([])} onToggle={onToggle} />)

    fireEvent.click(screen.getByRole('button', { name: 'June 2026 statement' }))
    const sheet = screen.getByRole('dialog', { name: 'Iberia Icon statement' })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Mark as paid' }))
    // Lets the save resolve, which is what closes the sheet.
    await act(() => vi.advanceTimersByTimeAsync(0))

    // The save has landed and the sheet is leaving. It must not flip to "Mark as due".
    rerender(<StatementToggles model={modelWith([PAID_JUNE])} onToggle={onToggle} />)
    const leaving = screen.getByRole('dialog', { name: 'Iberia Icon statement' })
    expect(within(leaving).getByRole('button', { name: 'Mark as paid' })).toBeInTheDocument()
    expect(within(leaving).queryByRole('button', { name: 'Mark as due' })).not.toBeInTheDocument()

    await act(() => vi.advanceTimersByTimeAsync(EXIT_MS.sheet))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
