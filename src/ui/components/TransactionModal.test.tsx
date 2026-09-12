import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ExpenseDataset, Transaction } from '../../types'
import { defaultExpenseSettings } from '../../engine'
import type { ExpenseActions, TransactionSeed } from '../actions'
import { makeActions } from '../../testing/makeActions'
import { makeTransaction } from '../../testing/factories'
import { MoneyFormatProvider } from '../hooks/MoneyFormatProvider'
import type { ExpenseModel } from '../useExpenseData'
import { TransactionModal } from './TransactionModal'

function dataset(): ExpenseDataset {
  return {
    flags: [],
    attachments: [],
    categories: [{ id: 1, name: 'Groceries', monthlyBudgetCents: 0, sortOrder: 0, active: true }],
    accounts: [{ id: 1, name: 'Cash', kind: 'debit', settlement: 'immediate', active: true }],
    transactions: [],
    accountStatements: [],
    cashActuals: [],
    goalInputs: {
      housePriceCents: 0,
      downPaymentFraction: 0,
      mortgageTermYears: 0,
      mortgageRateAnnual: 0,
      longTermTargetCents: 0,
      horizonYears: 0,
      expectedRealReturn: 0,
    },
    goalScenarios: [],
    installmentPlans: [],
    wealthAccounts: [],
    wealthCheckins: [],
    settings: { ...defaultExpenseSettings(), defaultAccountId: 1 },
  }
}

function model(): ExpenseModel {
  return {
    dataset: dataset(),
    lookup: {
      category: () => undefined,
      account: () => undefined,
      categoryName: () => '',
      accountName: () => '',
      flag: () => undefined,
      attachments: () => [],
      installmentPlan: () => undefined,
    },
    descriptionIndex: { search: () => [], resolve: () => undefined },
    months: [],
  }
}

function renderModal(
  props: {
    editing?: Transaction | null
    seed?: TransactionSeed
    onClose?: () => void
    actions?: Partial<ExpenseActions>
  } = {},
) {
  const actions = makeActions(props.actions ?? {})
  const onClose = props.onClose ?? vi.fn()
  const view = render(
    <MoneyFormatProvider currencyCode="EUR" numberLocale="de-DE">
      <TransactionModal
        model={model()}
        actions={actions}
        editing={props.editing ?? null}
        seed={props.seed}
        onClose={onClose}
      />
    </MoneyFormatProvider>,
  )
  return Object.assign(view, { actions, onClose })
}

/** The single-transaction form is the only literal `<form>` element, so this
 * reliably scopes queries to it even while both forms are mounted (one hidden). */
function singleForm(container: HTMLElement) {
  return within(container.querySelector('form')!)
}

