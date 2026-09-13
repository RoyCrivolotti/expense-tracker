import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../hooks/isNativeDatePicker', () => ({ isNativeDatePicker: () => true }))
import type { Transaction } from '../../types'
import { makeDataset, makeFlag, makeLookup, makeTransaction } from '../../testing/factories'
import { netSpendCents } from '../../domain/engine/transactions'
import type { FlagGroup } from '../../domain/engine/flagGroups'
import { MoneyFormatProvider } from '../hooks/MoneyFormatProvider'
import type { ExpenseModel } from '../useExpenseData'
import { RecordReimbursementSheet } from './RecordReimbursementSheet'

const WORK = makeFlag({ id: 1, name: 'Work travel' })

function txn(id: number, overrides: Partial<Transaction> = {}): Transaction {
  return makeTransaction({ id, flagId: 1, amountCents: 10_000, ...overrides })
}

function group(transactions: Transaction[]): FlagGroup {
  return { flag: WORK, transactions, count: transactions.length, totalCents: netSpendCents(transactions) }
}

function model(): ExpenseModel {
  return {
    dataset: makeDataset({
      flags: [WORK],
      categories: [{ id: 1, name: 'Travel', monthlyBudgetCents: 0, sortOrder: 0, active: true }],
      accounts: [{ id: 1, name: 'Main Debit', kind: 'debit', settlement: 'immediate', active: true }],
    }),
    lookup: makeLookup({ categoryName: () => 'Travel' }),
    descriptionIndex: { search: () => [], resolve: () => undefined },
    months: [],
  }
}

function renderSheet(g: FlagGroup) {
  const onRecord = vi.fn()
  const onCancel = vi.fn()
  render(
    <MoneyFormatProvider currencyCode="EUR" numberLocale="de-DE">
      <RecordReimbursementSheet group={g} model={model()} busy={false} onCancel={onCancel} onRecord={onRecord} />
    </MoneyFormatProvider>,
  )
  return { onRecord, onCancel }
}

function lines() {
  return screen.getAllByRole('checkbox')
}

describe('RecordReimbursementSheet', () => {
  it('offers every outstanding line, ticked', () => {
    renderSheet(group([txn(1, { description: 'Flight' }), txn(2, { description: 'Hotel' })]))

    expect(lines()).toHaveLength(2)
    for (const box of lines()) expect(box).toBeChecked()
    expect(screen.getByText(/2 of 2 selected/)).toBeInTheDocument()
  })

  it('records only the lines that are ticked', async () => {
    // An employer approving some lines and rejecting others is the case this
    // whole sheet exists for.
    const { onRecord } = renderSheet(
      group([txn(1, { description: 'Flight' }), txn(2, { description: 'Hotel' })]),
    )

    await userEvent.click(lines()[1]!)
    await userEvent.click(screen.getByRole('button', { name: /^Record / }))

    expect(onRecord).toHaveBeenCalledTimes(1)
    expect(onRecord.mock.calls[0]![1]).toEqual([1])
  })

  it('follows the ticks with the amount, and says what is left owed', async () => {
    renderSheet(group([txn(1, { amountCents: 10_000 }), txn(2, { amountCents: 4_000 })]))

    await userEvent.click(lines()[1]!)

    expect(screen.getByLabelText('Amount received')).toHaveValue('100,00')
    expect(screen.getByText(/40,00 € left owed/)).toBeInTheDocument()
  })

  it('never offers a refund as something to be reimbursed for', () => {
    // It already reduces what is owed. Offering it let the selected total go
    // negative and the sheet proposed recording a payment of minus six euros.
    renderSheet(group([txn(1, { amountCents: 10_000 }), txn(2, { amountCents: 4_000, type: 'refund' })]))

    expect(lines()).toHaveLength(1)
  })

  it('stops following once the amount has been typed over', async () => {
    // An employer rarely pays the claim total exactly, and silently rewriting
    // what was typed would be worse than a stale default.
    renderSheet(group([txn(1, { amountCents: 10_000 }), txn(2, { amountCents: 4_000 })]))

    const amount = screen.getByLabelText('Amount received')
    await userEvent.clear(amount)
    await userEvent.type(amount, '120')
    await userEvent.click(lines()[1]!)

    expect(amount).toHaveValue('120')
  })

  it('refuses to record nothing', async () => {
    renderSheet(group([txn(1)]))

    await userEvent.click(lines()[0]!)

    expect(screen.getByRole('button', { name: /^Record / })).toBeDisabled()
  })

  it('books the payment into an account the money can actually land in', () => {
    renderSheet(group([txn(1)]))

    expect(screen.getByLabelText('Into account')).toHaveValue('1')
  })

  it('renders nothing for a claim with nothing outstanding', () => {
    const settled = group([txn(1), txn(2, { type: 'refund' })])
    const { container } = render(
      <MoneyFormatProvider currencyCode="EUR" numberLocale="de-DE">
        <RecordReimbursementSheet
          group={settled}
          model={model()}
          busy={false}
          onCancel={vi.fn()}
          onRecord={vi.fn()}
        />
      </MoneyFormatProvider>,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('shows the claim it is settling', () => {
    renderSheet(group([txn(1)]))

    expect(within(screen.getByRole('dialog')).getByText('Work travel')).toBeInTheDocument()
  })
})
