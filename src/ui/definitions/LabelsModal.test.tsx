import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExpenseDataset, Transaction } from '../../types'
import type { ExpenseActions } from '../actions'
import { makeDataset, makeLabel } from '../../testing/factories'
import { buildLookup } from '../format'
import { MoneyFormatProvider } from '../hooks/MoneyFormatProvider'
import { EXIT_MS, setMotionDisabledForTests } from '../hooks/motion'
import type { ExpenseModel } from '../useExpenseData'
import { LabelsModal } from './LabelsModal'

const trip = makeLabel({ id: 1, name: 'Japan trip', description: 'Spring 2027' })

function txn(labelIds?: number[]): Transaction {
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
    ...(labelIds ? { labelIds } : {}),
  }
}

function modelFor(dataset: ExpenseDataset): ExpenseModel {
  return { dataset, lookup: buildLookup(dataset), descriptionIndex: {}, months: [] } as unknown as ExpenseModel
}

function renderModal(dataset: ExpenseDataset, overrides: Partial<ExpenseActions> = {}) {
  const actions = {
    createLabel: vi.fn().mockResolvedValue(trip),
    updateLabel: vi.fn().mockResolvedValue(undefined),
    deleteLabel: vi.fn().mockResolvedValue({ unlabeled: 1 }),
    ...overrides,
  } as unknown as ExpenseActions
  const onClose = vi.fn()
  render(
    <MoneyFormatProvider currencyCode="EUR" numberLocale="de-DE">
      <LabelsModal model={modelFor(dataset)} actions={actions} onClose={onClose} />
    </MoneyFormatProvider>,
  )
  return { actions, onClose }
}

