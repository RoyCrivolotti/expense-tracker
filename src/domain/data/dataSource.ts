/**
 * Data source abstraction. The UI talks to this interface, not to a specific
 * backend, so Phase 1 (bundled CSV, read-only) and Phase 2 (live D1 API) are
 * swappable without touching the views.
 */
import type {
  Account,
  AccountStatement,
  CashActual,
  Category,
  ExpenseDataset,
  ExpenseSettings,
  Flag,
  Label,
  TransactionAttachment,
  GoalScenario,
  InstallmentPlan,
  StoredTransaction,
  Transaction,
  WealthAccount,
  WealthCheckin,
  WealthCheckinEntry,
} from '../types'
import type {
  CubePart,
  MonthRange,
  MonthRowsPart,
  ReferencePart,
  SeriesPart,
  TransactionPagePart,
  TransactionSummaryPart,
} from './ledgerParts'
import type { TxnFilter } from '../engine/transactions'

export type NewTransaction = Omit<
  StoredTransaction,
  // reportCount/reportCoveredCents are stamped by the settle, never submitted.
  'id' | 'createdAt' | 'planId' | 'flagId' | 'settledBy' | 'reportCount' | 'reportCoveredCents'
> & {
  /** Plan link: a plan id links/moves the row, null unlinks it, absent leaves it unchanged. */
  planId?: number | null
  /** Flag link: an id flags the row, null clears it, absent leaves it unchanged. */
  flagId?: number | null
}
export type BulkTransactionPatch = Partial<
  Pick<
    NewTransaction,
    'categoryId' | 'accountId' | 'type' | 'date' | 'budgetMonth' | 'flagId' | 'description'
  >
> & {
  /** Reimbursement link: an id settles the rows, null un-settles them. */
  settledBy?: number | null
}

export type NewCategory = Omit<Category, 'id'>
export type NewAccount = Omit<Account, 'id'>
// autoLabelId is optional-and-nullable here, unlike on Flag itself (optional only):
// a patch needs to express "clear it" with an explicit null, the same way
// flagId does on NewTransaction below.
export type NewFlag = Omit<Flag, 'id' | 'autoLabelId'> & { autoLabelId?: number | null }
export type NewLabel = Omit<Label, 'id'>

/** The storage-facing half of an attachment, kept off the domain type. */
export interface AttachmentSource {
  objectKey: string
  thumbKey?: string
  contentType: string
  originalName?: string
}

/** Everything the server records about an upload once the bytes are stored. */
export interface NewAttachment {
  transactionId: number
  objectKey: string
  thumbKey?: string
  contentType: string
  byteSize: number
  width?: number
  height?: number
  originalName?: string
}

/**
 * Exactly one of `reassignToId` / `createCategory` should be set when the
 * category being deleted is in use; omit both to delete an unused category.
 */
export interface DeleteCategoryOptions {
  reassignToId?: number
  createCategory?: NewCategory
}
export interface DeleteCategoryResult {
  /** The id transactions/plans were moved to, or null when nothing needed reassigning. */
  reassignedToId: number | null
  /** Present when `createCategory` was used to make the reassign target. */
  createdCategory?: Category
}

/** Same contract as {@link DeleteCategoryOptions}, for accounts. */
export interface DeleteAccountOptions {
  reassignToId?: number
  createAccount?: NewAccount
}
export interface DeleteAccountResult {
  reassignedToId: number | null
  createdAccount?: Account
}
/** Activation is its own call (`activateScenario`), so the flag is not part of a write. */
export type NewGoalScenario = Omit<GoalScenario, 'id' | 'isActive'>
/** What the PATCH route accepts: field edits, or `{ isActive: true }` on its own. */
export type ScenarioPatch = Partial<NewGoalScenario> & { isActive?: boolean }
export type NewWealthAccount = Omit<WealthAccount, 'id'>
export type NewWealthCheckin = {
  checkinDate: string
  note?: string
  entries: WealthCheckinEntry[]
}
export type NewInstallmentPlan = Omit<InstallmentPlan, 'id' | 'dueDayOfMonth'> & {
  /** A day (1-31) sets the due day, null clears it, absent leaves it unchanged. */
  dueDayOfMonth?: number | null
}

/**
 * The ledger read in parts instead of as one dataset (docs/API.md). Each part
 * carries the revision it was read under; two parts with different revisions were read from different
 * states of the ledger. `loadLedger` puts them together.
 */
