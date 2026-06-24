/**
 * Live D1-backed API client for /api/expenses (Cloudflare Access in production).
 * Local `vite dev` uses the read-only CSV source instead.
 */
import type {
  Account,
  AccountStatement,
  CashActual,
  Category,
  ExpenseDataset,
  ExpenseSettings,
  GoalInputs,
  GoalScenario,
  Transaction,
} from '../types'
import type { ExpenseDataSource, NewAccount, NewCategory, NewGoalScenario, NewTransaction } from './dataSource'
import { req } from './apiClient'

const BASE = '/api/expenses'

export const apiDataSource: ExpenseDataSource = {
  canWrite: true,
  load: () => req<ExpenseDataset>(BASE),
  createTransaction: (input: NewTransaction) =>
    req<Transaction>(`${BASE}/transactions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }),
  createTransactions: (inputs: NewTransaction[]) =>
    req<{ transactions: Transaction[] }>(`${BASE}/transactions/bulk`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ transactions: inputs }),
    }).then((r) => r.transactions),
  updateTransaction: (id: number, patch: Partial<NewTransaction>) =>
    req<Transaction>(`${BASE}/transactions/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  deleteTransaction: async (id: number) => {
    await req(`${BASE}/transactions/${id}`, { method: 'DELETE' })
  },
  deleteTransactions: (ids: number[]) =>
    req<{ deleted: number; requested: number }>(`${BASE}/transactions/bulk`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids }),
    }),
  setStatementPaid: (accountId: number, yearMonth: string, paid: boolean) =>
    req<AccountStatement>(`${BASE}/statements`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accountId, yearMonth, paid }),
    }),
  setCashActual: (yearMonth: string, actualCashCents: number | null) =>
    req<CashActual | null>(`${BASE}/cash-actuals`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ yearMonth, actualCashCents }),
    }),
  createCategory: (input: NewCategory) =>
    req<Category>(`${BASE}/categories`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }),
  updateCategory: (id: number, patch: Partial<NewCategory>) =>
    req<Category>(`${BASE}/categories/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  createAccount: (input: NewAccount) =>
    req<Account>(`${BASE}/accounts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }),
  updateAccount: (id: number, patch: Partial<NewAccount>) =>
    req<Account>(`${BASE}/accounts/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  updateSettings: (patch: Partial<ExpenseSettings>) =>
    req<ExpenseSettings>(`${BASE}/settings`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  updateGoals: (patch: Partial<GoalInputs>) =>
    req<GoalInputs>(`${BASE}/goals`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  createScenario: (input: NewGoalScenario) =>
    req<GoalScenario>(`${BASE}/scenarios`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }),
  updateScenario: (id: number, patch: Partial<NewGoalScenario>) =>
    req<GoalScenario>(`${BASE}/scenarios/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  deleteScenario: async (id: number) => {
    await req(`${BASE}/scenarios/${id}`, { method: 'DELETE' })
  },
}
