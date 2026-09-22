import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Account, ExpenseDataset } from '../../types'
import { makeDataset, makeFlag, makeTransaction } from '../../testing/factories'
import { makeActions } from '../../testing/makeActions'
import { buildLookup } from '../format'
import type { ExpenseModel } from '../useExpenseData'
import { TransactionsTab } from './TransactionsTab'
import { RESULTS_ANCHOR_ID } from './scrollToResults'

// The native date input takes a new value in one step; the popover fallback has to be
// clicked through.
vi.mock('../hooks/isNativeDatePicker', () => ({ isNativeDatePicker: () => true }))

// useIsMobile reads matchMedia, which jsdom does not implement.
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  })
})

function modelFor(
  transactions: ReturnType<typeof makeTransaction>[],
  overrides: Partial<ExpenseDataset> = {},
): ExpenseModel {
  const dataset = makeDataset({ transactions, ...overrides })
  return {
    dataset,
    lookup: buildLookup(dataset),
    descriptionIndex: { search: () => [], resolve: () => undefined },
    months: [],
  }
}

/** The item count and net spend, scoped away from a row's own signed amount. */
function summary() {
  return within(document.getElementById(RESULTS_ANCHOR_ID)!)
}

describe('TransactionsTab — result summary', () => {
  it('says "1 item" for a single row, not "1 items"', () => {
    render(<TransactionsTab model={modelFor([makeTransaction({ id: 1 })])} month="2025-01" />)

    expect(summary().getByText('1 item')).toBeInTheDocument()
    expect(summary().queryByText('1 items')).not.toBeInTheDocument()
  })

  it('keeps the plural for anything else, including none', () => {
    const { rerender } = render(<TransactionsTab model={modelFor([])} month="2025-01" />)
    expect(summary().getByText('0 items')).toBeInTheDocument()

    rerender(
      <TransactionsTab
        model={modelFor([makeTransaction({ id: 1 }), makeTransaction({ id: 2 })])}
        month="2025-01"
      />,
    )
    expect(summary().getByText('2 items')).toBeInTheDocument()
  })

  it('signs a net refund, so it does not read as spend', () => {
    // netSpendCents is expense minus refund; a lone refund goes negative, which used to
    // render as a plain positive amount — "166,44 €" — indistinguishable from having
    // spent it.
    render(
      <TransactionsTab
        model={modelFor([makeTransaction({ id: 1, type: 'refund', amountCents: 16_644 })])}
        month="2025-01"
      />,
    )

    expect(summary().getByText('−166,44 €')).toBeInTheDocument()
  })

  it('leaves a real net spend unsigned, as before', () => {
    // Guards the regression the sign fix could tip into the other direction:
    // `signed` unconditionally true would print "+343,05 €" for ordinary spend, the
    // exact mistake BudgetBar's own comment warns against for the same component.
    render(
      <TransactionsTab
        model={modelFor([makeTransaction({ id: 1, type: 'expense', amountCents: 34_305 })])}
        month="2025-01"
      />,
    )

    expect(summary().getByText('343,05 €')).toBeInTheDocument()
    expect(summary().queryByText('+343,05 €')).not.toBeInTheDocument()
    expect(summary().queryByText('−343,05 €')).not.toBeInTheDocument()
  })

  it('leaves an exact zero unsigned, expense and refund cancelling out', () => {
    // Money short-circuits cents===0 before it ever looks at `signed`, so this sits
    // right next to the boundary the new `state.totalCents < 0` check introduces.
    render(
      <TransactionsTab
        model={modelFor([
          makeTransaction({ id: 1, type: 'expense', amountCents: 10_000 }),
          makeTransaction({ id: 2, type: 'refund', amountCents: 10_000 }),
        ])}
        month="2025-01"
      />,
    )

    expect(summary().getByText('0,00 €')).toBeInTheDocument()
    expect(summary().queryByText('+0,00 €')).not.toBeInTheDocument()
    expect(summary().queryByText('−0,00 €')).not.toBeInTheDocument()
  })
})

const DEBIT: Account = { id: 1, name: 'Main Debit', kind: 'debit', settlement: 'immediate', active: true }
const CARD: Account = { id: 2, name: 'Iberia Icon', kind: 'credit', settlement: 'deferred', active: true }

/**
 * A paid June statement. A statement only becomes a row in the list once it is paid and
 * has a charge behind it, and the row sits on the day it was paid.
 */
