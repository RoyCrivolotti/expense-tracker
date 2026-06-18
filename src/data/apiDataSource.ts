/**
 * Phase 2 data source: the live D1-backed API exposed by the Pages Functions
 * under /api/expenses (protected by Cloudflare Access). Used in production;
 * local `vite dev` uses the read-only CSV source instead.
 */
import type {
  Account,
  AccountStatement,
  CashActual,
  Category,
  ExpenseDataset,
  ExpenseSettings,
  GoalInputs,
  Transaction,
} from '../types'
import type { ExpenseDataSource, NewAccount, NewCategory, NewTransaction } from './dataSource'

const BASE = '/api/expenses'

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'content-type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    let message = `Request failed (${res.status})`
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) message = body.error
    } catch {
      /* ignore non-JSON error bodies */
    }
    throw new Error(message)
  }
  return res.json() as Promise<T>
}

export const apiDataSource: ExpenseDataSource = {
  canWrite: true,
  load: () => req<ExpenseDataset>(BASE),
  createTransaction: (input: NewTransaction) =>
    req<Transaction>(`${BASE}/transactions`, { method: 'POST', body: JSON.stringify(input) }),
  updateTransaction: (id: number, patch: Partial<NewTransaction>) =>
    req<Transaction>(`${BASE}/transactions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteTransaction: async (id: number) => {
    await req(`${BASE}/transactions/${id}`, { method: 'DELETE' })
  },
  deleteTransactions: (ids: number[]) =>
    req<{ deleted: number; requested: number }>(`${BASE}/transactions/bulk`, {
      method: 'DELETE',
      body: JSON.stringify({ ids }),
    }),
  setStatementPaid: (accountId: number, yearMonth: string, paid: boolean) =>
    req<AccountStatement>(`${BASE}/statements`, {
      method: 'PUT',
      body: JSON.stringify({ accountId, yearMonth, paid }),
    }),
  setCashActual: (yearMonth: string, actualCashCents: number | null) =>
    req<CashActual | null>(`${BASE}/cash-actuals`, {
      method: 'PUT',
      body: JSON.stringify({ yearMonth, actualCashCents }),
    }),
  createCategory: (input: NewCategory) =>
    req<Category>(`${BASE}/categories`, { method: 'POST', body: JSON.stringify(input) }),
  updateCategory: (id: number, patch: Partial<NewCategory>) =>
    req<Category>(`${BASE}/categories/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  createAccount: (input: NewAccount) =>
    req<Account>(`${BASE}/accounts`, { method: 'POST', body: JSON.stringify(input) }),
  updateAccount: (id: number, patch: Partial<NewAccount>) =>
    req<Account>(`${BASE}/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  updateSettings: (patch: Partial<ExpenseSettings>) =>
    req<ExpenseSettings>(`${BASE}/settings`, { method: 'PUT', body: JSON.stringify(patch) }),
  updateGoals: (patch: Partial<GoalInputs>) =>
    req<GoalInputs>(`${BASE}/goals`, { method: 'PUT', body: JSON.stringify(patch) }),
}
