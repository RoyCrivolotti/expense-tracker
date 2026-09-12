import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ExpenseDataset } from '../../types'
import { defaultExpenseSettings } from '../../engine'
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

function renderStep(d: InstallmentDraft, set = vi.fn(), amountCents = 54370) {
  return render(
    <MoneyFormatProvider currencyCode="EUR" numberLocale="de-DE">
      <InstallmentStep
        model={model}
        editing={null}
        draft={d}
        set={set}
        onBack={vi.fn()}
        amountCents={amountCents}
      />
    </MoneyFormatProvider>,
  )
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
    // 54370 / 3 = 18123 cents = 181,23 €
    expect(screen.getByText(/181/)).toBeInTheDocument()
    expect(screen.getByText(/× 3/)).toBeInTheDocument()
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