export interface LedgerPartsSource {
  readReferencePart(): Promise<ReferencePart>
  /** Every real row whose budget month is in the range, inclusive. */
  readMonthsPart(range: MonthRange): Promise<MonthRowsPart>
  /** The per-month sums of the unpinned rows in the range, inclusive. */
  readCubePart(range: MonthRange): Promise<CubePart>
  /**
   * The receipts of one transaction, oldest first, or of every transaction when none is named. The parts
   * only say which transactions have any.
   */
  readReceiptsPart(transactionId?: number): Promise<TransactionAttachment[]>
  /**
   * One keyset page of the rows `filter` matches, newest first. `cursor` is the previous page's `nextCursor`,
   * handed back as it came: the server ties it to the filter and refuses a changed one.
   */
  readTransactionPage(
    filter: TxnFilter,
    request?: { limit?: number; cursor?: string; signal?: AbortSignal },
  ): Promise<TransactionPagePart>
  /** How many rows `filter` matches (counted to a cap) and what they net to. `signal` cancels the read. */
  readTransactionSummary(filter: TxnFilter, request?: { signal?: AbortSignal }): Promise<TransactionSummaryPart>
  /**
   * The recurring series of the whole history, which a client that holds only some of the rows needs to
   * tell what is fixed and what is due (a series needs every row it is made of). The server works it out
   * from every row, so a read that changed nothing is answered cheaply and one that did is not: read it
   * when a screen needs it, not after every write.
   */
  readSeriesPart(): Promise<SeriesPart>
}

export interface ExpenseDataSource extends Partial<LedgerPartsSource> {
  /** Whether mutations are supported; the UI hides add/edit when false. */
  readonly canWrite: boolean
  load(): Promise<ExpenseDataset>
  createTransaction?(input: NewTransaction): Promise<Transaction>
  createTransactions?(inputs: NewTransaction[]): Promise<Transaction[]>
  updateTransaction?(id: number, patch: Partial<NewTransaction>): Promise<Transaction>
  deleteTransaction?(id: number): Promise<void>
  deleteTransactions?(ids: number[]): Promise<{ deleted: number; requested: number }>
  updateTransactions?(
    ids: number[],
    patch: BulkTransactionPatch,
  ): Promise<{ updated: number; transactions: Transaction[] }>
  setStatementPaid?(accountId: number, yearMonth: string, paid: boolean, paidOn?: string): Promise<AccountStatement>
  /** Record actual cash for a month, or pass null to clear (empty Actual field). */
  setCashActual?(yearMonth: string, actualCashCents: number | null): Promise<CashActual | null>
  // Definitions — categories, accounts, opening balances.
  createCategory?(input: NewCategory): Promise<Category>
  updateCategory?(id: number, patch: Partial<NewCategory>): Promise<Category>
  deleteCategory?(id: number, options?: DeleteCategoryOptions): Promise<DeleteCategoryResult>
  createAccount?(input: NewAccount): Promise<Account>
  updateAccount?(id: number, patch: Partial<NewAccount>): Promise<Account>
  deleteAccount?(id: number, options?: DeleteAccountOptions): Promise<DeleteAccountResult>
  /** Multipart upload; resolves with the stored metadata. */
  uploadAttachment?(transactionId: number, file: File): Promise<TransactionAttachment>
  deleteAttachment?(id: number): Promise<void>
  createFlag?(input: NewFlag): Promise<Flag>
  updateFlag?(id: number, patch: Partial<NewFlag>): Promise<Flag>
  /** Deleting a flag clears it from its transactions; the result says how many. */
  deleteFlag?(id: number): Promise<{ unflagged: number }>
  createLabel?(input: NewLabel): Promise<Label>
  updateLabel?(id: number, patch: Partial<NewLabel>): Promise<Label>
  /** Deleting a label unlinks it from its transactions; the result says how many. */
  deleteLabel?(id: number): Promise<{ unlabeled: number }>
  /** Replaces a transaction's whole label set. */
  setTransactionLabels?(transactionId: number, labelIds: number[]): Promise<Transaction>
  updateSettings?(patch: Partial<ExpenseSettings>): Promise<ExpenseSettings>
  createScenario?(input: NewGoalScenario): Promise<GoalScenario>
  updateScenario?(id: number, patch: Partial<NewGoalScenario>): Promise<GoalScenario>
  /** Make this scenario the owner's plan; the previous plan stops being one. */
  activateScenario?(id: number): Promise<GoalScenario>
  deleteScenario?(id: number): Promise<void>
  createInstallmentPlan?(input: NewInstallmentPlan): Promise<InstallmentPlan>
  updateInstallmentPlan?(id: number, patch: Partial<NewInstallmentPlan>): Promise<InstallmentPlan>
  deleteInstallmentPlan?(id: number): Promise<void>
  createWealthAccount?(input: NewWealthAccount): Promise<WealthAccount>
  updateWealthAccount?(id: number, patch: Partial<NewWealthAccount>): Promise<WealthAccount>
  deleteWealthAccount?(id: number): Promise<void>
  createWealthCheckin?(input: NewWealthCheckin): Promise<WealthCheckin>
  updateWealthCheckin?(id: number, patch: Partial<NewWealthCheckin>): Promise<WealthCheckin>
  deleteWealthCheckin?(id: number): Promise<void>
}

/**
 * Whether a source can serve the ledger in parts. A source serves all of the reads or none: `apiDataSource` and
 * `inMemoryLedgerParts` are built whole, so the first read and the newest stand for every one of them.
 */
export function hasLedgerParts(source: ExpenseDataSource): source is ExpenseDataSource & LedgerPartsSource {
  return source.readReferencePart !== undefined && source.readTransactionPage !== undefined
}
