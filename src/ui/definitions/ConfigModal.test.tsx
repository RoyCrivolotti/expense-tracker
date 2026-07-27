import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Account, Category, ExpenseDataset } from '../../types'
import type { ExpenseActions } from '../actions'
import { buildExpenseModel } from '../buildExpenseModel'
import { defaultExpenseSettings } from '../../engine'
import { ConfigModal } from './ConfigModal'

const DINING: Category = { id: 1, name: 'Dining', monthlyBudgetCents: 0, sortOrder: 0, active: true }
const GROCERIES: Category = {
  id: 2,
  name: 'Groceries',
  monthlyBudgetCents: 0,
  sortOrder: 1,
  active: true,
}
const CHECKING: Account = { id: 10, name: 'Checking', kind: 'debit', settlement: 'immediate', active: true }
const OLD_CARD: Account = { id: 11, name: 'Old card', kind: 'credit', settlement: 'deferred', active: true }
const NEW_CARD: Account = { id: 12, name: 'New card', kind: 'debit', settlement: 'immediate', active: true }

function dataset(overrides: Partial<ExpenseDataset> = {}): ExpenseDataset {
  return {
    categories: [DINING, GROCERIES],
    accounts: [CHECKING, OLD_CARD],
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
    settings: defaultExpenseSettings(),
    ...overrides,
  }
}

function noopActions(overrides: Partial<ExpenseActions> = {}): ExpenseActions {
  return {
    onEdit: vi.fn(),
    onAdd: vi.fn(),
    onDuplicate: vi.fn(),
    createTransaction: vi.fn(),
    createTransactions: vi.fn(),
    updateTransaction: vi.fn(),
    deleteTransaction: vi.fn(),
    deleteTransactions: vi.fn(),
    setStatementPaid: vi.fn(),
    setCashActual: vi.fn(),
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn().mockResolvedValue({ reassignedToId: null }),
    createAccount: vi.fn(),
    updateAccount: vi.fn(),
    deleteAccount: vi.fn().mockResolvedValue({ reassignedToId: null }),
    updateSettings: vi.fn(),
    updateGoals: vi.fn(),
    createScenario: vi.fn(),
    updateScenario: vi.fn(),
    deleteScenario: vi.fn(),
    createInstallmentPlan: vi.fn(),
    updateInstallmentPlan: vi.fn(),
    deleteInstallmentPlan: vi.fn(),
    ...overrides,
  }
}

