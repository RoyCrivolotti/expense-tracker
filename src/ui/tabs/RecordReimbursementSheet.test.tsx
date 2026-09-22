import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Native by default, like the rest of this file's tests — the one describe block
// below that cares about the popover itself switches it off for its own scope.
vi.mock('../hooks/isNativeDatePicker', () => ({ isNativeDatePicker: vi.fn(() => true) }))
import { isNativeDatePicker } from '../hooks/isNativeDatePicker'
import type { Transaction } from '../../types'
import { makeDataset, makeFlag, makeLookup, makeTransaction } from '../../testing/factories'
import { netSpendCents } from '../../domain/engine/transactions'
import type { FlagGroup } from '../../domain/engine/flagGroups'
import { MoneyFormatProvider } from '../hooks/MoneyFormatProvider'
import type { ExpenseModel } from '../useExpenseData'
import { RecordReimbursementSheet, type RecordInput } from './RecordReimbursementSheet'

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
  const onRecord = vi.fn<(input: RecordInput, transactionIds: number[]) => void>()
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

describe('RecordReimbursementSheet — naming the report', () => {
  it('seeds the name from the flag and records what was typed instead', async () => {
    const user = userEvent.setup()
    const { onRecord } = renderSheet(group([txn(1, { description: 'Flight' })]))

    const name = screen.getByRole('textbox', { name: 'Report name' })
    expect(name).toHaveValue('Reimbursement — Work travel')

    await user.clear(name)
    await user.type(name, 'Alicante trip, September')
    await user.click(screen.getByRole('button', { name: /^Record/ }))

    // The payment's description *is* the report's name — PastReport reads it
    // straight back off the transaction, so nothing else has to store it.
    expect(onRecord.mock.calls[0]![0].description).toBe('Alicante trip, September')
  })

  it('falls back to the generated name when the field is emptied', async () => {
    const user = userEvent.setup()
    const { onRecord } = renderSheet(group([txn(1, { description: 'Flight' })]))

    const name = screen.getByRole('textbox', { name: 'Report name' })
    await user.clear(name)
    await user.click(screen.getByRole('button', { name: /^Record/ }))

    // Blank must not reach the transaction: an unnamed row in the ledger is
    // worse than a dull generated one, and this is not worth blocking a save.
    expect(onRecord.mock.calls[0]![0].description).toBe('Reimbursement — Work travel')
  })

  it('treats whitespace as empty', async () => {
    const user = userEvent.setup()
    const { onRecord } = renderSheet(group([txn(1, { description: 'Flight' })]))

    const name = screen.getByRole('textbox', { name: 'Report name' })
    await user.clear(name)
    await user.type(name, '   ')
    await user.click(screen.getByRole('button', { name: /^Record/ }))

    expect(onRecord.mock.calls[0]![0].description).toBe('Reimbursement — Work travel')
  })
})

describe('RecordReimbursementSheet — payment vs what was ticked', () => {
  it('says nothing while the figure matches the ticked rows', () => {
    renderSheet(group([txn(1, { description: 'Flight' })]))
    expect(screen.queryByText(/Short of|More than/)).not.toBeInTheDocument()
  })

  it('flags a shortfall, because ticked rows settle regardless of the amount', async () => {
    const user = userEvent.setup()
    renderSheet(group([txn(1, { amountCents: 10_000 }), txn(2, { amountCents: 4_000 })]))

    const amount = screen.getByRole('textbox', { name: 'Amount received' })
    await user.clear(amount)
    await user.type(amount, '90')

    // 90,00 against 140,00 ticked. Nothing reconciles the two, so without this
    // the missing 50,00 stops being owed with no indication it ever existed.
    expect(screen.getByText(/Short of the 140,00/)).toBeInTheDocument()
    expect(screen.getByText(/by 50,00/)).toBeInTheDocument()
  })

  it('flags an overpayment too', async () => {
    const user = userEvent.setup()
    renderSheet(group([txn(1, { amountCents: 10_000 })]))

    const amount = screen.getByRole('textbox', { name: 'Amount received' })
    await user.clear(amount)
    await user.type(amount, '120')

    expect(screen.getByText(/More than the 100,00/)).toBeInTheDocument()
  })

  it('goes quiet again once the ticks are adjusted to match', async () => {
    const user = userEvent.setup()
    renderSheet(group([txn(1, { amountCents: 10_000 }), txn(2, { amountCents: 4_000 })]))

    const amount = screen.getByRole('textbox', { name: 'Amount received' })
    await user.clear(amount)
    await user.type(amount, '100')
    expect(screen.getByText(/Short of/)).toBeInTheDocument()

    // Unticking the 40,00 line is the fix the message asks for.
    await user.click(lines()[1]!)
    expect(screen.queryByText(/Short of|More than/)).not.toBeInTheDocument()
  })

  it('stays quiet when nothing is ticked, since there is nothing to compare against', async () => {
    const user = userEvent.setup()
    renderSheet(group([txn(1, { amountCents: 10_000 })]))

    await user.click(lines()[0]!)
    expect(screen.queryByText(/Short of|More than/)).not.toBeInTheDocument()
  })
})