describe('LabelsModal', () => {
  it('explains what labels are for when there are none', () => {
    renderModal(makeDataset())

    expect(screen.getByText(/No labels yet/)).toBeInTheDocument()
  })

  it('lists each label with its description and how many rows carry it', () => {
    renderModal(makeDataset({ labels: [trip], transactions: [txn([1])] }))

    expect(screen.getByText('Japan trip')).toBeInTheDocument()
    expect(screen.getByText(/Spring 2027 · 1 transaction/)).toBeInTheDocument()
  })

  it('creates a label', async () => {
    const createLabel = vi.fn().mockResolvedValue(trip)
    renderModal(makeDataset(), { createLabel })

    await userEvent.click(screen.getByRole('button', { name: /Add label/ }))
    await userEvent.type(screen.getByPlaceholderText('Japan trip'), 'Osaka trip')
    await userEvent.click(screen.getByRole('button', { name: 'Add label' }))

    expect(createLabel).toHaveBeenCalledWith(expect.objectContaining({ name: 'Osaka trip' }))
  })

  it('edits an existing label', async () => {
    const updateLabel = vi.fn().mockResolvedValue(undefined)
    renderModal(makeDataset({ labels: [trip] }), { updateLabel })

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    await userEvent.clear(screen.getByPlaceholderText('Japan trip'))
    await userEvent.type(screen.getByPlaceholderText('Japan trip'), 'Osaka trip')
    await userEvent.click(screen.getByRole('button', { name: 'Save label' }))

    expect(updateLabel).toHaveBeenCalledWith(1, expect.objectContaining({ name: 'Osaka trip' }))
  })

  it('spells out what deleting a label does before doing it', async () => {
    const deleteLabel = vi.fn().mockResolvedValue({ unlabeled: 1 })
    renderModal(makeDataset({ labels: [trip], transactions: [txn([1])] }), { deleteLabel })

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete label' }))

    expect(screen.getByRole('alertdialog')).toHaveTextContent(/1 transaction will lose this label/)
    expect(screen.getByRole('alertdialog')).toHaveTextContent(/no transaction is deleted/)

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(deleteLabel).toHaveBeenCalledWith(1)
  })

  it('keeps the label, and stays on its form, when the delete is cancelled', async () => {
    const deleteLabel = vi.fn().mockResolvedValue({ unlabeled: 1 })
    const { onClose } = renderModal(makeDataset({ labels: [trip], transactions: [txn([1])] }), {
      deleteLabel,
    })

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete label' }))
    // The form has a Cancel of its own, which would leave the form rather than the confirm.
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }),
    )

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save label' })).toBeInTheDocument()
    expect(deleteLabel).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('refuses to save a label with no name', async () => {
    const createLabel = vi.fn()
    renderModal(makeDataset(), { createLabel })

    await userEvent.click(screen.getByRole('button', { name: /Add label/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Add label' }))

    expect(screen.getByText('Enter a name')).toBeInTheDocument()
    expect(createLabel).not.toHaveBeenCalled()
  })

  it('archives a label, explaining that its transactions keep it', async () => {
    const updateLabel = vi.fn().mockResolvedValue(undefined)
    renderModal(makeDataset({ labels: [trip], transactions: [txn([1])] }), { updateLabel })

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))

    expect(screen.getByText(/keeps the 1 transaction already labeled with it/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('checkbox', { name: /active/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Save label' }))

    expect(updateLabel).toHaveBeenCalledWith(1, expect.objectContaining({ active: false }))
  })

  it('saves a colour picked from the shared palette', async () => {
    const updateLabel = vi.fn().mockResolvedValue(undefined)
    renderModal(makeDataset({ labels: [trip] }), { updateLabel })

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    await userEvent.click(screen.getByRole('button', { name: 'Use color #10b981' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save label' }))

    expect(updateLabel).toHaveBeenCalledWith(1, expect.objectContaining({ color: '#10b981' }))
  })

  it('does not offer archiving for a label that does not exist yet', async () => {
    renderModal(makeDataset())

    await userEvent.click(screen.getByRole('button', { name: /Add label/ }))

    expect(screen.queryByRole('checkbox', { name: /active/i })).not.toBeInTheDocument()
  })
})

describe('LabelsModal — deleting while the confirm sheet leaves', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setMotionDisabledForTests(false)
  })
  afterEach(() => {
    vi.useRealTimers()
    setMotionDisabledForTests(true)
  })

  it('keeps the confirm sheet through its own exit, even though the delete settles first', async () => {
    const deleteLabel = vi.fn().mockResolvedValue({ unlabeled: 1 })
    renderModal(makeDataset({ labels: [trip], transactions: [txn([1])] }), { deleteLabel })

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete label' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    // The request has had time to settle (a real one is often faster than 170ms), but the
    // sheet's own exit has not — it must still be on screen, mid-fade, not yanked out.
    await act(async () => {})
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(deleteLabel).not.toHaveBeenCalled()

    await act(() => vi.advanceTimersByTimeAsync(EXIT_MS.sheet))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(deleteLabel).toHaveBeenCalledWith(1)
  })

  it('will not queue a second delete while the first is still leaving', async () => {
    const deleteLabel = vi.fn().mockResolvedValue({ unlabeled: 1 })
    renderModal(makeDataset({ labels: [trip], transactions: [txn([1])] }), { deleteLabel })

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete label' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await act(async () => {})

    expect(screen.getByRole('button', { name: 'Delete label' })).toBeDisabled()

    await act(() => vi.advanceTimersByTimeAsync(EXIT_MS.sheet))
    expect(deleteLabel).toHaveBeenCalledTimes(1)
  })

  it('takes no Save or Cancel while a confirmed delete waits out the sheet exit', async () => {
    // A Save landing in that window would update the label and then still have it
    // deleted by the queued request; the whole actions row stands down together.
    const deleteLabel = vi.fn().mockResolvedValue({ unlabeled: 1 })
    renderModal(makeDataset({ labels: [trip], transactions: [txn([1])] }), { deleteLabel })

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete label' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await act(async () => {})

    // The leaving confirm sheet has a Cancel of its own; the form's is the one outside it.
    const confirm = screen.getByRole('alertdialog')
    const formCancel = screen
      .getAllByRole('button', { name: 'Cancel' })
      .find((button) => !confirm.contains(button))
    expect(screen.getByRole('button', { name: /Save|Add/ })).toBeDisabled()
    expect(formCancel).toBeDisabled()
  })
})
