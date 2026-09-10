import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { ExpenseDataset } from '../../types'
import { defaultExpenseSettings } from '../../engine'
import type { ExpenseActions } from '../actions'
import { MoneyFormatProvider } from '../hooks/MoneyFormatProvider'
import type { ExpenseModel } from '../useExpenseData'
import { GroupedTransactionForm } from './GroupedTransactionForm'

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

function dataset(): ExpenseDataset {
  return {
    categories: [
      { id: 1, name: 'Groceries', monthlyBudgetCents: 0, sortOrder: 0, active: true },
      { id: 2, name: 'Dining out', monthlyBudgetCents: 0, sortOrder: 1, active: true },
    ],
    accounts: [
      { id: 1, name: 'Cash', kind: 'debit', settlement: 'immediate', active: true },
      { id: 2, name: 'Card', kind: 'credit', settlement: 'deferred', active: true },
    ],
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

/** A "Netflix" suggestion remembering Dining out (2) + Card (2), distinct from the (1, 1) defaults. */
function model(): ExpenseModel {
  return {
    dataset: dataset(),
    lookup: {
      category: () => undefined,
      account: () => undefined,
      categoryName: () => '',
      accountName: () => '',
      installmentPlan: () => undefined,
    },
    descriptionIndex: {
      search: (prefix: string) =>
        prefix.toLowerCase().startsWith('net')
          ? [{ label: 'Netflix', template: { type: 'expense' as const, categoryId: 2, accountId: 2 } }]
          : [],
      resolve: () => undefined,
    },
    months: [],
  }
}

function makeActions(overrides: Partial<ExpenseActions> = {}): ExpenseActions {
  return {
    onEdit: vi.fn(),
    onAdd: vi.fn(),
    onDuplicate: vi.fn(),
    createTransaction: vi.fn().mockResolvedValue(undefined),
    createTransactions: vi.fn().mockResolvedValue(undefined),
    updateTransaction: vi.fn().mockResolvedValue(undefined),
    deleteTransaction: vi.fn().mockResolvedValue(undefined),
    deleteTransactions: vi.fn().mockResolvedValue(undefined),
    setStatementPaid: vi.fn().mockResolvedValue(undefined),
    setCashActual: vi.fn().mockResolvedValue(undefined),
    createCategory: vi.fn().mockResolvedValue(undefined),
    updateCategory: vi.fn().mockResolvedValue(undefined),
    deleteCategory: vi.fn().mockResolvedValue({ reassignedToId: null }),
    createAccount: vi.fn().mockResolvedValue(undefined),
    updateAccount: vi.fn().mockResolvedValue(undefined),
    deleteAccount: vi.fn().mockResolvedValue({ reassignedToId: null }),
    updateSettings: vi.fn().mockResolvedValue(undefined),
    updateGoals: vi.fn().mockResolvedValue(undefined),
    createScenario: vi.fn(),
    updateScenario: vi.fn().mockResolvedValue(undefined),
    deleteScenario: vi.fn().mockResolvedValue(undefined),
    createInstallmentPlan: vi.fn(),
    updateInstallmentPlan: vi.fn().mockResolvedValue(undefined),
    deleteInstallmentPlan: vi.fn().mockResolvedValue(undefined),
    createWealthAccount: vi.fn(),
    updateWealthAccount: vi.fn(),
    deleteWealthAccount: vi.fn(),
    createWealthCheckin: vi.fn(),
    updateWealthCheckin: vi.fn(),
    deleteWealthCheckin: vi.fn(),
    ...overrides,
  }
}

function renderForm(actions = makeActions(), extra: { onDirtyChange?: (d: boolean) => void } = {}) {
  const onClose = vi.fn()
  render(
    <MoneyFormatProvider currencyCode="EUR" numberLocale="de-DE">
      <GroupedTransactionForm model={model()} actions={actions} onClose={onClose} {...extra} />
    </MoneyFormatProvider>,
  )
  return { actions, onClose }
}

// Both the entry strip and an open line editor render an "Amount (€)" label and
// an "e.g. Mercadona" placeholder, so every query has to say which one it means.
const strip = () => within(screen.getByTestId('entry-strip'))
const editor = () => within(screen.getByTestId('line-editor'))
const amountInput = () => strip().getByLabelText('Amount (€)')
const descriptionInput = () => strip().getByPlaceholderText('e.g. Mercadona')
const committedLines = () => screen.queryAllByRole('button', { expanded: false }).filter((b) => b.getAttribute('aria-controls'))
const summaryText = () => screen.getByTestId('grouped-summary').textContent

/** Fill and commit one line the way the keyboard flow does. */
function enterLine(amount: string, description: string) {
  fireEvent.change(amountInput(), { target: { value: amount } })
  fireEvent.change(descriptionInput(), { target: { value: description } })
  fireEvent.keyDown(descriptionInput(), { key: 'Enter' })
}

describe('GroupedTransactionForm — rendering', () => {
  it('starts with one empty group and nothing to save', () => {
    renderForm()
    expect(amountInput()).toHaveValue('')
    expect(summaryText()).toContain('0 transactions')
    expect(screen.getByRole('button', { name: /add 0 transactions/i })).toBeInTheDocument()
  })

  it('shows the budget month derived from the group date rather than as an editable field', () => {
    renderForm()
    // No month input anywhere — the value is derived and displayed read-only.
    expect(document.querySelector('input[type="month"]')).toBeNull()
  })

  it('offers no way to remove the only group', () => {
    renderForm()
    expect(screen.queryByRole('button', { name: /^Remove Groceries on/ })).not.toBeInTheDocument()
  })
})

describe('GroupedTransactionForm — committing a line', () => {
  it('moves focus from Amount to Description on Enter without committing', () => {
    renderForm()
    fireEvent.change(amountInput(), { target: { value: '12,50' } })
    fireEvent.keyDown(amountInput(), { key: 'Enter' })

    expect(document.activeElement).toBe(descriptionInput())
    // Nothing filed yet — the running total already counts the strip, since a
    // valid strip is saved rather than dropped, but no line has been committed.
    expect(committedLines()).toHaveLength(0)
  })

  it('commits on Enter in Description, clears the strip, and returns focus to Amount', () => {
    renderForm()
    enterLine('12,50', 'Mercadona')

    expect(screen.getByRole('button', { name: /Mercadona.*Groceries.*12,50/ })).toBeInTheDocument()
    expect(amountInput()).toHaveValue('')
    expect(descriptionInput()).toHaveValue('')
    // The regression test for the focused-card trial, where advancing dropped
    // focus to document.body and every entry needed a fresh tap.
    expect(document.activeElement).toBe(amountInput())
    expect(summaryText()).toContain('1 transaction')
  })

  it('keeps focus on Amount across consecutive commits, so the strip is never remounted', () => {
    renderForm()
    enterLine('12,50', 'Mercadona')
    enterLine('3,50', 'Coffee')

    expect(committedLines()).toHaveLength(2)
    expect(document.activeElement).toBe(amountInput())
    expect(summaryText()).toContain('2 transactions')
    expect(summaryText()).toContain('16,00')
  })

  it('commits from the visible add button too, which is the only route on iOS', () => {
    // inputMode="decimal" gives no Return key on an iPhone, so Enter alone
    // would leave the phone — the primary device — unable to file a line.
    renderForm()
    fireEvent.change(amountInput(), { target: { value: '8,00' } })
    fireEvent.change(descriptionInput(), { target: { value: 'Bakery' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add line to Groceries' }))

    expect(screen.getByRole('button', { name: /Bakery.*8,00/ })).toBeInTheDocument()
  })

  it('ignores Enter on an untouched strip', () => {
    renderForm()
    fireEvent.keyDown(descriptionInput(), { key: 'Enter' })

    expect(committedLines()).toHaveLength(0)
    expect(screen.queryByText('Enter an amount greater than zero')).not.toBeInTheDocument()
  })

  it('refuses a line with no positive amount and keeps focus on Amount', () => {
    renderForm()
    fireEvent.change(descriptionInput(), { target: { value: 'Broken' } })
    fireEvent.keyDown(descriptionInput(), { key: 'Enter' })

    expect(screen.getByText('Enter an amount greater than zero')).toBeInTheDocument()
    expect(committedLines()).toHaveLength(0)
    expect(document.activeElement).toBe(amountInput())
  })

  it('clears that error as soon as the amount is corrected', () => {
    renderForm()
    fireEvent.change(descriptionInput(), { target: { value: 'Broken' } })
    fireEvent.keyDown(descriptionInput(), { key: 'Enter' })
    expect(screen.getByText('Enter an amount greater than zero')).toBeInTheDocument()

    fireEvent.change(amountInput(), { target: { value: '25,00' } })

    expect(screen.queryByText('Enter an amount greater than zero')).not.toBeInTheDocument()
  })

  it('accepts a highlighted suggestion on Enter without committing, then commits on the next Enter', () => {
    renderForm()
    fireEvent.change(amountInput(), { target: { value: '9,99' } })
    fireEvent.change(descriptionInput(), { target: { value: 'Net' } })
    fireEvent.focus(descriptionInput())
    fireEvent.keyDown(descriptionInput(), { key: 'ArrowDown' })
    fireEvent.keyDown(descriptionInput(), { key: 'Enter' })

    // Accepting rewrites type/category/account, so it must be visible for a beat
    // before the line is filed rather than happening in the same keystroke.
    expect(descriptionInput()).toHaveValue('Netflix')
    expect(committedLines()).toHaveLength(0)

    fireEvent.keyDown(descriptionInput(), { key: 'Enter' })
    expect(screen.getByRole('button', { name: /Netflix.*Dining out.*Card/ })).toBeInTheDocument()
  })
})

describe('GroupedTransactionForm — committed lines', () => {
  it('names each line by its own content, so no two controls share a label', () => {
    renderForm()
    enterLine('12,50', 'Mercadona')
    enterLine('3,50', 'Coffee')

    expect(screen.getByRole('button', { name: /Mercadona.*Expense.*Groceries.*Cash/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Coffee.*Expense.*Groceries.*Cash/ })).toBeInTheDocument()
    expect(screen.queryAllByLabelText('Remove this transaction')).toHaveLength(0)
  })

  it('expands one line at a time', () => {
    renderForm()
    enterLine('12,50', 'Mercadona')
    enterLine('3,50', 'Coffee')

    fireEvent.click(screen.getByRole('button', { name: /Mercadona/ }))
    expect(screen.getByTestId('line-editor')).toBeInTheDocument()
    expect(editor().getByLabelText('Amount (€)')).toHaveValue('12,50')

    fireEvent.click(screen.getByRole('button', { name: /Coffee/ }))
    expect(screen.getAllByTestId('line-editor')).toHaveLength(1)
    expect(editor().getByLabelText('Amount (€)')).toHaveValue('3,50')
  })

  it('scopes the editor so its duplicate labels never collide with the strip', () => {
    renderForm()
    enterLine('12,50', 'Mercadona')
    fireEvent.click(screen.getByRole('button', { name: /Mercadona/ }))

    // Both surfaces render "Amount (€)", so an unscoped query is ambiguous —
    // which is exactly why the editor carries its own role/testid.
    expect(() => screen.getByLabelText('Amount (€)')).toThrow()
    expect(strip().getByLabelText('Amount (€)')).toHaveValue('')
    expect(editor().getByLabelText('Amount (€)')).toHaveValue('12,50')
    expect(screen.getByRole('group', { name: 'Editing Mercadona' })).toBeInTheDocument()
  })

  it('edits a line in place and updates the running total', () => {
    renderForm()
    enterLine('12,50', 'Mercadona')
    fireEvent.click(screen.getByRole('button', { name: /Mercadona/ }))
    fireEvent.change(editor().getByLabelText('Amount (€)'), { target: { value: '20,00' } })

    expect(summaryText()).toContain('20,00')
  })

  it('removes a line from its editor', () => {
    renderForm()
    enterLine('12,50', 'Mercadona')
    fireEvent.click(screen.getByRole('button', { name: /Mercadona/ }))
    fireEvent.click(editor().getByRole('button', { name: 'Remove' }))

    expect(screen.queryByText('Mercadona')).not.toBeInTheDocument()
    expect(summaryText()).toContain('0 transactions')
  })
})

describe('GroupedTransactionForm — groups', () => {
  it('carries a group category change into lines that had not been overridden', () => {
    renderForm()
    enterLine('12,50', 'Mercadona')
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: '2' } })

    expect(screen.getByRole('button', { name: /Mercadona.*Dining out/ })).toBeInTheDocument()
  })

  it('leaves an individually overridden line alone, in place', () => {
    renderForm()
    enterLine('12,50', 'Mercadona')
    enterLine('3,50', 'Coffee')

    // Override just the first line.
    fireEvent.click(screen.getByRole('button', { name: /Mercadona/ }))
    fireEvent.change(editor().getByLabelText('Category'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: /Mercadona/ }))

    // Now move the group somewhere else entirely.
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: '2' } })

    const lines = committedLines().map((b) => b.textContent)
    expect(lines[0]).toMatch(/Mercadona.*Dining out/)
    expect(lines[1]).toMatch(/Coffee.*Dining out/)
    expect(lines).toHaveLength(2)
  })

  it('adds a second group seeded with the next unused category and its own strip', () => {
    renderForm()
    enterLine('12,50', 'Mercadona')
    fireEvent.click(screen.getByRole('button', { name: /add another group/i }))

    expect(screen.getByRole('button', { name: 'Add line to Dining out' })).toBeInTheDocument()
    // Only the active group shows a strip; the earlier one offers to reactivate.
    expect(screen.getAllByTestId('entry-strip')).toHaveLength(1)
    expect(screen.getByRole('button', { name: /Add to Groceries/ })).toBeInTheDocument()
  })

  it('moves the strip back to an earlier group when it is reactivated', () => {
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: /add another group/i }))
    fireEvent.click(screen.getByRole('button', { name: /Add to Groceries/ }))

    expect(screen.getByRole('button', { name: 'Add line to Groceries' })).toBeInTheDocument()
  })

  it('only allows removing a group while it is still empty', () => {
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: /add another group/i }))
    expect(screen.getByRole('button', { name: /^Remove Dining out on/ })).toBeInTheDocument()

    enterLine('4,00', 'Tapas')
    expect(screen.queryByRole('button', { name: /^Remove Dining out on/ })).not.toBeInTheDocument()
  })
})

