/**
 * A small ledger for the API the stand-in server answers with: enough that a screen has something to show, and made
 * from today's date so that its rows are in the month the app opens on. The settings are the app's own defaults, read
 * from the source, so a field added to them cannot leave this behind.
 */
import { tsImport } from 'tsx/esm/api'

const { defaultExpenseSettings } = await tsImport('../../src/domain/engine/defaults.ts', import.meta.url)

export const OWNER = 'saved-copy@example.com'

/** The description of the newest row, which a screen showing the copy has on it. */
export const NEWEST_DESCRIPTION = 'Corner cafe, saved copy'

const pad = (n) => String(n).padStart(2, '0')

/** @param {Date} today */
export function demoDataset(today = new Date()) {
  const month = `${today.getFullYear()}-${pad(today.getMonth() + 1)}`
  const row = (id, day, description, amountCents) => ({
    id,
    date: `${month}-${pad(day)}`,
    budgetMonth: month,
    description,
    accountId: 1,
    categoryId: 1,
    type: 'expense',
    amountCents,
    cancelled: false,
    status: 'posted',
  })
  return {
    categories: [{ id: 1, name: 'Eating out', monthlyBudgetCents: 30_000, sortOrder: 0, active: true }],
    accounts: [{ id: 1, name: 'Checking', kind: 'debit', settlement: 'immediate', active: true }],
    flags: [],
    labels: [],
    attachments: [],
    transactions: [row(2, 2, NEWEST_DESCRIPTION, 450), row(1, 1, 'Groceries, saved copy', 3_800)],
    accountStatements: [],
    cashActuals: [],
    installmentPlans: [],
    goalScenarios: [],
    settings: defaultExpenseSettings(),
    wealthAccounts: [],
    wealthCheckins: [],
  }
}
