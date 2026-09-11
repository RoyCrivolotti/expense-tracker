import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ExpenseDataset, Transaction } from '../../types'
import type { ExpenseActions } from '../actions'
import { makeDataset, makeFlag } from '../../testing/factories'
import { buildLookup } from '../format'
import { MoneyFormatProvider } from '../hooks/MoneyFormatProvider'
import type { ExpenseModel } from '../useExpenseData'
import { FlagsModal } from './FlagsModal'

const work = makeFlag({ id: 1, name: 'Work travel', description: 'Reimbursable' })

function txn(flagId?: number): Transaction {
  return {
    id: 1,
    date: '2026-05-01',
    budgetMonth: '2026-05',
    description: 'Hotel',
    accountId: 1,
    categoryId: 1,
    type: 'expense',
    amountCents: 1_000,
    cancelled: false,
    status: 'posted',
    ...(flagId != null ? { flagId } : {}),
  }
}

function modelFor(dataset: ExpenseDataset): ExpenseModel {
  return { dataset, lookup: buildLookup(dataset), descriptionIndex: {}, months: [] } as unknown as ExpenseModel
}

function renderModal(dataset: ExpenseDataset, overrides: Partial<ExpenseActions> = {}, startCreating = false) {
  const actions = {
    createFlag: vi.fn().mockResolvedValue(work),
    updateFlag: vi.fn().mockResolvedValue(undefined),
    deleteFlag: vi.fn().mockResolvedValue({ unflagged: 1 }),
    ...overrides,
  } as unknown as ExpenseActions
  const onClose = vi.fn()
  render(
    <MoneyFormatProvider currencyCode="EUR" numberLocale="de-DE">
      <FlagsModal
        model={modelFor(dataset)}
        actions={actions}
        onClose={onClose}
        startCreating={startCreating}
      />
    </MoneyFormatProvider>,
  )
  return { actions, onClose }
}

describe('FlagsModal', () => {
  it('explains what flags are for when there are none', () => {
    renderModal(makeDataset())

    expect(screen.getByText(/No flags yet/)).toBeInTheDocument()
  })

  it('lists each flag with its description and how many rows carry it', () => {
    renderModal(makeDataset({ flags: [work], transactions: [txn(1)] }))

    expect(screen.getByText('Work travel')).toBeInTheDocument()
    expect(screen.getByText(/Reimbursable · 1 transaction/)).toBeInTheDocument()
  })

  it('creates a flag', async () => {
    const createFlag = vi.fn().mockResolvedValue(work)
    renderModal(makeDataset(), { createFlag })

    await userEvent.click(screen.getByRole('button', { name: /Add flag/ }))
    await userEvent.type(screen.getByPlaceholderText('Work travel'), 'Client travel')
    await userEvent.click(screen.getByRole('button', { name: 'Add flag' }))

    expect(createFlag).toHaveBeenCalledWith(expect.objectContaining({ name: 'Client travel' }))
  })

  it('opens straight into the form when asked to', () => {
    renderModal(makeDataset(), {}, true)

    expect(screen.getByPlaceholderText('Work travel')).toBeInTheDocument()
  })

  it('edits an existing flag', async () => {
    const updateFlag = vi.fn().mockResolvedValue(undefined)
    renderModal(makeDataset({ flags: [work] }), { updateFlag })

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    await userEvent.clear(screen.getByPlaceholderText('Work travel'))
    await userEvent.type(screen.getByPlaceholderText('Work travel'), 'Client travel')
    await userEvent.click(screen.getByRole('button', { name: 'Save flag' }))

    expect(updateFlag).toHaveBeenCalledWith(1, expect.objectContaining({ name: 'Client travel' }))
  })

  it('spells out what deleting a flag does before doing it', async () => {
    const deleteFlag = vi.fn().mockResolvedValue({ unflagged: 1 })
    renderModal(makeDataset({ flags: [work], transactions: [txn(1)] }), { deleteFlag })

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete flag' }))

    expect(screen.getByRole('alertdialog')).toHaveTextContent(/1 transaction will be unflagged/)
    expect(screen.getByRole('alertdialog')).toHaveTextContent(/no transaction is deleted/)

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(deleteFlag).toHaveBeenCalledWith(1)
  })

  it('refuses to save a flag with no name', async () => {
    const createFlag = vi.fn()
    renderModal(makeDataset(), { createFlag })

    await userEvent.click(screen.getByRole('button', { name: /Add flag/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Add flag' }))

    expect(screen.getByText('Enter a name')).toBeInTheDocument()
    expect(createFlag).not.toHaveBeenCalled()
  })

  it('archives a flag, explaining that its transactions keep it', async () => {
    const updateFlag = vi.fn().mockResolvedValue(undefined)
    renderModal(makeDataset({ flags: [work], transactions: [txn(1)] }), { updateFlag })

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))

    expect(screen.getByText(/keeps the 1 transaction already flagged with it/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: 'Save flag' }))

    expect(updateFlag).toHaveBeenCalledWith(1, expect.objectContaining({ active: false }))
  })

  it('saves a colour picked from the shared palette', async () => {
    const updateFlag = vi.fn().mockResolvedValue(undefined)
    renderModal(makeDataset({ flags: [work] }), { updateFlag })

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    await userEvent.click(screen.getByRole('button', { name: 'Use color #10b981' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save flag' }))

    expect(updateFlag).toHaveBeenCalledWith(1, expect.objectContaining({ color: '#10b981' }))
  })

  it('does not offer archiving for a flag that does not exist yet', () => {
    renderModal(makeDataset(), {}, true)

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })
})
