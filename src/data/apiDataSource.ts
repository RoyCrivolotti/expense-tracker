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
  Flag,
  GoalInputs,
  GoalScenario,
  InstallmentPlan,
  Transaction,
  TransactionAttachment,
  WealthAccount,
  WealthCheckin,
} from '../types'
import type {
  BulkTransactionPatch,
  DeleteAccountOptions,
  DeleteAccountResult,
  DeleteCategoryOptions,
  DeleteCategoryResult,
  ExpenseDataSource,
  NewAccount,
  NewCategory,
  NewFlag,
  NewGoalScenario,
  NewInstallmentPlan,
  NewTransaction,
  NewWealthAccount,
  NewWealthCheckin,
} from './dataSource'
import { downscaleImage, renderThumbnail } from './imageDownscale'
import { req, reqMultipart } from './apiClient'

const BASE = '/api/expenses'

/**
 * Mirrors config/receipt-policy.json. The server enforces the real limits; these
 * only decide how hard the browser tries before uploading, so a small drift
 * costs a rejected upload rather than a wrong one.
 */
const RECEIPT_IMAGE = {
  maxEdge: 1600,
  maxBytes: 5_242_880,
  skipUnderBytes: 300_000,
  thumbEdge: 320,
} as const

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
  updateTransactions: (ids: number[], patch: BulkTransactionPatch) =>
    req<{ updated: number; transactions: Transaction[] }>(`${BASE}/transactions/bulk`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids, patch }),
    }),
  setStatementPaid: (accountId: number, yearMonth: string, paid: boolean, paidOn?: string) =>
    req<AccountStatement>(`${BASE}/statements`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accountId, yearMonth, paid, ...(paidOn ? { paidOn } : {}) }),
    }),
  setCashActual: (yearMonth: string, actualCashCents: number | null) =>
    req<CashActual | null>(`${BASE}/cash-actuals`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ yearMonth, actualCashCents }),
    }),
  uploadAttachment: async (transactionId: number, file: File) => {
    const form = new FormData()
    form.set('transactionId', String(transactionId))
    const shrunk = await downscaleImage(file, {
      maxEdge: RECEIPT_IMAGE.maxEdge,
      maxBytes: RECEIPT_IMAGE.maxBytes,
      skipUnderBytes: RECEIPT_IMAGE.skipUnderBytes,
    })
    form.set('file', shrunk?.blob ?? file, file.name)
    if (shrunk) {
      form.set('width', String(shrunk.width))
      form.set('height', String(shrunk.height))
    }
    const thumb = await renderThumbnail(shrunk?.blob ?? file, RECEIPT_IMAGE.thumbEdge)
    if (thumb) form.set('thumb', thumb, 'thumb.jpg')
    return reqMultipart<TransactionAttachment>(`${BASE}/attachments`, form)
  },
  deleteAttachment: (id: number) =>
    req<{ deleted: number }>(`${BASE}/attachments/${id}`, { method: 'DELETE' }).then(() => undefined),
  createFlag: (input: NewFlag) =>
    req<Flag>(`${BASE}/flags`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }),
  updateFlag: (id: number, patch: Partial<NewFlag>) =>
    req<Flag>(`${BASE}/flags/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  deleteFlag: (id: number) =>
    req<{ unflagged: number }>(`${BASE}/flags/${id}`, { method: 'DELETE' }),
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
  deleteCategory: (id: number, options?: DeleteCategoryOptions) =>
    req<DeleteCategoryResult>(`${BASE}/categories/${id}`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(options ?? {}),
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
  deleteAccount: (id: number, options?: DeleteAccountOptions) =>
    req<DeleteAccountResult>(`${BASE}/accounts/${id}`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(options ?? {}),
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
  createInstallmentPlan: (input: NewInstallmentPlan) =>
    req<InstallmentPlan>(`${BASE}/installment-plans`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }),
  updateInstallmentPlan: (id: number, patch: Partial<NewInstallmentPlan>) =>
    req<InstallmentPlan>(`${BASE}/installment-plans/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  deleteInstallmentPlan: async (id: number) => {
    await req(`${BASE}/installment-plans/${id}`, { method: 'DELETE' })
  },
  createWealthAccount: (input: NewWealthAccount) =>
    req<WealthAccount>(`${BASE}/wealth-accounts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }),
  updateWealthAccount: (id: number, patch: Partial<NewWealthAccount>) =>
    req<WealthAccount>(`${BASE}/wealth-accounts/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  deleteWealthAccount: async (id: number) => {
    await req(`${BASE}/wealth-accounts/${id}`, { method: 'DELETE' })
  },
  createWealthCheckin: (input: NewWealthCheckin) =>
    req<WealthCheckin>(`${BASE}/wealth-checkins`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }),
  updateWealthCheckin: (id: number, patch: Partial<NewWealthCheckin>) =>
    req<WealthCheckin>(`${BASE}/wealth-checkins/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  deleteWealthCheckin: async (id: number) => {
    await req(`${BASE}/wealth-checkins/${id}`, { method: 'DELETE' })
  },
}
