/**
 * The routes for flags, labels, categories, accounts and settings, areas `apiDataSource` is assembled from.
 */
import type { Account, Category, ExpenseSettings, Flag, Label, Transaction } from '../types'
import type {
  DeleteAccountOptions,
  DeleteAccountResult,
  DeleteCategoryOptions,
  DeleteCategoryResult,
  NewAccount,
  NewCategory,
  NewFlag,
  NewLabel,
} from './dataSource'
import { req } from './apiClient'
import { BASE, type Routes } from './apiRoutes'

/** Flags, labels and the labels on a transaction. */
export const flagsAndLabelsRoutes: Routes<
  'createFlag' | 'updateFlag' | 'deleteFlag' | 'createLabel' | 'updateLabel' | 'deleteLabel' | 'setTransactionLabels'
> = {
  createFlag: (input: NewFlag) =>
    req<Flag>(`${BASE}/flags`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }),
  updateFlag: (
    id: number,
    patch: Partial<NewFlag>,
  ) =>
    req<Flag>(`${BASE}/flags/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  deleteFlag: (id: number) => req<{ unflagged: number }>(`${BASE}/flags/${id}`, { method: 'DELETE' }),
  createLabel: (input: NewLabel) =>
    req<Label>(`${BASE}/labels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }),
  updateLabel: (
    id: number,
    patch: Partial<NewLabel>,
  ) =>
    req<Label>(`${BASE}/labels/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  deleteLabel: (id: number) => req<{ unlabeled: number }>(`${BASE}/labels/${id}`, { method: 'DELETE' }),
  setTransactionLabels: (
    transactionId: number,
    labelIds: number[],
  ) =>
    req<Transaction>(`${BASE}/transactions/${transactionId}/labels`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ labelIds }),
    }),
}

/** Categories, accounts and settings. */
export const referenceRoutes: Routes<
  | 'createCategory'
  | 'updateCategory'
  | 'deleteCategory'
  | 'createAccount'
  | 'updateAccount'
  | 'deleteAccount'
  | 'updateSettings'
> = {
  createCategory: (input: NewCategory) =>
    req<Category>(`${BASE}/categories`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }),
  updateCategory: (
    id: number,
    patch: Partial<NewCategory>,
  ) =>
    req<Category>(`${BASE}/categories/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  deleteCategory: (
    id: number,
    options?: DeleteCategoryOptions,
  ) =>
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
  updateAccount: (
    id: number,
    patch: Partial<NewAccount>,
  ) =>
    req<Account>(`${BASE}/accounts/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  deleteAccount: (
    id: number,
    options?: DeleteAccountOptions,
  ) =>
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
}
