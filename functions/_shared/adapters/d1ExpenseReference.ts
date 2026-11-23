import type { ExpenseRepository } from '../../domain/ports/expenseRepository'
import type { Env } from '../env'
import { createFlag, deleteFlag, updateFlag } from '../dbFlags'
import { createLabel, deleteLabel, setTransactionLabels, updateLabel } from '../dbLabels'
import { createCategory, deleteCategory, updateCategory } from '../dbCategories'
import { createAccount, deleteAccount, updateAccount } from '../dbAccounts'
import { updateSettings } from '../dbSettings'

type FlagsAndLabels = Pick<
  ExpenseRepository,
  'createFlag' | 'updateFlag' | 'deleteFlag' | 'createLabel' | 'updateLabel' | 'deleteLabel' | 'setTransactionLabels'
>

/** Flags and labels, and the labels on a transaction. */
export function flagsAndLabels(env: Env): FlagsAndLabels {
  return {
    createFlag: (
      owner,
      input,
    ) => createFlag(env, owner, input),
    updateFlag: (
      owner,
      id,
      patch,
    ) => updateFlag(env, owner, id, patch),
    deleteFlag: (
      owner,
      id,
    ) => deleteFlag(env, owner, id),
    createLabel: (
      owner,
      input,
    ) => createLabel(env, owner, input),
    updateLabel: (
      owner,
      id,
      patch,
    ) => updateLabel(env, owner, id, patch),
    deleteLabel: (
      owner,
      id,
    ) => deleteLabel(env, owner, id),
    setTransactionLabels: (
      owner,
      transactionId,
      labelIds,
    ) => setTransactionLabels(env, owner, transactionId, labelIds),
  }
}

type Reference = Pick<
  ExpenseRepository,
  | 'createCategory'
  | 'updateCategory'
  | 'deleteCategory'
  | 'createAccount'
  | 'updateAccount'
  | 'deleteAccount'
  | 'updateSettings'
>

/** Categories, accounts and settings. */
export function reference(env: Env): Reference {
  return {
    createCategory: (
      owner,
      input,
    ) => createCategory(env, owner, input),
    updateCategory: (
      owner,
      id,
      patch,
    ) => updateCategory(env, owner, id, patch),
    deleteCategory: (
      owner,
      id,
      options,
    ) => deleteCategory(env, owner, id, options),
    createAccount: (
      owner,
      input,
    ) => createAccount(env, owner, input),
    updateAccount: (
      owner,
      id,
      patch,
    ) => updateAccount(env, owner, id, patch),
    deleteAccount: (
      owner,
      id,
      options,
    ) => deleteAccount(env, owner, id, options),
    updateSettings: (
      owner,
      patch,
    ) => updateSettings(env, owner, patch),
  }
}
