import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ExpenseDataset, Transaction } from '../../types'
import { defaultExpenseSettings } from '../../engine'
import { makeTransaction } from '../../testing/factories'
import { MoneyFormatProvider } from '../hooks/MoneyFormatProvider'
import type { InstallmentDraft } from './installmentIntent'
import { InstallmentStep } from './InstallmentStep'

function emptyDataset(): ExpenseDataset {
  return {
    flags: [],
    attachments: [],
    categories: [],
    accounts: [],
    transactions: [],
    accountStatements: [],
    cashActuals: [],
    goalScenarios: [],
    installmentPlans: [],
    wealthAccounts: [],
    wealthCheckins: [],
    settings: defaultExpenseSettings(),
  }
}

const model = {
  dataset: emptyDataset(),
  lookup: {
    category: () => undefined,
    account: () => undefined,
    categoryName: () => '',
    accountName: () => '',
    flag: () => undefined,
    attachments: () => [],
    installmentPlan: () => undefined,
    settlementFor: () => undefined,
    settledBy: () => [],
  },
  descriptionIndex: { search: () => [], resolve: () => undefined },
  months: [] as string[],
}

function draft(overrides: Partial<InstallmentDraft> = {}): InstallmentDraft {
  return { mode: 'new', totalCount: '3', installmentIndex: '1', planId: null, ...overrides }
}

function renderStep(
  d: InstallmentDraft,
  set = vi.fn(),
  amountCents = 54370,
  editing: Transaction | null = null,
) {
  return render(
    <MoneyFormatProvider currencyCode="EUR" numberLocale="de-DE">
      <InstallmentStep
        model={model}
        editing={editing}
        draft={d}
        set={set}
        amountCents={amountCents}
      />
    </MoneyFormatProvider>,
  )
}

/** The draft every unlinked transaction arrives here with. */
function unlinked(): InstallmentDraft {
  return { mode: 'none', totalCount: '', installmentIndex: '', planId: null, splitTotal: false }
}

describe('InstallmentStep — NewFields', () => {
  it('renders the split-total checkbox when mode is new', () => {
    renderStep(draft())
    expect(screen.getByRole('checkbox')).toBeInTheDocument()
    expect(screen.getByText(/split evenly across installments/i)).toBeInTheDocument()
  })

  it('calls set with splitTotal true when the checkbox is checked', () => {
    const set = vi.fn()
    renderStep(draft({ splitTotal: false }), set)
    fireEvent.click(screen.getByRole('checkbox'))
    expect(set).toHaveBeenCalledWith('splitTotal', true)
  })

  it('shows the per-installment preview when splitTotal is true and totalCount is valid', () => {
    renderStep(draft({ splitTotal: true, totalCount: '3' }))
    // 54370 over 3 does not divide evenly: 181,24 € now, then 181,23 € × 2, which
    // sums back to 543,70 €. The old preview said "≈ 181,23 € × 3" — i.e. 543,69 €.
    expect(screen.getByText(/181,24 € now, then 181,23 € × 2/)).toBeInTheDocument()
  })

  it('drops the redundant multiplier when only one charge follows', () => {
    // Two installments is the common case, and "× 1" reads as a quantity to check
    // rather than the single remaining charge it describes.
    renderStep(draft({ splitTotal: true, totalCount: '2' }), vi.fn(), 3333)
    expect(screen.getByText('16,67 € now, then 16,66 €')).toBeInTheDocument()
    expect(screen.queryByText(/× 1\b/)).not.toBeInTheDocument()
  })

  it('drops the remainder wording when the split is exact', () => {
    renderStep(draft({ splitTotal: true, totalCount: '5' }), vi.fn(), 50000)
    expect(screen.getByText('100,00 € × 5')).toBeInTheDocument()
  })

  it('does not show the preview when splitTotal is false', () => {
    renderStep(draft({ splitTotal: false, totalCount: '3' }))
    expect(screen.queryByText(/× 3/)).not.toBeInTheDocument()
  })

  it('does not show the preview when totalCount is not a valid integer', () => {
    renderStep(draft({ splitTotal: true, totalCount: '0' }))
    expect(screen.queryByText(/×/)).not.toBeInTheDocument()
  })
})

describe('InstallmentStep — an unlinked transaction opens on New plan', () => {
  it('preselects New plan with its fields ready, and offers No plan as the way out', () => {
    renderStep(unlinked())
    expect(screen.getByRole('button', { name: 'New plan', pressed: true })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'No plan', pressed: false })).toBeInTheDocument()
    expect(screen.getByLabelText('Total installments')).toBeInTheDocument()
    expect(screen.getByLabelText('This installment #')).toHaveValue(1)
  })

  it('leaves the draft alone until a field is actually touched', () => {
    const set = vi.fn()
    renderStep(unlinked(), set)
    // Looking at the step must not link anything: the form's dirty check is a
    // diff against the draft it opened with.
    expect(set).not.toHaveBeenCalled()
  })

  it('promotes the draft to new once a total is entered', () => {
    const set = vi.fn()
    renderStep(unlinked(), set)
    fireEvent.change(screen.getByLabelText('Total installments'), { target: { value: '12' } })
    expect(set).toHaveBeenCalledWith('mode', 'new')
    expect(set).toHaveBeenCalledWith('installmentIndex', '1')
    expect(set).toHaveBeenCalledWith('totalCount', '12')
  })

  it('promotes when the installment number is edited first', () => {
    const set = vi.fn()
    renderStep(unlinked(), set)
    fireEvent.change(screen.getByLabelText('This installment #'), { target: { value: '3' } })
    expect(set).toHaveBeenCalledWith('mode', 'new')
    expect(set).toHaveBeenCalledWith('installmentIndex', '3')
  })

  it('promotes on the split-total checkbox too, not just the number fields', () => {
    const set = vi.fn()
    renderStep(unlinked(), set)
    fireEvent.click(screen.getByRole('checkbox'))
    expect(set).toHaveBeenCalledWith('mode', 'new')
    expect(set).toHaveBeenCalledWith('splitTotal', true)
  })

  it('drops back to no plan, fields and all, when No plan is chosen', () => {
    const set = vi.fn()
    renderStep(unlinked(), set)
    fireEvent.click(screen.getByRole('button', { name: 'No plan' }))
    expect(set).toHaveBeenCalledWith('mode', 'none')
    expect(screen.queryByLabelText('Total installments')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'No plan', pressed: true })).toBeInTheDocument()
  })

  it('keeps Keep as the default and shows no fields when editing a linked payment', () => {
    const editing: Transaction = { ...makeTransaction(), planId: 7, installmentIndex: 2 }
    renderStep(unlinked(), vi.fn(), 54370, editing)
    expect(screen.getByRole('button', { name: 'Keep', pressed: true })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'No plan' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Total installments')).not.toBeInTheDocument()
  })
})
