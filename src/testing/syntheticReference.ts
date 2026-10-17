/**
 * The small, bounded half of a synthetic ledger: everything except the transactions. Placeholder names
 * only; the repo is public, so nothing here resembles a real person's data.
 */
import type {
  Account,
  AccountStatement,
  CashActual,
  Category,
  ExpenseSettings,
  Flag,
  InstallmentPlan,
  Label,
  WealthAccount,
  WealthCheckin,
} from '../domain/types'
import { defaultExpenseSettings } from '../domain/engine/defaults'
import { shiftBudgetMonth } from '../domain/engine/dates'

export const CHECKING = 1
export const CASH = 2
export const VISA = 3
export const TRAVEL_CARD = 4

export const CAT = {
  groceries: 1,
  rent: 2,
  utilities: 3,
  transport: 4,
  dining: 5,
  subscriptions: 6,
  health: 7,
  insurance: 8,
  travel: 9,
  shopping: 10,
  entertainment: 11,
  salary: 12,
  investments: 13,
  gifts: 14,
  education: 15,
  other: 16,
} as const

const CATEGORY_NAMES = Object.keys(CAT)

export function syntheticAccounts(): Account[] {
  return [
    { id: CHECKING, name: 'Checking', kind: 'debit', settlement: 'immediate', active: true },
    { id: CASH, name: 'Cash', kind: 'debit', settlement: 'immediate', active: true },
    { id: VISA, name: 'Visa', kind: 'credit', settlement: 'deferred', active: true },
    { id: TRAVEL_CARD, name: 'Travel card', kind: 'credit', settlement: 'deferred', active: true },
  ]
}

export function syntheticCategories(): Category[] {
  return CATEGORY_NAMES.map((name, i) => ({
    id: i + 1,
    name: name.charAt(0).toUpperCase() + name.slice(1),
    monthlyBudgetCents: i < 11 ? 20_000 + i * 5_000 : 0,
    sortOrder: i,
    active: true,
  }))
}

export function syntheticFlags(): Flag[] {
  const base = { sortOrder: 0, active: true }
  return [
    { id: 1, name: 'Work travel', color: '#6366f1', reimbursable: true, ...base },
    { id: 2, name: 'Tax deductible', color: '#f59e0b', reimbursable: false, ...base, sortOrder: 1 },
  ]
}

export function syntheticLabels(): Label[] {
  return ['Trip', 'Gift', 'Home'].map((name, i) => ({
    id: i + 1,
    name,
    color: '#10b981',
    sortOrder: i,
    active: true,
  }))
}

export function syntheticSettings(): ExpenseSettings {
  return {
    ...defaultExpenseSettings(),
    openingCashCents: 500_000,
    openingInvestmentCents: 1_500_000,
    defaultAccountId: CHECKING,
    investmentCategoryId: CAT.investments,
  }
}

export function syntheticPlans(endMonth: string): InstallmentPlan[] {
  const base = { accountId: VISA, categoryId: CAT.shopping, type: 'expense' as const }
  return [
    {
      ...base,
      id: 1,
      description: 'Laptop',
      totalCount: 24,
      amountCents: 7_500,
      anchorBudgetMonth: shiftBudgetMonth(endMonth, -14),
      startInstallmentIndex: 1,
      dueDayOfMonth: 12,
      active: true,
    },
  ]
}

/** Deferred accounts are paid up to the month before `endMonth`, so the newest charges stay forecast. */
export function syntheticStatements(months: string[], endMonth: string): AccountStatement[] {
  const out: AccountStatement[] = []
  for (const accountId of [VISA, TRAVEL_CARD]) {
    for (const yearMonth of months) {
      const paid = yearMonth < endMonth
      out.push({ accountId, yearMonth, paid, ...(paid ? { paidOn: `${yearMonth}-28` } : {}) })
    }
  }
  return out
}

export function syntheticCashActuals(months: string[]): CashActual[] {
  return months
    .filter((m) => m.endsWith('-03') || m.endsWith('-09'))
    .map((yearMonth) => ({ yearMonth, actualCashCents: 480_000 }))
}

export function syntheticWealth(months: string[]): {
  wealthAccounts: WealthAccount[]
  wealthCheckins: WealthCheckin[]
} {
  const wealthAccounts: WealthAccount[] = [
    { id: 1, name: 'Broker', kind: 'investment', sortOrder: 0, archived: false },
  ]
  const wealthCheckins = months
    .filter((m) => m.endsWith('-01'))
    .map((m, i) => ({
      id: i + 1,
      checkinDate: `${m}-01`,
      entries: [{ accountId: 1, valueCents: 1_500_000 + i * 400_000 }],
      createdAt: `${m}-01T09:00:00.000Z`,
    }))
  return { wealthAccounts, wealthCheckins }
}
