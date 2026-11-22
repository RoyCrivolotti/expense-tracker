import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExpenseDataSource } from '../data/dataSource'
import type { ExpenseDataset } from '../types'
import { defaultExpenseSettings } from '../engine'
import { LEDGER_MODE_KEY } from '../config/ledgerMode'
import { allGroupsGranted } from '../domain/accessGroups'
import { ExpensesApp } from './ExpensesApp'

// The setup box is a separate chunk, slower to arrive than nothing and quicker than the data.
vi.mock('./onboarding/OnboardingWizard', async (importOriginal) => {
  await new Promise((resolve) => setTimeout(resolve, 150))
  return importOriginal()
})

const empty: ExpenseDataset = {
  flags: [],
  labels: [],
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

function slowSource(): ExpenseDataSource {
  return {
    canWrite: true,
    load: () => new Promise((resolve) => setTimeout(() => resolve(empty), 500)),
    createCategory: vi.fn(),
    createAccount: vi.fn(),
    updateSettings: vi.fn(),
  }
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(LEDGER_MODE_KEY, 'off')
})

describe('ExpensesApp on a first run, with a setup chunk that takes a moment', () => {
  it('has the setup box up by the time the empty Dashboard is, because the chunk was asked for at start', async () => {
    render(<ExpensesApp source={slowSource()} hubGrants={allGroupsGranted()} />)
    await screen.findByText('Income')
    expect(screen.getByRole('dialog', { name: 'Welcome' })).toBeInTheDocument()
  })
})
