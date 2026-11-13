import type {
  ExpenseSettings,
  Flag,
  GoalScenario,
  InstallmentPlan,
  Label,
  Transaction,
  TxnType,
  WealthAccount,
  WealthCheckin,
} from '../types'
import type {
  BulkTransactionPatch,
  DeleteAccountOptions,
  DeleteAccountResult,
  DeleteCategoryOptions,
  DeleteCategoryResult,
  MatchingTarget,
  NewAccount,
  NewCategory,
  NewFlag,
  NewGoalScenario,
  NewInstallmentPlan,
  NewLabel,
  NewTransaction,
  NewWealthAccount,
  NewWealthCheckin,
} from '../data/dataSource'

export type { InstallmentIntent } from './components/installmentIntent'

/** Pre-filled fields for the add modal (partial overlay on defaults). */
export interface TransactionSeed {
  description?: string
  type?: TxnType
  accountId?: number
  categoryId?: number
  amountCents?: number
  date?: string
  budgetMonth?: string
  /** When set, the created transaction settles this installment plan. */
  planId?: number
  /** Installment number this payment represents (for the modal hint only). */
  installmentIndex?: number
  /** When set, saving creates the transaction through this captured-payment recommendation and settles it. */
  recommendationId?: string
  /** Set while a person works through captured payments one after another. */
  queue?: SeedQueue
  /** A note shown under the date for a payment whose date could be read two ways. */
  notice?: SeedNotice
  /** Set for a payment from a card that is not linked to an account, so the form asks which account it is. */
  card?: SeedCard
}

/** A card the form asks about. `answer` is filled in by the form as the person answers. */
export interface SeedCard {
  source: 'iberia' | 'santander'
  digits: string
  answer: { accountId: number | null; remember: boolean }
  /** What the form says when the payment is saved before the card is answered. */
  unanswered: string
  /** Set by the question while it is on screen: shows its message and moves the cursor to it. */
  ask?: () => void
  /** Links the card to the account the payment was saved with. Never throws: resolves with the message to tell if it failed, or null. */
  remember: (accountId: number) => Promise<string | null>
}

/** The two readings of a payment's date, one of which the form starts on. The button moves between them. */
export interface SeedNotice {
  text: string
  original: { date: string; label: string }
  alternate: { date: string; label: string }
}

/** The payments still to review after the one in the form. Each call acts for the form's payment and hands back the next. */
export interface SeedQueue {
  /** How many are left after this one. */
  left: number
  /** The form for the next one, or undefined at the end. Called once this one is saved. */
  next: () => TransactionSeed | undefined
  /** "Don't add" for this one. Hands back the form for the next one, or undefined at the end. */
  dontAdd: () => TransactionSeed | undefined
}

/**
 * Mutation handlers passed down to tabs only when the active data source can
 * write (the live D1 API). Read-only (CSV) sessions pass `undefined`, so the UI
 * hides add/edit/import affordances. Config savers re-load the dataset so derived
 * status / budgets refresh everywhere.
 */
export interface ExpenseActions {
  onEdit: (txn: Transaction) => void
  onAdd: (seed?: TransactionSeed) => void
  onDuplicate: (txn: Transaction) => void
  /** Resolves with the stored row, so a caller can attach receipts to its id. */
  createTransaction: (input: NewTransaction) => Promise<Transaction>
  createTransactions: (inputs: NewTransaction[]) => Promise<void>
  /** Creates the transaction a captured payment became and marks that recommendation submitted, in one write. */
  submitRecommendation?: (id: string, input: NewTransaction) => Promise<Transaction>
  updateTransaction: (id: number, patch: Partial<NewTransaction>) => Promise<void>
  deleteTransaction: (id: number) => Promise<void>
  /** Resolves with the number of rows the server actually touched, which can be
   *  fewer than requested if some vanished elsewhere first. */
  deleteTransactions: (ids: number[]) => Promise<number>
  updateTransactions: (ids: number[], patch: BulkTransactionPatch) => Promise<number>
  /** Adds labels to these transactions and keeps the ones they have. Resolves with how many it reached. */
  addLabels?: (ids: number[], labelIds: number[]) => Promise<number>
  /**
   * Adds labels to, and edits, every transaction `target` names (the filter, with the count and revision the user was
   * shown). Resolves with how many it changed; rejects with a 409 `ApiError` if the ledger moved since.
   */
  updateMatching?: (target: MatchingTarget, patch: BulkTransactionPatch, labelIds?: number[]) => Promise<number>
  setStatementPaid: (
    accountId: number,
    yearMonth: string,
    paid: boolean,
    paidOn?: string,
  ) => Promise<void>
  setCashActual: (yearMonth: string, actualCashCents: number | null) => Promise<void>
  uploadAttachment: (transactionId: number, file: File) => Promise<void>
  deleteAttachment: (id: number) => Promise<void>
  createFlag: (input: NewFlag) => Promise<Flag>
  updateFlag: (id: number, patch: Partial<NewFlag>) => Promise<void>
  /** Resolves with how many transactions were unflagged, for the toast. */
  deleteFlag: (id: number) => Promise<{ unflagged: number }>
  createLabel: (input: NewLabel) => Promise<Label>
  updateLabel: (id: number, patch: Partial<NewLabel>) => Promise<void>
  /** Resolves with how many transactions were unlabeled, for the toast. */
  deleteLabel: (id: number) => Promise<{ unlabeled: number }>
  /** Replaces a transaction's whole label set. */
  setTransactionLabels: (transactionId: number, labelIds: number[]) => Promise<void>
  createCategory: (input: NewCategory) => Promise<void>
  updateCategory: (id: number, patch: Partial<NewCategory>) => Promise<void>
  deleteCategory: (id: number, options?: DeleteCategoryOptions) => Promise<DeleteCategoryResult>
  createAccount: (input: NewAccount) => Promise<void>
  updateAccount: (id: number, patch: Partial<NewAccount>) => Promise<void>
  deleteAccount: (id: number, options?: DeleteAccountOptions) => Promise<DeleteAccountResult>
  updateSettings: (patch: Partial<ExpenseSettings>) => Promise<void>
  createScenario: (input: NewGoalScenario) => Promise<GoalScenario>
  updateScenario: (id: number, patch: Partial<NewGoalScenario>) => Promise<void>
  /** Make this scenario the plan; whichever was the plan before stops being one. */
  activateScenario: (id: number) => Promise<void>
  deleteScenario: (id: number) => Promise<void>
  createInstallmentPlan: (input: NewInstallmentPlan) => Promise<InstallmentPlan>
  updateInstallmentPlan: (id: number, patch: Partial<NewInstallmentPlan>) => Promise<void>
  deleteInstallmentPlan: (id: number) => Promise<void>
  createWealthAccount: (input: NewWealthAccount) => Promise<WealthAccount>
  updateWealthAccount: (id: number, patch: Partial<NewWealthAccount>) => Promise<void>
  deleteWealthAccount: (id: number) => Promise<void>
  createWealthCheckin: (input: NewWealthCheckin) => Promise<WealthCheckin>
  updateWealthCheckin: (id: number, patch: Partial<NewWealthCheckin>) => Promise<void>
  deleteWealthCheckin: (id: number) => Promise<void>
}

export type ExpenseModalState =
  | { mode: 'add'; seed?: TransactionSeed; hint?: string }
  | { mode: 'edit'; txn: Transaction }
  | null
