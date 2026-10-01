import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../data/apiClient'
import type { Account, AccountStatement } from '../../types'
import { makeDataset, makeTransaction } from '../../testing/factories'
import { makeActions } from '../../testing/makeActions'
import { ToastContext } from '../hooks/useToast'
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
  await user.click(screen.getByRole('button', { name: /^Iberia Icon/ }))
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

  it('opens the pressed card statement and marks it paid today, then closes', async () => {
    const { user, actions, sheet } = await openSheet()

    expect(within(sheet).getByText('June 2026')).toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: 'Mark as paid' }))

    expect(actions.setStatementPaid).toHaveBeenCalledWith(2, '2026-06', true, '2026-06-20')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('marks a paid statement due again, without a paid date, and closes the sheet', async () => {
    const { user, actions, sheet } = await openSheet([PAID_JUNE])

    await user.click(within(sheet).getByRole('button', { name: 'Mark as due' }))

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
    const markPaid = within(sheet).getByRole('button', { name: 'Mark as paid' })
    const row = screen.getByRole('button', { name: /^Iberia Icon/ })

    await user.click(markPaid)
    expect(markPaid).toBeDisabled()
    expect(row).toBeDisabled()

    finish()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
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

    expect(screen.getByText('Nothing to settle')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('offers no sheet without a way to save', () => {
    render(<CardStatementsCard dataset={datasetWith()} month="2026-06" />)

    expect(screen.getByText('Due')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

const TRAVEL: Account = { id: 3, name: 'Travel Card', kind: 'credit', settlement: 'deferred', active: true }

describe('CardStatementsCard — mark as paid today', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date(2026, 5, 20, 12))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  function renderCard(options: {
    statements?: AccountStatement[]
    actions?: ReturnType<typeof makeActions> | undefined
    withActions?: boolean
    dataset?: ReturnType<typeof makeDataset>
  } = {}) {
    const showToast = vi.fn()
    const actions = options.actions ?? makeActions()
    render(
      <ToastContext.Provider value={{ showToast }}>
        <CardStatementsCard
          dataset={options.dataset ?? datasetWith(options.statements)}
          month="2026-06"
          {...(options.withActions === false ? {} : { actions })}
        />
      </ToastContext.Provider>,
    )
    return { actions, showToast }
  }

  const button = (card = 'Iberia Icon') =>
    screen.queryByRole('button', { name: `Mark as paid today for ${card}` })

  it('marks a due statement paid on today with one tap, without opening the sheet', async () => {
    const { actions } = renderCard()

    await userEvent.click(button()!)

    expect(actions.setStatementPaid).toHaveBeenCalledWith(2, '2026-06', true, '2026-06-20')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('says it was marked paid', async () => {
    const { showToast } = renderCard()

    await userEvent.click(button()!)

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Iberia Icon marked paid today', 'success'))
  })

  it('still opens the sheet when the row itself is pressed', async () => {
    const { actions } = renderCard()

    await userEvent.click(screen.getByRole('button', { name: /^Iberia Icon/ }))

    expect(screen.getByRole('dialog', { name: 'Iberia Icon statement' })).toBeInTheDocument()
    expect(actions.setStatementPaid).not.toHaveBeenCalled()
  })

  it('has no button once the statement is paid', () => {
    renderCard({ statements: [PAID_JUNE] })

    expect(button()).not.toBeInTheDocument()
  })

  it('has no button when there is nothing to settle', () => {
    renderCard({ dataset: makeDataset({ accounts: ACCOUNTS }) })

    expect(button()).not.toBeInTheDocument()
  })

  it('has no button without a way to save', () => {
    renderCard({ withActions: false })

    expect(button()).not.toBeInTheDocument()
  })

  it('keeps the button beside the row rather than inside it', () => {
    renderCard()

    const row = screen.getByRole('button', { name: /^Iberia Icon/ })
    expect(row).not.toContainElement(button())
  })

  it('locks the row and the button until the save comes back', async () => {
    let finish!: () => void
    const actions = makeActions({
      setStatementPaid: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve
          }),
      ),
    })
    renderCard({ actions })
    const row = screen.getByRole('button', { name: /^Iberia Icon/ })

    await userEvent.click(button()!)
    expect(button()).toBeDisabled()
    expect(row).toBeDisabled()

    finish()
    await waitFor(() => expect(button()).toBeEnabled())
    expect(row).toBeEnabled()
  })

  it('says why when the save fails, and lets the user try again', async () => {
    const actions = makeActions({
      setStatementPaid: vi.fn().mockRejectedValue(new ApiError('Paid date is not a valid day.', 400)),
    })
    const { showToast } = renderCard({ actions })

    await userEvent.click(button()!)

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('Paid date is not a valid day.', 'error'),
    )
    expect(showToast).not.toHaveBeenCalledWith(expect.anything(), 'success')
    expect(button()).toBeEnabled()
  })

  describe('with two cards', () => {
    function twoCards() {
      return makeDataset({
        accounts: [...ACCOUNTS, TRAVEL],
        transactions: [
          makeTransaction({ id: 1, accountId: 2, date: '2026-06-03', budgetMonth: '2026-06', amountCents: 137_345 }),
          makeTransaction({ id: 2, accountId: 3, date: '2026-06-04', budgetMonth: '2026-06', amountCents: 1_499 }),
        ],
      })
    }

    it('gives each card its own button, named for it', () => {
      renderCard({ dataset: twoCards() })

      expect(button('Iberia Icon')).toBeInTheDocument()
      expect(button('Travel Card')).toBeInTheDocument()
    })

    it('keeps the first card locked when a second one is tapped before it has saved', async () => {
      const finishers = new Map<number, () => void>()
      const actions = makeActions({
        setStatementPaid: vi.fn(
          (accountId: number) =>
            new Promise<void>((resolve) => {
              finishers.set(accountId, resolve)
            }),
        ),
      })
      renderCard({ dataset: twoCards(), actions })

      await userEvent.click(button('Iberia Icon')!)
      await userEvent.click(button('Travel Card')!)
      expect(button('Iberia Icon')).toBeDisabled()
      expect(button('Travel Card')).toBeDisabled()

      finishers.get(3)!()
      await waitFor(() => expect(button('Travel Card')).toBeEnabled())
      expect(button('Iberia Icon')).toBeDisabled()

      finishers.get(2)!()
      await waitFor(() => expect(button('Iberia Icon')).toBeEnabled())
    })
  })
})