describe('ConfigModal delete control', () => {
  it('plain-deletes an unused category via a simple confirm sheet', async () => {
    const actions = noopActions()
    const onClose = vi.fn()
    render(
      <ConfigModal
        target={{ kind: 'category', record: GROCERIES }}
        model={buildExpenseModel(dataset())}
        actions={actions}
        onClose={onClose}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Delete category' }))
    expect(screen.getByText("This can't be undone.")).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(actions.deleteCategory).toHaveBeenCalledWith(GROCERIES.id)
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('escalates to the reassign sheet when a plain delete 409s (stale client usage count)', async () => {
    const conflict = Object.assign(new Error('Category is in use by 1 record(s)'), { status: 409 })
    const actions = noopActions({
      deleteCategory: vi.fn().mockRejectedValue(conflict),
    })
    const onClose = vi.fn()
    render(
      <ConfigModal
        target={{ kind: 'category', record: GROCERIES }}
        model={buildExpenseModel(dataset())}
        actions={actions}
        onClose={onClose}
      />,
    )

    // Client-side usageCount says 0 (unused), so this opens the plain-delete confirm...
    fireEvent.click(screen.getByRole('button', { name: 'Delete category' }))
    expect(screen.getByText("This can't be undone.")).toBeTruthy()

    // ...but the server disagrees (409). Escalate straight to reassign instead of
    // leaving the user stuck retrying the same failing delete.
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await vi.waitFor(() => expect(screen.getByLabelText('Move to')).toBeTruthy())
    expect(
      screen.getByText(`This category turned out to still be in use elsewhere. Move its records to another category first, or create a new one.`),
    ).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('offers a reassign sheet for a category in use, defaulting to the other category', async () => {
    const actions = noopActions({
      deleteCategory: vi.fn().mockResolvedValue({ reassignedToId: GROCERIES.id }),
    })
    const onClose = vi.fn()
    const ds = dataset({
      transactions: [
        {
          id: 1,
          date: '2026-01-01',
          budgetMonth: '2026-01',
          description: 'Lunch',
          accountId: CHECKING.id,
          categoryId: DINING.id,
          type: 'expense',
          amountCents: -1200,
          cancelled: false,
          status: 'posted',
        },
      ],
    })
    render(
      <ConfigModal
        target={{ kind: 'category', record: DINING }}
        model={buildExpenseModel(ds)}
        actions={actions}
        onClose={onClose}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Delete category' }))
    expect(screen.getByText(/used by 1 record/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(actions.deleteCategory).toHaveBeenCalledWith(DINING.id, { reassignToId: GROCERIES.id })
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('excludes inactive categories from the reassign-target dropdown', () => {
    const ARCHIVED: Category = { id: 3, name: 'Old category', monthlyBudgetCents: 0, sortOrder: 2, active: false }
    const actions = noopActions()
    const ds = dataset({
      categories: [DINING, GROCERIES, ARCHIVED],
      transactions: [
        {
          id: 1,
          date: '2026-01-01',
          budgetMonth: '2026-01',
          description: 'Lunch',
          accountId: CHECKING.id,
          categoryId: DINING.id,
          type: 'expense',
          amountCents: -1200,
          cancelled: false,
          status: 'posted',
        },
      ],
    })
    render(
      <ConfigModal
        target={{ kind: 'category', record: DINING }}
        model={buildExpenseModel(ds)}
        actions={actions}
        onClose={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Delete category' }))
    const select = screen.getByLabelText<HTMLSelectElement>('Move to')
    const optionLabels = Array.from(select.options).map((o) => o.textContent)
    expect(optionLabels).toContain('Groceries')
    expect(optionLabels).not.toContain('Old category')
  })

  it('creates a new category inline when "create new" is chosen in the reassign sheet', () => {
    const actions = noopActions({
      deleteCategory: vi.fn().mockResolvedValue({ reassignedToId: 99 }),
    })
    const ds = dataset({
      transactions: [
        {
          id: 1,
          date: '2026-01-01',
          budgetMonth: '2026-01',
          description: 'Lunch',
          accountId: CHECKING.id,
          categoryId: DINING.id,
          type: 'expense',
          amountCents: -1200,
          cancelled: false,
          status: 'posted',
        },
      ],
    })
    render(
      <ConfigModal
        target={{ kind: 'category', record: DINING }}
        model={buildExpenseModel(ds)}
        actions={actions}
        onClose={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Delete category' }))
    fireEvent.change(screen.getByLabelText('Move to'), { target: { value: '__create__' } })
    fireEvent.change(screen.getByLabelText('New category name'), {
      target: { value: 'Dining out' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(actions.deleteCategory).toHaveBeenCalledWith(DINING.id, {
      createCategory: {
        name: 'Dining out',
        monthlyBudgetCents: DINING.monthlyBudgetCents,
        sortOrder: DINING.sortOrder,
        active: DINING.active,
      },
    })
  })

  it('blocks deletion of the tenant\'s only category', () => {
    render(
      <ConfigModal
        target={{ kind: 'category', record: DINING }}
        model={buildExpenseModel(dataset({ categories: [DINING] }))}
        actions={noopActions()}
        onClose={vi.fn()}
      />,
    )

    expect(
      screen.getByText("You need at least one category, so this one can't be deleted."),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Delete category' })).toBeNull()
  })

  it("blocks deletion of the tenant's only account", () => {
    render(
      <ConfigModal
        target={{ kind: 'account', record: CHECKING }}
        model={buildExpenseModel(dataset({ accounts: [CHECKING] }))}
        actions={noopActions()}
        onClose={vi.fn()}
      />,
    )

    expect(
      screen.getByText("You need at least one account, so this one can't be deleted."),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Delete account' })).toBeNull()
  })

  it('excludes inactive accounts from the reassign-target dropdown', () => {
    const ARCHIVED_ACCOUNT: Account = { id: 13, name: 'Old checking', kind: 'debit', settlement: 'immediate', active: false }
    const ds = dataset({
      accounts: [CHECKING, OLD_CARD, ARCHIVED_ACCOUNT],
      transactions: [
        {
          id: 1,
          date: '2026-01-01',
          budgetMonth: '2026-01',
          description: 'Statement charge',
          accountId: OLD_CARD.id,
          categoryId: DINING.id,
          type: 'expense',
          amountCents: -500,
          cancelled: false,
          status: 'posted',
        },
      ],
    })
    render(
      <ConfigModal
        target={{ kind: 'account', record: OLD_CARD }}
        model={buildExpenseModel(ds)}
        actions={noopActions()}
        onClose={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    const select = screen.getByLabelText<HTMLSelectElement>('Move to')
    const optionLabels = Array.from(select.options).map((o) => o.textContent)
    expect(optionLabels).toContain('Checking')
    expect(optionLabels).not.toContain('Old checking')
  })

  it('inline-creates a reassign account inheriting kind/settlement from the account being deleted', () => {
    const actions = noopActions({
      deleteAccount: vi.fn().mockResolvedValue({ reassignedToId: 42 }),
    })
    const ds = dataset({
      accounts: [CHECKING, OLD_CARD],
      transactions: [
        {
          id: 1,
          date: '2026-01-01',
          budgetMonth: '2026-01',
          description: 'Statement charge',
          accountId: OLD_CARD.id,
          categoryId: DINING.id,
          type: 'expense',
          amountCents: -500,
          cancelled: false,
          status: 'posted',
        },
      ],
    })
    render(
      <ConfigModal
        target={{ kind: 'account', record: OLD_CARD }}
        model={buildExpenseModel(ds)}
        actions={actions}
        onClose={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    fireEvent.change(screen.getByLabelText('Move to'), { target: { value: '__create__' } })
    fireEvent.change(screen.getByLabelText('New account name'), {
      target: { value: 'Replacement card' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(actions.deleteAccount).toHaveBeenCalledWith(OLD_CARD.id, {
      createAccount: {
        name: 'Replacement card',
        kind: OLD_CARD.kind,
        settlement: OLD_CARD.settlement,
        active: OLD_CARD.active,
      },
    })
  })

  it('lists the account itself once as the sole reassign target for an account in use', () => {
    const ds = dataset({
      accounts: [OLD_CARD, NEW_CARD],
      transactions: [
        {
          id: 1,
          date: '2026-01-01',
          budgetMonth: '2026-01',
          description: 'Statement charge',
          accountId: OLD_CARD.id,
          categoryId: DINING.id,
          type: 'expense',
          amountCents: -500,
          cancelled: false,
          status: 'posted',
        },
      ],
    })
    render(
      <ConfigModal
        target={{ kind: 'account', record: OLD_CARD }}
        model={buildExpenseModel(ds)}
        actions={noopActions()}
        onClose={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    const select = screen.getByLabelText<HTMLSelectElement>('Move to')
    const optionLabels = Array.from(select.options).map((o) => o.textContent)
    expect(optionLabels).toEqual([NEW_CARD.name, `+ Create new account`])
  })

  it('Escape while the plain-delete confirm is open closes only the confirm, not the whole editor', () => {
    const onClose = vi.fn()
    render(
      <ConfigModal
        target={{ kind: 'category', record: GROCERIES }}
        model={buildExpenseModel(dataset())}
        actions={noopActions()}
        onClose={onClose}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Delete category' }))
    expect(screen.getByText("This can't be undone.")).toBeTruthy()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByText("This can't be undone.")).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Delete category' })).toBeTruthy()
  })

  it('Escape while the reassign sheet is open closes only the sheet, not the whole editor', () => {
    const onClose = vi.fn()
    const ds = dataset({
      transactions: [
        {
          id: 1,
          date: '2026-01-01',
          budgetMonth: '2026-01',
          description: 'Lunch',
          accountId: CHECKING.id,
          categoryId: DINING.id,
          type: 'expense',
          amountCents: -1200,
          cancelled: false,
          status: 'posted',
        },
      ],
    })
    render(
      <ConfigModal
        target={{ kind: 'category', record: DINING }}
        model={buildExpenseModel(ds)}
        actions={noopActions()}
        onClose={onClose}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Delete category' }))
    expect(screen.getByLabelText('Move to')).toBeTruthy()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByLabelText('Move to')).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Delete category' })).toBeTruthy()
  })

  it('clicking Delete twice on the plain-delete confirm only deletes once', async () => {
    const actions = noopActions()
    const onClose = vi.fn()
    render(
      <ConfigModal
        target={{ kind: 'category', record: GROCERIES }}
        model={buildExpenseModel(dataset())}
        actions={actions}
        onClose={onClose}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Delete category' }))
    const deleteBtn = screen.getByRole('button', { name: 'Delete' })
    fireEvent.click(deleteBtn)
    fireEvent.click(deleteBtn)

    await vi.waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(actions.deleteCategory).toHaveBeenCalledTimes(1)
  })
})