describe('RecordReimbursementSheet — a claim that already has money back', () => {
  // The staging claim: 60 € and 48 € of expenses, and a 20 € refund on the same flag.
  // The claim document and the Flagged card both call that 88 € outstanding.
  const claim = () =>
    group([
      txn(1, { amountCents: 6_000, date: '2026-09-01' }),
      txn(2, { amountCents: 4_800, date: '2026-09-02' }),
      txn(3, { amountCents: 2_000, type: 'refund', date: '2026-09-03' }),
    ])

  it('suggests the outstanding amount, as the claim document states it', () => {
    renderSheet(claim())

    expect(screen.getByLabelText('Amount received')).toHaveValue('88,00')
  })

  it('says why the suggestion is less than the ticked lines', () => {
    renderSheet(claim())

    expect(screen.getByText(/20,00 € already back on this flag comes off what is owed/)).toBeInTheDocument()
  })

  it('settles the refund along with the lines when the payment closes the claim', async () => {
    const { onRecord } = renderSheet(claim())

    await userEvent.click(screen.getByRole('button', { name: /record/i }))

    expect([...onRecord.mock.calls[0]![1]].sort()).toEqual([1, 2, 3])
    expect(onRecord.mock.calls[0]![0].amountCents).toBe(8_800)
  })

  it('leaves the refund on the flag when only some lines are covered', async () => {
    const { onRecord } = renderSheet(claim())

    await userEvent.click(lines()[1]!)
    await userEvent.click(screen.getByRole('button', { name: /record/i }))

    expect(onRecord.mock.calls[0]![1]).toEqual([1])
    expect(onRecord.mock.calls[0]![0].amountCents).toBe(6_000)
  })

  it('reports what the card will show once a part payment lands', async () => {
    renderSheet(claim())

    await userEvent.click(lines()[1]!)

    // 48 € still open, less the 20 € already back.
    expect(screen.getByText(/28,00 € left owed/)).toBeInTheDocument()
  })

  it('says nothing about money back when there is none', () => {
    renderSheet(group([txn(1, { amountCents: 10_000 })]))

    expect(screen.queryByText(/already back/)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Amount received')).toHaveValue('100,00')
  })
})

describe('RecordReimbursementSheet — the amount check once money is already back', () => {
  const claim = () =>
    group([
      txn(1, { amountCents: 6_000, date: '2026-09-01' }),
      txn(2, { amountCents: 4_800, date: '2026-09-02' }),
      txn(3, { amountCents: 2_000, type: 'refund', date: '2026-09-03' }),
    ])

  it('does not call the suggested amount short', () => {
    // It is 20 € under the ticked lines on purpose. Warning about that told the user
    // to untick lines that had in fact been paid.
    renderSheet(claim())

    expect(screen.queryByText(/Short of|More than/)).not.toBeInTheDocument()
  })

  it('still flags a payment that asks for the refund back as well', async () => {
    renderSheet(claim())
    const amount = screen.getByLabelText('Amount received')

    await userEvent.clear(amount)
    await userEvent.type(amount, '108,00')

    expect(screen.getByText(/More than the 88,00 € owed for the ticked lines, by 20,00 €/)).toBeInTheDocument()
  })
})

describe('RecordReimbursementSheet — Escape while the date popover is open', () => {
  // Only this block needs the popover fallback; every other test in this file
  // renders the native control and never touches the date field at all.
  beforeEach(() => {
    vi.mocked(isNativeDatePicker).mockReturnValue(false)
  })

  afterEach(() => {
    vi.mocked(isNativeDatePicker).mockReturnValue(true)
  })

  it('closes just the date popover, not the whole sheet', () => {
    const { onCancel } = renderSheet(group([txn(1)]))
    fireEvent.click(screen.getByRole('button', { name: 'Date' }))
    expect(screen.getByRole('dialog', { name: 'Choose a date' })).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('dialog', { name: 'Choose a date' })).not.toBeInTheDocument()
    expect(onCancel).not.toHaveBeenCalled()
  })
})
