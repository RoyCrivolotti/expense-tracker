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
} from '../data/dataSource'

/** Flags and labels, and the labels on a transaction. */
export interface ExpenseFlagsAndLabels {
  createFlag(
    owner: string,
    input: NewFlag,
  ): Promise<Flag>
  updateFlag(
    owner: string,
    id: number,
    patch: Partial<NewFlag>,
  ): Promise<Flag>
  /** Deletes the flag and clears it from its transactions in one batch. */
  deleteFlag(
    owner: string,
    id: number,
  ): Promise<{ unflagged: number }>
  createLabel(
    owner: string,
    input: NewLabel,
  ): Promise<Label>
  updateLabel(
    owner: string,
    id: number,
    patch: Partial<NewLabel>,
  ): Promise<Label>
  /** Deletes the label and unlinks it from its transactions in one operation. */
  deleteLabel(
    owner: string,
    id: number,
  ): Promise<{ unlabeled: number }>
  /** Replaces a transaction's whole label set; ids are deduped and ownership-checked. */
  setTransactionLabels(
    owner: string,
    transactionId: number,
    labelIds: number[],
  ): Promise<Transaction>
}

/** Categories, accounts and settings. */
export interface ExpenseReference {
  createCategory(
    owner: string,
    input: NewCategory,
  ): Promise<Category>
  updateCategory(
    owner: string,
    id: number,
    patch: Partial<NewCategory>,
  ): Promise<Category>
  deleteCategory(
    owner: string,
    id: number,
    options?: DeleteCategoryOptions,
  ): Promise<DeleteCategoryResult>
  createAccount(
    owner: string,
    input: NewAccount,
  ): Promise<Account>
  updateAccount(
    owner: string,
    id: number,
    patch: Partial<NewAccount>,
  ): Promise<Account>
  deleteAccount(
    owner: string,
    id: number,
    options?: DeleteAccountOptions,
  ): Promise<DeleteAccountResult>
  updateSettings(
    owner: string,
    patch: Partial<ExpenseSettings>,
  ): Promise<ExpenseSettings>
}