describe('TransactionModal — batch mode toggle', () => {
  it('shows the Add one / Add multiple toggle for a from-scratch add', () => {
    renderModal()
    expect(screen.getByRole('tab', { name: 'Add one' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Add multiple' })).toBeInTheDocument()
  })

  it('switches to the batch form and back via the toggle', () => {
    renderModal()
    fireEvent.click(screen.getByRole('tab', { name: 'Add multiple' }))
    expect(screen.getByText('Add multiple transactions')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Add multiple' })).toHaveAttribute('aria-selected', 'true')

    fireEvent.click(screen.getByRole('tab', { name: 'Add one' }))
    expect(screen.getByText('New transaction')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Add one' })).toHaveAttribute('aria-selected', 'true')
  })

  it('hides the toggle when editing an existing transaction', () => {
    const txn: Transaction = {
      id: 1,
      date: '2026-01-01',
      budgetMonth: '2026-01',
      description: 'Rent',
      accountId: 1,
      categoryId: 1,
      type: 'expense',
      amountCents: 1000,
      cancelled: false,
      status: 'posted',
    }
    renderModal({ editing: txn })
    expect(screen.queryByRole('tab', { name: 'Add multiple' })).not.toBeInTheDocument()
    expect(screen.getByText('Edit transaction')).toBeInTheDocument()
  })

  it('hides the toggle when a seed is present (duplicate / shortcut prefill)', () => {
    renderModal({ seed: { description: 'Copied txn', amountCents: 500 } })
    expect(screen.queryByRole('tab', { name: 'Add multiple' })).not.toBeInTheDocument()
  })

  it('keeps what was typed in the single form when switching to batch and back', () => {
    const { container } = renderModal()
    fireEvent.change(singleForm(container).getByLabelText('Description'), {
      target: { value: 'Coffee' },
    })
    fireEvent.click(screen.getByRole('tab', { name: 'Add multiple' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Add one' }))
    expect(singleForm(container).getByLabelText('Description')).toHaveValue('Coffee')
  })

  it('keeps what was typed in the batch form when switching to single and back', () => {
    renderModal()
    fireEvent.click(screen.getByRole('tab', { name: 'Add multiple' }))
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '12' } })
    fireEvent.click(screen.getByRole('tab', { name: 'Add one' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Add multiple' }))
    expect(screen.getByLabelText('Amount')).toHaveValue('12')
  })
})

describe('TransactionModal — closing with unsaved input', () => {
  it('closes immediately, no confirm, when nothing has been entered', () => {
    const onClose = vi.fn()
    renderModal({ onClose })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Discard unsaved changes?')).not.toBeInTheDocument()
  })

  it('asks to confirm before closing when the single form has unsaved input', () => {
    const onClose = vi.fn()
    const { container } = renderModal({ onClose })
    fireEvent.change(singleForm(container).getByLabelText('Description'), {
      target: { value: 'Coffee' },
    })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByText('Discard unsaved changes?')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('cancelling the discard confirm keeps the modal open with the input intact', () => {
    const onClose = vi.fn()
    const { container } = renderModal({ onClose })
    fireEvent.change(singleForm(container).getByLabelText('Description'), {
      target: { value: 'Coffee' },
    })
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).not.toHaveBeenCalled()
    expect(singleForm(container).getByLabelText('Description')).toHaveValue('Coffee')
  })

  it('also asks to confirm when the batch form (not the visible one) has unsaved input', () => {
    const onClose = vi.fn()
    renderModal({ onClose })
    fireEvent.click(screen.getByRole('tab', { name: 'Add multiple' }))
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '12' } })
    // Switch back to the (empty) single tab — the batch tab's draft is hidden, not gone.
    fireEvent.click(screen.getByRole('tab', { name: 'Add one' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByText('Discard unsaved changes?')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('TransactionModal — receipts staged on the add form', () => {
  const receipt = (name = 'flight.jpg') =>
    new File([new Uint8Array([1, 2, 3])], name, { type: 'image/jpeg' })

  /** Fill the minimum a create needs, and stage one receipt against it. */
  async function fillAndStage(container: HTMLElement, file = receipt()) {
    const form = singleForm(container)
    fireEvent.change(form.getByLabelText(/amount/i), { target: { value: '198,40' } })
    fireEvent.change(form.getByLabelText(/description/i), { target: { value: 'Flight' } })
    const input = container.querySelector('input[type=file]') as HTMLInputElement
    await userEvent.upload(input, file)
  }

  it('uploads a staged receipt against the id the create returned', async () => {
    const created = makeTransaction({ id: 42 })
    const { container, actions, onClose } = renderModal({
      actions: { createTransaction: vi.fn().mockResolvedValue(created) },
    })

    await fillAndStage(container)
    fireEvent.click(singleForm(container).getByRole('button', { name: 'Add transaction' }))

    await waitFor(() => expect(actions.uploadAttachment).toHaveBeenCalledTimes(1))
    expect(actions.uploadAttachment).toHaveBeenCalledWith(42, expect.any(File))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('keeps the modal open when the row saves but a receipt does not', async () => {
    const { container, onClose } = renderModal({
      actions: {
        createTransaction: vi.fn().mockResolvedValue(makeTransaction({ id: 42 })),
        uploadAttachment: vi.fn().mockRejectedValue(new Error('Receipt storage is full')),
      },
    })

    await fillAndStage(container)
    fireEvent.click(singleForm(container).getByRole('button', { name: 'Add transaction' }))

    // Saved, so closing would strand the receipt with no way back to it.
    await waitFor(() =>
      expect(singleForm(container).getByText(/could not be uploaded/i)).toBeInTheDocument(),
    )
    expect(onClose).not.toHaveBeenCalled()
    expect(
      singleForm(container).getByRole('button', { name: 'Retry receipts' }),
    ).toBeInTheDocument()
  })

  it('retries only the upload, never creating a second transaction', async () => {
    const createTransaction = vi.fn().mockResolvedValue(makeTransaction({ id: 42 }))
    const uploadAttachment = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValue(undefined)
    const { container, onClose } = renderModal({ actions: { createTransaction, uploadAttachment } })

    await fillAndStage(container)
    fireEvent.click(singleForm(container).getByRole('button', { name: 'Add transaction' }))
    const retry = await singleForm(container).findByRole('button', { name: 'Retry receipts' })

    fireEvent.click(retry)

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(createTransaction).toHaveBeenCalledTimes(1)
    expect(uploadAttachment).toHaveBeenCalledTimes(2)
  })

  it('treats a staged receipt as unsaved input when closing', async () => {
    const { container, onClose } = renderModal()
    const input = container.querySelector('input[type=file]') as HTMLInputElement

    await userEvent.upload(input, receipt())
    fireEvent.click(screen.getByRole('button', { name: /close/i }))

    // Without this the photos are dropped silently: nothing else on the form changed.
    expect(screen.getByText('Discard unsaved changes?')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })
})
