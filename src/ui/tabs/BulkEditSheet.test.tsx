import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BulkEditSheet } from './BulkEditSheet'
import type { ExpenseModel } from '../useExpenseData'

function makeModel(): ExpenseModel {
  return {
    dataset: {
      flags: [],
      categories: [
        { id: 1, name: 'Groceries', active: true, displayOrder: 0, isDefault: false },
        { id: 2, name: 'Dining out', active: true, displayOrder: 1, isDefault: false },
      ],
      accounts: [
        { id: 10, name: 'Checking', active: true, displayOrder: 0, type: 'debit', isDefault: true },
        { id: 11, name: 'Credit Card', active: true, displayOrder: 1, type: 'credit', isDefault: false },
      ],
      transactions: [],
      budgetAssignments: [],
      budgetTemplates: [],
      installmentPlans: [],
      statementPaidStatus: [],
      cashActuals: [],
      goalScenarios: [],
      goalProgressEntries: [],
      wealthAccounts: [],
      wealthCheckins: [],
    },
    loading: false,
    error: null,
  } as unknown as ExpenseModel
}

describe('BulkEditSheet', () => {
  it('renders the modal with correct title and count', () => {
    render(
      <BulkEditSheet count={3} model={makeModel()} busy={false} onApply={vi.fn()} onCancel={vi.fn()} />,
    )
    expect(screen.getByRole('dialog', { name: 'Edit selected' })).toBeInTheDocument()
    expect(screen.getByText('3 transactions')).toBeInTheDocument()
  })

  it('shows singular noun for count=1', () => {
    render(
      <BulkEditSheet count={1} model={makeModel()} busy={false} onApply={vi.fn()} onCancel={vi.fn()} />,
    )
    expect(screen.getByText('1 transaction')).toBeInTheDocument()
  })

  it('disables Apply when no fields toggled', () => {
    render(
      <BulkEditSheet count={2} model={makeModel()} busy={false} onApply={vi.fn()} onCancel={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: 'Apply changes' })).toBeDisabled()
  })

  it('enables Apply after toggling a field', async () => {
    const user = userEvent.setup()
    render(
      <BulkEditSheet count={2} model={makeModel()} busy={false} onApply={vi.fn()} onCancel={vi.fn()} />,
    )
    await user.click(screen.getByLabelText('Category'))
    expect(screen.getByRole('button', { name: 'Apply changes' })).toBeEnabled()
  })

  it('shows category select when Category is toggled', async () => {
    const user = userEvent.setup()
    render(
      <BulkEditSheet count={2} model={makeModel()} busy={false} onApply={vi.fn()} onCancel={vi.fn()} />,
    )
    await user.click(screen.getByLabelText('Category'))
    expect(screen.getByRole('combobox')).toBeInTheDocument()
    expect(screen.getByText('Groceries')).toBeInTheDocument()
    expect(screen.getByText('Dining out')).toBeInTheDocument()
  })

  it('shows type selector when Type is toggled', async () => {
    const user = userEvent.setup()
    render(
      <BulkEditSheet count={2} model={makeModel()} busy={false} onApply={vi.fn()} onCancel={vi.fn()} />,
    )
    await user.click(screen.getByLabelText('Type'))
    expect(screen.getByRole('button', { name: 'Expense' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Income' })).toBeInTheDocument()
  })

  it('calls onApply with only toggled fields', async () => {
    const onApply = vi.fn()
    const user = userEvent.setup()
    render(
      <BulkEditSheet count={2} model={makeModel()} busy={false} onApply={onApply} onCancel={vi.fn()} />,
    )
    await user.click(screen.getByLabelText('Category'))
    await user.click(screen.getByRole('button', { name: 'Apply changes' }))
    expect(onApply).toHaveBeenCalledWith({ categoryId: 1 })
  })

  it('calls onCancel when Cancel is clicked', async () => {
    const onCancel = vi.fn()
    const user = userEvent.setup()
    render(
      <BulkEditSheet count={2} model={makeModel()} busy={false} onApply={vi.fn()} onCancel={onCancel} />,
    )
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('shows "Applying…" and disables button when busy', () => {
    render(
      <BulkEditSheet count={2} model={makeModel()} busy={true} onApply={vi.fn()} onCancel={vi.fn()} />,
    )
    const btn = screen.getByRole('button', { name: 'Applying…' })
    expect(btn).toBeDisabled()
  })

  it('includes multiple toggled fields in the patch', async () => {
    const onApply = vi.fn()
    const user = userEvent.setup()
    render(
      <BulkEditSheet count={2} model={makeModel()} busy={false} onApply={onApply} onCancel={vi.fn()} />,
    )
    await user.click(screen.getByLabelText('Category'))
    await user.click(screen.getByLabelText('Type'))
    await user.click(screen.getByRole('button', { name: 'Apply changes' }))
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: 1, type: 'expense' }),
    )
  })

  it('allows changing category selection', async () => {
    const onApply = vi.fn()
    const user = userEvent.setup()
    render(
      <BulkEditSheet count={2} model={makeModel()} busy={false} onApply={onApply} onCancel={vi.fn()} />,
    )
    await user.click(screen.getByLabelText('Category'))
    await user.selectOptions(screen.getByRole('combobox'), '2')
    await user.click(screen.getByRole('button', { name: 'Apply changes' }))
    expect(onApply).toHaveBeenCalledWith({ categoryId: 2 })
  })

  it('shows account select and includes it in patch', async () => {
    const onApply = vi.fn()
    const user = userEvent.setup()
    render(
      <BulkEditSheet count={2} model={makeModel()} busy={false} onApply={onApply} onCancel={vi.fn()} />,
    )
    await user.click(screen.getByLabelText('Account'))
    const selects = screen.getAllByRole('combobox')
    await user.selectOptions(selects[0]!, '11')
    await user.click(screen.getByRole('button', { name: 'Apply changes' }))
    expect(onApply).toHaveBeenCalledWith({ accountId: 11 })
  })

  it('shows date input and includes it in patch', async () => {
    const onApply = vi.fn()
    render(
      <BulkEditSheet count={2} model={makeModel()} busy={false} onApply={onApply} onCancel={vi.fn()} />,
    )
    await userEvent.click(screen.getByLabelText('Date'))
    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement
    expect(dateInput).toBeTruthy()
    // fireEvent.change works more reliably for native date inputs in jsdom
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.change(dateInput, { target: { value: '2026-06-15' } })
    await userEvent.click(screen.getByRole('button', { name: 'Apply changes' }))
    expect(onApply).toHaveBeenCalledWith({ date: '2026-06-15' })
  })

  it('shows budget month input and includes it in patch', async () => {
    const onApply = vi.fn()
    render(
      <BulkEditSheet count={2} model={makeModel()} busy={false} onApply={onApply} onCancel={vi.fn()} />,
    )
    await userEvent.click(screen.getByLabelText('Budget month'))
    const monthInput = document.querySelector('input[type="month"]') as HTMLInputElement
    expect(monthInput).toBeTruthy()
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.change(monthInput, { target: { value: '2026-06' } })
    await userEvent.click(screen.getByRole('button', { name: 'Apply changes' }))
    expect(onApply).toHaveBeenCalledWith({ budgetMonth: '2026-06' })
  })

  it('changes type when a different type button is clicked', async () => {
    const onApply = vi.fn()
    const user = userEvent.setup()
    render(
      <BulkEditSheet count={2} model={makeModel()} busy={false} onApply={onApply} onCancel={vi.fn()} />,
    )
    await user.click(screen.getByLabelText('Type'))
    await user.click(screen.getByRole('button', { name: 'Income' }))
    await user.click(screen.getByRole('button', { name: 'Apply changes' }))
    expect(onApply).toHaveBeenCalledWith({ type: 'income' })
  })

  it('offers the flag field once the owner has flags, and can clear one', async () => {
    const model = makeModel()
    model.dataset.flags = [{ id: 7, name: 'Work travel', color: '#6366f1', reimbursable: true, sortOrder: 0, active: true }]
    const onApply = vi.fn()
    render(
      <BulkEditSheet count={2} model={model} busy={false} onApply={onApply} onCancel={vi.fn()} />,
    )

    await userEvent.click(screen.getByLabelText('Flag'))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Flag' }), 'none')
    await userEvent.click(screen.getByRole('button', { name: /Apply changes/ }))

    expect(onApply).toHaveBeenCalledWith({ flagId: null })
  })

  it('hides the flag field when the owner has no flags', () => {
    render(
      <BulkEditSheet
        count={2}
        model={makeModel()}
        busy={false}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.queryByLabelText('Flag')).not.toBeInTheDocument()
  })
})
