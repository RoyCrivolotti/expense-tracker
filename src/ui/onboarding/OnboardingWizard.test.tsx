import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ExpenseDataSource } from '../../data/dataSource'
import type { Account, ExpenseDataset } from '../../types'
import { defaultExpenseSettings } from '../../engine'
import { OnboardingWizard } from './OnboardingWizard'

function datasetWith(overrides: Partial<ExpenseDataset> = {}): ExpenseDataset {
  return {
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
    settings: defaultExpenseSettings(),
    ...overrides,
  }
}

function noopSource(): ExpenseDataSource {
  return {
    canWrite: true,
    load: vi.fn(),
    createCategory: vi.fn(),
    createAccount: vi.fn(),
    updateSettings: vi.fn(),
  }
}

function goToStep(targetStep: number) {
  for (let i = 0; i < targetStep; i++) {
    fireEvent.click(screen.getByText(/Continue/))
  }
}

describe('OnboardingWizard', () => {
  it('seeds the Money step from the tenant\'s real settings instead of hardcoded defaults', () => {
    const dataset = datasetWith({
      settings: {
        ...defaultExpenseSettings(),
        currencyCode: 'USD',
        numberLocale: 'en-US',
        budgetRolloverDay: 13,
      },
    })
    render(
      <OnboardingWizard
        source={noopSource()}
        dataset={dataset}
        applyPatch={vi.fn()}
        onDone={vi.fn()}
        onSkip={vi.fn()}
      />,
    )
    goToStep(1)
    expect(screen.getByLabelText('Currency')).toHaveValue('USD')
    expect(screen.getByLabelText('Number format')).toHaveValue('en-US')
    expect(screen.getByLabelText('Budget month starts on day')).toHaveValue(13)
  })

  describe('re-entry (tenant already has accounts)', () => {
    const existingAccount: Account = { id: 1, name: 'Existing', kind: 'debit', settlement: 'immediate', active: true }

    it('can finish without a debit name when the opt-in checkbox stays off', () => {
      const dataset = datasetWith({ accounts: [existingAccount] })
      render(
        <OnboardingWizard
          source={noopSource()}
          dataset={dataset}
          applyPatch={vi.fn()}
          onDone={vi.fn()}
          onSkip={vi.fn()}
        />,
      )
      goToStep(3)
      expect(screen.queryByLabelText('Main debit account')).toBeNull()
      expect(screen.getByText('Finish setup')).not.toBeDisabled()
    })

    it('requires a debit name once the opt-in checkbox is checked', () => {
      const dataset = datasetWith({ accounts: [existingAccount] })
      render(
        <OnboardingWizard
          source={noopSource()}
          dataset={dataset}
          applyPatch={vi.fn()}
          onDone={vi.fn()}
          onSkip={vi.fn()}
        />,
      )
      goToStep(3)
      fireEvent.click(screen.getByLabelText('Add another debit account'))
      const nameInput = screen.getByLabelText('Main debit account')
      fireEvent.change(nameInput, { target: { value: '' } })
      expect(screen.getByText('Finish setup')).toBeDisabled()
      fireEvent.change(nameInput, { target: { value: 'Second debit' } })
      expect(screen.getByText('Finish setup')).not.toBeDisabled()
    })
  })

  it('first run (no accounts yet) requires a debit name to finish', () => {
    const dataset = datasetWith()
    render(
      <OnboardingWizard
        source={noopSource()}
        dataset={dataset}
        applyPatch={vi.fn()}
        onDone={vi.fn()}
        onSkip={vi.fn()}
      />,
    )
    goToStep(3)
    const nameInput = screen.getByLabelText('Main debit account')
    fireEvent.change(nameInput, { target: { value: '' } })
    expect(screen.getByText('Finish setup')).toBeDisabled()
  })

  describe('confirmation popup on Finish setup', () => {
    function sourceWithAccountAndSettings() {
      const createCategory = vi
        .fn()
        .mockResolvedValue({ id: 1, name: 'Groceries', monthlyBudgetCents: 30000, sortOrder: 0, active: true })
      const createAccount = vi
        .fn()
        .mockResolvedValue({ id: 2, name: 'Main debit', kind: 'debit', settlement: 'immediate', active: true })
      const updateSettings = vi.fn().mockResolvedValue(defaultExpenseSettings())
      const source: ExpenseDataSource = {
        canWrite: true,
        load: vi.fn(),
        createCategory,
        createAccount,
        updateSettings,
      }
      return { source, createCategory, createAccount, updateSettings }
    }

    it('clicking Finish setup shows a confirmation popup listing what will be created, instead of finishing immediately', () => {
      const { source, createAccount } = sourceWithAccountAndSettings()
      render(
        <OnboardingWizard
          source={source}
          dataset={datasetWith()}
          applyPatch={vi.fn()}
          onDone={vi.fn()}
          onSkip={vi.fn()}
        />,
      )
      goToStep(3)
      fireEvent.click(screen.getByText('Finish setup'))
      expect(screen.getByText('Apply these changes?')).toBeTruthy()
      // All default presets are selected, and the default debit account is named.
      expect(screen.getByText(/new categories:/)).toBeTruthy()
      expect(screen.getByText('1 new account: Main debit')).toBeTruthy()
      expect(
        screen.getByText("This adds to what you already have — it doesn't check for or merge duplicate categories or accounts."),
      ).toBeTruthy()
      expect(createAccount).not.toHaveBeenCalled()
    })

    it('Cancel closes the popup without applying anything or losing wizard state', () => {
      const { source, createCategory, createAccount } = sourceWithAccountAndSettings()
      const onDone = vi.fn()
      render(
        <OnboardingWizard
          source={source}
          dataset={datasetWith()}
          applyPatch={vi.fn()}
          onDone={onDone}
          onSkip={vi.fn()}
        />,
      )
      goToStep(3)
      fireEvent.click(screen.getByText('Finish setup'))
      fireEvent.click(screen.getByText('Cancel'))
      expect(screen.queryByText('Apply these changes?')).toBeNull()
      expect(createCategory).not.toHaveBeenCalled()
      expect(createAccount).not.toHaveBeenCalled()
      expect(onDone).not.toHaveBeenCalled()
      // Wizard state survived: still on the Accounts step (nav back to it still works)
      // with its default debit name intact — Cancel didn't reset the draft.
      expect(screen.getByLabelText('Main debit account')).toHaveValue('Main debit')
      expect(screen.getByText('Back')).toBeTruthy()
    })

    it('confirming applies the setup and calls onDone', async () => {
      const { source, createCategory, createAccount, updateSettings } = sourceWithAccountAndSettings()
      const onDone = vi.fn()
      render(
        <OnboardingWizard
          source={source}
          dataset={datasetWith()}
          applyPatch={vi.fn()}
          onDone={onDone}
          onSkip={vi.fn()}
        />,
      )
      goToStep(3)
      fireEvent.click(screen.getByText('Finish setup'))
      fireEvent.click(screen.getByText('Apply'))
      await waitFor(() => expect(onDone).toHaveBeenCalled())
      expect(createCategory).toHaveBeenCalled()
      expect(createAccount).toHaveBeenCalledTimes(1)
      expect(updateSettings).toHaveBeenCalled()
    })
  })
})
