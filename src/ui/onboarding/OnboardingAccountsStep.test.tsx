import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { OnboardingAccountsStep } from './OnboardingAccountsStep'

function renderStep(overrides: Partial<Parameters<typeof OnboardingAccountsStep>[0]> = {}) {
  const props = {
    hasExistingAccounts: false,
    addDebit: true,
    debitName: 'Main debit',
    creditName: 'Credit card',
    addCredit: false,
    onAddDebit: vi.fn(),
    onDebitName: vi.fn(),
    onCreditName: vi.fn(),
    onAddCredit: vi.fn(),
    ...overrides,
  }
  render(<OnboardingAccountsStep {...props} />)
  return props
}

describe('OnboardingAccountsStep', () => {
  it('first run: always shows the debit name field, no opt-in checkbox', () => {
    renderStep({ hasExistingAccounts: false })
    expect(screen.getByLabelText('Main debit account')).toBeTruthy()
    expect(screen.queryByText('Add another debit account')).toBeNull()
  })

  it('re-entry with the checkbox off: hides the debit name field', () => {
    renderStep({ hasExistingAccounts: true, addDebit: false })
    expect(screen.getByText('Add another debit account')).toBeTruthy()
    expect(screen.queryByLabelText('Main debit account')).toBeNull()
  })

  it('re-entry with the checkbox on: shows the debit name field', () => {
    renderStep({ hasExistingAccounts: true, addDebit: true })
    expect(screen.getByLabelText('Main debit account')).toBeTruthy()
  })
})
