import { describe, expect, it } from 'vitest'
import { EU_MONEY_FORMAT, resolveMoneyFormat } from '../../engine/money'
import { buildOnboardingConfirmSummary } from './onboardingConfirmSummary'

const baseMoney = { currencyCode: 'EUR', numberLocale: 'de-DE', budgetRolloverDay: 1 }

describe('buildOnboardingConfirmSummary', () => {
  it('always includes a currency/rollover-day line, even with nothing else selected', () => {
    const lines = buildOnboardingConfirmSummary({
      categories: [],
      addDebit: false,
      debitName: '',
      addCredit: false,
      creditName: '',
      money: baseMoney,
      format: EU_MONEY_FORMAT,
    })
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('budget month starts on day 1')
  })

  it('categories only: lists the count and names', () => {
    const lines = buildOnboardingConfirmSummary({
      categories: [
        { name: 'Groceries', icon: '🛒', defaultBudgetCents: 30000 },
        { name: 'Rent', icon: '🏠', defaultBudgetCents: 100000 },
      ],
      addDebit: false,
      debitName: '',
      addCredit: false,
      creditName: '',
      money: baseMoney,
      format: EU_MONEY_FORMAT,
    })
    expect(lines[0]).toBe('2 new categories: Groceries, Rent')
  })

  it('a single category uses the singular noun', () => {
    const lines = buildOnboardingConfirmSummary({
      categories: [{ name: 'Groceries', icon: '🛒', defaultBudgetCents: 30000 }],
      addDebit: false,
      debitName: '',
      addCredit: false,
      creditName: '',
      money: baseMoney,
      format: EU_MONEY_FORMAT,
    })
    expect(lines[0]).toBe('1 new category: Groceries')
  })

  it('accounts only: lists debit and credit account names when both are opted in', () => {
    const lines = buildOnboardingConfirmSummary({
      categories: [],
      addDebit: true,
      debitName: 'Main debit',
      addCredit: true,
      creditName: 'Credit card',
      money: baseMoney,
      format: EU_MONEY_FORMAT,
    })
    expect(lines[0]).toBe('2 new accounts: Main debit, Credit card')
  })

  it('does not count the debit account when addDebit is false, even with a name typed', () => {
    const lines = buildOnboardingConfirmSummary({
      categories: [],
      addDebit: false,
      debitName: 'Main debit',
      addCredit: false,
      creditName: '',
      money: baseMoney,
      format: EU_MONEY_FORMAT,
    })
    expect(lines).toHaveLength(1) // only the currency/rollover line
  })

  it('does not count the credit account when addCredit is false, even with a name typed', () => {
    const lines = buildOnboardingConfirmSummary({
      categories: [],
      addDebit: false,
      debitName: '',
      addCredit: false,
      creditName: 'Credit card',
      money: baseMoney,
      format: EU_MONEY_FORMAT,
    })
    expect(lines).toHaveLength(1) // only the currency/rollover line
  })

  it('credit-only re-entry: lists just the credit account with the singular noun', () => {
    const lines = buildOnboardingConfirmSummary({
      categories: [],
      addDebit: false,
      debitName: 'Main debit',
      addCredit: true,
      creditName: 'Credit card',
      money: baseMoney,
      format: EU_MONEY_FORMAT,
    })
    expect(lines[0]).toBe('1 new account: Credit card')
  })

  it('mixed: categories, accounts, and settings all appear as separate lines', () => {
    const lines = buildOnboardingConfirmSummary({
      categories: [{ name: 'Groceries', icon: '🛒', defaultBudgetCents: 30000 }],
      addDebit: true,
      debitName: 'Main debit',
      addCredit: false,
      creditName: '',
      money: { currencyCode: 'USD', numberLocale: 'en-US', budgetRolloverDay: 13 },
      format: resolveMoneyFormat('USD', 'en-US'),
    })
    expect(lines).toHaveLength(3)
    expect(lines[0]).toBe('1 new category: Groceries')
    expect(lines[1]).toBe('1 new account: Main debit')
    expect(lines[2]).toContain('budget month starts on day 13')
  })
})