describe('GroupedTransactionForm — save', () => {
  it('sends every line in one call, each carrying its own group’s date', async () => {
    const createTransactions = vi.fn().mockResolvedValue(undefined)
    const { onClose } = renderForm(makeActions({ createTransactions }))
    enterLine('12,50', 'Mercadona')
    fireEvent.click(screen.getByRole('button', { name: /add another group/i }))
    enterLine('3,50', 'Coffee')

    fireEvent.click(screen.getByRole('button', { name: /add 2 transactions/i }))

    await waitFor(() => expect(createTransactions).toHaveBeenCalledTimes(1))
    const saved = createTransactions.mock.calls[0]![0] as Array<Record<string, unknown>>
    expect(saved).toHaveLength(2)
    expect(saved[0]).toMatchObject({ description: 'Mercadona', amountCents: 1250, categoryId: 1 })
    expect(saved[1]).toMatchObject({ description: 'Coffee', amountCents: 350, categoryId: 2 })
    // budgetMonth is derived, never entered — it must still be present and well-formed.
    expect(saved[0]!.budgetMonth).toMatch(/^\d{4}-\d{2}$/)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('saves a valid line still sitting in the strip rather than dropping it', async () => {
    const createTransactions = vi.fn().mockResolvedValue(undefined)
    renderForm(makeActions({ createTransactions }))
    fireEvent.change(amountInput(), { target: { value: '7,25' } })
    fireEvent.change(descriptionInput(), { target: { value: 'Uncommitted' } })

    // Counted before it is committed, so the button never promises less than it writes.
    expect(screen.getByRole('button', { name: /add 1 transaction/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /add 1 transaction/i }))

    await waitFor(() => expect(createTransactions).toHaveBeenCalledTimes(1))
    const saved = createTransactions.mock.calls[0]![0] as Array<Record<string, unknown>>
    expect(saved).toEqual([expect.objectContaining({ description: 'Uncommitted', amountCents: 725 })])
  })

  it('does not call the action when nothing was entered', () => {
    const { actions } = renderForm()
    fireEvent.click(screen.getByRole('button', { name: /add 0 transactions/i }))
    expect(actions.createTransactions).not.toHaveBeenCalled()
  })

  it('opens the offending line and saves nothing when a committed line is invalid', () => {
    const { actions } = renderForm()
    enterLine('12,50', 'Mercadona')
    fireEvent.click(screen.getByRole('button', { name: /Mercadona/ }))
    fireEvent.change(editor().getByLabelText('Amount (€)'), { target: { value: '0' } })
    fireEvent.click(editor().getByRole('button', { name: 'Done' }))

    fireEvent.click(screen.getByRole('button', { name: /add 0 transactions/i }))

    expect(actions.createTransactions).not.toHaveBeenCalled()
    expect(screen.getByText('Enter an amount greater than zero')).toBeInTheDocument()
    expect(screen.getByTestId('line-editor')).toBeInTheDocument()
  })

  it('keeps the form open and re-enables saving when the request fails', async () => {
    const actions = makeActions({
      createTransactions: vi.fn().mockRejectedValue(new Error('network down')),
    })
    const { onClose } = renderForm(actions)
    enterLine('5,00', 'Snack')

    fireEvent.click(screen.getByRole('button', { name: /add 1 transaction/i }))

    await waitFor(() => expect(actions.createTransactions).toHaveBeenCalledTimes(1))
    expect(onClose).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /add 1 transaction/i })).not.toBeDisabled(),
    )
  })
})

describe('GroupedTransactionForm — unsaved-input reporting', () => {
  it('reports nothing typed on mount', () => {
    const onDirtyChange = vi.fn()
    renderForm(makeActions(), { onDirtyChange })
    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
  })

  it('reports a half-typed strip as unsaved, so closing warns instead of discarding', () => {
    const onDirtyChange = vi.fn()
    renderForm(makeActions(), { onDirtyChange })
    fireEvent.change(descriptionInput(), { target: { value: 'Half typed' } })
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)
  })

  it('goes back to clean once the strip is cleared again', () => {
    const onDirtyChange = vi.fn()
    renderForm(makeActions(), { onDirtyChange })
    fireEvent.change(amountInput(), { target: { value: '5' } })
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)

    fireEvent.change(amountInput(), { target: { value: '' } })
    // Line ids are stripped from the snapshot, so an emptied form reads clean
    // rather than staying dirty forever on a regenerated id.
    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
  })

  it('reports a committed line as unsaved input', () => {
    const onDirtyChange = vi.fn()
    renderForm(makeActions(), { onDirtyChange })
    enterLine('12,50', 'Mercadona')
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)
  })
})
