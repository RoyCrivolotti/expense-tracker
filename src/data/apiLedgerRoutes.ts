/**
 * The routes for transactions, statement payments, cash counts and receipts, one of the areas `apiDataSource` is
 * assembled from.
 */
import type { AccountStatement, CashActual, Transaction, TransactionAttachment } from '../types'
import type { BulkTransactionPatch, NewTransaction } from './dataSource'
import { RECEIPT_CLIENT_POLICY } from './receiptClientPolicy'
import { downscaleImage, renderThumbnail } from './imageDownscale'
import { req, reqMultipart } from './apiClient'
import { BASE, type Routes } from './apiRoutes'

/** Transactions, statement payments and cash counts. */
export const transactionRoutes: Routes<
  | 'createTransaction'
  | 'createTransactions'
  | 'updateTransaction'
  | 'deleteTransaction'
  | 'deleteTransactions'
  | 'updateTransactions'
  | 'setStatementPaid'
  | 'setCashActual'
> = {
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
  updateTransaction: (
    id: number,
    patch: Partial<NewTransaction>,
  ) =>
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
  updateTransactions: (
    ids: number[],
    patch: BulkTransactionPatch,
  ) =>
    req<{ updated: number; transactions: Transaction[] }>(`${BASE}/transactions/bulk`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids, patch }),
    }),
  setStatementPaid: (
    accountId: number,
    yearMonth: string,
    paid: boolean,
    paidOn?: string,
  ) =>
    req<AccountStatement>(`${BASE}/statements`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accountId, yearMonth, paid, ...(paidOn ? { paidOn } : {}) }),
    }),
  setCashActual: (
    yearMonth: string,
    actualCashCents: number | null,
  ) =>
    req<CashActual | null>(`${BASE}/cash-actuals`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ yearMonth, actualCashCents }),
    }),
}

/** Receipts. */
export const attachmentRoutes: Routes<'uploadAttachment' | 'deleteAttachment'> = {
  uploadAttachment: async (
    transactionId: number,
    file: File,
  ) => {
    const form = new FormData()
    form.set('transactionId', String(transactionId))
    const shrunk = await downscaleImage(file, {
      maxEdge: RECEIPT_CLIENT_POLICY.maxEdge,
      maxBytes: RECEIPT_CLIENT_POLICY.maxBytes,
      skipUnderBytes: RECEIPT_CLIENT_POLICY.skipUnderBytes,
    })
    form.set('file', shrunk?.blob ?? file, file.name)
    if (shrunk) {
      form.set('width', String(shrunk.width))
      form.set('height', String(shrunk.height))
    }
    const thumb = await renderThumbnail(shrunk?.blob ?? file, RECEIPT_CLIENT_POLICY.thumbEdge)
    if (thumb) form.set('thumb', thumb, 'thumb.jpg')
    return reqMultipart<TransactionAttachment>(`${BASE}/attachments`, form)
  },
  deleteAttachment: (id: number) =>
    req<{ deleted: number }>(`${BASE}/attachments/${id}`, { method: 'DELETE' }).then(() => undefined),
}