function paidStatementModel(): ExpenseModel {
  return modelFor(
    [
      makeTransaction({
        id: 1,
        accountId: 2,
        date: '2026-06-03',
        budgetMonth: '2026-06',
        amountCents: 137_345,
      }),
    ],
    {
      accounts: [DEBIT, CARD],
      accountStatements: [{ accountId: 2, yearMonth: '2026-06', paid: true, paidOn: '2026-06-15' }],
    },
  )
}

async function openStatementSheet(actions = makeActions()) {
  const user = userEvent.setup()
  render(<TransactionsTab model={paidStatementModel()} month="2026-06" actions={actions} />)
  await user.click(screen.getByRole('button', { name: /Iberia Icon statement/ }))
  return { user, actions, sheet: screen.getByRole('dialog', { name: 'Iberia Icon statement' }) }
}

describe('TransactionsTab statement payments', () => {
  it('opens the sheet of the statement that was pressed, on the day it was paid', async () => {
    const { sheet } = await openStatementSheet()

    expect(within(sheet).getByText('June 2026')).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: 'Paid' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(sheet).getByLabelText('Statement paid on')).toHaveValue('2026-06-15')
  })

  it('marks the statement due again and closes the sheet', async () => {
    const { user, actions, sheet } = await openStatementSheet()

    await user.click(within(sheet).getByRole('button', { name: 'Paid' }))

    expect(actions.setStatementPaid).toHaveBeenCalledWith(2, '2026-06', false, undefined)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('moves the payment to the date that was picked and keeps the sheet open', async () => {
    const { actions, sheet } = await openStatementSheet()

    fireEvent.change(within(sheet).getByLabelText('Statement paid on'), {
      target: { value: '2026-06-20' },
    })

    await waitFor(() =>
      expect(actions.setStatementPaid).toHaveBeenCalledWith(2, '2026-06', true, '2026-06-20'),
    )
    expect(sheet).toBeInTheDocument()
  })

  it('locks the sheet while the change is being saved', async () => {
    let finish!: () => void
    const actions = makeActions({
      setStatementPaid: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve
          }),
      ),
    })
    const { sheet } = await openStatementSheet(actions)
    const toggle = within(sheet).getByRole('button', { name: 'Paid' })

    fireEvent.change(within(sheet).getByLabelText('Statement paid on'), {
      target: { value: '2026-06-20' },
    })
    expect(toggle).toBeDisabled()

    finish()
    await waitFor(() => expect(toggle).toBeEnabled())
  })

  it('closes without saving anything', async () => {
    const { user, actions, sheet } = await openStatementSheet()

    await user.click(within(sheet).getByRole('button', { name: 'Close' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(actions.setStatementPaid).not.toHaveBeenCalled()
  })
})

describe('TransactionsTab reimbursements', () => {
  const claim = () =>
    modelFor([makeTransaction({ id: 7, flagId: 1, amountCents: 10_000 })], {
      flags: [makeFlag({ id: 1, name: 'Work travel' })],
      accounts: [DEBIT],
      categories: [{ id: 1, name: 'Travel', monthlyBudgetCents: 0, sortOrder: 0, active: true }],
    })

  async function openSettleSheet(actions = makeActions()) {
    const user = userEvent.setup()
    render(<TransactionsTab model={claim()} month="2025-01" actions={actions} />)
    await user.click(screen.getByRole('button', { name: 'Record reimbursement' }))
    return { user, actions, sheet: screen.getByRole('dialog', { name: 'Record reimbursement' }) }
  }

  it('records the payment against the claim from the Flagged card and closes', async () => {
    const actions = makeActions({
      createTransaction: vi.fn().mockResolvedValue(makeTransaction({ id: 99 })),
    })
    const { user, sheet } = await openSettleSheet(actions)

    await user.click(within(sheet).getByRole('button', { name: /^Record / }))

    await waitFor(() =>
      expect(actions.updateTransactions).toHaveBeenCalledWith([7], { settledBy: 99 }),
    )
    expect(actions.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'refund', amountCents: 10_000 }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('stays open and says why when the payment could not be recorded', async () => {
    const actions = makeActions({
      createTransaction: vi.fn().mockResolvedValue(makeTransaction({ id: 99 })),
      updateTransactions: vi.fn().mockRejectedValue(new Error('Receipt storage is full')),
    })
    const { user, sheet } = await openSettleSheet(actions)

    await user.click(within(sheet).getByRole('button', { name: /^Record / }))

    expect(await within(sheet).findByRole('alert')).toHaveTextContent('Receipt storage is full')
    expect(sheet).toBeInTheDocument()
  })

  it('closes without recording anything', async () => {
    const { user, actions, sheet } = await openSettleSheet()

    await user.click(within(sheet).getByRole('button', { name: 'Close' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(actions.createTransaction).not.toHaveBeenCalled()
  })
})
